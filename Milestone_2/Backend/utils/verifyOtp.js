// Backend/utils/verifyOtp.js
//
// Verifies an OTP by querying the dedicated Otp collection:
//   1. Find an OTP document matching (email, purpose)
//   2. If not found → expired or never issued (TTL already deleted it)
//   3. Bcrypt-compare the submitted plaintext OTP against the stored hash
//   4. On success, delete the document immediately to prevent replay attacks
//
// Returns { success: true, payload } on success, or { success: false, message } on failure.
// 'payload' carries any pending registration data stored during atomic registration.

const bcrypt = require('bcryptjs');
const OtpModel = require('../models/otp.model');

/**
 * @param {string} email   - The user's email
 * @param {string} otp     - The plaintext OTP submitted by the user
 * @param {string} purpose - 'verify' | 'forgot-password' | 'change-password'
 * @returns {Promise<{ success: boolean, message?: string, payload?: any }>}
 */
const verifyOtp = async (email, otp, purpose) => {
  const otpDoc = await OtpModel.findOne({
    email: email.trim().toLowerCase(),
    purpose,
  });

  // Document not found → OTP was never issued, already used, or TTL-expired
  if (!otpDoc) {
    return {
      success: false,
      message: 'OTP not found or has expired. Please request a new one.',
    };
  }

  // Bcrypt comparison — safe against timing attacks
  const valid = await bcrypt.compare(String(otp), otpDoc.otp);

  if (!valid) {
    return {
      success: false,
      message: 'Invalid OTP.',
    };
  }

  // Capture payload BEFORE deletion (atomic registration flow)
  const payload = otpDoc.payload ?? null;

  // Delete immediately after successful verification to prevent token replay
  await OtpModel.deleteOne({ _id: otpDoc._id });

  return { success: true, payload };
};

module.exports = verifyOtp;