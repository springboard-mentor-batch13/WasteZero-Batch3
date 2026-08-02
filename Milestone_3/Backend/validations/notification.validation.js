// Backend/validations/notification.validation.js

const { param, validationResult } = require('express-validator');
const { sendError } = require('../utils/apiResponse');

/**
 * Validation rules for PUT /api/notifications/:id/read
 */
const notificationIdValidationRules = () => [
  param('id').isMongoId().withMessage('Invalid notification id'),
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
  notificationIdValidationRules,
  validate,
};
