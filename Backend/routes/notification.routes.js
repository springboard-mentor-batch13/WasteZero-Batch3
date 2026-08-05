// Backend/routes/notification.routes.js

const express = require('express');
const router = express.Router();

const { protect, authorize } = require('../middlewares/auth.middleware');
const { getNotifications, markNotificationRead } = require('../controllers/notification.controller');
const {
  notificationIdValidationRules,
  validate,
} = require('../validations/notification.validation');

// Any logged-in user — their own notification feed.
router.get('/', protect, authorize('volunteer', 'ngo', 'admin'), getNotifications);

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
