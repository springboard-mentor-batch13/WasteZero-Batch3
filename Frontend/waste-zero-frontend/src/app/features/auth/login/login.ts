import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  Validators,
  ReactiveFormsModule
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatSnackBarModule
  ],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {

  private fb = inject(FormBuilder);
  private router = inject(Router);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);

  loginForm = this.fb.group({
    username: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  onLogin(): void {

    if (this.loginForm.invalid) {

      this.loginForm.markAllAsTouched();
      return;

    }

    this.authService.login({

      username: this.loginForm.value.username!,
      password: this.loginForm.value.password!

    }).subscribe({

      next: (response) => {

        this.snackBar.open(
          response.message,
          'Close',
          {
            duration: 3000,
            horizontalPosition: 'right',
            verticalPosition: 'top'
          }
        );

        this.router.navigate(['/dashboard']);

      },

      error: (error) => {

        this.snackBar.open(
          error.error?.message || 'Login failed',
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