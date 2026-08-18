// ============================================
// NGO PICKUP MANAGEMENT PAGE — WasteZero Milestone 3/4
// Route: /pickups/manage (NGO only)
// Tabs: [Available Pickups] [My Assigned Pickups]
// ============================================

import {
  Component, inject, OnInit, OnDestroy,
  signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { PickupService } from '../../../../core/services/pickup.service';
import { Pickup, PickupStatus, WasteCollectedItem, WASTE_TYPES } from '../../../../core/models/pickup.model';

@Component({
  selector: 'app-ngo-pickup-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatSnackBarModule],
  templateUrl: './ngo-pickup-management.html',
  styleUrl: './ngo-pickup-management.css',
})
export class NgoPickupManagement implements OnInit, OnDestroy {

  private pickupService = inject(PickupService);
  private snackBar      = inject(MatSnackBar);
  private router        = inject(Router);
  private fb            = inject(FormBuilder);
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

  // ── In-flight status update (Assigned / Cancelled transitions) ────────
  updatingId = signal<string | null>(null);

  // ── Completion form state ─────────────────────────────────────────────
  /** ID of the pickup card currently showing the inline completion form */
  completingPickupId   = signal<string | null>(null);
  /** ID of the pickup currently being submitted (spinner state) */
  submittingCompleteId = signal<string | null>(null);

  /** Reactive form for waste collection entries */
  completeForm!: FormGroup;

  /** Allowed waste categories — sourced from the same constant as backend */
  readonly wasteTypes = WASTE_TYPES;

  // ── Computed ─────────────────────────────────────────────────────────
  readonly assignedCount  = computed(() => this.assigned().length);
  readonly completedCount = computed(() => this.assigned().filter(p => p.status === 'Completed').length);

  ngOnInit(): void {
    this._initCompleteForm();
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

  // ── Status Update (Assigned → Assigned/Cancelled) ─────────────────────
  // Note: Completed transitions are handled by the completion form below.

  updateStatus(pickup: Pickup, newStatus: 'Assigned' | 'Cancelled'): void {
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

  // ── Completion Form ───────────────────────────────────────────────────

  /** Initialize the reactive form with one default waste entry row */
  private _initCompleteForm(): void {
    this.completeForm = this.fb.group({
      entries: this.fb.array([this._newEntryGroup()])
    });
  }

  /** Create a single {category, weight} FormGroup row */
  private _newEntryGroup(): FormGroup {
    return this.fb.group({
      category: ['', Validators.required],
      weight:   [null, [Validators.required, Validators.min(0.001)]]
    });
  }

  /** Typed accessor for the FormArray */
  get wasteEntries(): FormArray {
    return this.completeForm.get('entries') as FormArray;
  }

  /** Add a new blank waste entry row */
  addWasteEntry(): void {
    this.wasteEntries.push(this._newEntryGroup());
  }

  /** Remove a waste entry row by index (minimum 1 row always kept) */
  removeWasteEntry(index: number): void {
    if (this.wasteEntries.length > 1) {
      this.wasteEntries.removeAt(index);
    }
  }

  /**
   * Open the inline completion form for a specific pickup card.
   * Resets the form to a single blank row each time.
   */
  openCompleteForm(pickup: Pickup): void {
    // Reset to a clean single-row form
    this.completeForm = this.fb.group({
      entries: this.fb.array([this._newEntryGroup()])
    });
    this.completingPickupId.set(pickup._id);
  }

  /** Close the inline completion form without submitting */
  closeCompleteForm(): void {
    this.completingPickupId.set(null);
  }

  /**
   * Submit the completion form for the given pickup.
   * Validates locally, then calls completePickup() which sends:
   *   { status: 'Completed', wasteCollected: [{category, weight}, ...] }
   */
  submitComplete(pickup: Pickup): void {
    if (this.completeForm.invalid) {
      this.completeForm.markAllAsTouched();
      return;
    }

    if (this.submittingCompleteId() === pickup._id) return;

    const wasteCollected: WasteCollectedItem[] = this.wasteEntries.controls.map(ctrl => ({
      category: ctrl.get('category')!.value as string,
      weight:   parseFloat(ctrl.get('weight')!.value),
    }));

    this.submittingCompleteId.set(pickup._id);

    this.pickupService.completePickup(pickup._id, wasteCollected)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.submittingCompleteId.set(null);
          this.completingPickupId.set(null);
          // Update the card status in the list
          this.assigned.update(list =>
            list.map(p => p._id === pickup._id ? { ...p, status: 'Completed' as PickupStatus } : p)
          );
          this.snackBar.open('Pickup marked as completed. Waste stats recorded.', 'Close', { duration: 4000 });
        },
        error: (err) => {
          this.submittingCompleteId.set(null);
          // Display backend validation errors if available
          const backendErrors: { [key: string]: string }[] = err.error?.errors;
          if (backendErrors && Array.isArray(backendErrors)) {
            const msgs = backendErrors.map(e => Object.values(e)[0]).join(' · ');
            this.snackBar.open(msgs, 'Close', { duration: 6000 });
          } else {
            this.snackBar.open(err.error?.message || 'Failed to complete pickup.', 'Close', { duration: 4000 });
          }
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
      'Missed':    'status-missed',
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

  /** Returns an error string for a waste entry field, or '' if clean */
  entryError(index: number, field: 'category' | 'weight'): string {
    const ctrl = this.wasteEntries.at(index)?.get(field);
    if (!ctrl || !ctrl.touched || ctrl.valid) return '';
    if (field === 'category') return 'Category is required.';
    if (ctrl.hasError('required')) return 'Weight is required.';
    if (ctrl.hasError('min'))      return 'Weight must be greater than 0 kg.';
    return 'Invalid weight.';
  }
}
