// import { Component, inject } from '@angular/core';
import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  Validators,
  ReactiveFormsModule,
  AbstractControl,
  ValidationErrors,
  ValidatorFn
} from '@angular/forms';

import { Router, RouterLink } from '@angular/router';

import {
  MatSnackBar,
  MatSnackBarModule
} from '@angular/material/snack-bar';

import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';

const passwordMatchValidator: ValidatorFn = (
  group: AbstractControl
): ValidationErrors | null => {

  const password = group.get('password')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;

  return password === confirmPassword
    ? null
    : { passwordMismatch: true };

};

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatSnackBarModule
  ],
  templateUrl: './register.html',
  styleUrl: './register.css'
})
export class Register {

  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private cdr = inject(ChangeDetectorRef);
  readonly themeService = inject(ThemeService);

  readonly isDark = this.themeService.isDark;
  toggleDark(): void { this.themeService.toggle(); }

  loading = false;
  showPassword = false;
  showConfirmPassword = false;

  /**
   * Pure display getter — drives the password complexity hint.
   * Evaluates live while typing; has no effect on form validators or submission.
   * Shows when password length ≥ 8 but does not yet meet the backend policy.
   */
  get isPasswordHintVisible(): boolean {
    const pwd = this.registerForm.controls.password.value ?? '';
    if (pwd.length < 8) return false;
    const hasUpper   = /[A-Z]/.test(pwd);
    const hasLower   = /[a-z]/.test(pwd);
    const hasDigit   = /[0-9]/.test(pwd);
    const hasSpecial = /[@$!%*?&]/.test(pwd);
    return !(hasUpper && hasLower && hasDigit && hasSpecial);
  }

  /**
   * Pure display getter — drives the username length helper.
   * Shows only after the user has started editing (dirty) and
   * the username is outside the 3–20 character range.
   * Has no effect on form validators, submission, or any other field.
   */
  get isUsernameHintVisible(): boolean {
    const ctrl = this.registerForm.controls.username;
    if (!ctrl.dirty) return false;
    const len = (ctrl.value ?? '').length;
    return len < 3 || len > 20;
  }

  registerForm = this.fb.group({

    name: ['', Validators.required],

    username: ['', Validators.required],

    email: [
      '',
      [
        Validators.required,
        Validators.email
      ]
    ],

    password: [
      '',
      [
        Validators.required,
        Validators.minLength(8)
      ]
    ],

    confirmPassword: ['', Validators.required],

    role: ['volunteer', Validators.required]

  }, {
    validators: passwordMatchValidator
  });

  onRegister(): void {

    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.loading = true;

    const {
      name,
      username,
      email,
      password,
      role
    } = this.registerForm.getRawValue();

    this.authService.register({

      name: name!,
      username: username!,
      email: email!,
      password: password!,
      role: role!

    }).subscribe({

      next: (response) => {

        this.loading = false;
        this.cdr.detectChanges();

        this.snackBar.open(
          response.message,
          'Close',
          {
            duration: 3000,
            horizontalPosition: 'right',
            verticalPosition: 'top'
          }
        );

        localStorage.setItem(
          'verifyEmail',
          this.registerForm.value.email!
        );

        this.router.navigate(
          ['/verify-otp'],
          {
            state: {
              email: this.registerForm.value.email
            }
          }
        );

      },

      error: (error) => {

          this.loading = false;
          this.cdr.detectChanges();

        this.snackBar.open(
          error.error?.message || 'Registration failed',
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