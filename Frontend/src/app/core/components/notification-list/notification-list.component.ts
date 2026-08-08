// notification-list.component.ts
// List UI to display notifications and mark them read.

import { Component, OnInit } from '@angular/core';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-notification-list',
  templateUrl: './notification-list.component.html',
  styleUrls: ['./notification-list.component.css']
})
export class NotificationListComponent implements OnInit {
  notifications: any[] = [];
  loading = false;
  error: string | null = null;

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.notificationService.getNotifications().subscribe({
      next: (res: any) => {
        // Support both direct arrays and paginated response
        this.notifications = Array.isArray(res) ? res : (res?.data || []);
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load notifications';
        this.loading = false;
        console.error(err);
      }
    });
  }

  markAsRead(n: any): void {
    if (n.read) return;
    this.notificationService.markRead(n.id || n._id || n.notification_id).subscribe({
      next: () => { n.read = true; },
      error: (err) => { console.error('Failed to mark as read', err); }
    });
  }

  markAllAsRead(): void {
    const unreadIds = (this.notifications || []).filter(n => !n.read).map(n => n.id || n._id || n.notification_id);
    this.notificationService.markAllRead(unreadIds).subscribe({
      next: () => { this.notifications.forEach((x: any) => x.read = true); },
      error: (err) => { console.error('Failed to mark all as read', err); }
    });
  }

  hasUnread(): boolean { return this.notifications.some(n => !n.read); }
}
