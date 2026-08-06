// ============================================
// MY OPPORTUNITIES PAGE — WasteZero M2
// Route: /opportunities/my-opportunities (NGO/Admin only)
// Angular 21 zoneless — all mutable state as signals
// ============================================

import {
  Component, inject, OnInit, OnDestroy,
  signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import { AuthService } from '../../../../core/services/auth.service';
import { OpportunityService } from '../../../../core/services/opportunity.service';
import { OpportunityStore } from '../../../../core/services/opportunity-store.service';
import { Opportunity, NgoRef } from '../../../../core/models/opportunity.model';
import { OpportunityCard } from '../../components/opportunity-card/opportunity-card';
import { DeleteConfirmDialog } from '../../components/delete-confirm-dialog/delete-confirm-dialog';

@Component({
  selector: 'app-my-opportunities',
  standalone: true,
  imports: [CommonModule, RouterLink, OpportunityCard, DeleteConfirmDialog],
  templateUrl: './my-opportunities.html',
  styleUrl: './my-opportunities.css'
})
export class MyOpportunities implements OnInit, OnDestroy {

  private authService      = inject(AuthService);
  private opportunityService = inject(OpportunityService);
  private opportunityStore = inject(OpportunityStore);
  private router           = inject(Router);
  private destroy$         = new Subject<void>();

  // ── Signals ────────────────────────────────────────────────────────
  opportunities       = signal<Opportunity[]>([]);
  loading             = signal(true);
  error               = signal('');
  showDeleteDialog    = signal(false);
  isDeleting          = signal(false);
  selectedOpportunity = signal<Opportunity | null>(null);

  // ── Computed signals ───────────────────────────────────────────────

  readonly isEmpty = computed(() =>
    !this.loading() && !this.error() && this.opportunities().length === 0
  );

  // ── Lifecycle ──────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadMyOpportunities();

    // Auto-refresh when any CRUD completes elsewhere (e.g. after delete from detail page)
    this.opportunityStore.refresh$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadMyOpportunities());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Permission check ───────────────────────────────────────────────

  /**
   * Admin can always edit/delete.
   * NGO can edit/delete only their own.
   * This page is guarded to NGO/Admin only, but we still apply
   * per-card ownership for correct NGO scoping.
   */
  canEdit(opp: Opportunity): boolean {
    const user = this.authService.currentUser();
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role !== 'ngo') return false;
    // Backend login response sets 'id' (not '_id'). Use whichever is populated.
    const userId = user.id ?? user._id;
    if (!userId) return false;
    const ngoId = typeof opp.ngo_id === 'object'
      ? (opp.ngo_id as NgoRef)._id
      : opp.ngo_id;
    return ngoId === userId;
  }

  // ── Load ───────────────────────────────────────────────────────────

  loadMyOpportunities(): void {
    this.loading.set(true);
    this.error.set('');

    this.opportunityService.getMyOpportunities()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.opportunities.set(res.data);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Failed to load your opportunities.');
          this.loading.set(false);
        }
      });
  }

  // ── Edit / Delete ──────────────────────────────────────────────────

  onEditClicked(opp: Opportunity): void {
    this.router.navigate(['/opportunities', opp._id, 'edit']);
  }

  onDeleteClicked(opp: Opportunity): void {
    this.selectedOpportunity.set(opp);
    this.showDeleteDialog.set(true);
  }

  onDeleteConfirmed(): void {
    const opp = this.selectedOpportunity();
    if (!opp) return;
    this.isDeleting.set(true);

    this.opportunityService.deleteOpportunity(opp._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isDeleting.set(false);
          this.showDeleteDialog.set(false);
          this.selectedOpportunity.set(null);
          this.opportunityStore.notifyRefresh();
          this.loadMyOpportunities();
        },
        error: () => {
          this.isDeleting.set(false);
        }
      });
  }

  onDeleteCancelled(): void {
    this.showDeleteDialog.set(false);
    this.selectedOpportunity.set(null);
  }

}
