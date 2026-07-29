// Backend/models/notification.model.js
//
// In-app notification record. Alerts a user about a new
// message or a new opportunity match.

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
        values: ['message', 'opportunity_match'],
        message: '{VALUE} is not a valid notification type',
      },
      required: true,
    },

    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
      maxlength: [300, 'Notification message cannot exceed 300 characters'],
    },

    reference_id: {
      type: mongoose.Schema.Types.ObjectId,
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