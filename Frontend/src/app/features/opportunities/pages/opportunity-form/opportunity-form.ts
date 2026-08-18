// ============================================
// OPPORTUNITY FORM — WasteZero M2
// Routes: /opportunities/create  (mode=create)
//         /opportunities/:id/edit (mode=edit)
// Angular 21 zoneless — all mutable state as signals
// ============================================

import {
  Component, inject, OnInit, OnDestroy,
  signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder, ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, switchMap, map, of, takeUntil } from 'rxjs';

import { OpportunityService } from '../../../../core/services/opportunity.service';
import { OpportunityStore } from '../../../../core/services/opportunity-store.service';
import { CreateOpportunityPayload, OpportunityStatus } from '../../../../core/models/opportunity.model';

@Component({
  selector: 'app-opportunity-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MatSnackBarModule],
  templateUrl: './opportunity-form.html',
  styleUrl: './opportunity-form.css'
})
export class OpportunityForm implements OnInit, OnDestroy {

  private fb                 = inject(FormBuilder);
  private router             = inject(Router);
  private route              = inject(ActivatedRoute);
  private opportunityService = inject(OpportunityService);
  private opportunityStore   = inject(OpportunityStore);
  private snackBar           = inject(MatSnackBar);
  private destroy$           = new Subject<void>();

  // Today's date in YYYY-MM-DD format for the [min] attribute on the date input
  readonly today = new Date().toISOString().split('T')[0];

  // ── Signals ────────────────────────────────────────────────────────
  mode         = signal<'create' | 'edit'>('create');
  opportunityId = signal<string | null>(null);

  loading      = signal(false);
  loadError    = signal('');
  submitting   = signal(false);

  // Skills tag state
  skills       = signal<string[]>([]);
  skillInput   = signal('');

  // Image state
  selectedImageFile = signal<File | null>(null);
  imagePreviewUrl   = signal<string | null>(null);
  existingImageUrl  = signal<string | null>(null);

  // ── Computed ───────────────────────────────────────────────────────

  readonly isEditMode = computed(() => this.mode() === 'edit');

  // ── Reactive Form (non-signal — patchValue is reactive-forms native) ─
  form = this.fb.group({
    title:       ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.required],
    duration:    ['', Validators.required],
    location:    ['', Validators.required],
    status:      ['open' as OpportunityStatus],
    date:        [null as string | null]   // ISO date string or null
  });

  // ── Lifecycle ──────────────────────────────────────────────────────

  ngOnInit(): void {
    this.mode.set(
      (this.route.snapshot.data['mode'] as 'create' | 'edit') ?? 'create'
    );
    this.opportunityId.set(this.route.snapshot.paramMap.get('id'));

    if (this.mode() === 'edit' && this.opportunityId()) {
      this.loadExisting(this.opportunityId()!);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Load Existing (Edit mode) ──────────────────────────────────────

  private loadExisting(id: string): void {
    this.loading.set(true);
    this.loadError.set('');

    this.opportunityService.getOpportunityById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          // Populate skills and image BEFORE patchValue triggers re-render
          this.skills.set([...res.data.required_skills]);
          this.existingImageUrl.set(res.data.image || null);

          this.form.patchValue({
            title:       res.data.title,
            description: res.data.description,
            duration:    res.data.duration,
            location:    res.data.location,
            status:      res.data.status,
            // Convert ISO date string to YYYY-MM-DD for the native date input
            date: res.data.date
              ? new Date(res.data.date).toISOString().split('T')[0]
              : null
          });

          // Set loading=false AFTER patchValue so form only shows with data
          this.loading.set(false);
        },
        error: (err) => {
          this.loadError.set(err.error?.message || 'Failed to load opportunity.');
          this.loading.set(false);
        }
      });
  }

  // ── Skills Tag Management ──────────────────────────────────────────

  onSkillInputChange(value: string): void {
    this.skillInput.set(value);
  }

  addSkill(): void {
    const skill = this.skillInput().trim();
    if (!skill || this.skills().includes(skill)) {
      this.skillInput.set('');
      return;
    }
    this.skills.update(existing => [...existing, skill]);
    this.skillInput.set('');
  }

  addSkillOnKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addSkill();
    }
  }

  removeSkill(index: number): void {
    this.skills.update(existing => existing.filter((_, i) => i !== index));
  }

  // ── Image Handling ─────────────────────────────────────────────────

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.showSnack('Please select a valid image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.showSnack('Image must be under 5MB.');
      return;
    }

    this.selectedImageFile.set(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      this.imagePreviewUrl.set(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  removeImage(): void {
    this.selectedImageFile.set(null);
    this.imagePreviewUrl.set(null);
  }

  // ── Submit ─────────────────────────────────────────────────────────

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // Auto-commit any skill typed but not yet added via button/Enter
    const pending = this.skillInput().trim();
    if (pending) this.addSkill();

    if (this.skills().length === 0) {
      this.showSnack('Please add at least one required skill.');
      return;
    }

    this.submitting.set(true);

    const { title, description, duration, location, status, date } = this.form.getRawValue();
    const payload: CreateOpportunityPayload = {
      title:           title!,
      description:     description!,
      required_skills: this.skills(),
      duration:        duration!,
      location:        location!,
      // status is only sent in edit mode; on create the backend defaults to 'open'
      ...(this.isEditMode() ? { status: (status ?? 'open') as OpportunityStatus } : {}),
      date:            date || null
    };

    const imageFile = this.selectedImageFile();

    // ── Two-step submit strategy ───────────────────────────────────
    // Step 1: Always send text data as JSON (required_skills is a proper
    //         JS array, no FormData/multer single-string issue).
    // Step 2: If a new image was selected, send a second PUT with ONLY
    //         the image file. The backend validator skips all undefined
    //         fields on PUT, so only req.body.image gets updated.
    //
    // This guarantees required_skills validates correctly even with 1 skill.

    const step1$ = this.isEditMode()
      ? this.opportunityService.updateOpportunity(this.opportunityId()!, payload)
      : this.opportunityService.createOpportunity(payload);

    step1$.pipe(
      switchMap(res => {
        const savedId = res.data._id;
        if (imageFile) {
          // Step 2: image-only PUT (empty text payload)
          return this.opportunityService
            .updateOpportunity(savedId, {}, imageFile)
            .pipe(map(() => savedId));
        }
        return of(savedId);
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (savedId: string) => {
        this.submitting.set(false);
        this.showSnack(
          this.isEditMode() ? 'Opportunity updated!' : 'Opportunity created!'
        );
        this.opportunityStore.notifyRefresh();
        this.router.navigate(['/opportunities', savedId]);
      },
      error: (err) => {
        this.submitting.set(false);
        this.showSnack(err.error?.message || 'Operation failed. Please try again.');
      }
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  private showSnack(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      horizontalPosition: 'right',
      verticalPosition: 'top'
    });
  }

}
