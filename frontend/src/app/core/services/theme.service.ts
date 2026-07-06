import { Injectable, signal, effect } from '@angular/core';
import { ProfileService } from './profile.service';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  readonly isDarkMode = signal<boolean>(false);

  constructor(
    private profileService: ProfileService,
    private authService: AuthService
  ) {
    const user = this.authService.getCurrentUser();
    if (user) {
      this.isDarkMode.set(user.dark_mode);
    }
    this.applyTheme();

    effect(() => {
      const currentUser = this.authService.currentUser();
      if (currentUser) {
        this.isDarkMode.set(currentUser.dark_mode);
        this.applyTheme();
      }
    });
  }

  toggleDarkMode(): void {
    const newValue = !this.isDarkMode();
    this.isDarkMode.set(newValue);
    this.applyTheme();
    this.profileService.updateProfile({ dark_mode: newValue }).subscribe();
  }

  private applyTheme(): void {
    if (this.isDarkMode()) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }
}
