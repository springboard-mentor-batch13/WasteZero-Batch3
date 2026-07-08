import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import {
  Router,
  RouterLink,
  RouterLinkActive
} from '@angular/router';

import { ProfileService } from '../../core/services/profile.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class Profile implements OnInit {

  private fb = inject(FormBuilder);
  private router = inject(Router);

  private profileService = inject(ProfileService);
  private authService = inject(AuthService);

  profileForm = this.fb.group({

    name: ['', Validators.required],

    email: [
      '',
      [
        Validators.required,
        Validators.email
      ]
    ],

    location: [''],

    skills: [''],

    bio: ['']

  });

  ngOnInit(): void {
    this.loadProfile();
  }

  loadProfile(): void {

    this.profileService.getProfile().subscribe({

      next: (response) => {

        this.profileForm.patchValue({

          name: response.user.name,
          email: response.user.email,
          location: response.user.location || '',
          skills: response.user.skills?.join(', ') || '',
          bio: response.user.bio || ''

        });

      },

      error: (error) => {

        console.error(error);

        alert(error.error?.message || 'Failed to load profile');

      }

    });

  }

  saveProfile(): void {

    if (this.profileForm.invalid) {

      this.profileForm.markAllAsTouched();
      return;

    }

    const formValue = this.profileForm.getRawValue();

    this.profileService.updateProfile({

      name: formValue.name!,
      location: formValue.location!,
      bio: formValue.bio!,
      skills: formValue.skills
        ? formValue.skills
            .split(',')
            .map(skill => skill.trim())
            .filter(skill => skill.length > 0)
        : []

    }).subscribe({

      next: () => {

        alert('Profile updated successfully.');

        this.loadProfile();

      },

      error: (error) => {

        console.error(error);

        alert(error.error?.message || 'Profile update failed');

      }

    });

  }

  logout(): void {

    this.authService.logout();

    this.router.navigate(['/login']);

  }

}