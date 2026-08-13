import { Component, inject, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
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
export class VerifyOtp implements OnInit, OnDestroy {

  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private cdr = inject(ChangeDetectorRef);

  loading = false;
  resending = false;
  cooldown = 0;
  private timerId: any = null;

  isEmailEditable = false;

  initialEmail =
    history.state?.email ||
    localStorage.getItem('verifyEmail') ||
    '';

  otpForm = this.fb.group({
    email: [
      this.initialEmail,
      [
        Validators.required,
        Validators.email
      ]
    ],
    otp: [
      '',
      [
        Validators.required,
        Validators.minLength(6),
        Validators.maxLength(6),
        Validators.pattern(/^[0-9]{6}$/)
      ]
    ]
  });

  ngOnInit(): void {
    if (!this.initialEmail) {
      this.isEmailEditable = true;
    }
  }

  ngOnDestroy(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
    }
  }

  toggleEmailEdit(): void {
    this.isEmailEditable = !this.isEmailEditable;
    this.cdr.detectChanges();
  }

  resendOtp(): void {
    const emailCtrl = this.otpForm.controls.email;
    if (emailCtrl.invalid || !emailCtrl.value) {
      emailCtrl.markAsTouched();
      this.snackBar.open('Please enter a valid email to resend OTP', 'Close', {
        duration: 3000,
        horizontalPosition: 'right',
        verticalPosition: 'top'
      });
      return;
    }

    if (this.cooldown > 0 || this.resending) {
      return;
    }

    this.resending = true;
    const email = emailCtrl.value.trim().toLowerCase();

    this.authService.resendOtp(email).subscribe({
      next: (response) => {
        this.resending = false;
        this.startCooldown(60);
        this.snackBar.open(
          response.message || 'OTP resent successfully.',
          'Close',
          {
            duration: 3000,
            horizontalPosition: 'right',
            verticalPosition: 'top'
          }
        );
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.resending = false;
        this.snackBar.open(
          error.error?.message || 'Failed to resend OTP. Please try again.',
          'Close',
          {
            duration: 3000,
            horizontalPosition: 'right',
            verticalPosition: 'top'
          }
        );
        this.cdr.detectChanges();
      }
    });
  }

  private startCooldown(seconds: number): void {
    this.cooldown = seconds;
    if (this.timerId) {
      clearInterval(this.timerId);
    }
    this.timerId = setInterval(() => {
      this.cooldown--;
      if (this.cooldown <= 0) {
        clearInterval(this.timerId);
        this.timerId = null;
      }
      this.cdr.detectChanges();
    }, 1000);
  }

  verifyOtp(): void {
    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    const { email, otp } = this.otpForm.getRawValue();

    this.authService.verifyOtp({
      email: (email || '').trim().toLowerCase(),
      otp: (otp || '').trim()
    }).subscribe({
      next: (response) => {
        this.loading = false;
        this.snackBar.open(
          response.message || 'Email verified successfully!',
          'Close',
          {
            duration: 3000,
            horizontalPosition: 'right',
            verticalPosition: 'top'
          }
        );

        localStorage.removeItem('verifyEmail');
        this.router.navigate(['/login']);
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.loading = false;
        this.snackBar.open(
          error.error?.message || error.error?.errors?.[0]?.msg || 'OTP Verification Failed',
          'Close',
          {
            duration: 4000,
            horizontalPosition: 'right',
            verticalPosition: 'top'
          }
        );
        this.cdr.detectChanges();
      }
    });
  }

}