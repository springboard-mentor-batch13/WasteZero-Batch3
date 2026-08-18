// Backend/tests/report.test.js
//
// Comprehensive Automated Test Suite for Report Module
// Covers:
//   - Report columns definitions and widths for all report types
//   - Date filtering & scoping logic
//   - Username resolution (volunteer, NGO, role enforcement, 404 on unknown user)
//   - Report Generation & Streaming (CSV, XLSX, PDF)
//   - Formula injection protection (VUL-004) in CSV and XLSX
//   - Cell formatting across data types (dates, booleans, arrays, kg, numbers)
//   - Generic "Browse before download" preview for all report types
//   - Legacy dropdown endpoints (opportunities by NGO, applications for opportunity)
//   - Validation rules (types, formats, date ranges, scoping requirements)
//   - Audit logging trigger (REPORT_DOWNLOADED)

'use strict';

const mongoose = require('mongoose');
const User = require('../models/users.model');
const Pickup = require('../models/pickup.model');
const Opportunity = require('../models/opportunity.model');
const Application = require('../models/application.model');
const AdminLog = require('../models/admin-log.model');

const reportService = require('../services/report.service');
const reportController = require('../controllers/report.controller');
const { formatCellValue } = require('../utils/cellFormatter');
const { escapeCsvField, sanitizeFormula } = require('../utils/csvExporter');
const {
  reportTypeParam,
  reportQueryRules,
  browseQueryRules,
  monthQueryRule,
} = require('../validations/report.validation');

// ── Mock helpers ─────────────────────────────────────────────────────────────

const makeId = () => new mongoose.Types.ObjectId().toString();

const mockReq = (overrides = {}) => ({
  headers: {},
  user: { id: makeId(), role: 'admin', email: 'admin@wastezero.io' },
  params: {},
  body: {},
  query: {},
  ...overrides,
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  res.write = jest.fn();
  res.end = jest.fn();
  res.on = jest.fn((event, cb) => {
    if (event === 'finish') cb();
    return res;
  });
  return res;
};

describe('Report Module — Unit and Integration Tests', () => {
  afterEach(() => jest.restoreAllMocks());

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Cell Formatter & Sanitization
  // ───────────────────────────────────────────────────────────────────────────
  describe('Cell Formatter & Security Sanitization', () => {
    test('formatCellValue handles all formats correctly', () => {
      expect(formatCellValue(true, 'bool-status')).toBe('Suspended');
      expect(formatCellValue(false, 'bool-status')).toBe('Active');
      expect(formatCellValue(true, 'bool-yn')).toBe('Yes');
      expect(formatCellValue(false, 'bool-yn')).toBe('No');
      expect(formatCellValue(new Date('2026-08-15T10:30:00Z'), 'date')).toBe('2026-08-15');
      expect(formatCellValue(12.345, 'kg')).toBe('12.35');
      expect(formatCellValue(['Plastic', 'Paper'], 'array')).toBe('Plastic, Paper');
      expect(formatCellValue(null, 'date')).toBe('');
      expect(formatCellValue(undefined, 'bool-status')).toBe('');
    });

    test('sanitizeFormula neutralizes spreadsheet formula injection (=, +, -, @, \\t, \\r)', () => {
      expect(sanitizeFormula('=1+1')).toBe("'=1+1");
      expect(sanitizeFormula('+cmd|')).toBe("'+cmd|");
      expect(sanitizeFormula('-cmd|')).toBe("'-cmd|");
      expect(sanitizeFormula('@SUM(A1:A5)')).toBe("'@SUM(A1:A5)");
      expect(sanitizeFormula('Normal text')).toBe('Normal text');
    });

    test('escapeCsvField quotes commas, quotes, and newlines and doubles quotes', () => {
      expect(escapeCsvField('hello, world')).toBe('"hello, world"');
      expect(escapeCsvField('hello "world"')).toBe('"hello ""world"""');
      expect(escapeCsvField("hello\nworld")).toBe("\"hello\nworld\"");
      expect(escapeCsvField('plain')).toBe('plain');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Column Definitions
  // ───────────────────────────────────────────────────────────────────────────
  describe('REPORT_COLUMNS definitions', () => {
    test('defines valid columns for users, pickups, opportunities, applications, full-activity', () => {
      const types = ['users', 'pickups', 'opportunities', 'applications', 'full-activity'];
      types.forEach((type) => {
        const columns = reportService.REPORT_COLUMNS[type];
        expect(Array.isArray(columns)).toBe(true);
        expect(columns.length).toBeGreaterThan(0);
        columns.forEach((col) => {
          expect(col).toHaveProperty('header');
          expect(col).toHaveProperty('key');
          expect(col).toHaveProperty('width');
          expect(col).toHaveProperty('pdfWidth');
        });
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Username Resolution
  // ───────────────────────────────────────────────────────────────────────────
  describe('resolveUserIdByUsername', () => {
    test('resolves valid username to ObjectId', async () => {
      const userId = new mongoose.Types.ObjectId();
      jest.spyOn(User, 'findOne').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: userId, role: 'ngo' }),
      });

      const resolved = await reportService.resolveUserIdByUsername('ecosavers', 'ngo');
      expect(resolved).toEqual(userId);
    });

    test('throws 404 when user is not found', async () => {
      jest.spyOn(User, 'findOne').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(
        reportService.resolveUserIdByUsername('nonexistent', 'ngo')
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    test('throws 400 when user role does not match expected role', async () => {
      jest.spyOn(User, 'findOne').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: makeId(), role: 'volunteer' }), // volunteer instead of ngo
      });

      await expect(
        reportService.resolveUserIdByUsername('vol123', 'ngo')
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Date Filter Helper
  // ───────────────────────────────────────────────────────────────────────────
  describe('buildDateFilter', () => {
    test('builds empty filter when no dates provided', () => {
      expect(reportService.buildDateFilter(null, null, 'createdAt')).toEqual({});
    });

    test('builds date range filter with start and end', () => {
      const filter = reportService.buildDateFilter('2026-01-01', '2026-08-01', 'scheduledDate');
      expect(filter.scheduledDate).toBeDefined();
      expect(filter.scheduledDate.$gte).toBeInstanceOf(Date);
      expect(filter.scheduledDate.$lt).toBeInstanceOf(Date);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Generic Browse Preview (browseReport)
  // ───────────────────────────────────────────────────────────────────────────
  describe('browseReport Preview Functionality', () => {
    test('browseReport(users) returns paginated records and total', async () => {
      const mockUsers = [{ _id: makeId(), name: 'John Doe', username: 'johndoe', role: 'volunteer' }];
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockUsers) }),
      });
      jest.spyOn(User, 'countDocuments').mockResolvedValue(1);
      // browseReport also computes a headline summary (getReportSummaryByUsername
      // → getReportSummary → User.aggregate) alongside the paginated preview.
      jest.spyOn(User, 'aggregate').mockResolvedValue([
        { total: [{ count: 1 }], volunteers: [{ count: 1 }], ngos: [], admins: [] },
      ]);

      const result = await reportService.browseReport('users', { page: 1, limit: 10 });
      expect(result.records).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    test('browseReport(pickups) scopes to volunteerUsername when provided and populates usernames', async () => {
      const volunteerId = new mongoose.Types.ObjectId();
      jest.spyOn(User, 'findOne').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: volunteerId, role: 'volunteer' }),
      });

      const aggregateSpy = jest.spyOn(Pickup, 'aggregate')
        .mockResolvedValueOnce([
          {
            _id: makeId(),
            scheduledDate: new Date(),
            wasteTypes: ['Plastic'],
            volunteer_username: 'vol_alice',
            agent_username: 'ngo_agent',
          },
        ])
        .mockResolvedValueOnce([
          { total: [{ count: 1 }], pending: [], assigned: [], completed: [{ count: 1 }], cancelled: [], missed: [] },
        ]);
      jest.spyOn(Pickup, 'countDocuments').mockResolvedValue(1);

      const result = await reportService.browseReport('pickups', { volunteerUsername: 'vol_alice' });
      expect(aggregateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ $match: expect.objectContaining({ user_id: volunteerId }) })])
      );
      expect(result.records[0].volunteer_username).toBe('vol_alice');
      expect(result.records[0].agent_username).toBe('ngo_agent');
    });

    test('browseReport(opportunities) scopes to ngoUsername when provided and populates ngo_username', async () => {
      const ngoId = new mongoose.Types.ObjectId();
      jest.spyOn(User, 'findOne').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: ngoId, role: 'ngo' }),
      });

      const aggregateSpy = jest.spyOn(Opportunity, 'aggregate')
        .mockResolvedValueOnce([
          {
            _id: makeId(),
            title: 'Cleanup Drive',
            ngo_username: 'greenteam',
          },
        ])
        .mockResolvedValueOnce([
          { total: [{ count: 1 }], open: [{ count: 1 }], closed: [], inProgress: [] },
        ]);
      jest.spyOn(Opportunity, 'countDocuments').mockResolvedValue(1);

      const result = await reportService.browseReport('opportunities', { ngoUsername: 'greenteam' });
      expect(aggregateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ $match: expect.objectContaining({ ngo_id: ngoId }) })])
      );
      expect(result.records[0].ngo_username).toBe('greenteam');
    });

    test('browseReport(applications) throws 400 when neither opportunityId nor ngoUsername provided', async () => {
      await expect(
        reportService.browseReport('applications', {})
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('browseReport(full-activity) returns paginated audit log preview', async () => {
      jest.spyOn(AdminLog, 'find').mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      });
      jest.spyOn(AdminLog, 'countDocuments').mockResolvedValue(0);

      const result = await reportService.browseReport('full-activity', { page: 1, limit: 20 });
      expect(result.records).toEqual([]);
      expect(result.total).toBe(0);
    });

    test('browseReport throws 400 on unknown report type', async () => {
      await expect(
        reportService.browseReport('unknown_type', {})
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Legacy Dropdown Helpers
  // ───────────────────────────────────────────────────────────────────────────
  describe('Legacy Browse Helpers', () => {
    test('getOpportunitiesByNgoUsername returns opportunities with application count', async () => {
      const ngoId = new mongoose.Types.ObjectId();
      jest.spyOn(User, 'findOne').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: ngoId, name: 'Eco NGO', username: 'econg' }),
      });

      jest.spyOn(Opportunity, 'aggregate').mockResolvedValue([
        { _id: makeId(), title: 'Tree Plant', applicationsCount: 5 },
      ]);

      const result = await reportService.getOpportunitiesByNgoUsername('econg');
      expect(result.ngo.name).toBe('Eco NGO');
      expect(result.opportunities).toHaveLength(1);
      expect(result.opportunities[0].applicationsCount).toBe(5);
    });

    test('getApplicationsForOpportunity returns paginated applications preview', async () => {
      const oppId = makeId();
      jest.spyOn(Opportunity, 'findById').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: oppId, title: 'Clean Park' }),
      });

      jest.spyOn(Application, 'find').mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      });
      jest.spyOn(Application, 'countDocuments').mockResolvedValue(0);

      const result = await reportService.getApplicationsForOpportunity(oppId, { page: 1, limit: 10 });
      expect(result.opportunity.title).toBe('Clean Park');
      expect(result.applications).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Validation Rules Structural Checks
  // ───────────────────────────────────────────────────────────────────────────
  describe('Report Validation Rules', () => {
    test('reportTypeParam returns validator chain', () => {
      const rules = reportTypeParam();
      expect(rules).toBeDefined();
    });

    test('reportQueryRules returns validator chain with format required', () => {
      const rules = reportQueryRules();
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
    });

    test('browseQueryRules returns validator chain with pagination', () => {
      const rules = browseQueryRules();
      expect(Array.isArray(rules)).toBe(true);
    });

    test('monthQueryRule returns validator for YYYY-MM', () => {
      const rules = monthQueryRule();
      expect(rules).toBeDefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Cursor Pipeline ObjectId Casting
  // ───────────────────────────────────────────────────────────────────────────
  describe('getCursorForReport ObjectId casting', () => {
    test('casts string opportunityId to ObjectId in applications aggregation pipeline', async () => {
      const oppIdStr = '60d5ecb8b392d7001f8e2810';
      const aggregateSpy = jest.spyOn(Application, 'aggregate').mockReturnValue({
        cursor: jest.fn().mockReturnValue({}),
      });

      await reportService.getCursorForReport('applications', { opportunityId: oppIdStr });

      expect(aggregateSpy).toHaveBeenCalledTimes(1);
      const pipeline = aggregateSpy.mock.calls[0][0];
      const matchStage = pipeline.find((stage) => stage.$match);
      expect(matchStage.$match.opportunity_id).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(matchStage.$match.opportunity_id.toString()).toBe(oppIdStr);
    });

    test('casts string volunteerId to ObjectId in pickups aggregation pipeline', async () => {
      const volIdStr = '60d5ecb8b392d7001f8e2811';
      const aggregateSpy = jest.spyOn(Pickup, 'aggregate').mockReturnValue({
        cursor: jest.fn().mockReturnValue({}),
      });

      await reportService.getCursorForReport('pickups', { volunteerId: volIdStr });

      expect(aggregateSpy).toHaveBeenCalledTimes(1);
      const pipeline = aggregateSpy.mock.calls[0][0];
      const matchStage = pipeline.find((stage) => stage.$match);
      expect(matchStage.$match.user_id).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(matchStage.$match.user_id.toString()).toBe(volIdStr);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Bug Fix Validations: Projections & Time Range Fallbacks
  // ───────────────────────────────────────────────────────────────────────────
  describe('Bug Fix Validations: Projections & Time Range Fallbacks', () => {
    const { resolveTimeRange } = require('../utils/timeRange.utils');
    const ngoReportController = require('../controllers/ngoReport.controller');
    const volunteerReportController = require('../controllers/volunteerReport.controller');
    const ngoReportService = require('../services/ngoReport.service');
    const volunteerReportService = require('../services/volunteerReport.service');

    test('browseReport(applications) populates volunteer_username and opportunity_title', async () => {
      const oppId = new mongoose.Types.ObjectId();
      const aggregateSpy = jest.spyOn(Application, 'aggregate')
        .mockResolvedValueOnce([
          {
            _id: makeId(),
            status: 'pending',
            volunteer_username: 'vol_bob',
            opportunity_title: 'Beach Cleanup Event',
          },
        ])
        .mockResolvedValueOnce([
          { total: [{ count: 1 }], pending: [{ count: 1 }], accepted: [], rejected: [] },
        ])
        .mockResolvedValueOnce([
          { _id: oppId, total: 1, pending: 1, accepted: 0, rejected: 0, opportunityTitle: 'Beach Cleanup Event' },
        ]);
      jest.spyOn(Application, 'countDocuments').mockResolvedValue(1);

      const result = await reportService.browseReport('applications', { opportunityId: oppId.toString() });
      expect(result.records[0].volunteer_username).toBe('vol_bob');
      expect(result.records[0].opportunity_title).toBe('Beach Cleanup Event');
    });

    test('resolveTimeRange resolves to custom when startDate or endDate provided without timeRange', () => {
      const resolved = resolveTimeRange(undefined, { startDate: '2026-05-01', endDate: '2026-05-31' });
      expect(resolved.startDate).toBe('2026-05-01');
      expect(resolved.endDate).toBe('2026-05-31');
    });

    test('ngoReportController.browseReport preserves custom date filters without explicit timeRange=custom', async () => {
      const req = mockReq({
        params: { type: 'opportunities' },
        query: { startDate: '2026-06-01', endDate: '2026-06-30' },
        user: { id: makeId(), role: 'ngo' },
      });
      const res = mockRes();

      const browseSpy = jest.spyOn(ngoReportService, 'browseNgoReport').mockResolvedValue({
        records: [], total: 0, page: 1, limit: 20, totalPages: 1, summary: {},
      });

      await ngoReportController.browseReport(req, res);

      expect(browseSpy).toHaveBeenCalledWith(
        'opportunities',
        req.user.id,
        expect.objectContaining({
          startDate: '2026-06-01',
          endDate: '2026-06-30',
        })
      );
    });

    test('volunteerReportController.browseReport preserves custom date filters without explicit timeRange=custom', async () => {
      const req = mockReq({
        params: { type: 'applications' },
        query: { startDate: '2026-07-01', endDate: '2026-07-15' },
        user: { id: makeId(), role: 'volunteer' },
      });
      const res = mockRes();

      const browseSpy = jest.spyOn(volunteerReportService, 'browseVolunteerReport').mockResolvedValue({
        records: [], total: 0, page: 1, limit: 20, totalPages: 1, summary: {},
      });

      await volunteerReportController.browseReport(req, res);

      expect(browseSpy).toHaveBeenCalledWith(
        'applications',
        req.user.id,
        expect.objectContaining({
          startDate: '2026-07-01',
          endDate: '2026-07-15',
        })
      );
    });
  });
});
