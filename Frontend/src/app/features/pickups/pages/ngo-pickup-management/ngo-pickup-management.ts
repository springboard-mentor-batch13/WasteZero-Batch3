// ============================================
// NGO PICKUP MANAGEMENT PAGE — WasteZero Milestone 3
// Route: /pickups/manage (NGO only)
// Tabs: [Available Pickups] [My Assigned Pickups]
// ============================================

import {
  Component, inject, OnInit, OnDestroy,
  signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { PickupService } from '../../../../core/services/pickup.service';
import { Pickup, PickupStatus } from '../../../../core/models/pickup.model';

@Component({
  selector: 'app-ngo-pickup-management',
  standalone: true,
  imports: [CommonModule, MatSnackBarModule],
  templateUrl: './ngo-pickup-management.html',
  styleUrl: './ngo-pickup-management.css',
})
export class NgoPickupManagement implements OnInit, OnDestroy {

  private pickupService = inject(PickupService);
  private snackBar      = inject(MatSnackBar);
  private router        = inject(Router);
  private destroy$      = new Subject<void>();

  // ── Tab ─────────────────────────────────────────────────────────────
  activeTab = signal<'available' | 'assigned'>('available');

  // ── Available pickups (Pending, matched to this NGO's city+wasteTypes) ──
  available        = signal<Pickup[]>([]);
  loadingAvailable = signal(false);
  availableError   = signal('');

  // ── Assigned pickups (this NGO has claimed) ───────────────────────────
  assigned         = signal<Pickup[]>([]);
  loadingAssigned  = signal(false);
  assignedError    = signal('');

  // ── In-flight status update ───────────────────────────────────────────
  updatingId = signal<string | null>(null);

  // ── Computed ─────────────────────────────────────────────────────────
  readonly assignedCount  = computed(() => this.assigned().length);
  readonly completedCount = computed(() => this.assigned().filter(p => p.status === 'Completed').length);

  ngOnInit(): void {
    this.loadAvailable();
    this.loadAssigned();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setTab(tab: 'available' | 'assigned'): void {
    this.activeTab.set(tab);
    if (tab === 'available') this.loadAvailable();
    else this.loadAssigned();
  }

  // ── Load Available ───────────────────────────────────────────────────

  loadAvailable(): void {
    this.loadingAvailable.set(true);
    this.availableError.set('');

    this.pickupService.getAvailablePickups()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.available.set(res.data?.pickups ?? []);
          this.loadingAvailable.set(false);
        },
        error: (err) => {
          this.availableError.set(err.error?.message || 'Failed to load available pickups.');
          this.loadingAvailable.set(false);
        }
      });
  }

  // ── Load Assigned ─────────────────────────────────────────────────────

  loadAssigned(): void {
    this.loadingAssigned.set(true);
    this.assignedError.set('');

    this.pickupService.getAssignedPickups()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.assigned.set(res.data?.pickups ?? []);
          this.loadingAssigned.set(false);
        },
        error: (err) => {
          this.assignedError.set(err.error?.message || 'Failed to load assigned pickups.');
          this.loadingAssigned.set(false);
        }
      });
  }

  // ── Status Update ─────────────────────────────────────────────────────

  updateStatus(pickup: Pickup, newStatus: 'Assigned' | 'Completed' | 'Cancelled'): void {
    if (this.updatingId() === pickup._id) return;
    this.updatingId.set(pickup._id);

    this.pickupService.updatePickupStatus(pickup._id, newStatus)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.updatingId.set(null);

          if (newStatus === 'Assigned') {
            // Move from available to assigned list
            this.available.update(list => list.filter(p => p._id !== pickup._id));
            this.assigned.update(list => [res.data, ...list]);
            this.snackBar.open('Pickup accepted — you are now assigned!', 'Close', { duration: 3000 });
          } else if (newStatus === 'Completed') {
            this.assigned.update(list =>
              list.map(p => p._id === pickup._id ? { ...p, status: 'Completed' } : p)
            );
            this.snackBar.open('Pickup marked as completed.', 'Close', { duration: 3000 });
          } else if (newStatus === 'Cancelled') {
            // Per spec: reject → navigate to Pickup Management (refresh)
            this.assigned.update(list => list.filter(p => p._id !== pickup._id));
            this.snackBar.open('Pickup rejected.', 'Close', { duration: 3000 });
            this.router.navigate(['/pickups/manage']);
          }
        },
        error: (err) => {
          this.updatingId.set(null);
          this.snackBar.open(err.error?.message || 'Failed to update status.', 'Close', { duration: 3000 });
        }
      });
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  getVolunteerName(pickup: Pickup): string {
    const v = pickup.user_id;
    if (typeof v === 'object' && v !== null && 'name' in v) return (v as any).name;
    return 'Volunteer';
  }


  statusClass(status: string): string {
    const map: Record<string, string> = {
      'Pending':   'status-pending',
      'Assigned':  'status-assigned',
      'Completed': 'status-completed',
      'Cancelled': 'status-cancelled',
    };
    return map[status] ?? '';
  }

  statusIcon(status: string): string {
    const map: Record<string, string> = {
      'Pending':   'hourglass_empty',
      'Assigned':  'local_shipping',
      'Completed': 'check_circle',
      'Cancelled': 'cancel',
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
