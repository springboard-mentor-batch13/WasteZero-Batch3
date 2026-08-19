import { Component, inject, HostListener, OnInit, OnDestroy, signal, PLATFORM_ID } from '@angular/core';
import { TitleCasePipe, NgClass, isPlatformBrowser } from '@angular/common';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';
import { Subject, takeUntil, debounceTime, distinctUntilChanged, switchMap, of, forkJoin, catchError } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';

import { AuthService } from '../../core/services/auth.service';
import { SocketService } from '../../core/services/socket.service';
import { NotificationService } from '../../core/services/notification.service';
import { ThemeService } from '../../core/services/theme.service';
import { OpportunityService } from '../../core/services/opportunity.service';
import { UserSearchService, SearchUserResult } from '../../core/services/user-search.service';
import { Notification, NotificationType } from '../../core/models/notification.model';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TitleCasePipe,
    NgClass,
    FormsModule,
  ],
  templateUrl: './layout.html',
  styleUrl: './layout.css'
})
export class Layout implements OnInit, OnDestroy {

  private router             = inject(Router);
  private http               = inject(HttpClient);
  private platformId         = inject(PLATFORM_ID);
  private themeService       = inject(ThemeService);
  private opportunityService = inject(OpportunityService);
  private userSearchService  = inject(UserSearchService);

  // Public — consumed by the template
  public authService           = inject(AuthService);
  public notificationService   = inject(NotificationService);
  private socketService        = inject(SocketService);

  private destroy$      = new Subject<void>();
  private searchInput$  = new Subject<string>();

  // ── Dropdown / sidebar state ────────────────────────────────
  profileDropdownOpen  = false;
  notificationsOpen    = false;
  sidebarOpen          = signal(false);   // mobile sidebar

  // ── Dark mode — delegated to ThemeService (shared with auth pages) ──
  readonly isDark = this.themeService.isDark;

  // ── Global Search — opportunities + searchable users ────────
  searchQuery       = signal('');
  searchResults     = signal<{_id:string; title:string; location?:string; status?:string}[]>([]);
  userSearchResults = signal<SearchUserResult[]>([]);
  searchLoading     = signal(false);
  searchOpen        = signal(false);

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

  // ── Per-tab unread dot helpers ────────────────────────────────────────
  readonly hasUnreadGeneral = () =>
    this.generalNotifications().some(n => !n.isRead);

  readonly hasUnreadMessages = () =>
    this.messageNotifications().some(n => !n.isRead);

  // ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // ── Restore dark mode preference via ThemeService ───────────
    this.themeService.applyPreference();

    // ── Debounced search (300ms, min 2 chars) ───────────────────
    this.searchInput$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(q => {
          if (q.length < 2) {
            this.searchResults.set([]);
            this.userSearchResults.set([]);
            this.searchOpen.set(false);
            this.searchLoading.set(false);
            return of(null);
          }
          this.searchLoading.set(true);
          const currentRole = this.authService.currentUser()?.role;
          const searchOpps$ = this.opportunityService.searchOpportunities(q).pipe(catchError(() => of(null)));
          const searchUsers$ = (currentRole === 'volunteer' || currentRole === 'ngo' || currentRole === 'admin')
            ? this.userSearchService.searchUsers(q).pipe(catchError(() => of(null)))
            : of(null);

          return forkJoin({ opps: searchOpps$, users: searchUsers$ }).pipe(
            catchError(() => of(null))
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(res => {
        this.searchLoading.set(false);
        if (res) {
          const oppsRes = res.opps;
          const usersRes = res.users;

          const opps = oppsRes?.data
            ? (Array.isArray(oppsRes.data) ? oppsRes.data : ((oppsRes.data as any).opportunities ?? []))
            : [];
          this.searchResults.set(opps);

          const users = usersRes?.data
            ? (Array.isArray(usersRes.data) ? usersRes.data : [])
            : [];
          this.userSearchResults.set(users);

          this.searchOpen.set(this.searchQuery().length >= 2);
        } else {
          this.searchResults.set([]);
          this.userSearchResults.set([]);
          this.searchOpen.set(this.searchQuery().length >= 2);
        }
      });

    // Connect socket using stored JWT (user is already logged in)
    const token = this.authService.getToken();
    if (token) {
      this.socketService.connect(token);
    }

    // Seed the unread badge from persisted backend data so the indicator
    // survives refresh and re-login (fixes the temporary-alert bug).
    this.notificationService.seedUnreadCount();

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

    // ── account:suspended — force logout the current session ────────────
    // Backend emits this Socket.IO event when an admin suspends the logged-in user.
    // HTTP protection is also enforced server-side on every request.
    this.socketService.onAccountSuspended$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: { message?: string }) => {
        this.socketService.disconnect();
        this.authService.logout();
        // Store the suspension message so the login page can display it
        const msg = data?.message || 'Your account has been suspended.';
        sessionStorage.setItem('suspension_notice', msg);
        this.router.navigate(['/login']);
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

  /** Pressing Escape closes all dropdowns and clears search results. */
  @HostListener('keydown.escape')
  onEscapeKey(): void {
    this.profileDropdownOpen = false;
    this.notificationsOpen   = false;
    this.clearSearch();
  }

  // ── Global Search (UI-only) ───────────────────────────────────────────
  // No backend call is made. The admin panel's built-in Users tab search
  // handles user lookup without consuming the shared 5 req/min rate limit.

  // ── Dark mode — delegates to ThemeService ──────────────────
  toggleDarkMode(): void {
    this.themeService.toggle();
  }

  // ── Mobile sidebar ─────────────────────────────────────────
  toggleSidebar(): void { this.sidebarOpen.update(v => !v); }
  closeSidebar():  void { this.sidebarOpen.set(false); }

  // ── Search ─────────────────────────────────────────────────
  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.searchInput$.next(value);
    if (!value) {
      this.searchResults.set([]);
      this.userSearchResults.set([]);
      this.searchOpen.set(false);
    }
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.userSearchResults.set([]);
    this.searchOpen.set(false);
    this.searchInput$.next('');
  }

  navigateToOpportunity(id: string): void {
    this.clearSearch();
    this.router.navigate(['/opportunities', id]);
  }

  startChat(user: SearchUserResult): void {
    this.clearSearch();
    this.router.navigate(['/messages'], {
      queryParams: {
        contactId: user._id,
        contactName: user.name,
        contactRole: user.role,
        contactUsername: user.username,
      }
    });
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

          // Recompute the badge from the actual loaded data — keeps the count
          // truthful without blindly resetting to 0 on panel open.
          const unread = res.data.notifications.filter(n => !n.isRead).length;
          this.notificationService.setUnreadCount(unread);

          // Auto-select the tab that has unread items.
          // Message notifications take priority when both exist.
          const hasUnreadMsg = res.data.notifications.some(
            n => !n.isRead && n.type === 'message'
          );
          this.notifTab.set(hasUnreadMsg ? 'messages' : 'general');
        },
        error: () => {
          this.loadingNotifications.set(false);
        }
      });
  }

  onNotifClick(notif: Notification): void {
    // Mark as read on backend — only if it is currently unread
    if (!notif.isRead) {
      if (notif.type === 'message' && notif.reference_id) {
        // Message notifications: bulk-mark ALL unread notifications from this
        // conversation as read in a single backend call. reference_id is the
        // deterministic conversationId (e.g. "abc_def") shared by all message
        // notifications between these two users.
        const conversationId = notif.reference_id;
        this.notificationService.markConversationRead(conversationId)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              // Count how many notifications in this conversation were unread
              // so the badge can be decremented by the exact right amount.
              const unreadInConversation = this.notifications().filter(
                n => n.reference_id === conversationId && n.type === 'message' && !n.isRead
              ).length;

              // Mark all notifications for this conversation as read locally
              this.notifications.update(list =>
                list.map(n =>
                  n.reference_id === conversationId && n.type === 'message'
                    ? { ...n, isRead: true }
                    : n
                )
              );

              // Decrement badge by the actual number of notifications cleared
              for (let i = 0; i < unreadInConversation; i++) {
                this.notificationService.decrementUnread();
              }
            }
          });
      } else {
        // General / pickup notifications: mark the single clicked item
        this.notificationService.markRead(notif._id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              // Update local state for that single notification
              this.notifications.update(list =>
                list.map(n =>
                  n._id === notif._id ? { ...n, isRead: true } : n
                )
              );
              // Decrement badge by exactly 1
              this.notificationService.decrementUnread();
            }
          });
      }
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
    } else if (notif.type === 'pickup_missed' || notif.type === 'pickup_cancelled') {
      // M4: Missed/cancelled pickups — route to the volunteer's My Pickups tab
      const role = this.authService.getCurrentUser()?.role;
      if (role === 'volunteer') this.router.navigate(['/pickups/schedule']);
      else if (role === 'ngo')  this.router.navigate(['/pickups/manage']);
      else                       this.router.navigate(['/pickups/monitor']);
    }
  }


  // ── Modal confirmation state for Clear All ─────────────────────────
  showClearConfirmModal = signal(false);
  clearingNotifs        = signal(false);
  notifActionError      = signal<string | null>(null);

  openClearConfirm(event: Event): void {
    event.stopPropagation();
    this.notifActionError.set(null);
    this.showClearConfirmModal.set(true);
  }

  cancelClearConfirm(): void {
    if (this.clearingNotifs()) return;
    this.showClearConfirmModal.set(false);
    this.notifActionError.set(null);
  }

  confirmClearAll(): void {
    this.clearingNotifs.set(true);
    this.notifActionError.set(null);
    this.notificationService.clearAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notifications.set([]);
          this.notificationService.setUnreadCount(0);
          this.clearingNotifs.set(false);
          this.showClearConfirmModal.set(false);
        },
        error: (err) => {
          this.clearingNotifs.set(false);
          this.notifActionError.set(err?.error?.message || 'Failed to clear notifications. Please try again.');
          setTimeout(() => this.notifActionError.set(null), 5000);
        }
      });
  }

  readAllGeneral(event?: Event): void {
    if (event) event.stopPropagation();
    this.notifActionError.set(null);
    this.notificationService.markAllRead('general')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notifications.update(list =>
            list.map(n => n.type !== 'message' ? { ...n, isRead: true } : n)
          );
          this.notificationService.seedUnreadCount();
        },
        error: (err) => {
          this.notifActionError.set(err?.error?.message || 'Failed to mark notifications as read.');
          setTimeout(() => this.notifActionError.set(null), 5000);
        }
      });
  }

  readAllMessages(event?: Event): void {
    if (event) event.stopPropagation();
    this.notifActionError.set(null);
    this.notificationService.markAllRead('messages')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notifications.update(list =>
            list.map(n => n.type === 'message' ? { ...n, isRead: true } : n)
          );
          this.notificationService.seedUnreadCount();
        },
        error: (err) => {
          this.notifActionError.set(err?.error?.message || 'Failed to mark text notifications as read.');
          setTimeout(() => this.notifActionError.set(null), 5000);
        }
      });
  }

  // ── Notification icon helpers ─────────────────────────────────

  getNotifIcon(type: NotificationType): string {
    switch (type) {
      case 'message':            return 'chat_bubble_outline';
      case 'opportunity_match':  return 'volunteer_activism';
      case 'pickup_match':       return 'local_shipping';
      case 'pickup_missed':      return 'alarm_off';
      case 'pickup_cancelled':   return 'cancel';
      default:                   return 'notifications';
    }
  }

  getNotifIconClass(type: NotificationType): string {
    switch (type) {
      case 'message':            return 'notif-icon-message';
      case 'opportunity_match':  return 'notif-icon-opportunity';
      case 'pickup_match':       return 'notif-icon-pickup';
      case 'pickup_missed':      return 'notif-icon-missed';
      case 'pickup_cancelled':   return 'notif-icon-cancelled';
      default:                   return '';
    }
  }

  formatNotifTime(dateStr: string): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleString([], {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
      });
    } catch {
      return '';
    }
  }

  // M3: Notification action button label
  getNotifActionLabel(type: NotificationType): string {
    switch (type) {
      case 'message':            return 'View Message';
      case 'opportunity_match':  return 'View Opportunity';
      case 'pickup_match':       return 'View Pickup';
      case 'pickup_missed':      return 'View My Pickups';
      case 'pickup_cancelled':   return 'Reschedule';
      default:                   return '';
    }
  }

  // M3: Notification action button icon
  getNotifActionIcon(type: NotificationType): string {
    switch (type) {
      case 'message':            return 'chat_bubble_outline';
      case 'opportunity_match':  return 'volunteer_activism';
      case 'pickup_match':       return 'local_shipping';
      case 'pickup_missed':      return 'history';
      case 'pickup_cancelled':   return 'event_repeat';
      default:                   return 'open_in_new';
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
    this.router.navigate(['/login'], { replaceUrl: true });
  }

}