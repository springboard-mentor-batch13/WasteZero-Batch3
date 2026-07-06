import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, FormControl, Validators } from '@angular/forms';
import { LucideSave, LucidePlus, LucideX, LucideMapPin, LucideMail, LucideUser, LucideBriefcase } from '@lucide/angular';
import { ProfileService } from '../../core/services/profile.service';
import { UserProfile } from '../../core/models/user.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    LucideSave, LucidePlus, LucideX, LucideMapPin, LucideMail, LucideUser, LucideBriefcase
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  profileForm!: FormGroup;
  isLoading = true;
  isSaving = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  showToast = false;

  constructor(
    private fb: FormBuilder,
    private profileService: ProfileService
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.fetchProfile();
  }

  private initForm(): void {
    this.profileForm = this.fb.group({
      full_name: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      location: [''],
      bio: ['', [Validators.maxLength(500)]],
      skills: this.fb.array([])
    });
  }

  get skills(): FormArray {
    return this.profileForm.get('skills') as FormArray;
  }

  addSkill(value: string = ''): void {
    this.skills.push(new FormControl(value, Validators.required));
  }

  removeSkill(index: number): void {
    this.skills.removeAt(index);
  }

  private fetchProfile(): void {
    this.isLoading = true;
    this.profileService.getProfile().subscribe({
      next: (response) => {
        this.isLoading = false;
        if (response.success && response.data) {
          this.populateForm(response.data);
        }
      },
      error: () => {
        this.isLoading = false;
        this.showNotification('Failed to load profile data', 'error');
      }
    });
  }

  private populateForm(profile: UserProfile): void {
    this.profileForm.patchValue({
      full_name: profile.full_name || '',
      email: profile.email || '',
      location: profile.location || '',
      bio: profile.bio || ''
    });

    this.skills.clear();
    if (profile.skills) {
      const skillList = profile.skills.split(',').map(s => s.trim()).filter(s => s.length > 0);
      skillList.forEach(skill => this.addSkill(skill));
    }
  }

  onSave(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;

    const skillValues: string[] = this.skills.controls
      .map(c => c.value?.trim())
      .filter((v: string) => v && v.length > 0);

    const payload = {
      full_name: this.profileForm.get('full_name')?.value,
      email: this.profileForm.get('email')?.value,
      location: this.profileForm.get('location')?.value || null,
      bio: this.profileForm.get('bio')?.value || null,
      skills: skillValues.length > 0 ? skillValues.join(',') : null
    };

    this.profileService.updateProfile(payload).subscribe({
      next: (response) => {
        this.isSaving = false;
        if (response.success) {
          this.showNotification('Profile updated successfully', 'success');
        } else {
          this.showNotification(response.message || 'Update failed', 'error');
        }
      },
      error: () => {
        this.isSaving = false;
        this.showNotification('Failed to update profile', 'error');
      }
    });
  }

  private showNotification(message: string, type: 'success' | 'error'): void {
    this.toastMessage = message;
    this.toastType = type;
    this.showToast = true;
    setTimeout(() => {
      this.showToast = false;
    }, 3000);
  }
}
