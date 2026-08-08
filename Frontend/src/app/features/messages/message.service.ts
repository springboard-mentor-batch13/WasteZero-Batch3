// message.service.ts
// Provides message-related API calls used by conversation and chat components.

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Conversation {
  conversation_id: string;
  title?: string;
  participants?: any[];
  lastMessage?: {
    content: string;
    timestamp: string;
    sender_id?: number | string;
  };
}

export interface ChatMessage {
  id: number;
  conversation_id: string;
  sender_id: number | string;
  content: string;
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class MessageService {
  private base = '/api/messages';
  constructor(private http: HttpClient) {}

  getConversations(): Observable<Conversation[]> { return this.http.get<Conversation[]>(`${this.base}/conversations`); }
  getChatHistory(conversationId: string | number): Observable<ChatMessage[]> { return this.http.get<ChatMessage[]>(`${this.base}/${conversationId}`); }
}
