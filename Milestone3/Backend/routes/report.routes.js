// Backend/routes/report.routes.js
//
// ── Report Download + Browse Routes ──────────────────────────────────────────
//
// Developer B owns all routes in this file.
//
// ROUTES:
//   GET /api/v1/admin/reports/browse/:type          ← NEW generic preview
//   GET /api/v1/admin/reports/browse/opportunities  ← legacy dropdown helper
//   GET /api/v1/admin/reports/browse/opportunities/:opportunityId/applications ← legacy
//   GET /api/v1/admin/reports/:type                 ← download
//
// ROUTE ORDER MATTERS:
//   Specific /browse/... paths are registered before the generic /browse/:type
//   and /:type routes so Express doesn't swallow them as param values.
//
// MOUNTING (in server.js):
//   app.use('/api/v1/admin/reports', reportRoutes);
//
// SECURITY:
//   - protect:           JWT authentication
//   - requireAdmin:      Role check (admin only)
//   - adminLimiter:      5 req/min per admin — applied to all /browse/* routes
//   - reportRateLimiter: Max 5 downloads/hour per admin — download route only

const express = require('express');
const router  = express.Router();

const { protect }           = require('../middlewares/auth.middleware');
const { requireAdmin }      = require('../middlewares/rbac.middleware');
const { reportRateLimiter, adminLimiter } = require('../middlewares/rateLimiter.middleware');

const reportController = require('../controllers/report.controller');

const {
  reportTypeParam,
  reportQueryRules,
  browseQueryRules,
  validateReport,
  browseOpportunitiesByNgoRules,
  opportunityIdParam,
  paginationQueryRules,
} = require('../validations/report.validation');

// ─────────────────────────────────────────────────────────────────────────────
// Legacy browse endpoints (kept for backward-compat)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/reports/browse/opportunities?ngoUsername=<username>
 *
 * List every opportunity created by one NGO (with application counts).
 * Used to populate the opportunity-picker dropdown in the legacy applications
 * flow. New frontend code should prefer /browse/opportunities (generic preview).
 */
router.get(
  '/browse/opportunities',
  protect,
  requireAdmin,
  adminLimiter,
  browseOpportunitiesByNgoRules(),
  validateReport,
  reportController.browseOpportunitiesByNgo
);

/**
 * GET /api/v1/admin/reports/browse/opportunities/:opportunityId/applications
 *
 * Paginated preview of one opportunity's applications (legacy; retained for
 * backward-compat). New code should prefer /browse/applications?opportunityId=.
 */
router.get(
  '/browse/opportunities/:opportunityId/applications',
  protect,
  requireAdmin,
  adminLimiter,
  opportunityIdParam(),
  paginationQueryRules(),
  validateReport,
  reportController.browseApplicationsForOpportunity
);

// ─────────────────────────────────────────────────────────────────────────────
// Generic browse-before-download (new — covers ALL report types)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/reports/browse/:type
 *
 * Paginated preview of any report type — returned as JSON so the admin can
 * inspect the data before committing to a download.
 *
 * URL Params:
 *   type — 'users' | 'pickups' | 'opportunities' | 'applications' | 'full-activity'
 *
 * Query Params (all optional unless noted):
 *   page              — default 1
 *   limit             — default 20, max 100
 *   startDate         — YYYY-MM-DD
 *   endDate           — YYYY-MM-DD
 *   ngoUsername       — scope 'opportunities' or 'applications' to one NGO
 *   volunteerUsername — scope 'pickups' to one volunteer
 *   opportunityId     — scope 'applications' to one opportunity
 *                       (required for type=applications unless ngoUsername given)
 *
 * NOTE: `format` is intentionally NOT accepted here — preview always returns JSON.
 *       Format is only relevant at download time.
 *
 * Response:
 *   {
 *     success: true,
 *     data: {
 *       records: [...],      // one page of raw documents
 *       total: <number>,     // total matching count
 *       page, limit, totalPages,
 *       columns: [{ header, key }]  // column definitions for the table header
 *     }
 *   }
 *
 * Errors:
 *   400 — Invalid type / date / scoping params
 *   401 — Not authenticated
 *   403 — Not admin
 *   404 — ngoUsername / volunteerUsername doesn't match any user
 *   429 — Rate limit exceeded
 */
router.get(
  '/browse/:type',
  protect,
  requireAdmin,
  adminLimiter,
  reportTypeParam(),
  browseQueryRules(),
  validateReport,
  reportController.browseReport
);

// ─────────────────────────────────────────────────────────────────────────────
// Download
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/reports/:type
 *
 * Download a report in CSV, XLSX, or PDF format.
 *
 * URL Params:
 *   type  — 'users' | 'pickups' | 'opportunities' | 'applications' | 'full-activity'
 *
 * Query Params:
 *   format            (required) — 'csv' | 'xlsx' | 'pdf'
 *   startDate         (optional) — YYYY-MM-DD
 *   endDate           (optional) — YYYY-MM-DD
 *   ngoUsername       (optional) — scope 'opportunities' to one NGO's own opportunities,
 *                                  or scope 'applications' to all of one NGO's applications
 *   opportunityId     (optional) — scope 'applications' to a single opportunity
 *                                  (required for 'applications' unless ngoUsername is given)
 *   volunteerUsername (optional) — scope 'pickups' to one volunteer's requests
 *
 * Response:
 *   Binary stream with appropriate Content-Type and Content-Disposition headers.
 *
 * Errors:
 *   400 — Invalid type / format / date / username parameters
 *   401 — Not authenticated
 *   403 — Not admin
 *   404 — ngoUsername / volunteerUsername doesn't match any user
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
