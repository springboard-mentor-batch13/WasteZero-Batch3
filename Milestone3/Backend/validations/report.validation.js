// Backend/validations/report.validation.js
//
// Input validation for the report download endpoint and its companion
// "browse before you download" endpoints.
//
// VALIDATES:
//   - format: must be 'csv' | 'xlsx' | 'pdf'
//   - type:   must be 'users' | 'pickups' | 'opportunities' | 'applications' | 'full-activity'
//   - startDate / endDate: YYYY-MM-DD format, startDate must not be after endDate
//   - ngoUsername / volunteerUsername: scoping filters — admins identify people by
//     username, NEVER by raw Mongo ObjectId. report.service.js resolves the
//     username to an internal ID.
//   - opportunityId: still an actual ID, since it comes from clicking an item
//     in the opportunity dropdown (not something an admin types by hand).

const { param, query, validationResult } = require('express-validator');

const VALID_FORMATS = ['csv', 'xlsx', 'pdf'];
const VALID_TYPES   = ['users', 'pickups', 'opportunities', 'applications', 'full-activity'];
const OBJECT_ID_RE  = /^[0-9a-fA-F]{24}$/;

/**
 * Validate the :type URL parameter (used by both download and browse routes).
 */
const reportTypeParam = () =>
  param('type')
    .trim()
    .notEmpty()
    .withMessage('Report type is required.')
    .isIn(VALID_TYPES)
    .withMessage(
      `Report type must be one of: ${VALID_TYPES.join(', ')}.`
    );

/**
 * Shared date + scoping query rules — reused by download and browse endpoints.
 */
const sharedQueryRules = () => [
  query('startDate')
    .optional({ checkFalsy: true })
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('startDate must be in YYYY-MM-DD format.')
    .custom((value) => {
      const d = new Date(value);
      if (isNaN(d.getTime())) throw new Error('startDate is not a valid date.');
      return true;
    }),

  query('endDate')
    .optional({ checkFalsy: true })
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('endDate must be in YYYY-MM-DD format.')
    .custom((value) => {
      const d = new Date(value);
      if (isNaN(d.getTime())) throw new Error('endDate is not a valid date.');
      return true;
    })
    .custom((endDate, { req }) => {
      const startDate = req.query.startDate;
      if (startDate && endDate) {
        if (new Date(startDate) > new Date(endDate)) {
          throw new Error('startDate cannot be after endDate.');
        }
      }
      return true;
    }),

  query('ngoUsername')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('ngoUsername must be between 1 and 50 characters.'),

  query('volunteerUsername')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('volunteerUsername must be between 1 and 50 characters.'),

  query('opportunityId')
    .optional({ checkFalsy: true })
    .matches(OBJECT_ID_RE)
    .withMessage('opportunityId must be a valid ID.'),
];

/**
 * Validate query parameters for the DOWNLOAD endpoint:
 * format is required; applications scoping validation included.
 */
const reportQueryRules = () => [
  query('format')
    .trim()
    .notEmpty()
    .withMessage('Export format is required.')
    .isIn(VALID_FORMATS)
    .withMessage(`Format must be one of: ${VALID_FORMATS.join(', ')}.`),

  ...sharedQueryRules(),

  // The 'applications' report type is always scoped — reject unscoped requests.
  query('opportunityId').custom((value, { req }) => {
    if (req.params.type === 'applications' && !value && !req.query.ngoUsername) {
      throw new Error(
        'The applications report requires either opportunityId (a single opportunity) or ngoUsername (all of an NGO\'s opportunities).'
      );
    }
    return true;
  }),
];

/**
 * Validate query parameters for the BROWSE (preview) endpoint.
 * Format is NOT required here — preview always returns JSON.
 * The applications scoping rule still applies.
 */
const browseQueryRules = () => [
  ...sharedQueryRules(),

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

  // applications preview requires the same scoping as the download
  query('opportunityId').custom((value, { req }) => {
    if (req.params.type === 'applications' && !value && !req.query.ngoUsername) {
      throw new Error(
        'The applications preview requires either opportunityId or ngoUsername.'
      );
    }
    return true;
  }),
];

/**
 * Express validation error handler middleware.
 * Returns 400 with first validation error message.
 */
const validateReport = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      errors:  errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

/**
 * Validate month parameter for recycling breakdown endpoint.
 * Expected format: YYYY-MM
 */
const monthQueryRule = () =>
  query('month')
    .optional({ checkFalsy: true })
    .matches(/^\d{4}-\d{2}$/)
    .withMessage('month must be in YYYY-MM format.')
    .custom((value) => {
      const [year, month] = value.split('-').map(Number);
      if (month < 1 || month > 12) throw new Error('month value must be between 01 and 12.');
      if (year < 2020 || year > 2100) throw new Error('year must be between 2020 and 2100.');
      return true;
    });

// ─────────────────────────────────────────────────────────────────────────────
// Legacy "Browse before download" validators (kept for backward-compat routes)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/reports/browse/opportunities?ngoUsername=<username>
 */
const browseOpportunitiesByNgoRules = () => [
  query('ngoUsername')
    .trim()
    .notEmpty()
    .withMessage('ngoUsername is required.')
    .isLength({ min: 1, max: 50 })
    .withMessage('ngoUsername must be between 1 and 50 characters.'),
];

/**
 * GET /api/v1/admin/reports/browse/opportunities/:opportunityId/applications
 */
const opportunityIdParam = () =>
  param('opportunityId')
    .isMongoId()
    .withMessage('opportunityId must be a valid ID.');

/**
 * Pagination query params shared by legacy browse endpoints.
 */
const paginationQueryRules = () => [
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
];

module.exports = {
  reportTypeParam,
  reportQueryRules,
  browseQueryRules,
  validateReport,
  monthQueryRule,
  browseOpportunitiesByNgoRules,
  opportunityIdParam,
  paginationQueryRules,
  VALID_FORMATS,
  VALID_TYPES,
};
