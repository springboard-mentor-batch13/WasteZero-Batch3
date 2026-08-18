import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatSnackBarModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);
  readonly themeService = inject(ThemeService);

  readonly isDark = this.themeService.isDark;
  toggleDark(): void { this.themeService.toggle(); }

  loading = false;
  showPassword = false;

  loginForm = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  ngOnInit(): void {
    // Restore saved dark mode preference (applies html.dark class + signal)
    this.themeService.applyPreference();

    // Display a suspension notice if Layout forced a logout due to account:suspended
    const notice = sessionStorage.getItem('suspension_notice');
    if (notice) {
      sessionStorage.removeItem('suspension_notice');
      setTimeout(() => {
        this.snackBar.open(notice, 'Close', {
          duration: 7000,
          horizontalPosition: 'right',
          verticalPosition: 'top',
          panelClass: ['snack-suspended'],
        });
      }, 100);
    }
  }

  onLogin(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loading = true;

    this.authService.login(this.loginForm.getRawValue()).subscribe({
      next: (response: any) => {
        this.loading = false;

        this.showMessage(
          response.message || 'Login successful!'
        );

        // AuthService should already save JWT token.
        // If not, we'll add it there.

        this.router.navigate(['/dashboard'], { replaceUrl: true });
      },

      error: (error) => {
        this.loading = false;

        this.showMessage(
          error.error?.message ||
            'Unable to login. Please try again.'
        );
      },
    });
  }

  private showMessage(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      horizontalPosition: 'right',
      verticalPosition: 'top',
    });
  }
}