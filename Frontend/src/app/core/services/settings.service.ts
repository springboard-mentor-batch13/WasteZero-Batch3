import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserSettings } from '../models/user.model';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';

export const DEFAULT_SETTINGS: UserSettings = {
  emailNotifications: true,
  pushNotifications: true,
  messageAlerts: true,
  pickupAlerts: true,
  opportunityAlerts: true,
  themePreference: 'system',
};

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private themeService = inject(ThemeService);

  private readonly baseUrl = `${environment.apiUrl}/users/settings`;

  private settingsSignal = signal<UserSettings>({ ...DEFAULT_SETTINGS });
  readonly settings = this.settingsSignal.asReadonly();

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken() || (typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null);
    return new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    });
  }

  /**
   * Fetch logged-in user settings from the backend API
   */
  getSettings(): Observable<{ success: boolean; settings: UserSettings }> {
    return this.http.get<{ success: boolean; settings: UserSettings }>(this.baseUrl, {
      headers: this.getHeaders()
    }).pipe(
      tap((res) => {
        if (res && res.success && res.settings) {
          const loaded: UserSettings = {
            emailNotifications: res.settings.emailNotifications ?? true,
            pushNotifications: res.settings.pushNotifications ?? true,
            messageAlerts: res.settings.messageAlerts ?? true,
            pickupAlerts: res.settings.pickupAlerts ?? true,
            opportunityAlerts: res.settings.opportunityAlerts ?? true,
            themePreference: res.settings.themePreference ?? 'system',
          };
          this.settingsSignal.set(loaded);
          this.authService.updateUserSession({ settings: loaded });
          if (loaded.themePreference) {
            this.themeService.setTheme(loaded.themePreference);
          }
        }
      })
    );
  }

  /**
   * Update logged-in user settings via the backend API
   */
  updateSettings(settings: Partial<UserSettings>): Observable<{ success: boolean; message: string; settings: UserSettings }> {
    return this.http.put<{ success: boolean; message: string; settings: UserSettings }>(
      this.baseUrl,
      settings,
      { headers: this.getHeaders() }
    ).pipe(
      tap((res) => {
        if (res && res.success && res.settings) {
          const updated: UserSettings = {
            emailNotifications: res.settings.emailNotifications ?? true,
            pushNotifications: res.settings.pushNotifications ?? true,
            messageAlerts: res.settings.messageAlerts ?? true,
            pickupAlerts: res.settings.pickupAlerts ?? true,
            opportunityAlerts: res.settings.opportunityAlerts ?? true,
            themePreference: res.settings.themePreference ?? 'system',
          };
          this.settingsSignal.set(updated);
          this.authService.updateUserSession({ settings: updated });
          if (updated.themePreference) {
            this.themeService.setTheme(updated.themePreference);
          }
        }
      })
    );
  }

  /**
   * Set local signal value
   */
  setLocalSettings(settings: UserSettings): void {
    this.settingsSignal.set(settings);
  }
}
