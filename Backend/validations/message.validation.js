// Backend/validations/message.validation.js

const { query, validationResult } = require('express-validator');
const { sendError } = require('../utils/apiResponse');

/**
 * Validation rules for GET /api/messages?with=:userId
 */
const messageHistoryValidationRules = () => [
  query('with')
    .notEmpty()
    .withMessage('The "with" query parameter (target user id) is required')
    .isMongoId()
    .withMessage('The "with" query parameter must be a valid user id'),
];

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  const extractedErrors = errors.array().map((err) => ({ [err.path]: err.msg }));
  return sendError(res, 'Validation failed', 400, extractedErrors);
};

module.exports = {
  messageHistoryValidationRules,
  validate,
};
