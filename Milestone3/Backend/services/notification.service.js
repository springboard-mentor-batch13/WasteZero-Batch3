// Backend/services/notification.service.js

const mongoose = require('mongoose');
const Notification = require('../models/notification.model');
const { encrypt, decrypt } = require('../utils/crypto');

/**
 * Create a notification record and (best-effort) push it over the socket
 * layer if the recipient is currently connected.
 *
 * Encrypts the plaintext message with AES-256-GCM before persisting to
 * MongoDB — the database never stores readable notification text.
 * The socket push always emits the original plaintext so the connected
 * client sees a readable message immediately without a round-trip decrypt.
 */
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

    // Emit the ORIGINAL plaintext to the connected client —
    // never expose iv/authTag/ciphertext to the frontend.
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

/**
 * Get notifications for a user, paginated, newest first.
 * Decrypts each notification's message before returning to the caller.
 * iv and authTag are stripped — they must never be exposed to the frontend.
 */
const listForUser = async (userId, skip = 0, limit = 20) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID format');
  }

  // Lazy 24-hour expiry: delete read notifications where readAt+24h has
  // elapsed. Uses readAt — NOT createdAt — so a notification read late in
  // its life still gets the full 24h window before deletion.
  // Unread notifications (isRead:false) are NEVER touched by this path.
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

/**
 * Mark a single notification as read. Scoped to user_id so a user cannot
 * mark another user's notification as read.
 * Decrypts message before returning to caller.
 */
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

/**
 * Return the count of unread notifications for a user.
 * Used by the frontend on app start to seed the bell badge from
 * persisted data, so the indicator survives refresh and re-login.
 */
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

/**
 * Mark all unread message-type notifications for a specific conversation
 * as read, scoped to the recipient (userId). Only affects notifications
 * where type='message' AND reference_id matches the conversationId AND
 * the owning user matches — notifications from other conversations or
 * other users are untouched.
 *
 * conversationId is the deterministic sorted pair (e.g. "abc_def") already
 * stored as reference_id on every message notification, so no new schema
 * field is required.
 *
 * Returns the count of documents updated.
 */
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

/**
 * Delete all read notifications whose readAt timestamp is older than 24 hours.
 * This is the correct expiry predicate: a notification must be READ first and
 * then have 24 hours pass before it is eligible for removal.
 * Unread notifications (isRead:false) are NEVER deleted by this function.
 *
 * Called by the hourly cleanup job registered in server.js.
 * Returns the count of deleted documents for logging.
 */
const cleanupExpiredNotifications = async () => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await Notification.deleteMany({
    isRead: true,
    readAt: { $ne: null, $lte: cutoff },
  });
  return result.deletedCount;
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
const getNotificationsForUser = (userId, skip = 0, limit = 20) =>
  listForUser(userId, skip, limit);

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
  getUnreadCount,
  markConversationNotificationsRead,
  cleanupExpiredNotifications,
  createNotification,
  getNotificationsForUser,
  markNotificationRead,
};