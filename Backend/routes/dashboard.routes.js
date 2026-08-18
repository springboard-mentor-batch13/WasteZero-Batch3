// Backend/routes/dashboard.routes.js
//
// ── Dashboard & Analytics Routes ─────────────────────────────────────────────
//
// Developer B owns all routes in this file.
//
// ROUTE INVENTORY:
//
//   Admin-only (protect + requireAdmin + adminLimiter):
//     GET /api/v1/admin/dashboard/stats      → KPI statistics with growth
//                                               (users/pickups/opportunities/
//                                               applications/waste) — also the
//                                               live-polling endpoint (30–60s)
//     GET /api/v1/stats/waste-analytics      → WasteStats platform analytics
//     GET /api/v1/stats/yearly-trends        → Yearly trend data
//     GET /api/v1/admin/dashboard/summary-reports → User/Opportunity/Application summary + charts
//
//   Volunteer | NGO only (protect + blockAdmin):
//     GET /api/v1/dashboard/metrics          → Personal dashboard metrics (403 for admin)
//
//   All authenticated users (protect only):
//     GET /api/v1/dashboard/upcoming         → Upcoming opportunities + pickups (separate lists)
//     GET /api/v1/dashboard/summary-reports  → Role-scoped summary reports + pie charts
//     GET /api/v1/stats/leaderboard          → Top-contributors leaderboard (own rank included)
//     GET /api/v1/stats/recycling-breakdown  → Waste category breakdown
//     GET /api/v1/stats/monthly-trends       → Monthly chart data
//     GET /api/v1/stats/weekly-trends        → Weekly chart data
//     GET /api/v1/stats/daily-trends         → Daily chart data
//     GET /api/v1/stats/co2-factors          → CO₂ conversion factors
//
// MOUNTING (in server.js):
//   app.use('/api/v1', dashboardRoutes);
//
// This makes all paths resolve as:
//   /api/v1/admin/dashboard/stats
//   /api/v1/dashboard/metrics
//   /api/v1/stats/*

const express = require('express');
const router  = express.Router();

const { protect }      = require('../middlewares/auth.middleware');
const { requireAdmin, blockAdmin } = require('../middlewares/rbac.middleware');
const { adminLimiter, generalLimiter } = require('../middlewares/rateLimiter.middleware');

const dashboardController = require('../controllers/dashboard.controller');

const {
  monthQueryRule,
  validateReport,
} = require('../validations/report.validation');

// ── Admin-only dashboard stats ───────────────────────────────────────────────

/**
 * GET /api/v1/admin/dashboard/stats
 * Admin KPI metrics with month-over-month growth.
 */
router.get(
  '/admin/dashboard/stats',
  protect,
  requireAdmin,
  adminLimiter,
  dashboardController.getAdminDashboardStats
);

/**
 * GET /api/v1/stats/waste-analytics
 * Full WasteStats analytics: category breakdown, trends, top contributors.
 */
router.get(
  '/stats/waste-analytics',
  protect,
  requireAdmin,
  adminLimiter,
  dashboardController.getWasteAnalytics
);

/**
 * GET /api/v1/stats/yearly-trends?years=5
 * Yearly aggregation data for Clustered Column Chart.
 */
router.get(
  '/stats/yearly-trends',
  protect,
  requireAdmin,
  adminLimiter,
  dashboardController.getYearlyTrends
);

/**
 * GET /api/v1/admin/dashboard/summary-reports
 * Simple admin summary reports: User Report, Opportunity Report, and
 * Volunteer Response (Application) Report — plus chart-ready { labels, data }
 * for a bar/pie chart of each.
 */
router.get(
  '/admin/dashboard/summary-reports',
  protect,
  requireAdmin,
  adminLimiter,
  dashboardController.getSummaryReports
);

// ── All authenticated users ──────────────────────────────────────────────────

/**
 * GET /api/v1/dashboard/metrics
 * Personal dashboard metrics for the authenticated user.
 * Volunteer / NGO only — admin has no personal metrics here, use
 * /api/v1/admin/dashboard/stats instead.
 */
router.get(
  '/dashboard/metrics',
  protect,
  blockAdmin,
  generalLimiter,
  dashboardController.getUserDashboardMetrics
);

/**
 * GET /api/v1/dashboard/upcoming?limit=10
 * "Upcoming Events" widgets — upcoming opportunities and upcoming pickups,
 * returned as two separate lists, scoped to the authenticated user's role.
 */
router.get(
  '/dashboard/upcoming',
  protect,
  generalLimiter,
  dashboardController.getUpcomingEvents
);

/**
 * GET /api/v1/dashboard/summary-reports
 * Role-scoped summary reports with chart-ready pie-chart data:
 *   NGO       → its own opportunities, applications received, assigned pickups
 *   Volunteer → opportunities applied to, applications submitted, pickups created
 *   Admin     → falls through to the same report as
 *               GET /api/v1/admin/dashboard/summary-reports
 */
router.get(
  '/dashboard/summary-reports',
  protect,
  generalLimiter,
  dashboardController.getMySummaryReports
);

/**
 * GET /api/v1/stats/leaderboard?limit=10
 * Public "Top Contributors" leaderboard (volunteers ranked against
 * volunteers, NGOs against NGOs), plus the caller's own rank.
 */
router.get(
  '/stats/leaderboard',
  protect,
  generalLimiter,
  dashboardController.getLeaderboard
);

/**
 * GET /api/v1/stats/recycling-breakdown?month=YYYY-MM
 * Waste category breakdown for the specified month.
 */
router.get(
  '/stats/recycling-breakdown',
  protect,
  generalLimiter,
  monthQueryRule(),
  validateReport,
  dashboardController.getRecyclingBreakdown
);

/**
 * GET /api/v1/stats/monthly-trends?months=12&scoped=true
 * Monthly pickup + waste trends — data for Clustered Column / Line Charts.
 * NGO/volunteer default to their own activity (scoped=true behaviour) even
 * without the query param; pass ?scoped=false to see platform-wide data.
 * Admin always gets platform-wide data regardless of this flag.
 */
router.get(
  '/stats/monthly-trends',
  protect,
  generalLimiter,
  dashboardController.getMonthlyTrends
);

/**
 * GET /api/v1/stats/weekly-trends?weeks=12&scoped=true
 * Weekly pickup counts — Clustered Column Chart data.
 * NGO/volunteer default to their own activity; pass ?scoped=false for platform-wide.
 */
router.get(
  '/stats/weekly-trends',
  protect,
  generalLimiter,
  dashboardController.getWeeklyTrends
);

/**
 * GET /api/v1/stats/daily-trends?days=30&scoped=true
 * Daily pickup counts for granular view.
 * NGO/volunteer default to their own activity; pass ?scoped=false for platform-wide.
 */
router.get(
  '/stats/daily-trends',
  protect,
  generalLimiter,
  dashboardController.getDailyTrends
);

/**
 * GET /api/v1/stats/co2-factors
 * CO₂ emission factor reference table.
 */
router.get(
  '/stats/co2-factors',
  protect,
  dashboardController.getCO2Factors
);

module.exports = router;