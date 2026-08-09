// Backend/routes/notification.routes.js

const express = require('express');
const router = express.Router();

const { protect, authorize } = require('../middlewares/auth.middleware');
const { getNotifications, getUnreadCount, markNotificationRead, markConversationNotificationsRead } = require('../controllers/notification.controller');
const {
  notificationIdValidationRules,
  validate,
} = require('../validations/notification.validation');

// Any logged-in user — their own notification feed.
router.get('/', protect, authorize('volunteer', 'ngo', 'admin'), getNotifications);

// Unread count — must be declared BEFORE /:id/read to avoid Express
// treating the literal string "unread-count" as a notification ObjectId.
router.get('/unread-count', protect, authorize('volunteer', 'ngo', 'admin'), getUnreadCount);


router.put(
  '/conversation/:conversationId/read',
  protect,
  authorize('volunteer', 'ngo', 'admin'),
  markConversationNotificationsRead
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
