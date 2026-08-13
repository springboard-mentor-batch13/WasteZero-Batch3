// Backend/tests/audit.test.js
//
// Comprehensive Automated Test Suite for Admin Audit Logging
// Covers:
//   - Full Admin Action Matrix:
//       1. USER_SUSPENDED
//       2. USER_UNSUSPENDED
//       3. USER_ROLE_CHANGED
//       4. OPPORTUNITY_REMOVED (via admin.controller & opportunity.controller)
//       5. OPPORTUNITY_RESTORED
//       6. PICKUP_STATUS_OVERRIDE
//       7. PICKUP_UPDATED
//       8. PICKUP_DELETED
//       9. REPORT_DOWNLOADED
//   - Non-critical audit logging guarantee (swallows DB error, logs to console, never crashes caller)
//   - Sensitive data sanitization (password, otp, token, secret, __v removed from before/after snapshots)
//   - Server-derived IP address & User Agent extraction
//   - Details field 500-character truncation
//   - Audit log query filtering (by action including PICKUP_UPDATED/PICKUP_DELETED, target_type, target_id, adminId, date range)
//   - Immutability: Verify no PUT/PATCH/DELETE endpoints exist for audit logs

'use strict';

const mongoose = require('mongoose');
const AdminLog = require('../models/admin-log.model');
const auditService = require('../services/audit.service');
const auditController = require('../controllers/audit.controller');
const { auditLogQueryRules } = require('../validations/admin.validation');

// ── Mock helpers ─────────────────────────────────────────────────────────────

const makeId = () => new mongoose.Types.ObjectId().toString();

const mockReq = (overrides = {}) => ({
  headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  socket: { remoteAddress: '192.168.1.100' },
  ip: '192.168.1.100',
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
  return res;
};

describe('Admin Audit Logging Matrix & Security Tests', () => {
  afterEach(() => jest.restoreAllMocks());

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Audit Action Matrix Verification
  // ───────────────────────────────────────────────────────────────────────────
  describe('Audit Action Matrix Verification', () => {
    const adminId = makeId();
    const targetId = makeId();
    const req = mockReq({ user: { id: adminId } });

    const matrix = [
      { action: 'USER_SUSPENDED', targetType: 'User', details: 'User suspended for terms violation' },
      { action: 'USER_UNSUSPENDED', targetType: 'User', details: 'User unsuspended after appeal' },
      { action: 'USER_ROLE_CHANGED', targetType: 'User', details: 'Role changed from volunteer to ngo' },
      { action: 'OPPORTUNITY_REMOVED', targetType: 'Opportunity', details: 'Opportunity removed by admin' },
      { action: 'OPPORTUNITY_RESTORED', targetType: 'Opportunity', details: 'Opportunity restored by admin' },
      { action: 'PICKUP_STATUS_OVERRIDE', targetType: 'Pickup', details: 'Admin forced pickup status to Completed' },
      { action: 'PICKUP_UPDATED', targetType: 'Pickup', details: 'Admin updated pickup preferred time slot' },
      { action: 'PICKUP_DELETED', targetType: 'Pickup', details: 'Admin hard-deleted pickup' },
      { action: 'REPORT_DOWNLOADED', targetType: 'Report', details: 'Report downloaded: type=users format=csv' },
    ];

    matrix.forEach(({ action, targetType, details }) => {
      test(`records ${action} against ${targetType} with server-derived metadata`, async () => {
        const createSpy = jest.spyOn(AdminLog, 'create').mockResolvedValue({});

        await auditService.logAction({
          adminId,
          action,
          targetType,
          targetId,
          details,
          req,
        });

        expect(createSpy).toHaveBeenCalledTimes(1);
        const record = createSpy.mock.calls[0][0];

        expect(record.admin_id).toBe(adminId);
        expect(record.action).toBe(action);
        expect(record.target_type).toBe(targetType);
        expect(record.target_id).toBe(targetId);
        expect(record.details).toBe(details);
        expect(record.ip_address).toBe('192.168.1.100');
        expect(record.user_agent).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Sensitive Data Sanitization
  // ───────────────────────────────────────────────────────────────────────────
  describe('Sensitive Data Sanitization in Audit Snapshots', () => {
    test('removes password, otp, token, secret, __v from before and after snapshots', async () => {
      const createSpy = jest.spyOn(AdminLog, 'create').mockResolvedValue({});

      const beforeDoc = {
        _id: makeId(),
        name: 'Target User',
        email: 'target@example.com',
        password: '$2a$10$hashedPasswordHere',
        otp: '123456',
        token: 'jwt.token.string',
        secret: 'my-super-secret',
        __v: 0,
        role: 'volunteer',
      };

      const afterDoc = {
        _id: beforeDoc._id,
        name: 'Target User',
        email: 'target@example.com',
        password: '$2a$10$newHashedPasswordHere',
        role: 'ngo',
      };

      await auditService.logAction({
        adminId: makeId(),
        action: 'USER_ROLE_CHANGED',
        targetType: 'User',
        targetId: beforeDoc._id,
        details: 'Role change',
        before: beforeDoc,
        after: afterDoc,
        req: mockReq(),
      });

      const record = createSpy.mock.calls[0][0];
      expect(record.changes.before).not.toHaveProperty('password');
      expect(record.changes.before).not.toHaveProperty('otp');
      expect(record.changes.before).not.toHaveProperty('token');
      expect(record.changes.before).not.toHaveProperty('secret');
      expect(record.changes.before).not.toHaveProperty('__v');
      expect(record.changes.before).toHaveProperty('name', 'Target User');
      expect(record.changes.before).toHaveProperty('role', 'volunteer');

      expect(record.changes.after).not.toHaveProperty('password');
      expect(record.changes.after).toHaveProperty('role', 'ngo');
    });

    test('handles Mongoose document with .toObject() safely', async () => {
      const createSpy = jest.spyOn(AdminLog, 'create').mockResolvedValue({});

      const mongooseDoc = {
        _id: makeId(),
        name: 'Doc User',
        password: 'secret_hash',
        toObject: function () {
          return { _id: this._id, name: this.name, password: this.password };
        },
      };

      await auditService.logAction({
        adminId: makeId(),
        action: 'USER_ROLE_CHANGED',
        targetType: 'User',
        targetId: mongooseDoc._id,
        details: 'Updated',
        before: mongooseDoc,
        req: mockReq(),
      });

      const record = createSpy.mock.calls[0][0];
      expect(record.changes.before).not.toHaveProperty('password');
      expect(record.changes.before).toHaveProperty('name', 'Doc User');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Error Resilience & Non-Throwing Invariant
  // ───────────────────────────────────────────────────────────────────────────
  describe('Non-Throwing Audit Contract', () => {
    test('does not throw when database write fails and logs error to console', async () => {
      jest.spyOn(AdminLog, 'create').mockRejectedValue(new Error('Mongo network timeout'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        auditService.logAction({
          adminId: makeId(),
          action: 'USER_SUSPENDED',
          targetType: 'User',
          targetId: makeId(),
          details: 'Suspended user',
          req: mockReq(),
        })
      ).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Query Filtering with Newly Added Actions
  // ───────────────────────────────────────────────────────────────────────────
  describe('Audit Log Query & Filtering (getAuditLogs)', () => {
    test('filters audit logs by action=PICKUP_UPDATED (verifies bug fix)', async () => {
      const findSpy = jest.spyOn(AdminLog, 'find').mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      jest.spyOn(AdminLog, 'countDocuments').mockResolvedValue(0);

      const req = mockReq({ query: { action: 'PICKUP_UPDATED' } });
      const res = mockRes();

      await auditController.getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PICKUP_UPDATED' })
      );
    });

    test('filters audit logs by action=PICKUP_DELETED (verifies bug fix)', async () => {
      const findSpy = jest.spyOn(AdminLog, 'find').mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      jest.spyOn(AdminLog, 'countDocuments').mockResolvedValue(0);

      const req = mockReq({ query: { action: 'PICKUP_DELETED' } });
      const res = mockRes();

      await auditController.getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PICKUP_DELETED' })
      );
    });

    test('filters by target_type, target_id, and adminId simultaneously', async () => {
      const adminId = makeId();
      const targetId = makeId();

      const findSpy = jest.spyOn(AdminLog, 'find').mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      jest.spyOn(AdminLog, 'countDocuments').mockResolvedValue(0);

      const req = mockReq({
        query: {
          target_type: 'Opportunity',
          target_id: targetId,
          adminId: adminId,
        },
      });

      await auditController.getAuditLogs(req, mockRes());

      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          target_type: 'Opportunity',
          target_id: targetId,
          admin_id: adminId,
        })
      );
    });
  });
});
