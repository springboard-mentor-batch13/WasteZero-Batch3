// Backend/controllers/notification.controller.js

const notificationService = require('../services/notification.service');
const buildQuery = require('../utils/queryBuilder');
const { sendSuccess, sendError } = require('../utils/apiResponse');

/**
 * @desc    List the logged-in user's notifications, paginated, newest first.
 * @route   GET /api/notifications
 * @access  Private (any logged-in user)
 */
const getNotifications = async (req, res) => {
  try {
    const { skip, limit, page } = buildQuery(req);

    const notifications = await notificationService.getNotificationsForUser(req.user.id, skip, limit);

    return sendSuccess(res, { page, limit, notifications }, 'Notifications fetched successfully');
  } catch (error) {
    return sendError(res, 'Failed to fetch notifications', 500, error.message);
  }
};

/**
 * @desc    Get the count of unread notifications for the logged-in user.
 * @route   GET /api/notifications/unread-count
 * @access  Private (any logged-in user)
 */
const getUnreadCount = async (req, res) => {
  try {
    const result = await notificationService.getUnreadCount(req.user.id);
    return sendSuccess(res, result, 'Unread count fetched successfully');
  } catch (error) {
    return sendError(res, 'Failed to fetch unread count', 500, error.message);
  }
};


const markNotificationRead = async (req, res) => {
  try {
    const notification = await notificationService.markNotificationRead(req.params.id, req.user.id);
    return sendSuccess(res, notification, 'Notification marked as read');
  } catch (error) {
    // markNotificationRead throws the same message for "doesn't exist" and
    // "exists but belongs to someone else" — treated as 404 either way, so
    // this endpoint never confirms/denies another user's notification ids.
    return sendError(res, error.message || 'Notification not found', 404);
  }
};


const markConversationNotificationsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const parts = (conversationId || '').split('_');
    if (parts.length !== 2 || !parts.includes(req.user.id)) {
      return sendError(res, 'You are not a participant in this conversation', 403);
    }

    const result = await notificationService.markConversationNotificationsRead(
      conversationId,
      req.user.id
    );
    return sendSuccess(res, result, 'Conversation notifications marked as read');
  } catch (error) {
    return sendError(res, 'Failed to mark conversation notifications as read', 500, error.message);
  }
};

const markAllNotificationsRead = async (req, res) => {
  try {
    const category = req.query.category || req.body?.category || null;
    const result = await notificationService.markAllRead(req.user.id, category);
    return sendSuccess(res, result, 'All requested notifications marked as read');
  } catch (error) {
    return sendError(res, 'Failed to mark notifications as read', 500, error.message);
  }
};

const clearAllNotifications = async (req, res) => {
  try {
    const result = await notificationService.clearAll(req.user.id);
    return sendSuccess(res, result, 'All notifications cleared successfully');
  } catch (error) {
    return sendError(res, 'Failed to clear notifications', 500, error.message);
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markConversationNotificationsRead,
  markAllNotificationsRead,
  clearAllNotifications,
};
