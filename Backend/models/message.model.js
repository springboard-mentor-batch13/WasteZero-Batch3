// Backend/models/message.model.js
//
// Real-time direct message between two users.
// Uses sender_id / receiver_id references and a deterministic conversation_id.

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    sender_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    receiver_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Deterministic thread identifier: min(A,B)_max(A,B)
    conversation_id: {
      type: String,
      required: true,
    },

    content: {
      type: String,
      required: [true, 'Message content is required'],
      trim: true,
      minlength: [1, 'Message content cannot be empty'],
      maxlength: [2000, 'Message content cannot exceed 2000 characters'],
    },

    status: {
      type: String,
      enum: {
        values: ['sent', 'delivered', 'read'],
        message: '{VALUE} is not a valid message status',
      },
      default: 'sent',
    },
  },
  {
    timestamps: true,
  }
);

// ── MongoDB Indexes ────────────────────────────────────────────────────

// Compound index: fetch one conversation's history, newest first, paginated.
// Leading field (conversation_id) covers all conversation history queries.
messageSchema.index({ conversation_id: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);