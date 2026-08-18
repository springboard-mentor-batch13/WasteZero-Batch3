// ============================================
// ADMIN SERVICE — WasteZero Milestone 4
// User management and audit log API calls.
// All endpoints require admin JWT.
//
// Route mounts (server.js):
//   /api/v1/admin       → admin.routes.js   (users, logs, opp-moderate)
//   /api/opportunities  → opportunity.routes.js  (getAllOpportunities)
//   /api/pickups        → pickup.routes.js   (getAllPickups, admin/:id/*)
// ============================================

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AdminUserListResponse,
  AdminSuspendResponse,
  AuditLogListResponse,
  AdminRoleChangeResponse,
  AdminOpportunityListResponse,
  AdminOpportunityActionResponse,
  AdminPickupListResponse,
  AdminPickupActionResponse,
  UserRole,
} from '../models/admin.model';
import { WasteCollectedItem } from '../models/pickup.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AdminService {

  private http        = inject(HttpClient);
  private authService = inject(AuthService);

  // Admin-specific routes → /api/v1/admin
  private readonly adminUrl = `${environment.apiUrl}/v1/admin`;

  // Opportunity + pickup routes are mounted at /api (no /v1) per server.js
  // /api/opportunities  and  /api/pickups
  private readonly apiBase  = environment.apiUrl;  // = http://localhost:5001/api

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.authService.getToken()}` });
  }

  // ── User Management ────────────────────────────────────────────────────

  /**
   * GET /api/v1/admin/users
   * Paginated user list with optional search + role / suspension filters.
   *
   * Query params supported by backend:
   *   page, limit, role (volunteer|ngo|admin), isSuspended (true|false),
   *   search (name/email/username — regex-escaped), sort, order
   */
  getUsers(opts: {
    page?:        number;
    limit?:       number;
    search?:      string;
    role?:        string;
    isSuspended?: string;
    sort?:        string;
    order?:       string;
  } = {}): Observable<AdminUserListResponse> {
    let params = new HttpParams()
      .set('page',  (opts.page  ?? 1).toString())
      .set('limit', (opts.limit ?? 10).toString());

    if (opts.search)      params = params.set('search',      opts.search);
    if (opts.role)        params = params.set('role',        opts.role);
    if (opts.isSuspended) params = params.set('isSuspended', opts.isSuspended);
    if (opts.sort)        params = params.set('sort',        opts.sort);
    if (opts.order)       params = params.set('order',       opts.order);

    return this.http.get<AdminUserListResponse>(
      `${this.adminUrl}/users`,
      { headers: this.headers(), params }
    );
  }

  /**
   * PATCH /api/v1/admin/users/:id/suspend
   *
   * Suspend:   body = { suspend: true,  reason: string }  (reason REQUIRED)
   * Unsuspend: body = { suspend: false }                   (reason omitted)
   *
   * Backend invariants:
   *   - admin_id / suspendedBy / suspendedAt are NEVER accepted from body — derived server-side
   *   - Admin cannot suspend their own account (403)
   */
  suspendUser(userId: string, reason: string): Observable<AdminSuspendResponse> {
    return this.http.patch<AdminSuspendResponse>(
      `${this.adminUrl}/users/${userId}/suspend`,
      { suspend: true, reason },
      { headers: this.headers() }
    );
  }

  /**
   * PATCH /api/v1/admin/users/:id/suspend
   * Unsuspend — no reason required.
   */
  unsuspendUser(userId: string): Observable<AdminSuspendResponse> {
    return this.http.patch<AdminSuspendResponse>(
      `${this.adminUrl}/users/${userId}/suspend`,
      { suspend: false },
      { headers: this.headers() }
    );
  }

  // ── Audit Log ─────────────────────────────────────────────────────────

  /**
   * GET /api/v1/admin/logs
   * Audit log retrieval, always newest-first (timestamp: -1).
   * Supports filters: action, target_type, target_id, adminId, startDate, endDate
   */
  getLogs(opts: {
    page?:        number;
    limit?:       number;
    action?:      string;
    target_type?: string;
    adminId?:     string;
    startDate?:   string;
    endDate?:     string;
  } = {}): Observable<AuditLogListResponse> {
    let params = new HttpParams()
      .set('page',  (opts.page  ?? 1).toString())
      .set('limit', (opts.limit ?? 20).toString());

    if (opts.action)      params = params.set('action',      opts.action);
    if (opts.target_type) params = params.set('target_type', opts.target_type);
    if (opts.adminId)     params = params.set('adminId',     opts.adminId);
    if (opts.startDate)   params = params.set('startDate',   opts.startDate);
    if (opts.endDate)     params = params.set('endDate',     opts.endDate);

    return this.http.get<AuditLogListResponse>(
      `${this.adminUrl}/logs`,
      { headers: this.headers(), params }
    );
  }

  // ── User Role Management ───────────────────────────────────────────

  /**
   * PATCH /api/v1/admin/users/:id/role
   * Body: { role: 'volunteer' | 'ngo' | 'admin' }
   * Admin cannot change their own role (403 from backend).
   */
  updateUserRole(userId: string, role: UserRole): Observable<AdminRoleChangeResponse> {
    return this.http.patch<AdminRoleChangeResponse>(
      `${this.adminUrl}/users/${userId}/role`,
      { role },
      { headers: this.headers() }
    );
  }

  // ── Opportunity Management ────────────────────────────────────────

  /**
   * GET /api/opportunities?page=&limit=
   * Mounted at /api/opportunities (no /v1) — uses generalLimiter, safe for tab-load.
   * getAllOpportunities is accessible to any authenticated user.
   * Response: { success, data: { opportunities: [...], pagination: {...} }, message }
   */
  getOpportunities(opts: {
    page?:   number;
    limit?:  number;
    status?: string;
    search?: string;
  } = {}): Observable<AdminOpportunityListResponse> {
    let params = new HttpParams()
      .set('page',  String(opts.page  ?? 1))
      .set('limit', String(opts.limit ?? 15));
    if (opts.status) params = params.set('status', opts.status);
    if (opts.search) params = params.set('q', opts.search);
    return this.http.get<AdminOpportunityListResponse>(
      `${this.apiBase}/opportunities`,
      { headers: this.headers(), params }
    );
  }

  /**
   * DELETE /api/v1/admin/opportunities/:id
   * Body: { reason: string }  (backend treats reason as optional, but we enforce it in UI)
   */
  removeOpportunity(id: string, reason: string): Observable<AdminOpportunityActionResponse> {
    return this.http.delete<AdminOpportunityActionResponse>(
      `${this.adminUrl}/opportunities/${id}`,
      { headers: this.headers(), body: { reason } }
    );
  }

  /**
   * PATCH /api/v1/admin/opportunities/:id/restore
   */
  restoreOpportunity(id: string): Observable<AdminOpportunityActionResponse> {
    return this.http.patch<AdminOpportunityActionResponse>(
      `${this.adminUrl}/opportunities/${id}/restore`,
      {},
      { headers: this.headers() }
    );
  }

  // ── Pickup Management (Admin) ──────────────────────────────────────

  /**
   * GET /api/pickups
   * Mounted at /api/pickups (no /v1) — authorize('admin') gate in pickup.routes.js.
   * Response: { success, data: { pickups: [...], page, limit, total, totalPages }, message }
   * Note: pagination fields are top-level inside data (not nested under data.pagination).
   */
  getAllPickups(opts: {
    page?:   number;
    limit?:  number;
    status?: string;
  } = {}): Observable<AdminPickupListResponse> {
    let params = new HttpParams()
      .set('page',  String(opts.page  ?? 1))
      .set('limit', String(opts.limit ?? 15));
    if (opts.status && opts.status !== 'all') params = params.set('status', opts.status);
    return this.http.get<AdminPickupListResponse>(
      `${this.apiBase}/pickups`,
      { headers: this.headers(), params }
    );
  }

  /**
   * PATCH /api/pickups/admin/:id/status
   * Mounted at /api/pickups (no /v1). Backend accepts Completed | Cancelled.
   * On Completed: optionally attributes the pickup to an NGO (agent_id) and records wasteCollected.
   */
  adminForcePickupStatus(
    id: string,
    status: 'Completed' | 'Cancelled',
    extra?: {
      agent_id?: string;
      wasteCollected?: WasteCollectedItem[];
    }
  ): Observable<AdminPickupActionResponse> {
    const body: any = { status, ...(extra || {}) };
    return this.http.patch<AdminPickupActionResponse>(
      `${this.apiBase}/pickups/admin/${id}/status`,
      body,
      { headers: this.headers() }
    );
  }

  /**
   * DELETE /api/pickups/admin/:id
   * Mounted at /api/pickups (no /v1). Hard-delete any pickup regardless of status.
   */
  adminDeletePickup(id: string): Observable<AdminPickupActionResponse> {
    return this.http.delete<AdminPickupActionResponse>(
      `${this.apiBase}/pickups/admin/${id}`,
      { headers: this.headers() }
    );
  }
}
