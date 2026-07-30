// Backend/models/message.model.js
//
// Real-time direct message between two users.
// Uses sender_id / receiver_id references and a deterministic conversation_id.
//
// ENCRYPTION NOTE (Milestone 3 integration):
// The `content` field stores AES-256-GCM hex-encoded ciphertext — never
// plaintext. The `iv` and `authTag` fields hold the corresponding crypto
// components needed to decrypt it. Plaintext is reconstructed in-memory
// inside message.service.js before being returned to callers/clients.

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

    // Deterministic thread identifier: sort([idA, idB]).join('_')
    conversation_id: {
      type: String,
      required: true,
    },

    // Stores AES-256-GCM hex-encoded ciphertext — NOT plaintext.
    // Length/format validators are intentionally omitted because ciphertext
    // length depends on key size, not the original message length, and
    // the hex encoding would always fail a human-text minlength check.
    content: {
      type: String,
      required: [true, 'Message content is required'],
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

    status: {
      type: String,
      enum: {
        values: ['sent', 'delivered', 'read'],
        message: '{VALUE} is not a valid message status',
      },
      default: 'sent',
    },

    // Timestamp set when the receiver marks the message as read.
    readAt: {
      type: Date,
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

// Additional indexes to support sender/receiver-scoped queries.
messageSchema.index({ sender_id: 1, createdAt: -1 });
messageSchema.index({ receiver_id: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);