// ============================================
// MY APPLICATIONS PAGE — WasteZero M2
// Route: /applications/my-applications (Volunteer only)
// API: GET /api/applications/my-applications
//      DELETE /api/applications/:id (withdraw)
// Angular 21 zoneless — all mutable state as signals
// ============================================

import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { AuthService } from '../../../../core/services/auth.service';
import { ApplicationService } from '../../../../core/services/application.service';
import { Application } from '../../../../core/models/application.model';
import { Opportunity } from '../../../../core/models/opportunity.model';

@Component({
  selector: 'app-my-applications',
  standalone: true,
  imports: [CommonModule, RouterLink, MatSnackBarModule],
  templateUrl: './my-applications.html',
  styleUrl: './my-applications.css'
})
export class MyApplications implements OnInit {

  private authService        = inject(AuthService);
  private applicationService = inject(ApplicationService);
  private snackBar           = inject(MatSnackBar);
  private router             = inject(Router);

  // ── Signals — all mutable state must be signals in zoneless mode ────
  // With provideZonelessChangeDetection(), Angular only schedules CD when
  // a signal changes. Plain class properties are never detected. Every
  // piece of state that drives the template MUST be a signal.
  applications  = signal<Application[]>([]);
  loading       = signal(false);
  error         = signal('');
  withdrawingId = signal<string | null>(null);

  // ── Computed signals ───────────────────────────────────────────────
  readonly isEmpty = computed(() =>
    !this.loading() && !this.error() && this.applications().length === 0
  );

  ngOnInit(): void {
    const role = this.authService.getCurrentUser()?.role;
    if (role !== 'volunteer') {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.loadMyApplications();
  }

  loadMyApplications(): void {
    this.loading.set(true);
    this.error.set('');

    this.applicationService.getMyApplications().subscribe({
      next: (res) => {
        // Backend returns paginated shape: { data: { applications: [...], page, limit, total } }
        // Filter out applications whose opportunity was deleted (opportunity_id === null).
        const list = res.data.applications ?? [];
        const valid = list.filter(a => a.opportunity_id != null);
        this.applications.set(valid);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load your applications.');
        this.loading.set(false);
      }
    });
  }

  withdraw(id: string): void {
    if (this.withdrawingId()) return;
    this.withdrawingId.set(id);

    this.applicationService.withdrawApplication(id).subscribe({
      next: () => {
        this.withdrawingId.set(null);
        // Immediate UI update — remove from list without reload
        this.applications.update(list => list.filter(a => a._id !== id));
        this.showSnack('Application withdrawn successfully.');
      },
      error: (err) => {
        this.withdrawingId.set(null);
        this.showSnack(err.error?.message || 'Failed to withdraw application.');
      }
    });
  }

  // ── Derived Data Helpers ───────────────────────────────────────────

  getOpportunity(app: Application): Opportunity | null {
    return typeof app.opportunity_id === 'object'
      ? app.opportunity_id as Opportunity
      : null;
  }

  getOpportunityId(app: Application): string {
    return typeof app.opportunity_id === 'string'
      ? app.opportunity_id
      : (app.opportunity_id as Opportunity)._id;
  }

  getOpportunityTitle(app: Application): string {
    return this.getOpportunity(app)?.title ?? 'Opportunity';
  }

  getOpportunityLocation(app: Application): string {
    return this.getOpportunity(app)?.location ?? '—';
  }

  statusClass(status: string): string {
    const map: Record<string, string> = {
      'pending':  'status-pending',
      'accepted': 'status-accepted',
      'rejected': 'status-rejected'
    };
    return map[status] ?? 'status-pending';
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      'pending':  'Pending',
      'accepted': 'Accepted',
      'rejected': 'Rejected'
    };
    return map[status] ?? status;
  }

  statusIcon(status: string): string {
    const map: Record<string, string> = {
      'pending':  'hourglass_empty',
      'accepted': 'check_circle',
      'rejected': 'cancel'
    };
    return map[status] ?? 'hourglass_empty';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  countByStatus(status: string): number {
    return this.applications().filter(a => a.status === status).length;
  }

  private showSnack(msg: string): void {
    this.snackBar.open(msg, 'Close', {
      duration: 3000,
      horizontalPosition: 'right',
      verticalPosition: 'top'
    });
  }

}
