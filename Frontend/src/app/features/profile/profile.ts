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

import {
  Router
} from '@angular/router';

import {
  MatSnackBar,
  MatSnackBarModule
} from '@angular/material/snack-bar';

import { ProfileService } from '../../core/services/profile.service';
import { AuthService } from '../../core/services/auth.service';

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

  // Expose current user role so the template can conditionally show NGO fields
  get currentRole(): string {
    return this.authService.getCurrentUser()?.role ?? '';
  }

  profileForm = this.fb.group({
    name: ['', Validators.required],
    email: [
      '',
      [
        Validators.required,
        Validators.email
      ]
    ],
    // Nested location fields — map to locations.primary.city / locations.primary.state
    primaryCity:  [''],
    primaryState: [''],
    // NGO-only: comma-separated waste types
    wasteTypes: [''],
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

        this.profileForm.patchValue({
          name:         user.name,
          email:        user.email,
          // Map nested locations → flat form fields
          primaryCity:  user.locations?.primary?.city  ?? '',
          primaryState: user.locations?.primary?.state ?? '',
          // wasteTypes array → comma-separated string
          wasteTypes: Array.isArray(user.wasteTypes)
            ? user.wasteTypes.join(', ')
            : '',
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

    // Build wasteTypes array (NGO only — backend ignores it for other roles)
    const wasteTypes = (this.currentRole === 'ngo' && formValue.wasteTypes)
      ? formValue.wasteTypes.split(',').map(w => w.trim()).filter(w => w.length > 0)
      : undefined;

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