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

import { Router, RouterLink } from '@angular/router';

import {
  MatSnackBar,
  MatSnackBarModule
} from '@angular/material/snack-bar';

import { AuthService } from '../../../core/services/auth.service';

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
        Validators.minLength(6)
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

        this.snackBar.open(
          response.message,
          'Close',
          {
            duration: 3000,
            horizontalPosition: 'right',
            verticalPosition: 'top'
          }
        );

        this.router.navigate(['/login']);

      },

      error: (error) => {

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