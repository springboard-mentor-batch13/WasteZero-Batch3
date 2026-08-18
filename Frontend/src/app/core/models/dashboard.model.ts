// ============================================
// DASHBOARD MODELS — WasteZero Milestone 4
// Source of truth: backend API responses
//
// GET /api/v1/admin/dashboard/stats
// GET /api/v1/admin/dashboard/summary-reports
// GET /api/v1/stats/monthly-trends
// GET /api/v1/stats/recycling-breakdown
// GET /api/v1/dashboard/upcoming
// ============================================

// ── Admin KPI Stats ─────────────────────────────────────────────────────────
export interface AdminKpiUsers {
  total:         number;
  active:        number;
  volunteers:    number;
  ngos:          number;
  admins:        number;
  newThisMonth:  number;
  growthPercent: number;
}

export interface AdminKpiPickups {
  total:           number;
  completed:       number;
  pending:         number;
  assigned:        number;
  missed:          number;
  completedGrowth: number;
  pendingGrowth:   number;
}

export interface AdminKpiOpportunities {
  total:        number;
  active:       number;
  totalGrowth:  number;
  activeGrowth: number;
}

export interface AdminKpiApplications {
  total:         number;
  pending:       number;
  accepted:      number;
  rejected:      number;
  newThisMonth:  number;
  growthPercent: number;
}

export interface AdminKpiWaste {
  totalWeightKg: number;
  totalCO2Kg:    number;
  recordCount:   number;
}

export interface AdminDashboardStats {
  timestamp:     string;
  users:         AdminKpiUsers;
  pickups:       AdminKpiPickups;
  opportunities: AdminKpiOpportunities;
  applications:  AdminKpiApplications;
  waste:         AdminKpiWaste;
}

export interface AdminDashboardStatsResponse {
  success: boolean;
  data:    AdminDashboardStats;
}

// ── Summary Reports ─────────────────────────────────────────────────────────
// Actual response from GET /api/v1/admin/dashboard/summary-reports:
// {
//   userReport:        { totalUsers, activeUsers, inactiveUsers, volunteers, ngos },
//   opportunityReport: { totalOpportunities, open, closed, inProgress },
//   applicationReport: { totalApplications, pending, accepted, rejected },
//   pickupReport:      { totalPickups, pending, assigned, completed, cancelled, missed },
//   charts: {
//     users:         { type, title, labels: ['Active','Inactive'], data: [n,n] },
//     opportunities: { type, title, labels: ['Open','Closed','In Progress'], data: [n,n,n] },
//     applications:  { type, title, labels: ['Pending','Accepted','Rejected'], data: [n,n,n] },
//     pickups:       { type, title,
//                      labels: ['Pending','Assigned','Completed','Cancelled','Missed'],
//                      data:   [n, n, n, n, n] }
//   }
// }

export interface SummaryChartBlock {
  type:   string;
  title:  string;
  labels: string[];
  data:   number[];
}

export interface SummaryReportsData {
  userReport: {
    totalUsers:    number;
    activeUsers:   number;
    inactiveUsers: number;
    volunteers:    number;
    ngos:          number;
  };
  opportunityReport: {
    totalOpportunities: number;
    open:               number;
    closed:             number;
    inProgress:         number;
  };
  applicationReport: {
    totalApplications: number;
    pending:           number;
    accepted:          number;
    rejected:          number;
  };
  pickupReport: {
    totalPickups: number;
    pending:      number;
    assigned:     number;
    completed:    number;
    cancelled:    number;
    missed:       number;
  };
  charts: {
    users:         SummaryChartBlock;
    opportunities: SummaryChartBlock;
    applications:  SummaryChartBlock;
    pickups:       SummaryChartBlock;  // ← data.charts.pickups — 5 statuses
  };
}

export interface SummaryReportsResponse {
  success: boolean;
  data:    SummaryReportsData;
}

// ── Monthly Trends ──────────────────────────────────────────────────────────
// Actual response from GET /api/v1/stats/monthly-trends:
// data: { months, scoped, role, labels[], pickup.datasets[], waste.datasets[], co2.data[] }
// NOTE: NOT data.trends[] — that field does not exist.

export interface TrendDataset {
  label: string;
  data:  number[];
}

export interface MonthlyTrendsResponse {
  success: boolean;
  data: {
    months:  number;
    scoped:  boolean;
    role:    string;
    labels:  string[];
    pickup:  { datasets: TrendDataset[] };
    waste:   { datasets: TrendDataset[] };
    co2:     { label: string; data: number[] };
    opportunities?: { datasets: TrendDataset[] };
    applications?:  { datasets: TrendDataset[] };
    users?:         { datasets: TrendDataset[] };
  };
}

// ── Recycling Breakdown ─────────────────────────────────────────────────────
// From GET /api/v1/stats/recycling-breakdown?month=YYYY-MM
// Categories: Plastic | Paper | Glass | E-Waste | Organic | Metal

export interface RecyclingCategory {
  category:   string;
  weightKg:   number;
  co2SavedKg: number;
  records:    number;
  percentage: number;
}

export interface RecyclingBreakdownResponse {
  success: boolean;
  data: {
    month:            string;
    totalWeightKg:    number;
    totalCO2Kg:       number;
    growthPercentage: number;
    categories:       RecyclingCategory[];
  };
}

// ── Upcoming Events ─────────────────────────────────────────────────────────
export interface UpcomingEvent {
  id:        string;
  eventName: string;
  date:      string;
  time: {
    start?:        string;
    end?:          string;
    startDisplay?: string;
    endDisplay?:   string;
  } | null;
  address: string;
  status:  string;
}

export interface UpcomingEventsResponse {
  success: boolean;
  data: {
    opportunities: UpcomingEvent[];
    pickups:       UpcomingEvent[];
  };
}

// ─────────────────────────────────────────────────────────────────────────
// PERSONAL METRICS  — GET /api/v1/dashboard/metrics
// Volunteer and NGO each get a role-specific payload from the backend.
// ─────────────────────────────────────────────────────────────────────────

/** Returned when req.user.role === 'volunteer' */
export interface VolunteerMetrics {
  role: 'volunteer';

  // Pickups
  totalPickups:         number;
  completedPickups:     number;
  totalPickupsGrowth:   number | null;

  // Applications
  totalApplications:    number;
  acceptedApplications: number;
  applicationsGrowth:   number | null;

  // Volunteer hours (derived from accepted opportunity durations)
  volunteerHours:       number;
  volunteerHoursGrowth: number | null;

  // Environmental impact
  co2SavedKg:           number;
  co2SavedGrowth:       number | null;
  recycledWeightKg:     number;
  recycledItemsCount:   number;
  recycledItemsGrowth:  number | null;
}

/** Returned when req.user.role === 'ngo' */
export interface NgoMetrics {
  role: 'ngo';

  // Opportunities
  totalOpportunities:   number;
  activeOpportunities:  number;
  opportunitiesGrowth:  number | null;

  // Applications received
  totalApplications:    number;
  pendingApplications:  number;
  acceptedApplications: number;
  applicationsGrowth:   number | null;

  // Pickups assigned to this NGO (agent_id = NGO)
  completedPickups:     number;
  totalAssignedPickups: number;
  pickupsGrowth:        number | null;

  // Environmental impact
  recycledWeightKg:     number;
  recycledItemsCount:   number;
  co2SavedKg:           number;
  recycledItemsGrowth:  number | null;
}

export type UserMetrics = VolunteerMetrics | NgoMetrics;

export interface UserMetricsResponse {
  success: boolean;
  status:  string;
  data:    UserMetrics;
}

// ─────────────────────────────────────────────────────────────────────────────
// WASTE ANALYTICS  — GET /api/v1/stats/waste-analytics  (admin-only)
// ─────────────────────────────────────────────────────────────────────────────
export interface WasteTopContributor {
  userId:    string;
  name:      string;
  username:  string;
  role:      string;
  weightKg:  number;
  records:   number;
}

export interface WasteAnalyticsResponse {
  success: boolean;
  data: {
    totalWeightKg:    number;
    totalCO2Kg:       number;
    recordCount:      number;
    categories:       RecyclingCategory[];
    topContributors:  WasteTopContributor[];
    trends?:          { month: string; weightKg: number; co2SavedKg: number }[];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL-TIME STATS  — GET /api/v1/stats/realtime  (admin-only, ~30-60s poll)
// ─────────────────────────────────────────────────────────────────────────────
export interface RealtimeStatsResponse {
  success: boolean;
  data: {
    timestamp:           string;
    pendingPickups:      number;
    assignedPickups:     number;
    openOpportunities:   number;
    pendingApplications: number;
    [key: string]: unknown;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// YEARLY TRENDS  — GET /api/v1/stats/yearly-trends?years=5  (admin-only)
// ─────────────────────────────────────────────────────────────────────────────
export interface YearlyTrendsResponse {
  success: boolean;
  data: {
    years:         number;
    labels:        string[];
    pickup?:       { datasets: TrendDataset[] };
    waste?:        { datasets: TrendDataset[] };
    co2?:          { label: string; data: number[] };
    opportunities?:{ datasets: TrendDataset[] };
    applications?: { datasets: TrendDataset[] };
    users?:        { datasets: TrendDataset[] };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEADERBOARD  — GET /api/v1/stats/leaderboard?limit=10  (all authenticated)
// Volunteer → ranked volunteers; NGO → ranked NGOs; Admin → dual rankings
// ─────────────────────────────────────────────────────────────────────────────
export interface LeaderboardUser {
  _id:   string;
  name:  string;
  email: string;
  role:  string;
}

export interface LeaderboardContributor {
  rank:          number;
  user:          LeaderboardUser | null;
  totalCO2Kg:    number;
  totalWeightKg: number;
  pickupCount:   number;
}

export interface RoleLeaderboard {
  role:            'volunteer' | 'ngo';
  topContributors: LeaderboardContributor[];
  me:              LeaderboardContributor | null;
  totalRanked:     number;
}

export interface AdminLeaderboardData {
  volunteers: RoleLeaderboard;
  ngos:       RoleLeaderboard;
}

export interface LeaderboardEntry {
  rank:           number;
  userId?:        string;
  name?:          string;
  username?:      string;
  user?:          LeaderboardUser | null;
  weightKg?:      number;
  totalWeightKg?: number;
  co2SavedKg?:    number;
  totalCO2Kg?:    number;
  records?:       number;
  pickupCount?:   number;
  score?:         number;
}

export interface LeaderboardResponse {
  success: boolean;
  status?: string;
  data: {
    role?:            string;
    topContributors?: LeaderboardContributor[];
    me?:              LeaderboardContributor | null;
    totalRanked?:     number;
    volunteers?:      RoleLeaderboard;
    ngos?:            RoleLeaderboard;
    ranked?:          LeaderboardEntry[];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY TRENDS  — GET /api/v1/stats/weekly-trends?weeks=12  (all authenticated)
// ─────────────────────────────────────────────────────────────────────────────
export interface WeeklyTrendsResponse {
  success: boolean;
  data: {
    weeks:       number;
    scoped:      boolean;
    customRange: boolean;
    role:        string;
    labels:      string[];
    pickup?:     { datasets: TrendDataset[] };
    waste?:      { datasets: TrendDataset[] };
    co2?:        { label: string; data: number[] };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DAILY TRENDS  — GET /api/v1/stats/daily-trends?days=30  (all authenticated)
// ─────────────────────────────────────────────────────────────────────────────
export interface DailyTrendsResponse {
  success: boolean;
  data: {
    days:        number;
    scoped:      boolean;
    customRange: boolean;
    role:        string;
    labels:      string[];
    pickup?:     { datasets: TrendDataset[] };
    waste?:      { datasets: TrendDataset[] };
    co2?:        { label: string; data: number[] };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CO₂ FACTORS  — GET /api/v1/stats/co2-factors  (all authenticated)
// ─────────────────────────────────────────────────────────────────────────────
export interface CO2Factor {
  category: string;
  factor:   number;
}

export interface CO2FactorsResponse {
  success: boolean;
  data: {
    unit:    string;
    source:  string;
    factors: CO2Factor[];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MY SUMMARY REPORTS  — GET /api/v1/dashboard/summary-reports  (all authenticated)
// Scoped to caller's role. Admin falls through to platform-wide.
// ─────────────────────────────────────────────────────────────────────────────
export interface MySummaryReportsResponse {
  success: boolean;
  data:    SummaryReportsData;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN REPORT BROWSE  — GET /api/v1/admin/reports/browse/:type
// JSON preview before download.
// ─────────────────────────────────────────────────────────────────────────────
export interface ReportColumn { header: string; key: string; }

export interface ReportBrowseResponse {
  success: boolean;
  data: {
    records:    Record<string, unknown>[];
    total:      number;
    page:       number;
    limit:      number;
    totalPages: number;
    columns:    ReportColumn[];
  };
}
