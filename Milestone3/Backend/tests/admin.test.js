// Backend/tests/admin.test.js
//
// Developer A M4 — Comprehensive Test Suite
//
// Tests:
//   RBAC (4)
//   requireAdmin middleware (3)
//   admin.service — getUsers (4)
//   admin.service — getUserById (3)
//   admin.service — suspendUser (6)
//   admin.service — unsuspendUser (4)
//   admin.service — updateUserRole (5)
//   admin.service — removeOpportunity (4)
//   admin.service — restoreOpportunity (4)
//   audit.service — logAction (4)
//   audit.controller — getAuditLogs (6)
//   adminSocket — forceDisconnectUser (3)
//   admin.validation (4)
//
// Total: 54 tests

'use strict';

const mongoose = require('mongoose');
const User = require('../models/users.model');
const Opportunity = require('../models/opportunity.model');
const AdminLog = require('../models/admin-log.model');

const adminService = require('../services/admin.service');
const auditService = require('../services/audit.service');
const { requireAdmin, blockAdmin } = require('../middlewares/rbac.middleware');
const { forceDisconnectUser } = require('../sockets/adminSocket');
const auditController = require('../controllers/audit.controller');
const adminController = require('../controllers/admin.controller');

// ── Shared mock helpers ──────────────────────────────────────────────────────

const mockReq = (overrides = {}) => ({
  headers: { 'user-agent': 'jest-test-agent' },
  socket: { remoteAddress: '127.0.0.1' },
  ip: '127.0.0.1',
  user: { id: new mongoose.Types.ObjectId().toString(), role: 'admin' },
  params: {},
  body: {},
  query: {},
  ...overrides,
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

const makeAdminId   = () => new mongoose.Types.ObjectId().toString();
const makeTargetId  = () => new mongoose.Types.ObjectId().toString();

// ─────────────────────────────────────────────────────────────────────────────
// 1. RBAC — requireAdmin middleware
// ─────────────────────────────────────────────────────────────────────────────

describe('requireAdmin middleware — RBAC', () => {
  const next = jest.fn();

  beforeEach(() => next.mockClear());

  test('returns 401 when req.user is absent (no prior protect call)', () => {
    const req = { user: undefined };
    const res = mockRes();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when user role is volunteer', () => {
    const req = { user: { role: 'volunteer' } };
    const res = mockRes();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when user role is ngo', () => {
    const req = { user: { role: 'ngo' } };
    const res = mockRes();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() when user role is admin', () => {
    const req = { user: { role: 'admin' } };
    const res = mockRes();
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1b. RBAC — blockAdmin middleware (B3 fix: GET /api/v1/dashboard/metrics
//     has no personal-metrics view for admin — should be 403, not 200)
// ─────────────────────────────────────────────────────────────────────────────

describe('blockAdmin middleware — RBAC', () => {
  const next = jest.fn();

  beforeEach(() => next.mockClear());

  test('returns 401 when req.user is absent (no prior protect call)', () => {
    const req = { user: undefined };
    const res = mockRes();
    blockAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when user role is admin', () => {
    const req = { user: { role: 'admin' } };
    const res = mockRes();
    blockAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() when user role is volunteer', () => {
    const req = { user: { role: 'volunteer' } };
    const res = mockRes();
    blockAdmin(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('calls next() when user role is ngo', () => {
    const req = { user: { role: 'ngo' } };
    const res = mockRes();
    blockAdmin(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. admin.service — getUsers
// ─────────────────────────────────────────────────────────────────────────────

describe('adminService.getUsers', () => {
  afterEach(() => jest.restoreAllMocks());

  test('returns paginated user list with correct shape', async () => {
    const fakeUsers = [
      { _id: makeTargetId(), name: 'Alice', role: 'volunteer', isSuspended: false },
    ];
    const leanMock = jest.fn().mockResolvedValue(fakeUsers);
    jest.spyOn(User, 'find').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnValue({ lean: leanMock }),
    });
    jest.spyOn(User, 'countDocuments').mockResolvedValue(1);

    const result = await adminService.getUsers({ page: 1, limit: 10 });
    expect(result).toMatchObject({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
    expect(Array.isArray(result.users)).toBe(true);
  });

  test('applies role filter when role param is provided', async () => {
    const findSpy = jest.spyOn(User, 'find').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    });
    jest.spyOn(User, 'countDocuments').mockResolvedValue(0);

    await adminService.getUsers({ page: 1, limit: 10, role: 'ngo' });
    expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({ role: 'ngo' }));
  });

  test('applies isSuspended=true filter', async () => {
    const findSpy = jest.spyOn(User, 'find').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    });
    jest.spyOn(User, 'countDocuments').mockResolvedValue(0);

    await adminService.getUsers({ page: 1, limit: 10, isSuspended: 'true' });
    expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({ isSuspended: true }));
  });

  test('applies escaped search regex to name, email, and username', async () => {
    const findSpy = jest.spyOn(User, 'find').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    });
    jest.spyOn(User, 'countDocuments').mockResolvedValue(0);

    await adminService.getUsers({ page: 1, limit: 10, search: 'alice' });
    const callArg = findSpy.mock.calls[0][0];
    expect(callArg).toHaveProperty('$or');
    expect(callArg.$or).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. admin.service — getUserById
// ─────────────────────────────────────────────────────────────────────────────

describe('adminService.getUserById', () => {
  afterEach(() => jest.restoreAllMocks());

  test('returns user object when found', async () => {
    const fakeUser = { _id: makeTargetId(), name: 'Bob', role: 'volunteer' };
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(fakeUser),
    });
    const result = await adminService.getUserById(fakeUser._id);
    expect(result).toEqual(fakeUser);
  });

  test('returns null when user does not exist', async () => {
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });
    const result = await adminService.getUserById(makeTargetId());
    expect(result).toBeNull();
  });

  test('does NOT include password in the returned user projection', async () => {
    // The projection string excludes password — verify select is called with it
    const selectSpy = jest.fn().mockReturnThis();
    jest.spyOn(User, 'findById').mockReturnValue({
      select: selectSpy,
      lean: jest.fn().mockResolvedValue({}),
    });
    await adminService.getUserById(makeTargetId());
    const selectArg = selectSpy.mock.calls[0][0];
    expect(selectArg).not.toContain('password');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. admin.service — suspendUser
// ─────────────────────────────────────────────────────────────────────────────

describe('adminService.suspendUser', () => {
  afterEach(() => jest.restoreAllMocks());

  const adminId  = makeAdminId();
  const targetId = makeTargetId();

  test('throws 403 when admin tries to suspend themselves', async () => {
    await expect(adminService.suspendUser(adminId, adminId, 'test'))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  test('throws 404 when target user does not exist', async () => {
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });
    await expect(adminService.suspendUser(targetId, adminId, 'reason'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('sets isSuspended=true, suspensionReason, suspendedAt, suspendedBy on success', async () => {
    const existingUser = { _id: targetId, name: 'Eve', isSuspended: false };
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(existingUser),
    });
    jest.spyOn(User, 'findByIdAndUpdate').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ ...existingUser, isSuspended: true, suspendedBy: adminId }),
    });

    const result = await adminService.suspendUser(targetId, adminId, 'Violation');
    expect(result.before.isSuspended).toBe(false);
    expect(result.after.isSuspended).toBe(true);
    expect(result.after.suspendedBy).toBe(adminId);
  });

  test('findByIdAndUpdate receives suspendedBy=adminId (server-derived, never client)', async () => {
    const existingUser = { _id: targetId, name: 'Eve', isSuspended: false };
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(existingUser),
    });
    const updateSpy = jest.spyOn(User, 'findByIdAndUpdate').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ ...existingUser, isSuspended: true }),
    });

    await adminService.suspendUser(targetId, adminId, 'Test');
    const updateArg = updateSpy.mock.calls[0][1];
    expect(updateArg.suspendedBy.toString()).toBe(adminId.toString());
    expect(updateArg.isSuspended).toBe(true);
    expect(updateArg.suspendedAt).toBeInstanceOf(Date);
  });

  test('returns before and after snapshots', async () => {
    const existingUser = { _id: targetId, name: 'Eve', isSuspended: false };
    const updatedUser  = { ...existingUser, isSuspended: true };
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(existingUser),
    });
    jest.spyOn(User, 'findByIdAndUpdate').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(updatedUser),
    });

    const result = await adminService.suspendUser(targetId, adminId, 'Reason');
    expect(result).toHaveProperty('before');
    expect(result).toHaveProperty('after');
  });

  test('reason is stored as provided (max 255 chars enforced at validation layer)', async () => {
    const existingUser = { _id: targetId, name: 'Eve', isSuspended: false };
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(existingUser),
    });
    const updateSpy = jest.spyOn(User, 'findByIdAndUpdate').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ ...existingUser, isSuspended: true }),
    });

    const reason = 'Community standards violation';
    await adminService.suspendUser(targetId, adminId, reason);
    expect(updateSpy.mock.calls[0][1].suspensionReason).toBe(reason);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. admin.service — unsuspendUser
// ─────────────────────────────────────────────────────────────────────────────

describe('adminService.unsuspendUser', () => {
  afterEach(() => jest.restoreAllMocks());

  const adminId  = makeAdminId();
  const targetId = makeTargetId();

  test('throws 403 on self-unsuspend attempt', async () => {
    await expect(adminService.unsuspendUser(adminId, adminId))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  test('throws 404 when user not found', async () => {
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });
    await expect(adminService.unsuspendUser(targetId, adminId))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('clears all suspension fields: isSuspended=false, reason=null, at=null, by=null', async () => {
    const existingUser = { _id: targetId, isSuspended: true, suspensionReason: 'Violation' };
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(existingUser),
    });
    const updateSpy = jest.spyOn(User, 'findByIdAndUpdate').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ ...existingUser, isSuspended: false }),
    });

    await adminService.unsuspendUser(targetId, adminId);
    const updateArg = updateSpy.mock.calls[0][1];
    expect(updateArg.isSuspended).toBe(false);
    expect(updateArg.suspensionReason).toBeNull();
    expect(updateArg.suspendedAt).toBeNull();
    expect(updateArg.suspendedBy).toBeNull();
  });

  test('returns before and after snapshots', async () => {
    const existingUser = { _id: targetId, isSuspended: true };
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(existingUser),
    });
    jest.spyOn(User, 'findByIdAndUpdate').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ ...existingUser, isSuspended: false }),
    });

    const result = await adminService.unsuspendUser(targetId, adminId);
    expect(result.before.isSuspended).toBe(true);
    expect(result.after.isSuspended).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. admin.service — updateUserRole
// ─────────────────────────────────────────────────────────────────────────────

describe('adminService.updateUserRole', () => {
  afterEach(() => jest.restoreAllMocks());

  const adminId  = makeAdminId();
  const targetId = makeTargetId();

  test('throws 403 on self-role-change attempt', async () => {
    await expect(adminService.updateUserRole(adminId, adminId, 'volunteer'))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  test('throws 404 when target user not found', async () => {
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });
    await expect(adminService.updateUserRole(targetId, adminId, 'ngo'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('last-admin protection: throws 409 when demoting the only admin', async () => {
    const existingAdmin = { _id: targetId, role: 'admin' };
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(existingAdmin),
    });
    jest.spyOn(User, 'countDocuments').mockResolvedValue(1); // only 1 admin total

    await expect(adminService.updateUserRole(targetId, adminId, 'volunteer'))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('allows demotion when multiple admins exist', async () => {
    const existingAdmin = { _id: targetId, role: 'admin' };
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(existingAdmin),
    });
    jest.spyOn(User, 'countDocuments').mockResolvedValue(2); // 2 admins — safe
    jest.spyOn(User, 'findByIdAndUpdate').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ ...existingAdmin, role: 'volunteer' }),
    });

    const result = await adminService.updateUserRole(targetId, adminId, 'volunteer');
    expect(result.after.role).toBe('volunteer');
  });

  test('returns before and after snapshots with correct roles', async () => {
    const existingUser = { _id: targetId, role: 'volunteer' };
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(existingUser),
    });
    jest.spyOn(User, 'findByIdAndUpdate').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ ...existingUser, role: 'ngo' }),
    });

    const result = await adminService.updateUserRole(targetId, adminId, 'ngo');
    expect(result.before.role).toBe('volunteer');
    expect(result.after.role).toBe('ngo');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. admin.service — removeOpportunity
// ─────────────────────────────────────────────────────────────────────────────

describe('adminService.removeOpportunity', () => {
  afterEach(() => jest.restoreAllMocks());

  const adminId = makeAdminId();
  const oppId   = makeTargetId();

  test('throws 404 when opportunity not found', async () => {
    jest.spyOn(Opportunity, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    await expect(adminService.removeOpportunity(oppId, adminId, null))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('sets isRemovedByAdmin=true with server-derived removedBy', async () => {
    const opp = { _id: oppId, title: 'Clean Park', isRemovedByAdmin: false };
    jest.spyOn(Opportunity, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue(opp),
    });
    const updateSpy = jest.spyOn(Opportunity, 'findByIdAndUpdate').mockReturnValue({
      lean: jest.fn().mockResolvedValue({ ...opp, isRemovedByAdmin: true, removedBy: adminId }),
    });

    await adminService.removeOpportunity(oppId, adminId, 'Bad content');
    const updateArg = updateSpy.mock.calls[0][1];
    expect(updateArg.isRemovedByAdmin).toBe(true);
    expect(updateArg.removedBy.toString()).toBe(adminId.toString());
    expect(updateArg.removedAt).toBeInstanceOf(Date);
  });

  test('stores removalReason when provided', async () => {
    const opp = { _id: oppId, isRemovedByAdmin: false };
    jest.spyOn(Opportunity, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue(opp),
    });
    const updateSpy = jest.spyOn(Opportunity, 'findByIdAndUpdate').mockReturnValue({
      lean: jest.fn().mockResolvedValue({ ...opp, isRemovedByAdmin: true }),
    });

    await adminService.removeOpportunity(oppId, adminId, 'Inappropriate');
    expect(updateSpy.mock.calls[0][1].removalReason).toBe('Inappropriate');
  });

  test('preserves applications (no cascade delete)', async () => {
    // Applications model should never be referenced in removeOpportunity
    const Application = require('../models/application.model');
    const deleteSpy = jest.spyOn(Application, 'deleteMany');

    const opp = { _id: oppId, isRemovedByAdmin: false };
    jest.spyOn(Opportunity, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue(opp),
    });
    jest.spyOn(Opportunity, 'findByIdAndUpdate').mockReturnValue({
      lean: jest.fn().mockResolvedValue({ ...opp, isRemovedByAdmin: true }),
    });

    await adminService.removeOpportunity(oppId, adminId, null);
    expect(deleteSpy).not.toHaveBeenCalled();
    deleteSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. admin.service — restoreOpportunity
// ─────────────────────────────────────────────────────────────────────────────

describe('adminService.restoreOpportunity', () => {
  afterEach(() => jest.restoreAllMocks());

  const adminId = makeAdminId();
  const oppId   = makeTargetId();

  test('throws 404 when opportunity not found', async () => {
    jest.spyOn(Opportunity, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    await expect(adminService.restoreOpportunity(oppId, adminId))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('throws 409 when opportunity is not currently removed', async () => {
    const opp = { _id: oppId, isRemovedByAdmin: false };
    jest.spyOn(Opportunity, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue(opp),
    });
    await expect(adminService.restoreOpportunity(oppId, adminId))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('clears all 4 soft-delete fields on successful restore', async () => {
    const opp = { _id: oppId, isRemovedByAdmin: true, removalReason: 'Old reason' };
    jest.spyOn(Opportunity, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue(opp),
    });
    const updateSpy = jest.spyOn(Opportunity, 'findByIdAndUpdate').mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: oppId, isRemovedByAdmin: false }),
    });

    await adminService.restoreOpportunity(oppId, adminId);
    const updateArg = updateSpy.mock.calls[0][1];
    expect(updateArg.isRemovedByAdmin).toBe(false);
    expect(updateArg.removalReason).toBeNull();
    expect(updateArg.removedAt).toBeNull();
    expect(updateArg.removedBy).toBeNull();
  });

  test('returns before (removed) and after (restored) snapshots', async () => {
    const opp = { _id: oppId, isRemovedByAdmin: true };
    jest.spyOn(Opportunity, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue(opp),
    });
    jest.spyOn(Opportunity, 'findByIdAndUpdate').mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: oppId, isRemovedByAdmin: false }),
    });

    const result = await adminService.restoreOpportunity(oppId, adminId);
    expect(result.before.isRemovedByAdmin).toBe(true);
    expect(result.after.isRemovedByAdmin).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. audit.service — logAction
// ─────────────────────────────────────────────────────────────────────────────

describe('auditService.logAction', () => {
  afterEach(() => jest.restoreAllMocks());

  const adminId  = makeAdminId();
  const targetId = makeTargetId();
  const req      = mockReq({ user: { id: adminId } });

  test('calls AdminLog.create with server-derived ip_address (not from req.body)', async () => {
    const createSpy = jest.spyOn(AdminLog, 'create').mockResolvedValue({});

    await auditService.logAction({
      adminId,
      action: 'USER_SUSPENDED',
      targetType: 'User',
      targetId,
      details: 'Test suspension',
      req: { ...req, socket: { remoteAddress: '10.0.0.1' }, headers: { 'user-agent': 'ua' } },
    });

    const createArg = createSpy.mock.calls[0][0];
    expect(createArg.ip_address).toBe('10.0.0.1');
    expect(createArg.admin_id).toBe(adminId);
    expect(createArg.action).toBe('USER_SUSPENDED');
  });

  test('does NOT throw when AdminLog.create fails (non-critical audit)', async () => {
    jest.spyOn(AdminLog, 'create').mockRejectedValue(new Error('DB down'));
    // Should resolve without throwing — audit failure is non-critical
    await expect(
      auditService.logAction({
        adminId,
        action: 'USER_SUSPENDED',
        targetType: 'User',
        targetId,
        details: 'Test',
        req,
      })
    ).resolves.toBeUndefined();
  });

  test('sanitises before/after to exclude password field', async () => {
    const createSpy = jest.spyOn(AdminLog, 'create').mockResolvedValue({});

    const before = { _id: targetId, password: 'hashed_secret', role: 'volunteer' };
    await auditService.logAction({
      adminId,
      action: 'USER_ROLE_CHANGED',
      targetType: 'User',
      targetId,
      details: 'Changed role',
      before,
      req,
    });

    const createArg = createSpy.mock.calls[0][0];
    expect(createArg.changes.before).not.toHaveProperty('password');
    expect(createArg.changes.before).toHaveProperty('role', 'volunteer');
  });

  test('truncates details to 500 chars', async () => {
    const createSpy = jest.spyOn(AdminLog, 'create').mockResolvedValue({});
    const longDetails = 'x'.repeat(600);

    await auditService.logAction({
      adminId,
      action: 'OPPORTUNITY_REMOVED',
      targetType: 'Opportunity',
      targetId,
      details: longDetails,
      req,
    });

    const createArg = createSpy.mock.calls[0][0];
    expect(createArg.details.length).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. audit.controller — getAuditLogs
// ─────────────────────────────────────────────────────────────────────────────

describe('auditController.getAuditLogs', () => {
  afterEach(() => jest.restoreAllMocks());

  const adminId = makeAdminId();

  const makeFindChain = (docs, count) => {
    jest.spyOn(AdminLog, 'find').mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(docs),
    });
    jest.spyOn(AdminLog, 'countDocuments').mockResolvedValue(count);
  };

  test('returns paginated audit logs with correct shape', async () => {
    const fakeLogs = [{ _id: makeTargetId(), action: 'USER_SUSPENDED' }];
    makeFindChain(fakeLogs, 1);

    const req = mockReq({ query: {} });
    const res = mockRes();

    await auditController.getAuditLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.logs).toHaveLength(1);
    expect(body.pagination).toMatchObject({ total: 1, page: 1 });
  });

  test('applies action filter from query params', async () => {
    makeFindChain([], 0);
    const findSpy = jest.spyOn(AdminLog, 'find').mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    const req = mockReq({ query: { action: 'USER_SUSPENDED' } });
    await auditController.getAuditLogs(req, mockRes());

    expect(findSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_SUSPENDED' })
    );
  });

  test('applies adminId filter from query params', async () => {
    const findSpy = jest.spyOn(AdminLog, 'find').mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    jest.spyOn(AdminLog, 'countDocuments').mockResolvedValue(0);

    const req = mockReq({ query: { adminId } });
    await auditController.getAuditLogs(req, mockRes());

    expect(findSpy).toHaveBeenCalledWith(
      expect.objectContaining({ admin_id: adminId })
    );
  });

  test('sorts newest first (timestamp: -1)', async () => {
    const sortSpy = jest.fn().mockReturnThis();
    jest.spyOn(AdminLog, 'find').mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: sortSpy,
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    jest.spyOn(AdminLog, 'countDocuments').mockResolvedValue(0);

    await auditController.getAuditLogs(mockReq({ query: {} }), mockRes());
    expect(sortSpy).toHaveBeenCalledWith({ timestamp: -1 });
  });

  test('caps limit at 100 (ignores client-provided limit > 100)', async () => {
    makeFindChain([], 0);
    const limitSpy = jest.fn().mockReturnThis();
    jest.spyOn(AdminLog, 'find').mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: limitSpy,
      lean: jest.fn().mockResolvedValue([]),
    });

    const req = mockReq({ query: { limit: '999' } });
    await auditController.getAuditLogs(req, mockRes());
    expect(limitSpy).toHaveBeenCalledWith(100);
  });

  test('applies date range filter when startDate and endDate provided', async () => {
    const findSpy = jest.spyOn(AdminLog, 'find').mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    jest.spyOn(AdminLog, 'countDocuments').mockResolvedValue(0);

    const req = mockReq({
      query: { startDate: '2026-01-01', endDate: '2026-12-31' },
    });
    await auditController.getAuditLogs(req, mockRes());

    const filterArg = findSpy.mock.calls[0][0];
    expect(filterArg).toHaveProperty('timestamp');
    expect(filterArg.timestamp).toHaveProperty('$gte');
    expect(filterArg.timestamp).toHaveProperty('$lte');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. adminSocket — forceDisconnectUser
// ─────────────────────────────────────────────────────────────────────────────

describe('forceDisconnectUser (sockets/adminSocket)', () => {
  test('does not throw when Socket.IO is not initialized (graceful degradation)', () => {
    // getIO() throws when Socket.IO has not been initialized — this simulates that
    jest.isolateModules(() => {
      jest.mock('../sockets/index', () => ({
        getIO: () => { throw new Error('Not initialized'); },
      }));
      const { forceDisconnectUser: fn } = require('../sockets/adminSocket');
      // Should not throw — graceful degradation
      expect(() => fn('someuserid', 'reason')).not.toThrow();
    });
  });

  test('emits account:suspended to the correct user room', () => {
    const targetUserId = makeTargetId();
    const mockSocket = { disconnect: jest.fn() };
    const mockRooms = new Map([[`user:${targetUserId}`, new Set(['socket-1'])]]);
    const mockSockets = new Map([['socket-1', mockSocket]]);

    const mockIO = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      sockets: { adapter: { rooms: mockRooms }, sockets: mockSockets },
    };

    jest.isolateModules(() => {
      jest.mock('../sockets/index', () => ({ getIO: () => mockIO }));
      const { forceDisconnectUser: fn } = require('../sockets/adminSocket');
      fn(targetUserId, 'Violation');
      expect(mockIO.to).toHaveBeenCalledWith(`user:${targetUserId}`);
    });
  });

  test('disconnects all sockets in the user room', () => {
    const targetUserId = makeTargetId();
    const mockSocket1 = { disconnect: jest.fn() };
    const mockSocket2 = { disconnect: jest.fn() };
    const mockRooms = new Map([[`user:${targetUserId}`, new Set(['s1', 's2'])]]);
    const mockSockets = new Map([['s1', mockSocket1], ['s2', mockSocket2]]);

    const mockIO = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      sockets: { adapter: { rooms: mockRooms }, sockets: mockSockets },
    };

    jest.isolateModules(() => {
      jest.mock('../sockets/index', () => ({ getIO: () => mockIO }));
      const { forceDisconnectUser: fn } = require('../sockets/adminSocket');
      fn(targetUserId, 'Suspended');
      expect(mockSocket1.disconnect).toHaveBeenCalledWith(true);
      expect(mockSocket2.disconnect).toHaveBeenCalledWith(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. admin.validation rules — structural tests
// ─────────────────────────────────────────────────────────────────────────────

describe('admin.validation — structural checks', () => {
  const {
    suspendUserRules,
    updateRoleRules,
    userListQueryRules,
    auditLogQueryRules,
  } = require('../validations/admin.validation');

  test('suspendUserRules() returns an array of validators', () => {
    const rules = suspendUserRules();
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
  });

  test('updateRoleRules() returns an array of validators', () => {
    const rules = updateRoleRules();
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
  });

  test('userListQueryRules() returns an array of validators', () => {
    const rules = userListQueryRules();
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
  });

  test('auditLogQueryRules() returns an array of validators', () => {
    const rules = auditLogQueryRules();
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
  });
});
