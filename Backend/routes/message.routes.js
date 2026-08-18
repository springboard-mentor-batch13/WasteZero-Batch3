// Backend/routes/message.routes.js

const express = require('express');
const router = express.Router();

const { protect, authorize } = require('../middlewares/auth.middleware');
const { getConversations, getMessageHistory } = require('../controllers/message.controller');
const {
  messageHistoryValidationRules,
  validate,
} = require('../validations/message.validation');

// P1-04: generalLimiter applied to message read endpoints.
// Conversations and message history are expensive (aggregation + decryption)
// and previously had no rate limiting.
const { generalLimiter } = require('../middlewares/rateLimiter.middleware');

// Any logged-in user — their own conversation list.
router.get('/conversations', protect, authorize('volunteer', 'ngo', 'admin'), generalLimiter, getConversations);

// Any logged-in user — message history with one specific person.
router.get(
  '/',
  protect,
  authorize('volunteer', 'ngo', 'admin'),
  generalLimiter,
  messageHistoryValidationRules(),
  validate,
  getMessageHistory
);

module.exports = router;
