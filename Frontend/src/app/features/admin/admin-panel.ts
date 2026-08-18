// ============================================
// ADMIN PANEL — WasteZero Milestone 4
// Route: /admin  (adminGuard — admin only)
// Tabs: [Users] [Opportunities] [Pickups] [Logs]
// Plus: Live KPI cards + Report generation
// ============================================

import {
  Component, inject, OnInit, OnDestroy,
  signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { DashboardService } from '../../core/services/dashboard.service';
import { AdminService }     from '../../core/services/admin.service';
import { ReportService }    from '../../core/services/report.service';

import {
  AdminDashboardStats, AdminDashboardStatsResponse,
  RealtimeStatsResponse, WasteAnalyticsResponse, WasteTopContributor, RecyclingCategory,
  LeaderboardContributor, LeaderboardResponse,
} from '../../core/models/dashboard.model';
import {
  AdminUser, AdminUserListResponse, AdminSuspendResponse,
  AuditLog, AuditLogListResponse,
  ReportType, ReportFormat,
  AdminRoleChangeResponse, UserRole,
  AdminOpportunity, AdminOpportunityListResponse, AdminOpportunityListData,
  AdminOpportunityActionResponse,
  AdminPickupItem, AdminPickupListResponse, AdminPickupListData,
  AdminPickupActionResponse,
} from '../../core/models/admin.model';
import { WASTE_TYPES, WasteCollectedItem } from '../../core/models/pickup.model';

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatSnackBarModule],
  templateUrl: './admin-panel.html',
  styleUrl: './admin-panel.css',
})
export class AdminPanel implements OnInit, OnDestroy {

  private router: Router                     = inject(Router);
  private dashboardService: DashboardService = inject(DashboardService);
  private adminService: AdminService         = inject(AdminService);
  private reportService: ReportService       = inject(ReportService);
  private snackBar: MatSnackBar              = inject(MatSnackBar);
  private fb: FormBuilder                    = inject(FormBuilder);
  private destroy$                           = new Subject<void>();

  // ── KPI State ────────────────────────────────────────────────────────
  stats        = signal<AdminDashboardStats | null>(null);
  loadingStats = signal(true);
  statsError   = signal('');

  // ── Tab ──────────────────────────────────────────────────────────────
  activeTab = signal<'users' | 'opportunities' | 'pickups' | 'logs' | 'leaderboard'>('users');

  // ── Leaderboard Management ──────────────────────────────────────────
  volunteerLeaderboard  = signal<LeaderboardContributor[]>([]);
  ngoLeaderboard        = signal<LeaderboardContributor[]>([]);
  volunteerRankedTotal  = signal(0);
  ngoRankedTotal        = signal(0);
  loadingLeaderboard    = signal(false);
  leaderboardError      = signal('');
  leaderboardRoleFilter = signal<'all' | 'volunteer' | 'ngo'>('all');

  // ── User Management ───────────────────────────────────────────────────
  users        = signal<AdminUser[]>([]);
  loadingUsers = signal(false);
  usersError   = signal('');

  userSearch     = signal('');
  userRoleFilter = signal('');
  userPage       = signal(1);
  userTotal      = signal(0);
  userPages      = signal(0);

  readonly hasNextUsers = computed(() => this.userPage() < this.userPages());
  readonly hasPrevUsers = computed(() => this.userPage() > 1);

  // ── Suspend Modal ────────────────────────────────────────────────────
  suspendTarget = signal<AdminUser | null>(null);  // null = modal closed
  suspendReason = signal('');
  suspendingId  = signal<string | null>(null);

  // ── Report Controls ───────────────────────────────────────────────────
  reportType      = signal<ReportType>('users');
  reportFormat    = signal<ReportFormat>('csv');
  reportStartDate = signal('');
  reportEndDate   = signal('');
  downloadingReport = signal(false);

  // ── Audit Logs ────────────────────────────────────────────────────────
  logs        = signal<AuditLog[]>([]);
  loadingLogs = signal(false);
  logsError   = signal('');
  logsPage    = signal(1);
  logsTotal   = signal(0);
  logsPages   = signal(0);

  readonly hasNextLogs = computed(() => this.logsPage() < this.logsPages());
  readonly hasPrevLogs = computed(() => this.logsPage() > 1);

  // ── Opportunity Management ───────────────────────────────────────
  opportunities        = signal<AdminOpportunity[]>([]);
  loadingOpportunities = signal(false);
  oppError             = signal('');
  oppPage              = signal(1);
  oppTotal             = signal(0);
  oppPages             = signal(0);
  oppStatusFilter      = signal('');
  oppSearch            = signal('');

  // Delete opportunity modal
  deleteOppTarget = signal<AdminOpportunity | null>(null);
  deleteOppReason = signal('');
  deletingOppId   = signal<string | null>(null);
  restoringOppId  = signal<string | null>(null);

  readonly hasNextOpps = computed(() => this.oppPage() < this.oppPages());
  readonly hasPrevOpps = computed(() => this.oppPage() > 1);

  // ── Pickup Management ───────────────────────────────────────────
  adminPickups        = signal<AdminPickupItem[]>([]);
  loadingPickups      = signal(false);
  pickupsError        = signal('');
  pickupsPage         = signal(1);
  pickupsTotal        = signal(0);
  pickupsPages        = signal(0);
  pickupsStatusFilter = signal<string>('all');

  // Delete pickup modal
  deletePickupTarget  = signal<AdminPickupItem | null>(null);
  deletingPickupId    = signal<string | null>(null);

  // Force-status & Complete modal
  forceStatusTarget   = signal<AdminPickupItem | null>(null);
  forceStatusValue    = signal<'Completed' | 'Cancelled'>('Completed');
  forcingStatusId     = signal<string | null>(null);

  // NGO attribution & Waste entries for Admin Completion
  completeForm!: FormGroup;
  readonly wasteTypes: string[] = WASTE_TYPES;
  ngoSearchQuery      = signal('');
  availableNgos       = signal<AdminUser[]>([]);
  loadingNgos         = signal(false);
  selectedNgo         = signal<AdminUser | null>(null);
  private ngoSearchSubject = new Subject<string>();

  readonly hasNextPickups = computed(() => this.pickupsPage() < this.pickupsPages());
  readonly hasPrevPickups = computed(() => this.pickupsPage() > 1);

  // ── User Role Change ─────────────────────────────────────
  roleChangeTarget  = signal<AdminUser | null>(null);
  roleChangeValue   = signal<UserRole>('volunteer');
  changingRoleId    = signal<string | null>(null);

  // ── Real-time stats (poll every 60 s) ────────────────────────────────
  realtimeStats        = signal<RealtimeStatsResponse['data'] | null>(null);
  loadingRealtime      = signal(false);
  private realtimeTimer: ReturnType<typeof setInterval> | null = null;

  // ── Waste Analytics ─────────────────────────────────────────────────
  wasteAnalytics        = signal<WasteAnalyticsResponse['data'] | null>(null);
  loadingWasteAnalytics = signal(false);
  wasteAnalyticsError   = signal('');

  // ── Lifecycle ─────────────────────────────────────────────────────────

  ngOnInit(): void {
    this._initCompleteForm();
    this.loadStats();
    this.loadUsers();
    this.loadWasteAnalytics();
    this.startRealtimePoll();

    this.ngoSearchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(query => this._fetchNgos(query));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.realtimeTimer) { clearInterval(this.realtimeTimer); this.realtimeTimer = null; }
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  loadStats(): void {
    this.loadingStats.set(true);
    this.statsError.set('');
    this.dashboardService.getAdminStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: AdminDashboardStatsResponse) => {
          this.stats.set(res.data);
          this.loadingStats.set(false);
        },
        error: (err: any) => {
          // HTTP 429 = adminLimiter (5 req/min) exhausted.
          // Show a specific message so the admin knows to wait ~1 minute.
          const msg = err.status === 429
            ? 'Rate limit reached. Please wait 1 minute, then click Refresh.'
            : (err.error?.message || 'Failed to load platform stats.');
          this.statsError.set(msg);
          this.loadingStats.set(false);
        }
      });
  }

  /** GET /api/v1/stats/realtime — admin-only, fires once then every 60 s */
  startRealtimePoll(): void {
    const fetch = () => {
      this.loadingRealtime.set(true);
      this.dashboardService.getRealtimeStats()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (res) => { this.realtimeStats.set(res.data); this.loadingRealtime.set(false); },
          error: ()    => { this.loadingRealtime.set(false); }
        });
    };
    fetch();
    this.realtimeTimer = setInterval(fetch, 60_000);
  }

  /** GET /api/v1/stats/waste-analytics — admin-only */
  loadWasteAnalytics(): void {
    this.loadingWasteAnalytics.set(true);
    this.wasteAnalyticsError.set('');
    this.dashboardService.getWasteAnalytics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: WasteAnalyticsResponse) => {
          this.wasteAnalytics.set(res.data);
          this.loadingWasteAnalytics.set(false);
        },
        error: (err: { status: number; error?: { message?: string } }) => {
          const msg = err.status === 429
            ? 'Rate limit reached. Waste analytics unavailable right now.'
            : (err.error?.message || 'Failed to load waste analytics.');
          this.wasteAnalyticsError.set(msg);
          this.loadingWasteAnalytics.set(false);
        }
      });
  }

  // ── Tabs ──────────────────────────────────────────────────────────────

  setTab(tab: 'users' | 'opportunities' | 'pickups' | 'logs' | 'leaderboard'): void {
    this.activeTab.set(tab);
    // Lazy-load each tab on first visit — avoids burning adminLimiter on initial open
    if (tab === 'users'         && this.users().length === 0)                 this.loadUsers();
    if (tab === 'opportunities' && this.opportunities().length === 0)          this.loadOpportunities();
    if (tab === 'pickups'       && this.adminPickups().length === 0)           this.loadAdminPickups();
    if (tab === 'logs'          && this.logs().length === 0)                   this.loadLogs();
    if (tab === 'leaderboard'   && this.volunteerLeaderboard().length === 0)   this.loadLeaderboard();
  }

  // ── Leaderboard Loading ───────────────────────────────────────────────

  /** GET /api/v1/stats/leaderboard?limit=20 — returns dual volunteer & NGO rankings */
  loadLeaderboard(): void {
    this.loadingLeaderboard.set(true);
    this.leaderboardError.set('');
    this.dashboardService.getLeaderboard(20)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: LeaderboardResponse) => {
          const data: any = res.data;
          // Admin response: { volunteers: { topContributors: [...], totalRanked }, ngos: { topContributors: [...], totalRanked } }
          if (data?.volunteers) {
            this.volunteerLeaderboard.set(data.volunteers.topContributors ?? []);
            this.volunteerRankedTotal.set(data.volunteers.totalRanked ?? data.volunteers.topContributors?.length ?? 0);
          } else if (data?.topContributors && data?.role === 'volunteer') {
            this.volunteerLeaderboard.set(data.topContributors);
            this.volunteerRankedTotal.set(data.totalRanked ?? data.topContributors.length);
          }

          if (data?.ngos) {
            this.ngoLeaderboard.set(data.ngos.topContributors ?? []);
            this.ngoRankedTotal.set(data.ngos.totalRanked ?? data.ngos.topContributors?.length ?? 0);
          } else if (data?.topContributors && data?.role === 'ngo') {
            this.ngoLeaderboard.set(data.topContributors);
            this.ngoRankedTotal.set(data.totalRanked ?? data.topContributors.length);
          }

          this.loadingLeaderboard.set(false);
        },
        error: (err: { status: number; error?: { message?: string } }) => {
          const msg = err.status === 429
            ? 'Rate limit reached. Please wait a minute and retry.'
            : (err.error?.message || 'Failed to load leaderboard data.');
          this.leaderboardError.set(msg);
          this.loadingLeaderboard.set(false);
        }
      });
  }

  // ── User Management ───────────────────────────────────────────────────

  loadUsers(page = this.userPage()): void {
    this.loadingUsers.set(true);
    this.usersError.set('');
    this.adminService.getUsers({
      page,
      limit:  10,
      search: this.userSearch() || undefined,
      role:   this.userRoleFilter() || undefined,
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: AdminUserListResponse) => {
          this.users.set(res.data.users);
          // pagination is TOP-LEVEL on the response (not inside data)
          this.userPage.set(res.pagination.page);
          this.userTotal.set(res.pagination.total);
          this.userPages.set(res.pagination.totalPages);
          this.loadingUsers.set(false);
        },
        error: (err: any) => {
          // HTTP 429 = adminLimiter exhausted — guide the admin to wait.
          const msg = err.status === 429
            ? 'Rate limit reached. Please wait 1 minute, then retry.'
            : (err.error?.message || 'Failed to load users.');
          this.usersError.set(msg);
          this.loadingUsers.set(false);
        }
      });
  }

  onSearchChange(): void {
    this.userPage.set(1);
    this.loadUsers(1);
  }

  onRoleFilterChange(): void {
    this.userPage.set(1);
    this.loadUsers(1);
  }

  prevUserPage(): void { if (this.hasPrevUsers()) this.loadUsers(this.userPage() - 1); }
  nextUserPage(): void { if (this.hasNextUsers()) this.loadUsers(this.userPage() + 1); }

  // ── Suspend modal flow ────────────────────────────────────────────────

  /** Open suspend reason modal */
  openSuspendModal(user: AdminUser): void {
    this.suspendTarget.set(user);
    this.suspendReason.set('');
  }

  /** Close modal without acting */
  closeSuspendModal(): void {
    this.suspendTarget.set(null);
    this.suspendReason.set('');
  }

  /** Submit suspension with reason — called from modal confirm button */
  confirmSuspend(): void {
    const user   = this.suspendTarget();
    const reason = this.suspendReason().trim();
    if (!user) return;
    if (!reason) {
      this.snackBar.open('Suspension reason is required.', 'Close', { duration: 3000 });
      return;
    }

    this.suspendingId.set(user._id);
    this.closeSuspendModal();

    this.adminService.suspendUser(user._id, reason)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (_res: AdminSuspendResponse) => {
          this.suspendingId.set(null);
          // Optimistic update — flip status locally
          this.users.update(list =>
            list.map(u => u._id === user._id
              ? { ...u, isSuspended: true, suspensionReason: reason }
              : u)
          );
          this.snackBar.open(`${user.name} has been suspended.`, 'Close', { duration: 3500 });
        },
        error: (err: any) => {
          this.suspendingId.set(null);
          const msg = err.status === 403
            ? 'You cannot suspend your own account.'
            : (err.error?.message || 'Suspension failed.');
          this.snackBar.open(msg, 'Close', { duration: 4000 });
        }
      });
  }

  /** Unsuspend — no modal or reason required */
  unsuspendUser(user: AdminUser): void {
    if (this.suspendingId() === user._id) return;
    this.suspendingId.set(user._id);

    this.adminService.unsuspendUser(user._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (_res: AdminSuspendResponse) => {
          this.suspendingId.set(null);
          this.users.update(list =>
            list.map(u => u._id === user._id
              ? { ...u, isSuspended: false, suspensionReason: null }
              : u)
          );
          this.snackBar.open(`${user.name} has been unsuspended.`, 'Close', { duration: 3500 });
        },
        error: (err: any) => {
          this.suspendingId.set(null);
          const msg = err.status === 403
            ? 'You cannot modify your own account.'
            : (err.error?.message || 'Unsuspend failed.');
          this.snackBar.open(msg, 'Close', { duration: 4000 });
        }
      });
  }

  /** Direct navigation to Messages with selected user */
  chatWithUser(user: AdminUser): void {
    this.router.navigate(['/messages'], {
      queryParams: {
        contactId:       user._id,
        contactName:     user.name,
        contactRole:     user.role,
        contactUsername: user.username,
      }
    });
  }

  // ── Audit Logs ────────────────────────────────────────────────────────

  loadLogs(page = this.logsPage()): void {
    this.loadingLogs.set(true);
    this.logsError.set('');
    this.adminService.getLogs({ page, limit: 20 })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: AuditLogListResponse) => {
          this.logs.set(res.data.logs);
          // pagination is TOP-LEVEL on the response (not inside data)
          this.logsPage.set(res.pagination.page);
          this.logsTotal.set(res.pagination.total);
          this.logsPages.set(res.pagination.totalPages);
          this.loadingLogs.set(false);
        },
        error: (err: any) => {
          this.logsError.set(err.error?.message || 'Failed to load audit logs.');
          this.loadingLogs.set(false);
        }
      });
  }

  prevLogsPage(): void { if (this.hasPrevLogs()) this.loadLogs(this.logsPage() - 1); }
  nextLogsPage(): void { if (this.hasNextLogs()) this.loadLogs(this.logsPage() + 1); }

  /** Returns the admin name from a populated or un-populated admin_id field */
  getLogAdminName(log: AuditLog): string {
    if (typeof log.admin_id === 'object' && log.admin_id !== null) {
      return log.admin_id.name;
    }
    return 'Admin';
  }

  /** Format an ISO timestamp to a readable local string */
  formatTimestamp(ts: string): string {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleString([], {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return ts; }
  }

  // ── Report Downloads ──────────────────────────────────────────────────

  downloadReport(): void {
    if (this.downloadingReport()) return;
    this.downloadingReport.set(true);

    const type      = this.reportType();
    const format    = this.reportFormat();
    const startDate = this.reportStartDate() || undefined;
    const endDate   = this.reportEndDate()   || undefined;
    const svc       = this.reportService;

    svc.downloadReport(type, format, startDate, endDate)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob: Blob) => {
          this.downloadingReport.set(false);
          svc.saveBlob(blob, svc.buildFilename(type, format));
          this.snackBar.open('Report downloaded successfully.', 'Close', { duration: 3000 });
        },
        error: (err: any) => {
          this.downloadingReport.set(false);
          const msg = err.status === 429
            ? 'Rate limit reached. Max 5 report downloads per hour.'
            : (err.error?.message || 'Failed to generate report.');
          this.snackBar.open(msg, 'Close', { duration: 5000 });
        }
      });
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  getInitials(name: string): string {
    return name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString([], {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch { return dateStr; }
  }

  // ── Report type options ───────────────────────────────────────────────
  readonly reportTypes: { value: ReportType; label: string }[] = [
    { value: 'users',         label: 'Users' },
    { value: 'pickups',       label: 'Pickups' },
    { value: 'opportunities', label: 'Opportunities' },
    { value: 'applications',  label: 'Applications' },
    { value: 'full-activity', label: 'Full Activity' },
  ];

  // ── Opportunity Management ─────────────────────────────────────────────

  loadOpportunities(page = this.oppPage()): void {
    this.loadingOpportunities.set(true);
    this.oppError.set('');
    this.adminService.getOpportunities({
      page, limit: 15,
      status: this.oppStatusFilter() || undefined,
      search: this.oppSearch() || undefined,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: AdminOpportunityListResponse) => {
        // Backend: data = { opportunities: [...], pagination: { page, limit, total, totalPages } }
        const d = res.data as AdminOpportunityListData;
        this.opportunities.set(d.opportunities ?? []);
        this.oppPage.set(d.pagination?.page ?? 1);
        this.oppTotal.set(d.pagination?.total ?? 0);
        this.oppPages.set(d.pagination?.totalPages ?? 1);
        this.loadingOpportunities.set(false);
      },
      error: (err: { status: number; error?: { message?: string } }) => {
        this.oppError.set(err.status === 429
          ? 'Rate limit reached. Wait 1 minute.' : (err.error?.message || 'Failed to load.'));
        this.loadingOpportunities.set(false);
      }
    });
  }

  onOppFilterChange(): void { this.oppPage.set(1); this.loadOpportunities(1); }

  openDeleteOppModal(opp: AdminOpportunity): void {
    this.deleteOppTarget.set(opp); this.deleteOppReason.set('');
  }
  closeDeleteOppModal(): void { this.deleteOppTarget.set(null); this.deleteOppReason.set(''); }

  confirmDeleteOpp(): void {
    const opp = this.deleteOppTarget();
    const reason = this.deleteOppReason().trim();
    if (!opp) return;
    if (!reason) { this.snackBar.open('Deletion reason required.', 'Close', { duration: 3000 }); return; }
    this.deletingOppId.set(opp._id);
    this.closeDeleteOppModal();
    this.adminService.removeOpportunity(opp._id, reason)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: (_r: AdminOpportunityActionResponse) => {
          this.deletingOppId.set(null);
          this.opportunities.update(l => l.map(o => o._id === opp._id ? { ...o, isRemoved: true } : o));
          this.snackBar.open('Opportunity removed.', 'Close', { duration: 3500 });
        },
        error: (err: { status: number; error?: { message?: string } }) => {
          this.deletingOppId.set(null);
          this.snackBar.open(err.error?.message || 'Remove failed.', 'Close', { duration: 4000 });
        }
      });
  }

  restoreOpp(opp: AdminOpportunity): void {
    if (this.restoringOppId() === opp._id) return;
    this.restoringOppId.set(opp._id);
    this.adminService.restoreOpportunity(opp._id)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: (_r: AdminOpportunityActionResponse) => {
          this.restoringOppId.set(null);
          this.opportunities.update(l => l.map(o => o._id === opp._id ? { ...o, isRemoved: false } : o));
          this.snackBar.open('Opportunity restored.', 'Close', { duration: 3000 });
        },
        error: (err: { status: number; error?: { message?: string } }) => {
          this.restoringOppId.set(null);
          this.snackBar.open(err.error?.message || 'Restore failed.', 'Close', { duration: 4000 });
        }
      });
  }

  prevOppPage(): void { if (this.hasPrevOpps()) this.loadOpportunities(this.oppPage() - 1); }
  nextOppPage(): void { if (this.hasNextOpps()) this.loadOpportunities(this.oppPage() + 1); }

  // ── Admin Pickup Management ────────────────────────────────────────────

  loadAdminPickups(page = this.pickupsPage()): void {
    this.loadingPickups.set(true);
    this.pickupsError.set('');
    this.adminService.getAllPickups({ page, limit: 15, status: this.pickupsStatusFilter() })
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: (res: AdminPickupListResponse) => {
          // Backend: data = { pickups: [...], page, limit, total, totalPages } (flat pagination)
          const d = res.data as AdminPickupListData;
          this.adminPickups.set(d.pickups ?? []);
          this.pickupsPage.set(d.page ?? 1);
          this.pickupsTotal.set(d.total ?? 0);
          this.pickupsPages.set(d.totalPages ?? 1);
          this.loadingPickups.set(false);
        },
        error: (err: { status: number; error?: { message?: string } }) => {
          this.pickupsError.set(err.status === 429
            ? 'Rate limit reached. Wait 1 minute.' : (err.error?.message || 'Failed to load.'));
          this.loadingPickups.set(false);
        }
      });
  }

  onPickupFilterChange(): void { this.pickupsPage.set(1); this.loadAdminPickups(1); }

  // ── Admin Pickup Completion & NGO Attribution Form ───────────────────────

  private _initCompleteForm(): void {
    this.completeForm = this.fb.group({
      entries: this.fb.array([this._newEntryGroup()])
    });
  }

  private _newEntryGroup(category: string = '', weight: number | null = null): FormGroup {
    return this.fb.group({
      category: [category, Validators.required],
      weight:   [weight, [Validators.required, Validators.min(0.001)]]
    });
  }

  get wasteEntries(): FormArray {
    return this.completeForm.get('entries') as FormArray;
  }

  addWasteEntry(): void {
    this.wasteEntries.push(this._newEntryGroup());
  }

  removeWasteEntry(index: number): void {
    if (this.wasteEntries.length > 1) {
      this.wasteEntries.removeAt(index);
    }
  }

  entryError(index: number, controlName: string): string {
    const ctrl = this.wasteEntries.at(index)?.get(controlName);
    if (!ctrl || !ctrl.touched || ctrl.valid) return '';
    if (controlName === 'category') return 'Category is required.';
    if (ctrl.hasError('required')) return 'Weight is required.';
    if (ctrl.hasError('min')) return 'Weight must be greater than 0 kg.';
    return 'Invalid weight.';
  }

  onNgoSearchInput(query: string): void {
    this.ngoSearchQuery.set(query);
    this.ngoSearchSubject.next(query);
  }

  private _fetchNgos(search: string = ''): void {
    this.loadingNgos.set(true);
    this.adminService.getUsers({
      role: 'ngo',
      search: search.trim() || undefined,
      limit: 20
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: AdminUserListResponse) => {
        this.availableNgos.set(res.data.users ?? []);
        this.loadingNgos.set(false);
      },
      error: () => {
        this.loadingNgos.set(false);
      }
    });
  }

  selectNgo(ngo: AdminUser): void {
    this.selectedNgo.set(ngo);
  }

  clearSelectedNgo(): void {
    this.selectedNgo.set(null);
  }

  openForceStatusModal(pickup: AdminPickupItem): void {
    this.forceStatusTarget.set(pickup);
    this.forceStatusValue.set('Completed');
    this.ngoSearchQuery.set('');
    this.selectedNgo.set(null);

    // If pickup already has agent_id, pre-select it
    if (pickup.agent_id) {
      if (typeof pickup.agent_id === 'object' && pickup.agent_id !== null && 'name' in pickup.agent_id) {
        this.selectedNgo.set(pickup.agent_id as any);
      } else if (typeof pickup.agent_id === 'string') {
        this.adminService.getUsers({ role: 'ngo', limit: 50 }).pipe(takeUntil(this.destroy$)).subscribe({
          next: (res) => {
            const found = res.data.users?.find(u => u._id === pickup.agent_id);
            if (found) this.selectedNgo.set(found);
          }
        });
      }
    }

    // Pre-fill waste entries from pickup.wasteCollected or pickup.wasteTypes if present, otherwise one blank row
    let initialRows = [this._newEntryGroup()];
    if (pickup.wasteCollected && pickup.wasteCollected.length > 0) {
      initialRows = pickup.wasteCollected.map(w => this._newEntryGroup(w.category, w.weight));
    } else if (pickup.wasteTypes && pickup.wasteTypes.length > 0) {
      initialRows = pickup.wasteTypes.map(type => this._newEntryGroup(type, null));
    }

    this.completeForm = this.fb.group({
      entries: this.fb.array(initialRows)
    });

    this._fetchNgos('');
  }

  closeForceStatusModal(): void {
    this.forceStatusTarget.set(null);
    this.forcingStatusId.set(null);
  }

  confirmForceStatus(): void {
    const pickup = this.forceStatusTarget();
    if (!pickup) return;
    const status = this.forceStatusValue();

    if (status === 'Completed') {
      if (this.completeForm.invalid) {
        this.completeForm.markAllAsTouched();
        return;
      }

      const wasteCollected: WasteCollectedItem[] = this.wasteEntries.controls.map(ctrl => ({
        category: ctrl.get('category')!.value as string,
        weight:   parseFloat(ctrl.get('weight')!.value)
      }));

      const agentId = this.selectedNgo()?._id ||
        (typeof pickup.agent_id === 'object' && pickup.agent_id !== null ? (pickup.agent_id as any)._id : pickup.agent_id) ||
        undefined;

      this.forcingStatusId.set(pickup._id);
      this.adminService.adminForcePickupStatus(pickup._id, 'Completed', {
        agent_id: agentId,
        wasteCollected
      }).pipe(takeUntil(this.destroy$)).subscribe({
        next: (_r: AdminPickupActionResponse) => {
          this.forcingStatusId.set(null);
          this.closeForceStatusModal();
          const attributedAgent = this.selectedNgo()
            ? { _id: this.selectedNgo()!._id, name: this.selectedNgo()!.name, email: this.selectedNgo()!.email }
            : (agentId || pickup.agent_id);
          this.adminPickups.update(l => l.map(p => p._id === pickup._id ? { ...p, status: 'Completed' as const, agent_id: attributedAgent } : p));
          this.snackBar.open('Pickup marked as Completed and attributed to NGO. Waste stats recorded.', 'Close', { duration: 4000 });
          // Background stats refresh
          this.loadStats();
          this.loadWasteAnalytics();
          this.loadLeaderboard();
        },
        error: (err: { status: number; error?: { message?: string; errors?: any[] } }) => {
          this.forcingStatusId.set(null);
          const backendErrors = err.error?.errors;
          if (backendErrors && Array.isArray(backendErrors)) {
            const msgs = backendErrors.map(e => Object.values(e)[0]).join(' · ');
            this.snackBar.open(msgs, 'Close', { duration: 6000 });
          } else {
            this.snackBar.open(err.error?.message || 'Status update failed.', 'Close', { duration: 4000 });
          }
        }
      });
    } else {
      // Cancelled
      this.forcingStatusId.set(pickup._id);
      this.adminService.adminForcePickupStatus(pickup._id, 'Cancelled')
        .pipe(takeUntil(this.destroy$)).subscribe({
          next: (_r: AdminPickupActionResponse) => {
            this.forcingStatusId.set(null);
            this.closeForceStatusModal();
            this.adminPickups.update(l => l.map(p => p._id === pickup._id ? { ...p, status: 'Cancelled', agent_id: null } : p));
            this.snackBar.open('Pickup marked as Cancelled.', 'Close', { duration: 3500 });
            this.loadStats();
          },
          error: (err: { status: number; error?: { message?: string } }) => {
            this.forcingStatusId.set(null);
            this.snackBar.open(err.error?.message || 'Status update failed.', 'Close', { duration: 4000 });
          }
        });
    }
  }

  // ── Delete Pickup Modal ──────────────────────────────────────────────────

  openDeletePickupModal(pickup: AdminPickupItem): void {
    this.deletePickupTarget.set(pickup);
  }

  closeDeletePickupModal(): void {
    this.deletePickupTarget.set(null);
    this.deletingPickupId.set(null);
  }

  confirmDeletePickup(): void {
    const pickup = this.deletePickupTarget();
    if (!pickup || this.deletingPickupId() === pickup._id) return;
    this.deletingPickupId.set(pickup._id);
    this.adminService.adminDeletePickup(pickup._id)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: (_r: AdminPickupActionResponse) => {
          this.deletingPickupId.set(null);
          this.closeDeletePickupModal();
          this.adminPickups.update(l => l.filter(p => p._id !== pickup._id));
          this.snackBar.open('Pickup permanently deleted.', 'Close', { duration: 3500 });
          this.loadStats();
        },
        error: (err: { status: number; error?: { message?: string } }) => {
          this.deletingPickupId.set(null);
          this.snackBar.open(err.error?.message || 'Delete failed.', 'Close', { duration: 4000 });
        }
      });
  }

  prevPickupsPage(): void { if (this.hasPrevPickups()) this.loadAdminPickups(this.pickupsPage() - 1); }
  nextPickupsPage(): void { if (this.hasNextPickups()) this.loadAdminPickups(this.pickupsPage() + 1); }

  // ── User Role Change ───────────────────────────────────────────────────

  openRoleModal(user: AdminUser): void {
    this.roleChangeTarget.set(user); this.roleChangeValue.set(user.role as UserRole);
  }
  closeRoleModal(): void { this.roleChangeTarget.set(null); }

  confirmRoleChange(): void {
    const user = this.roleChangeTarget();
    const role = this.roleChangeValue();
    if (!user) return;
    if (user.role === role) { this.closeRoleModal(); return; }
    this.changingRoleId.set(user._id);
    this.closeRoleModal();
    this.adminService.updateUserRole(user._id, role)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: (_r: AdminRoleChangeResponse) => {
          this.changingRoleId.set(null);
          this.users.update(l => l.map(u => u._id === user._id ? { ...u, role } : u));
          this.snackBar.open(`${user.name}'s role → ${role}.`, 'Close', { duration: 3500 });
        },
        error: (err: { status: number; error?: { message?: string } }) => {
          this.changingRoleId.set(null);
          this.snackBar.open(err.status === 403
            ? 'Cannot change your own role.'
            : (err.error?.message || 'Role change failed.'), 'Close', { duration: 4000 });
        }
      });
  }

  readonly userRoles: UserRole[] = ['volunteer', 'ngo', 'admin'];
}
