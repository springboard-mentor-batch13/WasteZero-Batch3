// Backend/controllers/message.controller.js

const messageService = require('../services/message.service');
const { sendSuccess, sendError } = require('../utils/apiResponse');

/**
 * @desc    List all people the logged-in user has chatted with, each with
 *          their latest message (WhatsApp-style conversation preview).
 * @route   GET /api/messages/conversations
 * @access  Private (any logged-in user)
 */
const getConversations = async (req, res) => {
  try {
    const conversations = await messageService.getConversationsForUser(req.user.id);
    return sendSuccess(res, conversations, 'Conversations fetched successfully');
  } catch (error) {
    return sendError(res, 'Failed to fetch conversations', 500, error.message);
  }
};

/**
 * @desc    Get the full message history with one specific person, oldest
 *          first. req.query.with is validated as a Mongo id upstream by
 *          messageHistoryValidationRules.
 * @route   GET /api/messages?with=:userId
 * @access  Private (any logged-in user)
 */
const getMessageHistory = async (req, res) => {
  try {
    const messages = await messageService.getMessagesBetween(req.user.id, req.query.with);
    return sendSuccess(res, messages, 'Message history fetched successfully');
  } catch (error) {
    return sendError(res, 'Failed to fetch message history', 500, error.message);
  }
};

module.exports = {
  getConversations,
  getMessageHistory,
};
