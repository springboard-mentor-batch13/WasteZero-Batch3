// Backend/utils/verifyOtp.js


const bcrypt = require('bcryptjs');
const OtpModel = require('../models/otp.model');

// Max wrong guesses allowed against a single issued code before it's
// invalidated outright, forcing the user to request a fresh one.
const MAX_OTP_ATTEMPTS = 5;

/**
 * @param {string} email   - The user's email
 * @param {string} otp     - The plaintext OTP submitted by the user
 * @param {string} purpose - 'verify' | 'forgot-password' | 'change-password'
 * @returns {Promise<{ success: boolean, message?: string, payload?: any }>}
 */
const verifyOtp = async (email, otp, purpose) => {
  if (!email || !otp || !purpose) {
    return {
      success: false,
      message: 'Email, OTP, and purpose are required.',
    };
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const cleanOtp = String(otp).trim();

  const otpDoc = await OtpModel.findOne({
    email: normalizedEmail,
    purpose,
  });

  // Document not found → OTP was never issued, already used, or TTL-expired
  if (!otpDoc) {
    return {
      success: false,
      message: 'OTP not found or has expired. Please request a new one.',
    };
  }

  // Check explicit expiration timestamp
  if (otpDoc.otpExpiresAt && new Date(otpDoc.otpExpiresAt).getTime() < Date.now()) {
    return {
      success: false,
      message: 'OTP not found or has expired. Please request a new one.',
    };
  }

  // Brute-force lockout: this code has already taken too many wrong
  // guesses. Delete it outright rather than leaving it guessable for the
  // rest of its validity window.
  if (otpDoc.attempts >= MAX_OTP_ATTEMPTS) {
    await OtpModel.deleteOne({ _id: otpDoc._id });
    return {
      success: false,
      message: 'Too many incorrect attempts. Please request a new OTP.',
    };
  }

  // Bcrypt comparison — safe against timing attacks
  const valid = await bcrypt.compare(cleanOtp, otpDoc.otp);

  if (!valid) {
    // Record the failed attempt. $inc is atomic, so concurrent wrong
    // guesses against the same code can't undercount each other.
    await OtpModel.updateOne({ _id: otpDoc._id }, { $inc: { attempts: 1 } });
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