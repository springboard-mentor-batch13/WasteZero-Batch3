const mongoose = require('mongoose');
const { Schema } = mongoose;

const messageSchema = new Schema(
  {
    // Deterministic ID for a 1:1 thread: sort(sender_id, receiver_id).join('_')
    conversation_id: {
      type: String,
      required: true,
    },
    sender_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiver_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Content holds AES-256-GCM ciphertext (hex encoded)
    content: {
      type: String,
      required: true,
    },
    // Initialization Vector (hex)
    iv: {
      type: String,
      required: true,
    },
    // Authentication Tag (hex)
    authTag: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
    },
    readAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Compound indexes
messageSchema.index({ conversation_id: 1, createdAt: -1 });
messageSchema.index({ sender_id: 1, createdAt: -1 });
messageSchema.index({ receiver_id: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);