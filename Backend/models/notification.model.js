// Backend/models/notification.model.js


const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    type: {
      type: String,
      enum: {
        values: ['message', 'opportunity_match', 'pickup_match'],
        message: '{VALUE} is not a valid notification type',
      },
      required: true,
    },

    // Stores AES-256-GCM ciphertext (hex-encoded). Plaintext is never persisted.
    message: {
      type: String,
      required: [true, 'Notification message is required'],
    },

    // Initialization Vector (hex) — required for AES-256-GCM decryption.
    iv: {
      type: String,
      required: true,
    },

    // Authentication Tag (hex) — required for AES-256-GCM decryption.
    authTag: {
      type: String,
      required: true,
    },

    reference_id: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// ── MongoDB Indexes ────────────────────────────────────────────────────
// Compound index driving badge counts and unread notification feeds.
// Leading field (user_id) satisfies queries filtering on user_id alone.
notificationSchema.index({ user_id: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);