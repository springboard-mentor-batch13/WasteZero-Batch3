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
//   Pickup.user_id        → the volunteer who created the pickup request
//   Pickup.agent_id       → the NGO who claimed/completed the pickup
//   WasteStats.user_id    → the volunteer whose pickup generated the entry
//   WasteStats.ngo_id     → the NGO who entered the waste details (nullable)
//   User.isSuspended      → Boolean
//   Opportunity.isRemovedByAdmin → Boolean

const mongoose   = require('mongoose');
const User        = require('../models/users.model');
const Pickup      = require('../models/pickup.model');
const WasteStats  = require('../models/wasteStats.model');
const Opportunity = require('../models/opportunity.model');
const Application = require('../models/application.model');
const { addTimeDisplayFields } = require('../utils/pickup.timeUtils');

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
//
// Headline cards:
//   users.total        → Total Users
//   users.ngos         → Total NGOs
//   opportunities.total→ Total Opportunities (ALL statuses, not just 'open')
//   pickups.total      → Total Pickups
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Admin Dashboard: Aggregated platform KPI metrics with month-over-month growth.
 * Single DB round-trip using $facet across Users, Pickups, and Opportunities.
 *
 * @returns {Promise<object>}
 */
const getAdminDashboardStats = async () => {
  const { startOfCurrentMonth, startOfPrevMonth, startOfNextMonth } = getMonthBoundaries();

  // ── All facets run in parallel (single round-trip each, no cross-waiting) ──
  // This is what keeps the endpoint fast enough for 30–60s dashboard polling —
  // previously these four aggregations were awaited one at a time.
  const [
    [userStats],
    [pickupStats],
    [oppStats],
    [appStats],
    [wasteTotal],
  ] = await Promise.all([
    // ── Users facet (Users collection) ────────────────────────────────────
    User.aggregate([
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
    ]),

    // ── Pickups facet (Pickups collection) ────────────────────────────────
    Pickup.aggregate([
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
    ]),

    // ── Opportunities facet ───────────────────────────────────────────────
    // NOTE: `total` counts ALL opportunities regardless of status — this is the
    // headline card figure. `active` is the subset that are currently open &
    // not removed, used for the growth metric.
    Opportunity.aggregate([
      {
        $facet: {
          totalOpportunities: [
            { $count: 'count' },
          ],
          activeOpportunities: [
            { $match: { status: 'open', isRemovedByAdmin: { $ne: true } } },
            { $count: 'count' },
          ],
          totalThisMonth: [
            {
              $match: {
                createdAt: { $gte: startOfCurrentMonth },
              },
            },
            { $count: 'count' },
          ],
          totalLastMonth: [
            {
              $match: {
                createdAt: { $gte: startOfPrevMonth, $lt: startOfCurrentMonth },
              },
            },
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
    ]),

    // ── Applications facet (Applications collection) ──────────────────────
    Application.aggregate([
      {
        $facet: {
          totalApplications: [{ $count: 'count' }],
          pendingApplications: [
            { $match: { status: 'pending' } },
            { $count: 'count' },
          ],
          acceptedApplications: [
            { $match: { status: 'accepted' } },
            { $count: 'count' },
          ],
          rejectedApplications: [
            { $match: { status: 'rejected' } },
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
    ]),

    // ── WasteStats totals ─────────────────────────────────────────────────
    WasteStats.aggregate([
      {
        $group: {
          _id: null,
          totalWeightKg: { $sum: '$weight' },
          totalCO2Kg:    { $sum: '$co2_saved_kg' },
          recordCount:   { $sum: 1 },
        },
      },
    ]),
  ]);

  // ── Extract counts ────────────────────────────────────────────────────
  const extract = (arr) => (arr?.[0]?.count || 0);

  const curUsers     = extract(userStats.newThisMonth);
  const prevUsers    = extract(userStats.newLastMonth);
  const curCompleted = extract(pickupStats.completedThisMonth);
  const prevCompleted= extract(pickupStats.completedLastMonth);
  const curPending   = extract(pickupStats.pendingThisMonth);
  const prevPending  = extract(pickupStats.pendingLastMonth);
  const curOpps      = extract(oppStats.totalThisMonth);
  const prevOpps     = extract(oppStats.totalLastMonth);
  const curApps      = extract(appStats.newThisMonth);
  const prevApps     = extract(appStats.newLastMonth);

  return {
    timestamp: new Date().toISOString(),
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
      total:           extract(oppStats.totalOpportunities),      // ← headline card
      active:          extract(oppStats.activeOpportunities),
      totalGrowth:     growthPercent(curOpps, prevOpps),
      activeGrowth:    growthPercent(
        extract(oppStats.activeThisMonth),
        extract(oppStats.activeLastMonth),
      ),
    },
    applications: {
      total:          extract(appStats.totalApplications),        // ← headline card
      pending:        extract(appStats.pendingApplications),
      accepted:       extract(appStats.acceptedApplications),
      rejected:       extract(appStats.rejectedApplications),
      newThisMonth:   curApps,
      growthPercent:  growthPercent(curApps, prevApps),
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
//
// Role-aware dispatcher:
//   volunteer → getVolunteerDashboardMetrics
//   ngo       → getNgoDashboardMetrics
//   admin     → getAdminDashboardStats (admin has its own route)
//
// Volunteer headline cards:
//   totalPickups         — pickups the volunteer created
//   totalApplications    — applications submitted to opportunities
//   volunteerHours       — sum of parsed opportunity durations from accepted apps
//   co2SavedKg           — from WasteStats
//   totalPickupsGrowth   — % growth (month-over-month)
//
// NGO headline cards:
//   totalOpportunities   — opportunities the NGO created
//   totalApplications    — applications received on the NGO's opportunities
//   completedPickups     — pickups the NGO completed (agent_id = NGO)
//   recycledItemsCount   — WasteStats records where user = NGO (agent completions)
//   recycledWeightKg
//   growthPercent        — month-over-month opportunities growth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Volunteer personal dashboard metrics.
 *
 * @param {string} userId
 * @returns {Promise<object>}
 */
const getVolunteerDashboardMetrics = async (userId) => {
  const uid = new mongoose.Types.ObjectId(userId);
  const { startOfCurrentMonth, startOfPrevMonth } = getMonthBoundaries();

  // ── Pickup metrics (volunteer is user_id) ──────────────────────────────
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

  // ── Application metrics (volunteer applied to opportunities) ──────────
  const [applicationMetrics] = await Application.aggregate([
    {
      $facet: {
        totalApplications: [
          { $match: { volunteer_id: uid } },
          { $count: 'count' },
        ],
        acceptedApplications: [
          { $match: { volunteer_id: uid, status: 'accepted' } },
          { $count: 'count' },
        ],
        thisMonthApplications: [
          { $match: { volunteer_id: uid, createdAt: { $gte: startOfCurrentMonth } } },
          { $count: 'count' },
        ],
        lastMonthApplications: [
          {
            $match: {
              volunteer_id: uid,
              createdAt: { $gte: startOfPrevMonth, $lt: startOfCurrentMonth },
            },
          },
          { $count: 'count' },
        ],
      },
    },
  ]);

  // ── Volunteer hours from accepted applications' opportunity durations ──
  // Join accepted applications → opportunities to sum their duration in hours.
  // Opportunity.duration is a free-text string (e.g. "2 hours", "3 hrs", "90 min").
  // We use a best-effort regex pipeline to parse it rather than a JS utility so
  // this stays in a single DB round-trip.
  //
  // Hours are bucketed by Opportunity.date (the scheduled event date) — that's
  // when the volunteering actually happened, not when the application was
  // submitted/accepted. Opportunities with no date set (date: null) still
  // count toward the lifetime total but are excluded from the month buckets,
  // same convention used for WasteStats' `date` bucketing above.
  const [hoursPipeline] = await Application.aggregate([
    { $match: { volunteer_id: uid, status: 'accepted' } },
    {
      $lookup: {
        from:         'opportunities',
        localField:   'opportunity_id',
        foreignField: '_id',
        as:           'opportunity',
        pipeline:     [{ $project: { duration: 1, date: 1 } }],
      },
    },
    { $unwind: { path: '$opportunity', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        durationStr: { $ifNull: ['$opportunity.duration', ''] },
        eventDate:   '$opportunity.date',
      },
    },
    {
      // Rough hour extraction: match the first number in the duration string.
      // "2 hours" → 2, "90 minutes" → 1.5, "3.5 hrs" → 3.5
      $addFields: {
        hoursRaw: {
          $regexFind: { input: '$durationStr', regex: /[\d]+(?:\.\d+)?/ },
        },
        isMinutes: {
          $regexMatch: { input: '$durationStr', regex: /min/i },
        },
      },
    },
    {
      $addFields: {
        numericVal: {
          $convert: {
            input:   '$hoursRaw.match',
            to:      'double',
            onError: 0,
            onNull:  0,
          },
        },
      },
    },
    {
      $addFields: {
        hoursContribution: {
          $cond: {
            if:   '$isMinutes',
            then: { $divide: ['$numericVal', 60] },
            else: '$numericVal',
          },
        },
      },
    },
    {
      $facet: {
        total: [
          { $group: { _id: null, totalHours: { $sum: '$hoursContribution' } } },
        ],
        thisMonth: [
          { $match: { eventDate: { $gte: startOfCurrentMonth } } },
          { $group: { _id: null, totalHours: { $sum: '$hoursContribution' } } },
        ],
        lastMonth: [
          { $match: { eventDate: { $gte: startOfPrevMonth, $lt: startOfCurrentMonth } } },
          { $group: { _id: null, totalHours: { $sum: '$hoursContribution' } } },
        ],
      },
    },
  ]);

  // ── WasteStats metrics scoped to this volunteer ────────────────────────
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

  const totalApps    = extract(applicationMetrics.totalApplications);
  const curMonthApps = extract(applicationMetrics.thisMonthApplications);
  const prevMonthApps= extract(applicationMetrics.lastMonthApplications);

  const totalW       = wasteMetrics?.totals?.[0]?.totalWeightKg || 0;
  const totalCO2     = wasteMetrics?.totals?.[0]?.totalCO2Kg    || 0;
  const totalItems   = wasteMetrics?.totals?.[0]?.itemCount      || 0;

  const curWaste     = wasteMetrics?.thisMonth?.[0];
  const prevWaste    = wasteMetrics?.lastMonth?.[0];

  const totalHours     = hoursPipeline?.total?.[0]?.totalHours     || 0;
  const curMonthHours  = hoursPipeline?.thisMonth?.[0]?.totalHours || 0;
  const prevMonthHours = hoursPipeline?.lastMonth?.[0]?.totalHours || 0;

  const volunteerHours = Math.round(totalHours * 10) / 10;

  return {
    role: 'volunteer',

    // Headline cards
    totalPickups:          totalP,
    completedPickups:      extract(pickupMetrics.completedPickups),
    totalPickupsGrowth:    growthPercent(curMonthP, prevMonthP),

    totalApplications:     totalApps,
    acceptedApplications:  extract(applicationMetrics.acceptedApplications),
    applicationsGrowth:    growthPercent(curMonthApps, prevMonthApps),

    // Volunteer hours derived from accepted opportunity durations, bucketed
    // by the opportunity's scheduled event date (Opportunity.date).
    volunteerHours,
    volunteerHoursGrowth:  growthPercent(curMonthHours, prevMonthHours),

    co2SavedKg:            Math.round(totalCO2 * 100) / 100,
    co2SavedGrowth:        growthPercent(
      curWaste?.co2Kg  || 0,
      prevWaste?.co2Kg || 0,
    ),

    recycledItemsCount:    totalItems,
    recycledWeightKg:      Math.round(totalW * 100) / 100,
    recycledItemsGrowth:   growthPercent(
      curWaste?.weightKg  || 0,
      prevWaste?.weightKg || 0,
    ),
  };
};

/**
 * NGO personal dashboard metrics.
 *
 * @param {string} userId  — the NGO user's _id
 * @returns {Promise<object>}
 */
const getNgoDashboardMetrics = async (userId) => {
  const uid = new mongoose.Types.ObjectId(userId);
  const { startOfCurrentMonth, startOfPrevMonth } = getMonthBoundaries();

  // ── Opportunity metrics (NGO created these) ────────────────────────────
  const [oppMetrics] = await Opportunity.aggregate([
    {
      $facet: {
        totalOpportunities: [
          { $match: { ngo_id: uid } },
          { $count: 'count' },
        ],
        activeOpportunities: [
          { $match: { ngo_id: uid, status: 'open', isRemovedByAdmin: { $ne: true } } },
          { $count: 'count' },
        ],
        thisMonthOpportunities: [
          { $match: { ngo_id: uid, createdAt: { $gte: startOfCurrentMonth } } },
          { $count: 'count' },
        ],
        lastMonthOpportunities: [
          {
            $match: {
              ngo_id: uid,
              createdAt: { $gte: startOfPrevMonth, $lt: startOfCurrentMonth },
            },
          },
          { $count: 'count' },
        ],
      },
    },
  ]);

  // ── Applications received on the NGO's opportunities ──────────────────
  // Two-step: get all opportunity IDs for this NGO, then count applications.
  const ngoOpportunityIds = await Opportunity.find({ ngo_id: uid }).distinct('_id');

  const [applicationMetrics] = await Application.aggregate([
    {
      $facet: {
        totalApplications: [
          { $match: { opportunity_id: { $in: ngoOpportunityIds } } },
          { $count: 'count' },
        ],
        pendingApplications: [
          { $match: { opportunity_id: { $in: ngoOpportunityIds }, status: 'pending' } },
          { $count: 'count' },
        ],
        acceptedApplications: [
          { $match: { opportunity_id: { $in: ngoOpportunityIds }, status: 'accepted' } },
          { $count: 'count' },
        ],
        thisMonthApplications: [
          {
            $match: {
              opportunity_id: { $in: ngoOpportunityIds },
              createdAt: { $gte: startOfCurrentMonth },
            },
          },
          { $count: 'count' },
        ],
        lastMonthApplications: [
          {
            $match: {
              opportunity_id: { $in: ngoOpportunityIds },
              createdAt: { $gte: startOfPrevMonth, $lt: startOfCurrentMonth },
            },
          },
          { $count: 'count' },
        ],
      },
    },
  ]);

  // ── Pickups completed by this NGO (agent_id = NGO) ────────────────────
  const [pickupMetrics] = await Pickup.aggregate([
    {
      $facet: {
        totalAssigned: [
          { $match: { agent_id: uid } },
          { $count: 'count' },
        ],
        completedPickups: [
          { $match: { agent_id: uid, status: 'Completed' } },
          { $count: 'count' },
        ],
        thisMonthCompleted: [
          {
            $match: {
              agent_id: uid,
              status: 'Completed',
              completedAt: { $gte: startOfCurrentMonth },
            },
          },
          { $count: 'count' },
        ],
        lastMonthCompleted: [
          {
            $match: {
              agent_id: uid,
              status: 'Completed',
              completedAt: { $gte: startOfPrevMonth, $lt: startOfCurrentMonth },
            },
          },
          { $count: 'count' },
        ],
      },
    },
  ]);

  // ── WasteStats metrics (recycled items the NGO processed) ─────────────
  // WasteStats.ngo_id is set directly at write time (recordWasteStatsForPickup
  // stamps it from Pickup.agent_id when a pickup completes), so this can
  // match ngo_id straight up — no join through Pickup needed.
  const [wasteMetrics] = await WasteStats.aggregate([
    { $match: { ngo_id: uid } },
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

  const curOpps  = extract(oppMetrics.thisMonthOpportunities);
  const prevOpps = extract(oppMetrics.lastMonthOpportunities);
  const curApps  = extract(applicationMetrics.thisMonthApplications);
  const prevApps = extract(applicationMetrics.lastMonthApplications);
  const curPick  = extract(pickupMetrics.thisMonthCompleted);
  const prevPick = extract(pickupMetrics.lastMonthCompleted);

  const totalW   = wasteMetrics?.totals?.[0]?.totalWeightKg || 0;
  const totalCO2 = wasteMetrics?.totals?.[0]?.totalCO2Kg    || 0;
  const totalItems = wasteMetrics?.totals?.[0]?.itemCount    || 0;

  const curWaste  = wasteMetrics?.thisMonth?.[0];
  const prevWaste = wasteMetrics?.lastMonth?.[0];

  return {
    role: 'ngo',

    // Headline cards
    totalOpportunities:    extract(oppMetrics.totalOpportunities),
    activeOpportunities:   extract(oppMetrics.activeOpportunities),
    opportunitiesGrowth:   growthPercent(curOpps, prevOpps),

    totalApplications:     extract(applicationMetrics.totalApplications),
    pendingApplications:   extract(applicationMetrics.pendingApplications),
    acceptedApplications:  extract(applicationMetrics.acceptedApplications),
    applicationsGrowth:    growthPercent(curApps, prevApps),

    completedPickups:      extract(pickupMetrics.completedPickups),
    totalAssignedPickups:  extract(pickupMetrics.totalAssigned),
    pickupsGrowth:         growthPercent(curPick, prevPick),

    recycledItemsCount:    totalItems,
    recycledWeightKg:      Math.round(totalW * 100) / 100,
    co2SavedKg:            Math.round(totalCO2 * 100) / 100,
    recycledItemsGrowth:   growthPercent(
      curWaste?.weightKg  || 0,
      prevWaste?.weightKg || 0,
    ),
  };
};

/**
 * Role-aware personal dashboard dispatcher.
 * Called by GET /api/v1/dashboard/metrics (all authenticated users).
 *
 * @param {string} userId
 * @param {string} role   — 'volunteer' | 'ngo' | 'admin'
 * @returns {Promise<object>}
 */
const getUserDashboardMetrics = async (userId, role) => {
  if (role === 'ngo') return getNgoDashboardMetrics(userId);
  // volunteer and admin fall through to volunteer metrics
  // (admin has a dedicated /admin/dashboard/stats route)
  return getVolunteerDashboardMetrics(userId);
};

// ─────────────────────────────────────────────────────────────────────────────
// B2. "Upcoming Events" widgets — dashboard cards for NGO and Volunteer
//
// Two separate lists per role (never merged — the frontend renders them as
// distinct panels): upcoming Opportunities and upcoming Pickups.
//   NGO       → opportunities it created (ngo_id) + pickups assigned to it (agent_id)
//   Volunteer → opportunities it's been accepted into (accepted Application)
//               + pickups it created (user_id)
//
// "Upcoming" = scheduled today or later, and not in a terminal/closed state
// (Cancelled/Missed/Completed pickups and closed opportunities are history,
// not upcoming). Each item is normalised to the same shape so the frontend
// can render both lists with one component:
//   { id, eventName, date, time, address, status }
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_UPCOMING_LIMIT = 10;

/** Start of today (local midnight per server clock) — the "upcoming" floor. */
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Build a single display address string from Pickup.address {city, area}. */
const formatPickupAddress = (address) => {
  if (!address) return '';
  return [address.area, address.city].filter(Boolean).join(', ');
};

/** Human-readable event name for a pickup, from its waste types. */
const formatPickupEventName = (wasteTypes) => {
  if (Array.isArray(wasteTypes) && wasteTypes.length > 0) {
    return `${wasteTypes.join(', ')} Pickup`;
  }
  return 'Waste Pickup';
};

/** Normalise a lean Opportunity doc into the shared upcoming-event shape. */
const toOpportunityEvent = (opp) => ({
  id:        opp._id,
  eventName: opp.title,
  date:      opp.date,
  time:      null, // Opportunity has no time-of-day field, only a date
  address:   opp.location,
  status:    opp.status,
});

/** Normalise a lean Pickup doc (with 12h display fields) into the shared shape. */
const toPickupEvent = (pickup) => ({
  id:        pickup._id,
  eventName: formatPickupEventName(pickup.wasteTypes),
  date:      pickup.scheduledDate,
  time: {
    start:        pickup.preferredTimeSlot?.start,
    end:          pickup.preferredTimeSlot?.end,
    startDisplay: pickup.preferredTimeSlot?.startDisplay,
    endDisplay:   pickup.preferredTimeSlot?.endDisplay,
  },
  address: formatPickupAddress(pickup.address),
  status:  pickup.status,
});

/**
 * NGO: upcoming opportunities it created + upcoming pickups assigned to it.
 *
 * @param {string} ngoId
 * @param {number} [limit=10]
 * @returns {Promise<{ opportunities: object[], pickups: object[] }>}
 */
const getNgoUpcomingEvents = async (ngoId, limit = DEFAULT_UPCOMING_LIMIT) => {
  const uid   = new mongoose.Types.ObjectId(ngoId);
  const floor = startOfToday();

  const [opportunities, pickups] = await Promise.all([
    Opportunity.find({
      ngo_id:           uid,
      isRemovedByAdmin: { $ne: true },
      status:           { $ne: 'closed' },
      date:             { $gte: floor },
    })
      .sort({ date: 1 })
      .limit(limit)
      .select('title date location status')
      .lean(),

    Pickup.find({
      agent_id:      uid,
      status:        'Assigned', // claimed and not yet completed — the NGO's upcoming work
      scheduledDate: { $gte: floor },
    })
      .sort({ scheduledDate: 1 })
      .limit(limit)
      .select('wasteTypes scheduledDate preferredTimeSlot address status')
      .lean(),
  ]);

  return {
    opportunities: opportunities.map(toOpportunityEvent),
    pickups:       pickups.map(addTimeDisplayFields).map(toPickupEvent),
  };
};

/**
 * Volunteer: upcoming opportunities they've applied for (pending or accepted
 * — a rejected application means they're not attending, so it's excluded) +
 * upcoming pickups they created themselves.
 *
 * @param {string} volunteerId
 * @param {number} [limit=10]
 * @returns {Promise<{ opportunities: object[], pickups: object[] }>}
 */
const getVolunteerUpcomingEvents = async (volunteerId, limit = DEFAULT_UPCOMING_LIMIT) => {
  const uid   = new mongoose.Types.ObjectId(volunteerId);
  const floor = startOfToday();

  const [appliedApps, pickups] = await Promise.all([
    Application.find({ volunteer_id: uid, status: { $in: ['pending', 'accepted'] } })
      .populate({
        path:  'opportunity_id',
        match: {
          isRemovedByAdmin: { $ne: true },
          status:           { $ne: 'closed' },
          date:             { $gte: floor },
        },
        select: 'title date location status',
      })
      .lean(),

    Pickup.find({
      user_id:       uid,
      status:        { $in: ['Pending', 'Assigned'] }, // still open — not yet completed/cancelled/missed
      scheduledDate: { $gte: floor },
    })
      .sort({ scheduledDate: 1 })
      .limit(limit)
      .select('wasteTypes scheduledDate preferredTimeSlot address status')
      .lean(),
  ]);

  // populate `match` leaves opportunity_id === null for applications whose
  // opportunity didn't satisfy the filter (removed, closed, or in the past).
  const opportunities = appliedApps
    .map((app) => app.opportunity_id)
    .filter(Boolean)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, limit)
    .map(toOpportunityEvent);

  return {
    opportunities,
    pickups: pickups.map(addTimeDisplayFields).map(toPickupEvent),
  };
};

/**
 * Admin: platform-wide upcoming view — ALL upcoming opportunities (any NGO)
 * + ALL upcoming pickups (any user), not scoped to the admin's own id.
 *
 * @param {number} [limit=10]
 * @returns {Promise<{ opportunities: object[], pickups: object[] }>}
 */
const getAdminUpcomingEvents = async (limit = DEFAULT_UPCOMING_LIMIT) => {
  const floor = startOfToday();

  const [opportunities, pickups] = await Promise.all([
    Opportunity.find({
      isRemovedByAdmin: { $ne: true },
      status:           { $ne: 'closed' },
      date:             { $gte: floor },
    })
      .sort({ date: 1 })
      .limit(limit)
      .select('title date location status')
      .lean(),

    Pickup.find({
      status:        { $in: ['Pending', 'Assigned'] }, // still open — not yet completed/cancelled/missed
      scheduledDate: { $gte: floor },
    })
      .sort({ scheduledDate: 1 })
      .limit(limit)
      .select('wasteTypes scheduledDate preferredTimeSlot address status')
      .lean(),
  ]);

  return {
    opportunities: opportunities.map(toOpportunityEvent),
    pickups:       pickups.map(addTimeDisplayFields).map(toPickupEvent),
  };
};

/**
 * Role-aware dispatcher for the dashboard's "Upcoming Events" widgets.
 *   NGO       → opportunities it created + pickups assigned to it
 *   Volunteer → opportunities it applied for + pickups it created
 *   Admin     → ALL opportunities created (any NGO) + ALL pickups created
 *               (any user) — platform-wide, not scoped to the admin's own id
 *
 * @param {string} userId
 * @param {string} role   — 'volunteer' | 'ngo' | 'admin'
 * @param {number} [limit=10]
 * @returns {Promise<{ opportunities: object[], pickups: object[] }>}
 */
const getUpcomingEventsForUser = async (userId, role, limit = DEFAULT_UPCOMING_LIMIT) => {
  if (role === 'ngo')   return getNgoUpcomingEvents(userId, limit);
  if (role === 'admin') return getAdminUpcomingEvents(limit);
  return getVolunteerUpcomingEvents(userId, limit);
};

// ─────────────────────────────────────────────────────────────────────────────
// B3. Public Leaderboard — "Top Contributors" for everyone, not just admin
//
// getWasteStatsAnalytics() (section H below) already has a top-10 contributor
// list, but it's admin-only and only ranks volunteers (WasteStats.user_id).
// This is the everyone-facing version:
//   - Volunteers are ranked against other volunteers (by WasteStats.user_id).
//   - NGOs are ranked against other NGOs (by WasteStats.ngo_id).
//     (Different populations, different totals — an NGO's number reflects
//     every pickup it completed; a volunteer's reflects every pickup they
//     personally requested. Mixing them into one ranking would be comparing
//     unlike things, so the two stay separate leaderboards.)
//   - Always includes the requesting user's OWN rank and stats, even when
//     they're outside the top N (or have zero records yet).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_LEADERBOARD_LIMIT = 10;

/**
 * Rank every volunteer or every NGO by total CO₂ saved, and return the top N
 * plus the requesting user's own placement.
 *
 * @param {'volunteer'|'ngo'} targetRole  - which population to rank
 * @param {string} requestingUserId       - whose rank/stats to surface as `me`
 * @param {number} [limit=10]
 * @returns {Promise<{ role, topContributors: object[], me: object|null, totalRanked: number }>}
 */
const getLeaderboardForRole = async (targetRole, requestingUserId, limit = DEFAULT_LEADERBOARD_LIMIT) => {
  const groupField = targetRole === 'ngo' ? '$ngo_id' : '$user_id';
  const matchStage = targetRole === 'ngo'
    ? [{ $match: { ngo_id: { $ne: null } } }]
    : [{ $match: { user_id: { $ne: null } } }];

  // Full ranked list (no $limit here) so we can find the requester's rank
  // even when they're outside the top N. Consistent with the rest of this
  // file's dashboard aggregations, which already scan full collections.
  const ranked = await WasteStats.aggregate([
    ...matchStage,
    {
      $group: {
        _id:         groupField,
        totalCO2:    { $sum: '$co2_saved_kg' },
        totalWeight: { $sum: '$weight' },
        pickupIds:   { $addToSet: '$pickup_id' },
      },
    },
    {
      $project: {
        totalCO2:    1,
        totalWeight: 1,
        pickupCount: { $size: '$pickupIds' },
      },
    },
    { $sort: { totalCO2: -1 } },
  ]);

  const withRank = ranked.map((r, i) => ({ ...r, rank: i + 1 }));

  const requesterKey = String(requestingUserId);
  const meEntry = withRank.find((r) => String(r._id) === requesterKey) || null;
  const top     = withRank.slice(0, limit);

  // Populate display info only for the ids we're actually returning (top N + me)
  const idsToPopulate = new Set(top.map((r) => String(r._id)));
  if (meEntry) idsToPopulate.add(String(meEntry._id));

  const users = await User.find({ _id: { $in: [...idsToPopulate] } })
    .select('name email role')
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const toEntry = (r) => ({
    rank:          r.rank,
    user:          userMap.get(String(r._id)) || null,
    totalCO2Kg:    Math.round(r.totalCO2 * 100) / 100,
    totalWeightKg: Math.round(r.totalWeight * 100) / 100,
    pickupCount:   r.pickupCount,
  });

  return {
    role:            targetRole,
    topContributors: top.map(toEntry),
    me:              meEntry ? toEntry(meEntry) : null, // null → no WasteStats yet
    totalRanked:     withRank.length,
  };
};

/**
 * Role-aware dispatcher: volunteers are ranked against volunteers, NGOs
 * against NGOs. Admin has no WasteStats population of its own, so it gets
 * BOTH leaderboards side by side (`volunteers` + `ngos`), each shaped like
 * a normal getLeaderboardForRole() result (with `me: null`, since an admin
 * account has no volunteer- or NGO-type activity to rank).
 *
 * @param {string} userId
 * @param {string} role   — 'volunteer' | 'ngo' | 'admin'
 * @param {number} [limit=10]
 * @returns {Promise<object>} volunteer/NGO shape, or { volunteers, ngos } for admin
 */
const getLeaderboardForUser = async (userId, role, limit = DEFAULT_LEADERBOARD_LIMIT) => {
  if (role === 'admin') {
    const [volunteers, ngos] = await Promise.all([
      getLeaderboardForRole('volunteer', userId, limit),
      getLeaderboardForRole('ngo', userId, limit),
    ]);
    return { volunteers, ngos };
  }

  const targetRole = role === 'ngo' ? 'ngo' : 'volunteer';
  return getLeaderboardForRole(targetRole, userId, limit);
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
                  $cond: {
                    if:   { $lte: ['$grandTotalWeight', 0] },
                    then: 0,
                    else: {
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
 * Monthly aggregation trend for pickups / waste / applications over the last N months.
 * Returns data structured for Clustered Column Charts and Line Charts.
 *
 * Role behaviour (when scoped=true is passed by the controller):
 *   admin     → platform-wide (no user filter) — sees all pickups, waste, opportunities, applications
 *   ngo       → scoped to the NGO's own activity:
 *                 Pickup   filtered by agent_id  (pickups the NGO completed)
 *                 WasteStats filtered by ngo_id  (waste logged against the NGO)
 *                 Opportunity filtered by ngo_id (opportunities the NGO created)
 *                 Application filtered through the NGO's opportunity_ids (applications received)
 *   volunteer → scoped to the volunteer's own activity:
 *                 Pickup   filtered by user_id   (pickups the volunteer created)
 *                 WasteStats filtered by user_id (waste from the volunteer's pickups)
 *                 Application filtered by volunteer_id (applications the volunteer submitted)
 *                 Opportunity — volunteers see opportunities they were accepted into
 *
 * @param {number} [months=12]     - Number of months to look back
 * @param {string|null} [userId]   - If provided, scope to this user
 * @param {string} [role]          - 'admin' | 'ngo' | 'volunteer'
 * @param {Date|null} [endDate=null] - Custom reference date (used for ?startDate/?endDate custom ranges); defaults to now.
 * @returns {Promise<object>}
 */
const getMonthlyTrends = async (months = 12, userId = null, role = 'admin', endDate = null) => {
  const now = endDate instanceof Date && !isNaN(endDate) ? endDate : new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const dateCond = { $gte: startDate };
  if (endDate instanceof Date && !isNaN(endDate)) {
    dateCond.$lte = endDate;
  }

  // Base time filters
  // For pickups: Completed pickups match on completion/update date, non-completed on creation date
  const pickupMatch = {
    $or: [
      { status: 'Completed', completedAt: dateCond },
      { status: 'Completed', completedAt: null, createdAt: dateCond },
      { status: { $ne: 'Completed' }, createdAt: dateCond },
    ],
  };
  const wasteMatch  = { date:       dateCond };
  const oppMatch    = { createdAt:  dateCond };
  const appMatch    = { createdAt:  dateCond };

  // Scoping — only applied when userId is present (scoped=true from controller)
  // Admin: no scoping → full platform view
  // NGO: agent_id / ngo_id / ngo_id / derived opportunity_ids
  // Volunteer: user_id / user_id / volunteer_id / accepted apps → opportunity match
  let ngoOpportunityIds = null;

  if (userId && role !== 'admin') {
    const uid = new mongoose.Types.ObjectId(userId);

    if (role === 'ngo') {
      pickupMatch.agent_id = uid;     // NGO completed these pickups
      wasteMatch.ngo_id    = uid;     // Waste logged against the NGO
      oppMatch.ngo_id      = uid;     // Opportunities the NGO created

      // Applications received on the NGO's opportunities
      const ids = await Opportunity.find({ ngo_id: uid }).distinct('_id');
      ngoOpportunityIds = ids;
      appMatch.opportunity_id = { $in: ids };

    } else {
      // volunteer (or admin falling through)
      pickupMatch.user_id    = uid;   // Pickups the volunteer created
      wasteMatch.user_id     = uid;   // Waste from the volunteer's pickups
      appMatch.volunteer_id  = uid;   // Applications the volunteer submitted

      // Opportunities the volunteer was accepted into
      const acceptedOppIds = await Application
        .find({ volunteer_id: uid, status: 'accepted' })
        .distinct('opportunity_id');
      oppMatch._id = { $in: acceptedOppIds };
    }
  }

  const { ALLOWED_WASTE_TYPES } = require('../constants/wasteTypes');

  const [pickupTrends, wasteTrends, oppTrends, appTrends, userGrowth] = await Promise.all([
    // Pickups by status × month (completed grouped by completion date)
    Pickup.aggregate([
      { $match: pickupMatch },
      {
        $project: {
          status: 1,
          eventDate: {
            $cond: {
              if: { $eq: ['$status', 'Completed'] },
              then: { $ifNull: ['$completedAt', '$createdAt'] },
              else: '$createdAt',
            },
          },
        },
      },
      {
        $group: {
          _id: {
            year:   { $year:  '$eventDate' },
            month:  { $month: '$eventDate' },
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),

    // Waste by category × month
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

    // Opportunities created × month
    Opportunity.aggregate([
      { $match: oppMatch },
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

    // Applications × month
    Application.aggregate([
      { $match: appMatch },
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

    // User growth × month — always platform-wide, mirrors getYearlyTrends
    // / getWeeklyTrends / getDailyTrends (a per-user "growth" figure isn't
    // meaningful for a scoped NGO/volunteer view).
    User.aggregate([
      { $match: { createdAt: dateCond } },
      {
        $group: {
          _id: {
            year:  { $year:  '$createdAt' },
            month: { $month: '$createdAt' },
            role:  '$role',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
  ]);

  // Build month labels
  const labels = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push({
      year:  d.getFullYear(),
      month: d.getMonth() + 1,
      label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    });
  }

  const pickupStatuses = ['Pending', 'Assigned', 'Completed', 'Cancelled']; // Missed excluded per product spec (trend clusters track actionable outcomes, not the sweep's timeout state)
  const appStatuses    = ['pending', 'accepted', 'rejected'];
  const oppStatuses    = ['open', 'in-progress', 'closed'];

  const pickupDatasets = pickupStatuses.map((status) => ({
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
      return Math.round((Number(found?.totalWeight) || 0) * 100) / 100;
    }),
  }));

  const co2Dataset = {
    label: 'CO₂ Saved (kg)',
    data: labels.map(({ year, month }) => {
      const monthRecords = wasteTrends.filter(
        (w) => w._id.year === year && w._id.month === month
      );
      const total = monthRecords.reduce((sum, w) => sum + (Number(w.totalCO2) || 0), 0);
      return Math.round(total * 100) / 100;
    }),
  };

  const opportunityDatasets = oppStatuses.map((status) => ({
    label: status.charAt(0).toUpperCase() + status.slice(1),
    data: labels.map(({ year, month }) => {
      const found = oppTrends.find(
        (o) => o._id.year === year && o._id.month === month && o._id.status === status
      );
      return found?.count || 0;
    }),
  }));

  const applicationDatasets = appStatuses.map((status) => ({
    label: status.charAt(0).toUpperCase() + status.slice(1),
    data: labels.map(({ year, month }) => {
      const found = appTrends.find(
        (a) => a._id.year === year && a._id.month === month && a._id.status === status
      );
      return found?.count || 0;
    }),
  }));

  const userDatasets = ['volunteer', 'ngo', 'admin'].map((r) => ({
    label: r.charAt(0).toUpperCase() + r.slice(1),
    data: labels.map(({ year, month }) => {
      const found = userGrowth.find(
        (u) => u._id.year === year && u._id.month === month && u._id.role === r
      );
      return found?.count || 0;
    }),
  }));

  return {
    labels:        labels.map((l) => l.label),
    pickup:        { datasets: pickupDatasets },
    waste:         { datasets: wasteDatasets },
    co2:           co2Dataset,
    opportunities: { datasets: opportunityDatasets },
    applications:  { datasets: applicationDatasets },
    users:         { datasets: userDatasets },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// E. Weekly Trend Data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Weekly trend aggregation for the last N weeks.
 * Role behaviour (when scoped=true is passed by the controller):
 *   admin     → platform-wide (no user filter)
 *   ngo       → Pickup.agent_id, WasteStats.ngo_id, Opportunity.ngo_id,
 *               applications received on the NGO's opportunities
 *   volunteer → Pickup.user_id, WasteStats.user_id, applications submitted,
 *               opportunities the volunteer was accepted into
 *
 * User growth is always platform-wide (a per-user "growth" figure isn't
 * meaningful), mirroring getYearlyTrends.
 *
 * @param {number} [weeks=12]
 * @param {string|null} [userId]
 * @param {string} [role]  'admin' | 'ngo' | 'volunteer'
 * @returns {Promise<object>}
 */
const getWeeklyTrends = async (weeks = 12, userId = null, role = 'admin', endDate = null) => {
  const now = endDate instanceof Date && !isNaN(endDate) ? endDate : new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - weeks * 7);

  const dateCond = { $gte: startDate };
  if (endDate instanceof Date && !isNaN(endDate)) {
    dateCond.$lte = endDate;
  }

  const pickupMatch = {
    $or: [
      { status: 'Completed', completedAt: dateCond },
      { status: 'Completed', completedAt: null, createdAt: dateCond },
      { status: { $ne: 'Completed' }, createdAt: dateCond },
    ],
  };
  const wasteMatch  = { date:      dateCond };
  const oppMatch    = { createdAt: dateCond };
  const appMatch    = { createdAt: dateCond };

  if (userId && role !== 'admin') {
    const uid = new mongoose.Types.ObjectId(userId);
    if (role === 'ngo') {
      pickupMatch.agent_id = uid;
      wasteMatch.ngo_id    = uid;
      oppMatch.ngo_id      = uid;

      const ids = await Opportunity.find({ ngo_id: uid }).distinct('_id');
      appMatch.opportunity_id = { $in: ids };
    } else {
      pickupMatch.user_id   = uid;
      wasteMatch.user_id    = uid;
      appMatch.volunteer_id = uid;

      const acceptedOppIds = await Application
        .find({ volunteer_id: uid, status: 'accepted' })
        .distinct('opportunity_id');
      oppMatch._id = { $in: acceptedOppIds };
    }
  }

  const { ALLOWED_WASTE_TYPES } = require('../constants/wasteTypes');

  const [pickupTrends, wasteTrends, oppTrends, appTrends, userGrowth] = await Promise.all([
    Pickup.aggregate([
      { $match: pickupMatch },
      {
        $project: {
          status: 1,
          eventDate: {
            $cond: {
              if: { $eq: ['$status', 'Completed'] },
              then: { $ifNull: ['$completedAt', '$createdAt'] },
              else: '$createdAt',
            },
          },
        },
      },
      {
        $group: {
          _id: {
            week:   { $isoWeek: '$eventDate' },
            year:   { $isoWeekYear: '$eventDate' },
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.week': 1 } },
    ]),

    WasteStats.aggregate([
      { $match: wasteMatch },
      {
        $group: {
          _id: {
            week:     { $isoWeek: '$date' },
            year:     { $isoWeekYear: '$date' },
            category: '$category',
          },
          totalWeight: { $sum: '$weight' },
          totalCO2:    { $sum: '$co2_saved_kg' },
        },
      },
      { $sort: { '_id.year': 1, '_id.week': 1 } },
    ]),

    Opportunity.aggregate([
      { $match: oppMatch },
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
    ]),

    Application.aggregate([
      { $match: appMatch },
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
    ]),

    User.aggregate([
      { $match: { createdAt: dateCond } },
      {
        $group: {
          _id: {
            week: { $isoWeek: '$createdAt' },
            year: { $isoWeekYear: '$createdAt' },
            role: '$role',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.week': 1 } },
    ]),
  ]);

  const labels = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const weekNum = getISOWeek(d);
    const year    = getISOWeekYear(d);
    labels.push({ week: weekNum, year, label: `W${weekNum} '${String(year).slice(2)}` });
  }

  const pickupStatuses = ['Pending', 'Assigned', 'Completed', 'Cancelled']; // Missed excluded per product spec (trend clusters track actionable outcomes, not the sweep's timeout state)
  const appStatuses    = ['pending', 'accepted', 'rejected'];
  const oppStatuses    = ['open', 'in-progress', 'closed'];

  const pickupDatasets = pickupStatuses.map((status) => ({
    label: status,
    data: labels.map(({ week, year }) => {
      const found = pickupTrends.find(
        (t) => t._id.week === week && t._id.year === year && t._id.status === status
      );
      return found?.count || 0;
    }),
  }));

  const wasteDatasets = ALLOWED_WASTE_TYPES.map((cat) => ({
    label: cat,
    data: labels.map(({ week, year }) => {
      const found = wasteTrends.find(
        (w) => w._id.week === week && w._id.year === year && w._id.category === cat
      );
      return Math.round((Number(found?.totalWeight) || 0) * 100) / 100;
    }),
  }));

  const co2Dataset = {
    label: 'CO₂ Saved (kg)',
    data: labels.map(({ week, year }) => {
      const weekRecords = wasteTrends.filter((w) => w._id.week === week && w._id.year === year);
      const total = weekRecords.reduce((sum, w) => sum + (Number(w.totalCO2) || 0), 0);
      return Math.round(total * 100) / 100;
    }),
  };

  const opportunityDatasets = oppStatuses.map((status) => ({
    label: status.charAt(0).toUpperCase() + status.slice(1),
    data: labels.map(({ week, year }) => {
      const found = oppTrends.find(
        (o) => o._id.week === week && o._id.year === year && o._id.status === status
      );
      return found?.count || 0;
    }),
  }));

  const applicationDatasets = appStatuses.map((status) => ({
    label: status.charAt(0).toUpperCase() + status.slice(1),
    data: labels.map(({ week, year }) => {
      const found = appTrends.find(
        (a) => a._id.week === week && a._id.year === year && a._id.status === status
      );
      return found?.count || 0;
    }),
  }));

  const userDatasets = ['volunteer', 'ngo', 'admin'].map((r) => ({
    label: r.charAt(0).toUpperCase() + r.slice(1),
    data: labels.map(({ week, year }) => {
      const found = userGrowth.find(
        (u) => u._id.week === week && u._id.year === year && u._id.role === r
      );
      return found?.count || 0;
    }),
  }));

  return {
    labels:        labels.map((l) => l.label),
    pickup:        { datasets: pickupDatasets },
    waste:         { datasets: wasteDatasets },
    co2:           co2Dataset,
    opportunities: { datasets: opportunityDatasets },
    applications:  { datasets: applicationDatasets },
    users:         { datasets: userDatasets },
  };
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

/**
 * ISO week-year helper — the year the ISO week actually belongs to, which
 * can differ from the calendar year (getFullYear()) near year boundaries:
 * e.g. Dec 31 2029 falls in ISO week 1 of 2030, and Jan 1 2028 falls in ISO
 * week 52 of 2027. Must be used together with getISOWeek() when matching
 * against Mongo's $isoWeek/$isoWeekYear aggregation output — using
 * getFullYear() there caused that week's bucket to silently read as 0
 * around every year-end.
 *
 * @param {Date} date
 * @returns {number}
 */
const getISOWeekYear = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  return d.getFullYear();
};

// ─────────────────────────────────────────────────────────────────────────────
// F. Daily Trend Data (last N days)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Daily pickup + waste + opportunity + application counts for the last N days.
 * Role behaviour (when scoped=true is passed by the controller):
 *   admin     → platform-wide (no user filter)
 *   ngo       → Pickup.agent_id, WasteStats.ngo_id, Opportunity.ngo_id,
 *               applications received on the NGO's opportunities
 *   volunteer → Pickup.user_id, WasteStats.user_id, applications submitted,
 *               opportunities the volunteer was accepted into
 *
 * User growth is always platform-wide, mirroring getYearlyTrends /
 * getWeeklyTrends.
 *
 * @param {number} [days=30]
 * @param {string|null} [userId]
 * @param {string} [role]  'admin' | 'ngo' | 'volunteer'
 * @returns {Promise<object>}
 */
const getDailyTrends = async (days = 30, userId = null, role = 'admin', endDate = null) => {
  const now = endDate instanceof Date && !isNaN(endDate) ? endDate : new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days + 1);
  startDate.setHours(0, 0, 0, 0);

  const dateCond = { $gte: startDate };
  if (endDate instanceof Date && !isNaN(endDate)) {
    dateCond.$lte = endDate;
  }

  const pickupMatch = {
    $or: [
      { status: 'Completed', completedAt: dateCond },
      { status: 'Completed', completedAt: null, createdAt: dateCond },
      { status: { $ne: 'Completed' }, createdAt: dateCond },
    ],
  };
  const wasteMatch  = { date:      dateCond };
  const oppMatch    = { createdAt: dateCond };
  const appMatch    = { createdAt: dateCond };

  if (userId && role !== 'admin') {
    const uid = new mongoose.Types.ObjectId(userId);
    if (role === 'ngo') {
      pickupMatch.agent_id = uid;
      wasteMatch.ngo_id    = uid;
      oppMatch.ngo_id      = uid;

      const ids = await Opportunity.find({ ngo_id: uid }).distinct('_id');
      appMatch.opportunity_id = { $in: ids };
    } else {
      pickupMatch.user_id   = uid;
      wasteMatch.user_id    = uid;
      appMatch.volunteer_id = uid;

      const acceptedOppIds = await Application
        .find({ volunteer_id: uid, status: 'accepted' })
        .distinct('opportunity_id');
      oppMatch._id = { $in: acceptedOppIds };
    }
  }

  const { ALLOWED_WASTE_TYPES } = require('../constants/wasteTypes');

  const [pickupTrends, wasteTrends, oppTrends, appTrends, userGrowth] = await Promise.all([
    Pickup.aggregate([
      { $match: pickupMatch },
      {
        $project: {
          status: 1,
          eventDate: {
            $cond: {
              if: { $eq: ['$status', 'Completed'] },
              then: { $ifNull: ['$completedAt', '$createdAt'] },
              else: '$createdAt',
            },
          },
        },
      },
      {
        $group: {
          _id: {
            year:   { $year:  '$eventDate' },
            month:  { $month: '$eventDate' },
            day:    { $dayOfMonth: '$eventDate' },
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]),

    WasteStats.aggregate([
      { $match: wasteMatch },
      {
        $group: {
          _id: {
            year:     { $year:  '$date' },
            month:    { $month: '$date' },
            day:      { $dayOfMonth: '$date' },
            category: '$category',
          },
          totalWeight: { $sum: '$weight' },
          totalCO2:    { $sum: '$co2_saved_kg' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]),

    Opportunity.aggregate([
      { $match: oppMatch },
      {
        $group: {
          _id: {
            year:   { $year:  '$createdAt' },
            month:  { $month: '$createdAt' },
            day:    { $dayOfMonth: '$createdAt' },
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]),

    Application.aggregate([
      { $match: appMatch },
      {
        $group: {
          _id: {
            year:   { $year:  '$createdAt' },
            month:  { $month: '$createdAt' },
            day:    { $dayOfMonth: '$createdAt' },
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]),

    User.aggregate([
      { $match: { createdAt: dateCond } },
      {
        $group: {
          _id: {
            year:  { $year:  '$createdAt' },
            month: { $month: '$createdAt' },
            day:   { $dayOfMonth: '$createdAt' },
            role:  '$role',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]),
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

  const pickupStatuses = ['Pending', 'Assigned', 'Completed', 'Cancelled']; // Missed excluded per product spec (trend clusters track actionable outcomes, not the sweep's timeout state)
  const appStatuses    = ['pending', 'accepted', 'rejected'];
  const oppStatuses    = ['open', 'in-progress', 'closed'];

  const pickupDatasets = pickupStatuses.map((status) => ({
    label: status,
    data: labels.map(({ year, month, day }) => {
      const found = pickupTrends.find(
        (t) =>
          t._id.year  === year &&
          t._id.month === month &&
          t._id.day   === day &&
          t._id.status === status
      );
      return found?.count || 0;
    }),
  }));

  const wasteDatasets = ALLOWED_WASTE_TYPES.map((cat) => ({
    label: cat,
    data: labels.map(({ year, month, day }) => {
      const found = wasteTrends.find(
        (w) => w._id.year === year && w._id.month === month && w._id.day === day && w._id.category === cat
      );
      return Math.round((Number(found?.totalWeight) || 0) * 100) / 100;
    }),
  }));

  const co2Dataset = {
    label: 'CO₂ Saved (kg)',
    data: labels.map(({ year, month, day }) => {
      const dayRecords = wasteTrends.filter(
        (w) => w._id.year === year && w._id.month === month && w._id.day === day
      );
      const total = dayRecords.reduce((sum, w) => sum + (Number(w.totalCO2) || 0), 0);
      return Math.round(total * 100) / 100;
    }),
  };

  const opportunityDatasets = oppStatuses.map((status) => ({
    label: status.charAt(0).toUpperCase() + status.slice(1),
    data: labels.map(({ year, month, day }) => {
      const found = oppTrends.find(
        (o) =>
          o._id.year  === year &&
          o._id.month === month &&
          o._id.day   === day &&
          o._id.status === status
      );
      return found?.count || 0;
    }),
  }));

  const applicationDatasets = appStatuses.map((status) => ({
    label: status.charAt(0).toUpperCase() + status.slice(1),
    data: labels.map(({ year, month, day }) => {
      const found = appTrends.find(
        (a) =>
          a._id.year  === year &&
          a._id.month === month &&
          a._id.day   === day &&
          a._id.status === status
      );
      return found?.count || 0;
    }),
  }));

  const userDatasets = ['volunteer', 'ngo', 'admin'].map((r) => ({
    label: r.charAt(0).toUpperCase() + r.slice(1),
    data: labels.map(({ year, month, day }) => {
      const found = userGrowth.find(
        (u) => u._id.year === year && u._id.month === month && u._id.day === day && u._id.role === r
      );
      return found?.count || 0;
    }),
  }));

  return {
    labels:        labels.map((l) => l.label),
    pickup:        { datasets: pickupDatasets },
    waste:         { datasets: wasteDatasets },
    co2:           co2Dataset,
    opportunities: { datasets: opportunityDatasets },
    applications:  { datasets: applicationDatasets },
    users:         { datasets: userDatasets },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// G. Yearly Trend Data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Multi-year high-level trajectory (default 5 years, max 10).
 * Platform-wide view only.
 *
 * @param {number} [years=5]
 * @returns {Promise<object>}
 */
const getYearlyTrends = async (years = 5) => {
  const now = new Date();
  const startYear = now.getFullYear() - years + 1;
  const startDate = new Date(startYear, 0, 1);

  const [pickupTrends, wasteTrends, userGrowth, oppTrends, appTrends] = await Promise.all([
    Pickup.aggregate([
      {
        $match: {
          $or: [
            { status: 'Completed', completedAt: { $gte: startDate } },
            { status: 'Completed', completedAt: null, createdAt: { $gte: startDate } },
            { status: { $ne: 'Completed' }, createdAt: { $gte: startDate } },
          ],
        },
      },
      {
        $project: {
          status: 1,
          eventDate: {
            $cond: {
              if: { $eq: ['$status', 'Completed'] },
              then: { $ifNull: ['$completedAt', '$createdAt'] },
              else: '$createdAt',
            },
          },
        },
      },
      {
        $group: {
          _id:    { year: { $year: '$eventDate' }, status: '$status' },
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

    Opportunity.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id:   { year: { $year: '$createdAt' }, status: '$status' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1 } },
    ]),

    Application.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id:   { year: { $year: '$createdAt' }, status: '$status' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1 } },
    ]),
  ]);

  const labels = Array.from({ length: years }, (_, i) => String(startYear + i));
  const { ALLOWED_WASTE_TYPES } = require('../constants/wasteTypes');
  const statuses    = ['Pending', 'Assigned', 'Completed', 'Cancelled']; // Missed excluded per product spec
  const oppStatuses = ['open', 'in-progress', 'closed'];
  const appStatuses = ['pending', 'accepted', 'rejected'];

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

  const opportunityDatasets = oppStatuses.map((status) => ({
    label: status.charAt(0).toUpperCase() + status.slice(1),
    data: labels.map((yr) => {
      const found = oppTrends.find(
        (o) => String(o._id.year) === yr && o._id.status === status
      );
      return found?.count || 0;
    }),
  }));

  const applicationDatasets = appStatuses.map((status) => ({
    label: status.charAt(0).toUpperCase() + status.slice(1),
    data: labels.map((yr) => {
      const found = appTrends.find(
        (a) => String(a._id.year) === yr && a._id.status === status
      );
      return found?.count || 0;
    }),
  }));

  return {
    labels,
    pickup:        { datasets: pickupDatasets },
    waste:         { datasets: wasteDatasets },
    co2:           co2Dataset,
    users:         { datasets: userDatasets },
    opportunities: { datasets: opportunityDatasets },
    applications:  { datasets: applicationDatasets },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// G2. Summary Reports — User Report / Opportunity Report / Volunteer
//     Response (Application) Report, with simple chart-ready data.
//
// This is the plain-language admin report the product brief asks for:
//   User Report          → Total Users, Active Users, Volunteers, NGOs
//   Opportunity Report   → Total, Open, Closed, In Progress
//   Volunteer Response   → Total Applications, Pending, Accepted, Rejected
//     (Application) Report
//
// Each report ships with a matching `chart` block ({ type, labels, data })
// so the frontend can drop the numbers straight into a bar/pie chart
// without re-deriving labels or ordering.
//
// One $facet round-trip per collection (Users, Opportunities, Applications)
// — same pattern as getAdminDashboardStats above.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Admin summary reports: Users / Opportunities / Applications, each with
 * simple totals plus chart-ready { labels, data } for a bar or pie chart.
 *
 * @returns {Promise<object>}
 */
const getSummaryReports = async () => {
  const [[userFacet], [oppFacet], [appFacet], [pickupFacet]] = await Promise.all([
    User.aggregate([
      {
        $facet: {
          total:      [{ $count: 'count' }],
          active:     [{ $match: { isSuspended: false } }, { $count: 'count' }],
          inactive:   [{ $match: { isSuspended: true  } }, { $count: 'count' }],
          volunteers: [{ $match: { role: 'volunteer' } }, { $count: 'count' }],
          ngos:       [{ $match: { role: 'ngo' } }, { $count: 'count' }],
        },
      },
    ]),

    Opportunity.aggregate([
      {
        $facet: {
          total:      [{ $count: 'count' }],
          open:       [{ $match: { status: 'open' } }, { $count: 'count' }],
          closed:     [{ $match: { status: 'closed' } }, { $count: 'count' }],
          inProgress: [{ $match: { status: 'in-progress' } }, { $count: 'count' }],
        },
      },
    ]),

    Application.aggregate([
      {
        $facet: {
          total:    [{ $count: 'count' }],
          pending:  [{ $match: { status: 'pending' } }, { $count: 'count' }],
          accepted: [{ $match: { status: 'accepted' } }, { $count: 'count' }],
          rejected: [{ $match: { status: 'rejected' } }, { $count: 'count' }],
        },
      },
    ]),

    // Pickups — platform-wide, by status. Admin sees every status
    // (Pending / Assigned / Completed / Cancelled / Missed).
    Pickup.aggregate([
      {
        $facet: {
          total:     [{ $count: 'count' }],
          pending:   [{ $match: { status: 'Pending'   } }, { $count: 'count' }],
          assigned:  [{ $match: { status: 'Assigned'  } }, { $count: 'count' }],
          completed: [{ $match: { status: 'Completed' } }, { $count: 'count' }],
          cancelled: [{ $match: { status: 'Cancelled' } }, { $count: 'count' }],
          missed:    [{ $match: { status: 'Missed'    } }, { $count: 'count' }],
        },
      },
    ]),
  ]);

  const extract = (arr) => arr?.[0]?.count || 0;

  const userReport = {
    totalUsers:    extract(userFacet.total),
    activeUsers:   extract(userFacet.active),
    inactiveUsers: extract(userFacet.inactive),
    volunteers:    extract(userFacet.volunteers),
    ngos:          extract(userFacet.ngos),
  };

  const opportunityReport = {
    totalOpportunities: extract(oppFacet.total),
    open:               extract(oppFacet.open),
    closed:             extract(oppFacet.closed),
    inProgress:         extract(oppFacet.inProgress),
  };

  const applicationReport = {
    totalApplications: extract(appFacet.total),
    pending:            extract(appFacet.pending),
    accepted:           extract(appFacet.accepted),
    rejected:           extract(appFacet.rejected),
  };

  const pickupReport = {
    totalPickups: extract(pickupFacet.total),
    pending:      extract(pickupFacet.pending),
    assigned:     extract(pickupFacet.assigned),
    completed:    extract(pickupFacet.completed),
    cancelled:    extract(pickupFacet.cancelled),
    missed:       extract(pickupFacet.missed),
  };

  return {
    generatedAt: new Date().toISOString(),

    userReport,
    opportunityReport,
    applicationReport,
    pickupReport,

    // Chart-ready blocks — frontend can feed these straight into a
    // bar or pie chart component with no further transformation.
    charts: {
      users: {
        type:   'bar',
        title:  'Active vs Inactive Users',
        labels: ['Active', 'Inactive'],
        data:   [userReport.activeUsers, userReport.inactiveUsers],
      },
      opportunities: {
        type:   'pie',
        title:  'Opportunities by Status',
        labels: ['Open', 'Closed', 'In Progress'],
        data:   [opportunityReport.open, opportunityReport.closed, opportunityReport.inProgress],
      },
      applications: {
        type:   'pie',
        title:  'Volunteer Responses by Status',
        labels: ['Pending', 'Accepted', 'Rejected'],
        data:   [applicationReport.pending, applicationReport.accepted, applicationReport.rejected],
      },
      pickups: {
        type:   'pie',
        title:  'Pickups by Status',
        labels: ['Pending', 'Assigned', 'Completed', 'Cancelled', 'Missed'],
        data:   [
          pickupReport.pending,
          pickupReport.assigned,
          pickupReport.completed,
          pickupReport.cancelled,
          pickupReport.missed,
        ],
      },
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// G3. Summary Reports — NGO's own data
//
//   Opportunities they created     → pie chart by status (Open / Closed / In Progress)
//   Applications on those opps     → pie chart by status (Pending / Accepted / Rejected)
//   Pickups assigned to them       → pie chart by status (Completed / Cancelled)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NGO summary reports scoped to the NGO's own opportunities, the applications
 * received on them, and the pickups assigned to the NGO.
 *
 * @param {string} ngoId
 * @returns {Promise<object>}
 */
const getSummaryReportsForNgo = async (ngoId) => {
  const uid = new mongoose.Types.ObjectId(ngoId);
  const opportunityIds = await Opportunity.find({ ngo_id: uid }).distinct('_id');

  const [[oppFacet], [appFacet], [pickupFacet]] = await Promise.all([
    Opportunity.aggregate([
      { $match: { ngo_id: uid } },
      {
        $facet: {
          total:      [{ $count: 'count' }],
          open:       [{ $match: { status: 'open' } }, { $count: 'count' }],
          closed:     [{ $match: { status: 'closed' } }, { $count: 'count' }],
          inProgress: [{ $match: { status: 'in-progress' } }, { $count: 'count' }],
        },
      },
    ]),

    Application.aggregate([
      { $match: { opportunity_id: { $in: opportunityIds } } },
      {
        $facet: {
          total:    [{ $count: 'count' }],
          pending:  [{ $match: { status: 'pending' } }, { $count: 'count' }],
          accepted: [{ $match: { status: 'accepted' } }, { $count: 'count' }],
          rejected: [{ $match: { status: 'rejected' } }, { $count: 'count' }],
        },
      },
    ]),

    // Pickups assigned to this NGO — Assigned / Completed / Cancelled
    Pickup.aggregate([
      { $match: { agent_id: uid } },
      {
        $facet: {
          total:     [{ $count: 'count' }],
          assigned:  [{ $match: { status: 'Assigned' } }, { $count: 'count' }],
          completed: [{ $match: { status: 'Completed' } }, { $count: 'count' }],
          cancelled: [{ $match: { status: 'Cancelled' } }, { $count: 'count' }],
        },
      },
    ]),
  ]);

  const extract = (arr) => arr?.[0]?.count || 0;

  const opportunityReport = {
    totalOpportunities: extract(oppFacet.total),
    open:               extract(oppFacet.open),
    closed:             extract(oppFacet.closed),
    inProgress:         extract(oppFacet.inProgress),
  };

  const applicationReport = {
    totalApplications: extract(appFacet.total),
    pending:            extract(appFacet.pending),
    accepted:           extract(appFacet.accepted),
    rejected:           extract(appFacet.rejected),
  };

  const pickupReport = {
    totalPickups: extract(pickupFacet.total),
    assigned:     extract(pickupFacet.assigned),
    completed:    extract(pickupFacet.completed),
    cancelled:    extract(pickupFacet.cancelled),
  };

  return {
    generatedAt: new Date().toISOString(),

    opportunityReport,
    applicationReport,
    pickupReport,

    charts: {
      opportunities: {
        type:   'pie',
        title:  'Your Opportunities by Status',
        labels: ['Open', 'Closed', 'In Progress'],
        data:   [opportunityReport.open, opportunityReport.closed, opportunityReport.inProgress],
      },
      applications: {
        type:   'pie',
        title:  'Applications Received by Status',
        labels: ['Pending', 'Accepted', 'Rejected'],
        data:   [applicationReport.pending, applicationReport.accepted, applicationReport.rejected],
      },
      pickups: {
        type:   'pie',
        title:  'Assigned Pickups by Status',
        labels: ['Assigned', 'Completed', 'Cancelled'],
        data:   [pickupReport.assigned, pickupReport.completed, pickupReport.cancelled],
      },
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// G4. Summary Reports — Volunteer's own data
//
//   Opportunities they applied to   → pie chart by status (Open / Closed / In Progress)
//   Applications they submitted     → pie chart by status (Pending / Accepted / Rejected)
//   Pickups they created            → pie chart by status
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Volunteer summary reports scoped to the opportunities the volunteer applied
 * to, the applications they submitted, and the pickups they created.
 *
 * @param {string} volunteerId
 * @returns {Promise<object>}
 */
const getSummaryReportsForVolunteer = async (volunteerId) => {
  const uid = new mongoose.Types.ObjectId(volunteerId);
  const appliedOpportunityIds = await Application.find({ volunteer_id: uid }).distinct('opportunity_id');

  const [[oppFacet], [appFacet], [pickupFacet]] = await Promise.all([
    // Opportunities the volunteer has applied to (deduped), by current status
    Opportunity.aggregate([
      { $match: { _id: { $in: appliedOpportunityIds } } },
      {
        $facet: {
          total:      [{ $count: 'count' }],
          open:       [{ $match: { status: 'open' } }, { $count: 'count' }],
          closed:     [{ $match: { status: 'closed' } }, { $count: 'count' }],
          inProgress: [{ $match: { status: 'in-progress' } }, { $count: 'count' }],
        },
      },
    ]),

    Application.aggregate([
      { $match: { volunteer_id: uid } },
      {
        $facet: {
          total:    [{ $count: 'count' }],
          pending:  [{ $match: { status: 'pending' } }, { $count: 'count' }],
          accepted: [{ $match: { status: 'accepted' } }, { $count: 'count' }],
          rejected: [{ $match: { status: 'rejected' } }, { $count: 'count' }],
        },
      },
    ]),

    // Pickups the volunteer created — full lifecycle of statuses.
    Pickup.aggregate([
      { $match: { user_id: uid } },
      {
        $facet: {
          total:     [{ $count: 'count' }],
          pending:   [{ $match: { status: 'Pending'   } }, { $count: 'count' }],
          assigned:  [{ $match: { status: 'Assigned'  } }, { $count: 'count' }],
          completed: [{ $match: { status: 'Completed' } }, { $count: 'count' }],
          cancelled: [{ $match: { status: 'Cancelled' } }, { $count: 'count' }],
          missed:    [{ $match: { status: 'Missed'    } }, { $count: 'count' }],
        },
      },
    ]),
  ]);

  const extract = (arr) => arr?.[0]?.count || 0;

  const opportunityReport = {
    totalOpportunities: extract(oppFacet.total),
    open:               extract(oppFacet.open),
    closed:             extract(oppFacet.closed),
    inProgress:         extract(oppFacet.inProgress),
  };

  const applicationReport = {
    totalApplications: extract(appFacet.total),
    pending:            extract(appFacet.pending),
    accepted:           extract(appFacet.accepted),
    rejected:           extract(appFacet.rejected),
  };

  const pickupReport = {
    totalPickups: extract(pickupFacet.total),
    pending:      extract(pickupFacet.pending),
    assigned:     extract(pickupFacet.assigned),
    completed:    extract(pickupFacet.completed),
    cancelled:    extract(pickupFacet.cancelled),
    missed:       extract(pickupFacet.missed),
  };

  return {
    generatedAt: new Date().toISOString(),

    opportunityReport,
    applicationReport,
    pickupReport,

    charts: {
      opportunities: {
        type:   'pie',
        title:  'Opportunities You Applied To, by Status',
        labels: ['Open', 'Closed', 'In Progress'],
        data:   [opportunityReport.open, opportunityReport.closed, opportunityReport.inProgress],
      },
      applications: {
        type:   'pie',
        title:  'Your Applications by Status',
        labels: ['Pending', 'Accepted', 'Rejected'],
        data:   [applicationReport.pending, applicationReport.accepted, applicationReport.rejected],
      },
      pickups: {
        type:   'pie',
        title:  'Pickups You Created, by Status',
        labels: ['Pending', 'Assigned', 'Completed', 'Cancelled', 'Missed'],
        data:   [
          pickupReport.pending,
          pickupReport.assigned,
          pickupReport.completed,
          pickupReport.cancelled,
          pickupReport.missed,
        ],
      },
    },
  };
};

/**
 * Role-aware dispatcher for summary reports, mirroring
 * getUserDashboardMetrics / getUpcomingEventsForUser's dispatch pattern.
 *
 * @param {string} userId
 * @param {string} role  — 'volunteer' | 'ngo' | 'admin'
 * @returns {Promise<object>}
 */
const getSummaryReportsForUser = async (userId, role) => {
  if (role === 'admin') return getSummaryReports();
  if (role === 'ngo')   return getSummaryReportsForNgo(userId);
  return getSummaryReportsForVolunteer(userId);
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
                  $cond: {
                    if:   { $lte: ['$grandTotal', 0] },
                    then: 0,
                    else: {
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
        },
      },
    ]),

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

    WasteStats.aggregate([
      { $match: { user_id: { $ne: null } } },
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
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
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

/**
 * Real-time operational snapshot
 */
const getRealTimeSnapshot = async () => {
  const [pickupsFacet] = await Pickup.aggregate([
    {
      $facet: {
        pending: [{ $match: { status: 'Pending' } }, { $count: 'n' }],
        assigned: [{ $match: { status: 'Assigned' } }, { $count: 'n' }],
        completed: [{ $match: { status: 'Completed' } }, { $count: 'n' }],
      },
    },
  ]);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todayWaste] = await WasteStats.aggregate([
    { $match: { date: { $gte: todayStart } } },
    { $group: { _id: null, weight: { $sum: '$weightKg' }, co2: { $sum: '$co2SavedKg' } } },
  ]);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const newUsersThisMonth = await User.countDocuments({ createdAt: { $gte: monthStart } });

  return {
    pickups: {
      pending: pickupsFacet?.pending?.[0]?.n || 0,
      assigned: pickupsFacet?.assigned?.[0]?.n || 0,
      completedThisMonth: pickupsFacet?.completed?.[0]?.n || 0,
    },
    today: {
      wasteCollectedKg: todayWaste?.weight || 0,
      co2SavedKg: todayWaste?.co2 || 0,
    },
    newUsersThisMonth: newUsersThisMonth || 0,
  };
};

module.exports = {
  getAdminDashboardStats,
  getUserDashboardMetrics,
  getVolunteerDashboardMetrics,
  getNgoDashboardMetrics,
  getUpcomingEventsForUser,
  getNgoUpcomingEvents,
  getVolunteerUpcomingEvents,
  getLeaderboardForUser,
  getLeaderboardForRole,
  getRecyclingBreakdown,
  getMonthlyTrends,
  getWeeklyTrends,
  getDailyTrends,
  getYearlyTrends,
  getSummaryReports,
  getSummaryReportsForNgo,
  getSummaryReportsForVolunteer,
  getSummaryReportsForUser,
  getWasteStatsAnalytics,
  getRealTimeSnapshot,
  growthPercent,
};