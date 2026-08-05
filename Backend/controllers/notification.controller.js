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
 * @desc    Mark one notification as read. Ownership-scoped — a user can
 *          only mark their own notifications.
 * @route   PUT /api/notifications/:id/read
 * @access  Private (Owner only)
 */
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

module.exports = {
  getNotifications,
  markNotificationRead,
};
