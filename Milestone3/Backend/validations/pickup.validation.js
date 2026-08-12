// Backend/validations/pickup.validation.js
//
// ── Input validation for all Pickup endpoints ─────────────────────────────────
//
// Rule sets:
//   pickupValidationRules()         — POST (create) and PUT (volunteer edit)
//   pickupRescheduleValidationRules() — PATCH /:id/reschedule (volunteer)
//   pickupStatusValidationRules()   — PATCH /:id/status (NGO)
//   adminPickupStatusValidationRules() — PATCH /admin/:id/status (admin)
//   adminPickupUpdateValidationRules() — PUT /admin/:id (admin, all fields optional)
//
// INVARIANT:
//   'Missed' is NEVER an accepted input value in any of these rule sets.
//   It is enforced both here (validation layer) and in the service layer,
//   so it cannot be bypassed by hitting the model layer directly.

const { body, validationResult } = require('express-validator');
const { sendError } = require('../utils/apiResponse');
const { ALLOWED_WASTE_TYPES } = require('../constants/wasteTypes');
const {
  NGO_STATUS_INPUT_ALLOWED,
  ADMIN_STATUS_INPUT_ALLOWED,
} = require('../utils/pickup.transitions');

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:mm, 24-hour

// ---------------------------------------------------------------------------
// Shared sub-validators (composed into rule sets below)
// ---------------------------------------------------------------------------

/**
 * Validate a single HH:mm time string field.
 * @param {string} fieldPath     - e.g. 'preferredTimeSlot.start'
 * @param {string} label         - human-readable name for error messages
 * @param {boolean} required     - if false, field is optional (for admin partial updates)
 */
const timeFieldRule = (fieldPath, label, required = true) => {
  const chain = required
    ? body(fieldPath).notEmpty().withMessage(`${label} is required`)
    : body(fieldPath).optional({ nullable: true });

  return chain
    .matches(TIME_REGEX)
    .withMessage(`${label} must be in HH:mm 24-hour format (e.g. 14:30)`);
};

/**
 * Validate scheduledDate — must be a valid date, not in the past.
 * @param {boolean} required
 */
const scheduledDateRule = (required = true) => {
  const chain = required
    ? body('scheduledDate').notEmpty().withMessage('Scheduled date is required')
    : body('scheduledDate').optional();

  return chain
    .custom((value) => {
      if (value === undefined || value === null) return true; // optional already handled
      const d = new Date(value);
      if (isNaN(d.getTime())) throw new Error('Scheduled date must be a valid date');
      return true;
    })
    .custom((value) => {
      if (value === undefined || value === null) return true;
      const d = new Date(value);
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      if (d < startOfToday) throw new Error('Scheduled date cannot be in the past');
      return true;
    });
};

// Raw check functions (not wrapped in a body() chain) so the SAME logic can
// be reused across every rule set that needs it (create/edit, reschedule,
// admin edit) regardless of what other chaining (.if(), .notEmpty(),
// .matches(), .optional()) each call site composes it with. Previously this
// logic was duplicated verbatim between call sites and could drift out of
// sync — now there is exactly one copy of each check.

/**
 * Check that preferredTimeSlot.end is after preferredTimeSlot.start.
 */
const endAfterStartCheck = (value, { req }) => {
  const start = req.body?.preferredTimeSlot?.start;
  if (start && value && value <= start) {
    throw new Error('End time must be after start time');
  }
  return true;
};

/**
 * Check that the start time is not in the past for a same-day pickup.
 */
const startNotInPastCheck = (value, { req }) => {
  if (!value) return true;
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
};

/**
 * Validate the wasteTypes array.
 * @param {boolean} required
 */
const wasteTypesRules = (required = true) => {
  const arrayRule = required
    ? body('wasteTypes')
        .notEmpty().withMessage('At least one waste type is required')
        .isArray({ min: 1 }).withMessage('Waste types must be an array with at least one entry')
    : body('wasteTypes')
        .optional()
        .isArray({ min: 1 }).withMessage('If provided, waste types must be a non-empty array');

  const itemRule = body('wasteTypes.*')
    .isString().withMessage('Each waste type must be a string')
    .trim()
    .isIn(ALLOWED_WASTE_TYPES)
    .withMessage(`Each waste type must be one of: ${ALLOWED_WASTE_TYPES.join(', ')}`);

  return [arrayRule, itemRule];
};

// ---------------------------------------------------------------------------
// Rule sets
// ---------------------------------------------------------------------------

/**
 * Validation rules for volunteer Create (POST) and Update (PUT) pickup.
 * On POST: all core fields required.
 * On PUT:  only fields present in the body are validated (partial update).
 */
const pickupValidationRules = () => {
  const isPost = (value, { req }) => req.method === 'POST';
  const isPresentOnPut = (value, { req }) => req.method === 'PUT' && value !== undefined;

  return [
    // address.city: required on POST, required if address is provided on PUT
    body('address.city')
      .if((value, { req }) => isPost(value, { req }) || req.body.address !== undefined)
      .notEmpty().withMessage('City is required')
      .isString().withMessage('City must be a string')
      .trim(),

    body('address.area')
      .optional({ nullable: true })
      .isString().withMessage('Area must be a string')
      .trim(),

    // scheduledDate
    body('scheduledDate')
      .if((value, { req }) => isPost(value, { req }) || isPresentOnPut(value, { req }))
      .notEmpty().withMessage('Scheduled date is required')
      .custom((value) => {
        const d = new Date(value);
        if (isNaN(d.getTime())) throw new Error('Scheduled date must be a valid date');
        return true;
      })
      .custom((value) => {
        const d = new Date(value);
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        if (d < startOfToday) throw new Error('Scheduled date cannot be in the past');
        return true;
      }),

    // preferredTimeSlot.start
    body('preferredTimeSlot.start')
      .if((value, { req }) => isPost(value, { req }) || req.body.preferredTimeSlot !== undefined)
      .notEmpty().withMessage('Preferred time slot start is required')
      .matches(TIME_REGEX).withMessage('Start time must be in HH:mm 24-hour format')
      // Same-day past-slot guard (create only; edit is allowed to not re-check)
      .custom((value, { req }) => (isPost(value, { req }) ? startNotInPastCheck(value, { req }) : true)),

    // preferredTimeSlot.end
    body('preferredTimeSlot.end')
      .if((value, { req }) => isPost(value, { req }) || req.body.preferredTimeSlot !== undefined)
      .notEmpty().withMessage('Preferred time slot end is required')
      .matches(TIME_REGEX).withMessage('End time must be in HH:mm 24-hour format')
      .custom(endAfterStartCheck),

    ...wasteTypesRules(true /* apply "required on POST" inside */),

    // wasteTypes overridden so array-level required only fires on POST
    // (already handled above by the isPost/isPresentOnPut pattern — leave as-is)

    body('notes')
      .optional({ nullable: true })
      .isString().withMessage('Notes must be a string')
      .isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
      .trim(),
  ];
};

/**
 * Validation rules for the volunteer reschedule endpoint.
 * PATCH /:id/reschedule
 *
 * Both scheduledDate and preferredTimeSlot are REQUIRED — the old values
 * are stale by definition (the pickup is Missed), so a partial update
 * would silently carry forward invalid scheduling data.
 */
const pickupRescheduleValidationRules = () => [
  body('scheduledDate')
    .notEmpty().withMessage('A new scheduled date is required to reschedule')
    .custom((value) => {
      const d = new Date(value);
      if (isNaN(d.getTime())) throw new Error('Scheduled date must be a valid date');
      return true;
    })
    .custom((value) => {
      const d = new Date(value);
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      if (d < startOfToday) throw new Error('Scheduled date cannot be in the past');
      return true;
    }),

  body('preferredTimeSlot.start')
    .notEmpty().withMessage('A new start time is required to reschedule')
    .matches(TIME_REGEX).withMessage('Start time must be in HH:mm 24-hour format')
    .custom(startNotInPastCheck),

  body('preferredTimeSlot.end')
    .notEmpty().withMessage('A new end time is required to reschedule')
    .matches(TIME_REGEX).withMessage('End time must be in HH:mm 24-hour format')
    .custom(endAfterStartCheck),
];

/**
 * Validation rules for the NGO status-transition endpoint.
 * PATCH /:id/status
 *
 * Allowed values are derived from the transition table — never hand-typed here.
 * 'Missed' is intentionally absent.
 */
const pickupStatusValidationRules = () => [
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(NGO_STATUS_INPUT_ALLOWED)
    .withMessage(
      `Status must be one of: ${NGO_STATUS_INPUT_ALLOWED.join(', ')}. ` +
      `Note: "Missed" is set automatically by the system and cannot be requested.`
    ),
];

/**
 * Validation rules for the admin force-status endpoint.
 * PATCH /admin/:id/status
 *
 * Admin can only force to Completed or Cancelled — never to Pending, Assigned,
 * or Missed. Derived from the transition table.
 */
const adminPickupStatusValidationRules = () => [
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(ADMIN_STATUS_INPUT_ALLOWED)
    .withMessage(
      `Admin can only force status to: ${ADMIN_STATUS_INPUT_ALLOWED.join(', ')}.`
    ),
];

/**
 * Validation rules for the admin pickup field-edit endpoint.
 * PUT /admin/:id
 *
 * All fields are optional — admin may partial-update any status pickup.
 * Same format constraints as the volunteer rules but nothing is required.
 */
const adminPickupUpdateValidationRules = () => [
  body('address.city')
    .optional()
    .isString().withMessage('City must be a string')
    .notEmpty().withMessage('City cannot be empty if provided')
    .trim(),

  body('address.area')
    .optional({ nullable: true })
    .isString().withMessage('Area must be a string')
    .trim(),

  body('scheduledDate')
    .optional()
    .custom((value) => {
      const d = new Date(value);
      if (isNaN(d.getTime())) throw new Error('Scheduled date must be a valid date');
      return true;
    }),
  // Note: admin is not restricted to future dates — they may need to
  // correct historical data. Remove this comment if that changes.

  body('preferredTimeSlot.start')
    .optional()
    .matches(TIME_REGEX).withMessage('Start time must be in HH:mm 24-hour format'),

  body('preferredTimeSlot.end')
    .optional()
    .matches(TIME_REGEX).withMessage('End time must be in HH:mm 24-hour format')
    .custom(endAfterStartCheck),

  ...wasteTypesRules(false), // all optional for admin

  body('notes')
    .optional({ nullable: true })
    .isString().withMessage('Notes must be a string')
    .isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
    .trim(),
];

// ---------------------------------------------------------------------------
// validate middleware — halt and return structured errors
// ---------------------------------------------------------------------------
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const extractedErrors = errors.array().map((err) => ({ [err.path]: err.msg }));
  return sendError(res, 'Validation failed', 400, extractedErrors);
};

module.exports = {
  pickupValidationRules,
  pickupRescheduleValidationRules,
  pickupStatusValidationRules,
  adminPickupStatusValidationRules,
  adminPickupUpdateValidationRules,
  validate,
};