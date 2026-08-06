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

    // Timestamp recorded when isRead transitions false → true.
    // Used as the base for the 24-hour expiry window — a notification is
    // eligible for deletion only when BOTH isRead=true AND readAt+24h has
    // passed. Null on unread notifications. Unread notifications are never
    // eligible for expiry deletion under any circumstance.
    readAt: {
      type: Date,
      default: null,
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

// Sparse index for the hourly cleanup job: efficiently finds all read
// notifications where readAt+24h has elapsed. Sparse because readAt is
// null for unread notifications — those documents are excluded from this
// index entirely, so they can never be touched by a query on readAt.
notificationSchema.index(
  { user_id: 1, isRead: 1, readAt: 1 },
  { sparse: true, name: 'notification_cleanup_idx' }
);

module.exports = mongoose.model('Notification', notificationSchema);