const mongoose = require('mongoose');
const Message = require('../models/message.model');
const { encrypt, decrypt } = require('../utils/crypto');

// Encrypt plaintext message before saving to MongoDB
const createMessage = async ({ conversation_id, sender_id, receiver_id, content }) => {
  const { encryptedData, iv, authTag } = encrypt(content);

  const messageDoc = await Message.create({
    conversation_id,
    sender_id,
    receiver_id,
    content: encryptedData,
    iv,
    authTag,
  });

  const rawObj = messageDoc.toObject();

  // Return original plaintext in-memory so socket emission receives normal text
  return {
    ...rawObj,
    content: content,
    iv: undefined,      // Do not leak IV to client
    authTag: undefined, // Do not leak AuthTag to client
  };
};

// Fetch conversation history and decrypt messages
const getConversationHistory = async (conversationId, { skip, limit }) => {
  const messages = await Message.find({ conversation_id: conversationId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return messages.map((msg) => {
    try {
      return {
        ...msg,
        content: decrypt(msg.content, msg.iv, msg.authTag),
        iv: undefined,
        authTag: undefined,
      };
    } catch (err) {
      return {
        ...msg,
        content: '[Message Decryption Failed]',
        iv: undefined,
        authTag: undefined,
      };
    }
  });
};

const markConversationRead = async (conversationId, readerId) => {
  return Message.updateMany(
    {
      conversation_id: conversationId,
      receiver_id: new mongoose.Types.ObjectId(readerId),
      status: { $ne: "read" },
    },
    {
      $set: {
        status: "read",
        readAt: new Date(),
      },
    }
  );
};
// List conversations with decrypted lastMessage preview
const listConversationsForUser = async (userId) => {
  // userId arrives as a String from socket.user.id (socket.middleware.js casts
  // user._id to string). Aggregation pipelines do NOT auto-cast — we must
  // explicitly convert to ObjectId so $match finds documents in MongoDB.
  const oid = new mongoose.Types.ObjectId(userId);
  const conversations = await Message.aggregate([
    { $match: { $or: [{ sender_id: oid }, { receiver_id: oid }] } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$conversation_id', lastMessage: { $first: '$$ROOT' } } },
    { $sort: { 'lastMessage.createdAt': -1 } },
  ]);

  return conversations.map((item) => {
    if (item.lastMessage) {
      try {
        item.lastMessage.content = decrypt(
          item.lastMessage.content,
          item.lastMessage.iv,
          item.lastMessage.authTag
        );
      } catch (err) {
        item.lastMessage.content = '[Encrypted Message]';
      }
      delete item.lastMessage.iv;
      delete item.lastMessage.authTag;
    }
    return item;
  });
};

module.exports = {
  createMessage,
  getConversationHistory,
  markConversationRead,
  listConversationsForUser,
};