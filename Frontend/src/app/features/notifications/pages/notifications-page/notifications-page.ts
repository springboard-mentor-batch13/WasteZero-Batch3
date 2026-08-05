// ============================================
// NOTIFICATIONS PAGE — WasteZero Milestone 3
// Route: /notifications
// Thin page shell around the reusable NotificationListComponent.
// ============================================

import { Component } from '@angular/core';
import { NotificationListComponent } from '../../../../shared/components/notification-list/notification-list.component';

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [NotificationListComponent],
  templateUrl: './notifications-page.html',
})
export class NotificationsPage {}
