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
  Router,
  RouterLink,
  RouterLinkActive
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
    RouterLink,
    RouterLinkActive,
    MatSnackBarModule
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class Profile implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);

  private profileService = inject(ProfileService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);

  activeTab: 'profile' | 'password' = 'profile';

  loadingProfile = false;
  loadingPassword = false;
  otpSent = false;

  profileForm = this.fb.group({
    name: ['', Validators.required],
    email: [
      '',
      [
        Validators.required,
        Validators.email
      ]
    ],
    location: [''],
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

        this.profileForm.patchValue({
          name: response.user.name,
          email: response.user.email,
          location: response.user.location || '',
          skills: response.user.skills?.join(', ') || '',
          bio: response.user.bio || ''
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

    this.profileService.updateProfile({
      name: formValue.name!,
      location: formValue.location!,
      bio: formValue.bio!,
      skills: formValue.skills
        ? formValue.skills
            .split(',')
            .map(skill => skill.trim())
            .filter(skill => skill.length > 0)
        : []
    }).subscribe({
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