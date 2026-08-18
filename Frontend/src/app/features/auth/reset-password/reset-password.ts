import { Component, inject } from '@angular/core';
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
  RouterLink
} from '@angular/router';

import {
  MatSnackBar,
  MatSnackBarModule
} from '@angular/material/snack-bar';

import { AuthService } from '../../../core/services/auth.service';

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
  selector: 'app-reset-password',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatSnackBarModule
  ],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.css'
})
export class ResetPassword {

  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  loading = false;
  showNewPassword = false;
  showConfirmPassword = false;

  email =
    history.state.email ||
    localStorage.getItem('resetEmail') ||
    '';

  resetPasswordForm = this.fb.group({

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
        Validators.minLength(8)
      ]
    ],

    confirmPassword: [
      '',
      Validators.required
    ]

  }, {
    validators: passwordMatchValidator
  });

  resetPassword(): void {

    if (this.resetPasswordForm.invalid) {

      this.resetPasswordForm.markAllAsTouched();
      return;

    }

    this.loading = true;

    this.authService.resetPassword({

      email: this.email,

      otp: this.resetPasswordForm.value.otp!,

      newPassword: this.resetPasswordForm.value.newPassword!

    }).subscribe({

      next: (response) => {

        this.loading = false;

        this.snackBar.open(

          response.message,

          'Close',

          {
            duration: 3000,
            horizontalPosition: 'right',
            verticalPosition: 'top'
          }

        );

        localStorage.removeItem('resetEmail');

        this.router.navigate(['/login']);

      },

      error: (error) => {

        this.loading = false;

        this.snackBar.open(

          error.error?.message || 'Password reset failed',

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

}