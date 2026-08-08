// notification.service.ts
// Responsible for fetching and marking notifications as read.
// NOTE: We preserve comments and keep functions small for testability.

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AppNotification {
  id: number;
  title: string;
  body: string;
  timestamp: string; // ISO string from backend
  read: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  // Base API path can be changed centrally if needed
  private base = '/api/notifications';

  constructor(private http: HttpClient) {}

  // GET /api/notifications
  getNotifications(): Observable<AppNotification[]> {
    return this.http.get<AppNotification[]>(`${this.base}`);
  }

  // PATCH /api/notifications/:id/read
  markAsRead(id: number): Observable<any> {
    // backend expected to set the individual notification as read
    return this.http.patch(`${this.base}/${id}/read`, {});
  }

  // PATCH /api/notifications/read-all
  markAllAsRead(): Observable<any> {
    // backend expected to mark all notifications as read
    return this.http.patch(`${this.base}/read-all`, {});
  }
}
