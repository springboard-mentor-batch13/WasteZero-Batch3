// Backend/tests/rbac.test.js
//
// Tests for RBAC middleware (P0-02): protect middleware suspension gate,
// authorize role check, and backward-compat `id` field on req.user.
//
// Strategy: Unit-test middleware functions directly using mock req/res/next.
// No DB connection needed — we mock User.findById.

jest.mock('../models/users.model');

const jwt = require('jsonwebtoken');
const User = require('../models/users.model');
const { protect, authorize } = require('../middlewares/auth.middleware');

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const makeToken = (payload = {}) =>
  jwt.sign(
    { id: 'user123', role: 'volunteer', ...payload },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

// ── protect middleware ────────────────────────────────────────────────────────

describe('protect middleware — P0-02 (suspension gate)', () => {

  const activeUser = {
    _id: 'user123',
    role: 'volunteer',
    isSuspended: false,
    suspensionReason: null,
  };

  const suspendedUser = {
    _id: 'user789',
    role: 'volunteer',
    isSuspended: true,
    suspensionReason: 'Abuse',
  };

  test('returns 401 when no Authorization header is present', async () => {
    const req = { headers: {} };
    const res = makeRes();
    const next = jest.fn();
    await protect(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when token is invalid', async () => {
    const req = { headers: { authorization: 'Bearer invalidtoken' } };
    const res = makeRes();
    const next = jest.fn();
    await protect(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when user no longer exists in DB', async () => {
    User.findById = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) });
    const req = { headers: { authorization: `Bearer ${makeToken()}` } };
    const res = makeRes();
    const next = jest.fn();
    await protect(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 403 when user isSuspended=true (with reason)', async () => {
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(suspendedUser),
      }),
    });
    const req = { headers: { authorization: `Bearer ${makeToken({ id: 'user789' })}` } };
    const res = makeRes();
    const next = jest.fn();
    await protect(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/Abuse/);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when isSuspended=true but suspensionReason is null (generic message)', async () => {
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ ...suspendedUser, suspensionReason: null }),
      }),
    });
    const req = { headers: { authorization: `Bearer ${makeToken({ id: 'user789' })}` } };
    const res = makeRes();
    const next = jest.fn();
    await protect(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].message).toMatch(/contact support/i);
  });

  test('calls next() for active, unsuspended user', async () => {
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(activeUser),
      }),
    });
    const req = { headers: { authorization: `Bearer ${makeToken()}` } };
    const res = makeRes();
    const next = jest.fn();
    await protect(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
  });

  test('attaches req.user.id (string) for backward compatibility', async () => {
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(activeUser),
      }),
    });
    const req = { headers: { authorization: `Bearer ${makeToken()}` } };
    const res = makeRes();
    const next = jest.fn();
    await protect(req, res, next);
    expect(typeof req.user.id).toBe('string');
    expect(req.user.id).toBe('user123');
  });

});

// ── authorize middleware ──────────────────────────────────────────────────────

describe('authorize middleware', () => {

  test('calls next() when role matches', () => {
    const req = { user: { role: 'admin' } };
    const res = makeRes();
    const next = jest.fn();
    authorize('admin')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 403 when role does not match', () => {
    const req = { user: { role: 'volunteer' } };
    const res = makeRes();
    const next = jest.fn();
    authorize('admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('allows multiple valid roles', () => {
    const req = { user: { role: 'ngo' } };
    const res = makeRes();
    const next = jest.fn();
    authorize('ngo', 'admin')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 401 when req.user is not set', () => {
    const req = {};
    const res = makeRes();
    const next = jest.fn();
    authorize('admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

});
