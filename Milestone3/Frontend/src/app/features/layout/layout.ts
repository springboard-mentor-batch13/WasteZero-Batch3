import { Component, inject, HostListener, OnInit, OnDestroy, signal } from '@angular/core';
import { TitleCasePipe, NgClass } from '@angular/common';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { SocketService } from '../../core/services/socket.service';
import { NotificationService } from '../../core/services/notification.service';
import { Notification, NotificationType } from '../../core/models/notification.model';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TitleCasePipe,
    NgClass,
  ],
  templateUrl: './layout.html',
  styleUrl: './layout.css'
})
export class Layout implements OnInit, OnDestroy {

  private router = inject(Router);

  // Public — consumed by the template
  public authService           = inject(AuthService);
  public notificationService   = inject(NotificationService);
  private socketService        = inject(SocketService);

  private destroy$ = new Subject<void>();

  // ── Dropdown state ──────────────────────────────────────────
  profileDropdownOpen  = false;
  notificationsOpen    = false;

  // ── Notification panel state (signals for zoneless change detection) ──
  notifications        = signal<Notification[]>([]);
  loadingNotifications = signal(false);

  // ── Notification tab (UI categorization only — no API change) ────────
  notifTab = signal<'general' | 'messages'>('general');

  // Computed filtered views — derived from existing notifications signal
  readonly generalNotifications = () =>
    this.notifications().filter(n => n.type !== 'message');

  readonly messageNotifications = () =>
    this.notifications().filter(n => n.type === 'message');

  // Active list based on selected tab
  readonly activeNotifications = () =>
    this.notifTab() === 'messages'
      ? this.messageNotifications()
      : this.generalNotifications();

  // ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // Connect socket using stored JWT (user is already logged in)
    const token = this.authService.getToken();
    if (token) {
      this.socketService.connect(token);
    }

    // Listen for real-time notifications → increment badge
    this.socketService.notification$
      .pipe(takeUntil(this.destroy$))
      .subscribe((notif) => {
        this.notificationService.incrementUnread();
        // Prepend to panel list if already loaded
        if (this.notifications().length > 0) {
          this.notifications.update(list => [notif, ...list]);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Dropdown toggles ─────────────────────────────────────────

  toggleProfileDropdown(event: Event): void {
    event.stopPropagation();
    this.profileDropdownOpen = !this.profileDropdownOpen;
    this.notificationsOpen   = false;
  }

  toggleNotifications(event: Event): void {
    event.stopPropagation();
    this.notificationsOpen   = !this.notificationsOpen;
    this.profileDropdownOpen = false;

    if (this.notificationsOpen) {
      this.loadNotifications();
    }
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

  // ── Notification panel ───────────────────────────────────────

  private loadNotifications(): void {
    this.loadingNotifications.set(true);
    this.notificationService.getNotifications()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.notifications.set(res.data.notifications);
          this.loadingNotifications.set(false);
          this.notificationService.resetUnread();
        },
        error: () => {
          this.loadingNotifications.set(false);
        }
      });
  }

  onNotifClick(notif: Notification): void {
    // Mark as read on backend
    if (!notif.isRead) {
      this.notificationService.markRead(notif._id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.notifications.update(list =>
              list.map(n =>
                n._id === notif._id ? { ...n, isRead: true } : n
              )
            );
          }
        });
    }

    // Navigate based on notification type
    this.notificationsOpen = false;
    if (notif.type === 'message') {
      this.router.navigate(['/messages']);
    } else if (notif.type === 'opportunity_match') {
      this.router.navigate(['/opportunities', notif.reference_id]);
    } else if (notif.type === 'pickup_match') {
      // M3: Role-based pickup routing
      const role = this.authService.getCurrentUser()?.role;
      if (role === 'volunteer') this.router.navigate(['/pickups/schedule']);
      else if (role === 'ngo')  this.router.navigate(['/pickups/manage']);
      else                       this.router.navigate(['/pickups/monitor']);
    }
  }

  // ── Notification icon helpers ─────────────────────────────────

  getNotifIcon(type: NotificationType): string {
    switch (type) {
      case 'message':           return 'chat_bubble_outline';
      case 'opportunity_match': return 'volunteer_activism';
      case 'pickup_match':      return 'local_shipping';
      default:                  return 'notifications';
    }
  }

  getNotifIconClass(type: NotificationType): string {
    switch (type) {
      case 'message':           return 'notif-icon-message';
      case 'opportunity_match': return 'notif-icon-opportunity';
      case 'pickup_match':      return 'notif-icon-pickup';
      default:                  return '';
    }
  }

  formatNotifTime(dateStr: string): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleString([], {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return '';
    }
  }

  // M3: Notification action button label
  getNotifActionLabel(type: NotificationType): string {
    switch (type) {
      case 'message':           return 'View Message';
      case 'opportunity_match': return 'View Opportunity';
      case 'pickup_match':      return 'View Pickup';
      default:                  return '';
    }
  }

  // M3: Notification action button icon
  getNotifActionIcon(type: NotificationType): string {
    switch (type) {
      case 'message':           return 'chat_bubble_outline';
      case 'opportunity_match': return 'volunteer_activism';
      case 'pickup_match':      return 'local_shipping';
      default:                  return 'open_in_new';
    }
  }

  // M3: Action button click — marks read then navigates
  navigateFromNotif(notif: Notification): void {
    this.onNotifClick(notif);
  }

  // ────────────────────────────────────────────────────────────

  logout(): void {
    this.socketService.disconnect();
    this.authService.logout();
    this.router.navigate(['/login']);
  }

}