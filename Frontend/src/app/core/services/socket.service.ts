// ============================================
// SOCKET SERVICE — WasteZero Milestone 3
// Wraps the Socket.IO client for real-time messaging.
// Connection lifecycle: connect on login, disconnect on logout.
// Auth: JWT sent via auth.token at handshake (per SOCKET_DOCUMENTATION.md §1).
// ============================================

import { Injectable, NgZone, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

import { environment } from '../../../environments/environment';
import { Message } from '../models/message.model';
import { Notification } from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class SocketService {

  private zone = inject(NgZone);

  private socket: Socket | null = null;

  // ── Subjects for server-pushed events ────────────────────────────────
  // Using Subject so multiple components can subscribe independently.
  private messageSubject       = new Subject<Message>();
  private typingSubject        = new Subject<{ senderId: string }>();
  private readReceiptSubject   = new Subject<{ conversationId: string; readerId: string }>();
  private notificationSubject  = new Subject<Notification>();

  // ── Observables (public) ─────────────────────────────────────────────
  readonly message$     = this.messageSubject.asObservable();
  readonly typing$      = this.typingSubject.asObservable();
  readonly readReceipt$ = this.readReceiptSubject.asObservable();
  readonly notification$ = this.notificationSubject.asObservable();

  // ─────────────────────────────────────────────────────────────────────
  // CONNECT
  // Called after successful login with the raw JWT (no "Bearer" prefix).
  // The server expects: auth: { token: 'Bearer <jwt>' }
  // ─────────────────────────────────────────────────────────────────────
  connect(token: string): void {
    if (this.socket?.connected) {
      return; // already connected
    }

    this.socket = io(environment.socketUrl, {
      auth: { token: `Bearer ${token}` },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket?.id);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });

    // ── Server → Client events ──────────────────────────────────────
    // All events run outside zone (Socket.IO callbacks) and must be
    // brought back into Angular's signal scheduler via zone.run().
    // Signals are zone-agnostic but Subjects need to be in the scheduler.

    this.socket.on('message:new', (msg: Message) => {
      this.zone.run(() => this.messageSubject.next(msg));
    });

    this.socket.on('message:typing', (payload: { senderId: string }) => {
      this.zone.run(() => this.typingSubject.next(payload));
    });

    this.socket.on('message:read', (payload: { conversationId: string; readerId: string }) => {
      this.zone.run(() => this.readReceiptSubject.next(payload));
    });

    this.socket.on('notification:new', (notif: Notification) => {
      this.zone.run(() => this.notificationSubject.next(notif));
    });

    this.socket.on('error', (err: { event: string; message: string }) => {
      console.error('[Socket] Event error:', err);
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // DISCONNECT — call on logout
  // ─────────────────────────────────────────────────────────────────────
  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    console.log('[Socket] Disconnected');
  }

  // ─────────────────────────────────────────────────────────────────────
  // SEND MESSAGE
  // Returns a Promise that resolves with the saved Message or rejects
  // with the error message string from the ACK.
  // ─────────────────────────────────────────────────────────────────────
  sendMessage(receiverId: string, content: string): Promise<Message> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Not connected to messaging server'));
        return;
      }

      this.socket.emit(
        'message:send',
        { receiverId, content },
        (ack: { success: boolean; data?: Message; message?: string }) => {
          if (ack.success && ack.data) {
            resolve(ack.data);
          } else {
            reject(new Error(ack.message || 'Failed to send message'));
          }
        }
      );
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // MARK CONVERSATION READ
  // Fire-and-forget with ACK (errors logged, not surfaced to UI)
  // ─────────────────────────────────────────────────────────────────────
  markRead(conversationId: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit(
      'message:read',
      { conversationId },
      (ack: { success: boolean; message?: string }) => {
        if (!ack.success) {
          console.warn('[Socket] markRead failed:', ack.message);
        }
      }
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // TYPING INDICATOR — fire-and-forget, no ACK
  // ─────────────────────────────────────────────────────────────────────
  sendTyping(receiverId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('message:typing', { receiverId });
  }

  // ─────────────────────────────────────────────────────────────────────
  // CONNECTED STATE
  // ─────────────────────────────────────────────────────────────────────
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

}
