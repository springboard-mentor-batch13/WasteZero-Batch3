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
const OtpModel = require('../models/otp.model');
const issueOtp = require('../utils/issueOtp');
const verifyOtp = require('../utils/verifyOtp');
const generateToken = require('../utils/generateToken');
const passwordValidator = require('../utils/passwordValidator');
const {
  registerUser,
  loginUser,
  setupAdmin,
  verifyUserOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
} = require('../controllers/auth.controllers');

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

// ── verifyUserOtp ────────────────────────────────────────────────────────────

describe('verifyUserOtp', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when email or otp is missing', async () => {
    const req = { body: { email: '', otp: '' } };
    const res = makeRes();
    await verifyUserOtp(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/required/i) }));
  });

  test('returns 400 when verifyOtp returns failure (invalid / expired)', async () => {
    verifyOtp.mockResolvedValue({ success: false, message: 'Invalid OTP.' });
    const req = { body: { email: 'user@test.com', otp: '000000' } };
    const res = makeRes();
    await verifyUserOtp(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: 'Invalid OTP.' }));
  });

  test('returns 200 if user is already verified and exists', async () => {
    verifyOtp.mockResolvedValue({ success: true, payload: { email: 'user@test.com' } });
    User.findOne = mockFindOneReturning({ _id: 'existing_user', email: 'user@test.com' });
    const req = { body: { email: 'user@test.com', otp: '123456' } };
    const res = makeRes();
    await verifyUserOtp(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, message: expect.stringMatching(/already verified/i) }));
  });

  test('creates new user and returns 200 on valid verification', async () => {
    verifyOtp.mockResolvedValue({
      success: true,
      payload: {
        name: 'Test User',
        username: 'testuser',
        email: 'user@test.com',
        password: 'hashed_password',
        role: 'volunteer',
      },
    });
    User.findOne = mockFindOneReturning(null);
    const mockSave = jest.fn().mockResolvedValue(true);
    User.mockImplementation(function (data) {
      Object.assign(this, data);
      this.$locals = {};
      this.save = mockSave;
    });

    const req = { body: { email: 'user@test.com', otp: '123456' } };
    const res = makeRes();
    await verifyUserOtp(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, message: expect.stringMatching(/verified successfully/i) }));
    expect(mockSave).toHaveBeenCalled();
  });

});

// ── resendOtp ────────────────────────────────────────────────────────────────

describe('resendOtp', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when email is missing', async () => {
    const req = { body: {} };
    const res = makeRes();
    await resendOtp(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 200 generic message even if otp document not found', async () => {
    OtpModel.findOne = jest.fn().mockResolvedValue(null);
    const req = { body: { email: 'unknown@test.com' } };
    const res = makeRes();
    await resendOtp(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('re-issues otp and returns 200 when pending otp exists', async () => {
    OtpModel.findOne = jest.fn().mockResolvedValue({
      email: 'pending@test.com',
      purpose: 'verify',
      payload: { name: 'Pending' },
    });
    issueOtp.mockResolvedValue();
    const req = { body: { email: 'pending@test.com' } };
    const res = makeRes();
    await resendOtp(req, res);
    expect(issueOtp).toHaveBeenCalledWith('pending@test.com', 'verify', { name: 'Pending' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

});

// ── forgotPassword & resetPassword ───────────────────────────────────────────

describe('forgotPassword & resetPassword', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    passwordValidator.mockReturnValue(true);
  });

  test('forgotPassword returns 200 generic message', async () => {
    User.findOne = mockFindOneReturning({ email: 'user@test.com', isVerified: true });
    issueOtp.mockResolvedValue();
    const req = { body: { email: 'user@test.com' } };
    const res = makeRes();
    await forgotPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(issueOtp).toHaveBeenCalledWith('user@test.com', 'forgot-password');
  });

  test('resetPassword returns 400 when verifyOtp fails', async () => {
    verifyOtp.mockResolvedValue({ success: false, message: 'Invalid OTP.' });
    const req = { body: { email: 'user@test.com', otp: '123456', newPassword: 'NewP@ssw0rd1' } };
    const res = makeRes();
    await resetPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid OTP.' }));
  });

  test('resetPassword returns 200 on successful reset', async () => {
    verifyOtp.mockResolvedValue({ success: true });
    const mockUser = {
      email: 'user@test.com',
      password: 'old_hash',
      matchPassword: jest.fn().mockResolvedValue(false),
      save: jest.fn().mockResolvedValue(true),
    };
    User.findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });
    const req = { body: { email: 'user@test.com', otp: '123456', newPassword: 'NewP@ssw0rd1' } };
    const res = makeRes();
    await resetPassword(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, message: expect.stringMatching(/reset successful/i) }));
  });

});
