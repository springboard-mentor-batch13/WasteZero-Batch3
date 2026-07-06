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
    RouterLink
  ],
  templateUrl: './register.html',
  styleUrl: './register.css'
})
export class Register {

  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

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

 onRegister() {

  if (this.registerForm.invalid) {

    this.registerForm.markAllAsTouched();
    return;

  }

  this.authService.register(this.registerForm.getRawValue()).subscribe({

    next: (response: any) => {

      console.log(response);

      alert('Registration Successful');

      this.router.navigate(['/login']);

    },

    error: (error: any) => {

      console.error(error);

      if (error.error?.message) {
        alert(error.error.message);
      } else {
        alert('Registration Failed');
      }

    }

  });

}

}