// Backend/validations/volunteerReport.validation.js
//
// Input validation for volunteer-facing report endpoints.
//
// VALIDATES:
//   - type:      'applications' | 'opportunities'
//   - timeRange: 'all' | 'week' | 'month' | 'year' | 'custom'
//   - year:      4-digit year (required when timeRange='year' or 'month')
//   - month:     1-12 (required when timeRange='month')
//   - startDate / endDate: YYYY-MM-DD (required when timeRange='custom')
//   - format:   'csv' | 'xlsx' | 'pdf' (download endpoint only)
//   - page / limit: pagination (browse endpoint only)

const { param, query, validationResult } = require('express-validator');
const { VALID_TIME_RANGES } = require('../utils/timeRange.utils');
const { VOLUNTEER_REPORT_TYPES } = require('../services/volunteerReport.service');

const VALID_FORMATS = ['csv', 'xlsx', 'pdf'];

/**
 * Validate :type URL parameter.
 */
const volunteerReportTypeParam = () =>
  param('type')
    .trim()
    .notEmpty()
    .withMessage('Report type is required.')
    .isIn(VOLUNTEER_REPORT_TYPES)
    .withMessage(`Report type must be one of: ${VOLUNTEER_REPORT_TYPES.join(', ')}.`);

/**
 * Shared time-range query rules — used by both browse and download.
 */
const timeRangeQueryRules = () => [
  query('timeRange')
    .optional({ checkFalsy: true })
    .trim()
    .isIn(VALID_TIME_RANGES)
    .withMessage(`timeRange must be one of: ${VALID_TIME_RANGES.join(', ')}.`),

  // year — 4-digit integer, valid range
  query('year')
    .optional({ checkFalsy: true })
    .isInt({ min: 2000, max: 2100 })
    .withMessage('year must be a 4-digit number between 2000 and 2100.')
    .toInt(),

  // month — 1-12 integer
  query('month')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 12 })
    .withMessage('month must be between 1 and 12.')
    .toInt(),

  // startDate / endDate — required when timeRange=custom, valid YYYY-MM-DD
  query('startDate')
    .optional({ checkFalsy: true })
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('startDate must be in YYYY-MM-DD format.')
    .custom((value) => {
      if (isNaN(new Date(value).getTime())) throw new Error('startDate is not a valid date.');
      return true;
    }),

  query('endDate')
    .optional({ checkFalsy: true })
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('endDate must be in YYYY-MM-DD format.')
    .custom((value) => {
      if (isNaN(new Date(value).getTime())) throw new Error('endDate is not a valid date.');
      return true;
    })
    .custom((endDate, { req }) => {
      const start = req.query.startDate;
      if (start && endDate && new Date(start) > new Date(endDate)) {
        throw new Error('startDate cannot be after endDate.');
      }
      return true;
    }),

  // When timeRange=custom, startDate is required
  query('startDate').custom((value, { req }) => {
    if (req.query.timeRange === 'custom' && !value && !req.query.endDate) {
      throw new Error('At least one of startDate or endDate is required when timeRange is "custom".');
    }
    return true;
  }),
];

/**
 * Browse-specific rules: pagination only (format is not relevant for browse).
 */
const volunteerBrowseQueryRules = () => [
  ...timeRangeQueryRules(),

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

/**
 * Download-specific rules: format is required.
 */
const volunteerDownloadQueryRules = () => [
  query('format')
    .trim()
    .notEmpty()
    .withMessage('Export format is required.')
    .isIn(VALID_FORMATS)
    .withMessage(`format must be one of: ${VALID_FORMATS.join(', ')}.`),

  ...timeRangeQueryRules(),
];

/**
 * Express validation error handler — returns 400 with first validation error.
 */
const validateVolunteerReport = (req, res, next) => {
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

module.exports = {
  volunteerReportTypeParam,
  volunteerBrowseQueryRules,
  volunteerDownloadQueryRules,
  validateVolunteerReport,
  VALID_FORMATS,
  VALID_TIME_RANGES,
};
