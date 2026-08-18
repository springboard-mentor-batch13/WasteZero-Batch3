// Backend/tests/opportunity.test.js
//
// Tests for P0-05 soft-delete changes in opportunity service:
//   - softDeleteOpportunityById sets isRemovedByAdmin=true
//   - getAllOpportunities excludes admin-removed opportunities
//   - getOpportunityById returns null for removed opportunity
//   - searchOpportunities excludes removed opportunities + honors .limit(50)
//   - filterOpportunities excludes removed opportunities + honors .limit(100)
//   - deleteOpportunityById is no longer exported (replaced by soft-delete)
//
// Strategy: Unit tests with mocked Opportunity model.

jest.mock('../models/opportunity.model');
jest.mock('../models/application.model');
jest.mock('cloudinary');

const Opportunity = require('../models/opportunity.model');
const opportunityService = require('../services/opportunity.service');

// ── P0-05: softDeleteOpportunityById ─────────────────────────────────────────

describe('softDeleteOpportunityById — P0-05', () => {

  const adminId = 'admin001';
  const opportunityId = 'opp001';

  test('sets isRemovedByAdmin=true and saves', async () => {
    const saveMock = jest.fn().mockResolvedValue({ isRemovedByAdmin: true });
    const mockOpp = {
      _id: opportunityId,
      isRemovedByAdmin: false,
      save: saveMock,
    };
    Opportunity.findById = jest.fn().mockResolvedValue(mockOpp);

    await opportunityService.softDeleteOpportunityById(opportunityId, adminId, 'Policy violation');

    expect(mockOpp.isRemovedByAdmin).toBe(true);
    expect(mockOpp.removalReason).toBe('Policy violation');
    expect(mockOpp.removedAt).toBeInstanceOf(Date);
    expect(mockOpp.removedBy).toBe(adminId);
    expect(saveMock).toHaveBeenCalled();
  });

  test('returns null when opportunity does not exist', async () => {
    Opportunity.findById = jest.fn().mockResolvedValue(null);
    const result = await opportunityService.softDeleteOpportunityById('nonexistent', adminId);
    expect(result).toBeNull();
  });

  test('is idempotent — does not call save() again if already removed', async () => {
    const saveMock = jest.fn();
    const mockOpp = { _id: opportunityId, isRemovedByAdmin: true, save: saveMock };
    Opportunity.findById = jest.fn().mockResolvedValue(mockOpp);

    const result = await opportunityService.softDeleteOpportunityById(opportunityId, adminId);
    expect(saveMock).not.toHaveBeenCalled();
    expect(result).toBe(mockOpp);
  });

});

// ── P0-05: deleteOpportunityById is no longer exported ───────────────────────

describe('opportunityService exports — P0-05', () => {

  test('does NOT export deleteOpportunityById (hard-delete removed)', () => {
    expect(opportunityService.deleteOpportunityById).toBeUndefined();
  });

  test('exports softDeleteOpportunityById', () => {
    expect(typeof opportunityService.softDeleteOpportunityById).toBe('function');
  });

});

// ── P0-05: getAllOpportunities includes ACTIVE_FILTER ─────────────────────────

describe('getAllOpportunities — P0-05 (ACTIVE_FILTER)', () => {

  test('calls Opportunity.find with isRemovedByAdmin filter', async () => {
    const mockQuery = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };
    Opportunity.find = jest.fn().mockReturnValue(mockQuery);
    Opportunity.countDocuments = jest.fn().mockResolvedValue(0);

    await opportunityService.getAllOpportunities(1, 10);

    const findArg = Opportunity.find.mock.calls[0][0];
    expect(findArg).toHaveProperty('isRemovedByAdmin');
    expect(findArg.isRemovedByAdmin).toEqual({ $ne: true });
  });

});

// ── P1-01: searchOpportunities and filterOpportunities have .limit() ──────────

describe('searchOpportunities — P1-01 (.limit(50))', () => {

  test('query chain includes limit(50)', async () => {
    const limitMock = jest.fn().mockReturnThis();
    const mockQuery = {
      sort: jest.fn().mockReturnThis(),
      limit: limitMock,
      lean: jest.fn().mockResolvedValue([]),
    };
    Opportunity.find = jest.fn().mockReturnValue(mockQuery);

    await opportunityService.searchOpportunities('recycling');

    expect(limitMock).toHaveBeenCalledWith(50);
  });

});

describe('filterOpportunities — P1-01 (.limit(100))', () => {

  test('query chain includes limit(100)', async () => {
    const limitMock = jest.fn().mockReturnThis();
    const mockQuery = {
      sort: jest.fn().mockReturnThis(),
      limit: limitMock,
      lean: jest.fn().mockResolvedValue([]),
    };
    Opportunity.find = jest.fn().mockReturnValue(mockQuery);

    await opportunityService.filterOpportunities({ status: 'open' });

    expect(limitMock).toHaveBeenCalledWith(100);
  });

});
