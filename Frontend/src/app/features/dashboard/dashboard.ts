// ============================================
// DASHBOARD — WasteZero Milestone 4
// Route: /dashboard  (authGuard — all roles)
//
// Root-cause fixes in this version:
//  FIX 1 — Pickup Status empty:
//           Backend returns data.charts.pickups (nested under .charts)
//           with 5 statuses: Pending/Assigned/Completed/Cancelled/Missed.
//           Previous code read data.pickups → undefined → empty donut.
//
//  FIX 2 — Monthly trends empty:
//           Backend returns data.labels[] + data.pickup.datasets[]
//           NOT data.trends[]. Chart was always getting [].
//
//  FIX 3 — Canvas @ViewChild inside @if() block:
//           Angular renders canvas after signal update. Must call
//           drawChart() via setTimeout(0) to yield one render tick.
//
//  FIX 4 — Recycling breakdown not wired.
// ============================================

import {
  Component, inject, OnInit, OnDestroy,
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

import {
  AdminDashboardStats,
  TrendDataset,
  SummaryChartBlock,
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

  // ── Volunteer ─────────────────────────────────────────────────────────
  matches        = signal<MatchSuggestion[]>([]);
  loadingMatches = signal(false);
  matchError     = signal('');
  missingFields  = signal<string[]>([]); 

  // ── Volunteer / NGO personal metrics ───────────────────────────
  userMetrics        = signal<UserMetrics | null>(null);
  loadingUserMetrics = signal(false);
  userMetricsError   = signal('');

  // ── Admin KPI ─────────────────────────────────────────────────────────
  adminStats        = signal<AdminDashboardStats | null>(null);
  loadingAdminStats = signal(false);
  adminStatsError   = signal('');

  // ── Pickup Analytics chart (from monthly-trends) ──────────────────────
  trendsLabels         = signal<string[]>([]);
  trendsPickupDatasets = signal<TrendDataset[]>([]);
  trendsCO2Data        = signal<number[]>([]);
  loadingTrends        = signal(false);

  // ── Pickup Status donut (from summary-reports → data.charts.pickups) ──
  pickupStatusChart = signal<SummaryChartBlock | null>(null);
  loadingSummary    = signal(false);

  // ── Recycling breakdown ───────────────────────────────────────────────
  recyclingCategories    = signal<RecyclingCategory[]>([]);
  recyclingTotalKg       = signal(0);
  recyclingTotalCO2      = signal(0);
  recyclingGrowthPercent = signal(0);
  recyclingMonth         = signal('');
  loadingRecycling       = signal(false);

  // ── Upcoming pickups ──────────────────────────────────────────────────
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
  adminMessageRoleFilter     = signal<'all' | 'volunteer' | 'ngo' | 'admin'>('all');

  filteredAdminConversations = computed(() => {
    const list = this.adminConversations();
    const filter = this.adminMessageRoleFilter();
    if (filter === 'all') return list;
    return list.filter(c => {
      const otherRole = (c.otherUser?.role || '').toLowerCase();
      return otherRole === filter;
    });
  });

  // ── Canvas refs (inside @if — timing fix via setTimeout(0)) ───────────
  @ViewChild('trendsCanvas') trendsCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('pickupCanvas') pickupCanvas?: ElementRef<HTMLCanvasElement>;

  constructor() {
    const user = this.authService.getCurrentUser();
    if (user) {
      this.userName = user.name;
      this.userRole = user.role;
    }
  }

  ngOnInit(): void {
    if (this.userRole === 'volunteer') {
      this.loadMatches();
      this.loadUserMetrics();
      this.loadVolunteerUpcoming();
      this.loadLeaderboard();
    }
    if (this.userRole === 'ngo') {
      this.loadUserMetrics();
      this.loadVolunteerUpcoming();
      this.loadLeaderboard();
    }
    if (this.userRole === 'admin') {
      this.loadAdminData();
      this.loadAdminConversations();
    }
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Personal metrics (volunteer + NGO) ────────────────────────

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
          // Backend returns { pickups: [], opportunities: [] } — merge for volunteer/NGO view
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

  /** GET /api/v1/stats/leaderboard?limit=10 — returns dual volunteer & NGO rankings for admin */
  loadAdminLeaderboard(): void {
    this.loadingAdminLeaderboard.set(true);
    this.adminLeaderboardError.set('');
    this.dashboardService.getLeaderboard(10)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: LeaderboardResponse) => {
          const data: any = res.data;
          // Admin response: { volunteers: { topContributors: [...], totalRanked }, ngos: { topContributors: [...], totalRanked } }
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

          // FIX 2: correct monthly-trends field mapping
          const td = trends.data;
          this.trendsLabels.set(td?.labels ?? []);
          this.trendsPickupDatasets.set(td?.pickup?.datasets ?? []);
          this.trendsCO2Data.set(td?.co2?.data ?? []);
          this.loadingTrends.set(false);

          // FIX 1: pickup status → data.charts.pickups (not data.pickups)
          this.pickupStatusChart.set(summary.data?.charts?.pickups ?? null);
          this.loadingSummary.set(false);

          // Recycling breakdown
          const rd = recycling.data;
          this.recyclingCategories.set(rd?.categories ?? []);
          this.recyclingTotalKg.set(rd?.totalWeightKg ?? 0);
          this.recyclingTotalCO2.set(rd?.totalCO2Kg ?? 0);
          this.recyclingGrowthPercent.set(rd?.growthPercentage ?? 0);
          this.recyclingMonth.set(rd?.month ?? '');
          this.loadingRecycling.set(false);

          // Upcoming pickups
          this.upcomingPickups.set(upcoming.data?.pickups ?? []);
          this.loadingUpcoming.set(false);

          // FIX 3: defer canvas draws — Angular must flush DOM after @if
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

  // ── Volunteer ─────────────────────────────────────────────────────────

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

  // ── Chart drawing ─────────────────────────────────────────────────────

  private drawTrendsChart(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const canvas = this.trendsCanvas?.nativeElement;
    if (!canvas) return;

    const labels   = this.trendsLabels();
    const datasets = this.trendsPickupDatasets();
    const co2      = this.trendsCO2Data();
    if (labels.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width  = canvas.offsetWidth  || 680;
    canvas.height = canvas.offsetHeight || 240;
    const W = canvas.width, H = canvas.height;
    const pad = { top: 20, right: 20, bottom: 44, left: 46 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top  - pad.bottom;
    const dark      = this.isDark();
    const textColor = dark ? '#94a3b8' : '#64748b';
    const gridColor = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

    ctx.clearRect(0, 0, W, H);

    const completedDs = datasets.find(d => d.label === 'Completed');
    const pendingDs   = datasets.find(d => d.label === 'Pending');
    const n           = labels.length;
    const cCounts     = completedDs?.data ?? new Array(n).fill(0);
    const pCounts     = pendingDs?.data   ?? new Array(n).fill(0);
    const totals      = labels.map((_, i) => datasets.reduce((s, d) => s + (d.data[i] ?? 0), 0));
    const maxP = Math.max(...totals, 1);
    const maxC = Math.max(...co2, 1);
    const slotW = cW / n;
    const barW  = Math.max(Math.min(slotW * 0.28, 18), 3);

    // Grid
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + cH - (i / 4) * cH;
      ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
      ctx.fillStyle = textColor; ctx.font = '10px system-ui,sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round((i / 4) * maxP)), pad.left - 5, y + 3);
    }

    // Bars
    labels.forEach((_, i) => {
      const cx = pad.left + i * slotW + slotW / 2;

      const cv = cCounts[i] ?? 0;
      if (cv > 0) {
        const bH = (cv / maxP) * cH;
        const x  = cx - barW - 1;
        const y  = pad.top + cH - bH;
        ctx.fillStyle = 'rgba(34,197,94,0.8)';
        ctx.beginPath();
        (ctx as any).roundRect?.(x, y, barW, bH, [3, 3, 0, 0]) ?? ctx.rect(x, y, barW, bH);
        ctx.fill();
      }

      const pv = pCounts[i] ?? 0;
      if (pv > 0) {
        const bH = (pv / maxP) * cH;
        const x  = cx + 1;
        const y  = pad.top + cH - bH;
        ctx.fillStyle = 'rgba(99,102,241,0.8)';
        ctx.beginPath();
        (ctx as any).roundRect?.(x, y, barW, bH, [3, 3, 0, 0]) ?? ctx.rect(x, y, barW, bH);
        ctx.fill();
      }
    });

    // CO₂ line
    if (co2.some(v => v > 0)) {
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]);
      ctx.beginPath();
      co2.forEach((v, i) => {
        const x = pad.left + i * slotW + slotW / 2;
        const y = pad.top  + cH - (v / maxC) * cH;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke(); ctx.setLineDash([]);
    }

    // X labels
    ctx.fillStyle = textColor; ctx.font = '10px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    labels.forEach((lbl, i) => {
      const x = pad.left + i * slotW + slotW / 2;
      ctx.fillText(lbl.slice(0, 3), x, H - 32);
    });
  }

  private drawPickupDonut(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const canvas = this.pickupCanvas?.nativeElement;
    const chart  = this.pickupStatusChart();
    if (!canvas || !chart) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width  = canvas.offsetWidth  || 200;
    canvas.height = canvas.offsetHeight || 200;
    const CX = canvas.width / 2, CY = canvas.height / 2;
    const R  = Math.min(CX, CY) - 10;
    const palette = ['#6366f1', '#f59e0b', '#22c55e', '#ef4444', '#94a3b8'];
    const total   = chart.data.reduce((a, b) => a + b, 0) || 1;
    const dark    = this.isDark();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let startAngle = -Math.PI / 2;
    chart.data.forEach((val, i) => {
      if (val === 0) return;
      const slice = (val / total) * 2 * Math.PI;
      ctx.beginPath(); ctx.moveTo(CX, CY);
      ctx.arc(CX, CY, R, startAngle, startAngle + slice);
      ctx.closePath();
      ctx.fillStyle = palette[i % palette.length];
      ctx.fill();
      startAngle += slice;
    });

    // Donut hole
    ctx.beginPath(); ctx.arc(CX, CY, R * 0.54, 0, 2 * Math.PI);
    ctx.fillStyle = dark ? '#1e293b' : '#ffffff';
    ctx.fill();

    // Centre
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = dark ? '#f1f5f9' : '#0f172a';
    ctx.font = `bold 18px system-ui,sans-serif`;
    ctx.fillText(String(total), CX, CY - 8);
    ctx.font = `10px system-ui,sans-serif`;
    ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
    ctx.fillText('Total', CX, CY + 10);
  }

  // ── Template helpers ──────────────────────────────────────────────────

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
    const { startDisplay, endDisplay } = event.time;
    if (startDisplay && endDisplay) return `${startDisplay} – ${endDisplay}`;
    return startDisplay ?? '';
  }

  statusClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'pending':   return 'badge-pending';
      case 'assigned':  return 'badge-assigned';
      case 'completed': return 'badge-completed';
      case 'missed':    return 'badge-missed';
      case 'cancelled': return 'badge-cancelled';
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

  // Palette for pickup status legend (matches drawPickupDonut palette order)
  // Pending / Assigned / Completed / Cancelled / Missed
  pickupStatusColor(index: number): string {
    return ['#6366f1', '#f59e0b', '#22c55e', '#ef4444', '#94a3b8'][index % 5];
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

  /** Template helper: sum a number array (replaces non-existent Angular sum pipe) */
  /** Type-narrowing helpers for template — Angular templates can't use `as` */
  asVolunteer(m: UserMetrics | null): VolunteerMetrics | null {
    return m?.role === 'volunteer' ? (m as VolunteerMetrics) : null;
  }
  asNgo(m: UserMetrics | null): NgoMetrics | null {
    return m?.role === 'ngo' ? (m as NgoMetrics) : null;
  }

  /** Template helper: sum a number array (replaces non-existent Angular sum pipe) */
  sumArray(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) || 1;
  }

  private isDark(): boolean {
    return document.documentElement.classList.contains('dark') ||
           window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login'], { replaceUrl: true });
  }
}
