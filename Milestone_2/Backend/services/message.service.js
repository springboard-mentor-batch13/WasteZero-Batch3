// Backend/services/message.service.js

const Message = require('../models/message.model');
const User = require('../models/users.model');

/**
 * @internal
 * Build the deterministic conversation_id for a pair of user ids.
 * Sorting guarantees (A, B) and (B, A) always resolve to the same thread.
 */
const buildConversationId = (idA, idB) => [String(idA), String(idB)].sort().join('_');

/**
 * Create a new message.
 * Enforces strict Volunteer <-> NGO communication role pairing.
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

  // 3. Create Message
  return Message.create({
    sender_id,
    receiver_id,
    content,
    conversation_id: buildConversationId(sender_id, receiver_id),
  });
};

/**
 * Get one conversation's history, paginated, newest first.
 * Uses .lean() — read-only list, no document methods needed.
 */
const getConversationHistory = (conversationId, skip, limit) => {
  return Message.find({ conversation_id: conversationId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

/**
 * Mark every unread message in a conversation as read, scoped to messages
 * where the given user was the receiver.
 */
const markConversationRead = (conversationId, readerId) => {
  return Message.updateMany(
    {
      conversation_id: conversationId,
      receiver_id: readerId,
      status: { $ne: 'read' },
    },
    { $set: { status: 'read' } }
  );
};

/**
 * List the most recent message per conversation the user is part of.
 */
const listConversationsForUser = (userId) => {
  return Message.aggregate([
    { $match: { $or: [{ sender_id: userId }, { receiver_id: userId }] } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$conversation_id', lastMessage: { $first: '$$ROOT' } } },
    { $sort: { 'lastMessage.createdAt': -1 } },
  ]);
};

module.exports = {
  buildConversationId,
  createMessage,
  getConversationHistory,
  markConversationRead,
  listConversationsForUser,
};