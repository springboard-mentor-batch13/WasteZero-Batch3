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
//     GET /api/v1/stats/waste-analytics      → WasteStats platform analytics
//     GET /api/v1/stats/realtime             → Real-time platform snapshot
//     GET /api/v1/stats/yearly-trends        → Yearly trend data
//
//   All authenticated users (protect only):
//     GET /api/v1/dashboard/metrics          → Personal dashboard metrics
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
const { requireAdmin } = require('../middlewares/rbac.middleware');
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
 * GET /api/v1/stats/realtime
 * Lightweight real-time platform snapshot for live dashboard polling.
 */
router.get(
  '/stats/realtime',
  protect,
  requireAdmin,
  adminLimiter,
  dashboardController.getRealTimeSnapshot
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

// ── All authenticated users ──────────────────────────────────────────────────

/**
 * GET /api/v1/dashboard/metrics
 * Personal dashboard metrics for the authenticated user.
 */
router.get(
  '/dashboard/metrics',
  protect,
  dashboardController.getUserDashboardMetrics
);

/**
 * GET /api/v1/stats/recycling-breakdown?month=YYYY-MM
 * Waste category breakdown for the specified month.
 */
router.get(
  '/stats/recycling-breakdown',
  protect,
  monthQueryRule(),
  validateReport,
  dashboardController.getRecyclingBreakdown
);

/**
 * GET /api/v1/stats/monthly-trends?months=12&scoped=true
 * Monthly pickup + waste trends — data for Clustered Column / Line Charts.
 * ?scoped=true  → scope to authenticated user
 * ?scoped=false → platform-wide (works for all roles, data filtered by role on frontend)
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
