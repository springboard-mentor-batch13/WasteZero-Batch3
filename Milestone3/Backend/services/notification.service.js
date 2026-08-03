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
  createNotification,
  getNotificationsForUser,
  markNotificationRead,
};