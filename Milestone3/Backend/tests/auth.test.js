// Backend/tests/auth.test.js
//
// Tests covering P0-03, P0-04 security changes in auth flow:
//   - P0-03: Suspended users cannot login (even with valid credentials)
//   - P0-04: Public register endpoint refuses 'admin' role
//   - P0-04: Admin setup endpoint validates ADMIN_INIT_SECRET
//   - P0-04: Admin setup endpoint refuses if admin already exists (test via mock)
//
// Strategy: Unit-test the controller functions directly by mocking their
// dependencies (User model, issueOtp, etc.). This avoids needing a real DB.

jest.mock('../models/users.model');
jest.mock('../utils/issueOtp');
jest.mock('../utils/verifyOtp');
jest.mock('../utils/generateToken');
jest.mock('../utils/passwordValidator');
jest.mock('../models/otp.model');

const User = require('../models/users.model');
const issueOtp = require('../utils/issueOtp');
const generateToken = require('../utils/generateToken');
const passwordValidator = require('../utils/passwordValidator');
const { registerUser, loginUser, setupAdmin } = require('../controllers/auth.controllers');

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Helper: mock User.findOne to return a chainable object with .lean()
// Both registerUser and setupAdmin call: User.findOne({...}).lean()
const mockFindOneReturning = (value) =>
  jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) });

// ── P0-04: registerUser must reject 'admin' role ──────────────────────────────

describe('registerUser — P0-04 (admin role rejected)', () => {

  beforeEach(() => {
    passwordValidator.mockReturnValue(true);
    // registerUser calls: User.findOne({$or:[...]}).lean()
    User.findOne = mockFindOneReturning(null);
    issueOtp.mockResolvedValue();
  });

  test('returns 400 when role is admin', async () => {
    const req = { body: { name: 'Admin', username: 'admin', email: 'admin@test.com', password: 'P@ssw0rd1', role: 'admin' } };
    const res = makeRes();
    await registerUser(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    const body = res.json.mock.calls[0][0];
    expect(body.message).toMatch(/volunteer.*ngo/i);
  });

  test('returns 201 when role is volunteer', async () => {
    const req = { body: { name: 'Test', username: 'testv', email: 'v@test.com', password: 'P@ssw0rd1', role: 'volunteer' } };
    const res = makeRes();
    await registerUser(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('returns 201 when role is ngo', async () => {
    const req = { body: { name: 'NGO', username: 'testngo', email: 'ngo@test.com', password: 'P@ssw0rd1', role: 'ngo' } };
    const res = makeRes();
    await registerUser(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

});

// ── P0-03: loginUser must reject suspended users ───────────────────────────────

describe('loginUser — P0-03 (suspended user blocked)', () => {

  const mockSuspendedUser = {
    _id: 'user123',
    name: 'Test',
    username: 'suspended',
    email: 'suspended@test.com',
    role: 'volunteer',
    isVerified: true,
    isSuspended: true,
    suspensionReason: 'Spam activity',
    matchPassword: jest.fn().mockResolvedValue(true),
  };

  const mockActiveUser = {
    _id: 'user456',
    name: 'Active',
    username: 'active',
    email: 'active@test.com',
    role: 'volunteer',
    isVerified: true,
    isSuspended: false,
    suspensionReason: null,
    locations: [],
    wasteTypes: [],
    skills: [],
    bio: '',
    matchPassword: jest.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    generateToken.mockReturnValue('mock_token_123');
  });

  test('returns 403 when user is suspended (with reason)', async () => {
    // loginUser calls: User.findOne({$or:[...]}).select('+password')
    User.findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(mockSuspendedUser) });
    const req = { body: { identifier: 'suspended@test.com', password: 'P@ssw0rd1' } };
    const res = makeRes();
    await loginUser(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/suspended/i);
    expect(body.message).toMatch(/Spam activity/);
  });

  test('returns 403 with generic message when suspensionReason is null', async () => {
    User.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ ...mockSuspendedUser, suspensionReason: null }),
    });
    const req = { body: { identifier: 'suspended@test.com', password: 'P@ssw0rd1' } };
    const res = makeRes();
    await loginUser(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toMatch(/contact support/i);
  });

  test('returns 200 and token when user is active and password matches', async () => {
    User.findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(mockActiveUser) });
    const req = { body: { identifier: 'active@test.com', password: 'P@ssw0rd1' } };
    const res = makeRes();
    await loginUser(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.token).toBe('mock_token_123');
  });

});

// ── P0-04: setupAdmin ─────────────────────────────────────────────────────────

describe('setupAdmin — P0-04', () => {

  beforeEach(() => {
    process.env.ADMIN_INIT_SECRET = 'test_admin_init_secret_16';
    passwordValidator.mockReturnValue(true);
    // setupAdmin calls: User.findOne({$or:[...]}).lean()
    User.findOne = mockFindOneReturning(null);
    User.exists = jest.fn().mockResolvedValue(null);
    issueOtp.mockResolvedValue();
  });

  test('returns 403 when adminInitSecret is wrong', async () => {
    const req = {
      body: { name: 'Admin', username: 'admin', email: 'admin@test.com', password: 'P@ssw0rd1', adminInitSecret: 'wrongsecret' },
    };
    const res = makeRes();
    await setupAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('returns 409 when admin already exists', async () => {
    User.exists = jest.fn().mockResolvedValue({ _id: 'existing_admin' });
    const req = {
      body: { name: 'Admin', username: 'admin', email: 'admin@test.com', password: 'P@ssw0rd1', adminInitSecret: 'test_admin_init_secret_16' },
    };
    const res = makeRes();
    await setupAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('returns 201 on valid setup with correct secret', async () => {
    const req = {
      body: { name: 'Admin', username: 'admin', email: 'admin@test.com', password: 'P@ssw0rd1', adminInitSecret: 'test_admin_init_secret_16' },
    };
    const res = makeRes();
    await setupAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('returns 503 when ADMIN_INIT_SECRET is not configured', async () => {
    delete process.env.ADMIN_INIT_SECRET;
    const req = {
      body: { name: 'Admin', username: 'admin', email: 'admin@test.com', password: 'P@ssw0rd1', adminInitSecret: 'anything' },
    };
    const res = makeRes();
    await setupAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
    // Restore
    process.env.ADMIN_INIT_SECRET = 'test_admin_init_secret_16';
  });

});
