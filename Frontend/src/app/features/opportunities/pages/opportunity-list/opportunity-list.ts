// ============================================
// OPPORTUNITY LIST PAGE — WasteZero M2
// Route: /opportunities
// Angular 21 zoneless — all mutable state as signals
// ============================================

import {
  Component, inject, OnInit, OnDestroy,
  signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

import { AuthService } from '../../../../core/services/auth.service';
import { OpportunityService } from '../../../../core/services/opportunity.service';
import { OpportunityStore } from '../../../../core/services/opportunity-store.service';
import { Opportunity, PaginationMeta, NgoRef } from '../../../../core/models/opportunity.model';
import { OpportunityCard } from '../../components/opportunity-card/opportunity-card';
import { DeleteConfirmDialog } from '../../components/delete-confirm-dialog/delete-confirm-dialog';

@Component({
  selector: 'app-opportunity-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, OpportunityCard, DeleteConfirmDialog],
  templateUrl: './opportunity-list.html',
  styleUrl: './opportunity-list.css'
})
export class OpportunityList implements OnInit, OnDestroy {

  private authService        = inject(AuthService);
  private opportunityService = inject(OpportunityService);
  private opportunityStore   = inject(OpportunityStore);
  private router             = inject(Router);
  private destroy$           = new Subject<void>();

  // ── Signals ────────────────────────────────────────────────────────
  opportunities   = signal<Opportunity[]>([]);
  loading         = signal(true);
  error           = signal('');
  searchQuery     = signal('');
  selectedStatus  = signal('');
  selectedLocation = signal('');
  selectedSkill   = signal('');
  pagination      = signal<PaginationMeta>({ page: 1, limit: 9, total: 0, totalPages: 0 });

  // Dialog signals
  showDeleteDialog    = signal(false);
  isDeleting          = signal(false);
  selectedOpportunity = signal<Opportunity | null>(null);

  // ── Computed signals ───────────────────────────────────────────────

  readonly isNgoOrAdmin = computed(() => {
    const role = this.authService.currentUser()?.role;
    return role === 'ngo' || role === 'admin';
  });

  readonly isEmpty = computed(() =>
    !this.loading() && !this.error() && this.opportunities().length === 0
  );

  readonly pages = computed(() =>
    Array.from({ length: this.pagination().totalPages }, (_, i) => i + 1)
  );

  readonly hasActiveFilters = computed(() =>
    !!(this.searchQuery() || this.selectedStatus() || this.selectedLocation() || this.selectedSkill())
  );

  // Search subject for debounce (side-effect only, not state)
  private searchSubject = new Subject<string>();

  // ── Lifecycle ──────────────────────────────────────────────────────

  ngOnInit(): void {
    this.setupSearchDebounce();
    this.loadOpportunities();

    // Debounce the store-refresh subscription to prevent double-load on
    // initial page load: ngOnInit calls loadOpportunities() first, then
    // refresh$ emits — without debounce this fires two simultaneous requests.
    this.opportunityStore.refresh$
      .pipe(debounceTime(50), takeUntil(this.destroy$))
      .subscribe(() => this.loadOpportunities(this.pagination().page));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Permissions ────────────────────────────────────────────────────

  canEdit(opp: Opportunity): boolean {
    const user = this.authService.currentUser();
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role !== 'ngo') return false;
    // Backend login response sets 'id' (not '_id'). Use whichever is populated.
    const userId = user.id ?? user._id;
    if (!userId) return false;
    // IMPORTANT: typeof null === 'object' in JavaScript.
    // When ngo_id references a deleted user, Mongoose populate() returns null.
    // Without the explicit null guard the object-path branch executes and
    // null._id throws TypeError: Cannot read properties of null (reading '_id').
    // A null ngo_id means ownership cannot be verified → deny edit access.
    const ngoId = opp.ngo_id !== null && typeof opp.ngo_id === 'object'
      ? (opp.ngo_id as NgoRef)._id
      : opp.ngo_id as string | undefined;
    if (!ngoId) return false;
    return ngoId === userId;
  }

  // ── Load (paginated, no filter) ────────────────────────────────────

  loadOpportunities(page = 1): void {
    this.loading.set(true);
    this.error.set('');

    this.opportunityService.getAllOpportunities(page, this.pagination().limit)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.opportunities.set(res.data.opportunities);
          this.pagination.set(res.data.pagination);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Failed to load opportunities.');
          this.loading.set(false);
        }
      });
  }

  // ── Search ─────────────────────────────────────────────────────────

  private setupSearchDebounce(): void {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      if (query.trim()) {
        this.runSearch(query.trim());
      } else {
        this.applyFilters();
      }
    });
  }

  onSearchInput(query: string): void {
    this.searchQuery.set(query);
    this.searchSubject.next(query);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.triggerSearch();
    }
  }

  triggerSearch(): void {
    const q = this.searchQuery().trim();
    if (q) {
      this.runSearch(q);
    } else {
      this.applyFilters();
    }
  }

  private runSearch(q: string): void {
    this.loading.set(true);
    this.error.set('');

    this.opportunityService.searchOpportunities(q)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.opportunities.set(res.data);
          this.pagination.set({ page: 1, limit: 9, total: res.data.length, totalPages: 1 });
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Search failed.');
          this.loading.set(false);
        }
      });
  }

  // ── Filter ─────────────────────────────────────────────────────────

  onStatusChange(status: string): void {
    this.selectedStatus.set(status);
    this.searchQuery.set('');
    this.applyFilters();
  }

  onLocationInput(location: string): void {
    this.selectedLocation.set(location);
  }

  onLocationSearch(): void {
    this.searchQuery.set('');
    this.applyFilters();
  }

  onSkillInput(skill: string): void {
    this.selectedSkill.set(skill);
  }

  onSkillSearch(): void {
    this.searchQuery.set('');
    this.applyFilters();
  }

  onFilterKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.applyFilters();
    }
  }

  applyFilters(): void {
    const status   = this.selectedStatus();
    const location = this.selectedLocation().trim();
    const skill    = this.selectedSkill().trim();

    if (!status && !location && !skill) {
      this.loadOpportunities();
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.opportunityService.filterOpportunities({ status, location, skill })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.opportunities.set(res.data);
          this.pagination.set({ page: 1, limit: 9, total: res.data.length, totalPages: 1 });
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Filter failed.');
          this.loading.set(false);
        }
      });
  }

  // ── Pagination ─────────────────────────────────────────────────────

  goToPage(page: number): void {
    const p = this.pagination();
    if (page < 1 || page > p.totalPages) return;
    this.loadOpportunities(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
          this.loadOpportunities(this.pagination().page);
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

  // ── Helpers ────────────────────────────────────────────────────────

  clearSearch(): void {
    this.searchQuery.set('');
    this.selectedStatus.set('');
    this.selectedLocation.set('');
    this.selectedSkill.set('');
    this.loadOpportunities();
  }

}
