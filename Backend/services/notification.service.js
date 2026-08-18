// Backend/services/notification.service.js

const mongoose = require('mongoose');
const Notification = require('../models/notification.model');
const { encrypt, decrypt } = require('../utils/crypto');

const dispatch = async ({ user_id, type, message, reference_id = null }) => {
  // Encrypt plaintext before persisting — MongoDB stores only ciphertext.
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

    const { iv: _iv, authTag: _authTag, ...rest } = notification.toObject();
    getIO().to(getUserRoom(user_id)).emit('notification:new', {
      ...rest,
      message, // original plaintext
    });
  } catch (err) {
    console.error('[Notification] Socket push skipped:', err.message);
  }

  return notification;
};


const listForUser = async (userId, skip = 0, limit = 20) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID format');
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await Notification.deleteMany({
    user_id: userId,
    isRead: true,
    readAt: { $ne: null, $lte: cutoff },
  });

  const notifications = await Notification.find({ user_id: userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

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

const markRead = async (notificationId, userId) => {
  if (
    !mongoose.Types.ObjectId.isValid(notificationId) ||
    !mongoose.Types.ObjectId.isValid(userId)
  ) {
    throw new Error('Invalid ID format');
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, user_id: userId },
    { $set: { isRead: true, readAt: new Date() } },
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


const getUnreadCount = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID format');
  }
  const count = await Notification.countDocuments({
    user_id: userId,
    isRead: false,
  });
  return { count };
};

const markConversationNotificationsRead = async (conversationId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID format');
  }
  if (!conversationId || typeof conversationId !== 'string') {
    throw new Error('conversationId is required');
  }

  const result = await Notification.updateMany(
    {
      user_id: userId,
      type: 'message',
      reference_id: conversationId,
      isRead: false,
    },
    { $set: { isRead: true, readAt: new Date() } }
  );

  return { updated: result.modifiedCount };
};


const markAllRead = async (userId, category = null) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID format');
  }

  const query = { user_id: userId, isRead: false };
  if (category === 'general') {
    query.type = { $ne: 'message' };
  } else if (category === 'text' || category === 'messages' || category === 'message') {
    query.type = 'message';
  }

  const result = await Notification.updateMany(
    query,
    { $set: { isRead: true, readAt: new Date() } }
  );

  return { updated: result.modifiedCount };
};

const clearAll = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID format');
  }

  const result = await Notification.deleteMany({ user_id: userId });
  return { deleted: result.deletedCount };
};

const cleanupExpiredNotifications = async () => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await Notification.deleteMany({
    isRead: true,
    readAt: { $ne: null, $lte: cutoff },
  });
  return result.deletedCount;
};

const createNotification = (userId, type, message, relatedId = null) =>
  dispatch({ user_id: userId, type, message, reference_id: relatedId });

const getNotificationsForUser = (userId, skip = 0, limit = 20) =>
  listForUser(userId, skip, limit);

const markNotificationRead = (notificationId, userId) => markRead(notificationId, userId);

module.exports = {
  dispatch,
  listForUser,
  markRead,
  getUnreadCount,
  markConversationNotificationsRead,
  markAllRead,
  clearAll,
  cleanupExpiredNotifications,
  createNotification,
  getNotificationsForUser,
  markNotificationRead,
};