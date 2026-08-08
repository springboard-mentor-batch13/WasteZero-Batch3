// chat-history.component.ts
// Displays chat messages for a selected conversation and styles them differently
// depending on whether they were sent by the current user.

import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { MessageService } from '../../message.service';

@Component({ selector: 'app-chat-history', templateUrl: './chat-history.component.html', styleUrls: ['./chat-history.component.css'] })
export class ChatHistoryComponent implements OnChanges {
  @Input() conversationId?: string | number;
  @Input() currentUserId?: number | string;
  messages: any[] = [];
  loading = false;
  constructor(private messageService: MessageService) {}
  ngOnChanges(changes: SimpleChanges): void { if (changes.conversationId && this.conversationId != null) { this.loadHistory(); } }
  loadHistory(): void {
    if (!this.conversationId) { this.messages = []; return; }
    this.loading = true;
    this.messageService.getChatHistory(this.conversationId).subscribe({ next: (msgs) => { this.messages = msgs || []; this.loading = false; }, error: (err) => { console.error(err); this.loading = false; } });
  }
  isMine(msg: any): boolean { return this.currentUserId != null && msg.sender_id === this.currentUserId; }
}
