// Backend/sockets/rooms.js

const getUserRoom = (userId) => `user:${userId}`;


const getConversationRoom = (conversationId) => `conversation:${conversationId}`;


const buildConversationId = (id1, id2) => {
  return [id1.toString(), id2.toString()].sort().join('_');
};

module.exports = {
  getUserRoom,
  getConversationRoom,
  buildConversationId,
};