import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminDashboardStatsResponse,
  MonthlyTrendsResponse,
  SummaryReportsResponse,
  RecyclingBreakdownResponse,
  UpcomingEventsResponse,
  WasteAnalyticsResponse,
  RealtimeStatsResponse,
  YearlyTrendsResponse,
  LeaderboardResponse,
  WeeklyTrendsResponse,
  DailyTrendsResponse,
  CO2FactorsResponse,
  MySummaryReportsResponse,
} from '../models/dashboard.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http        = inject(HttpClient);
  private authService = inject(AuthService);
  private readonly baseUrl = `${environment.apiUrl}/v1`;

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.authService.getToken()}` });
  }

  /** GET /api/v1/admin/dashboard/stats — admin-only (adminLimiter: 5/min) */
  getAdminStats(): Observable<AdminDashboardStatsResponse> {
    return this.http.get<AdminDashboardStatsResponse>(
      `${this.baseUrl}/admin/dashboard/stats`,
      { headers: this.headers() }
    );
  }

  /**
   * GET /api/v1/admin/dashboard/summary-reports — admin-only (adminLimiter)
   * Returns: { userReport, opportunityReport, applicationReport, pickupReport, charts:{...} }
   * charts.pickups.labels = ['Pending','Assigned','Completed','Cancelled','Missed']
   * charts.pickups.data   = [n, n, n, n, n]
   */
  getAdminSummaryReports(): Observable<SummaryReportsResponse> {
    return this.http.get<SummaryReportsResponse>(
      `${this.baseUrl}/admin/dashboard/summary-reports`,
      { headers: this.headers() }
    );
  }

  /**
   * GET /api/v1/stats/monthly-trends?months=12
   * Returns: { labels[], pickup:{datasets[]}, waste:{datasets[]}, co2:{data[]} }
   * NOT a trends[] array.
   */
  getMonthlyTrends(months = 12): Observable<MonthlyTrendsResponse> {
    const params = new HttpParams().set('months', months.toString());
    return this.http.get<MonthlyTrendsResponse>(
      `${this.baseUrl}/stats/monthly-trends`,
      { headers: this.headers(), params }
    );
  }

  /** GET /api/v1/stats/recycling-breakdown?month=YYYY-MM */
  getRecyclingBreakdown(month?: string): Observable<RecyclingBreakdownResponse> {
    const m = month ?? new Date().toISOString().slice(0, 7);
    const params = new HttpParams().set('month', m);
    return this.http.get<RecyclingBreakdownResponse>(
      `${this.baseUrl}/stats/recycling-breakdown`,
      { headers: this.headers(), params }
    );
  }

  /** GET /api/v1/dashboard/upcoming?limit=N */
  getUpcomingEvents(limit = 8): Observable<UpcomingEventsResponse> {
    const params = new HttpParams().set('limit', limit.toString());
    return this.http.get<UpcomingEventsResponse>(
      `${this.baseUrl}/dashboard/upcoming`,
      { headers: this.headers(), params }
    );
  }

  /** GET /api/v1/dashboard/metrics — Volunteer | NGO only (admin → 403) */
  getUserMetrics(): Observable<import('../models/dashboard.model').UserMetricsResponse> {
    return this.http.get<import('../models/dashboard.model').UserMetricsResponse>(
      `${this.baseUrl}/dashboard/metrics`,
      { headers: this.headers() }
    );
  }

  // ── New M4 endpoints ────────────────────────────────────────────────────────

  /**
   * GET /api/v1/stats/waste-analytics — admin-only (adminLimiter: 5/min)
   * Full platform waste breakdown by category + top contributors.
   */
  getWasteAnalytics(): Observable<WasteAnalyticsResponse> {
    return this.http.get<WasteAnalyticsResponse>(
      `${this.baseUrl}/stats/waste-analytics`,
      { headers: this.headers() }
    );
  }

  /**
   * GET /api/v1/stats/realtime — admin-only
   * Lightweight live snapshot. Designed for 30–60s polling.
   * adminLimiter: 5 req/min — caller must throttle.
   */
  getRealtimeStats(): Observable<RealtimeStatsResponse> {
    return this.http.get<RealtimeStatsResponse>(
      `${this.baseUrl}/stats/realtime`,
      { headers: this.headers() }
    );
  }

  /**
   * GET /api/v1/stats/yearly-trends?years=5 — admin-only
   * years: 1–10 (backend clamps silently).
   */
  getYearlyTrends(years = 5): Observable<YearlyTrendsResponse> {
    const params = new HttpParams().set('years', years.toString());
    return this.http.get<YearlyTrendsResponse>(
      `${this.baseUrl}/stats/yearly-trends`,
      { headers: this.headers(), params }
    );
  }

  /**
   * GET /api/v1/stats/leaderboard?limit=10 — all authenticated
   * Volunteer → volunteer ranking; NGO → NGO ranking; admin → volunteer view.
   * data.me = caller's own rank (null if no activity).
   */
  getLeaderboard(limit = 10): Observable<LeaderboardResponse> {
    const params = new HttpParams().set('limit', limit.toString());
    return this.http.get<LeaderboardResponse>(
      `${this.baseUrl}/stats/leaderboard`,
      { headers: this.headers(), params }
    );
  }

  /**
   * GET /api/v1/stats/weekly-trends?weeks=12&scoped=true — all authenticated
   * weeks: 1–52. scoped=false for platform-wide (admin always platform-wide).
   */
  getWeeklyTrends(weeks = 12, scoped = true): Observable<WeeklyTrendsResponse> {
    const params = new HttpParams()
      .set('weeks', weeks.toString())
      .set('scoped', scoped.toString());
    return this.http.get<WeeklyTrendsResponse>(
      `${this.baseUrl}/stats/weekly-trends`,
      { headers: this.headers(), params }
    );
  }

  /**
   * GET /api/v1/stats/daily-trends?days=30&scoped=true — all authenticated
   * days: 1–90. scoped=false for platform-wide.
   */
  getDailyTrends(days = 30, scoped = true): Observable<DailyTrendsResponse> {
    const params = new HttpParams()
      .set('days', days.toString())
      .set('scoped', scoped.toString());
    return this.http.get<DailyTrendsResponse>(
      `${this.baseUrl}/stats/daily-trends`,
      { headers: this.headers(), params }
    );
  }

  /**
   * GET /api/v1/stats/co2-factors — all authenticated
   * CO₂ emission factor reference table (static reference, cache-friendly).
   */
  getCO2Factors(): Observable<CO2FactorsResponse> {
    return this.http.get<CO2FactorsResponse>(
      `${this.baseUrl}/stats/co2-factors`,
      { headers: this.headers() }
    );
  }

  /**
   * GET /api/v1/dashboard/summary-reports — all authenticated
   * Role-scoped:
   *   Volunteer → opportunities applied, applications submitted, pickups created
   *   NGO       → opportunities created, applications received, assigned pickups
   *   Admin     → platform-wide (identical to /admin/dashboard/summary-reports)
   */
  getMySummaryReports(): Observable<MySummaryReportsResponse> {
    return this.http.get<MySummaryReportsResponse>(
      `${this.baseUrl}/dashboard/summary-reports`,
      { headers: this.headers() }
    );
  }
}
