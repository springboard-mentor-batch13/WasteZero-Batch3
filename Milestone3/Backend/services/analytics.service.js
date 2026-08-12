// Backend/services/analytics.service.js
//
// ── Analytics aggregation pipeline service ────────────────────────────────────
//
// Developer B owns all aggregation pipelines in this file.
// All functions return plain JS objects (never Mongoose documents).
//
// PERFORMANCE CONTRACT:
//   - All pipelines use indexed fields in $match stages
//   - $facet is used to parallelize multiple aggregations in a single round-trip
//   - Never use .countDocuments() in a loop — use $facet or Promise.all
//
// IMPORTANT — field names in THIS codebase:
//   Pickup.status         → 'Pending' | 'Assigned' | 'Completed' | 'Cancelled' | 'Missed'
//   Pickup.address.city   → nested field (NOT a top-level `city`)
//   User.isSuspended      → Boolean
//   Opportunity.isRemovedByAdmin → Boolean

const mongoose   = require('mongoose');
const User        = require('../models/users.model');
const Pickup      = require('../models/pickup.model');
const WasteStats  = require('../models/wasteStats.model');
const Opportunity = require('../models/opportunity.model');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate month-over-month growth percentage.
 * Returns 0 if previous month count is 0 (avoid divide-by-zero).
 *
 * @param {number} current
 * @param {number} previous
 * @returns {number}
 */
const growthPercent = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10; // 1 decimal
};

/**
 * Get start-of-month Date objects for current and previous month.
 *
 * @returns {{ startOfCurrentMonth: Date, startOfPrevMonth: Date, startOfNextMonth: Date }}
 */
const getMonthBoundaries = () => {
  const now  = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return {
    startOfCurrentMonth: new Date(year, month, 1),
    startOfPrevMonth:    new Date(year, month - 1, 1),
    startOfNextMonth:    new Date(year, month + 1, 1),
  };
};

/**
 * Parse a YYYY-MM string and return start/end Date boundaries.
 *
 * @param {string} monthStr  e.g. '2026-08'
 * @returns {{ start: Date, end: Date, prevStart: Date }}
 */
const parseMonthParam = (monthStr) => {
  const [year, month] = monthStr.split('-').map(Number);
  return {
    start:     new Date(year, month - 1, 1),
    end:       new Date(year, month, 1),
    prevStart: new Date(year, month - 2, 1),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// A. Admin Dashboard KPI Stats
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Admin Dashboard: Aggregated platform KPI metrics with month-over-month growth.
 * Single DB round-trip using $facet across Users, Pickups, and Opportunities.
 *
 * @returns {Promise<object>}
 */
const getAdminDashboardStats = async () => {
  const { startOfCurrentMonth, startOfPrevMonth, startOfNextMonth } = getMonthBoundaries();

  // ── Users facet (Users collection) ────────────────────────────────────
  const [userStats] = await User.aggregate([
    {
      $facet: {
        totalUsers: [{ $count: 'count' }],
        activeUsers: [
          { $match: { isSuspended: false } },
          { $count: 'count' },
        ],
        volunteerCount: [
          { $match: { role: 'volunteer' } },
          { $count: 'count' },
        ],
        ngoCount: [
          { $match: { role: 'ngo' } },
          { $count: 'count' },
        ],
        adminCount: [
          { $match: { role: 'admin' } },
          { $count: 'count' },
        ],
        newThisMonth: [
          { $match: { createdAt: { $gte: startOfCurrentMonth } } },
          { $count: 'count' },
        ],
        newLastMonth: [
          {
            $match: {
              createdAt: { $gte: startOfPrevMonth, $lt: startOfCurrentMonth },
            },
          },
          { $count: 'count' },
        ],
      },
    },
  ]);

  // ── Pickups facet (Pickups collection) ────────────────────────────────
  const [pickupStats] = await Pickup.aggregate([
    {
      $facet: {
        totalPickups: [{ $count: 'count' }],
        completedPickups: [
          { $match: { status: 'Completed' } },
          { $count: 'count' },
        ],
        pendingPickups: [
          { $match: { status: 'Pending' } },
          { $count: 'count' },
        ],
        assignedPickups: [
          { $match: { status: 'Assigned' } },
          { $count: 'count' },
        ],
        missedPickups: [
          { $match: { status: 'Missed' } },
          { $count: 'count' },
        ],
        completedThisMonth: [
          {
            $match: {
              status: 'Completed',
              completedAt: { $gte: startOfCurrentMonth },
            },
          },
          { $count: 'count' },
        ],
        completedLastMonth: [
          {
            $match: {
              status: 'Completed',
              completedAt: { $gte: startOfPrevMonth, $lt: startOfCurrentMonth },
            },
          },
          { $count: 'count' },
        ],
        pendingThisMonth: [
          {
            $match: {
              status: 'Pending',
              createdAt: { $gte: startOfCurrentMonth },
            },
          },
          { $count: 'count' },
        ],
        pendingLastMonth: [
          {
            $match: {
              status: 'Pending',
              createdAt: { $gte: startOfPrevMonth, $lt: startOfCurrentMonth },
            },
          },
          { $count: 'count' },
        ],
      },
    },
  ]);

  // ── Opportunities facet ───────────────────────────────────────────────
  const [oppStats] = await Opportunity.aggregate([
    {
      $facet: {
        activeOpportunities: [
          { $match: { status: 'open', isRemovedByAdmin: { $ne: true } } },
          { $count: 'count' },
        ],
        activeThisMonth: [
          {
            $match: {
              status: 'open',
              isRemovedByAdmin: { $ne: true },
              createdAt: { $gte: startOfCurrentMonth },
            },
          },
          { $count: 'count' },
        ],
        activeLastMonth: [
          {
            $match: {
              status: 'open',
              isRemovedByAdmin: { $ne: true },
              createdAt: { $gte: startOfPrevMonth, $lt: startOfCurrentMonth },
            },
          },
          { $count: 'count' },
        ],
      },
    },
  ]);

  // ── WasteStats totals ─────────────────────────────────────────────────
  const [wasteTotal] = await WasteStats.aggregate([
    {
      $group: {
        _id: null,
        totalWeightKg: { $sum: '$weight' },
        totalCO2Kg:    { $sum: '$co2_saved_kg' },
        recordCount:   { $sum: 1 },
      },
    },
  ]);

  // ── Extract counts ────────────────────────────────────────────────────
  const extract = (arr) => (arr?.[0]?.count || 0);

  const curUsers     = extract(userStats.newThisMonth);
  const prevUsers    = extract(userStats.newLastMonth);
  const curCompleted = extract(pickupStats.completedThisMonth);
  const prevCompleted= extract(pickupStats.completedLastMonth);
  const curPending   = extract(pickupStats.pendingThisMonth);
  const prevPending  = extract(pickupStats.pendingLastMonth);
  const curOpps      = extract(oppStats.activeThisMonth);
  const prevOpps     = extract(oppStats.activeLastMonth);

  return {
    users: {
      total:          extract(userStats.totalUsers),
      active:         extract(userStats.activeUsers),
      volunteers:     extract(userStats.volunteerCount),
      ngos:           extract(userStats.ngoCount),
      admins:         extract(userStats.adminCount),
      newThisMonth:   curUsers,
      growthPercent:  growthPercent(curUsers, prevUsers),
    },
    pickups: {
      total:           extract(pickupStats.totalPickups),
      completed:       extract(pickupStats.completedPickups),
      pending:         extract(pickupStats.pendingPickups),
      assigned:        extract(pickupStats.assignedPickups),
      missed:          extract(pickupStats.missedPickups),
      completedGrowth: growthPercent(curCompleted, prevCompleted),
      pendingGrowth:   growthPercent(curPending, prevPending),
    },
    opportunities: {
      active:          extract(oppStats.activeOpportunities),
      activeGrowth:    growthPercent(curOpps, prevOpps),
    },
    waste: {
      totalWeightKg: wasteTotal?.totalWeightKg || 0,
      totalCO2Kg:    wasteTotal?.totalCO2Kg    || 0,
      recordCount:   wasteTotal?.recordCount   || 0,
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// B. User Personal Dashboard Metrics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * User personal dashboard: aggregated metrics scoped to one user.
 * Returns total pickups, CO₂ saved, recycled weight, and growth percentages.
 *
 * @param {string} userId
 * @returns {Promise<object>}
 */
const getUserDashboardMetrics = async (userId) => {
  const uid = new mongoose.Types.ObjectId(userId);
  const { startOfCurrentMonth, startOfPrevMonth } = getMonthBoundaries();

  // ── Pickup metrics ─────────────────────────────────────────────────────
  const [pickupMetrics] = await Pickup.aggregate([
    {
      $facet: {
        totalPickups: [
          { $match: { user_id: uid } },
          { $count: 'count' },
        ],
        completedPickups: [
          { $match: { user_id: uid, status: 'Completed' } },
          { $count: 'count' },
        ],
        thisMonthPickups: [
          { $match: { user_id: uid, createdAt: { $gte: startOfCurrentMonth } } },
          { $count: 'count' },
        ],
        lastMonthPickups: [
          {
            $match: {
              user_id: uid,
              createdAt: { $gte: startOfPrevMonth, $lt: startOfCurrentMonth },
            },
          },
          { $count: 'count' },
        ],
      },
    },
  ]);

  // ── WasteStats metrics scoped to this user ────────────────────────────
  const [wasteMetrics] = await WasteStats.aggregate([
    { $match: { user_id: uid } },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              totalWeightKg: { $sum: '$weight' },
              totalCO2Kg:    { $sum: '$co2_saved_kg' },
              itemCount:     { $sum: 1 },
            },
          },
        ],
        thisMonth: [
          { $match: { date: { $gte: startOfCurrentMonth } } },
          {
            $group: {
              _id: null,
              weightKg: { $sum: '$weight' },
              co2Kg:    { $sum: '$co2_saved_kg' },
            },
          },
        ],
        lastMonth: [
          { $match: { date: { $gte: startOfPrevMonth, $lt: startOfCurrentMonth } } },
          {
            $group: {
              _id: null,
              weightKg: { $sum: '$weight' },
              co2Kg:    { $sum: '$co2_saved_kg' },
            },
          },
        ],
      },
    },
  ]);

  const extract = (arr) => arr?.[0]?.count || 0;

  const totalP       = extract(pickupMetrics.totalPickups);
  const curMonthP    = extract(pickupMetrics.thisMonthPickups);
  const prevMonthP   = extract(pickupMetrics.lastMonthPickups);

  const totalW       = wasteMetrics?.totals?.[0]?.totalWeightKg || 0;
  const totalCO2     = wasteMetrics?.totals?.[0]?.totalCO2Kg    || 0;
  const totalItems   = wasteMetrics?.totals?.[0]?.itemCount      || 0;

  const curWaste     = wasteMetrics?.thisMonth?.[0];
  const prevWaste    = wasteMetrics?.lastMonth?.[0];

  return {
    totalPickups:          totalP,
    completedPickups:      extract(pickupMetrics.completedPickups),
    totalPickupsGrowth:    growthPercent(curMonthP, prevMonthP),

    recycledItemsCount:    totalItems,
    recycledWeightKg:      Math.round(totalW * 100) / 100,
    recycledItemsGrowth:   growthPercent(
      curWaste?.weightKg  || 0,
      prevWaste?.weightKg || 0
    ),

    co2SavedKg:            Math.round(totalCO2 * 100) / 100,
    co2SavedGrowth:        growthPercent(
      curWaste?.co2Kg  || 0,
      prevWaste?.co2Kg || 0
    ),

    // Volunteer hours: estimate 2 hours per completed pickup
    volunteerHours:        extract(pickupMetrics.completedPickups) * 2,
    volunteerHoursGrowth:  growthPercent(
      curMonthP * 2,
      prevMonthP * 2
    ),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// C. Recycling Breakdown by Category
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recycling breakdown by waste category for a given month.
 * Returns per-category weight, percentage, CO₂, plus totals and growth.
 *
 * @param {string} monthStr  'YYYY-MM'
 * @returns {Promise<object>}
 */
const getRecyclingBreakdown = async (monthStr) => {
  const { start, end, prevStart } = parseMonthParam(monthStr);

  const [currentBreakdown, prevTotal] = await Promise.all([
    WasteStats.aggregate([
      { $match: { date: { $gte: start, $lt: end } } },
      {
        $group: {
          _id:          '$category',
          totalWeight:  { $sum: '$weight' },
          totalCO2:     { $sum: '$co2_saved_kg' },
          recordCount:  { $sum: 1 },
        },
      },
      {
        $group: {
          _id:             null,
          grandTotalWeight: { $sum: '$totalWeight' },
          grandTotalCO2:    { $sum: '$totalCO2' },
          categories: {
            $push: {
              category:   '$_id',
              weightKg:   '$totalWeight',
              co2SavedKg: '$totalCO2',
              records:    '$recordCount',
            },
          },
        },
      },
      {
        $project: {
          _id:              0,
          grandTotalWeight: 1,
          grandTotalCO2:    1,
          categories: {
            $map: {
              input: '$categories',
              as:    'cat',
              in: {
                category:   '$$cat.category',
                weightKg:   '$$cat.weightKg',
                co2SavedKg: '$$cat.co2SavedKg',
                records:    '$$cat.records',
                percentage: {
                  $round: [
                    { $multiply: [{ $divide: ['$$cat.weightKg', '$grandTotalWeight'] }, 100] },
                    1,
                  ],
                },
              },
            },
          },
        },
      },
    ]),

    WasteStats.aggregate([
      { $match: { date: { $gte: prevStart, $lt: start } } },
      { $group: { _id: null, totalWeight: { $sum: '$weight' } } },
    ]),
  ]);

  const result     = currentBreakdown[0];
  const prevWeight = prevTotal[0]?.totalWeight || 0;
  const curWeight  = result?.grandTotalWeight  || 0;

  // Fill in any missing categories with 0 values
  const { ALLOWED_WASTE_TYPES } = require('../constants/wasteTypes');
  const categories = ALLOWED_WASTE_TYPES.map((cat) => {
    const found = result?.categories?.find((c) => c.category === cat);
    return found || { category: cat, weightKg: 0, co2SavedKg: 0, records: 0, percentage: 0 };
  });

  return {
    month:            monthStr,
    totalWeightKg:    Math.round(curWeight * 100) / 100,
    totalCO2Kg:       Math.round((result?.grandTotalCO2 || 0) * 100) / 100,
    growthPercentage: growthPercent(curWeight, prevWeight),
    categories:       categories.sort((a, b) => b.weightKg - a.weightKg),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// D. Monthly Trend Data (for charts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Monthly aggregation trend for pickups/waste over the last N months.
 * Returns data structured for Clustered Column Charts and Line Charts.
 *
 * @param {number} [months=12]     - Number of months to look back
 * @param {string} [userId]        - If provided, scope to a single user
 * @returns {Promise<object>}
 */
const getMonthlyTrends = async (months = 12, userId = null) => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const pickupMatch = { createdAt: { $gte: startDate } };
  const wasteMatch  = { date: { $gte: startDate } };

  if (userId) {
    const uid       = new mongoose.Types.ObjectId(userId);
    pickupMatch.user_id = uid;
    wasteMatch.user_id  = uid;
  }

  const [pickupTrends, wasteTrends] = await Promise.all([
    // Pickups by month + status
    Pickup.aggregate([
      { $match: pickupMatch },
      {
        $group: {
          _id: {
            year:   { $year:  '$createdAt' },
            month:  { $month: '$createdAt' },
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),

    // Waste stats by month + category
    WasteStats.aggregate([
      { $match: wasteMatch },
      {
        $group: {
          _id: {
            year:     { $year:  '$date' },
            month:    { $month: '$date' },
            category: '$category',
          },
          totalWeight: { $sum: '$weight' },
          totalCO2:    { $sum: '$co2_saved_kg' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
  ]);

  // Build month labels for the last N months
  const labels = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push({
      year:  d.getFullYear(),
      month: d.getMonth() + 1,
      label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    });
  }

  // Build structured datasets for clustered column chart
  const statuses   = ['Pending', 'Assigned', 'Completed', 'Cancelled', 'Missed'];
  const { ALLOWED_WASTE_TYPES } = require('../constants/wasteTypes');

  const pickupDatasets = statuses.map((status) => ({
    label: status,
    data: labels.map(({ year, month }) => {
      const found = pickupTrends.find(
        (p) => p._id.year === year && p._id.month === month && p._id.status === status
      );
      return found?.count || 0;
    }),
  }));

  const wasteDatasets = ALLOWED_WASTE_TYPES.map((cat) => ({
    label: cat,
    data: labels.map(({ year, month }) => {
      const found = wasteTrends.find(
        (w) => w._id.year === year && w._id.month === month && w._id.category === cat
      );
      return Math.round((found?.totalWeight || 0) * 100) / 100;
    }),
  }));

  const co2Dataset = {
    label: 'CO₂ Saved (kg)',
    data: labels.map(({ year, month }) => {
      const monthRecords = wasteTrends.filter(
        (w) => w._id.year === year && w._id.month === month
      );
      const total = monthRecords.reduce((sum, w) => sum + w.totalCO2, 0);
      return Math.round(total * 100) / 100;
    }),
  };

  return {
    labels:    labels.map((l) => l.label),
    pickup:    { datasets: pickupDatasets },
    waste:     { datasets: wasteDatasets },
    co2:       co2Dataset,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// E. Weekly Trend Data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Weekly trend aggregation for the last N weeks.
 * Returns data structured for Clustered Column Chart (pickups per week by status).
 *
 * @param {number} [weeks=12]
 * @param {string} [userId]
 * @returns {Promise<object>}
 */
const getWeeklyTrends = async (weeks = 12, userId = null) => {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - weeks * 7);

  const match = { createdAt: { $gte: startDate } };
  if (userId) match.user_id = new mongoose.Types.ObjectId(userId);

  const trends = await Pickup.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          week:   { $isoWeek: '$createdAt' },
          year:   { $isoWeekYear: '$createdAt' },
          status: '$status',
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.week': 1 } },
  ]);

  // Build week labels
  const labels = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const weekNum  = getISOWeek(d);
    const year     = d.getFullYear();
    labels.push({ week: weekNum, year, label: `W${weekNum} '${String(year).slice(2)}` });
  }

  const statuses = ['Pending', 'Assigned', 'Completed', 'Cancelled', 'Missed'];
  const datasets = statuses.map((status) => ({
    label: status,
    data: labels.map(({ week, year }) => {
      const found = trends.find(
        (t) => t._id.week === week && t._id.year === year && t._id.status === status
      );
      return found?.count || 0;
    }),
  }));

  return { labels: labels.map((l) => l.label), datasets };
};

/**
 * ISO week number helper.
 * @param {Date} date
 * @returns {number}
 */
const getISOWeek = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
};

// ─────────────────────────────────────────────────────────────────────────────
// F. Daily Trend Data (last N days)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Daily pickup counts for the last N days.
 * Returns data for day-granularity Clustered Column Chart.
 *
 * @param {number} [days=30]
 * @param {string} [userId]
 * @returns {Promise<object>}
 */
const getDailyTrends = async (days = 30, userId = null) => {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days + 1);
  startDate.setHours(0, 0, 0, 0);

  const match = { createdAt: { $gte: startDate } };
  if (userId) match.user_id = new mongoose.Types.ObjectId(userId);

  const trends = await Pickup.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          year:  { $year:  '$createdAt' },
          month: { $month: '$createdAt' },
          day:   { $dayOfMonth: '$createdAt' },
          status: '$status',
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
  ]);

  const labels = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    labels.push({
      year:  d.getFullYear(),
      month: d.getMonth() + 1,
      day:   d.getDate(),
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
  }

  const statuses = ['Pending', 'Assigned', 'Completed', 'Cancelled', 'Missed'];
  const datasets = statuses.map((status) => ({
    label: status,
    data: labels.map(({ year, month, day }) => {
      const found = trends.find(
        (t) =>
          t._id.year  === year &&
          t._id.month === month &&
          t._id.day   === day &&
          t._id.status === status
      );
      return found?.count || 0;
    }),
  }));

  return { labels: labels.map((l) => l.label), datasets };
};

// ─────────────────────────────────────────────────────────────────────────────
// G. Yearly Trend Data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Yearly aggregation for the last N years.
 *
 * @param {number} [years=5]
 * @returns {Promise<object>}
 */
const getYearlyTrends = async (years = 5) => {
  const now = new Date();
  const startYear = now.getFullYear() - years + 1;
  const startDate = new Date(startYear, 0, 1);

  const [pickupTrends, wasteTrends, userGrowth] = await Promise.all([
    Pickup.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id:    { year: { $year: '$createdAt' }, status: '$status' },
          count:  { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1 } },
    ]),

    WasteStats.aggregate([
      { $match: { date: { $gte: startDate } } },
      {
        $group: {
          _id:         { year: { $year: '$date' }, category: '$category' },
          totalWeight: { $sum: '$weight' },
          totalCO2:    { $sum: '$co2_saved_kg' },
        },
      },
      { $sort: { '_id.year': 1 } },
    ]),

    User.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id:   { year: { $year: '$createdAt' }, role: '$role' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1 } },
    ]),
  ]);

  const labels = Array.from({ length: years }, (_, i) => String(startYear + i));
  const { ALLOWED_WASTE_TYPES } = require('../constants/wasteTypes');
  const statuses = ['Completed', 'Cancelled', 'Missed', 'Pending'];

  const pickupDatasets = statuses.map((status) => ({
    label: status,
    data: labels.map((yr) => {
      const found = pickupTrends.find(
        (p) => String(p._id.year) === yr && p._id.status === status
      );
      return found?.count || 0;
    }),
  }));

  const wasteDatasets = ALLOWED_WASTE_TYPES.map((cat) => ({
    label: cat,
    data: labels.map((yr) => {
      const found = wasteTrends.find(
        (w) => String(w._id.year) === yr && w._id.category === cat
      );
      return Math.round((found?.totalWeight || 0) * 100) / 100;
    }),
  }));

  const co2Dataset = {
    label: 'CO₂ Saved (kg)',
    data: labels.map((yr) => {
      const sum = wasteTrends
        .filter((w) => String(w._id.year) === yr)
        .reduce((acc, w) => acc + w.totalCO2, 0);
      return Math.round(sum * 100) / 100;
    }),
  };

  const userDatasets = ['volunteer', 'ngo', 'admin'].map((role) => ({
    label: role.charAt(0).toUpperCase() + role.slice(1),
    data: labels.map((yr) => {
      const found = userGrowth.find(
        (u) => String(u._id.year) === yr && u._id.role === role
      );
      return found?.count || 0;
    }),
  }));

  return {
    labels,
    pickup:  { datasets: pickupDatasets },
    waste:   { datasets: wasteDatasets },
    co2:     co2Dataset,
    users:   { datasets: userDatasets },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// H. Platform-wide WasteStats Analytics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Comprehensive WasteStats analytics: total waste, per-category, CO₂, trends.
 * Admin only.
 *
 * @returns {Promise<object>}
 */
const getWasteStatsAnalytics = async () => {
  const [categoryBreakdown, monthlyWaste, userImpact] = await Promise.all([
    // Category aggregation
    WasteStats.aggregate([
      {
        $group: {
          _id:          '$category',
          totalWeight:  { $sum: '$weight' },
          totalCO2:     { $sum: '$co2_saved_kg' },
          recordCount:  { $sum: 1 },
        },
      },
      {
        $group: {
          _id:             null,
          grandTotal:      { $sum: '$totalWeight' },
          categories:      { $push: '$$ROOT' },
        },
      },
      {
        $project: {
          _id:       0,
          grandTotal: 1,
          categories: {
            $map: {
              input: '$categories',
              as:    'c',
              in: {
                category:   '$$c._id',
                weightKg:   '$$c.totalWeight',
                co2SavedKg: '$$c.totalCO2',
                records:    '$$c.recordCount',
                percentage: {
                  $round: [
                    { $multiply: [{ $divide: ['$$c.totalWeight', '$grandTotal'] }, 100] },
                    1,
                  ],
                },
              },
            },
          },
        },
      },
    ]),

    // Monthly waste trend (last 6 months)
    WasteStats.aggregate([
      {
        $match: {
          date: { $gte: new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1) },
        },
      },
      {
        $group: {
          _id: { year: { $year: '$date' }, month: { $month: '$date' } },
          totalWeight: { $sum: '$weight' },
          totalCO2:    { $sum: '$co2_saved_kg' },
          recyclingRate: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),

    // Top 10 users by CO₂ impact
    WasteStats.aggregate([
      {
        $group: {
          _id:          '$user_id',
          totalCO2:     { $sum: '$co2_saved_kg' },
          totalWeight:  { $sum: '$weight' },
          totalPickups: { $addToSet: '$pickup_id' },
        },
      },
      {
        $project: {
          totalCO2:     1,
          totalWeight:  1,
          pickupCount:  { $size: '$totalPickups' },
        },
      },
      { $sort: { totalCO2: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from:         'users',
          localField:   '_id',
          foreignField: '_id',
          as:           'user',
          pipeline:     [{ $project: { name: 1, email: 1, role: 1 } }],
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmpty: true } },
    ]),
  ]);

  const { ALLOWED_WASTE_TYPES } = require('../constants/wasteTypes');
  const grandTotal = categoryBreakdown[0]?.grandTotal || 0;
  const categories = ALLOWED_WASTE_TYPES.map((cat) => {
    const found = categoryBreakdown[0]?.categories?.find((c) => c.category === cat);
    return found || { category: cat, weightKg: 0, co2SavedKg: 0, records: 0, percentage: 0 };
  });

  return {
    totals: {
      totalWeightKg: Math.round(grandTotal * 100) / 100,
      totalCO2Kg:    Math.round(
        (categoryBreakdown[0]?.categories?.reduce((s, c) => s + c.co2SavedKg, 0) || 0) * 100
      ) / 100,
    },
    categoryBreakdown: categories,
    monthlyTrends:     monthlyWaste.map((m) => ({
      period:      `${m._id.year}-${String(m._id.month).padStart(2, '0')}`,
      totalWeight: Math.round(m.totalWeight * 100) / 100,
      totalCO2:    Math.round(m.totalCO2 * 100) / 100,
    })),
    topContributors: userImpact.map((u) => ({
      user:        u.user || null,
      totalCO2:    Math.round(u.totalCO2 * 100) / 100,
      totalWeight: Math.round(u.totalWeight * 100) / 100,
      pickupCount: u.pickupCount,
    })),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// I. Real-time snapshot (for live dashboard updates)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lightweight real-time snapshot for live dashboard polling.
 * Optimised for speed — minimal aggregation.
 *
 * @returns {Promise<object>}
 */
const getRealTimeSnapshot = async () => {
  const { startOfCurrentMonth } = getMonthBoundaries();

  const [pickupNow, wasteToday, usersToday] = await Promise.all([
    Pickup.aggregate([
      {
        $facet: {
          pending:   [{ $match: { status: 'Pending'  } }, { $count: 'n' }],
          assigned:  [{ $match: { status: 'Assigned' } }, { $count: 'n' }],
          completed: [{ $match: { status: 'Completed', completedAt: { $gte: startOfCurrentMonth } } }, { $count: 'n' }],
        },
      },
    ]),
    WasteStats.aggregate([
      {
        $match: { date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      },
      {
        $group: {
          _id:    null,
          weight: { $sum: '$weight' },
          co2:    { $sum: '$co2_saved_kg' },
        },
      },
    ]),
    User.countDocuments({ createdAt: { $gte: startOfCurrentMonth } }),
  ]);

  return {
    timestamp:   new Date().toISOString(),
    pickups: {
      pending:           pickupNow[0]?.pending?.[0]?.n   || 0,
      assigned:          pickupNow[0]?.assigned?.[0]?.n  || 0,
      completedThisMonth: pickupNow[0]?.completed?.[0]?.n || 0,
    },
    today: {
      wasteCollectedKg: Math.round((wasteToday[0]?.weight || 0) * 100) / 100,
      co2SavedKg:       Math.round((wasteToday[0]?.co2    || 0) * 100) / 100,
    },
    newUsersThisMonth: usersToday,
  };
};

module.exports = {
  getAdminDashboardStats,
  getUserDashboardMetrics,
  getRecyclingBreakdown,
  getMonthlyTrends,
  getWeeklyTrends,
  getDailyTrends,
  getYearlyTrends,
  getWasteStatsAnalytics,
  getRealTimeSnapshot,
  growthPercent,
};
