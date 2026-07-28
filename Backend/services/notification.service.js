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

// ── Developer 2 spec — REST-facing function names ──────────────────────
// Thin, purpose-named wrappers matching the spec's exact signatures, so the
// REST controller layer doesn't need to know about dispatch/listForUser/
// markRead directly. dispatch/listForUser/markRead stay as-is since the
// socket layer (sockets/events/message.events.js) already calls dispatch()
// directly.

/**
 * Create a notification for userId and (per dispatch's existing behavior)
 * push it live over the socket layer if they're connected — this already
 * fulfils the spec's "save first, then notify the connected client"
 * requirement; there's no separate emitNotification(io, userId, data) to
 * call into, since dispatch() owns that socket push internally.
 */
const createNotification = (userId, type, message, relatedId = null) =>
  dispatch({ user_id: userId, type, message, reference_id: relatedId });

/**
 * Get notifications for a user, paginated, newest first.
 */
const getNotificationsForUser = (userId, skip = 0, limit = 20) => listForUser(userId, skip, limit);

/**
 * Mark a single notification as read. NOTE: takes (notificationId, userId)
 * rather than the spec's (notificationId) alone — ownership scoping is
 * required to satisfy the "Owner only" auth rule on PUT
 * /api/notifications/:id/read (see route/controller), so userId can't be
 * dropped without losing that check.
 */
const markNotificationRead = (notificationId, userId) => markRead(notificationId, userId);

module.exports = {
  dispatch,
  listForUser,
  markRead,
  createNotification,
  getNotificationsForUser,
  markNotificationRead,
};