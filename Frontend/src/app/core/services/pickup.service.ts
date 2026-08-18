// ============================================
// PICKUP SERVICE — WasteZero Milestone 3
// Wires frontend to all /api/pickups endpoints
// RBAC enforced by backend; this service is a thin HTTP client.
// ============================================

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  CreatePickupPayload,
  UpdatePickupPayload,
  UpdatePickupStatusPayload,
  ReschedulePickupPayload,
  WasteCollectedItem,
  CompletePickupPayload,
  PickupResponse,
  PickupArrayResponse,
  PickupListResponse,
} from '../models/pickup.model';
import { ApiResponse } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class PickupService {

  private http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/pickups`;

  // ── Auth Headers ───────────────────────────────────────────────────

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ── Volunteer Endpoints ────────────────────────────────────────────

  /**
   * POST /api/pickups
   * Create a new pickup request (Volunteer only).
   */
  createPickup(payload: CreatePickupPayload): Observable<PickupResponse> {
    return this.http.post<PickupResponse>(this.baseUrl, payload, {
      headers: this.getHeaders()
    });
  }

  /**
   * GET /api/pickups/my-pickups
   * Get all pickups created by the logged-in volunteer.
   */
  getMyPickups(page = 1, limit = 20): Observable<PickupArrayResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    return this.http.get<PickupArrayResponse>(`${this.baseUrl}/my-pickups`, {
      headers: this.getHeaders(),
      params
    });
  }

  /**
   * PATCH /api/pickups/:id/cancel
   * Cancel a Pending pickup (Volunteer only).
   */
  cancelPickup(id: string): Observable<PickupResponse> {
    return this.http.patch<PickupResponse>(`${this.baseUrl}/${id}/cancel`, {}, {
      headers: this.getHeaders()
    });
  }

  /**
   * PATCH /api/pickups/:id/reschedule
   * Reschedule a Missed pickup (Volunteer only, up to RESCHEDULE_CAP times).
   * Backend enforces: status === Missed, rescheduleCount < cap.
   */
  reschedulePickup(id: string, payload: ReschedulePickupPayload): Observable<PickupResponse> {
    return this.http.patch<PickupResponse>(`${this.baseUrl}/${id}/reschedule`, payload, {
      headers: this.getHeaders()
    });
  }

  // ── NGO Endpoints ─────────────────────────────────────────────────

  /**
   * GET /api/pickups/available
   * Get pickups available for this NGO (matched by city + wasteTypes).
   */
  getAvailablePickups(page = 1, limit = 20): Observable<PickupArrayResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    return this.http.get<PickupArrayResponse>(`${this.baseUrl}/available`, {
      headers: this.getHeaders(),
      params
    });
  }

  /**
   * GET /api/pickups/assigned-to-me
   * Get pickups claimed/assigned to this NGO.
   */
  getAssignedPickups(page = 1, limit = 20): Observable<PickupArrayResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    return this.http.get<PickupArrayResponse>(`${this.baseUrl}/assigned-to-me`, {
      headers: this.getHeaders(),
      params
    });
  }

  /**
   * PATCH /api/pickups/:id/status → Completed
   * Sends {status:'Completed', wasteCollected:[...]} as required by backend.
   * A separate method prevents accidental calls without wasteCollected.
   */
  completePickup(id: string, wasteCollected: WasteCollectedItem[]): Observable<PickupResponse> {
    const payload: CompletePickupPayload = { status: 'Completed', wasteCollected };
    return this.http.patch<PickupResponse>(`${this.baseUrl}/${id}/status`, payload, {
      headers: this.getHeaders()
    });
  }

  /**
   * PATCH /api/pickups/:id/status
   * Transition a pickup status (NGO only: Pending→Assigned, Assigned→Cancelled).
   * Do NOT use this for Completed — call completePickup() instead.
   */
  updatePickupStatus(id: string, status: 'Assigned' | 'Cancelled'): Observable<PickupResponse> {
    const payload: UpdatePickupStatusPayload = { status };
    return this.http.patch<PickupResponse>(`${this.baseUrl}/${id}/status`, payload, {
      headers: this.getHeaders()
    });
  }

  // ── Admin Endpoints ────────────────────────────────────────────────

  /**
   * GET /api/pickups
   * Get all pickups — Admin only, read-only monitoring.
   */
  getAllPickups(page = 1, limit = 20): Observable<PickupListResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    return this.http.get<PickupListResponse>(this.baseUrl, {
      headers: this.getHeaders(),
      params
    });
  }
}
