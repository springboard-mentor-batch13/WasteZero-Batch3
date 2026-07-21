// ============================================
// OPPORTUNITY SERVICE — WasteZero Milestone 2
// Wires frontend to all /api/opportunities endpoints
// ============================================

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  OpportunityListResponse,
  OpportunityResponse,
  OpportunityArrayResponse,
  CreateOpportunityPayload,
  UpdateOpportunityPayload,
} from '../models/opportunity.model';
import { ApiResponse } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class OpportunityService {

  private http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/opportunities`;

  // ── Auth Headers ───────────────────────────────────────────────────

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ── GET /api/opportunities (paginated) ─────────────────────────────

  getAllOpportunities(page = 1, limit = 9): Observable<OpportunityListResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    return this.http.get<OpportunityListResponse>(this.baseUrl, {
      headers: this.getHeaders(),
      params
    });
  }

  // ── GET /api/opportunities/:id ─────────────────────────────────────

  getOpportunityById(id: string): Observable<OpportunityResponse> {
    return this.http.get<OpportunityResponse>(`${this.baseUrl}/${id}`, {
      headers: this.getHeaders()
    });
  }

  // ── POST /api/opportunities (with optional image) ──────────────────

  createOpportunity(payload: CreateOpportunityPayload, imageFile?: File): Observable<OpportunityResponse> {
    if (imageFile) {
      const formData = this.buildFormData(payload, imageFile);
      return this.http.post<OpportunityResponse>(this.baseUrl, formData, {
        headers: new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` })
      });
    }
    return this.http.post<OpportunityResponse>(this.baseUrl, payload, {
      headers: this.getHeaders()
    });
  }

  // ── PUT /api/opportunities/:id ─────────────────────────────────────

  updateOpportunity(id: string, payload: UpdateOpportunityPayload, imageFile?: File): Observable<OpportunityResponse> {
    if (imageFile) {
      const formData = this.buildFormData(payload, imageFile);
      return this.http.put<OpportunityResponse>(`${this.baseUrl}/${id}`, formData, {
        headers: new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` })
      });
    }
    return this.http.put<OpportunityResponse>(`${this.baseUrl}/${id}`, payload, {
      headers: this.getHeaders()
    });
  }

  // ── DELETE /api/opportunities/:id ──────────────────────────────────

  deleteOpportunity(id: string): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(`${this.baseUrl}/${id}`, {
      headers: this.getHeaders()
    });
  }

  // ── GET /api/opportunities/my-opportunities ────────────────────────

  getMyOpportunities(): Observable<OpportunityArrayResponse> {
    return this.http.get<OpportunityArrayResponse>(`${this.baseUrl}/my-opportunities`, {
      headers: this.getHeaders()
    });
  }

  // ── GET /api/opportunities/search?q= ──────────────────────────────

  searchOpportunities(q: string): Observable<OpportunityArrayResponse> {
    const params = new HttpParams().set('q', q);
    return this.http.get<OpportunityArrayResponse>(`${this.baseUrl}/search`, {
      headers: this.getHeaders(),
      params
    });
  }

  // ── GET /api/opportunities/filter?status=&skill=&location= ────────

  filterOpportunities(filters: {
    status?: string;
    skill?: string;
    location?: string;
  }): Observable<OpportunityArrayResponse> {
    let params = new HttpParams();
    if (filters.status)   params = params.set('status', filters.status);
    if (filters.skill)    params = params.set('skill', filters.skill);
    if (filters.location) params = params.set('location', filters.location);

    return this.http.get<OpportunityArrayResponse>(`${this.baseUrl}/filter`, {
      headers: this.getHeaders(),
      params
    });
  }

  // ── Utility: Build multipart/form-data ────────────────────────────

  private buildFormData(payload: Record<string, any>, imageFile: File): FormData {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        // required_skills[] sent as repeated fields
        value.forEach(item => formData.append(key, item));
      } else if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });
    formData.append('image', imageFile);
    return formData;
  }

}
