// Backend/models/otp.model.js
//


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
