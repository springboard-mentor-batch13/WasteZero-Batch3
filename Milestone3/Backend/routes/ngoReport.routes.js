// Backend/routes/ngoReport.routes.js
//
// ── NGO Report Routes ─────────────────────────────────────────────────────────
//
// MOUNTING (in server.js):
//   app.use('/api/v1/ngo/reports', ngoReportRoutes);
//
// ROUTES:
//   GET /api/v1/ngo/reports/options
//       → Returns available report types, time ranges, and download formats
//         for the NGO UI selector. No heavy DB call — purely config.
//
//   GET /api/v1/ngo/reports/browse/:type
//       → Paginated JSON preview of the NGO's own records.
//         Frontend uses this to display the table BEFORE downloading.
//         ?timeRange=all|week|month|year|custom
//         &year=YYYY &month=MM (with timeRange=month/year)
//         &startDate=YYYY-MM-DD &endDate=YYYY-MM-DD (with timeRange=custom)
//         &page=1 &limit=20
//
//   GET /api/v1/ngo/reports/download/:type
//       → Streams a file (CSV, XLSX, PDF) to the client.
//         Same time-range params as browse, plus:
//         &format=csv|xlsx|pdf  (required)
//         Rate-limited: 10 downloads/hour per NGO.
//
// SECURITY:
//   - protect:           JWT authentication (req.user populated)
//   - requireNgo:        Role guard — only 'ngo' role proceeds
//   - generalLimiter:    Applied to browse (30 req / 10 min)
//   - ngoReportDlLimiter: Applied to download (10 req / hour)
//
// SCOPE:
//   'opportunities' — only opportunities where ngo_id = req.user.id
//   'applications'  — only applications against that NGO's own opportunities
//   'pickups'       — only pickups where agent_id = req.user.id (assigned to this NGO)
//   No parameter can override these — they are enforced at the DB query level
//   in ngoReport.service.js.

const express = require('express');
const router  = express.Router();

const { protect }         = require('../middlewares/auth.middleware');
const { generalLimiter, ngoReportDlLimiter } = require('../middlewares/rateLimiter.middleware');

const ngoReportController = require('../controllers/ngoReport.controller');

const {
  ngoReportTypeParam,
  ngoBrowseQueryRules,
  ngoDownloadQueryRules,
  validateNgoReport,
} = require('../validations/ngoReport.validation');

// ─────────────────────────────────────────────────────────────────────────────
// Role guard — NGO only
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inline role guard: only users with role='ngo' reach these endpoints.
 * Kept inline (mirrors requireVolunteer in volunteerReport.routes.js) so the
 * NGO-specific error message is clear and the admin rbac file stays admin-only.
 */
const requireNgo = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  if (req.user.role !== 'ngo') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. This section is for NGOs only.',
    });
  }
  next();
};

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/ngo/reports/options
 */
router.get(
  '/options',
  protect,
  requireNgo,
  ngoReportController.getReportOptions,
);

/**
 * GET /api/v1/ngo/reports/browse/:type
 *
 * URL Params:
 *   type — 'opportunities' | 'applications' | 'pickups'
 */
router.get(
  '/browse/:type',
  protect,
  requireNgo,
  generalLimiter,
  ngoReportTypeParam(),
  ngoBrowseQueryRules(),
  validateNgoReport,
  ngoReportController.browseReport,
);

/**
 * GET /api/v1/ngo/reports/download/:type
 *
 * URL Params:
 *   type — 'opportunities' | 'applications' | 'pickups'
 *
 * Query Params:
 *   format     (required) — 'csv' | 'xlsx' | 'pdf'
 *   timeRange  — same semantics as browse (default: 'all')
 *   year, month, startDate, endDate — same as browse
 *
 * Rate limit: 10 downloads per hour per NGO.
 */
router.get(
  '/download/:type',
  protect,
  requireNgo,
  ngoReportDlLimiter,
  ngoReportTypeParam(),
  ngoDownloadQueryRules(),
  validateNgoReport,
  ngoReportController.downloadReport,
);

module.exports = router;
