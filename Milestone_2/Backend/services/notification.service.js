// Backend/services/notification.service.js

const mongoose = require('mongoose');
const Notification = require('../models/notification.model');

/**
 * Create a notification record and (best-effort) push it over the socket
 * layer if the recipient is currently connected.
 */
const dispatch = async ({ user_id, type, message, reference_id = null }) => {
  const notification = await Notification.create({ user_id, type, message, reference_id });

  try {
    const { getIO } = require('../sockets');
    const { getUserRoom } = require('../sockets/rooms');
    getIO().to(getUserRoom(user_id)).emit('notification:new', notification);
  } catch (err) {
    console.error('[Notification] Socket push skipped:', err.message);
  }

  return notification;
};

/**
 * Get notifications for a user, paginated, newest first.
 */
const listForUser = (userId, skip = 0, limit = 20) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID format');
  }

  return Notification.find({ user_id: userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
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

  return notification;
};

module.exports = {
  dispatch,
  listForUser,
  markRead,
};