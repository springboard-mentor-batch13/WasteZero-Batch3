// Backend\routes\users.routes.js

const express = require("express");

const router = express.Router();

const { otpLimiter, generalLimiter } = require("../middlewares/rateLimiter.middleware");

const {
  getUserProfile,
  updateUserProfile,
  sendChangePasswordOtp,
  changePasswordWithOtp,
  searchUsers,
} = require("../controllers/users.controllers");

// Import BOTH protect and authorize
const {
  protect,
  authorize,
} = require("../middlewares/auth.middleware");

// Validation
const {
  updateProfileValidation,
  changePasswordOtpValidation,
  validate,
} = require("../validations/user.validation");

/* ============================================
   User Search — Volunteer ↔ NGO pairing only
============================================ */

// Volunteer → search NGOs. NGO → search Volunteers. Admin excluded.
router.get(
  "/search",
  protect,
  authorize("volunteer", "ngo"),
  searchUsers
);

/* ============================================
   User Profile Routes
============================================ */

// All logged-in users
router.get(
  "/profile",
  protect,
  authorize("volunteer", "ngo", "admin"),
  getUserProfile
);

// All logged-in users
router.put(
  "/profile",
  protect,
  authorize("volunteer", "ngo", "admin"),
  generalLimiter,
  updateProfileValidation,
  validate,
  updateUserProfile
);

/* ============================================
   Change Password
============================================ */

// All logged-in users
router.post(
  "/change-password/send-otp",
  protect,
  authorize("volunteer", "ngo", "admin"),
  otpLimiter,
  sendChangePasswordOtp
);

router.put(
  "/change-password/verify-otp",
  protect,
  authorize("volunteer", "ngo", "admin"),
  otpLimiter,
  changePasswordOtpValidation,
  validate,
  changePasswordWithOtp
);

module.exports = router;