// conversation-list.component.ts
// Sidebar list of recent conversations; emits selected conversation_id.

import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { MessageService } from '../../message.service';

@Component({
  selector: 'app-conversation-list',
  templateUrl: './conversation-list.component.html',
  styleUrls: ['./conversation-list.component.css']
})
export class ConversationListComponent implements OnInit {
  conversations: any[] = [];
  loading = false;
  @Output() selectConversation = new EventEmitter<string | number>();
  constructor(private messageService: MessageService) {}
  ngOnInit(): void { this.load(); }
  load(): void {
    this.loading = true;
    this.messageService.getConversations().subscribe({ next: (items) => { this.conversations = items || []; this.loading = false; }, error: (err) => { console.error(err); this.loading = false; } });
  }
  onSelect(c: any): void { this.selectConversation.emit(c.conversation_id); }
}
