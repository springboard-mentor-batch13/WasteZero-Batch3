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
    ReactiveFormsModule
  ],
  templateUrl: './change-password.html',
  styleUrl: './change-password.css'
})
export class ChangePassword {

  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  passwordForm = this.fb.group({

    currentPassword: [
      '',
      Validators.required
    ],

    newPassword: [
      '',
      [
        Validators.required,
        Validators.minLength(6)
      ]
    ],

    confirmPassword: [
      '',
      Validators.required
    ]

  }, {
    validators: passwordMatchValidator
  });

  onChangePassword(): void {

    if (this.passwordForm.invalid) {

      this.passwordForm.markAllAsTouched();
      return;

    }

    const {
      currentPassword,
      newPassword
    } = this.passwordForm.getRawValue();

    this.authService.changePassword({

      currentPassword: currentPassword!,
      newPassword: newPassword!

    }).subscribe({

      next: (response) => {

        alert(response.message);

        this.passwordForm.reset();

        this.router.navigate(['/profile']);

      },

      error: (error) => {

        alert(
          error.error?.message ||
          'Password update failed'
        );

      }

    });

  }

}