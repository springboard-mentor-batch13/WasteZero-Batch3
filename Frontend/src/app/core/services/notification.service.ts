// ============================================
// NOTIFICATION SERVICE — WasteZero Milestone 3
// REST endpoints + socket subscription bridge.
// API: GET /api/notifications
//      GET /api/notifications/unread-count
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

export interface UnreadCountResponse {
  success: boolean;
  message: string;
  data: { count: number };
}

@Injectable({ providedIn: 'root' })
export class NotificationService {

  private http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/notifications`;

  // ── Unread count signal (drives the bell badge) ───────────────────────
  // Starts at 0 and is seeded from the backend on app init via
  // seedUnreadCount(), so the badge persists across refresh and re-login.
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

  // ── GET /api/notifications/unread-count ───────────────────────────────
  // Returns { count: N } — used to seed the badge on app start.
  getUnreadCount(): Observable<UnreadCountResponse> {
    return this.http.get<UnreadCountResponse>(
      `${this.baseUrl}/unread-count`,
      { headers: this.getHeaders() }
    );
  }

  // ── Seed unread count from backend (call on ngOnInit after login) ─────
  // This makes the badge persistent across refresh and re-login.
  seedUnreadCount(): void {
    this.getUnreadCount().subscribe({
      next: (res) => {
        if (res.success) {
          this.unreadCount.set(res.data.count);
        }
      },
      error: () => {
        // Non-critical: badge stays at 0 if the request fails.
      }
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

  // ── PUT /api/notifications/conversation/:conversationId/read ──────────
  // Marks ALL unread message-type notifications for a conversation as read.
  // Used when the user clicks any message notification — clears the whole
  // conversation's notification backlog at once.
  markConversationRead(conversationId: string): Observable<{ success: boolean; data: { updated: number } }> {
    return this.http.put<{ success: boolean; data: { updated: number } }>(
      `${this.baseUrl}/conversation/${conversationId}/read`,
      {},
      { headers: this.getHeaders() }
    );
  }

  // ── PUT /api/notifications/read-all?category=... ────────────────────
  // Marks all unread notifications in a specific category (or all) as read.
  markAllRead(category?: 'general' | 'messages' | 'text' | 'all'): Observable<{ success: boolean; data: { updated: number } }> {
    let params = new HttpParams();
    if (category && category !== 'all') {
      params = params.set('category', category === 'messages' ? 'text' : category);
    }
    return this.http.put<{ success: boolean; data: { updated: number } }>(
      `${this.baseUrl}/read-all`,
      {},
      { headers: this.getHeaders(), params }
    );
  }

  // ── DELETE /api/notifications ─────────────────────────────────────────
  // Permanently clears all notifications for the user from the database.
  clearAll(): Observable<{ success: boolean; data: { deleted: number } }> {
    return this.http.delete<{ success: boolean; data: { deleted: number } }>(
      this.baseUrl,
      { headers: this.getHeaders() }
    );
  }

  // ── Increment unread count (called from layout when notification:new arrives) ──
  incrementUnread(): void {
    this.unreadCount.update(n => n + 1);
  }

  // ── Decrement unread count by 1 (called when one notification is marked read) ──
  decrementUnread(): void {
    this.unreadCount.update(n => Math.max(0, n - 1));
  }

  // ── Set unread count to exact value (called after loading notifications) ──
  setUnreadCount(n: number): void {
    this.unreadCount.set(Math.max(0, n));
  }

}

