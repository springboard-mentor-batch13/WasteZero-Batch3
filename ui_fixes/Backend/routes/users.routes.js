const express = require("express");

const router = express.Router();

const { otpLimiter } = require("../middlewares/rateLimiter.middleware");

const {
  getUserProfile,
  updateUserProfile,
  sendChangePasswordOtp,
  changePasswordWithOtp,
} = require("../controllers/users.controllers");

const { protect } = require("../middlewares/auth.middleware");

console.log(protect);
console.log(getUserProfile);
console.log(updateUserProfile);

// Import validation middleware
const {
  updateProfileValidation,
  validate,
} = require("../validations/user.validation");

/* ============================================
   User Profile Routes
============================================ */

// Get Logged-in User Profile
router.get("/profile", protect, getUserProfile);

// Update Logged-in User Profile
router.put(
  "/profile",
  protect,
  updateProfileValidation,
  validate,
  updateUserProfile
);

/* ============================================
   Change Password with OTP
============================================ */

// Send OTP to registered email
router.post(
  "/change-password/send-otp",
  protect,
  otpLimiter,
  sendChangePasswordOtp
);

// Verify OTP and change password
router.put(
  "/change-password/verify-otp",
  protect,
  otpLimiter,
  changePasswordWithOtp
);

module.exports = router;