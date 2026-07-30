// Backend/services/notification.service.js

const mongoose = require('mongoose');
const Notification = require('../models/notification.model');
const { encrypt, decrypt } = require('../utils/crypto');

/**
 * Create a notification record and (best-effort) push it over the socket
 * layer if the recipient is currently connected.
 */
const dispatch = async ({ user_id, type, message, reference_id = null }) => {
  // Encrypt plaintext before persisting — MongoDB stores only ciphertext.
  // Pattern mirrors createMessage() in message.service.js.
  const { encryptedData, iv, authTag } = encrypt(message);

  const notification = await Notification.create({
    user_id,
    type,
    message: encryptedData,
    iv,
    authTag,
    reference_id,
  });

  try {
    const { getIO } = require('../sockets');
    const { getUserRoom } = require('../sockets/rooms');
    // Emit the ORIGINAL plaintext to the connected client — never the crypto fields.
    const { iv: _iv, authTag: _authTag, ...rest } = notification.toObject();
    getIO().to(getUserRoom(user_id)).emit('notification:new', {
      ...rest,
      message,
    });
  } catch (err) {
    console.error('[Notification] Socket push skipped:', err.message);
  }

  return notification;
};

/**
 * Get notifications for a user, paginated, newest first.
 */
const listForUser = async (userId, skip = 0, limit = 20) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID format');
  }

  const notifications = await Notification.find({ user_id: userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Decrypt each notification message before returning to the client.
  // iv and authTag are stripped — they must never be exposed to the frontend.
  return notifications.map((n) => {
    try {
      const { iv, authTag, ...rest } = n;
      return { ...rest, message: decrypt(n.message, n.iv, n.authTag) };
    } catch {
      const { iv, authTag, ...rest } = n;
      return { ...rest, message: '[Notification Decryption Failed]' };
    }
  });
};

/**
 * Mark a single notification as read. Scoped to user_id so a user cannot
 * mark another user's notification as read.
 */
const markRead = async (notificationId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(notificationId) || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid ID format');
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, user_id: userId },
    { $set: { isRead: true } },
    { new: true }
  );

  if (!notification) {
    throw new Error('Notification not found or unauthorized');
  }

  // Decrypt before returning — caller/client must receive readable text.
  const { iv, authTag, ...rest } = notification.toObject();
  try {
    return { ...rest, message: decrypt(notification.message, iv, authTag) };
  } catch {
    return { ...rest, message: '[Notification Decryption Failed]' };
  }
};

module.exports = {
  dispatch,
  listForUser,
  markRead,
};