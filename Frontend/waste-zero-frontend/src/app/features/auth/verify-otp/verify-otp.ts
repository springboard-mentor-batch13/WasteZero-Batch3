import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
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

@Component({
  selector: 'app-verify-otp',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatSnackBarModule,
    RouterLink
  ],
  templateUrl: './verify-otp.html',
  styleUrl: './verify-otp.css'
})
export class VerifyOtp {

  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  loading = false;

  email =
    history.state.email ||
    localStorage.getItem('verifyEmail') ||
    '';

  otpForm = this.fb.group({

    otp: [
      '',
      [
        Validators.required,
        Validators.minLength(6),
        Validators.maxLength(6)
      ]
    ]

  });

  verifyOtp(): void {

    if (this.otpForm.invalid) {

      this.otpForm.markAllAsTouched();
      return;

    }

    this.loading = true;

    this.authService.verifyOtp({

      email: this.email,
      otp: this.otpForm.value.otp!

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

        localStorage.removeItem('verifyEmail');

        this.router.navigate(['/login']);

      },

      error: (error) => {

        this.loading = false;

        this.snackBar.open(
          error.error?.message || 'OTP Verification Failed',
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