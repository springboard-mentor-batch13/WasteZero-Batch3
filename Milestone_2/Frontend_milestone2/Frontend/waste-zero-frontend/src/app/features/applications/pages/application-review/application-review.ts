// ============================================
// APPLICATION REVIEW PAGE — WasteZero M2
// Route: /applications/review (NGO/Admin only)
// API:   GET /api/applications (scoped by backend to NGO's opportunities)
//        PUT /api/applications/:id (update status: accepted | rejected)
// Angular 21 zoneless — all mutable state as signals
// ============================================

import {
  Component, inject, OnInit, OnDestroy,
  signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, takeUntil } from 'rxjs';

import { AuthService } from '../../../../core/services/auth.service';
import { ApplicationService } from '../../../../core/services/application.service';
import { Application } from '../../../../core/models/application.model';
import { Opportunity } from '../../../../core/models/opportunity.model';

@Component({
  selector: 'app-application-review',
  standalone: true,
  imports: [CommonModule, RouterLink, MatSnackBarModule],
  templateUrl: './application-review.html',
  styleUrl: './application-review.css'
})
export class ApplicationReview implements OnInit, OnDestroy {

  private authService        = inject(AuthService);
  private applicationService = inject(ApplicationService);
  private snackBar           = inject(MatSnackBar);
  private destroy$           = new Subject<void>();

  // ── State Signals ──────────────────────────────────────────────────
  applications     = signal<Application[]>([]);
  loading          = signal(true);
  error            = signal('');
  statusFilter     = signal<'all' | 'pending' | 'accepted' | 'rejected'>('all');
  searchQuery      = signal('');
  updatingId       = signal<string | null>(null);

  // Pagination
  page             = signal(1);
  limit            = signal(20);
  totalCount       = signal(0);

  // ── Computed Signals ───────────────────────────────────────────────

  readonly isAdmin = computed(() => this.authService.currentUser()?.role === 'admin');

  readonly filteredApplications = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.applications();
    return this.applications().filter(app => {
      const opp = this.getOpportunity(app);
      const title = opp?.title?.toLowerCase() ?? '';
      const vol   = this.getVolunteerName(app).toLowerCase();
      return title.includes(q) || vol.includes(q);
    });
  });

  readonly isEmpty = computed(() =>
    !this.loading() && !this.error() && this.filteredApplications().length === 0
  );

  readonly pendingCount = computed(() =>
    this.applications().filter(a => a.status === 'pending').length
  );

  readonly acceptedCount = computed(() =>
    this.applications().filter(a => a.status === 'accepted').length
  );

  readonly rejectedCount = computed(() =>
    this.applications().filter(a => a.status === 'rejected').length
  );

  // ── Lifecycle ──────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadApplications();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Load ───────────────────────────────────────────────────────────

  loadApplications(): void {
    this.loading.set(true);
    this.error.set('');

    const status = this.statusFilter() === 'all' ? undefined : this.statusFilter();

    // Pass status to backend for server-side filtering when set.
    // Backend automatically scopes to the NGO's own opportunities.
    this.applicationService.getApplications(undefined, this.page(), this.limit(), status)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          // Filter out applications whose opportunity was deleted (opportunity_id === null).
          // These produce empty/broken rows since no opportunity data exists to display.
          const valid = res.data.applications.filter(a => a.opportunity_id != null);
          this.applications.set(valid);
          this.totalCount.set(valid.length);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Failed to load applications.');
          this.loading.set(false);
        }
      });
  }

  onStatusFilterChange(status: string): void {
    this.statusFilter.set(status as any);
    this.page.set(1);
    this.loadApplications();
  }

  // ── Accept / Reject ────────────────────────────────────────────────

  accept(app: Application): void {
    if (this.updatingId()) return;
    if (app.status !== 'pending') {
      this.showSnack('Only pending applications can be accepted.');
      return;
    }
    this.updateStatus(app._id, 'accepted');
  }

  reject(app: Application): void {
    if (this.updatingId()) return;
    if (app.status !== 'pending') {
      this.showSnack('Only pending applications can be rejected.');
      return;
    }
    this.updateStatus(app._id, 'rejected');
  }

  private updateStatus(id: string, status: 'accepted' | 'rejected'): void {
    this.updatingId.set(id);

    this.applicationService.updateApplicationStatus(id, { status })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.updatingId.set(null);
          // Immediate UI update — replace the application in the list
          this.applications.update(list =>
            list.map(a => a._id === id ? { ...a, status } : a)
          );
          this.showSnack(`Application ${status} successfully.`);
        },
        error: (err) => {
          this.updatingId.set(null);
          this.showSnack(err.error?.message || `Failed to ${status} application.`);
        }
      });
  }

  // ── Search ─────────────────────────────────────────────────────────

  onSearchInput(query: string): void {
    this.searchQuery.set(query);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  // ── Helpers ────────────────────────────────────────────────────────

  getOpportunity(app: Application): Opportunity | null {
    return typeof app.opportunity_id === 'object'
      ? app.opportunity_id as Opportunity
      : null;
  }

  getOpportunityTitle(app: Application): string {
    return this.getOpportunity(app)?.title ?? 'Opportunity';
  }

  getOpportunityId(app: Application): string {
    return typeof app.opportunity_id === 'string'
      ? app.opportunity_id
      : (app.opportunity_id as Opportunity)._id;
  }

  getVolunteerName(app: Application): string {
    if (typeof app.volunteer_id === 'object' && app.volunteer_id !== null) {
      return (app.volunteer_id as any).name ?? 'Unknown';
    }
    return 'Unknown';
  }

  getVolunteerEmail(app: Application): string {
    if (typeof app.volunteer_id === 'object' && app.volunteer_id !== null) {
      return (app.volunteer_id as any).email ?? '';
    }
    return '';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  statusClass(status: string): string {
    const map: Record<string, string> = {
      'pending':  'badge-pending',
      'accepted': 'badge-accepted',
      'rejected': 'badge-rejected'
    };
    return map[status] ?? 'badge-pending';
  }

  statusIcon(status: string): string {
    const map: Record<string, string> = {
      'pending':  'hourglass_empty',
      'accepted': 'check_circle',
      'rejected': 'cancel'
    };
    return map[status] ?? 'hourglass_empty';
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      'pending':  'Pending',
      'accepted': 'Accepted',
      'rejected': 'Rejected'
    };
    return map[status] ?? status;
  }

  private showSnack(msg: string): void {
    this.snackBar.open(msg, 'Close', {
      duration: 3500,
      horizontalPosition: 'right',
      verticalPosition: 'top'
    });
  }

}
