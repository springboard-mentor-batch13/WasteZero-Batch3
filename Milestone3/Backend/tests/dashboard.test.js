// Backend/tests/dashboard.test.js
//
// Comprehensive Automated Test Suite for Dashboard & Analytics Module
// Covers:
//   - Admin KPI Stats (total counts, month-over-month growth, empty state handling)
//   - Volunteer Personal Dashboard Metrics (pickups, applications, hours, CO2, waste)
//   - NGO Personal Dashboard Metrics (opportunities, applications received, completed pickups)
//   - Upcoming Events (opportunities and pickups separated, scoped to role)
//   - Public Leaderboards (volunteers vs volunteers, NGOs vs NGOs, own rank inclusion, empty state)
//   - Recycling Breakdown by Category for specific month
//   - Monthly, Weekly, Daily, Yearly Trends (platform-wide vs scoped)
//   - Platform-wide WasteStats Analytics (categories, top contributors, monthly trends)
//   - Real-time Snapshot
//   - CO2 emission factors reference

'use strict';

const mongoose = require('mongoose');
const User = require('../models/users.model');
const Pickup = require('../models/pickup.model');
const Opportunity = require('../models/opportunity.model');
const Application = require('../models/application.model');
const WasteStats = require('../models/wasteStats.model');

const analyticsService = require('../services/analytics.service');
const dashboardController = require('../controllers/dashboard.controller');
const { getAllFactors, calculateCO2Saved } = require('../utils/co2Calculator');

// ── Mock helpers ─────────────────────────────────────────────────────────────

const makeId = () => new mongoose.Types.ObjectId().toString();

const mockReq = (overrides = {}) => ({
  headers: {},
  user: { id: makeId(), role: 'admin' },
  params: {},
  body: {},
  query: {},
  ...overrides,
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Dashboard & Analytics Module — Unit and Integration Tests', () => {
  afterEach(() => jest.restoreAllMocks());

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Growth Calculation Utility
  // ───────────────────────────────────────────────────────────────────────────
  describe('growthPercent helper', () => {
    test('calculates correct positive and negative month-over-month growth percentages', () => {
      expect(analyticsService.growthPercent(150, 100)).toBe(50);
      expect(analyticsService.growthPercent(80, 100)).toBe(-20);
      expect(analyticsService.growthPercent(100, 100)).toBe(0);
    });

    test('handles divide-by-zero safely when previous count is 0', () => {
      expect(analyticsService.growthPercent(10, 0)).toBe(100);
      expect(analyticsService.growthPercent(0, 0)).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Admin Dashboard Stats
  // ───────────────────────────────────────────────────────────────────────────
  describe('analyticsService.getAdminDashboardStats', () => {
    test('aggregates KPI statistics with correct structure and growth calculations', async () => {
      jest.spyOn(User, 'aggregate').mockResolvedValue([
        {
          totalUsers: [{ count: 100 }],
          activeUsers: [{ count: 95 }],
          volunteerCount: [{ count: 70 }],
          ngoCount: [{ count: 25 }],
          adminCount: [{ count: 5 }],
          newThisMonth: [{ count: 20 }],
          newLastMonth: [{ count: 10 }],
        },
      ]);

      jest.spyOn(Pickup, 'aggregate').mockResolvedValue([
        {
          totalPickups: [{ count: 50 }],
          completedPickups: [{ count: 35 }],
          pendingPickups: [{ count: 10 }],
          assignedPickups: [{ count: 5 }],
          missedPickups: [{ count: 0 }],
          completedThisMonth: [{ count: 15 }],
          completedLastMonth: [{ count: 10 }],
          pendingThisMonth: [{ count: 5 }],
          pendingLastMonth: [{ count: 5 }],
        },
      ]);

      jest.spyOn(Opportunity, 'aggregate').mockResolvedValue([
        {
          totalOpportunities: [{ count: 30 }],
          activeOpportunities: [{ count: 20 }],
          totalThisMonth: [{ count: 8 }],
          totalLastMonth: [{ count: 4 }],
          activeThisMonth: [{ count: 5 }],
          activeLastMonth: [{ count: 3 }],
        },
      ]);

      jest.spyOn(Application, 'aggregate').mockResolvedValue([
        {
          totalApplications: [{ count: 60 }],
          pendingApplications: [{ count: 15 }],
          acceptedApplications: [{ count: 40 }],
          rejectedApplications: [{ count: 5 }],
          newThisMonth: [{ count: 12 }],
          newLastMonth: [{ count: 6 }],
        },
      ]);

      jest.spyOn(WasteStats, 'aggregate').mockResolvedValue([
        { totalWeightKg: 500, totalCO2Kg: 750, recordCount: 40 },
      ]);

      const stats = await analyticsService.getAdminDashboardStats();

      expect(stats.users.total).toBe(100);
      expect(stats.users.active).toBe(95);
      expect(stats.users.volunteers).toBe(70);
      expect(stats.users.ngos).toBe(25);
      expect(stats.users.growthPercent).toBe(100); // 20 vs 10 = +100%

      expect(stats.pickups.total).toBe(50);
      expect(stats.pickups.completed).toBe(35);
      expect(stats.pickups.completedGrowth).toBe(50); // 15 vs 10 = +50%

      expect(stats.opportunities.total).toBe(30);
      expect(stats.opportunities.active).toBe(20);
      expect(stats.opportunities.totalGrowth).toBe(100); // 8 vs 4 = +100%

      // A1 fix: applications KPI block present with growth calculation
      expect(stats.applications.total).toBe(60);
      expect(stats.applications.pending).toBe(15);
      expect(stats.applications.accepted).toBe(40);
      expect(stats.applications.rejected).toBe(5);
      expect(stats.applications.growthPercent).toBe(100); // 12 vs 6 = +100%

      expect(stats.waste.totalWeightKg).toBe(500);
      expect(stats.waste.totalCO2Kg).toBe(750);
      expect(stats.waste.recordCount).toBe(40);
    });

    test('runs all five collection aggregations in parallel, not sequentially (30–60s polling budget)', async () => {
      // Each mock resolves after a short, equal delay. If the facets were
      // awaited one at a time (sequentially) instead of via Promise.all,
      // total wall-clock time would be roughly 5x a single delay.
      const DELAY_MS = 40;
      const delayed = (value) => new Promise((resolve) => setTimeout(() => resolve(value), DELAY_MS));

      jest.spyOn(User, 'aggregate').mockImplementation(() => delayed([
        { totalUsers: [{ count: 1 }], activeUsers: [], volunteerCount: [], ngoCount: [], adminCount: [], newThisMonth: [], newLastMonth: [] },
      ]));
      jest.spyOn(Pickup, 'aggregate').mockImplementation(() => delayed([
        { totalPickups: [], completedPickups: [], pendingPickups: [], assignedPickups: [], missedPickups: [], completedThisMonth: [], completedLastMonth: [], pendingThisMonth: [], pendingLastMonth: [] },
      ]));
      jest.spyOn(Opportunity, 'aggregate').mockImplementation(() => delayed([
        { totalOpportunities: [], activeOpportunities: [], totalThisMonth: [], totalLastMonth: [], activeThisMonth: [], activeLastMonth: [] },
      ]));
      jest.spyOn(Application, 'aggregate').mockImplementation(() => delayed([
        { totalApplications: [], pendingApplications: [], acceptedApplications: [], rejectedApplications: [], newThisMonth: [], newLastMonth: [] },
      ]));
      jest.spyOn(WasteStats, 'aggregate').mockImplementation(() => delayed([]));

      const start = Date.now();
      await analyticsService.getAdminDashboardStats();
      const elapsed = Date.now() - start;

      // Parallel: ~1x DELAY_MS. Sequential would be ~5x. Use 3x as a safe
      // upper bound so this doesn't flake under CI scheduling jitter.
      expect(elapsed).toBeLessThan(DELAY_MS * 3);
    });

    test('handles completely empty database gracefully without NaN or errors', async () => {
      jest.spyOn(User, 'aggregate').mockResolvedValue([
        {
          totalUsers: [],
          activeUsers: [],
          volunteerCount: [],
          ngoCount: [],
          adminCount: [],
          newThisMonth: [],
          newLastMonth: [],
        },
      ]);

      jest.spyOn(Pickup, 'aggregate').mockResolvedValue([
        {
          totalPickups: [],
          completedPickups: [],
          pendingPickups: [],
          assignedPickups: [],
          missedPickups: [],
          completedThisMonth: [],
          completedLastMonth: [],
          pendingThisMonth: [],
          pendingLastMonth: [],
        },
      ]);

      jest.spyOn(Opportunity, 'aggregate').mockResolvedValue([
        {
          totalOpportunities: [],
          activeOpportunities: [],
          totalThisMonth: [],
          totalLastMonth: [],
          activeThisMonth: [],
          activeLastMonth: [],
        },
      ]);

      jest.spyOn(Application, 'aggregate').mockResolvedValue([
        {
          totalApplications: [],
          pendingApplications: [],
          acceptedApplications: [],
          rejectedApplications: [],
          newThisMonth: [],
          newLastMonth: [],
        },
      ]);

      jest.spyOn(WasteStats, 'aggregate').mockResolvedValue([]);

      const stats = await analyticsService.getAdminDashboardStats();

      expect(stats.users.total).toBe(0);
      expect(stats.users.growthPercent).toBe(0);
      expect(stats.pickups.total).toBe(0);
      expect(stats.opportunities.total).toBe(0);
      expect(stats.applications.total).toBe(0);
      expect(stats.applications.growthPercent).toBe(0);
      expect(stats.waste.totalWeightKg).toBe(0);
      expect(stats.waste.totalCO2Kg).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. User Dashboard Metrics (Volunteer & NGO)
  // ───────────────────────────────────────────────────────────────────────────
  describe('analyticsService.getUserDashboardMetrics', () => {
    test('returns volunteer metrics with pickups, applications, volunteer hours, and waste', async () => {
      const volunteerId = makeId();

      jest.spyOn(Pickup, 'aggregate').mockResolvedValue([
        {
          totalPickups: [{ count: 8 }],
          completedPickups: [{ count: 6 }],
          thisMonthPickups: [{ count: 3 }],
          lastMonthPickups: [{ count: 2 }],
        },
      ]);

      jest.spyOn(Application, 'aggregate')
        .mockResolvedValueOnce([
          {
            totalApplications: [{ count: 5 }],
            acceptedApplications: [{ count: 3 }],
            thisMonthApplications: [{ count: 2 }],
            lastMonthApplications: [{ count: 1 }],
          },
        ])
        .mockResolvedValueOnce([
          {
            total:     [{ totalHours: 12.5 }],
            thisMonth: [{ totalHours: 5 }],
            lastMonth: [{ totalHours: 4 }],
          },
        ]);

      jest.spyOn(WasteStats, 'aggregate').mockResolvedValue([
        {
          totals: [{ totalWeightKg: 45.5, totalCO2Kg: 68.2, itemCount: 6 }],
          thisMonth: [{ weightKg: 15, co2Kg: 22.5 }],
          lastMonth: [{ weightKg: 10, co2Kg: 15 }],
        },
      ]);

      const metrics = await analyticsService.getUserDashboardMetrics(volunteerId, 'volunteer');

      expect(metrics.role).toBe('volunteer');
      expect(metrics.totalPickups).toBe(8);
      expect(metrics.completedPickups).toBe(6);
      expect(metrics.totalApplications).toBe(5);
      expect(metrics.acceptedApplications).toBe(3);
      expect(metrics.volunteerHours).toBe(12.5);
      // 5 vs 4 hours = +25%, based on Opportunity.date buckets — no longer a pickups proxy
      expect(metrics.volunteerHoursGrowth).toBe(25);
      expect(metrics.recycledWeightKg).toBe(45.5);
      expect(metrics.co2SavedKg).toBe(68.2);
    });

    test('volunteerHoursGrowth handles a volunteer with no accepted-application hours yet', async () => {
      const volunteerId = makeId();

      jest.spyOn(Pickup, 'aggregate').mockResolvedValue([
        {
          totalPickups: [], completedPickups: [],
          thisMonthPickups: [], lastMonthPickups: [],
        },
      ]);

      jest.spyOn(Application, 'aggregate')
        .mockResolvedValueOnce([
          {
            totalApplications: [], acceptedApplications: [],
            thisMonthApplications: [], lastMonthApplications: [],
          },
        ])
        .mockResolvedValueOnce([
          { total: [], thisMonth: [], lastMonth: [] },
        ]);

      jest.spyOn(WasteStats, 'aggregate').mockResolvedValue([
        { totals: [], thisMonth: [], lastMonth: [] },
      ]);

      const metrics = await analyticsService.getUserDashboardMetrics(volunteerId, 'volunteer');

      expect(metrics.volunteerHours).toBe(0);
      expect(metrics.volunteerHoursGrowth).toBe(0);
    });

    test('returns NGO metrics with opportunities, applications received, completed pickups', async () => {
      const ngoId = makeId();

      jest.spyOn(Opportunity, 'aggregate').mockResolvedValue([
        {
          totalOpportunities: [{ count: 12 }],
          activeOpportunities: [{ count: 8 }],
          thisMonthOpportunities: [{ count: 4 }],
          lastMonthOpportunities: [{ count: 2 }],
        },
      ]);

      jest.spyOn(Opportunity, 'find').mockReturnValue({
        distinct: jest.fn().mockResolvedValue([makeId(), makeId()]),
      });

      jest.spyOn(Application, 'aggregate').mockResolvedValue([
        {
          totalApplications: [{ count: 25 }],
          pendingApplications: [{ count: 5 }],
          acceptedApplications: [{ count: 15 }],
          thisMonthApplications: [{ count: 10 }],
          lastMonthApplications: [{ count: 5 }],
        },
      ]);

      jest.spyOn(Pickup, 'aggregate').mockResolvedValue([
        {
          totalAssigned: [{ count: 20 }],
          completedPickups: [{ count: 18 }],
          thisMonthCompleted: [{ count: 6 }],
          lastMonthCompleted: [{ count: 4 }],
        },
      ]);

      jest.spyOn(WasteStats, 'aggregate').mockResolvedValue([
        {
          totals: [{ totalWeightKg: 300, totalCO2Kg: 450, itemCount: 18 }],
          thisMonth: [{ weightKg: 80, co2Kg: 120 }],
          lastMonth: [{ weightKg: 60, co2Kg: 90 }],
        },
      ]);

      const metrics = await analyticsService.getUserDashboardMetrics(ngoId, 'ngo');

      expect(metrics.role).toBe('ngo');
      expect(metrics.totalOpportunities).toBe(12);
      expect(metrics.activeOpportunities).toBe(8);
      expect(metrics.totalApplications).toBe(25);
      expect(metrics.acceptedApplications).toBe(15);
      expect(metrics.completedPickups).toBe(18);
      expect(metrics.recycledWeightKg).toBe(300);
      expect(metrics.co2SavedKg).toBe(450);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Upcoming Events
  // ───────────────────────────────────────────────────────────────────────────
  describe('analyticsService.getUpcomingEventsForUser', () => {
    test('returns upcoming opportunities and pickups for volunteer', async () => {
      const volunteerId = makeId();
      const opp = { _id: makeId(), title: 'Beach Cleanup', date: new Date('2026-09-01'), location: 'Juhu', status: 'open' };
      const pickup = {
        _id: makeId(),
        scheduledDate: new Date('2026-09-02'),
        wasteTypes: ['Plastic'],
        preferredTimeSlot: { start: '10:00', end: '12:00' },
        address: { city: 'Mumbai', area: 'Bandra' },
        status: 'Pending',
      };

      jest.spyOn(Application, 'find').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ opportunity_id: opp }]),
        }),
      });

      jest.spyOn(Pickup, 'find').mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([pickup]),
      });

      const result = await analyticsService.getUpcomingEventsForUser(volunteerId, 'volunteer', 10);
      expect(result.opportunities).toHaveLength(1);
      expect(result.opportunities[0].eventName).toBe('Beach Cleanup');
      expect(result.pickups).toHaveLength(1);
      expect(result.pickups[0].eventName).toBe('Plastic Pickup');
      expect(result.pickups[0].time.startDisplay).toBe('10:00 AM');
    });

    test('B6 fix: includes opportunities the volunteer has applied for (pending), not just accepted', async () => {
      const volunteerId = makeId();
      const opp = { _id: makeId(), title: 'Food Distribution Camp', date: new Date('2026-09-15'), location: 'Bengaluru', status: 'open' };

      // Application.find is called with status: { $in: ['pending', 'accepted'] } —
      // simulate a still-pending application whose opportunity satisfies the populate match.
      const findSpy = jest.spyOn(Application, 'find').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ opportunity_id: opp }]),
        }),
      });

      jest.spyOn(Pickup, 'find').mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      const result = await analyticsService.getUpcomingEventsForUser(volunteerId, 'volunteer', 10);

      expect(findSpy).toHaveBeenCalledWith({
        volunteer_id: expect.anything(),
        status: { $in: ['pending', 'accepted'] },
      });
      expect(result.opportunities).toHaveLength(1);
      expect(result.opportunities[0].eventName).toBe('Food Distribution Camp');
      expect(result.opportunities[0].status).toBe('open');
    });

    test('B6 fix: admin sees ALL opportunities and ALL pickups platform-wide, not scoped to own id', async () => {
      const adminId = makeId();
      const opp = { _id: makeId(), title: 'Food Distribution Camp', date: new Date('2026-09-15'), location: 'Bengaluru', status: 'open' };
      const pickup = {
        _id: makeId(),
        scheduledDate: new Date('2026-09-16'),
        wasteTypes: ['Organic'],
        preferredTimeSlot: { start: '09:00', end: '11:00' },
        address: { city: 'Bengaluru', area: 'Indiranagar' },
        status: 'Pending',
      };

      const oppFindSpy = jest.spyOn(Opportunity, 'find').mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([opp]),
      });

      const pickupFindSpy = jest.spyOn(Pickup, 'find').mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([pickup]),
      });

      const result = await analyticsService.getUpcomingEventsForUser(adminId, 'admin', 10);

      // No ngo_id/user_id/agent_id scoping on either query — platform-wide.
      const oppFilter = oppFindSpy.mock.calls[0][0];
      const pickupFilter = pickupFindSpy.mock.calls[0][0];
      expect(oppFilter).not.toHaveProperty('ngo_id');
      expect(pickupFilter).not.toHaveProperty('user_id');
      expect(pickupFilter).not.toHaveProperty('agent_id');

      expect(result.opportunities).toHaveLength(1);
      expect(result.opportunities[0].eventName).toBe('Food Distribution Camp');
      expect(result.pickups).toHaveLength(1);
      expect(result.pickups[0].eventName).toBe('Organic Pickup');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Public Leaderboard
  // ───────────────────────────────────────────────────────────────────────────
  describe('analyticsService.getLeaderboardForUser', () => {
    test('ranks users by CO2 saved and includes requesting user rank (me)', async () => {
      const myId = makeId();
      const otherId = makeId();

      const rankedData = [
        { _id: otherId, totalCO2: 120, totalWeight: 80, pickupCount: 5 },
        { _id: myId, totalCO2: 75, totalWeight: 50, pickupCount: 3 },
      ];

      jest.spyOn(WasteStats, 'aggregate').mockResolvedValue(rankedData);
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { _id: otherId, name: 'Alice', email: 'alice@example.com', role: 'volunteer' },
          { _id: myId, name: 'Me', email: 'me@example.com', role: 'volunteer' },
        ]),
      });

      const leaderboard = await analyticsService.getLeaderboardForUser(myId, 'volunteer', 10);

      expect(leaderboard.role).toBe('volunteer');
      expect(leaderboard.totalRanked).toBe(2);
      expect(leaderboard.topContributors).toHaveLength(2);
      expect(leaderboard.topContributors[0].rank).toBe(1);
      expect(leaderboard.topContributors[0].totalCO2Kg).toBe(120);

      expect(leaderboard.me).not.toBeNull();
      expect(leaderboard.me.rank).toBe(2);
      expect(leaderboard.me.totalCO2Kg).toBe(75);
    });

    test('handles requesting user with no WasteStats records safely (me: null)', async () => {
      const myId = makeId();
      jest.spyOn(WasteStats, 'aggregate').mockResolvedValue([]);
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      const leaderboard = await analyticsService.getLeaderboardForUser(myId, 'volunteer', 10);
      expect(leaderboard.topContributors).toEqual([]);
      expect(leaderboard.me).toBeNull();
      expect(leaderboard.totalRanked).toBe(0);
    });

    test('B17 fix: admin gets BOTH volunteer and NGO leaderboards, each with me: null', async () => {
      const adminId = makeId();
      const volunteerContributorId = makeId();
      const ngoContributorId = makeId();

      // WasteStats.aggregate is called twice — once for the volunteer
      // population (grouped by user_id), once for NGO (grouped by ngo_id).
      jest.spyOn(WasteStats, 'aggregate')
        .mockResolvedValueOnce([
          { _id: volunteerContributorId, totalCO2: 90, totalWeight: 60, pickupCount: 4 },
        ])
        .mockResolvedValueOnce([
          { _id: ngoContributorId, totalCO2: 200, totalWeight: 150, pickupCount: 10 },
        ]);

      jest.spyOn(User, 'find')
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([
            { _id: volunteerContributorId, name: 'Vera Volunteer', email: 'vera@example.com', role: 'volunteer' },
          ]),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([
            { _id: ngoContributorId, name: 'Green NGO', email: 'green@example.com', role: 'ngo' },
          ]),
        });

      const result = await analyticsService.getLeaderboardForUser(adminId, 'admin', 10);

      expect(result.volunteers.role).toBe('volunteer');
      expect(result.volunteers.topContributors).toHaveLength(1);
      expect(result.volunteers.topContributors[0].totalCO2Kg).toBe(90);
      expect(result.volunteers.me).toBeNull(); // admin has no volunteer-type activity

      expect(result.ngos.role).toBe('ngo');
      expect(result.ngos.topContributors).toHaveLength(1);
      expect(result.ngos.topContributors[0].totalCO2Kg).toBe(200);
      expect(result.ngos.me).toBeNull(); // admin has no NGO-type activity
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Recycling Breakdown
  // ───────────────────────────────────────────────────────────────────────────
  describe('analyticsService.getRecyclingBreakdown', () => {
    test('returns category breakdown with weight, CO2, percentage, and growth', async () => {
      const mockBreakdown = [
        {
          grandTotalWeight: 100,
          grandTotalCO2: 150,
          categories: [
            { category: 'Plastic', weightKg: 60, co2SavedKg: 90, records: 5, percentage: 60 },
            { category: 'Paper', weightKg: 40, co2SavedKg: 60, records: 3, percentage: 40 },
          ],
        },
      ];

      jest.spyOn(WasteStats, 'aggregate')
        .mockResolvedValueOnce(mockBreakdown)
        .mockResolvedValueOnce([{ totalWeight: 80 }]); // prev month

      const result = await analyticsService.getRecyclingBreakdown('2026-08');

      expect(result.month).toBe('2026-08');
      expect(result.totalWeightKg).toBe(100);
      expect(result.totalCO2Kg).toBe(150);
      expect(result.growthPercentage).toBe(25); // 100 vs 80 = +25%
      expect(result.categories.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Trend Data (Monthly, Weekly, Daily, Yearly)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Trend Aggregations', () => {
    test('getMonthlyTrends formats datasets for pickups, waste, CO2, opportunities, applications', async () => {
      jest.spyOn(Pickup, 'aggregate').mockResolvedValue([]);
      jest.spyOn(WasteStats, 'aggregate').mockResolvedValue([]);
      jest.spyOn(Opportunity, 'aggregate').mockResolvedValue([]);
      jest.spyOn(Application, 'aggregate').mockResolvedValue([]);
      jest.spyOn(User, 'aggregate').mockResolvedValue([]);

      const trends = await analyticsService.getMonthlyTrends(6, null, 'admin');

      expect(trends.labels).toHaveLength(6);
      // 4 statuses: Pending, Assigned, Completed, Cancelled — Missed is
      // intentionally excluded (trend clusters track actionable outcomes,
      // not the sweep's timeout state).
      expect(trends.pickup.datasets).toHaveLength(4);
      expect(trends.opportunities.datasets).toHaveLength(3);
      expect(trends.applications.datasets).toHaveLength(3);
      expect(trends.co2).toHaveProperty('data');
    });

    test('getWeeklyTrends formats datasets with ISO weeks', async () => {
      jest.spyOn(Pickup, 'aggregate').mockResolvedValue([]);
      jest.spyOn(WasteStats, 'aggregate').mockResolvedValue([]);
      jest.spyOn(Opportunity, 'aggregate').mockResolvedValue([]);
      jest.spyOn(Application, 'aggregate').mockResolvedValue([]);
      jest.spyOn(User, 'aggregate').mockResolvedValue([]);

      const trends = await analyticsService.getWeeklyTrends(4, null, 'admin');
      expect(trends.labels).toHaveLength(4);
      expect(trends.pickup.datasets).toBeDefined();
      expect(trends.applications.datasets).toBeDefined();
    });

    test('getDailyTrends formats datasets for N days', async () => {
      jest.spyOn(Pickup, 'aggregate').mockResolvedValue([]);
      jest.spyOn(WasteStats, 'aggregate').mockResolvedValue([]);
      jest.spyOn(Opportunity, 'aggregate').mockResolvedValue([]);
      jest.spyOn(Application, 'aggregate').mockResolvedValue([]);
      jest.spyOn(User, 'aggregate').mockResolvedValue([]);

      const trends = await analyticsService.getDailyTrends(7, null, 'admin');
      expect(trends.labels).toHaveLength(7);
    });

    test('getYearlyTrends formats multi-year datasets', async () => {
      jest.spyOn(Pickup, 'aggregate').mockResolvedValue([]);
      jest.spyOn(WasteStats, 'aggregate').mockResolvedValue([]);
      jest.spyOn(User, 'aggregate').mockResolvedValue([]);
      jest.spyOn(Opportunity, 'aggregate').mockResolvedValue([]);
      jest.spyOn(Application, 'aggregate').mockResolvedValue([]);

      const trends = await analyticsService.getYearlyTrends(3);
      expect(trends.labels).toHaveLength(3);
      expect(trends.pickup.datasets).toBeDefined();
      expect(trends.waste.datasets).toBeDefined();
      expect(trends.users.datasets).toBeDefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. WasteStats Analytics & Real-Time Snapshot
  // ───────────────────────────────────────────────────────────────────────────
  describe('WasteStats Analytics & Real-Time Snapshot', () => {
    test('getWasteStatsAnalytics returns platform breakdown, monthly trends, and top contributors', async () => {
      jest.spyOn(WasteStats, 'aggregate')
        .mockResolvedValueOnce([{ grandTotal: 250, categories: [{ category: 'Plastic', weightKg: 250, co2SavedKg: 375, records: 10, percentage: 100 }] }])
        .mockResolvedValueOnce([{ _id: { year: 2026, month: 8 }, totalWeight: 100, totalCO2: 150 }])
        .mockResolvedValueOnce([{ user: { name: 'Bob' }, totalCO2: 200, totalWeight: 150, pickupCount: 4 }]);

      const analytics = await analyticsService.getWasteStatsAnalytics();

      expect(analytics.totals.totalWeightKg).toBe(250);
      expect(analytics.totals.totalCO2Kg).toBe(375);
      expect(analytics.monthlyTrends).toHaveLength(1);
      expect(analytics.topContributors).toHaveLength(1);
    });

    test('getRealTimeSnapshot returns current counts and today waste stats', async () => {
      jest.spyOn(Pickup, 'aggregate').mockResolvedValue([
        {
          pending: [{ n: 3 }],
          assigned: [{ n: 2 }],
          completed: [{ n: 5 }],
        },
      ]);
      jest.spyOn(WasteStats, 'aggregate').mockResolvedValue([
        { weight: 25.5, co2: 38.25 },
      ]);
      jest.spyOn(User, 'countDocuments').mockResolvedValue(4);

      const snapshot = await analyticsService.getRealTimeSnapshot();

      expect(snapshot.pickups.pending).toBe(3);
      expect(snapshot.pickups.assigned).toBe(2);
      expect(snapshot.pickups.completedThisMonth).toBe(5);
      expect(snapshot.today.wasteCollectedKg).toBe(25.5);
      expect(snapshot.newUsersThisMonth).toBe(4);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. CO2 Factors Reference
  // ───────────────────────────────────────────────────────────────────────────
  describe('CO2 Calculator & Factors', () => {
    test('getAllFactors returns positive factors for all waste categories', () => {
      const factors = getAllFactors();
      expect(factors.Plastic).toBeGreaterThan(0);
      expect(factors.Paper).toBeGreaterThan(0);
      expect(factors.Glass).toBeGreaterThan(0);
      expect(factors.Organic).toBeGreaterThan(0);
      expect(factors['E-Waste']).toBeGreaterThan(0);
    });

    test('calculateCO2Saved returns correct factor * weight value', () => {
      const factors = getAllFactors();
      const calculated = calculateCO2Saved('Plastic', 10);
      expect(calculated).toBe(Math.round(10 * factors.Plastic * 100) / 100);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. Bug Fix Validations: Division-by-Zero & Aggregation Resilience
  // ───────────────────────────────────────────────────────────────────────────
  describe('Bug Fix Validations: Division-by-Zero & Aggregation Resilience', () => {
    test('getRecyclingBreakdown handles 0 total weight cleanly without error', async () => {
      jest.spyOn(WasteStats, 'aggregate')
        .mockResolvedValueOnce([
          {
            grandTotalWeight: 0,
            grandTotalCO2: 0,
            categories: [
              { category: 'Plastic', weightKg: 0, co2SavedKg: 0, records: 0, percentage: 0 },
            ],
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await analyticsService.getRecyclingBreakdown('2026-08');
      expect(result.totalWeightKg).toBe(0);
      expect(result.totalCO2Kg).toBe(0);
      expect(result.categories[0].percentage).toBe(0);
    });

    test('getWasteStatsAnalytics handles 0 grand total cleanly without error', async () => {
      jest.spyOn(WasteStats, 'aggregate')
        .mockResolvedValueOnce([{ grandTotal: 0, categories: [{ category: 'Plastic', weightKg: 0, co2SavedKg: 0, records: 0, percentage: 0 }] }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const analytics = await analyticsService.getWasteStatsAnalytics();
      expect(analytics.totals.totalWeightKg).toBe(0);
      expect(analytics.categoryBreakdown[0].percentage).toBe(0);
    });

    test('getLeaderboardForUser for volunteer applies { user_id: { $ne: null } } match filter', async () => {
      const aggregateSpy = jest.spyOn(WasteStats, 'aggregate').mockResolvedValue([]);
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      await analyticsService.getLeaderboardForUser(makeId(), 'volunteer', 10);
      expect(aggregateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ $match: { user_id: { $ne: null } } }),
        ])
      );
    });
  });
});
