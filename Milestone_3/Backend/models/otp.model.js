// Backend/models/otp.model.js
//
// Standalone OTP collection — decoupled from the User document.
//
// Two separate expiry concepts live on this document:
//   - otpExpiresAt: the security-critical 10-minute window during which the
//     6-digit code itself is valid. Checked at the application level
//     (see utils/verifyOtp.js) — NOT tied to document deletion, so the
//     code's validity window can't be widened by anything below.
//   - expireAt: when MongoDB's TTL index actually deletes the document.
//     For 'verify' OTPs carrying a pending-registration payload, this is
//     set further out (see utils/issueOtp.js) so the payload survives past
//     a single 10-minute code window — otherwise resendOtp() finds nothing
//     once the code expires, silently discarding the user's in-progress
//     registration. For all other purposes it matches the OTP's own
//     expiry, so those documents are still cleaned up promptly.
//
// 'payload' stores temporary registration data before the user record is
// created (atomic registration flow: User is only created on OTP success).

const mongoose = require('mongoose');

const OtpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,           // Fast lookup by email on every verify request
    },

    otp: {
      type: String,
      required: true,        // Bcrypt-hashed OTP value
    },

    purpose: {
      type: String,
      required: true,
      enum: ['verify', 'forgot-password', 'change-password'],
    },

    // Holds the pending user registration payload for the atomic
    // registration flow.  Null for all other OTP purposes.
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },

    // The 10-minute code-validity deadline, checked in application code
    // (utils/verifyOtp.js). This is the actual security boundary for the
    // OTP itself, independent of how long the document sticks around.
    otpExpiresAt: {
      type: Date,
      required: true,
    },

    // Number of failed verification attempts against the CURRENT code.
    // Reset to 0 every time a fresh OTP is issued. Once this hits
    // MAX_OTP_ATTEMPTS (utils/verifyOtp.js), the document is invalidated so
    // guessing can't continue for the rest of the code's validity window —
    // otherwise IP-based rate limiting is the only brute-force defense, and
    // that resets for an attacker who simply switches IPs.
    attempts: {
      type: Number,
      default: 0,
    },

    // TTL index target: MongoDB deletes this document once the current
    // time passes this value (expireAfterSeconds: 0 below means "expire
    // exactly at this timestamp", not N seconds after it).
    expireAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    // Disable Mongoose's automatic timestamps — createdAt is defined
    // manually above.
    timestamps: false,
  }
);

// Compound index: ensures only one active OTP per (email, purpose) pair.
// Replaces any existing OTP for the same purpose when a new one is issued,
// preventing accumulation of multiple valid OTPs for the same action.
OtpSchema.index({ email: 1, purpose: 1 }, { unique: true });

module.exports = mongoose.model('Otp', OtpSchema);
