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
import { Pickup, CreatePickupPayload, WASTE_TYPES } from '../../../../core/models/pickup.model';

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
  submitting      = signal(false);
  submitSuccess   = signal(false);
  submitError     = signal('');

  // ── Constants ────────────────────────────────────────────────────────
  wasteTypes = WASTE_TYPES;
  minDate = new Date().toISOString().split('T')[0];

  // ── Computed ─────────────────────────────────────────────────────────
  readonly pendingCount   = computed(() => this.myPickups().filter(p => p.status === 'Pending').length);
  readonly assignedCount  = computed(() => this.myPickups().filter(p => p.status === 'Assigned').length);
  readonly completedCount = computed(() => this.myPickups().filter(p => p.status === 'Completed').length);

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
          this.myPickups.set(res.data?.pickups ?? []);
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
