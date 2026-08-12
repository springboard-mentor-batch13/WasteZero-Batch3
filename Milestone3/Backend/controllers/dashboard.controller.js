// Backend/controllers/dashboard.controller.js
//
// ── Dashboard & Analytics Controller ─────────────────────────────────────────
//
// Developer B owns all endpoints in this file.
//
// ENDPOINT INVENTORY:
//   GET /api/v1/admin/dashboard/stats          → getAdminDashboardStats
//   GET /api/v1/dashboard/metrics              → getUserDashboardMetrics
//   GET /api/v1/stats/recycling-breakdown      → getRecyclingBreakdown
//   GET /api/v1/stats/monthly-trends           → getMonthlyTrends
//   GET /api/v1/stats/weekly-trends            → getWeeklyTrends
//   GET /api/v1/stats/daily-trends             → getDailyTrends
//   GET /api/v1/stats/yearly-trends            → getYearlyTrends
//   GET /api/v1/stats/waste-analytics          → getWasteAnalytics (admin)
//   GET /api/v1/stats/realtime                 → getRealtimeSnapshot (admin)
//   GET /api/v1/stats/co2-factors              → getCO2Factors (informational)

const analyticsService = require('../services/analytics.service');
const { getAllFactors } = require('../utils/co2Calculator');

// ─────────────────────────────────────────────────────────────────────────────
// A. Admin Dashboard KPI Stats
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Admin platform-wide KPI statistics with month-over-month growth
 * @route   GET /api/v1/admin/dashboard/stats
 * @access  Admin
 */
const getAdminDashboardStats = async (req, res) => {
  try {
    const stats = await analyticsService.getAdminDashboardStats();
    return res.status(200).json({
      success: true,
      status:  'success',
      data:    stats,
    });
  } catch (error) {
    console.error('[DashboardController] getAdminDashboardStats error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve admin dashboard statistics.',
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// B. User Personal Dashboard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Authenticated user's personal dashboard metrics (pickups, CO₂, waste)
 * @route   GET /api/v1/dashboard/metrics
 * @access  Volunteer | NGO | Admin
 */
const getUserDashboardMetrics = async (req, res) => {
  try {
    const metrics = await analyticsService.getUserDashboardMetrics(req.user.id, req.user.role);
    return res.status(200).json({
      success: true,
      status:  'success',
      data:    metrics,
    });
  } catch (error) {
    console.error('[DashboardController] getUserDashboardMetrics error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard metrics.',
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// C. Recycling Breakdown by Category
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Waste category breakdown for a specific month
 * @route   GET /api/v1/stats/recycling-breakdown?month=YYYY-MM
 * @access  All authenticated users
 */
const getRecyclingBreakdown = async (req, res) => {
  try {
    // Default to current month if not specified
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = req.query.month || defaultMonth;

    const breakdown = await analyticsService.getRecyclingBreakdown(month);
    return res.status(200).json({
      success: true,
      status:  'success',
      data:    breakdown,
    });
  } catch (error) {
    console.error('[DashboardController] getRecyclingBreakdown error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve recycling breakdown.',
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// D. Monthly Trends (Clustered Column Chart data)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Monthly pickup + waste trends for the last N months
 * @route   GET /api/v1/stats/monthly-trends?months=12&scoped=true
 * @access  All authenticated users
 * @query   months  - Number of months to look back (1–24, default 12)
 * @query   scoped  - If 'true', scope to the authenticated user
 */
const getMonthlyTrends = async (req, res) => {
  try {
    const months = Math.min(Math.max(parseInt(req.query.months) || 12, 1), 24);
    const scoped = req.query.scoped === 'true';
    const userId = scoped ? req.user.id : null;

    const trends = await analyticsService.getMonthlyTrends(months, userId);
    return res.status(200).json({
      success: true,
      status:  'success',
      data:    { months, scoped, ...trends },
    });
  } catch (error) {
    console.error('[DashboardController] getMonthlyTrends error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve monthly trends.',
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// E. Weekly Trends
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Weekly pickup counts for the last N weeks (Clustered Column Chart)
 * @route   GET /api/v1/stats/weekly-trends?weeks=12&scoped=true
 * @access  All authenticated users
 */
const getWeeklyTrends = async (req, res) => {
  try {
    const weeks  = Math.min(Math.max(parseInt(req.query.weeks) || 12, 1), 52);
    const scoped = req.query.scoped === 'true';
    const userId = scoped ? req.user.id : null;

    const trends = await analyticsService.getWeeklyTrends(weeks, userId);
    return res.status(200).json({
      success: true,
      status:  'success',
      data:    { weeks, scoped, ...trends },
    });
  } catch (error) {
    console.error('[DashboardController] getWeeklyTrends error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve weekly trends.',
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// F. Daily Trends
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Daily pickup counts for the last N days
 * @route   GET /api/v1/stats/daily-trends?days=30&scoped=true
 * @access  All authenticated users
 */
const getDailyTrends = async (req, res) => {
  try {
    const days   = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 90);
    const scoped = req.query.scoped === 'true';
    const userId = scoped ? req.user.id : null;

    const trends = await analyticsService.getDailyTrends(days, userId);
    return res.status(200).json({
      success: true,
      status:  'success',
      data:    { days, scoped, ...trends },
    });
  } catch (error) {
    console.error('[DashboardController] getDailyTrends error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve daily trends.',
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// G. Yearly Trends
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Yearly aggregation (Clustered Column Chart across years)
 * @route   GET /api/v1/stats/yearly-trends?years=5
 * @access  Admin
 */
const getYearlyTrends = async (req, res) => {
  try {
    const years = Math.min(Math.max(parseInt(req.query.years) || 5, 1), 10);
    const trends = await analyticsService.getYearlyTrends(years);
    return res.status(200).json({
      success: true,
      status:  'success',
      data:    { years, ...trends },
    });
  } catch (error) {
    console.error('[DashboardController] getYearlyTrends error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve yearly trends.',
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// H. Platform-wide WasteStats Analytics (Admin)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Detailed WasteStats analytics: category breakdown, trends, top contributors
 * @route   GET /api/v1/stats/waste-analytics
 * @access  Admin
 */
const getWasteAnalytics = async (req, res) => {
  try {
    const analytics = await analyticsService.getWasteStatsAnalytics();
    return res.status(200).json({
      success: true,
      status:  'success',
      data:    analytics,
    });
  } catch (error) {
    console.error('[DashboardController] getWasteAnalytics error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve waste analytics.',
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// I. Real-time Snapshot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Lightweight real-time platform snapshot for live dashboard updates
 * @route   GET /api/v1/stats/realtime
 * @access  Admin
 *
 * Designed for polling every 30–60 seconds on the admin dashboard.
 * Returns minimal data to keep latency low.
 */
const getRealTimeSnapshot = async (req, res) => {
  try {
    const snapshot = await analyticsService.getRealTimeSnapshot();
    return res.status(200).json({
      success: true,
      status:  'success',
      data:    snapshot,
    });
  } catch (error) {
    console.error('[DashboardController] getRealTimeSnapshot error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve real-time snapshot.',
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// J. CO₂ Factors (Informational)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Returns CO₂ conversion factors for each waste category
 * @route   GET /api/v1/stats/co2-factors
 * @access  All authenticated users
 */
const getCO2Factors = (req, res) => {
  const factors = getAllFactors();
  return res.status(200).json({
    success: true,
    status:  'success',
    data: {
      unit:        'kg CO₂ saved per kg material recycled',
      source:      'WRAP / EPA WARM / IPCC Emission Factors',
      factors,
    },
  });
};

module.exports = {
  getAdminDashboardStats,
  getUserDashboardMetrics,
  getRecyclingBreakdown,
  getMonthlyTrends,
  getWeeklyTrends,
  getDailyTrends,
  getYearlyTrends,
  getWasteAnalytics,
  getRealTimeSnapshot,
  getCO2Factors,
};
