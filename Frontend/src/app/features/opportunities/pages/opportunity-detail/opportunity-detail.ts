// ============================================
// OPPORTUNITY DETAIL PAGE — WasteZero M2
// Route: /opportunities/:id
// Angular 21 zoneless — all mutable state as signals
// ============================================

import {
  Component, inject, OnInit, OnDestroy,
  signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, takeUntil } from 'rxjs';

import { AuthService } from '../../../../core/services/auth.service';
import { OpportunityService } from '../../../../core/services/opportunity.service';
import { ApplicationService } from '../../../../core/services/application.service';
import { OpportunityStore } from '../../../../core/services/opportunity-store.service';
import { Opportunity, NgoRef } from '../../../../core/models/opportunity.model';
import { DeleteConfirmDialog } from '../../components/delete-confirm-dialog/delete-confirm-dialog';

@Component({
  selector: 'app-opportunity-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, MatSnackBarModule, DeleteConfirmDialog],
  templateUrl: './opportunity-detail.html',
  styleUrl: './opportunity-detail.css'
})
export class OpportunityDetail implements OnInit, OnDestroy {

  private authService        = inject(AuthService);
  private route              = inject(ActivatedRoute);
  private router             = inject(Router);
  private opportunityService = inject(OpportunityService);
  private applicationService = inject(ApplicationService);
  private opportunityStore   = inject(OpportunityStore);
  private snackBar           = inject(MatSnackBar);
  private destroy$           = new Subject<void>();

  // ── Signals ────────────────────────────────────────────────────────
  opportunity      = signal<Opportunity | null>(null);
  loading          = signal(true);
  error            = signal('');
  showDeleteDialog = signal(false);
  isDeleting       = signal(false);
  isApplying       = signal(false);
  hasApplied       = signal(false);

  // ── Computed signals (depend on both auth signal + opportunity signal) ─

  readonly canEdit = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return false;
    // Admin can edit/delete every opportunity
    if (user.role === 'admin') return true;
    // NGO can only edit/delete their own
    if (user.role !== 'ngo') return false;
    const opp = this.opportunity();
    if (!opp) return false;
    const ngoId = typeof opp.ngo_id === 'object'
      ? (opp.ngo_id as NgoRef)._id
      : opp.ngo_id;
    return ngoId === user._id;
  });

  readonly isVolunteer = computed(() =>
    this.authService.currentUser()?.role === 'volunteer'
  );

  readonly canApply = computed(() =>
    this.isVolunteer() &&
    this.opportunity()?.status === 'open' &&
    !this.hasApplied()
  );

  readonly formattedDate = computed(() => {
    const opp = this.opportunity();
    if (!opp?.createdAt) return '—';
    return new Date(opp.createdAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  });

  /** Formatted event date (scheduled date for the opportunity, NOT createdAt) */
  readonly formattedEventDate = computed(() => {
    const opp = this.opportunity();
    if (!opp?.date) return null;
    return new Date(opp.date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  });

  readonly statusClass = computed(() => {
    const map: Record<string, string> = {
      'open': 'status-open',
      'in-progress': 'status-in-progress',
      'closed': 'status-closed'
    };
    return map[this.opportunity()?.status ?? 'open'] ?? 'status-open';
  });

  readonly statusLabel = computed(() => {
    const map: Record<string, string> = {
      'open': 'Open',
      'in-progress': 'In Progress',
      'closed': 'Closed'
    };
    return map[this.opportunity()?.status ?? 'open'] ?? '';
  });

  readonly ngoName = computed(() => {
    const opp = this.opportunity();
    if (!opp) return '—';
    const ngo = opp.ngo_id;
    if (typeof ngo === 'object' && ngo !== null && 'name' in ngo) {
      return (ngo as NgoRef).name;
    }
    return '—';
  });

  // M3: NGO username display
  readonly ngoUsername = computed(() => {
    const opp = this.opportunity();
    if (!opp) return null;
    const ngo = opp.ngo_id;
    if (typeof ngo === 'object' && ngo !== null && 'username' in ngo) {
      return (ngo as NgoRef).username ?? null;
    }
    return null;
  });

  // M3: NGO ObjectId — needed for Contact Us navigation
  readonly ngoId = computed(() => {
    const opp = this.opportunity();
    if (!opp) return null;
    const ngo = opp.ngo_id;
    if (typeof ngo === 'object' && ngo !== null && '_id' in ngo) {
      return (ngo as NgoRef)._id;
    }
    return typeof ngo === 'string' ? ngo : null;
  });

  // Creator role from populated ngo_id
  readonly creatorRole = computed(() => {
    const opp = this.opportunity();
    if (!opp) return null;
    const ngo = opp.ngo_id;
    if (typeof ngo === 'object' && ngo !== null && 'role' in ngo) {
      return (ngo as any).role as string;
    }
    return null;
  });

  readonly isCreatorAdmin = computed(() => this.creatorRole() === 'admin');
  readonly isCreatorNgo   = computed(() => this.creatorRole() === 'ngo');

  // Contact button — visible to volunteers for opportunities created by Admin or NGO
  readonly canContactCreator = computed(() => {
    if (!this.isVolunteer() || !this.ngoId()) return false;
    return this.isCreatorAdmin() || this.isCreatorNgo();
  });

  // Backward-compatible alias
  readonly canContactNgo = this.canContactCreator;

  // ── Lifecycle ──────────────────────────────────────────────────────

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.loadOpportunity(id);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Load ───────────────────────────────────────────────────────────

  loadOpportunity(id: string): void {
    this.loading.set(true);
    this.error.set('');

    this.opportunityService.getOpportunityById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.opportunity.set(res.data);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Failed to load opportunity.');
          this.loading.set(false);
        }
      });
  }

  // ── Apply ──────────────────────────────────────────────────────────

  onApply(): void {
    const opp = this.opportunity();
    if (!opp || this.isApplying()) return;
    this.isApplying.set(true);

    this.applicationService.apply({ opportunity_id: opp._id })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isApplying.set(false);
          this.hasApplied.set(true);
          this.showSnack('Application submitted successfully!');
        },
        error: (err) => {
          this.isApplying.set(false);
          this.showSnack(err.error?.message || 'Failed to apply. Please try again.');
        }
      });
  }

  // ── Delete ─────────────────────────────────────────────────────────

  openDeleteDialog(): void  { this.showDeleteDialog.set(true); }
  closeDeleteDialog(): void { this.showDeleteDialog.set(false); }

  onDeleteConfirmed(): void {
    const opp = this.opportunity();
    if (!opp) return;
    this.isDeleting.set(true);

    this.opportunityService.deleteOpportunity(opp._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isDeleting.set(false);
          this.showDeleteDialog.set(false);
          this.showSnack('Opportunity deleted successfully.');
          this.opportunityStore.notifyRefresh();
          this.router.navigate(['/opportunities']);
        },
        error: (err) => {
          this.isDeleting.set(false);
          this.showSnack(err.error?.message || 'Failed to delete. Please try again.');
        }
      });
  }

  // Navigate to Messages with creator pre-selected (Admin or NGO)
  contactCreator(): void {
    const id = this.ngoId();
    if (!id) return;
    const role = this.isCreatorAdmin() ? 'admin' : 'ngo';
    const name = this.ngoName() || (this.isCreatorAdmin() ? 'Administrator' : 'Organization');
    const username = this.ngoUsername();
    this.router.navigate(['/messages'], {
      queryParams: {
        contactId:       id,
        contactName:     name,
        contactRole:     role,
        contactUsername: username || undefined
      }
    });
  }

  // Alias for backward compatibility
  contactNgo(): void {
    this.contactCreator();
  }

  private showSnack(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      horizontalPosition: 'right',
      verticalPosition: 'top'
    });
  }

}
