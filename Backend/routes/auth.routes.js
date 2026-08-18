// Backend/routes/auth.routes.js

const express = require('express');

const router = express.Router();

const {
  loginLimiter,
  otpLimiter,
} = require('../middlewares/rateLimiter.middleware');

const {
  registerValidation,
  loginValidation,
  verifyOtpValidation,
  resendOtpValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  validate,
} = require('../validations/auth.validation');

const {
  registerUser,
  setupAdmin,
  loginUser,
  verifyUserOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
} = require('../controllers/auth.controllers');

// Register (volunteer / ngo only — admin removed per P0-04)
router.post(
  '/register',
  otpLimiter,
  registerValidation,
  validate,
  registerUser
);

// P0-04: First-admin initialization endpoint.
// Requires ADMIN_INIT_SECRET. Refuses if any admin exists.
// Rate-limited by otpLimiter (10 req / 10 min) — brute-forcing the secret is prevented.
router.post(
  '/admin/setup',
  otpLimiter,
  setupAdmin
);

// Login
router.post(
  '/login',
  loginLimiter,
  loginValidation,
  validate,
  loginUser
);

// OTP Verification
router.post(
  '/verify-otp',
  otpLimiter,
  verifyOtpValidation,
  validate,
  verifyUserOtp
);

// Resend OTP
router.post(
  '/resend-otp',
  otpLimiter,
  resendOtpValidation,
  validate,
  resendOtp
);

// Forgot Password
router.post(
  '/forgot-password',
  otpLimiter,
  forgotPasswordValidation,
  validate,
  forgotPassword
);

// Reset Password
router.post(
  '/reset-password',
  otpLimiter,
  resetPasswordValidation,
  validate,
  resetPassword
);

module.exports = router;