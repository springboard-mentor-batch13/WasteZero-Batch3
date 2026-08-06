// ============================================
// INBOX PAGE — WasteZero Milestone 3
// Route: /inbox
// Composes ConversationListComponent + ChatHistoryComponent, wired
// together with plain REST calls (Tasks 2 & 3). This is a separate,
// simpler REST-only page from the existing socket-driven /messages
// feature (MessagesPage) — it does not touch or replace that page.
// ============================================

import { Component, signal } from '@angular/core';
import { ConversationListComponent } from '../../../../shared/components/conversation-list/conversation-list.component';
import { ChatHistoryComponent } from '../../../../shared/components/chat-history/chat-history.component';
import { Conversation } from '../../../../core/models/message.model';

@Component({
  selector: 'app-inbox-page',
  standalone: true,
  imports: [ConversationListComponent, ChatHistoryComponent],
  templateUrl: './inbox-page.html',
  styleUrl: './inbox-page.css',
})
export class InboxPage {
  selectedConversation = signal<Conversation | null>(null);

  onConversationSelect(conv: Conversation): void {
    this.selectedConversation.set(conv);
  }
}
