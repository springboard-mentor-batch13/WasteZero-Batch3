// ============================================
// APPLICATION SERVICE — WasteZero Milestone 2
// Wires frontend to all /api/applications endpoints
// ============================================

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ApplicationResponse,
  ApplicationListResponse,
  MyApplicationsResponse,
  ApplyPayload,
  UpdateStatusPayload,
} from '../models/application.model';
import { ApiResponse } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class ApplicationService {

  private http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/applications`;

  // ── Auth Headers ───────────────────────────────────────────────────

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ── POST /api/applications (Volunteer applies) ─────────────────────

  apply(payload: ApplyPayload): Observable<ApplicationResponse> {
    return this.http.post<ApplicationResponse>(this.baseUrl, payload, {
      headers: this.getHeaders()
    });
  }

  // ── GET /api/applications/my-applications (Volunteer) ─────────────

  getMyApplications(): Observable<MyApplicationsResponse> {
    return this.http.get<MyApplicationsResponse>(`${this.baseUrl}/my-applications`, {
      headers: this.getHeaders()
    });
  }

  // ── GET /api/applications (NGO/Admin, filterable by opportunity) ───

  getApplications(opportunityId?: string, page = 1, limit = 20, status?: string): Observable<ApplicationListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    if (opportunityId) params = params.set('opportunity', opportunityId);
    if (status)        params = params.set('status', status);

    return this.http.get<ApplicationListResponse>(this.baseUrl, {
      headers: this.getHeaders(),
      params
    });
  }

  // ── GET /api/applications/:id ──────────────────────────────────────

  getApplicationById(id: string): Observable<ApplicationResponse> {
    return this.http.get<ApplicationResponse>(`${this.baseUrl}/${id}`, {
      headers: this.getHeaders()
    });
  }

  // ── PUT /api/applications/:id (NGO/Admin updates status) ──────────

  updateApplicationStatus(id: string, payload: UpdateStatusPayload): Observable<ApplicationResponse> {
    return this.http.put<ApplicationResponse>(`${this.baseUrl}/${id}`, payload, {
      headers: this.getHeaders()
    });
  }

  // ── DELETE /api/applications/:id (Volunteer withdraws) ────────────

  withdrawApplication(id: string): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(`${this.baseUrl}/${id}`, {
      headers: this.getHeaders()
    });
  }

}
