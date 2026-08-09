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

    
    otpExpiresAt: {
      type: Date,
      required: true,
    },
    
    attempts: {
      type: Number,
      default: 0,
    },

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


OtpSchema.index({ email: 1, purpose: 1 }, { unique: true });

module.exports = mongoose.model('Otp', OtpSchema);
