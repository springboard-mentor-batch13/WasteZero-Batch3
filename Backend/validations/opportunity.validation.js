// Backend/validations/opportunity.validation.js

const { body, validationResult } = require('express-validator');
const { sendError } = require('../utils/apiResponse');
const opportunityService = require('../services/opportunity.service');

/**
 * Validation rules for Create (POST) and Update (PUT) opportunity requests.
 * All fields except 'status' and 'date' are required on POST and
 * conditionally validated on PUT (only if present in the request body).
 */
const opportunityValidationRules = () => {
  return [
    body('title')
      .if((value, { req }) => req.method === 'POST' || (req.method === 'PUT' && value !== undefined))
      .notEmpty().withMessage('Title is required')
      .isString().withMessage('Title must be a string')
      .trim()
      .isLength({ max: 100 }).withMessage('Title cannot exceed 100 characters'),

    body('description')
      .if((value, { req }) => req.method === 'POST' || (req.method === 'PUT' && value !== undefined))
      .notEmpty().withMessage('Description is required')
      .isString().withMessage('Description must be a string')
      .trim(),

    body('required_skills')
      .if((value, { req }) => req.method === 'POST' || (req.method === 'PUT' && value !== undefined))
      .notEmpty().withMessage('Required skills are required')
      .isArray({ min: 1 }).withMessage('Required skills must be an array with at least one skill'),

    body('required_skills.*')
      .isString().withMessage('Each skill must be a string')
      .trim(),

    body('duration')
      .if((value, { req }) => req.method === 'POST' || (req.method === 'PUT' && value !== undefined))
      .notEmpty().withMessage('Duration is required')
      .isString().withMessage('Duration must be a string')
      .trim(),

    body('location')
      .if((value, { req }) => req.method === 'POST' || (req.method === 'PUT' && value !== undefined))
      .notEmpty().withMessage('Location is required')
      .isString().withMessage('Location must be a string')
      .trim(),

    body('status')
      .optional()
      .isIn(['open', 'in-progress', 'closed'])
      .withMessage('Status must be either open, in-progress, or closed'),

    // ── Date field (optional on both POST and PUT) ─────────────────────
    // Accepts ISO 8601 date strings (e.g. "2025-08-15") or Date objects.
    // null is explicitly allowed to clear a previously set date.
    body('date')
      .optional({ nullable: true })
      .custom((value) => {
        if (value === null || value === '') return true;  // Allow explicit null/clear
        const d = new Date(value);
        if (isNaN(d.getTime())) {
          throw new Error('Date must be a valid date (e.g. 2025-08-15)');
        }
        return true;
      }),
  ];
};

/**
 * Middleware to halt the request and return structured validation errors.
 * Errors are formatted as an array of { field: message } objects,
 * matching the apiResponse.sendError convention used throughout the app.
 *
 * IMPORTANT: req.body may be undefined on requests that carry no body
 * (e.g. DELETE without Content-Type, or any request where the body-parser
 * did not run).  Always guard before accessing nested properties so a
 * malformed client request can never throw a TypeError inside this
 * middleware and produce an unhandled-rejection 500.
 */
const validate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    // If a file was uploaded to Cloudinary earlier in this request's
    // middleware chain (upload.single -> uploadToCloudinary) but body
    // validation now fails, the request will never reach the controller's
    // catch block, so the just-created asset would otherwise be orphaned
    // in Cloudinary forever.  Clean it up here before rejecting.
    //
    // Guard: req.body may be undefined on bodyless requests (DELETE, etc.)
    // — accessing req.body.imagePublicId without a guard would throw a
    // TypeError and expose an internal stack trace as a 500 to the client.
    if (req.body && req.body.imagePublicId) {
      await opportunityService.deleteCloudinaryAsset(req.body.imagePublicId);
    }

    const extractedErrors = errors.array().map((err) => ({ [err.path]: err.msg }));
    return sendError(res, 'Validation failed', 400, extractedErrors);
  } catch (err) {
    // Safety net: if something unexpected throws inside the validation
    // middleware itself, return a clean 500 rather than an unhandled
    // rejection.  Never expose internal details to the client.
    console.error('[validate middleware] Unexpected error:', err.message);
    return sendError(res, 'An unexpected validation error occurred.', 500);
  }
};

module.exports = {
  opportunityValidationRules,
  validate,
};