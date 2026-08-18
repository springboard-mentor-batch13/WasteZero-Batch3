// Backend/routes/volunteerReport.routes.js
//
// ── Volunteer Report Routes ───────────────────────────────────────────────────
//
// MOUNTING (in server.js):
//   app.use('/api/v1/reports', volunteerReportRoutes);
//
// ROUTES:
//   GET /api/v1/reports/options
//       → Returns available report types, time ranges, and download formats
//         for the volunteer UI selector. No heavy DB call — purely config.
//
//   GET /api/v1/reports/browse/:type
//       → Paginated JSON preview of the volunteer's own records.
//         Frontend uses this to display the table BEFORE downloading.
//         ?timeRange=all|week|month|year|custom
//         &year=YYYY &month=MM (with timeRange=month/year)
//         &startDate=YYYY-MM-DD &endDate=YYYY-MM-DD (with timeRange=custom)
//         &page=1 &limit=20
//
//   GET /api/v1/reports/download/:type
//       → Streams a file (CSV, XLSX, PDF) to the client.
//         Same time-range params as browse, plus:
//         &format=csv|xlsx|pdf  (required)
//         Rate-limited: 10 downloads/hour per volunteer.
//
// SECURITY:
//   - protect:           JWT authentication (req.user populated)
//   - requireVolunteer:  Role guard — only 'volunteer' role proceeds
//   - generalLimiter:    Applied to browse (30 req / 10 min)
//   - volunteerReportDlLimiter: Applied to download (10 req / hour)

const express = require('express');
const router  = express.Router();

const { protect }         = require('../middlewares/auth.middleware');
const { generalLimiter, volunteerReportDlLimiter } = require('../middlewares/rateLimiter.middleware');

const volunteerReportController = require('../controllers/volunteerReport.controller');

const {
  volunteerReportTypeParam,
  volunteerBrowseQueryRules,
  volunteerDownloadQueryRules,
  validateVolunteerReport,
} = require('../validations/volunteerReport.validation');

// ─────────────────────────────────────────────────────────────────────────────
// Role guard — volunteer only
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inline role guard: only users with role='volunteer' reach these endpoints.
 * Kept inline (not in rbac.middleware.js) so the volunteer-specific error
 * message is clear and the admin rbac file stays admin-only.
 */
const requireVolunteer = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  if (req.user.role !== 'volunteer') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. This section is for volunteers only.',
    });
  }
  next();
};

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/reports/options
 *
 * Returns the available report types, time-range selectors, and download
 * format options so the frontend can build the selector UI dynamically
 * without hardcoding role logic client-side.
 *
 * Response:
 *   {
 *     success: true,
 *     data: {
 *       reportTypes: [{ value, label }],
 *       timeRanges:  [{ value, label }],
 *       formats:     [{ value, label }],
 *     }
 *   }
 */
router.get(
  '/options',
  protect,
  requireVolunteer,
  volunteerReportController.getReportOptions,
);

/**
 * GET /api/v1/reports/browse/:type
 *
 * Paginated preview of the volunteer's own records. Returned as JSON so the
 * frontend can render a live table before the volunteer decides to download.
 *
 * URL Params:
 *   type — 'applications' | 'opportunities'
 *
 * Query Params (all optional):
 *   timeRange  — 'all' | 'week' | 'month' | 'year' | 'custom'  (default: 'all')
 *   year       — 4-digit year (used with timeRange=year or month)
 *   month      — 1–12 (used with timeRange=month)
 *   startDate  — YYYY-MM-DD (used with timeRange=custom)
 *   endDate    — YYYY-MM-DD (used with timeRange=custom)
 *   page       — default 1
 *   limit      — default 20, max 100
 *
 * Response:
 *   {
 *     success: true,
 *     data: {
 *       records: [...], total, page, limit, totalPages,
 *       summary: { ... },          // e.g. { totalApplications, pending, accepted, rejected }
 *       columns: [{ header, key }],
 *       dateRange: '2026-01-01 → 2026-01-07',
 *       timeRange: 'week',
 *     }
 *   }
 */
router.get(
  '/browse/:type',
  protect,
  requireVolunteer,
  generalLimiter,
  volunteerReportTypeParam(),
  volunteerBrowseQueryRules(),
  validateVolunteerReport,
  volunteerReportController.browseReport,
);

/**
 * GET /api/v1/reports/download/:type
 *
 * Stream a report file (CSV / XLSX / PDF) to the client.
 *
 * URL Params:
 *   type — 'applications' | 'opportunities'
 *
 * Query Params:
 *   format     (required) — 'csv' | 'xlsx' | 'pdf'
 *   timeRange  — same semantics as browse (default: 'all')
 *   year, month, startDate, endDate — same as browse
 *
 * Response:
 *   Binary stream with Content-Type and Content-Disposition headers.
 *   Errors after streaming starts cannot be sent as JSON; they are logged
 *   server-side and the download will be incomplete/corrupt on the client.
 *
 * Rate limit: 10 downloads per hour per volunteer.
 */
router.get(
  '/download/:type',
  protect,
  requireVolunteer,
  volunteerReportDlLimiter,
  volunteerReportTypeParam(),
  volunteerDownloadQueryRules(),
  validateVolunteerReport,
  volunteerReportController.downloadReport,
);

module.exports = router;
