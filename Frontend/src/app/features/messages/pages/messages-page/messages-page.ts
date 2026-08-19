// ============================================
// MESSAGES PAGE — WasteZero Milestone 3
// Route: /messages
// Angular 21 zoneless — all mutable state as signals
// Two-pane layout: conversation list (left) + active chat (right)
// REST: MessageService (conversations + history)
// Real-time: SocketService (send, receive, read, typing)
// New in M3: username search, new conversation flow, contactId query param,
//            seen status (✓/✓✓), search results panel
// ============================================

import {
  Component, inject, OnInit, OnDestroy,
  signal, computed, effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';

import { AuthService } from '../../../../core/services/auth.service';
import { MessageService } from '../../../../core/services/message.service';
import { SocketService } from '../../../../core/services/socket.service';
import { UserSearchService, SearchUserResult } from '../../../../core/services/user-search.service';
import { Conversation, Message } from '../../../../core/models/message.model';

@Component({
  selector: 'app-messages-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './messages-page.html',
  styleUrl: './messages-page.css',
})
export class MessagesPage implements OnInit, OnDestroy {

  private authService      = inject(AuthService);
  private messageService   = inject(MessageService);
  private socketService    = inject(SocketService);
  private userSearchService = inject(UserSearchService);
  private router           = inject(Router);
  private route            = inject(ActivatedRoute);
  private destroy$         = new Subject<void>();

  // ── Signals ────────────────────────────────────────────────────────
  conversations       = signal<Conversation[]>([]);
  activeConversation  = signal<Conversation | null>(null);
  messages            = signal<Message[]>([]);
  messageInput        = signal('');
  conversationSearch  = signal('');

  loadingConversations = signal(true);
  loadingMessages      = signal(false);
  sending              = signal(false);

  errorConversations   = signal('');
  errorMessages        = signal('');
  sendError            = signal('');

  // Typing indicator
  isOtherUserTyping    = signal(false);
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;

  // ── NEW: Admin Role Filter (M4) ──────────────────────────────────
  messageRoleFilter = signal<'all' | 'volunteer' | 'ngo' | 'admin'>('all');

  // ── NEW: Username Search (M3) ──────────────────────────────────────
  userSearchQuery   = signal('');
  userSearchResults = signal<SearchUserResult[]>([]);
  searchLoading     = signal(false);
  searchError       = signal('');
  showSearchPanel   = signal(false);

  // ── Computed signals ───────────────────────────────────────────────

  readonly currentUser = computed(() => this.authService.currentUser());

  readonly availableRoleFilters = computed<{ label: string; value: 'all' | 'volunteer' | 'ngo' | 'admin' }[]>(() => [
    { label: 'All', value: 'all' },
    { label: 'Volunteers', value: 'volunteer' },
    { label: 'NGOs', value: 'ngo' },
    { label: 'Admins', value: 'admin' },
  ]);

  readonly filteredConversations = computed(() => {
    const q = this.conversationSearch().toLowerCase().trim();
    const roleFilter = this.messageRoleFilter();
    let list = this.conversations();

    if (roleFilter !== 'all') {
      list = list.filter(c => c.otherUser?.role?.toLowerCase() === roleFilter);
    }

    if (!q) return list;
    return list.filter(c =>
      (c.otherUser?.name ?? '').toLowerCase().includes(q) ||
      (c.otherUser?.username ?? '').toLowerCase().includes(q) ||
      (c.lastMessage?.content ?? '').toLowerCase().includes(q)
    );
  });

  readonly isEmpty = computed(() =>
    !this.loadingConversations() && !this.errorConversations() && this.conversations().length === 0
  );

  readonly hasNoMessages = computed(() =>
    !this.loadingMessages() && !this.errorMessages() && this.messages().length === 0
  );

  // ── Lifecycle ──────────────────────────────────────────────────────

  ngOnInit(): void {
    // Capture contactId params synchronously from the current snapshot BEFORE
    // clearing the URL, so the data is available when loadConversations resolves.
    const snapshot = this.route.snapshot.queryParams;
    const pendingContactId   = snapshot['contactId']   ?? null;
    const pendingContactName = snapshot['contactName'] ?? null;
    const pendingContactRole = (snapshot['contactRole'] ?? null) as string | null;

    // Clear the query params from the URL immediately (clean URL, no bookmarking)
    if (pendingContactId) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {},
        replaceUrl: true
      });
    }

    this.loadConversations(pendingContactId, pendingContactName, pendingContactRole);
    this.subscribeToSocketEvents();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
  }

  // ── Mobile Navigation ───────────────────────────────────────────────

  backToConversations(): void {
    this.activeConversation.set(null);
    this.messages.set([]);
    this.errorMessages.set('');
    this.sendError.set('');
  }

  // ── Load conversations ──────────────────────────────────────────────

  loadConversations(
    pendingContactId:   string | null = null,
    pendingContactName: string | null = null,
    pendingContactRole: string | null = null
  ): void {
    this.loadingConversations.set(true);
    this.errorConversations.set('');

    this.messageService.getConversations()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.conversations.set(res.data);
          this.loadingConversations.set(false);

          if (pendingContactId) {
            // Open the contact target — conversations list is now populated
            this.openConversationWithUser(pendingContactId, pendingContactName, pendingContactRole);
          } else if (!this.activeConversation() && res.data.length > 0) {
            // On desktop screens, auto-select first conversation.
            // On mobile screens (<= 768px), allow user to view conversation list first.
            const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
            if (!isMobile) {
              this.selectConversation(res.data[0]);
            }
          }
        },
        error: (err) => {
          this.errorConversations.set(err.error?.message || 'Failed to load conversations.');
          this.loadingConversations.set(false);
        }
      });
  }

  // ── NEW: Open conversation with a specific user (from contactId) ────

  openConversationWithUser(
    userId:      string,
    contactName: string | null = null,
    contactRole: string | null = null
  ): void {
    // Conversations are now loaded before this is called (see loadConversations).
    // Check if an existing conversation already exists for this user.
    const existing = this.conversations().find(c => c.otherUser._id === userId);
    if (existing) {
      this.selectConversation(existing);
      return;
    }

    // No existing conversation — load message history (may be empty for a new chat)
    // then set activeConversation so the user can type the first message.
    this.loadingMessages.set(true);
    this.messageService.getMessageHistory(userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.messages.set(res.data);
          this.loadingMessages.set(false);
          this.scrollToBottom();

          // Resolve display name and role using a priority chain:
          //  1. Passed-in contactName/contactRole (from "Contact NGO/Admin" query params — most reliable)
          //  2. Match in current userSearchResults (from "Contact Volunteer" in application-review)
          //  3. Generic fallback so the UI never breaks (messaging still works — real name
          //     appears in the conversation list after the first message is exchanged)
          const searchResult = this.userSearchResults().find(u => u._id === userId);

          const resolvedName: string = contactName
            ?? searchResult?.name
            ?? 'User';

          const resolvedRole: string = contactRole
            ?? searchResult?.role
            ?? 'user';

          const syntheticConv: Conversation = {
            conversationId: '',   // assigned by backend on first send
            otherUser: {
              _id:   userId,
              name:  resolvedName,
              role:  resolvedRole,
              email: '',
            },
            lastMessage: null,
          };
          this.activeConversation.set(syntheticConv);
        },
        error: () => {
          this.loadingMessages.set(false);
        }
      });
  }


  // ── Select conversation ────────────────────────────────────────────

  selectConversation(conv: Conversation): void {
    this.activeConversation.set(conv);
    this.loadMessages(conv.otherUser._id);
    this.isOtherUserTyping.set(false);
    this.sendError.set('');
    this.showSearchPanel.set(false);

    // Mark conversation as read via socket
    this.socketService.markRead(conv.conversationId);
  }

  // ── NEW: Start conversation from search result ─────────────────────

  startConversationWithSearchResult(user: SearchUserResult): void {
    this.showSearchPanel.set(false);
    this.userSearchQuery.set('');
    this.userSearchResults.set([]);

    const existing = this.conversations().find(c => c.otherUser._id === user._id);
    if (existing) {
      this.selectConversation(existing);
      return;
    }

    // Synthetic conversation placeholder
    const syntheticConv: Conversation = {
      conversationId: '',
      otherUser: {
        _id: user._id,
        name: user.name,
        role: user.role,
        email: '', // required by ConversationUser; not displayed
      },
      lastMessage: null,
    };
    this.activeConversation.set(syntheticConv);
    this.messages.set([]);
    this.loadingMessages.set(false);
    this.errorMessages.set('');
    this.isOtherUserTyping.set(false);
    this.sendError.set('');
  }

  // ── NEW: Username search ───────────────────────────────────────────

  onUserSearchInput(value: string): void {
    this.userSearchQuery.set(value);

    if (!value.trim()) {
      this.userSearchResults.set([]);
      this.showSearchPanel.set(false);
      this.searchError.set('');
      return;
    }

    this.showSearchPanel.set(true);
    this.searchLoading.set(true);
    this.searchError.set('');

    this.userSearchService.searchUsers(value.trim())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.userSearchResults.set(res.data);
          this.searchLoading.set(false);
        },
        error: (err) => {
          this.searchError.set(err.error?.message || 'Search failed.');
          this.searchLoading.set(false);
        }
      });
  }

  closeSearchPanel(): void {
    this.showSearchPanel.set(false);
    this.userSearchQuery.set('');
    this.userSearchResults.set([]);
    this.searchError.set('');
  }

  // ── Load message history ───────────────────────────────────────────

  loadMessages(withUserId: string): void {
    this.loadingMessages.set(true);
    this.errorMessages.set('');
    this.messages.set([]);

    this.messageService.getMessageHistory(withUserId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.messages.set(res.data);
          this.loadingMessages.set(false);
          this.scrollToBottom();
        },
        error: (err) => {
          this.errorMessages.set(err.error?.message || 'Failed to load messages.');
          this.loadingMessages.set(false);
        }
      });
  }

  // ── Send message ───────────────────────────────────────────────────

  sendMessage(): void {
    const content = this.messageInput().trim();
    const conv = this.activeConversation();
    if (!content || !conv || this.sending()) return;

    this.sending.set(true);
    this.sendError.set('');

    this.socketService.sendMessage(conv.otherUser._id, content)
      .then((sentMsg) => {
        // Append the acknowledged message to the thread
        this.messages.update(msgs => [...msgs, sentMsg]);
        this.messageInput.set('');
        this.sending.set(false);
        this.scrollToBottom();

        // If this was a new conversation (no conversationId), add it to the list
        const currentConv = this.activeConversation();
        if (currentConv && !currentConv.conversationId && sentMsg.conversation_id) {
          const updatedConv: Conversation = {
            ...currentConv,
            conversationId: sentMsg.conversation_id,
            lastMessage: sentMsg,
          };
          this.activeConversation.set(updatedConv);
          this.conversations.update(convs => [updatedConv, ...convs]);
        } else {
          this.updateConversationLastMessage(conv.conversationId, sentMsg);
        }
      })
      .catch((err: Error) => {
        this.sendError.set(err.message || 'Failed to send message.');
        this.sending.set(false);
      });
  }

  // ── Input handlers ─────────────────────────────────────────────────

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  onInputChange(value: string): void {
    this.messageInput.set(value);
    const conv = this.activeConversation();
    if (conv && conv.otherUser._id) {
      this.socketService.sendTyping(conv.otherUser._id);
    }
  }

  // ── Socket subscriptions ───────────────────────────────────────────

  private subscribeToSocketEvents(): void {
    // Incoming message
    this.socketService.message$
      .pipe(takeUntil(this.destroy$))
      .subscribe((msg) => {
        const activeConv = this.activeConversation();
        const currentUserId = this.currentUser()?._id ?? this.currentUser()?.id;

        // If this message belongs to the active conversation, append it
        if (
          activeConv &&
          (msg.sender_id === activeConv.otherUser._id ||
            msg.receiver_id === activeConv.otherUser._id)
        ) {
          this.messages.update(msgs => [...msgs, msg]);
          this.scrollToBottom();
          // Mark as read immediately since we're in the conversation
          this.socketService.markRead(activeConv.conversationId);
        }

        // Update conversation list last message
        this.updateConversationLastMessage(msg.conversation_id, msg);
      });

    // Typing indicator
    this.socketService.typing$
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ senderId }) => {
        const activeConv = this.activeConversation();
        if (activeConv && senderId === activeConv.otherUser._id) {
          this.isOtherUserTyping.set(true);
          // Auto-hide after 3 seconds (per SOCKET_DOCUMENTATION.md §4.3)
          if (this.typingTimeout) clearTimeout(this.typingTimeout);
          this.typingTimeout = setTimeout(() => {
            this.isOtherUserTyping.set(false);
          }, 3000);
        }
      });

    // Read receipts
    this.socketService.readReceipt$
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ conversationId, readerId }) => {
        const activeConv = this.activeConversation();
        if (activeConv && conversationId === activeConv.conversationId) {
          // Update message statuses in the active thread to 'read'
          this.messages.update(msgs =>
            msgs.map(m =>
              m.sender_id !== readerId && m.status !== 'read'
                ? { ...m, status: 'read' as const }
                : m
            )
          );
        }
      });
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private updateConversationLastMessage(conversationId: string, msg: Message): void {
    this.conversations.update(convs =>
      convs.map(c =>
        c.conversationId === conversationId
          ? { ...c, lastMessage: msg }
          : c
      )
    );
  }

  private scrollToBottom(): void {
    // Deferred scroll — DOM must render first
    setTimeout(() => {
      const el = document.getElementById('messages-scroll-anchor');
      el?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }

  // ── View helpers ───────────────────────────────────────────────────

  isMyMessage(msg: Message): boolean {
    const userId = this.currentUser()?._id ?? this.currentUser()?.id;
    return msg.sender_id === userId;
  }

  getAvatarInitial(name: string): string {
    return name?.charAt(0)?.toUpperCase() ?? '?';
  }

  formatTime(dateStr: string): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch {
      return '';
    }
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return '';
    }
  }

}
