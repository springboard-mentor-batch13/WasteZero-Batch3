// Backend/sockets/events/message.events.js

const mongoose = require('mongoose');
const messageService = require('../../services/message.service');
const notificationService = require('../../services/notification.service');
const { getUserRoom, buildConversationId } = require('../rooms');
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

      // Pass sender_role along with sender_id to strictly enforce Volunteer <-> NGO messaging.
      // messageService.createMessage() handles encryption transparently.
      const message = await messageService.createMessage({
        sender_id: socket.user.id,
        sender_role: socket.user.role,
        receiver_id: receiverId,
        content,
      });

      // Broadcast decrypted message to every connected socket session of the recipient.
      io.to(getUserRoom(receiverId)).emit('message:new', message);

      // Acknowledge back to sender. From this point on the message is
      // already persisted and delivered — nothing below may cause a second,
      // conflicting ack() call.
      if (typeof ack === 'function') {
        ack({ success: true, data: message });
      }

    
      try {
        await notificationService.dispatch({
          user_id: receiverId,
          type: 'message',
          message: `New message from ${socket.user.name || 'a user'}`,
          // Use the conversation ID (not the sender's user ID) so the frontend
          // can navigate directly to the correct conversation thread.
          reference_id: buildConversationId(socket.user.id, receiverId),
        });
      } catch (notifyErr) {
        console.error('[Messages] Failed to dispatch message notification:', notifyErr.message);
      }
    } catch (err) {
      
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

     
      const participantIds = conversationId.split('_');
      if (participantIds.length !== 2 || !participantIds.includes(socket.user.id)) {
        throw new Error('You are not a participant in this conversation');
      }

      await messageService.markConversationRead(conversationId, socket.user.id);

      const otherUserId = participantIds.find((id) => id !== socket.user.id);

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

  
  socket.on('message:typing', ({ receiverId } = {}) => {
    if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) return;
    io.to(getUserRoom(receiverId)).emit('message:typing', {
      senderId: socket.user.id,
    });
  });
};