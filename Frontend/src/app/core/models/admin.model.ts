// ============================================
// ADMIN MODELS — WasteZero Milestone 4
//
// Source of truth: Backend documentation
//   GET  /api/v1/admin/users
//   GET  /api/v1/admin/users/:id
//   GET  /api/v1/admin/logs
//   PATCH /api/v1/admin/users/:id/suspend
// ============================================

// ── User ─────────────────────────────────────────────────────────────────────

/**
 * Matches the user object returned by GET /api/v1/admin/users
 * and GET /api/v1/admin/users/:id.
 * NOTE: password is NEVER returned (schema select:false + projection).
 */
export interface AdminUser {
  _id:              string;
  name:             string;
  username:         string;
  email:            string;
  role:             'volunteer' | 'ngo' | 'admin';
  isSuspended:      boolean;
  suspensionReason: string | null;
  isVerified:       boolean;
  createdAt:        string;
  // Detail endpoint extras (may be absent in list response)
  bio?:             string;
  skills?:          string[];
  suspendedAt?:     string | null;
  suspendedBy?:     string | null;
}

/**
 * Response shape for GET /api/v1/admin/users
 * Pagination is TOP-LEVEL (not nested inside data).
 */
export interface AdminUserListResponse {
  success:    boolean;
  message:    string;
  results:    number;
  pagination: {
    total:      number;
    page:       number;
    limit:      number;
    totalPages: number;
  };
  data: {
    users: AdminUser[];
  };
}

export interface AdminUserDetailResponse {
  success: boolean;
  message: string;
  data: { user: AdminUser };
}

// ── Suspend / Unsuspend ───────────────────────────────────────────────────────

/**
 * Response shape for PATCH /api/v1/admin/users/:id/suspend
 *
 * data.userId       — target user's _id
 * data.isSuspended  — new suspension state
 * data.suspendedAt  — server timestamp (null when unsuspending)
 */
export interface AdminSuspendResponse {
  success: boolean;
  message: string;
  data: {
    userId:      string;
    isSuspended: boolean;
    suspendedAt: string | null;
  };
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

/**
 * Single audit log entry from GET /api/v1/admin/logs
 * admin_id is populated (object) when fetched.
 */
export interface AuditLog {
  _id:         string;
  admin_id:    string | { _id: string; name: string; email: string };
  action:      string;
  target_type: string;              // matches backend field name exactly
  target_id?:  string;
  details?:    string;              // backend returns a plain string
  changes?: {
    before?: Record<string, unknown>;
    after?:  Record<string, unknown>;
  };
  ip_address?: string;
  user_agent?: string;
  timestamp:   string;             // backend sorts by timestamp, not createdAt
}

/**
 * Response shape for GET /api/v1/admin/logs
 * Pagination is TOP-LEVEL (not nested inside data).
 */
export interface AuditLogListResponse {
  success:    boolean;
  message:    string;
  results:    number;
  pagination: {
    total:      number;
    page:       number;
    limit:      number;
    totalPages: number;
  };
  data: {
    logs: AuditLog[];
  };
}

// ── Reports ───────────────────────────────────────────────────────────────────

/** Report type values accepted by the backend */
export type ReportType = 'users' | 'pickups' | 'opportunities' | 'applications' | 'full-activity';

/** Report format values accepted by the backend */
export type ReportFormat = 'csv' | 'xlsx' | 'pdf';

export interface ReportDownloadParams {
  type:       ReportType;
  format:     ReportFormat;
  startDate?: string;   // YYYY-MM-DD
  endDate?:   string;   // YYYY-MM-DD
}

// ─────────────────────────────────────────────────────────────────────────
// ADMIN OPPORTUNITY MANAGEMENT
// GET    /api/opportunities                  — getAllOpportunities (any auth)
// DELETE /api/v1/admin/opportunities/:id    body: { reason }  (soft-delete)
// PATCH  /api/v1/admin/opportunities/:id/restore
//
// GET response shape:
//   { success, data: { opportunities: [...], pagination: { page, limit, total, totalPages } }, message }
// ─────────────────────────────────────────────────────────────────────────

export interface AdminOpportunity {
  _id:         string;
  title:       string;
  location:    string;
  status:      'open' | 'closed' | 'draft';
  isRemoved?:  boolean;
  removedAt?:  string | null;
  createdAt:   string;
  updatedAt?:  string;
  ngo_id?:     { _id: string; name: string; username: string; role: string } | string;
  applicationsCount?: number;
}

export interface AdminOpportunityListData {
  opportunities: AdminOpportunity[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface AdminOpportunityListResponse {
  success: boolean;
  data:    AdminOpportunityListData;
  message?: string;
}

export interface AdminOpportunityActionResponse {
  success: boolean;
  message: string;
  data?: AdminOpportunity;
}

// ─────────────────────────────────────────────────────────────────────────
// ADMIN ROLE MANAGEMENT
// PATCH /api/v1/admin/users/:id/role    body: { role }
// ─────────────────────────────────────────────────────────────────────────

export type UserRole = 'volunteer' | 'ngo' | 'admin';

export interface AdminRoleChangeResponse {
  success: boolean;
  message: string;
  data: {
    userId: string;
    role:   UserRole;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// ADMIN PICKUP MANAGEMENT
// GET    /api/pickups               — authorize('admin') in pickup.routes.js
// PATCH  /api/pickups/admin/:id/status
// DELETE /api/pickups/admin/:id
//
// GET response shape:
//   { success, data: { pickups: [...], page, limit, total, totalPages }, message }
//   NOTE: pagination fields are TOP-LEVEL inside data (not nested)
// ─────────────────────────────────────────────────────────────────────────

export interface AdminPickupItem {
  _id:         string;
  // address is a nested object { city: string, area?: string } per pickup.model.js
  // Optional (?) so template optional-chain ?. is valid for legacy/partial data
  address?:    { city: string; area?: string };
  wasteTypes:  string[];
  status:      'Pending' | 'Assigned' | 'Completed' | 'Cancelled' | 'Missed';
  scheduledDate: string;   // ISO date string from DB (field name is scheduledDate, not scheduledAt)
  createdAt:   string;
  notes?:      string;
  preferredTimeSlot?: { start: string; end: string; startDisplay?: string; endDisplay?: string };
  user_id?:    { _id: string; name: string; email: string; role?: string } | string | null;
  agent_id?:   { _id: string; name: string; email: string } | string | null;
  wasteCollected?: { category: string; weight: number }[];
}

// Pagination is flat inside data, not nested
export interface AdminPickupListData {
  pickups:    AdminPickupItem[];
  page:       number;
  limit:      number;
  total:      number;
  totalPages: number;
}

export interface AdminPickupListResponse {
  success: boolean;
  data:    AdminPickupListData;
  message?: string;
}

export interface AdminPickupActionResponse {
  success: boolean;
  message: string;
  data?:   AdminPickupItem;
}
