const mongoose = require('mongoose');
const messageService = require('../../services/message.service');
const notificationService = require('../../services/notification.service');
const { getUserRoom, buildConversationId } = require('../rooms');
const { messageLimiter } = require('../rateLimiter');

function assertValidSendPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload');
  }
  const { receiverId, content } = payload;
  if (!receiverId || typeof receiverId !== 'string') {
    throw new Error('receiverId is required');
  }
  if (!mongoose.Types.ObjectId.isValid(receiverId)) {
    throw new Error('Invalid receiverId format');
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    throw new Error('content is required');
  }
  if (content.length > 2000) {
    throw new Error('content exceeds 2000 characters');
  }
  return { receiverId, content: content.trim() };
}

module.exports = function registerMessageEvents(io, socket) {
  socket.on('message:send', async (payload, ack) => {
    try {
      await messageLimiter.consume(socket.user.id);

      const { receiverId, content } = assertValidSendPayload(payload);
      const conversationId = buildConversationId(socket.user.id, receiverId);

      const message = await messageService.createMessage({
        conversation_id: conversationId,
        sender_id: socket.user.id,
        receiver_id: receiverId,
        content,
      });

      // Broadcast decrypted message to receiver's open tabs
      io.to(getUserRoom(receiverId)).emit('message:new', message);

      if (typeof ack === 'function') {
        ack({ success: true, data: message });
      }

      // ✅ FIX: Matched parameters with notificationService.dispatch expectation (user_id, type, message, reference_id)
      await notificationService.dispatch({
        user_id: receiverId,
        type: 'message',
        message: content.slice(0, 80),
        reference_id: conversationId,
      });
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'RateLimiterRes'
          ? 'You are sending messages too quickly. Please slow down.'
          : err.message || 'Failed to send message';

      if (typeof ack === 'function') {
        ack({ success: false, message });
      } else {
        socket.emit('error', { event: 'message:send', message });
      }
    }
  });

  socket.on('message:read', async ({ conversationId } = {}, ack) => {
    try {
      if (!conversationId) throw new Error('conversationId is required');

      const result = await messageService.markConversationRead(
        conversationId,
        socket.user.id
      );


      // conversationId is a deterministic string: sort([id1, id2]).join('_').
      // No socket ever joins a conversation room, so we cannot use
      // getConversationRoom() here — it would emit to an empty room.
      // Instead, derive the other participant's ID from the string and
      // emit the read receipt directly to their personal user room.
      const otherUserId = conversationId
        .split('_')
        .find((id) => id !== socket.user.id);

      if (otherUserId) {
        io.to(getUserRoom(otherUserId)).emit('message:read', {
          conversationId,
          readerId: socket.user.id,
        });
      }

      if (typeof ack === 'function') ack({ success: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ success: false, message: err.message });
    }
  });

  socket.on('message:typing', ({ receiverId } = {}) => {
    if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) return;
    io.to(getUserRoom(receiverId)).emit('message:typing', {
      senderId: socket.user.id,
    });
  });
};