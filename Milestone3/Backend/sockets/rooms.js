// Backend/sockets/rooms.js

const getUserRoom = (userId) => `user:${userId}`;

/**
 * Returns the room name for a specific conversation channel.
 * Not currently used for active subscriptions (sockets don't join conversation
 * rooms), but provided here for future use and for symmetry with getUserRoom.
 */
const getConversationRoom = (conversationId) => `conversation:${conversationId}`;

/**
 * Generates a deterministic, consistent conversation ID from two user IDs
 * regardless of who initiated the conversation (e.g. userA + userB == userB + userA).
 * This is the single source of truth for conversation ID generation —
 * message.service.js now imports from here rather than maintaining its own copy.
 */
const buildConversationId = (id1, id2) => {
  return [id1.toString(), id2.toString()].sort().join('_');
};

module.exports = {
  getUserRoom,
  getConversationRoom,
  buildConversationId,
};