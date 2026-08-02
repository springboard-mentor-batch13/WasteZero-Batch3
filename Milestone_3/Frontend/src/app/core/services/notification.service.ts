// ============================================
// NOTIFICATION SERVICE — WasteZero Milestone 3
// REST endpoints + socket subscription bridge.
// API: GET /api/notifications
//      PUT /api/notifications/:id/read
// Socket: notification:new (handled via SocketService)
// ============================================

import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  NotificationListResponse,
  NotificationResponse,
} from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationService {

  private http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/notifications`;

  // ── Unread count signal (drives the bell badge) ───────────────────────
  unreadCount = signal(0);

  // ── Auth Headers ─────────────────────────────────────────────────────
  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ── GET /api/notifications ────────────────────────────────────────────
  // Paginated, newest-first notification list.
  getNotifications(page = 1, limit = 20): Observable<NotificationListResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    return this.http.get<NotificationListResponse>(this.baseUrl, {
      headers: this.getHeaders(),
      params,
    });
  }

  // ── PUT /api/notifications/:id/read ──────────────────────────────────
  // Marks one notification as read. Ownership enforced by backend.
  markRead(id: string): Observable<NotificationResponse> {
    return this.http.put<NotificationResponse>(
      `${this.baseUrl}/${id}/read`,
      {},
      { headers: this.getHeaders() }
    );
  }

  // ── Increment unread count (called from layout when notification:new arrives) ──
  incrementUnread(): void {
    this.unreadCount.update(n => n + 1);
  }

  // ── Reset unread count (called when panel is opened and list is fetched) ──
  resetUnread(): void {
    this.unreadCount.set(0);
  }

}
