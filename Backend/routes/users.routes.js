// Backend\routes\users.routes.js

const express = require("express");

const router = express.Router();

const { otpLimiter, generalLimiter } = require("../middlewares/rateLimiter.middleware");

const {
  getUserProfile,
  updateUserProfile,
  getUserSettings,
  updateUserSettings,
  getAdminContact,
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
   User Search — Global User Discovery
============================================ */

// All authenticated users can search for other users across all roles (Volunteer, NGO, Admin)
router.get(
  "/search",
  protect,
  authorize("volunteer", "ngo", "admin"),
  searchUsers
);

// Platform Admin Contact for Support & Messaging (Volunteer, NGO, Admin)
router.get(
  "/admin-contact",
  protect,
  authorize("volunteer", "ngo", "admin"),
  getAdminContact
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
   User Settings Routes
============================================ */

router.get(
  "/settings",
  protect,
  authorize("volunteer", "ngo", "admin"),
  getUserSettings
);

router.put(
  "/settings",
  protect,
  authorize("volunteer", "ngo", "admin"),
  generalLimiter,
  updateUserSettings
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