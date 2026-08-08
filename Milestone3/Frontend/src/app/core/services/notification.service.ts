// Advanced notification service copied to replace duplicate in Milestone3/Frontend
// ============================================
// NOTIFICATION SERVICE — WasteZero Milestone 3
// REST endpoints + socket subscription bridge.
// API: GET /api/notifications
//      PUT /api/notifications/:id/read
// Socket: notification:new (handled via SocketService)
// ============================================

import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import {
  Notification,
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

  // ── "Mark All as Read" ───────────────────────────────────────────────
  // NOTE: The Backend has no bulk endpoint (no PATCH /api/notifications/read-all
  // route exists in Backend/routes/notification.routes.js — only the
  // single-item PUT /api/notifications/:id/read is implemented). Rather than
  // call a route that doesn't exist, this fans out the existing per-item
  // endpoint for every currently-unread notification and joins the results.
  // If a bulk endpoint is added to the backend later, swap this method's
  // body for a single PATCH call.
  markAllRead(unreadIds: string[]): Observable<Notification[]> {
    if (unreadIds.length === 0) {
      return of([]);
    }
    const calls = unreadIds.map(id =>
      this.markRead(id).pipe(map(res => res.data))
    );
    return forkJoin(calls);
  }

  // ── Increment unread count (called from layout when notification:new arrives) ──
  incrementUnread(): void { this.unreadCount.update(n => n + 1); }

  // ── Reset unread count (called when panel is opened and list is fetched) ──
  resetUnread(): void { this.unreadCount.set(0); }

}
