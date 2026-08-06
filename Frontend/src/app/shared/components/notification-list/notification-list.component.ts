// ============================================
// NOTIFICATION LIST COMPONENT — WasteZero Milestone 3 (Task 1)
// Standalone, reusable list UI for viewing notifications and marking
// them as read. Uses only NotificationService (plain HttpClient/REST).
//
// Endpoints actually used (see NotificationService):
//   GET /api/notifications              → list
//   PUT /api/notifications/:id/read     → mark one as read
//   "Mark all as read" fans the above call out per-unread-item, since the
//   backend does not expose PATCH /api/notifications/read-all.
// ============================================

import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

import { NotificationService } from '../../../core/services/notification.service';
import { Notification } from '../../../core/models/notification.model';

@Component({
  selector: 'app-notification-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-list.component.html',
  styleUrl: './notification-list.component.css',
})
export class NotificationListComponent implements OnInit {

  private notificationService = inject(NotificationService);

  notifications = signal<Notification[]>([]);
  loading       = signal(false);
  error         = signal('');

  // IDs currently being marked (disables their button while in flight)
  markingIds    = signal<Set<string>>(new Set());
  markingAll    = signal(false);

  readonly unreadNotifications = computed(() =>
    this.notifications().filter(n => !n.isRead)
  );

  readonly hasUnread = computed(() => this.unreadNotifications().length > 0);

  ngOnInit(): void {
    this.loadNotifications();
  }

  loadNotifications(): void {
    this.loading.set(true);
    this.error.set('');

    this.notificationService.getNotifications().subscribe({
      next: (res) => {
        this.notifications.set(res.data.notifications);
        this.loading.set(false);
        this.notificationService.resetUnread();
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load notifications.');
        this.loading.set(false);
      }
    });
  }

  markAsRead(notif: Notification): void {
    if (notif.isRead || this.markingIds().has(notif._id)) return;

    this.markingIds.update(set => new Set(set).add(notif._id));

    this.notificationService.markRead(notif._id).subscribe({
      next: (res) => {
        this.notifications.update(list =>
          list.map(n => n._id === notif._id ? res.data : n)
        );
        this.markingIds.update(set => {
          const next = new Set(set);
          next.delete(notif._id);
          return next;
        });
      },
      error: () => {
        this.markingIds.update(set => {
          const next = new Set(set);
          next.delete(notif._id);
          return next;
        });
      }
    });
  }

  markAllAsRead(): void {
    const unreadIds = this.unreadNotifications().map(n => n._id);
    if (unreadIds.length === 0 || this.markingAll()) return;

    this.markingAll.set(true);

    this.notificationService.markAllRead(unreadIds).subscribe({
      next: (updated) => {
        const updatedById = new Map(updated.map(n => [n._id, n]));
        this.notifications.update(list =>
          list.map(n => updatedById.get(n._id) ?? n)
        );
        this.markingAll.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to mark all as read.');
        this.markingAll.set(false);
      }
    });
  }

  trackById(_index: number, notif: Notification): string {
    return notif._id;
  }

  formatTime(dateStr: string): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return '';
    }
  }
}
