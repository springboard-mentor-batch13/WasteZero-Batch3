// ============================================
// MESSAGE SERVICE — WasteZero Milestone 3
// REST endpoints for conversation history.
// Real-time sends are handled by SocketService.
// API: GET /api/messages/conversations
//      GET /api/messages?with=:userId
// ============================================

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ConversationListResponse,
  MessageHistoryResponse,
} from '../models/message.model';

@Injectable({ providedIn: 'root' })
export class MessageService {

  private http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/messages`;

  // ── Auth Headers ─────────────────────────────────────────────────────
  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ── GET /api/messages/conversations ──────────────────────────────────
  // Returns WhatsApp-style conversation list sorted by last message time.
  getConversations(): Observable<ConversationListResponse> {
    return this.http.get<ConversationListResponse>(
      `${this.baseUrl}/conversations`,
      { headers: this.getHeaders() }
    );
  }

  // ── GET /api/messages?with=:userId ───────────────────────────────────
  // Returns full message history between the logged-in user and another user.
  getMessageHistory(withUserId: string): Observable<MessageHistoryResponse> {
    const params = new HttpParams().set('with', withUserId);
    return this.http.get<MessageHistoryResponse>(this.baseUrl, {
      headers: this.getHeaders(),
      params,
    });
  }

}
