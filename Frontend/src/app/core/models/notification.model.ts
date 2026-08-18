// ============================================
// NOTIFICATION MODEL — WasteZero Milestone 3
// Mirrors Backend: models/notification.model.js
// API: GET /api/notifications
//      PUT /api/notifications/:id/read
// Socket: notification:new push event
// ============================================

// Five notification types — mirrors Backend: models/notification.model.js
// 'pickup_missed'    → sweep auto-marks pickup as Missed, notifies volunteer (+ NGO if assigned)
// 'pickup_cancelled' → sweep auto-cancels pickup after reschedule cap exhausted, notifies volunteer/NGO
export type NotificationType =
  | 'message'
  | 'opportunity_match'
  | 'pickup_match'
  | 'pickup_missed'
  | 'pickup_cancelled';

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
