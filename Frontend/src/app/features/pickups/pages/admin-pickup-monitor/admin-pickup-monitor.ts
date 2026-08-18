// ============================================
// ADMIN PICKUP MONITOR PAGE — WasteZero Milestone 3
// Route: /pickups/monitor (Admin only)
// Read-only view of ALL pickups with filter/search
// ============================================

import {
  Component, inject, OnInit, OnDestroy,
  signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

import { PickupService } from '../../../../core/services/pickup.service';
import { Pickup, PickupStatus } from '../../../../core/models/pickup.model';

@Component({
  selector: 'app-admin-pickup-monitor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-pickup-monitor.html',
  styleUrl: './admin-pickup-monitor.css',
})
export class AdminPickupMonitor implements OnInit, OnDestroy {

  private pickupService = inject(PickupService);
  private destroy$      = new Subject<void>();

  // ── State ────────────────────────────────────────────────────────────
  allPickups    = signal<Pickup[]>([]);
  loading       = signal(false);
  error         = signal('');
  statusFilter  = signal<'all' | PickupStatus>('all');
  searchQuery   = signal('');

  // ── Computed ─────────────────────────────────────────────────────────
  readonly pendingCount   = computed(() => this.allPickups().filter(p => p.status === 'Pending').length);
  readonly assignedCount  = computed(() => this.allPickups().filter(p => p.status === 'Assigned').length);
  readonly completedCount = computed(() => this.allPickups().filter(p => p.status === 'Completed').length);
  readonly cancelledCount = computed(() => this.allPickups().filter(p => p.status === 'Cancelled').length);
  readonly missedCount    = computed(() => this.allPickups().filter(p => p.status === 'Missed').length);

  readonly filtered = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const status = this.statusFilter();

    return this.allPickups().filter(p => {
      const statusMatch = status === 'all' || p.status === status;
      if (!q) return statusMatch;
      const city      = p.address.city.toLowerCase();
      const vol       = this.getVolunteerName(p).toLowerCase();
      const ngo       = this.getNgoName(p).toLowerCase();
      const wasteStr  = p.wasteTypes.join(' ').toLowerCase();
      return statusMatch && (city.includes(q) || vol.includes(q) || ngo.includes(q) || wasteStr.includes(q));
    });
  });

  readonly isEmpty = computed(() => !this.loading() && !this.error() && this.filtered().length === 0);

  ngOnInit(): void {
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAll(): void {
    this.loading.set(true);
    this.error.set('');

    this.pickupService.getAllPickups()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          // getAllPickups returns PickupListResponse: { data: { pickups, pagination } }
          this.allPickups.set(res.data?.pickups ?? []);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Failed to load pickups.');
          this.loading.set(false);
        }
      });
  }

  onStatusFilter(status: 'all' | PickupStatus): void {
    this.statusFilter.set(status);
  }

  onSearch(q: string): void {
    this.searchQuery.set(q);
  }

  clearFilters(): void {
    this.statusFilter.set('all');
    this.searchQuery.set('');
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  getVolunteerName(pickup: Pickup): string {
    const v = pickup.user_id;
    if (typeof v === 'object' && v !== null && 'name' in v) return (v as any).name;
    return 'Volunteer';
  }

  getNgoName(pickup: Pickup): string {
    const n = pickup.agent_id;
    if (typeof n === 'object' && n !== null && 'name' in n) return (n as any).name;
    if (n === null || n === undefined) return 'Unassigned';
    return 'NGO';
  }

  statusClass(status: string): string {
    const map: Record<string, string> = {
      'Pending':   'badge-pending',
      'Assigned':  'badge-assigned',
      'Completed': 'badge-completed',
      'Cancelled': 'badge-cancelled',
      'Missed':    'badge-missed',
    };
    return map[status] ?? '';
  }

  statusIcon(status: string): string {
    const map: Record<string, string> = {
      'Pending':   'hourglass_empty',
      'Assigned':  'local_shipping',
      'Completed': 'check_circle',
      'Cancelled': 'cancel',
      'Missed':    'alarm_off',
    };
    return map[status] ?? 'info';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }
}
