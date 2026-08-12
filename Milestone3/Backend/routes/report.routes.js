// Backend/routes/report.routes.js
//
// ── Report Download Routes ────────────────────────────────────────────────────
//
// Developer B owns all routes in this file.
//
// ROUTE:
//   GET /api/v1/admin/reports/:type
//
// MIDDLEWARE CHAIN:
//   protect → requireAdmin → reportRateLimiter → [validation] → downloadReport
//
// MOUNTING (in server.js):
//   app.use('/api/v1/admin/reports', reportRoutes);
//
// SECURITY:
//   - protect:           JWT authentication
//   - requireAdmin:      Role check (admin only)
//   - reportRateLimiter: Max 5 downloads/hour per admin (defined by Developer A)
//   - validation:        Type param + format/date query validation

const express = require('express');
const router  = express.Router();

const { protect }           = require('../middlewares/auth.middleware');
const { requireAdmin }      = require('../middlewares/rbac.middleware');
const { reportRateLimiter } = require('../middlewares/rateLimiter.middleware');

const reportController = require('../controllers/report.controller');

const {
  reportTypeParam,
  reportQueryRules,
  validateReport,
} = require('../validations/report.validation');

/**
 * GET /api/v1/admin/reports/:type
 *
 * Download a report in CSV, XLSX, or PDF format.
 *
 * URL Params:
 *   type  — 'users' | 'pickups' | 'opportunities' | 'full-activity'
 *
 * Query Params:
 *   format    (required) — 'csv' | 'xlsx' | 'pdf'
 *   startDate (optional) — YYYY-MM-DD
 *   endDate   (optional) — YYYY-MM-DD
 *
 * Response:
 *   Binary stream with appropriate Content-Type and Content-Disposition headers.
 *
 * Errors:
 *   400 — Invalid type / format / date parameters
 *   401 — Not authenticated
 *   403 — Not admin
 *   429 — Rate limit exceeded (5 downloads/hour)
 *   500 — Export failure
 */
router.get(
  '/:type',
  protect,
  requireAdmin,
  reportRateLimiter,
  reportTypeParam(),
  reportQueryRules(),
  validateReport,
  reportController.downloadReport
);

module.exports = router;
