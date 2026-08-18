import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { NotificationService } from '../../core/services/notification.service';
import { SettingsService, DEFAULT_SETTINGS } from '../../core/services/settings.service';
import { UserSettings } from '../../core/models/user.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './settings.html',
  styleUrl: './settings.css'
})
export class SettingsPage implements OnInit {
  private router = inject(Router);
  public authService = inject(AuthService);
  public themeService = inject(ThemeService);
  public notificationService = inject(NotificationService);
  public settingsService = inject(SettingsService);

  activeTab = signal<'notifications' | 'appearance' | 'account' | 'security'>('notifications');

  loading = signal(false);
  saving = signal(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  // Settings model
  settings = signal<UserSettings>({ ...DEFAULT_SETTINGS });

  // Modal confirmation for clearing notification history
  showClearModal = signal(false);
  clearingHistory = signal(false);

  ngOnInit(): void {
    this.loadSettings();
  }

  loadSettings(): void {
    this.loading.set(true);
    this.settingsService.getSettings().subscribe({
      next: (res) => {
        if (res && res.success && res.settings) {
          const loaded: UserSettings = {
            emailNotifications: res.settings.emailNotifications ?? true,
            pushNotifications: res.settings.pushNotifications ?? true,
            messageAlerts: res.settings.messageAlerts ?? true,
            pickupAlerts: res.settings.pickupAlerts ?? true,
            opportunityAlerts: res.settings.opportunityAlerts ?? true,
            themePreference: res.settings.themePreference ?? 'system',
          };
          this.settings.set(loaded);
          if (loaded.themePreference) {
            this.themeService.setTheme(loaded.themePreference);
          }
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  saveSettings(overridePayload?: Partial<UserSettings>): void {
    this.saving.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    const payload = overridePayload || this.settings();

    this.settingsService.updateSettings(payload).subscribe({
      next: (res) => {
        this.saving.set(false);
        if (res && res.settings) {
          this.settings.set({
            emailNotifications: res.settings.emailNotifications ?? true,
            pushNotifications: res.settings.pushNotifications ?? true,
            messageAlerts: res.settings.messageAlerts ?? true,
            pickupAlerts: res.settings.pickupAlerts ?? true,
            opportunityAlerts: res.settings.opportunityAlerts ?? true,
            themePreference: res.settings.themePreference ?? 'system',
          });
        }
        this.successMessage.set('Preferences saved successfully.');
        setTimeout(() => this.successMessage.set(null), 4000);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err?.error?.message || 'Failed to save settings.');
        setTimeout(() => this.errorMessage.set(null), 4000);
      }
    });
  }

  toggleSetting(key: keyof UserSettings): void {
    const current = this.settings();
    if (typeof current[key] === 'boolean') {
      const updated = { ...current, [key]: !current[key] };
      this.settings.set(updated);
      this.saveSettings(updated);
    }
  }

  setTheme(mode: 'light' | 'dark' | 'system'): void {
    const updated = { ...this.settings(), themePreference: mode };
    this.settings.set(updated);
    this.themeService.setTheme(mode);
    this.saveSettings(updated);
  }

  openClearModal(): void {
    this.showClearModal.set(true);
  }

  cancelClearModal(): void {
    if (this.clearingHistory()) return;
    this.showClearModal.set(false);
  }

  confirmClearNotifications(): void {
    this.clearingHistory.set(true);
    this.notificationService.clearAll().subscribe({
      next: () => {
        this.notificationService.setUnreadCount(0);
        this.clearingHistory.set(false);
        this.showClearModal.set(false);
        this.successMessage.set('All notifications permanently cleared from database.');
        setTimeout(() => this.successMessage.set(null), 4000);
      },
      error: () => {
        this.clearingHistory.set(false);
        this.showClearModal.set(false);
        this.errorMessage.set('Failed to clear notifications.');
      }
    });
  }
}
