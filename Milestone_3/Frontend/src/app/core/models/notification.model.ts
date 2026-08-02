// ============================================
// NOTIFICATION MODEL — WasteZero Milestone 3
// Mirrors Backend: models/notification.model.js
// API: GET /api/notifications
//      PUT /api/notifications/:id/read
// Socket: notification:new push event
// ============================================

// Three notification types from the backend notification.service.js
export type NotificationType = 'message' | 'opportunity_match' | 'pickup_match';

export interface Notification {
  _id: string;
  user_id: string;
  type: NotificationType;
  // Decrypted plaintext message — iv/authTag are never exposed to the client
  message: string;
  // For 'message': conversationId string
  // For 'opportunity_match' | 'pickup_match': MongoDB ObjectId string
  reference_id: string;
  isRead: boolean;
  createdAt: string;
}

// ── API Response shapes ────────────────────────────────────────────────

export interface NotificationListData {
  page: number;
  limit: number;
  notifications: Notification[];
}

export interface NotificationListResponse {
  success: boolean;
  message: string;
  data: NotificationListData;
}

export interface NotificationResponse {
  success: boolean;
  message: string;
  data: Notification;
}
