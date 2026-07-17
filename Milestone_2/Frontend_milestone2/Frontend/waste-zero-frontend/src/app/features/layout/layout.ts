import { Component, inject, HostListener } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-layout',
  standalone: true,
   imports: [
  RouterOutlet,
  RouterLink,
  RouterLinkActive,
  TitleCasePipe
],
  templateUrl: './layout.html',
  styleUrl: './layout.css'
})
export class Layout {

  private router = inject(Router);

  // Make this public so HTML can use it
  public authService = inject(AuthService);

  // ── Dropdown state ──────────────────────────────────────────
  profileDropdownOpen = false;
  notificationsOpen   = false;

  toggleProfileDropdown(event: Event): void {
    event.stopPropagation();
    this.profileDropdownOpen = !this.profileDropdownOpen;
    this.notificationsOpen   = false;
  }

  toggleNotifications(event: Event): void {
    event.stopPropagation();
    this.notificationsOpen   = !this.notificationsOpen;
    this.profileDropdownOpen = false;
  }

  /** Clicking anywhere outside a dropdown closes both. */
  @HostListener('document:click')
  closeDropdowns(): void {
    this.profileDropdownOpen = false;
    this.notificationsOpen   = false;
  }

  /** Pressing Escape also closes all dropdowns. */
  @HostListener('keydown.escape')
  onEscapeKey(): void {
    this.profileDropdownOpen = false;
    this.notificationsOpen   = false;
  }
  // ────────────────────────────────────────────────────────────

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

}