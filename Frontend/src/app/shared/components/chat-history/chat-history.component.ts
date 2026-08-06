// ============================================
// CHAT HISTORY COMPONENT — WasteZero Milestone 3 (Task 3)
// Displays the message log for a selected conversation. REST-only
// (HttpClient), no socket dependency — for live updates use the existing
// socket-driven MessagesPage instead.
//
// Endpoint used: MessageService.getChatHistory(otherUserId), which wraps
// GET /api/messages?with=:userId — see message.service.ts for why this
// differs from the task's literal GET /api/messages/:conversationId
// (that route doesn't exist in the backend).
// ============================================

import { Component, Input, inject, signal, computed, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MessageService } from '../../../core/services/message.service';
import { AuthService } from '../../../core/services/auth.service';
import { Conversation, Message } from '../../../core/models/message.model';

@Component({
  selector: 'app-chat-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat-history.component.html',
  styleUrl: './chat-history.component.css',
})
export class ChatHistoryComponent implements OnChanges {

  private messageService = inject(MessageService);
  private authService    = inject(AuthService);

  // The active conversation to display. Supplied by a parent such as
  // InboxPage after ConversationListComponent emits a selection.
  @Input() conversation: Conversation | null = null;

  messages = signal<Message[]>([]);
  loading  = signal(false);
  error    = signal('');

  readonly currentUserId = computed(() => {
    const u = this.authService.currentUser();
    return u?._id ?? u?.id ?? '';
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['conversation']) {
      this.loadHistory();
    }
  }

  loadHistory(): void {
    const conv = this.conversation;
    if (!conv) {
      this.messages.set([]);
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.messageService.getChatHistory(conv.otherUser._id).subscribe({
      next: (res) => {
        this.messages.set(res.data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load chat history.');
        this.loading.set(false);
      }
    });
  }

  isMine(msg: Message): boolean {
    return msg.sender_id === this.currentUserId();
  }

  trackById(_index: number, msg: Message): string {
    return msg._id;
  }

  formatTime(dateStr: string): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }
}
