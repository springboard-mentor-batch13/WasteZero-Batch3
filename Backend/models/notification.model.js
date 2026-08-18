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
        values: ['message', 'opportunity_match', 'pickup_match', 'pickup_missed', 'pickup_cancelled'],
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

    
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);


notificationSchema.index({ user_id: 1, isRead: 1, createdAt: -1 });


notificationSchema.index(
  { user_id: 1, isRead: 1, readAt: 1 },
  { sparse: true, name: 'notification_cleanup_idx' }
);

module.exports = mongoose.model('Notification', notificationSchema);