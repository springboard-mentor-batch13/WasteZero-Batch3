// Backend/routes/notification.routes.js

const express = require('express');
const router = express.Router();

const { protect, authorize } = require('../middlewares/auth.middleware');
const {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markConversationNotificationsRead,
  markAllNotificationsRead,
  clearAllNotifications,
} = require('../controllers/notification.controller');
const {
  notificationIdValidationRules,
  validate,
} = require('../validations/notification.validation');

// P1-04: generalLimiter applied to notification feed endpoint.
// Notification listing is a read-heavy endpoint with decryption and had no rate limit.
const { generalLimiter } = require('../middlewares/rateLimiter.middleware');

// Any logged-in user — their own notification feed.
router.get('/', protect, authorize('volunteer', 'ngo', 'admin'), generalLimiter, getNotifications);

// Unread count — must be declared BEFORE /:id/read to avoid Express
// treating the literal string "unread-count" as a notification ObjectId.
router.get('/unread-count', protect, authorize('volunteer', 'ngo', 'admin'), getUnreadCount);

// Read All (optional ?category=general or ?category=text)
router.put(
  '/read-all',
  protect,
  authorize('volunteer', 'ngo', 'admin'),
  markAllNotificationsRead
);

router.put(
  '/conversation/:conversationId/read',
  protect,
  authorize('volunteer', 'ngo', 'admin'),
  markConversationNotificationsRead
);

// Clear all notifications from database
router.delete(
  '/',
  protect,
  authorize('volunteer', 'ngo', 'admin'),
  clearAllNotifications
);

router.delete(
  '/clear-all',
  protect,
  authorize('volunteer', 'ngo', 'admin'),
  clearAllNotifications
);

// Owner only — enforced inside notificationService.markNotificationRead,
// which scopes the update to { _id: id, user_id: req.user.id }.
router.put(
  '/:id/read',
  protect,
  authorize('volunteer', 'ngo', 'admin'),
  notificationIdValidationRules(),
  validate,
  markNotificationRead
);

module.exports = router;
