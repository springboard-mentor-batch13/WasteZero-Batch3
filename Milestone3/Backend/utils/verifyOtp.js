// Backend/utils/verifyOtp.js
//
// Verifies an OTP by querying the dedicated Otp collection:
//   1. Find an OTP document matching (email, purpose)
//   2. If not found → expired or never issued (TTL already deleted it)
//   3. Reject if the code's own 10-minute window has passed
//   4. Reject if too many wrong guesses have already been made against
//      this code (brute-force lockout, independent of IP-based rate
//      limiting — an attacker who rotates IPs would otherwise get
//      unlimited guesses against the same code for its whole lifetime)
//   5. Bcrypt-compare the submitted plaintext OTP against the stored hash
//   6. On success, delete the document immediately to prevent replay attacks
//
// Returns { success: true, payload } on success, or { success: false, message } on failure.
// 'payload' carries any pending registration data stored during atomic registration.

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

  // The document may still exist past the code's own 10-minute validity
  // window (pending-registration payloads are retained longer — see
  // models/otp.model.js), so the code's expiry must be checked explicitly
  // here rather than relying on the document simply being gone.
  if (otpDoc.otpExpiresAt && otpDoc.otpExpiresAt.getTime() < Date.now()) {
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
  const valid = await bcrypt.compare(String(otp), otpDoc.otp);

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