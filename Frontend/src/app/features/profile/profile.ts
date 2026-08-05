import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  ValidationErrors,
  ValidatorFn
} from '@angular/forms';
import { Router } from '@angular/router';
import {
  MatSnackBar,
  MatSnackBarModule
} from '@angular/material/snack-bar';

import { ProfileService } from '../../core/services/profile.service';
import { AuthService } from '../../core/services/auth.service';
import { WASTE_TYPES } from '../../core/models/pickup.model';


const passwordMatchValidator: ValidatorFn = (
  group: AbstractControl
): ValidationErrors | null => {
  const newPassword = group.get('newPassword')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;

  return newPassword === confirmPassword
    ? null
    : { passwordMismatch: true };
};

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatSnackBarModule
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class Profile implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);

  private profileService = inject(ProfileService);
  public authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);

  activeTab: 'profile' | 'password' = 'profile';

  loadingProfile = false;
  loadingPassword = false;
  otpSent = false;

  // Predefined waste type options (shared constant from pickup model)
  readonly wasteTypeOptions = WASTE_TYPES;

  // Independent set tracking checked waste types — not backed by a FormControl
  private selectedWasteTypes = new Set<string>();

  isWasteTypeChecked(type: string): boolean {
    return this.selectedWasteTypes.has(type);
  }

  toggleWasteType(type: string): void {
    if (this.selectedWasteTypes.has(type)) {
      this.selectedWasteTypes.delete(type);
    } else {
      this.selectedWasteTypes.add(type);
    }
  }

  // Expose current user role so the template can conditionally show NGO fields
  get currentRole(): string {
    return this.authService.getCurrentUser()?.role ?? '';
  }

  profileForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    // Nested location fields — map to locations.primary.city / locations.primary.state
    primaryCity:  [''],
    primaryState: [''],
    // NGO waste types managed via selectedWasteTypes Set (checkbox grid)
    wasteTypeOther: [''],   // free-text for when "Other" is checked
    // Volunteer + NGO: comma-separated skills
    skills: [''],
    bio: ['']
  });

  passwordForm = this.fb.group({
    otp: [
      '',
      [
        Validators.required,
        Validators.minLength(6),
        Validators.maxLength(6)
      ]
    ],
    newPassword: [
      '',
      [
        Validators.required,
        Validators.pattern(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/
        )
      ]
    ],
    confirmPassword: [
      '',
      Validators.required
    ]
  }, {
    validators: passwordMatchValidator
  });

  ngOnInit(): void {
    this.loadProfile();
  }

  loadProfile(): void {
    this.loadingProfile = true;

    this.profileService.getProfile().subscribe({
      next: (response) => {
        this.loadingProfile = false;

        const user = response.user;

        // Populate checkbox set from saved wasteTypes array
        if (this.currentRole === 'ngo' && Array.isArray(user.wasteTypes)) {
          this.selectedWasteTypes.clear();
          const knownTypes = new Set(WASTE_TYPES);
          let otherText = '';
          for (const wt of user.wasteTypes) {
            if (knownTypes.has(wt)) {
              this.selectedWasteTypes.add(wt);
            } else if (wt) {
              // Any unlisted value becomes "Other" + text
              this.selectedWasteTypes.add('Other');
              otherText = wt;
            }
          }
          if (otherText) {
            this.profileForm.patchValue({ wasteTypeOther: otherText });
          }
        }

        this.profileForm.patchValue({
          name:         user.name,
          email:        user.email,
          // Map nested locations → flat form fields
          primaryCity:  user.locations?.primary?.city  ?? '',
          primaryState: user.locations?.primary?.state ?? '',
          // skills array → comma-separated string
          skills: Array.isArray(user.skills)
            ? user.skills.join(', ')
            : '',
          bio: user.bio ?? ''
        });
      },
      error: (error) => {
        this.loadingProfile = false;

        this.snackBar.open(
          error.error?.message || 'Failed to load profile',
          'Close',
          {
            duration: 3000,
            horizontalPosition: 'right',
            verticalPosition: 'top'
          }
        );
      }
    });
  }


  saveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.loadingProfile = true;
    const formValue = this.profileForm.getRawValue();

    // Build the nested locations object the backend expects
    const primaryCity  = (formValue.primaryCity  ?? '').trim();
    const primaryState = (formValue.primaryState ?? '').trim();

    // Build skills array (all roles may have skills)
    const skills = formValue.skills
      ? formValue.skills.split(',').map(s => s.trim()).filter(s => s.length > 0)
      : [];

    // Build wasteTypes array from checkbox Set (NGO only)
    let wasteTypes: string[] | undefined;
    if (this.currentRole === 'ngo') {
      wasteTypes = [];
      for (const wt of this.selectedWasteTypes) {
        if (wt === 'Other') {
          // Replace "Other" placeholder with the specify text if provided
          const otherText = (formValue.wasteTypeOther ?? '').trim();
          if (otherText) {
            wasteTypes.push(otherText);
          } else {
            wasteTypes.push('Other');
          }
        } else {
          wasteTypes.push(wt);
        }
      }
    }

    const payload: Record<string, unknown> = {
      name: (formValue.name ?? '').trim(),
      bio:  (formValue.bio  ?? '').trim(),
      skills,
      // Always send locations so the backend can set locations.primary.city/state
      locations: {
        primary: {
          city:  primaryCity  || undefined,
          state: primaryState || undefined,
        },
        secondary: [],
      },
    };

    // Only include wasteTypes in the payload for NGO users
    if (wasteTypes !== undefined) {
      payload['wasteTypes'] = wasteTypes;
    }

    this.profileService.updateProfile(payload).subscribe({
      next: (response) => {
        this.loadingProfile = false;

        this.snackBar.open(
          response.message || 'Profile updated successfully.',
          'Close',
          {
            duration: 3000,
            horizontalPosition: 'right',
            verticalPosition: 'top'
          }
        );

        this.loadProfile();
      },
      error: (error) => {
        this.loadingProfile = false;

        this.snackBar.open(
          error.error?.message || 'Profile update failed',
          'Close',
          {
            duration: 3000,
            horizontalPosition: 'right',
            verticalPosition: 'top'
          }
        );
      }
    });
  }

  sendOtp(): void {
    this.authService.sendChangePasswordOtp().subscribe({
      next: (response) => {
        this.otpSent = true;

        this.snackBar.open(
          response.message,
          'Close',
          {
            duration: 3000,
            horizontalPosition: 'right',
            verticalPosition: 'top'
          }
        );
      },
      error: (error) => {
        this.snackBar.open(
          error.error?.message || 'Failed to send OTP',
          'Close',
          {
            duration: 3000,
            horizontalPosition: 'right',
            verticalPosition: 'top'
          }
        );
      }
    });
  }

  changePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.loadingPassword = true;
    const { otp, newPassword } = this.passwordForm.getRawValue();

    this.authService.verifyChangePasswordOtp({
      otp: otp!,
      newPassword: newPassword!
    }).subscribe({
      next: (response) => {
        this.loadingPassword = false;

        this.snackBar.open(
          response.message,
          'Close',
          {
            duration: 3000,
            horizontalPosition: 'right',
            verticalPosition: 'top'
          }
        );

        this.passwordForm.reset();
        this.passwordForm.patchValue({
          otp: '',
          newPassword: '',
          confirmPassword: ''
        });

        this.otpSent = false;
        this.activeTab = 'profile';
      },
      error: (error) => {
        this.loadingPassword = false;

        this.snackBar.open(
          error.error?.message || 'Password update failed',
          'Close',
          {
            duration: 3000,
            horizontalPosition: 'right',
            verticalPosition: 'top'
          }
        );
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}