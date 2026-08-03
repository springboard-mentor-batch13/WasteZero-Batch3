// Backend/models/notification.model.js
//
// In-app notification record. Alerts a user about a new
// message, a new opportunity match, or a new pickup match.
//
// ENCRYPTION NOTE (Milestone 3 integration):
// The `message` field stores AES-256-GCM hex-encoded ciphertext — never
// plaintext. The `iv` and `authTag` fields hold the corresponding crypto
// components. Plaintext is reconstructed in-memory inside
// notification.service.js before being returned to callers/clients.
//
// `reference_id` is Mixed (not ObjectId) because message-type notifications
// use deterministic string conversation IDs (e.g. "abc123_def456") which
// cannot be cast to ObjectId. opportunity_match and pickup_match types still
// pass real ObjectIds at runtime — Mixed accepts both without issue.

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

    // Polymorphic reference: String conversation_id for 'message' type,
    // or a MongoDB ObjectId for 'opportunity_match' / 'pickup_match' types.
    // Must be Mixed — not ObjectId — because deterministic conversation IDs
    // (e.g. "abc123_def456") are Strings and cannot be cast to ObjectId.
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