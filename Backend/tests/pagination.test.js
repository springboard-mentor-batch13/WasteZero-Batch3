// Backend/tests/pagination.test.js
//
// Tests for P1-03 (getMyApplications pagination) and P1-02 (message aggregation limit).
//
// Strategy: Unit tests with mocked models. Verifies that:
//   - getMyApplications now accepts page/limit/skip params and returns pagination metadata
//   - listConversationsForUser aggregation pipeline includes a $limit stage

jest.mock('../models/application.model');
jest.mock('../models/message.model');
jest.mock('../models/users.model');
jest.mock('../utils/crypto', () => ({
  encrypt: () => ({ encryptedData: 'enc', iv: 'iv', authTag: 'tag' }),
  decrypt: () => 'plaintext',
}));

const Application = require('../models/application.model');
const Message = require('../models/message.model');

// ── P1-03: getMyApplications pagination ──────────────────────────────────────

describe('getMyApplications — P1-03 (pagination)', () => {

  const makeReq = (query = {}) => ({
    user: { id: 'user123' },
    query: { page: '1', limit: '10', ...query },
  });

  const makeRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    const mockQuery = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ _id: 'app1' }]),
    };
    Application.find = jest.fn().mockReturnValue(mockQuery);
    Application.countDocuments = jest.fn().mockResolvedValue(1);
  });

  test('response includes pagination metadata (page, limit, total, totalPages)', async () => {
    const { getMyApplications } = require('../controllers/application.controllers');
    const req = makeReq();
    const res = makeRes();
    await getMyApplications(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.data).toHaveProperty('page');
    expect(body.data).toHaveProperty('limit');
    expect(body.data).toHaveProperty('total');
    expect(body.data).toHaveProperty('totalPages');
    expect(body.data).toHaveProperty('applications');
  });

  test('calls Application.find with volunteer_id filter', async () => {
    const { getMyApplications } = require('../controllers/application.controllers');
    const req = makeReq();
    const res = makeRes();
    await getMyApplications(req, res);
    expect(Application.find).toHaveBeenCalledWith(
      expect.objectContaining({ volunteer_id: 'user123' })
    );
  });

  test('calls Application.countDocuments with volunteer_id filter', async () => {
    const { getMyApplications } = require('../controllers/application.controllers');
    const req = makeReq();
    const res = makeRes();
    await getMyApplications(req, res);
    expect(Application.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ volunteer_id: 'user123' })
    );
  });

});

// ── P1-02: listConversationsForUser $limit in aggregation ─────────────────────

describe('listConversationsForUser — P1-02 ($limit:50 in pipeline)', () => {

  test('aggregation pipeline includes { $limit: 50 } stage', async () => {
    const captureMock = jest.fn().mockResolvedValue([]);
    Message.aggregate = captureMock;

    const messageService = require('../services/message.service');
    // Use a valid 24-char hex ObjectId string — message.service.js converts it
    // with new mongoose.Types.ObjectId(userId) so it must be valid BSON format.
    await messageService.listConversationsForUser('507f1f77bcf86cd799439011');

    const pipeline = captureMock.mock.calls[0][0];
    const limitStages = pipeline.filter((s) => s.$limit !== undefined);
    expect(limitStages).toHaveLength(1);
    expect(limitStages[0].$limit).toBe(50);
  });

});
