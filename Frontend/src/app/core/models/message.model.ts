// ============================================
// MESSAGE MODEL — WasteZero Milestone 3
// Mirrors Backend: models/message.model.js
// API: GET /api/messages/conversations
//      GET /api/messages?with=:userId
// ============================================

export type MessageStatus = 'sent' | 'delivered' | 'read';

// ── Single message object ──────────────────────────────────────────────
export interface Message {
  _id: string;
  sender_id: string;
  receiver_id: string;
  conversation_id: string;
  content: string;
  status: MessageStatus;
  readAt?: string;
  createdAt: string;
  updatedAt?: string;
}

// ── Participant user reference in a conversation ───────────────────────
export interface ConversationUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  username?: string;
}

// ── Conversation preview (WhatsApp-style list) ─────────────────────────
export interface Conversation {
  conversationId: string;
  otherUser: ConversationUser;
  lastMessage: Message | null;
}

// ── API Response shapes ────────────────────────────────────────────────

export interface ConversationListResponse {
  success: boolean;
  message: string;
  data: Conversation[];
}

export interface MessageHistoryResponse {
  success: boolean;
  message: string;
  data: Message[];
}
