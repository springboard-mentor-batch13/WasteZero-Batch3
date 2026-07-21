import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  Validators,
  ReactiveFormsModule,
  AbstractControl,
  ValidationErrors,
  ValidatorFn
} from '@angular/forms';

import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

import {
  MatSnackBar,
  MatSnackBarModule
} from '@angular/material/snack-bar';

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
  selector: 'app-change-password',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatSnackBarModule
  ],
  templateUrl: './change-password.html',
  styleUrl: './change-password.css'
})
export class ChangePassword {

  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  loading = false;
  otpSent = false;

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

  sendOtp(): void {

    this.authService.sendChangePasswordOtp().subscribe({

      next: (response) => {

        this.otpSent = true;

        this.snackBar.open(
          response.message,
          'Close',
          { duration: 3000 }
        );

      },

      error: (error) => {

        this.snackBar.open(
          error.error?.message || 'Failed to send OTP',
          'Close',
          { duration: 3000 }
        );

      }

    });

  }

  onChangePassword(): void {

    if (this.passwordForm.invalid) {

      this.passwordForm.markAllAsTouched();
      return;

    }

    this.loading = true;

    const { otp, newPassword } = this.passwordForm.getRawValue();

    this.authService.verifyChangePasswordOtp({

      otp: otp!,
      newPassword: newPassword!

    }).subscribe({

      next: (response) => {

        this.loading = false;

        this.snackBar.open(
          response.message,
          'Close',
          { duration: 3000 }
        );

        this.passwordForm.reset();

        this.router.navigate(['/profile']);

      },

      error: (error) => {

        this.loading = false;

        this.snackBar.open(
          error.error?.message || 'Password update failed',
          'Close',
          { duration: 3000 }
        );

      }

    });

  }

}