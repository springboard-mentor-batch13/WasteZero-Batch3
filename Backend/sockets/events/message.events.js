// Backend/sockets/events/message.events.js

const mongoose = require('mongoose');
const messageService = require('../../services/message.service');
const notificationService = require('../../services/notification.service');
const { getUserRoom } = require('../rooms');
const { messageLimiter } = require('../rateLimiter');

/**
 * @internal
 * Socket payload validator.
 */
const assertValidSendPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload');
  }

  const { receiverId, content } = payload;

  if (!receiverId || typeof receiverId !== 'string' || !mongoose.Types.ObjectId.isValid(receiverId)) {
    throw new Error('Valid receiverId is required');
  }

  if (!content || typeof content !== 'string' || !content.trim()) {
    throw new Error('Message content is required');
  }

  if (content.length > 2000) {
    throw new Error('Message content exceeds 2000 characters');
  }

  return { receiverId, content: content.trim() };
};

module.exports = function registerMessageEvents(io, socket) {
  socket.on('message:send', async (payload, ack) => {
    try {
      await messageLimiter.consume(socket.user.id);

      const { receiverId, content } = assertValidSendPayload(payload);

      // Pass sender_role along with sender_id to strictly enforce Volunteer <-> NGO messaging
      const message = await messageService.createMessage({
        sender_id: socket.user.id,
        sender_role: socket.user.role,
        receiver_id: receiverId,
        content,
      });

      // Broadcast to every connected socket session of the recipient
      io.to(getUserRoom(receiverId)).emit('message:new', message);

      // Acknowledge back to sender
      if (typeof ack === 'function') {
        ack({ success: true, data: message });
      }

      // Dispatch persistent notification
      await notificationService.dispatch({
        user_id: receiverId,
        type: 'message',
        message: `New message from ${socket.user.name || 'a user'}`,
        reference_id: socket.user.id,
      });
    } catch (err) {
      // rate-limiter-flexible rejects consume() with a RateLimiterRes
      // instance on limit-exceeded — NOT an Error, so it has no `.name`
      // property (msBeforeNext/remainingPoints/consumedPoints instead).
      // Detect it by that shape rather than a `.name` check, which would
      // never match and always fall through to the generic message below.
      const isRateLimitRejection = !(err instanceof Error) && typeof err?.msBeforeNext === 'number';

      const errMessage = isRateLimitRejection
        ? 'You are sending messages too quickly. Please slow down.'
        : err.message || 'Failed to send message';

      if (typeof ack === 'function') {
        ack({ success: false, message: errMessage });
      } else {
        socket.emit('error', { event: 'message:send', message: errMessage });
      }
    }
  });

  socket.on('message:read', async ({ conversationId } = {}, ack) => {
    try {
      if (!conversationId) {
        throw new Error('conversationId is required');
      }

      await messageService.markConversationRead(conversationId, socket.user.id);

      const otherUserId = conversationId
        .split('_')
        .find((id) => id !== socket.user.id);

      if (otherUserId) {
        io.to(getUserRoom(otherUserId)).emit('message:read', {
          conversationId,
          readerId: socket.user.id,
        });
      }

      if (typeof ack === 'function') {
        ack({ success: true });
      }
    } catch (err) {
      if (typeof ack === 'function') {
        ack({ success: false, message: err.message });
      } else {
        socket.emit('error', { event: 'message:read', message: err.message });
      }
    }
  });
};