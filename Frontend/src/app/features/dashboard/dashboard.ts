// ============================================
// DASHBOARD — WasteZero
// Route: /dashboard  (authGuard — all roles)
//
// Provides role-based KPI metrics, real-data trend charts,
// and status distribution visualisations for Admin, NGO, and Volunteer.
// ============================================

import {
  Component, inject, OnInit, OnDestroy, HostListener,
  signal, computed, ElementRef, ViewChild, PLATFORM_ID
} from '@angular/core';
import { isPlatformBrowser, CommonModule, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subject, forkJoin, takeUntil } from 'rxjs';

import { AuthService }      from '../../core/services/auth.service';
import { MatchService, MatchSuggestion } from '../../core/services/match.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { MessageService }   from '../../core/services/message.service';
import { Conversation }     from '../../core/models/message.model';
import { format12HourTime, formatDateTime12, formatTimeSlot } from '../../core/utils/date-time.util';

import {
  AdminDashboardStats,
  TrendDataset,
  SummaryChartBlock,
  SummaryReportsData,
  RecyclingCategory,
  UpcomingEvent,
  VolunteerMetrics,
  NgoMetrics,
  UserMetrics,
  LeaderboardEntry,
  LeaderboardResponse,
  LeaderboardContributor,
} from '../../core/models/dashboard.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, DecimalPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit, OnDestroy {

  private router           = inject(Router);
  private authService      = inject(AuthService);
  private matchService     = inject(MatchService);
  private dashboardService = inject(DashboardService);
  private messageService   = inject(MessageService);
  private platformId       = inject(PLATFORM_ID);
  private destroy$         = new Subject<void>();

  userName = '';
  userRole = '';

  // ── Volunteer matches ──────────────────────────────────────────────────
  matches        = signal<MatchSuggestion[]>([]);
  loadingMatches = signal(false);
  matchError     = signal('');
  missingFields  = signal<string[]>([]);

  // ── Volunteer / NGO personal metrics ───────────────────────────────────
  userMetrics        = signal<UserMetrics | null>(null);
  loadingUserMetrics = signal(false);
  userMetricsError   = signal('');

  // ── Admin KPI ─────────────────────────────────────────────────────────
  adminStats        = signal<AdminDashboardStats | null>(null);
  loadingAdminStats = signal(false);
  adminStatsError   = signal('');

  // ── Shared / Role-scoped Trends Signals (from monthly-trends) ──────────
  trendsLabels              = signal<string[]>([]);
  trendsPickupDatasets      = signal<TrendDataset[]>([]);
  trendsOpportunityDatasets = signal<TrendDataset[]>([]);
  trendsApplicationDatasets = signal<TrendDataset[]>([]);
  trendsCO2Data             = signal<number[]>([]);
  loadingTrends             = signal(false);
  trendsError               = signal('');

  // ── Shared / Role-scoped Summary Reports ───────────────────────────────
  summaryReports = signal<SummaryReportsData | null>(null);
  loadingSummary = signal(false);
  summaryError   = signal('');

  // Computed summary chart blocks
  pickupStatusChart = computed<SummaryChartBlock | null>(() => this.summaryReports()?.charts?.pickups ?? null);
  applicationStatusChart = computed<SummaryChartBlock | null>(() => this.summaryReports()?.charts?.applications ?? null);
  opportunityStatusChart = computed<SummaryChartBlock | null>(() => this.summaryReports()?.charts?.opportunities ?? null);

  // ── Recycling breakdown (Admin) ────────────────────────────────────────
  recyclingCategories    = signal<RecyclingCategory[]>([]);
  recyclingTotalKg       = signal(0);
  recyclingTotalCO2      = signal(0);
  recyclingGrowthPercent = signal(0);
  recyclingMonth         = signal('');
  loadingRecycling       = signal(false);

  // ── Upcoming pickups & drives ──────────────────────────────────────────
  upcomingPickups = signal<UpcomingEvent[]>([]);
  loadingUpcoming = signal(false);

  // ── Leaderboard (volunteer + NGO) ─────────────────────────────────────
  leaderboard        = signal<LeaderboardEntry[]>([]);
  leaderboardMe      = signal<LeaderboardEntry | null>(null);
  loadingLeaderboard = signal(false);
  leaderboardError   = signal('');

  // ── Admin Leaderboard (dual volunteer & NGO rankings) ─────────────────
  adminVolunteerLeaderboard  = signal<LeaderboardContributor[]>([]);
  adminVolunteerRankedTotal  = signal<number>(0);
  adminNgoLeaderboard        = signal<LeaderboardContributor[]>([]);
  adminNgoRankedTotal        = signal<number>(0);
  loadingAdminLeaderboard    = signal(false);
  adminLeaderboardError      = signal('');
  adminLeaderboardRoleFilter = signal<'all' | 'volunteer' | 'ngo'>('all');

  // ── Admin Communications / Messages Widget ───────────────────────────
  adminConversations         = signal<Conversation[]>([]);
  loadingAdminMessages       = signal<boolean>(false);
  adminMessageRoleFilter     = signal<'all' | 'volunteer' | 'ngo'>('all');

  filteredAdminConversations = computed(() => {
    const list = this.adminConversations();
    const filter = this.adminMessageRoleFilter();
    if (filter === 'all') return list;
    return list.filter(c => {
      const otherRole = (c.otherUser?.role || '').toLowerCase();
      return otherRole === filter;
    });
  });

  // ── Canvas refs ────────────────────────────────────────────────────────
  // Admin canvas refs
  @ViewChild('trendsCanvas') trendsCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('pickupCanvas') pickupCanvas?: ElementRef<HTMLCanvasElement>;

  // NGO canvas refs
  @ViewChild('ngoTrendsCanvas') ngoTrendsCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('ngoAppDonutCanvas') ngoAppDonutCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('ngoOppDonutCanvas') ngoOppDonutCanvas?: ElementRef<HTMLCanvasElement>;

  // Volunteer canvas refs
  @ViewChild('volTrendsCanvas') volTrendsCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('volAppDonutCanvas') volAppDonutCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('volPickupDonutCanvas') volPickupDonutCanvas?: ElementRef<HTMLCanvasElement>;

  // Interactive chart state & cleanup
  private chartHoverStates = new Map<HTMLCanvasElement, { hoveredIndex: number | null; mouseX: number; mouseY: number }>();
  private chartCleanupFns: (() => void)[] = [];

  constructor() {
    const user = this.authService.getCurrentUser();
    if (user) {
      this.userName = user.name;
      this.userRole = user.role;
    }
  }

  ngOnInit(): void {
    if (this.userRole === 'volunteer') {
      this.loadVolunteerData();
    } else if (this.userRole === 'ngo') {
      this.loadNgoData();
    } else if (this.userRole === 'admin') {
      this.loadAdminData();
      this.loadAdminConversations();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.chartCleanupFns.forEach(fn => fn());
    this.chartCleanupFns = [];
    this.chartHoverStates.clear();
  }

  @HostListener('window:resize')
  onResize(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.drawAllCharts();
    }
  }

  // ── Role Orchestrators ─────────────────────────────────────────────────

  loadVolunteerData(): void {
    this.loadMatches();
    this.loadUserMetrics();
    this.loadVolunteerUpcoming();
    this.loadLeaderboard();
    this.loadVolunteerChartsAndAnalytics();
  }

  loadNgoData(): void {
    this.loadUserMetrics();
    this.loadVolunteerUpcoming();
    this.loadLeaderboard();
    this.loadNgoChartsAndAnalytics();
  }

  // ── Volunteer / NGO Charts & Analytics Loaders ─────────────────────────

  loadVolunteerChartsAndAnalytics(): void {
    this.loadingTrends.set(true);
    this.loadingSummary.set(true);
    this.trendsError.set('');
    this.summaryError.set('');

    forkJoin({
      trends:  this.dashboardService.getMonthlyTrends(12),
      summary: this.dashboardService.getMySummaryReports(),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ trends, summary }) => {
          const td = trends.data;
          this.trendsLabels.set(td?.labels ?? []);
          this.trendsPickupDatasets.set(td?.pickup?.datasets ?? []);
          this.trendsApplicationDatasets.set(td?.applications?.datasets ?? []);
          this.trendsOpportunityDatasets.set(td?.opportunities?.datasets ?? []);
          this.trendsCO2Data.set(td?.co2?.data ?? []);
          this.loadingTrends.set(false);

          this.summaryReports.set(summary.data ?? null);
          this.loadingSummary.set(false);

          if (isPlatformBrowser(this.platformId)) {
            setTimeout(() => {
              this.drawVolTrendsChart();
              this.drawVolAppDonut();
              this.drawVolPickupDonut();
            }, 0);
          }
        },
        error: (err: { status: number; error?: { message?: string } }) => {
          const msg = err.status === 429
            ? 'Rate limit reached. Please wait a minute and retry.'
            : (err.error?.message || 'Failed to load chart analytics.');
          this.trendsError.set(msg);
          this.summaryError.set(msg);
          this.loadingTrends.set(false);
          this.loadingSummary.set(false);
        }
      });
  }

  loadNgoChartsAndAnalytics(): void {
    this.loadingTrends.set(true);
    this.loadingSummary.set(true);
    this.trendsError.set('');
    this.summaryError.set('');

    forkJoin({
      trends:  this.dashboardService.getMonthlyTrends(12),
      summary: this.dashboardService.getMySummaryReports(),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ trends, summary }) => {
          const td = trends.data;
          this.trendsLabels.set(td?.labels ?? []);
          this.trendsPickupDatasets.set(td?.pickup?.datasets ?? []);
          this.trendsOpportunityDatasets.set(td?.opportunities?.datasets ?? []);
          this.trendsApplicationDatasets.set(td?.applications?.datasets ?? []);
          this.trendsCO2Data.set(td?.co2?.data ?? []);
          this.loadingTrends.set(false);

          this.summaryReports.set(summary.data ?? null);
          this.loadingSummary.set(false);

          if (isPlatformBrowser(this.platformId)) {
            setTimeout(() => {
              this.drawNgoTrendsChart();
              this.drawNgoAppDonut();
              this.drawNgoOppDonut();
            }, 0);
          }
        },
        error: (err: { status: number; error?: { message?: string } }) => {
          const msg = err.status === 429
            ? 'Rate limit reached. Please wait a minute and retry.'
            : (err.error?.message || 'Failed to load chart analytics.');
          this.trendsError.set(msg);
          this.summaryError.set(msg);
          this.loadingTrends.set(false);
          this.loadingSummary.set(false);
        }
      });
  }

  // ── Personal metrics (volunteer + NGO) ─────────────────────────────────

  loadUserMetrics(): void {
    this.loadingUserMetrics.set(true);
    this.userMetricsError.set('');
    this.dashboardService.getUserMetrics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: import('../../core/models/dashboard.model').UserMetricsResponse) => {
          this.userMetrics.set(res.data);
          this.loadingUserMetrics.set(false);
        },
        error: (err: { status: number; error?: { message?: string } }) => {
          const msg = err.status === 429
            ? 'Rate limit reached. Please wait a minute.'
            : (err.error?.message || 'Failed to load your metrics.');
          this.userMetricsError.set(msg);
          this.loadingUserMetrics.set(false);
        }
      });
  }

  /** GET /api/v1/dashboard/upcoming — role-scoped by backend */
  loadVolunteerUpcoming(): void {
    this.loadingUpcoming.set(true);
    this.dashboardService.getUpcomingEvents(6)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const pickups = res.data?.pickups ?? [];
          const opps    = (res.data as any)?.opportunities ?? [];
          this.upcomingPickups.set([...pickups, ...opps].slice(0, 6));
          this.loadingUpcoming.set(false);
        },
        error: () => this.loadingUpcoming.set(false)
      });
  }

  /** GET /api/v1/stats/leaderboard — ranked list + caller's own rank */
  loadLeaderboard(): void {
    this.loadingLeaderboard.set(true);
    this.leaderboardError.set('');
    this.dashboardService.getLeaderboard(10)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: LeaderboardResponse) => {
          const rawEntries: any[] = res.data?.topContributors ?? res.data?.ranked ?? [];
          const mapped: LeaderboardEntry[] = rawEntries.map((r: any) => ({
            rank:          r.rank,
            userId:        r.user?._id || r.userId || '',
            name:          r.user?.name || r.name || '',
            username:      r.user?.email || r.username || '',
            user:          r.user || null,
            totalWeightKg: r.totalWeightKg ?? r.weightKg ?? 0,
            totalCO2Kg:    r.totalCO2Kg ?? r.co2SavedKg ?? 0,
            weightKg:      r.totalWeightKg ?? r.weightKg ?? 0,
            co2SavedKg:    r.totalCO2Kg ?? r.co2SavedKg ?? 0,
            pickupCount:   r.pickupCount ?? r.records ?? 0,
            records:       r.pickupCount ?? r.records ?? 0
          }));
          this.leaderboard.set(mapped);

          if (res.data?.me) {
            const meRaw: any = res.data.me;
            this.leaderboardMe.set({
              rank:          meRaw.rank,
              userId:        meRaw.user?._id || meRaw.userId || '',
              name:          meRaw.user?.name || meRaw.name || 'You',
              username:      meRaw.user?.email || meRaw.username || '',
              user:          meRaw.user || null,
              totalWeightKg: meRaw.totalWeightKg ?? meRaw.weightKg ?? 0,
              totalCO2Kg:    meRaw.totalCO2Kg ?? meRaw.co2SavedKg ?? 0,
              weightKg:      meRaw.totalWeightKg ?? meRaw.weightKg ?? 0,
              co2SavedKg:    meRaw.totalCO2Kg ?? meRaw.co2SavedKg ?? 0,
              pickupCount:   meRaw.pickupCount ?? meRaw.records ?? 0,
              records:       meRaw.pickupCount ?? meRaw.records ?? 0
            });
          } else {
            this.leaderboardMe.set(null);
          }
          this.loadingLeaderboard.set(false);
        },
        error: (err: { status: number; error?: { message?: string } }) => {
          const msg = err.status === 429
            ? 'Rate limit reached. Please try again shortly.'
            : (err.error?.message || 'Could not load leaderboard.');
          this.leaderboardError.set(msg);
          this.loadingLeaderboard.set(false);
        }
      });
  }

  // ── Admin data loading ────────────────────────────────────────────────

  loadAdminData(): void {
    this.loadAdminStats();
    this.loadChartsAndWidgets();
    this.loadAdminLeaderboard();
  }

  /** GET /api/v1/stats/leaderboard?limit=10 — returns dual rankings for admin */
  loadAdminLeaderboard(): void {
    this.loadingAdminLeaderboard.set(true);
    this.adminLeaderboardError.set('');
    this.dashboardService.getLeaderboard(10)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: LeaderboardResponse) => {
          const data: any = res.data;
          if (data?.volunteers) {
            this.adminVolunteerLeaderboard.set(data.volunteers.topContributors ?? []);
            this.adminVolunteerRankedTotal.set(data.volunteers.totalRanked ?? data.volunteers.topContributors?.length ?? 0);
          } else if (data?.topContributors && data?.role === 'volunteer') {
            this.adminVolunteerLeaderboard.set(data.topContributors);
            this.adminVolunteerRankedTotal.set(data.totalRanked ?? data.topContributors.length);
          }

          if (data?.ngos) {
            this.adminNgoLeaderboard.set(data.ngos.topContributors ?? []);
            this.adminNgoRankedTotal.set(data.ngos.totalRanked ?? data.ngos.topContributors?.length ?? 0);
          } else if (data?.topContributors && data?.role === 'ngo') {
            this.adminNgoLeaderboard.set(data.topContributors);
            this.adminNgoRankedTotal.set(data.totalRanked ?? data.topContributors.length);
          }

          this.loadingAdminLeaderboard.set(false);
        },
        error: (err: { status: number; error?: { message?: string } }) => {
          const msg = err.status === 429
            ? 'Rate limit reached. Please wait a minute and retry.'
            : (err.error?.message || 'Failed to load leaderboard data.');
          this.adminLeaderboardError.set(msg);
          this.loadingAdminLeaderboard.set(false);
        }
      });
  }

  loadAdminStats(): void {
    this.loadingAdminStats.set(true);
    this.adminStatsError.set('');
    this.dashboardService.getAdminStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.adminStats.set(res.data);
          this.loadingAdminStats.set(false);
        },
        error: (err) => {
          const msg = err.status === 429
            ? 'Rate limit reached. Please wait 1 minute, then click Retry.'
            : (err.error?.message || 'Failed to load platform stats.');
          this.adminStatsError.set(msg);
          this.loadingAdminStats.set(false);
        }
      });
  }

  loadChartsAndWidgets(): void {
    this.loadingTrends.set(true);
    this.loadingSummary.set(true);
    this.loadingRecycling.set(true);
    this.loadingUpcoming.set(true);

    forkJoin({
      trends:    this.dashboardService.getMonthlyTrends(12),
      summary:   this.dashboardService.getAdminSummaryReports(),
      recycling: this.dashboardService.getRecyclingBreakdown(),
      upcoming:  this.dashboardService.getUpcomingEvents(8),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ trends, summary, recycling, upcoming }) => {
          const td = trends.data;
          this.trendsLabels.set(td?.labels ?? []);
          this.trendsPickupDatasets.set(td?.pickup?.datasets ?? []);
          this.trendsCO2Data.set(td?.co2?.data ?? []);
          this.loadingTrends.set(false);

          this.summaryReports.set(summary.data ?? null);
          this.loadingSummary.set(false);

          const rd = recycling.data;
          this.recyclingCategories.set(rd?.categories ?? []);
          this.recyclingTotalKg.set(rd?.totalWeightKg ?? 0);
          this.recyclingTotalCO2.set(rd?.totalCO2Kg ?? 0);
          this.recyclingGrowthPercent.set(rd?.growthPercentage ?? 0);
          this.recyclingMonth.set(rd?.month ?? '');
          this.loadingRecycling.set(false);

          this.upcomingPickups.set(upcoming.data?.pickups ?? []);
          this.loadingUpcoming.set(false);

          if (isPlatformBrowser(this.platformId)) {
            setTimeout(() => {
              this.drawTrendsChart();
              this.drawPickupDonut();
            }, 0);
          }
        },
        error: () => {
          this.loadingTrends.set(false);
          this.loadingSummary.set(false);
          this.loadingRecycling.set(false);
          this.loadingUpcoming.set(false);
        }
      });
  }

  loadAdminConversations(): void {
    this.loadingAdminMessages.set(true);
    this.messageService.getConversations()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.adminConversations.set(res?.data || []);
          this.loadingAdminMessages.set(false);
        },
        error: () => {
          this.loadingAdminMessages.set(false);
        }
      });
  }

  loadMatches(): void {
    this.loadingMatches.set(true);
    this.matchError.set('');
    this.missingFields.set([]);
    this.matchService.getSuggestions(5).subscribe({
      next: (res) => {
        this.matches.set(res.data.matches);
        this.loadingMatches.set(false);
      },
      error: (err) => {
        this.loadingMatches.set(false);
        if (err.status === 400 && err.error?.missingFields) {
          this.missingFields.set(err.error.missingFields);
        } else {
          this.matchError.set(err.error?.message || 'Failed to load suggestions.');
        }
      }
    });
  }

  openConversation(conv: Conversation): void {
    const other = conv.otherUser;
    if (other?._id) {
      this.router.navigate(['/messages'], {
        queryParams: {
          contactId: other._id,
          contactName: other.name,
          contactRole: other.role
        }
      });
    } else {
      this.router.navigate(['/messages']);
    }
  }

  // ── Unified Chart Drawing Orchestrator ─────────────────────────────────

  drawAllCharts(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.userRole === 'admin') {
      this.drawTrendsChart();
      this.drawPickupDonut();
    } else if (this.userRole === 'ngo') {
      this.drawNgoTrendsChart();
      this.drawNgoAppDonut();
      this.drawNgoOppDonut();
    } else if (this.userRole === 'volunteer') {
      this.drawVolTrendsChart();
      this.drawVolAppDonut();
      this.drawVolPickupDonut();
    }
  }

  // ── Chart Rendering: Admin ─────────────────────────────────────────────

  drawTrendsChart(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const canvas = this.trendsCanvas?.nativeElement;
    if (!canvas) return;

    const labels   = this.trendsLabels();
    const datasets = this.trendsPickupDatasets();
    const co2      = this.trendsCO2Data();
    if (labels.length === 0) return;

    const completedDs = datasets.find(d => d.label === 'Completed');
    const pendingDs   = datasets.find(d => d.label === 'Pending');
    const n           = labels.length;
    const cCounts     = completedDs?.data ?? new Array(n).fill(0);
    const pCounts     = pendingDs?.data   ?? new Array(n).fill(0);

    this.drawClusteredTrendsChart(
      this.trendsCanvas,
      labels,
      [
        { name: 'Completed', color: 'rgba(34,197,94,0.85)', data: cCounts },
        { name: 'Pending',   color: 'rgba(99,102,241,0.85)', data: pCounts },
      ],
      { name: 'CO₂ Saved (kg)', color: '#f59e0b', data: co2 }
    );
  }

  drawPickupDonut(): void {
    const chart = this.pickupStatusChart();
    const palette = ['#6366f1', '#f59e0b', '#22c55e', '#ef4444', '#94a3b8'];
    this.drawGenericDonut(this.pickupCanvas, chart, palette, 'Pickups');
  }

  // ── Chart Rendering: NGO ───────────────────────────────────────────────

  drawNgoTrendsChart(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const labels = this.trendsLabels();
    if (labels.length === 0) return;

    // Applications received per month (sum of pending + accepted + rejected)
    const appDatasets = this.trendsApplicationDatasets();
    const oppDatasets = this.trendsOpportunityDatasets();
    const pickupDatasets = this.trendsPickupDatasets();
    const co2 = this.trendsCO2Data();

    const n = labels.length;
    const appTotals = labels.map((_, i) => appDatasets.reduce((sum, d) => sum + (d.data[i] ?? 0), 0));
    const oppTotals = labels.map((_, i) => oppDatasets.reduce((sum, d) => sum + (d.data[i] ?? 0), 0));
    const completedPickups = pickupDatasets.find(d => d.label === 'Completed')?.data ?? new Array(n).fill(0);

    this.drawClusteredTrendsChart(
      this.ngoTrendsCanvas,
      labels,
      [
        { name: 'Applications',  color: 'rgba(16,185,129,0.85)', data: appTotals },
        { name: 'Opportunities', color: 'rgba(99,102,241,0.85)',  data: oppTotals },
        { name: 'Pickups',       color: 'rgba(245,158,11,0.85)',  data: completedPickups },
      ],
      { name: 'CO₂ Saved (kg)', color: '#06b6d4', data: co2 }
    );
  }

  drawNgoAppDonut(): void {
    const chart = this.applicationStatusChart();
    // Pending / Accepted / Rejected
    const palette = ['#f59e0b', '#22c55e', '#ef4444'];
    this.drawGenericDonut(this.ngoAppDonutCanvas, chart, palette, 'Apps');
  }

  drawNgoOppDonut(): void {
    const chart = this.opportunityStatusChart();
    // Open / Closed / In Progress
    const palette = ['#22c55e', '#64748b', '#6366f1'];
    this.drawGenericDonut(this.ngoOppDonutCanvas, chart, palette, 'Drives');
  }

  // ── Chart Rendering: Volunteer ─────────────────────────────────────────

  drawVolTrendsChart(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const labels = this.trendsLabels();
    if (labels.length === 0) return;

    const pickupDatasets = this.trendsPickupDatasets();
    const appDatasets = this.trendsApplicationDatasets();
    const co2 = this.trendsCO2Data();

    const n = labels.length;
    const completedPickups = pickupDatasets.find(d => d.label === 'Completed')?.data ?? new Array(n).fill(0);
    const appTotals = labels.map((_, i) => appDatasets.reduce((sum, d) => sum + (d.data[i] ?? 0), 0));

    this.drawClusteredTrendsChart(
      this.volTrendsCanvas,
      labels,
      [
        { name: 'Completed Pickups', color: 'rgba(34,197,94,0.85)', data: completedPickups },
        { name: 'Applications',      color: 'rgba(99,102,241,0.85)', data: appTotals },
      ],
      { name: 'CO₂ Saved (kg)', color: '#f59e0b', data: co2 }
    );
  }

  drawVolAppDonut(): void {
    const chart = this.applicationStatusChart();
    // Pending / Accepted / Rejected
    const palette = ['#f59e0b', '#22c55e', '#ef4444'];
    this.drawGenericDonut(this.volAppDonutCanvas, chart, palette, 'Apps');
  }

  drawVolPickupDonut(): void {
    const chart = this.pickupStatusChart();
    // Pending / Assigned / Completed / Cancelled / Missed
    const palette = ['#6366f1', '#f59e0b', '#22c55e', '#ef4444', '#94a3b8'];
    this.drawGenericDonut(this.volPickupDonutCanvas, chart, palette, 'Pickups');
  }

  // ── Generic Chart Helpers ──────────────────────────────────────────────

  private redrawCanvas(canvas: HTMLCanvasElement): void {
    if (canvas === this.trendsCanvas?.nativeElement) {
      this.drawTrendsChart();
    } else if (canvas === this.ngoTrendsCanvas?.nativeElement) {
      this.drawNgoTrendsChart();
    } else if (canvas === this.volTrendsCanvas?.nativeElement) {
      this.drawVolTrendsChart();
    }
  }

  private drawClusteredTrendsChart(
    canvasRef: ElementRef<HTMLCanvasElement> | undefined,
    labels: string[],
    barSeries: { name: string; color: string; data: number[] }[],
    lineSeries?: { name: string; color: string; data: number[] } | null
  ): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const canvas = canvasRef?.nativeElement;
    if (!canvas || labels.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Attach mouse & touch listeners once per canvas element for interactive tooltips
    if (!(canvas as any).__trendListenersAttached) {
      (canvas as any).__trendListenersAttached = true;

      const handlePointerMove = (e: MouseEvent | TouchEvent) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e instanceof MouseEvent ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        const clientY = e instanceof MouseEvent ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;
        const curLabels = this.trendsLabels();
        if (curLabels.length === 0) return;

        const padLeft = 44;
        const padRight = 56;
        const cW = Math.max(canvas.offsetWidth - padLeft - padRight, 50);
        const slotW = cW / curLabels.length;
        const relX = mouseX - padLeft;
        const slotIdx = Math.floor(relX / slotW);

        if (slotIdx >= 0 && slotIdx < curLabels.length && mouseY >= 10 && mouseY <= canvas.offsetHeight - 15) {
          this.chartHoverStates.set(canvas, { hoveredIndex: slotIdx, mouseX, mouseY });
        } else {
          this.chartHoverStates.set(canvas, { hoveredIndex: null, mouseX: 0, mouseY: 0 });
        }
        this.redrawCanvas(canvas);
      };

      const handlePointerLeave = () => {
        this.chartHoverStates.set(canvas, { hoveredIndex: null, mouseX: 0, mouseY: 0 });
        this.redrawCanvas(canvas);
      };

      canvas.addEventListener('mousemove', handlePointerMove);
      canvas.addEventListener('mouseleave', handlePointerLeave);
      canvas.addEventListener('touchstart', handlePointerMove, { passive: true });
      canvas.addEventListener('touchmove', handlePointerMove, { passive: true });
      canvas.addEventListener('touchend', handlePointerLeave);

      this.chartCleanupFns.push(() => {
        canvas.removeEventListener('mousemove', handlePointerMove);
        canvas.removeEventListener('mouseleave', handlePointerLeave);
        canvas.removeEventListener('touchstart', handlePointerMove);
        canvas.removeEventListener('touchmove', handlePointerMove);
        canvas.removeEventListener('touchend', handlePointerLeave);
        delete (canvas as any).__trendListenersAttached;
      });
    }

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.offsetWidth || 680;
    const cssH = canvas.offsetHeight || 250;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.scale(dpr, dpr);

    const W = cssW, H = cssH;
    const pad = { top: 32, right: 56, bottom: 44, left: 44 };
    const cW = Math.max(W - pad.left - pad.right, 50);
    const cH = Math.max(H - pad.top - pad.bottom, 50);
    const dark = this.isDark();
    const textColor = dark ? '#94a3b8' : '#64748b';
    const gridColor = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

    ctx.clearRect(0, 0, W, H);

    // Calculate maximums for dual Y-axis scaling
    let maxBar = 0;
    barSeries.forEach(s => {
      s.data.forEach(v => { if (v > maxBar) maxBar = v; });
    });
    let yMax = 4;
    if (maxBar > 0) {
      if (maxBar <= 4) yMax = 4;
      else if (maxBar <= 8) yMax = 8;
      else if (maxBar <= 12) yMax = 12;
      else if (maxBar <= 20) yMax = 20;
      else yMax = Math.ceil((maxBar * 1.15) / 4) * 4;
    }

    const maxLine = lineSeries?.data ? Math.max(...lineSeries.data, 0) : 0;
    let yLineMax = 10;
    if (maxLine > 0) {
      if (maxLine <= 4) yLineMax = 4;
      else if (maxLine <= 10) yLineMax = 10;
      else if (maxLine <= 20) yLineMax = 20;
      else if (maxLine <= 50) yLineMax = 50;
      else if (maxLine <= 100) yLineMax = 100;
      else yLineMax = Math.ceil((maxLine * 1.15) / 10) * 10;
    }

    // Grid lines and Dual Y-axis labels
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + cH - (i / 4) * cH;

      // Horizontal grid lines
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + cW, y);
      ctx.stroke();

      // Left Y-axis (Activity counts)
      ctx.fillStyle = textColor;
      ctx.font = '10px system-ui,sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const leftVal = (i / 4) * yMax;
      ctx.fillText(String(Math.round(leftVal)), pad.left - 8, y);

      // Right Y-axis (CO₂ Saved in kg)
      if (lineSeries) {
        ctx.fillStyle = dark ? 'rgba(245,158,11,0.95)' : 'rgba(217,119,6,0.95)';
        ctx.textAlign = 'left';
        const rightVal = (i / 4) * yLineMax;
        const rightText = rightVal % 1 === 0 ? String(rightVal) : rightVal.toFixed(1);
        ctx.fillText(i === 4 ? `${rightText} kg` : rightText, pad.left + cW + 8, y);
      }
    }

    // Y-Axis titles
    ctx.font = '600 10px system-ui,sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Activity Count', pad.left, pad.top - 10);

    if (lineSeries) {
      ctx.fillStyle = lineSeries.color;
      ctx.textAlign = 'right';
      ctx.fillText('CO₂ Saved (kg)', pad.left + cW, pad.top - 10);
    }

    const n = labels.length;
    const slotW = cW / n;
    const numBars = barSeries.length;
    const totalBarGroupW = Math.min(slotW * 0.72, numBars * 20);
    const barW = Math.max(totalBarGroupW / numBars - 2, 3);
    const hoverState = this.chartHoverStates.get(canvas);

    // Slot Hover Background Highlight
    if (hoverState?.hoveredIndex !== null && hoverState?.hoveredIndex !== undefined) {
      const hIdx = hoverState.hoveredIndex;
      if (hIdx >= 0 && hIdx < n) {
        const hX = pad.left + hIdx * slotW;
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)';
        ctx.beginPath();
        (ctx as any).roundRect?.(hX + 1, pad.top, slotW - 2, cH, 4) ?? ctx.rect(hX + 1, pad.top, slotW - 2, cH);
        ctx.fill();
      }
    }

    // Draw Clustered Bars
    labels.forEach((_, i) => {
      const slotCenterX = pad.left + i * slotW + slotW / 2;
      const groupStartX = slotCenterX - (numBars * (barW + 2)) / 2;

      barSeries.forEach((series, sIdx) => {
        const val = series.data[i] ?? 0;
        if (val > 0) {
          const bH = (val / yMax) * cH;
          const x = groupStartX + sIdx * (barW + 2);
          const y = pad.top + cH - bH;

          ctx.fillStyle = series.color;
          ctx.beginPath();
          (ctx as any).roundRect?.(x, y, barW, bH, [3, 3, 0, 0]) ?? ctx.rect(x, y, barW, bH);
          ctx.fill();
        }
      });
    });

    // Draw Line Series (CO₂ Saved) with Soft Gradient Area
    if (lineSeries && lineSeries.data.length > 0) {
      const hasLineData = lineSeries.data.some(v => v > 0);
      const points = lineSeries.data.map((v, i) => {
        const x = pad.left + i * slotW + slotW / 2;
        const y = pad.top + cH - (v / yLineMax) * cH;
        return { x, y, v };
      });

      // Area fill underneath line
      if (hasLineData && points.length > 1) {
        const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
        grad.addColorStop(0, this.toRgba(lineSeries.color, 0.22));
        grad.addColorStop(1, this.toRgba(lineSeries.color, 0.01));

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(points[0].x, pad.top + cH);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, pad.top + cH);
        ctx.closePath();
        ctx.fill();
      }

      // Smooth line stroke
      ctx.strokeStyle = lineSeries.color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      points.forEach((p, i) => {
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();

      // Point markers
      const cardBg = dark ? '#1e293b' : '#ffffff';
      points.forEach((p, i) => {
        const isHovered = hoverState?.hoveredIndex === i;
        if (p.v > 0 || isHovered) {
          if (isHovered) {
            ctx.fillStyle = this.toRgba(lineSeries.color, 0.28);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 7, 0, 2 * Math.PI);
            ctx.fill();
          }

          ctx.fillStyle = cardBg;
          ctx.beginPath();
          ctx.arc(p.x, p.y, isHovered ? 5 : 4, 0, 2 * Math.PI);
          ctx.fill();

          ctx.fillStyle = lineSeries.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, isHovered ? 3.5 : 2.5, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
    }

    // Draw X-axis month labels (thinned on narrow viewports to avoid overlapping)
    ctx.fillStyle = textColor;
    ctx.font = '10px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const thinLabels = cssW < 480 && labels.length > 6;

    labels.forEach((lbl, i) => {
      if (thinLabels && i % 2 !== 0 && i !== labels.length - 1) return;
      const x = pad.left + i * slotW + slotW / 2;
      ctx.fillText(lbl, x, H - 30);
    });

    // Draw Floating Interactive Tooltip on Hover
    if (hoverState?.hoveredIndex !== null && hoverState?.hoveredIndex !== undefined) {
      const hIdx = hoverState.hoveredIndex;
      if (hIdx >= 0 && hIdx < labels.length) {
        const slotCenterX = pad.left + hIdx * slotW + slotW / 2;
        const monthLabel = labels[hIdx];
        const rows: { label: string; value: string; color: string }[] = [];

        barSeries.forEach(s => {
          const val = s.data[hIdx] ?? 0;
          rows.push({ label: s.name, value: String(val), color: s.color });
        });

        if (lineSeries) {
          const co2Val = lineSeries.data[hIdx] ?? 0;
          rows.push({
            label: 'CO₂ Saved',
            value: `${co2Val.toFixed(2)} kg`,
            color: lineSeries.color,
          });
        }

        const tPad = 10;
        const rowH = 18;
        const tW = 165;
        const tH = 26 + rows.length * rowH + 6;

        let tX = slotCenterX > W / 2 ? slotCenterX - tW - 12 : slotCenterX + 12;
        tX = Math.max(pad.left, Math.min(tX, W - pad.right - tW));
        const tY = Math.max(pad.top + 4, Math.min(hoverState.mouseY - tH / 2, pad.top + cH - tH - 4));

        ctx.save();
        ctx.shadowColor = dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.98)';
        ctx.strokeStyle = dark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        (ctx as any).roundRect?.(tX, tY, tW, tH, 6) ?? ctx.rect(tX, tY, tW, tH);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Header
        ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
        ctx.font = '600 11px system-ui,sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(monthLabel, tX + tPad, tY + tPad);

        // Header divider
        ctx.strokeStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tX + tPad, tY + tPad + 14);
        ctx.lineTo(tX + tW - tPad, tY + tPad + 14);
        ctx.stroke();

        // Data rows
        let currY = tY + tPad + 18;
        rows.forEach(r => {
          ctx.fillStyle = r.color;
          ctx.beginPath();
          ctx.arc(tX + tPad + 4, currY + 5, 3.5, 0, 2 * Math.PI);
          ctx.fill();

          ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
          ctx.font = '10px system-ui,sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(r.label, tX + tPad + 12, currY);

          ctx.fillStyle = dark ? '#f1f5f9' : '#0f172a';
          ctx.font = '600 10px system-ui,sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(r.value, tX + tW - tPad, currY);

          currY += rowH;
        });
      }
    }
  }

  private toRgba(color: string, alpha: number): string {
    if (color.startsWith('rgba')) {
      return color.replace(/[\d\.]+\)$/g, `${alpha})`);
    }
    if (color.startsWith('#')) {
      let c = color.substring(1);
      if (c.length === 3) c = c.split('').map(x => x + x).join('');
      const num = parseInt(c, 16);
      return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
    }
    return color;
  }

  private drawGenericDonut(
    canvasRef: ElementRef<HTMLCanvasElement> | undefined,
    chart: SummaryChartBlock | null,
    palette: string[],
    centerLabel = 'Total'
  ): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const canvas = canvasRef?.nativeElement;
    if (!canvas || !chart) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.offsetWidth || 200;
    const cssH = canvas.offsetHeight || 200;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.scale(dpr, dpr);

    const CX = cssW / 2;
    const CY = cssH / 2;
    const R = Math.min(CX, CY) - 10;
    const total = chart.data.reduce((a, b) => a + b, 0);
    const dark = this.isDark();

    ctx.clearRect(0, 0, cssW, cssH);

    if (total === 0) {
      // Empty outline
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, 2 * Math.PI);
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(CX, CY, R * 0.56, 0, 2 * Math.PI);
      ctx.fillStyle = dark ? '#1e293b' : '#ffffff';
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
      ctx.font = 'bold 16px system-ui,sans-serif';
      ctx.fillText('0', CX, CY - 6);
      ctx.font = '10px system-ui,sans-serif';
      ctx.fillText(centerLabel, CX, CY + 8);
      return;
    }

    let startAngle = -Math.PI / 2;
    chart.data.forEach((val, i) => {
      if (val <= 0) return;
      const slice = (val / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.arc(CX, CY, R, startAngle, startAngle + slice);
      ctx.closePath();
      ctx.fillStyle = palette[i % palette.length];
      ctx.fill();
      startAngle += slice;
    });

    // Donut hole
    ctx.beginPath();
    ctx.arc(CX, CY, R * 0.56, 0, 2 * Math.PI);
    ctx.fillStyle = dark ? '#1e293b' : '#ffffff';
    ctx.fill();

    // Center text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = dark ? '#f1f5f9' : '#0f172a';
    ctx.font = 'bold 18px system-ui,sans-serif';
    ctx.fillText(String(total), CX, CY - 8);
    ctx.font = '10px system-ui,sans-serif';
    ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
    ctx.fillText(centerLabel, CX, CY + 10);
  }

  // ── Template helpers ──────────────────────────────────────────────────

  hasTrendsData(): boolean {
    const labels = this.trendsLabels();
    if (labels.length === 0) return false;
    const co2HasData = this.trendsCO2Data().some(v => v > 0);
    const pickupDatasets = this.trendsPickupDatasets();
    const appDatasets = this.trendsApplicationDatasets();
    const oppDatasets = this.trendsOpportunityDatasets();

    if (this.userRole === 'admin') {
      const hasCompleted = pickupDatasets.find(d => d.label === 'Completed')?.data.some(v => v > 0);
      const hasPending = pickupDatasets.find(d => d.label === 'Pending')?.data.some(v => v > 0);
      return !!hasCompleted || !!hasPending || co2HasData;
    } else if (this.userRole === 'ngo') {
      const hasApps = appDatasets.some(d => d.data.some(v => v > 0));
      const hasOpps = oppDatasets.some(d => d.data.some(v => v > 0));
      const hasCompletedPickups = pickupDatasets.find(d => d.label === 'Completed')?.data.some(v => v > 0);
      return hasApps || hasOpps || !!hasCompletedPickups || co2HasData;
    } else if (this.userRole === 'volunteer') {
      const hasCompletedPickups = pickupDatasets.find(d => d.label === 'Completed')?.data.some(v => v > 0);
      const hasApps = appDatasets.some(d => d.data.some(v => v > 0));
      return !!hasCompletedPickups || hasApps || co2HasData;
    }
    return pickupDatasets.some(d => d.data.some(v => v > 0)) || co2HasData;
  }

  hasChartData(chart: SummaryChartBlock | null): boolean {
    return !!chart && chart.data.some(v => v > 0);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString([], {
        month: 'short', day: 'numeric', year: 'numeric'
      });
    } catch { return dateStr; }
  }

  formatTime(event: UpcomingEvent): string {
    if (!event.time) return '';
    const { startDisplay, endDisplay, start, end } = event.time;
    const s = startDisplay ? format12HourTime(startDisplay) : format12HourTime(start);
    const e = endDisplay ? format12HourTime(endDisplay) : format12HourTime(end);
    if (s && e) return `${s} – ${e}`;
    return s || e || '';
  }

  formatTimestamp(ts?: string | null): string {
    return formatDateTime12(ts);
  }

  statusClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'pending':   return 'badge-pending';
      case 'assigned':  return 'badge-assigned';
      case 'completed': return 'badge-completed';
      case 'missed':    return 'badge-missed';
      case 'cancelled': return 'badge-cancelled';
      case 'open':      return 'badge-open';
      case 'closed':    return 'badge-closed';
      case 'in-progress': return 'badge-progress';
      case 'accepted':  return 'badge-accepted';
      case 'rejected':  return 'badge-rejected';
      default:          return 'badge-default';
    }
  }

  categoryColor(cat: string): string {
    const map: Record<string, string> = {
      Plastic: '#6366f1', Paper: '#22c55e', Glass: '#06b6d4',
      'E-Waste': '#ef4444', Organic: '#f59e0b', Metal: '#8b5cf6',
    };
    return map[cat] ?? '#94a3b8';
  }

  pickupStatusColor(index: number): string {
    return ['#6366f1', '#f59e0b', '#22c55e', '#ef4444', '#94a3b8'][index % 5];
  }

  applicationStatusColor(index: number): string {
    return ['#f59e0b', '#22c55e', '#ef4444'][index % 3];
  }

  opportunityStatusColor(index: number): string {
    return ['#22c55e', '#64748b', '#6366f1'][index % 3];
  }

  growthLabel(pct: number): string {
    if (pct == null) return '';
    return pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
  }

  growthPositive(pct: number): boolean { return pct > 0; }

  formatMonth(m: string): string {
    if (!m) return '';
    try {
      const [y, mo] = m.split('-');
      return new Date(+y, +mo - 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
    } catch { return m; }
  }

  asVolunteer(m: UserMetrics | null): VolunteerMetrics | null {
    return m?.role === 'volunteer' ? (m as VolunteerMetrics) : null;
  }

  asNgo(m: UserMetrics | null): NgoMetrics | null {
    return m?.role === 'ngo' ? (m as NgoMetrics) : null;
  }

  sumArray(arr?: number[] | null): number {
    if (!arr || arr.length === 0) return 1;
    return arr.reduce((a, b) => a + b, 0) || 1;
  }

  private isDark(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    return document.documentElement.classList.contains('dark') ||
           window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login'], { replaceUrl: true });
  }
}
