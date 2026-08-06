// Backend\routes\auth.routes.js

const express = require("express");

const router = express.Router();

const {
  loginLimiter,
  otpLimiter,
} = require("../middlewares/rateLimiter.middleware");

const {
  registerValidation,
  loginValidation,
  validate,
} = require("../validations/auth.validation");

const {
  registerUser,
  loginUser,
  verifyUserOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
} = require("../controllers/auth.controllers");

// Register
router.post(
  "/register",
  otpLimiter,
  registerValidation,
  validate,
  registerUser
);

// Login
router.post(
  "/login",
  loginLimiter,
  loginValidation,
  validate,
  loginUser
);

// OTP Verification
router.post(
  "/verify-otp",
  otpLimiter,
  verifyUserOtp
);

// Resend OTP
router.post(
  "/resend-otp",
  otpLimiter,
  resendOtp
);

// Forgot Password
router.post(
  "/forgot-password",
  otpLimiter,
  forgotPassword
);

// Reset Password
router.post(
  "/reset-password",
  otpLimiter,
  resetPassword
);

module.exports = router;