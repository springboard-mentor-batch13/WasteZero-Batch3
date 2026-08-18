// ============================================
// SCHEDULE PICKUP PAGE — WasteZero Milestone 3
// Route: /pickups/schedule (Volunteer only)
// Tabs: [Schedule New] [My Pickups]
// ============================================

import {
  Component, inject, OnInit, OnDestroy,
  signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { PickupService } from '../../../../core/services/pickup.service';
import { Pickup, CreatePickupPayload, ReschedulePickupPayload, WASTE_TYPES } from '../../../../core/models/pickup.model';

// ── Cross-field validator: end time must be after start time ──────────────
// Applied at the FormGroup level so it re-evaluates whenever either field
// changes. Returns null (valid) when either field is empty — the required
// validator handles those cases independently.
function endTimeAfterStart(group: AbstractControl): ValidationErrors | null {
  const start = group.get('timeStart')?.value as string;
  const end   = group.get('timeEnd')?.value   as string;
  if (!start || !end) return null;
  return end > start ? null : { endTimeBeforeStart: true };
}

@Component({
  selector: 'app-schedule-pickup',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatSnackBarModule],
  templateUrl: './schedule-pickup.html',
  styleUrl: './schedule-pickup.css',
})
export class SchedulePickup implements OnInit, OnDestroy {

  private pickupService = inject(PickupService);
  private fb            = inject(FormBuilder);
  private snackBar      = inject(MatSnackBar);
  private router        = inject(Router);
  private destroy$      = new Subject<void>();

  // ── Tab ─────────────────────────────────────────────────────────────
  activeTab = signal<'schedule' | 'history'>('schedule');

  // ── Pickup History ───────────────────────────────────────────────────
  myPickups       = signal<Pickup[]>([]);
  loadingPickups  = signal(false);
  pickupsError    = signal('');
  cancellingId    = signal<string | null>(null);

  // ── Form ─────────────────────────────────────────────────────────────
  form: FormGroup;
  submitting           = signal(false);
  submitSuccess        = signal(false);
  submitError          = signal('');
  /** True while the form is prefilled from a cancelled pickup (shows banner) */
  isPrefillReschedule  = signal(false);

  // ── Constants ────────────────────────────────────────────────────────
  wasteTypes = WASTE_TYPES;
  minDate = new Date().toISOString().split('T')[0];

  // ── Computed ─────────────────────────────────────────────────────────
  readonly pendingCount   = computed(() => this.myPickups().filter(p => p.status === 'Pending').length);
  readonly assignedCount  = computed(() => this.myPickups().filter(p => p.status === 'Assigned').length);
  readonly completedCount = computed(() => this.myPickups().filter(p => p.status === 'Completed').length);
  readonly missedCount    = computed(() => this.myPickups().filter(p => p.status === 'Missed').length);
  readonly cancelledCount = computed(() => this.myPickups().filter(p => p.status === 'Cancelled').length);

  // ── Reschedule state (Task 7) ─────────────────────────────────────────
  reschedulingId       = signal<string | null>(null);
  reschedulePickupId   = signal<string | null>(null); // which card has the inline form open
  rescheduleForm: FormGroup;

  constructor() {
    this.form = this.fb.group(
      {
        city:      ['', [Validators.required, Validators.minLength(2)]],
        area:      [''],
        date:      ['', Validators.required],
        timeStart: ['', Validators.required],
        timeEnd:   ['', Validators.required],
        notes:     [''],
      },
      { validators: endTimeAfterStart }
    );

    // Reschedule inline form — reuses the same end-after-start validator
    this.rescheduleForm = this.fb.group(
      {
        date:      ['', Validators.required],
        timeStart: ['', Validators.required],
        timeEnd:   ['', Validators.required],
      },
      { validators: endTimeAfterStart }
    );
  }

  ngOnInit(): void {
    this.loadMyPickups();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setTab(tab: 'schedule' | 'history'): void {
    this.activeTab.set(tab);
    if (tab === 'history') this.loadMyPickups();
  }

  selectedWasteTypes = signal<string[]>([]);

  toggleWasteType(type: string): void {
    const current = this.selectedWasteTypes();
    if (current.includes(type)) {
      this.selectedWasteTypes.set(current.filter(t => t !== type));
    } else {
      this.selectedWasteTypes.set([...current, type]);
    }
  }

  isWasteTypeSelected(type: string): boolean {
    return this.selectedWasteTypes().includes(type);
  }

  // ── Load my pickups ──────────────────────────────────────────────────

  loadMyPickups(): void {
    this.loadingPickups.set(true);
    this.pickupsError.set('');

    this.pickupService.getMyPickups()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const rawPickups: Pickup[] = res.data?.pickups ?? [];
          // Strict deduplication by unique backend _id to prevent duplicate cards
          const uniquePickups = Array.from(
            new Map(rawPickups.map(p => [p._id, p])).values()
          );
          this.myPickups.set(uniquePickups);
          this.loadingPickups.set(false);
        },
        error: (err) => {
          this.pickupsError.set(err.error?.message || 'Failed to load pickups.');
          this.loadingPickups.set(false);
        }
      });
  }

  // ── Submit form ──────────────────────────────────────────────────────

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.selectedWasteTypes().length === 0) {
      this.submitError.set('Please select at least one waste type.');
      return;
    }

    const val = this.form.value;
    const payload: CreatePickupPayload = {
      address: {
        city: val.city,
        ...(val.area ? { area: val.area } : {}),
      },
      scheduledDate: val.date,
      preferredTimeSlot: {
        start: val.timeStart,
        end:   val.timeEnd,
      },
      wasteTypes: this.selectedWasteTypes(),
      notes: val.notes || null,
    };

    this.submitting.set(true);
    this.submitError.set('');

    this.pickupService.createPickup(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.submitSuccess.set(true);
          this.isPrefillReschedule.set(false); // clear prefill banner on success
          this.form.reset();
          this.selectedWasteTypes.set([]);
          this.loadMyPickups();
          // Auto-switch to history after success
          setTimeout(() => {
            this.submitSuccess.set(false);
            this.activeTab.set('history');
          }, 2000);
        },
        error: (err) => {
          this.submitting.set(false);
          this.submitError.set(err.error?.message || 'Failed to schedule pickup.');
        }
      });
  }

  // ── Cancel pickup ─────────────────────────────────────────────────────

  cancelPickup(pickup: Pickup): void {
    if (this.cancellingId() === pickup._id) return;
    this.cancellingId.set(pickup._id);

    this.pickupService.cancelPickup(pickup._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.cancellingId.set(null);
          this.myPickups.update(pickups =>
            pickups.map(p => p._id === pickup._id ? { ...p, status: 'Cancelled' } : p)
          );
          this.snackBar.open('Pickup cancelled.', 'Close', { duration: 3000 });
        },
        error: (err) => {
          this.cancellingId.set(null);
          this.snackBar.open(err.error?.message || 'Failed to cancel pickup.', 'Close', { duration: 3000 });
        }
      });
  }

  // ── Helpers ──────────────────────────────────────────────────────────

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

  canReschedule(pickup: Pickup): boolean {
    return pickup.status === 'Missed' && (pickup.rescheduleCount ?? 0) < 2;
  }

  // ── Reschedule (Task 7) ───────────────────────────────────────────────

  openReschedule(pickup: Pickup): void {
    if (!this.canReschedule(pickup)) {
      this.snackBar.open('Maximum reschedule limit (2) reached for this pickup.', 'Close', { duration: 3000 });
      return;
    }
    const isoDate = pickup.scheduledDate
      ? new Date(pickup.scheduledDate).toISOString().split('T')[0]
      : '';
    const validDate = (isoDate && isoDate >= this.minDate) ? isoDate : this.minDate;

    this.rescheduleForm.patchValue({
      date:      validDate,
      timeStart: pickup.preferredTimeSlot?.start ?? '',
      timeEnd:   pickup.preferredTimeSlot?.end   ?? '',
    });
    this.reschedulePickupId.set(pickup._id);
  }

  /**
   * Cancelled/NGO-rejected pickup: open the Schedule New tab with the
   * previous pickup's details prefilled. The volunteer can review and
   * update before submitting — the submission path is the normal
   * POST /api/pickups flow (create a new pickup).
   *
   * Field mapping (backend → form control):
   *   address.city            → city
   *   address.area            → area
   *   scheduledDate (ISO)     → date  (YYYY-MM-DD extracted)
   *   preferredTimeSlot.start → timeStart  (already HH:mm)
   *   preferredTimeSlot.end   → timeEnd    (already HH:mm)
   *   wasteTypes              → selectedWasteTypes signal
   *   notes                   → notes
   */
  goScheduleNew(pickup: Pickup): void {
    // Extract YYYY-MM-DD from ISO date string for the date input.
    // If previous scheduledDate is in the past, set to today (minDate)
    const isoDate = pickup.scheduledDate
      ? new Date(pickup.scheduledDate).toISOString().split('T')[0]
      : '';
    const validDate = (isoDate && isoDate >= this.minDate) ? isoDate : this.minDate;

    // Patch all form fields with prior pickup values
    this.form.patchValue({
      city:      pickup.address?.city      ?? '',
      area:      pickup.address?.area      ?? '',
      date:      validDate,
      timeStart: pickup.preferredTimeSlot?.start ?? '',
      timeEnd:   pickup.preferredTimeSlot?.end   ?? '',
      notes:     pickup.notes              ?? '',
    });

    // Restore the waste type selection
    this.selectedWasteTypes.set(
      Array.isArray(pickup.wasteTypes) ? [...pickup.wasteTypes] : []
    );

    // Signal that this is a prefilled reschedule (used by the banner)
    this.isPrefillReschedule.set(true);

    // Clear any previous submit state from the form
    this.submitSuccess.set(false);
    this.submitError.set('');

    // Switch to the Schedule New tab — Angular renders the form before scroll
    this.setTab('schedule');

    // Scroll to top of page so the volunteer sees the prefilled form
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  closeReschedule(): void {
    this.reschedulePickupId.set(null);
    this.rescheduleForm.reset();
  }

  submitReschedule(pickup: Pickup): void {
    if (this.rescheduleForm.invalid) {
      this.rescheduleForm.markAllAsTouched();
      return;
    }
    if (this.reschedulingId() === pickup._id) return;

    const val = this.rescheduleForm.value;
    const payload: ReschedulePickupPayload = {
      scheduledDate: val.date,
      preferredTimeSlot: { start: val.timeStart, end: val.timeEnd },
    };

    this.reschedulingId.set(pickup._id);

    this.pickupService.reschedulePickup(pickup._id, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.reschedulingId.set(null);
          this.reschedulePickupId.set(null);
          this.rescheduleForm.reset();
          // Update the pickup in the list with the new data from the backend
          this.myPickups.update(pickups =>
            pickups.map(p => p._id === pickup._id ? res.data : p)
          );
          this.snackBar.open('Pickup rescheduled. It is now Pending again.', 'Close', { duration: 4000 });
        },
        error: (err) => {
          this.reschedulingId.set(null);
          this.snackBar.open(err.error?.message || 'Failed to reschedule pickup.', 'Close', { duration: 3000 });
        }
      });
  }
}
