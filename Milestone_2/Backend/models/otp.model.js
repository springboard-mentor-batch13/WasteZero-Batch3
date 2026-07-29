// Backend/models/otp.model.js
//
// Standalone OTP collection — decoupled from the User document.
// MongoDB TTL index automatically removes documents after 10 minutes (600s),
// eliminating the need for manual OTP cleanup and preventing stale tokens.
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
      // TTL index: MongoDB deletes this document 600 seconds after createdAt.
      // This enforces the 10-minute OTP window at the database layer,
      // independent of application-level expiry checks.
      expires: 600,
    },
  },
  {
    // Disable Mongoose's automatic timestamps — createdAt is defined
    // manually above so we can attach the TTL index directly to it.
    timestamps: false,
  }
);

// Compound index: ensures only one active OTP per (email, purpose) pair.
// Replaces any existing OTP for the same purpose when a new one is issued,
// preventing accumulation of multiple valid OTPs for the same action.
OtpSchema.index({ email: 1, purpose: 1 }, { unique: true });

module.exports = mongoose.model('Otp', OtpSchema);
