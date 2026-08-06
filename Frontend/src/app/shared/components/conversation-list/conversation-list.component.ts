// ============================================
// CONVERSATION LIST COMPONENT — WasteZero Milestone 3 (Task 2)
// Sidebar list of recent chat conversations. REST-only (HttpClient),
// no socket dependency.
//
// Endpoint used: GET /api/messages/conversations (MessageService.getConversations())
//
// NOTE on the @Output contract: the task asks to "emit the selected
// conversation_id on click". This component does emit conversationSelect
// with the full Conversation object (which carries conversation_id as
// `.conversationId`) rather than a bare string. That's because the real
// Chat History endpoint (GET /api/messages?with=:userId — see
// MessageService.getChatHistory) needs the OTHER PARTICIPANT's user id,
// not the conversation id; a bare conversation_id alone isn't enough for
// a consumer like ChatHistoryComponent to actually fetch the thread. The
// id is still available to any consumer via `conversation.conversationId`.
// ============================================

import { Component, OnInit, inject, signal, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MessageService } from '../../../core/services/message.service';
import { Conversation } from '../../../core/models/message.model';

@Component({
  selector: 'app-conversation-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './conversation-list.component.html',
  styleUrl: './conversation-list.component.css',
})
export class ConversationListComponent implements OnInit {

  private messageService = inject(MessageService);

  // Emits the selected conversation. Use `.conversationId` for the raw id.
  @Output() conversationSelect = new EventEmitter<Conversation>();

  conversations = signal<Conversation[]>([]);
  loading       = signal(false);
  error         = signal('');
  selectedId    = signal<string | null>(null);

  ngOnInit(): void {
    this.loadConversations();
  }

  loadConversations(): void {
    this.loading.set(true);
    this.error.set('');

    this.messageService.getConversations().subscribe({
      next: (res) => {
        this.conversations.set(res.data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load conversations.');
        this.loading.set(false);
      }
    });
  }

  onSelect(conv: Conversation): void {
    this.selectedId.set(conv.conversationId || conv.otherUser._id);
    this.conversationSelect.emit(conv);
  }

  trackById(_index: number, conv: Conversation): string {
    return conv.conversationId || conv.otherUser._id;
  }

  formatTime(dateStr: string | undefined): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return '';
    }
  }

  getAvatarInitial(name: string): string {
    return name?.charAt(0)?.toUpperCase() ?? '?';
  }
}
