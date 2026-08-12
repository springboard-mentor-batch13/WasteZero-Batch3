// Backend/validations/admin.validation.js
//
// Express-validator rules for all Developer A M4 admin endpoints.
//
// SECURITY RULES:
//   - Client MUST NOT provide: admin_id, suspendedBy, removedBy, timestamps,
//     ip_address, user_agent. These are derived server-side.
//   - All IDs are validated as MongoDB ObjectIds.
//   - role enum is strictly enforced.
//   - suspensionReason is required when suspending, optional when unsuspending.
//   - Search strings are trimmed and length-limited to prevent abuse.
//   - Pagination uses the same capped-limit pattern as buildQuery.js (max 100).
//   - Date range inputs are validated as ISO 8601 dates.

const { body, query, param } = require('express-validator');
const { validate } = require('./opportunity.validation'); // reuse the existing validate() helper

// Re-export the validate() helper so admin routes can import both from one file
module.exports.validate = validate;

// ── Shared helpers ───────────────────────────────────────────────────────────

const VALID_ROLES = ['volunteer', 'ngo', 'admin'];
const VALID_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'email', 'role'];
const VALID_AUDIT_ACTIONS = [
  'USER_SUSPENDED',
  'USER_UNSUSPENDED',
  'USER_ROLE_CHANGED',
  'OPPORTUNITY_REMOVED',
  'OPPORTUNITY_RESTORED',
  'PICKUP_STATUS_OVERRIDE',
  'REPORT_DOWNLOADED',
];
const VALID_TARGET_TYPES = ['User', 'Opportunity', 'Pickup', 'Report'];

// ── :id param ────────────────────────────────────────────────────────────────

/**
 * Validate that route :id is a valid MongoDB ObjectId.
 */
const userIdParam = () => [
  param('id')
    .isMongoId()
    .withMessage('User ID must be a valid MongoDB ObjectId.'),
];

const opportunityIdParam = () => [
  param('id')
    .isMongoId()
    .withMessage('Opportunity ID must be a valid MongoDB ObjectId.'),
];

// ── GET /admin/users ─────────────────────────────────────────────────────────

/**
 * Validate query params for paginated user listing.
 */
const userListQueryRules = () => [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer.')
    .toInt(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100.')
    .toInt(),

  query('role')
    .optional()
    .isIn(VALID_ROLES)
    .withMessage(`role must be one of: ${VALID_ROLES.join(', ')}.`),

  query('isSuspended')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('isSuspended must be "true" or "false".'),

  query('search')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('search must be at most 100 characters.'),

  query('sort')
    .optional()
    .isIn(VALID_SORT_FIELDS)
    .withMessage(`sort must be one of: ${VALID_SORT_FIELDS.join(', ')}.`),

  query('order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('order must be "asc" or "desc".'),
];

// ── PATCH /admin/users/:id/suspend ───────────────────────────────────────────

/**
 * Validate the suspend/unsuspend request body.
 *
 * When suspend = true:  reason is required (max 255 chars).
 * When suspend = false: reason is optional.
 *
 * STRICT BOOLEAN ENFORCEMENT:
 *   - suspend must be a literal JSON boolean (true / false).
 *   - String "true", number 1, or null are all rejected with 400.
 *   - Missing suspend field is rejected with 400 (field is required).
 *
 * FORBIDDEN fields: admin_id, suspendedBy, suspendedAt, ip_address, user_agent
 * (these are derived server-side and must never come from the client body).
 */
const suspendUserRules = () => [
  // Required — missing suspend (absent or null) must return 400, not silently
  // fall through and be treated as false by the controller.
  body('suspend')
    .exists({ checkNull: true })
    .withMessage('suspend is required.')
    .isBoolean({ strict: true })
    .withMessage('suspend must be a boolean (true or false).')
    .toBoolean(),

  // reason is required when suspend === true (after toBoolean conversion).
  // We use a .custom() cross-field check rather than .if().equals(true) because
  // .equals() in express-validator compares strings, not post-toBoolean values.
  body('reason').custom((reason, { req }) => {
    // Only enforce when suspend is explicitly true after coercion.
    // req.body.suspend is the raw value at this point; toBoolean() runs after
    // all field validators execute, so we coerce manually here.
    const suspendVal = req.body && req.body.suspend;
    const isSuspending = suspendVal === true || suspendVal === 'true';
    if (isSuspending) {
      if (reason === undefined || reason === null || String(reason).trim() === '') {
        throw new Error('reason is required when suspending a user.');
      }
      if (typeof reason !== 'string' || reason.trim().length > 255) {
        throw new Error('reason must be a string of at most 255 characters.');
      }
    }
    return true;
  }),

  // Reject forbidden server-side fields from the request body
  body('admin_id').not().exists().withMessage('admin_id must not be provided by the client.'),
  body('suspendedBy').not().exists().withMessage('suspendedBy must not be provided by the client.'),
  body('suspendedAt').not().exists().withMessage('suspendedAt must not be provided by the client.'),
  body('ip_address').not().exists().withMessage('ip_address must not be provided by the client.'),
  body('user_agent').not().exists().withMessage('user_agent must not be provided by the client.'),
];

// ── PATCH /admin/users/:id/role ──────────────────────────────────────────────

/**
 * Validate the role update request body.
 *
 * role is required and must be one of the allowed enum values.
 * A missing, null, or empty role returns 400 — never reaches the service layer.
 */
const updateRoleRules = () => [
  body('role')
    .exists({ checkNull: true })
    .withMessage('role is required.')
    .notEmpty()
    .withMessage('role must not be empty.')
    .isIn(VALID_ROLES)
    .withMessage(`role must be one of: ${VALID_ROLES.join(', ')}.`),

  // Reject forbidden server-side fields
  body('admin_id').not().exists().withMessage('admin_id must not be provided by the client.'),
];

// ── DELETE /admin/opportunities/:id ─────────────────────────────────────────

/**
 * Validate the opportunity removal request body.
 * reason is optional (max 255 chars if provided).
 *
 * FORBIDDEN: removedBy, removedAt, isRemovedByAdmin — all set server-side.
 */
const removeOpportunityRules = () => [
  body('reason')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 255 })
    .withMessage('reason must be at most 255 characters.'),

  body('removedBy').not().exists().withMessage('removedBy must not be provided by the client.'),
  body('removedAt').not().exists().withMessage('removedAt must not be provided by the client.'),
  body('isRemovedByAdmin').not().exists().withMessage('isRemovedByAdmin must not be provided by the client.'),
];

// ── PATCH /admin/opportunities/:id/restore ───────────────────────────────────

/**
 * Restore has no required body fields.
 * Reject any attempt to inject server-controlled fields.
 */
const restoreOpportunityRules = () => [
  body('isRemovedByAdmin').not().exists().withMessage('isRemovedByAdmin must not be provided by the client.'),
  body('removedBy').not().exists().withMessage('removedBy must not be provided by the client.'),
];

// ── GET /admin/logs ──────────────────────────────────────────────────────────

/**
 * Validate query params for audit log retrieval.
 */
const auditLogQueryRules = () => [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer.')
    .toInt(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100.')
    .toInt(),

  query('action')
    .optional()
    .isIn(VALID_AUDIT_ACTIONS)
    .withMessage(`action must be one of: ${VALID_AUDIT_ACTIONS.join(', ')}.`),

  query('target_type')
    .optional()
    .isIn(VALID_TARGET_TYPES)
    .withMessage(`target_type must be one of: ${VALID_TARGET_TYPES.join(', ')}.`),

  query('target_id')
    .optional()
    .isMongoId()
    .withMessage('target_id must be a valid MongoDB ObjectId.'),

  query('adminId')
    .optional()
    .isMongoId()
    .withMessage('adminId must be a valid MongoDB ObjectId.'),

  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('startDate must be a valid ISO 8601 date (YYYY-MM-DD).')
    .toDate(),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('endDate must be a valid ISO 8601 date (YYYY-MM-DD).')
    .toDate(),

  // Cross-field: startDate must not be after endDate
  query('startDate').custom((startDate, { req }) => {
    const endDate = req.query && req.query.endDate;
    if (!startDate || !endDate) return true;       // single-sided range is fine
    const start = new Date(startDate);
    const end   = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return true; // let isISO8601 report format errors
    if (start > end) {
      throw new Error('startDate must be before or equal to endDate.');
    }
    return true;
  }),
];

module.exports.userIdParam = userIdParam;
module.exports.opportunityIdParam = opportunityIdParam;
module.exports.userListQueryRules = userListQueryRules;
module.exports.suspendUserRules = suspendUserRules;
module.exports.updateRoleRules = updateRoleRules;
module.exports.removeOpportunityRules = removeOpportunityRules;
module.exports.restoreOpportunityRules = restoreOpportunityRules;
module.exports.auditLogQueryRules = auditLogQueryRules;
