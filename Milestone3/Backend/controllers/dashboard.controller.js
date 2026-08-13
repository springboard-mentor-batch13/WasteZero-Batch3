// Backend/controllers/dashboard.controller.js
//
// ── Dashboard & Analytics Controller ─────────────────────────────────────────
//
// Developer B owns all endpoints in this file.
//
// ENDPOINT INVENTORY:
//   GET /api/v1/admin/dashboard/stats          → getAdminDashboardStats
//   GET /api/v1/dashboard/metrics              → getUserDashboardMetrics
//   GET /api/v1/dashboard/upcoming             → getUpcomingEvents
//   GET /api/v1/stats/leaderboard               → getLeaderboard
//   GET /api/v1/stats/recycling-breakdown      → getRecyclingBreakdown
//   GET /api/v1/stats/monthly-trends           → getMonthlyTrends
//   GET /api/v1/stats/weekly-trends            → getWeeklyTrends
//   GET /api/v1/stats/daily-trends             → getDailyTrends
//   GET /api/v1/stats/yearly-trends            → getYearlyTrends
//   GET /api/v1/admin/dashboard/summary-reports → getSummaryReports (admin)
//   GET /api/v1/dashboard/summary-reports       → getMySummaryReports (role-scoped: volunteer/ngo own data, admin platform-wide)
//   GET /api/v1/stats/waste-analytics          → getWasteAnalytics (admin)
//   GET /api/v1/stats/co2-factors              → getCO2Factors (informational)
//
// NOTE: GET /api/v1/admin/dashboard/stats (getAdminDashboardStats) doubles as
// the live-polling endpoint (30–60s interval) — the standalone
// /api/v1/stats/realtime snapshot was merged into it, adding an
// `applications` KPI block in the process.

const analyticsService = require('../services/analytics.service');
const { getAllFactors } = require('../utils/co2Calculator');

/**
 * Resolve the effective `scoped` flag for the trend endpoints.
 *
 * Admin: always platform-wide — the flag is irrelevant.
 * NGO / Volunteer: defaults to scoped (own-activity-only) so a client that
 * forgets to pass ?scoped=true can't accidentally see platform-wide data.
 * Pass ?scoped=false explicitly to opt into the platform-wide view.
 *
 * @param {object} query - req.query
 * @param {string} role  - req.user.role
 * @returns {boolean}
 */
const resolveScoped = (query, role) => {
  if (role === 'admin') return false; // meaningless for admin — always platform-wide
  return query.scoped !== 'false'; // default true; explicit 'false' opts out
};

/**
 * Parse optional ?startDate & ?endDate (YYYY-MM-DD) query params into a
 * { count, endDate } pair for a given period unit, so the monthly/weekly/
 * daily trend endpoints can serve a custom date range instead of just
 * "last N periods from today". Returns null when either date is absent or
 * invalid, so the caller falls back to its normal lookback-window default.
 *
 * @param {object} query    - req.query
 * @param {'month'|'week'|'day'} unit
 * @param {number} maxCount - upper clamp matching the endpoint's normal limit
 * @returns {{ count: number, endDate: Date } | null}
 */
const parseCustomRange = (query, unit, maxCount) => {
  const { startDate: rawStart, endDate: rawEnd } = query;
  if (!rawStart || !rawEnd) return null;

  const start = new Date(rawStart);
  const end   = new Date(rawEnd);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return null;

  let count;
  if (unit === 'month') {
    count = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  } else if (unit === 'week') {
    count = Math.ceil((end - start) / (7 * 24 * 60 * 60 * 1000)) + 1;
  } else {
    count = Math.ceil((end - start) / (24 * 60 * 60 * 1000)) + 1;
  }

  count = Math.min(Math.max(count, 1), maxCount);
  return { count, endDate: end };
};

// ─────────────────────────────────────────────────────────────────────────────
// A. Admin Dashboard KPI Stats
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Admin platform-wide KPI statistics with month-over-month growth.
 *          Includes users, pickups, opportunities, applications, and waste
 *          totals in a single lightweight response.
 * @route   GET /api/v1/admin/dashboard/stats
 * @access  Admin
 *
 * Designed for polling every 30–60 seconds on the admin dashboard — all
 * underlying aggregations run in parallel to keep latency low.
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
 * @access  Volunteer | NGO only — route-level blockAdmin middleware returns
 *          403 for admin (use /api/v1/admin/dashboard/stats instead).
 */
const getUserDashboardMetrics = async (req, res) => {
  try {
    // Pass the authenticated user's role so the service dispatches to the
    // correct aggregation (volunteer vs. NGO have different headline cards).
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

/**
 * @desc    Authenticated user's "Upcoming Events" dashboard widgets —
 *          upcoming opportunities and upcoming pickups, returned separately.
 *          NGO: opportunities it created + pickups assigned to it.
 *          Volunteer: opportunities it applied for + pickups it created.
 *          Admin: ALL opportunities created + ALL pickups created (platform-wide).
 * @route   GET /api/v1/dashboard/upcoming?limit=10
 * @access  Volunteer | NGO | Admin
 */
const getUpcomingEvents = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const events = await analyticsService.getUpcomingEventsForUser(req.user.id, req.user.role, limit);
    return res.status(200).json({
      success: true,
      status:  'success',
      data:    events,
    });
  } catch (error) {
    console.error('[DashboardController] getUpcomingEvents error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve upcoming events.',
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * @desc    Public "Top Contributors" leaderboard, ranked by CO₂ saved.
 *          Volunteers are ranked against volunteers; NGOs against NGOs
 *          (different populations, so kept as two separate leaderboards).
 *          Always includes the caller's own rank via `data.me`, even if
 *          they're outside the top N or have no records yet (`me: null`).
 * @route   GET /api/v1/stats/leaderboard?limit=10
 * @access  Volunteer | NGO | Admin — admin has no activity of its own to
 *          rank, so it gets BOTH leaderboards: `data.volunteers` and
 *          `data.ngos`, each with its own `me: null`.
 */
const getLeaderboard = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const leaderboard = await analyticsService.getLeaderboardForUser(req.user.id, req.user.role, limit);
    return res.status(200).json({
      success: true,
      status:  'success',
      data:    leaderboard,
    });
  } catch (error) {
    console.error('[DashboardController] getLeaderboard error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve leaderboard.',
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
 * @desc    Monthly pickup + waste + opportunity + application trends for the last N months.
 * @route   GET /api/v1/stats/monthly-trends?months=12&scoped=true
 * @route   GET /api/v1/stats/monthly-trends?startDate=2026-01-01&endDate=2026-06-30&scoped=true
 * @access  All authenticated users
 * @query   months    - Number of months to look back (1–24, default 12). Ignored if startDate/endDate given.
 * @query   startDate - (optional) YYYY-MM-DD — custom range start. Requires endDate.
 * @query   endDate   - (optional) YYYY-MM-DD — custom range end. Requires startDate.
 * @query   scoped    - Defaults to the authenticated user's own activity for NGO/volunteer.
 *                     Admin: scoped is ignored — always returns platform-wide data.
 *                     NGO: scoped!=='false' (default) → only that NGO's pickups (agent_id), waste (ngo_id),
 *                          opportunities (ngo_id), applications received. Pass scoped=false for platform-wide.
 *                     Volunteer: scoped!=='false' (default) → only that volunteer's pickups (user_id),
 *                          waste (user_id), applications submitted. Pass scoped=false for platform-wide.
 */
const getMonthlyTrends = async (req, res) => {
  try {
    const customRange = parseCustomRange(req.query, 'month', 24);
    const months = customRange ? customRange.count : Math.min(Math.max(parseInt(req.query.months) || 12, 1), 24);
    const scoped = resolveScoped(req.query, req.user.role);
    // Admin always gets platform-wide regardless of scoped flag
    const userId = (scoped && req.user.role !== 'admin') ? req.user.id : null;

    const trends = await analyticsService.getMonthlyTrends(months, userId, req.user.role, customRange?.endDate || null);
    return res.status(200).json({
      success: true,
      status:  'success',
      data:    { months, scoped, customRange: !!customRange, role: req.user.role, ...trends },
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
 * @desc    Weekly pickup + waste + opportunity + application trends for the last N weeks.
 * @route   GET /api/v1/stats/weekly-trends?weeks=12&scoped=true
 * @route   GET /api/v1/stats/weekly-trends?startDate=2026-01-01&endDate=2026-06-30&scoped=true
 * @access  All authenticated users
 * @query   weeks     - Number of weeks to look back (1–52, default 12). Ignored if startDate/endDate given.
 * @query   startDate - (optional) YYYY-MM-DD — custom range start. Requires endDate.
 * @query   endDate   - (optional) YYYY-MM-DD — custom range end. Requires startDate.
 * @query   scoped    - Defaults to the authenticated user's own activity for NGO/volunteer.
 *                     Admin: scoped is ignored — always returns platform-wide data.
 *                     NGO: scoped!=='false' (default) → Pickup.agent_id + applications received on NGO's opportunities.
 *                     Volunteer: scoped!=='false' (default) → Pickup.user_id + applications the volunteer submitted.
 *                     Pass scoped=false for either role to see platform-wide data instead.
 */
const getWeeklyTrends = async (req, res) => {
  try {
    const customRange = parseCustomRange(req.query, 'week', 52);
    const weeks  = customRange ? customRange.count : Math.min(Math.max(parseInt(req.query.weeks) || 12, 1), 52);
    const scoped = resolveScoped(req.query, req.user.role);
    const userId = (scoped && req.user.role !== 'admin') ? req.user.id : null;

    const trends = await analyticsService.getWeeklyTrends(weeks, userId, req.user.role, customRange?.endDate || null);
    return res.status(200).json({
      success: true,
      status:  'success',
      data:    { weeks, scoped, customRange: !!customRange, role: req.user.role, ...trends },
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
 * @desc    Daily pickup + waste + opportunity + application counts for the last N days.
 * @route   GET /api/v1/stats/daily-trends?days=30&scoped=true
 * @route   GET /api/v1/stats/daily-trends?startDate=2026-06-01&endDate=2026-06-30&scoped=true
 * @access  All authenticated users
 * @query   days      - Number of days to look back (1–90, default 30). Ignored if startDate/endDate given.
 * @query   startDate - (optional) YYYY-MM-DD — custom range start. Requires endDate.
 * @query   endDate   - (optional) YYYY-MM-DD — custom range end. Requires startDate.
 * @query   scoped    - Defaults to the authenticated user's own activity for NGO/volunteer.
 *                     Admin: scoped is ignored — always returns platform-wide data.
 *                     NGO: scoped!=='false' (default) → Pickup.agent_id + applications received on NGO's opportunities.
 *                     Volunteer: scoped!=='false' (default) → Pickup.user_id + applications the volunteer submitted.
 *                     Pass scoped=false for either role to see platform-wide data instead.
 */
const getDailyTrends = async (req, res) => {
  try {
    const customRange = parseCustomRange(req.query, 'day', 90);
    const days   = customRange ? customRange.count : Math.min(Math.max(parseInt(req.query.days) || 30, 1), 90);
    const scoped = resolveScoped(req.query, req.user.role);
    const userId = (scoped && req.user.role !== 'admin') ? req.user.id : null;

    const trends = await analyticsService.getDailyTrends(days, userId, req.user.role, customRange?.endDate || null);
    return res.status(200).json({
      success: true,
      status:  'success',
      data:    { days, scoped, customRange: !!customRange, role: req.user.role, ...trends },
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
// G2. Summary Reports (User / Opportunity / Volunteer Response) + charts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Simple admin summary reports — User Report, Opportunity Report,
 *          and Volunteer Response (Application) Report — each with
 *          chart-ready { labels, data } for a bar/pie chart.
 * @route   GET /api/v1/admin/dashboard/summary-reports
 * @access  Admin
 */
const getSummaryReports = async (req, res) => {
  try {
    const reports = await analyticsService.getSummaryReports();
    return res.status(200).json({
      success: true,
      status:  'success',
      data:    reports,
    });
  } catch (error) {
    console.error('[DashboardController] getSummaryReports error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve summary reports.',
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * @desc    Role-scoped summary reports for the authenticated user, with
 *          chart-ready { labels, data } pie charts:
 *            NGO       → opportunities it created, applications received on
 *                        them, and pickups assigned to it.
 *            Volunteer → opportunities it applied to, applications it
 *                        submitted, and pickups it created.
 *            Admin     → falls through to the same platform-wide report as
 *                        GET /api/v1/admin/dashboard/summary-reports.
 * @route   GET /api/v1/dashboard/summary-reports
 * @access  Volunteer | NGO | Admin
 */
const getMySummaryReports = async (req, res) => {
  try {
    const reports = await analyticsService.getSummaryReportsForUser(req.user.id, req.user.role);
    return res.status(200).json({
      success: true,
      status:  'success',
      data:    reports,
    });
  } catch (error) {
    console.error('[DashboardController] getMySummaryReports error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve summary reports.',
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
  getUpcomingEvents,
  getLeaderboard,
  getRecyclingBreakdown,
  getMonthlyTrends,
  getWeeklyTrends,
  getDailyTrends,
  getYearlyTrends,
  getSummaryReports,
  getMySummaryReports,
  getWasteAnalytics,
  getCO2Factors,
};