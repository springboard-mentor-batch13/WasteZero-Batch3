// Backend/validations/pickup.validation.js

const { body, validationResult } = require('express-validator');
const { sendError } = require('../utils/apiResponse');

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:mm, 24-hour

/**
 * Validation rules for Create (POST) and Update (PUT) pickup requests.
 * All fields are required on POST; on PUT only fields present in the body
 * are validated (partial update), mirroring opportunityValidationRules.
 */
const pickupValidationRules = () => {
  const isRelevant = (value, { req }) =>
    req.method === 'POST' || (req.method === 'PUT' && value !== undefined);

  return [
    body('address.city')
      .if((value, { req }) => req.method === 'POST' || req.body.address !== undefined)
      .notEmpty().withMessage('City is required')
      .isString().withMessage('City must be a string')
      .trim(),

    body('address.area')
      .optional({ nullable: true })
      .isString().withMessage('Area must be a string')
      .trim(),

    body('scheduledDate')
      .if(isRelevant)
      .notEmpty().withMessage('Scheduled date is required')
      .custom((value) => {
        const d = new Date(value);
        if (isNaN(d.getTime())) {
          throw new Error('Scheduled date must be a valid date');
        }
        return true;
      })
      .custom((value) => {
        const d = new Date(value);
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        if (d < startOfToday) {
          throw new Error('Scheduled date cannot be in the past');
        }
        return true;
      }),

    body('preferredTimeSlot.start')
      .if((value, { req }) => req.method === 'POST' || req.body.preferredTimeSlot !== undefined)
      .notEmpty().withMessage('Preferred time slot start is required')
      .matches(TIME_REGEX).withMessage('Start time must be in HH:mm 24-hour format')
      .custom((value, { req }) => {
        // Only enforceable on POST: that's the only path where scheduledDate
        // and preferredTimeSlot are both guaranteed to be the full, current
        // intended values in the same request. On PUT, scheduledDate may be
        // omitted (unchanged) while only preferredTimeSlot is sent (or vice
        // versa), so checking one against a possibly-stale copy of the other
        // would produce false positives/negatives.
        if (req.method !== 'POST') return true;

        const scheduledDate = new Date(req.body.scheduledDate);
        if (isNaN(scheduledDate.getTime())) return true; // reported separately

        const now = new Date();
        const isToday = scheduledDate.toDateString() === now.toDateString();
        if (!isToday) return true;

        const [hours, minutes] = value.split(':').map(Number);
        const slotStart = new Date();
        slotStart.setHours(hours, minutes, 0, 0);

        if (slotStart < now) {
          throw new Error('Preferred time slot cannot be in the past for a same-day pickup');
        }
        return true;
      }),

    body('preferredTimeSlot.end')
      .if((value, { req }) => req.method === 'POST' || req.body.preferredTimeSlot !== undefined)
      .notEmpty().withMessage('Preferred time slot end is required')
      .matches(TIME_REGEX).withMessage('End time must be in HH:mm 24-hour format')
      .custom((value, { req }) => {
        const { start } = req.body.preferredTimeSlot || {};
        if (start && value <= start) {
          throw new Error('End time must be after start time');
        }
        return true;
      }),

    body('wasteTypes')
      .if(isRelevant)
      .notEmpty().withMessage('At least one waste type is required')
      .isArray({ min: 1 }).withMessage('Waste types must be an array with at least one entry'),

    body('wasteTypes.*')
      .isString().withMessage('Each waste type must be a string')
      .trim(),

    body('notes')
      .optional({ nullable: true })
      .isString().withMessage('Notes must be a string')
      .isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
      .trim(),
  ];
};

/**
 * Validation rules for the NGO status-transition endpoint
 * (PATCH /api/pickups/:id/status).
 */
const pickupStatusValidationRules = () => {
  return [
    body('status')
      .notEmpty().withMessage('Status is required')
      .isIn(['Assigned', 'Completed', 'Cancelled'])
      .withMessage('Status must be one of Assigned, Completed, Cancelled'),
  ];
};

/**
 * Middleware to halt the request and return structured validation errors,
 * matching the { field: message } convention used by opportunity.validation.js.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  const extractedErrors = errors.array().map((err) => ({ [err.path]: err.msg }));
  return sendError(res, 'Validation failed', 400, extractedErrors);
};

module.exports = {
  pickupValidationRules,
  pickupStatusValidationRules,
  validate,
};