import { Injectable, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * ThemeService — single source of truth for dark mode state.
 *
 * Both the Layout component and auth pages (Login, Register) inject this
 * service so all dark mode toggles stay in sync via the same signal.
 *
 * Persistence key: 'wz-dark-mode' (localStorage) — same key the Layout
 * component already uses, so existing persisted preferences are preserved.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {

  private platformId = inject(PLATFORM_ID);

  readonly isDark = signal<boolean>(this._readPreference());

  /** Toggle dark mode, persist preference, and update <html> class. */
  toggle(): void {
    const next = !this.isDark();
    this.isDark.set(next);
    this._apply(next);
  }

  /** Explicitly set dark mode state. */
  setDark(dark: boolean): void {
    this.isDark.set(dark);
    this._apply(dark);
  }

  /** Set theme by preference mode ('light' | 'dark' | 'system'). */
  setTheme(theme: 'light' | 'dark' | 'system'): void {
    if (theme === 'dark') {
      this.setDark(true);
    } else if (theme === 'light') {
      this.setDark(false);
    } else {
      if (typeof window !== 'undefined' && window.matchMedia) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.setDark(prefersDark);
      } else {
        this.setDark(false);
      }
    }
  }

  /** Apply saved preference on app start. */
  applyPreference(): void {
    const saved = this._readPreference();
    this.isDark.set(saved);
    this._apply(saved);
  }

  // ── Private helpers ────────────────────────────────────────────────

  private _readPreference(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      return localStorage.getItem('wz-dark-mode') === 'true';
    } catch {
      return false;
    }
  }

  private _apply(dark: boolean): void {
    if (!isPlatformBrowser(this.platformId)) return;
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('wz-dark-mode', String(dark));
    } catch { /* storage unavailable */ }
  }
}
