// ============================================
// MATCH SERVICE — WasteZero Milestone 3
// Volunteer-only opportunity matching.
// API: GET /api/matches/suggestions
// Access: Volunteer only (enforced by backend)
// ============================================

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

// ── Match suggestion shape ─────────────────────────────────────────────
export interface MatchSuggestion {
  _id: string;
  title: string;
  location: string;
  required_skills: string[];
  matchScore: number;
  matchedSkillCount: number;
  locationMatch: boolean;
  // optional fields that may be present on opportunity
  date?: string | null;
  duration?: string;
  status?: string;
}

export interface MatchSuggestionsData {
  count: number;
  matches: MatchSuggestion[];
}

export interface MatchSuggestionsResponse {
  success: boolean;
  message: string;
  data: MatchSuggestionsData;
}

// 400 response when volunteer profile is incomplete
export interface MatchProfileIncompleteResponse {
  success: false;
  message: string;
  missingFields: string[];
}

@Injectable({ providedIn: 'root' })
export class MatchService {

  private http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/matches`;

  // ── Auth Headers ─────────────────────────────────────────────────────
  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ── GET /api/matches/suggestions ──────────────────────────────────────
  // Returns ranked opportunity suggestions for the volunteer.
  // limit: 1–50 (default 10)
  getSuggestions(limit = 10): Observable<MatchSuggestionsResponse> {
    const params = new HttpParams().set('limit', limit.toString());
    return this.http.get<MatchSuggestionsResponse>(
      `${this.baseUrl}/suggestions`,
      { headers: this.getHeaders(), params }
    );
  }

}
