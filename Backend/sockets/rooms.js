// Backend/sockets/rooms.js
//
// Every connected user joins exactly one room, regardless of how many
// tabs/devices they have open (a user with 3 open tabs has 3 sockets, all
// in the same room). This lets message/notification pushes be a single
// `io.to(getUserRoom(id)).emit(...)` call that works identically whether
// the user has 0, 1, or several active connections — no manual
// socket-id-to-user-id bookkeeping needed anywhere in the codebase.

/**
 * Returns the room name for a user's personal notification/message channel.
 * All of a user's connected sockets join this room on connection.
 */
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
 * message.service.js also has an internal copy for historical reasons,
 * but all new code should import from here.
 */
const buildConversationId = (id1, id2) => {
  return [id1.toString(), id2.toString()].sort().join('_');
};

module.exports = {
  getUserRoom,
  getConversationRoom,
  buildConversationId,
};