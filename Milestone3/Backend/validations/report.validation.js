// Backend/validations/report.validation.js
//
// Input validation for the report download endpoint.
//
// VALIDATES:
//   - format: must be 'csv' | 'xlsx' | 'pdf'
//   - type:   must be 'users' | 'pickups' | 'opportunities' | 'full-activity'
//   - startDate / endDate: YYYY-MM-DD format
//   - startDate must not be after endDate

const { param, query, validationResult } = require('express-validator');

const VALID_FORMATS = ['csv', 'xlsx', 'pdf'];
const VALID_TYPES   = ['users', 'pickups', 'opportunities', 'full-activity'];

/**
 * Validate the :type URL parameter.
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
 * Validate query parameters: format, startDate, endDate.
 */
const reportQueryRules = () => [
  query('format')
    .trim()
    .notEmpty()
    .withMessage('Export format is required.')
    .isIn(VALID_FORMATS)
    .withMessage(`Format must be one of: ${VALID_FORMATS.join(', ')}.`),

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

module.exports = {
  reportTypeParam,
  reportQueryRules,
  validateReport,
  monthQueryRule,
  VALID_FORMATS,
  VALID_TYPES,
};
