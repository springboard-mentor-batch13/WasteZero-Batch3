// Backend/services/message.service.js

const mongoose = require('mongoose');
const Message = require('../models/message.model');
const User = require('../models/users.model');
const { encrypt, decrypt } = require('../utils/crypto');

/**
 * @internal
 * Build the deterministic conversation_id for a pair of user ids.
 * Sorting guarantees (A, B) and (B, A) always resolve to the same thread.
 */
const buildConversationId = (idA, idB) => [String(idA), String(idB)].sort().join('_');

/**
 * Create a new message.
 * Enforces strict Volunteer <-> NGO communication role pairing.
 * Encrypts content with AES-256-GCM before persisting to MongoDB.
 * Returns an object with decrypted (plaintext) content so callers and
 * socket events always receive human-readable text — never ciphertext.
 */
const createMessage = async ({ sender_id, sender_role, receiver_id, content }) => {
  // 1. Fetch receiver to check existence and role
  const receiver = await User.findById(receiver_id).select('role').lean();

  if (!receiver) {
    throw new Error('Recipient user does not exist');
  }

  // 2. Strict Role Check: Must be Volunteer <-> NGO only
  const isVolunteerToNgo = sender_role === 'volunteer' && receiver.role === 'ngo';
  const isNgoToVolunteer = sender_role === 'ngo' && receiver.role === 'volunteer';

  if (!isVolunteerToNgo && !isNgoToVolunteer) {
    throw new Error('Messaging is only allowed between Volunteers and NGOs');
  }

  // 3. Encrypt plaintext before saving — MongoDB stores only ciphertext.
  const { encryptedData, iv, authTag } = encrypt(content);

  // 4. Create Message document with ciphertext
  const messageDoc = await Message.create({
    sender_id,
    receiver_id,
    content: encryptedData,
    iv,
    authTag,
    conversation_id: buildConversationId(sender_id, receiver_id),
  });

  // 5. Return plaintext content in-memory — strip iv/authTag so crypto
  //    internals are never exposed to socket event handlers or REST callers.
  const rawObj = messageDoc.toObject();
  return {
    ...rawObj,
    content,       // original plaintext
    iv: undefined,
    authTag: undefined,
  };
};

/**
 * Get one conversation's history, paginated, newest first.
 * Decrypts each message before returning — callers always receive plaintext.
 */
const getConversationHistory = async (conversationId, skip, limit) => {
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
    } catch {
      return {
        ...msg,
        content: '[Message Decryption Failed]',
        iv: undefined,
        authTag: undefined,
      };
    }
  });
};

/**
 * Mark every unread message in a conversation as read, scoped to messages
 * where the given user was the receiver.
 * Also records the readAt timestamp.
 */
const markConversationRead = (conversationId, readerId) => {
  return Message.updateMany(
    {
      conversation_id: conversationId,
      receiver_id: new mongoose.Types.ObjectId(readerId),
      status: { $ne: 'read' },
    },
    {
      $set: {
        status: 'read',
        readAt: new Date(),
      },
    }
  );
};

/**
 * List the most recent message per conversation the user is part of.
 * Decrypts lastMessage.content before returning.
 * NOTE: aggregate() does not apply Mongoose's automatic string->ObjectId
 * casting the way find() does, so userId must be cast explicitly here —
 * passing the raw string would silently match zero documents.
 */
const listConversationsForUser = async (userId) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const conversations = await Message.aggregate([
    { $match: { $or: [{ sender_id: userObjectId }, { receiver_id: userObjectId }] } },
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
      } catch {
        item.lastMessage.content = '[Encrypted Message]';
      }
      delete item.lastMessage.iv;
      delete item.lastMessage.authTag;
    }
    return item;
  });
};

// ── Developer 2 spec — REST-facing function names ──────────────────────
// Thin, purpose-named wrappers over the primitives above, so the REST
// controller layer can depend on the exact names/signatures from the spec
// without duplicating logic (and without disturbing the existing
// socket-layer calls to createMessage / markConversationRead above).

/**
 * Save a new message from senderId to receiverId. Looks up the sender's
 * role (required by createMessage's Volunteer<->NGO pairing rule) so REST
 * callers only need to pass plain ids + content, matching the spec's
 * saveMessage(senderId, receiverId, content) signature.
 */
const saveMessage = async (senderId, receiverId, content) => {
  const sender = await User.findById(senderId).select('role').lean();

  if (!sender) {
    throw new Error('Sender does not exist');
  }

  return createMessage({
    sender_id: senderId,
    sender_role: sender.role,
    receiver_id: receiverId,
    content,
  });
};

/**
 * WhatsApp-style conversation list: the latest message with every distinct
 * person the user has messaged, each annotated with the other person's
 * basic profile info. LastMessage content is already decrypted by
 * listConversationsForUser().
 */
const getConversationsForUser = async (userId) => {
  const conversations = await listConversationsForUser(userId);

  if (conversations.length === 0) return [];

  const otherUserId = (lastMessage) =>
    String(lastMessage.sender_id) === String(userId)
      ? lastMessage.receiver_id
      : lastMessage.sender_id;

  const otherUserIds = conversations.map((c) => otherUserId(c.lastMessage));

  const otherUsers = await User.find({ _id: { $in: otherUserIds } })
    .select('name email role')
    .lean();
  const otherUserById = new Map(otherUsers.map((u) => [String(u._id), u]));

  return conversations.map((c) => ({
    conversationId: c._id,
    otherUser: otherUserById.get(String(otherUserId(c.lastMessage))) || null,
    lastMessage: c.lastMessage,
  }));
};

/**
 * Full message history between two specific users, oldest first.
 * Decrypts each message's content before returning.
 */
const getMessagesBetween = async (userId1, userId2) => {
  const conversationId = buildConversationId(userId1, userId2);
  const messages = await Message.find({ conversation_id: conversationId })
    .sort({ createdAt: 1 })
    .lean();

  return messages.map((msg) => {
    try {
      return {
        ...msg,
        content: decrypt(msg.content, msg.iv, msg.authTag),
        iv: undefined,
        authTag: undefined,
      };
    } catch {
      return {
        ...msg,
        content: '[Message Decryption Failed]',
        iv: undefined,
        authTag: undefined,
      };
    }
  });
};

/**
 * Mark a single message (by id) as read. Distinct from
 * markConversationRead above, which bulk-marks an entire thread — this is
 * the single-message primitive called out in the spec.
 */
const markAsRead = (messageId) => {
  return Message.findByIdAndUpdate(
    messageId,
    { $set: { status: 'read', readAt: new Date() } },
    { new: true }
  );
};

module.exports = {
  buildConversationId,
  createMessage,
  getConversationHistory,
  markConversationRead,
  listConversationsForUser,
  saveMessage,
  getConversationsForUser,
  getMessagesBetween,
  markAsRead,
};