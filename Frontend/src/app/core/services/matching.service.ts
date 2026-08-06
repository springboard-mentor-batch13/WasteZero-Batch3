// ============================================
// MATCHING SERVICE — WasteZero Milestone 3 (Task 4)
// Volunteer-only opportunity matching, REST-only (HttpClient).
//
// NOTE: The task spec lists GET /api/matching/opportunities, but no such
// route exists anywhere in Backend/routes — the only matching endpoint the
// backend actually exposes is GET /api/matches/suggestions
// (Backend/routes/match.routes.js, volunteer-only). getMatchedOpportunities()
// below is wired to that real endpoint under the method name the task asked
// for. (An equivalent MatchService.getSuggestions() already exists and is
// used by the dashboard — this file is the Task-4-named counterpart.)
// ============================================

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { MatchSuggestionsResponse } from './match.service';

@Injectable({ providedIn: 'root' })
export class MatchingService {

  private http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/matches`;

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ── GET /api/matches/suggestions ──────────────────────────────────────
  // Ranked open-opportunity matches (skills + location) for the logged-in
  // volunteer. limit: 1–50 (default 20).
  getMatchedOpportunities(limit = 20): Observable<MatchSuggestionsResponse> {
    const params = new HttpParams().set('limit', limit.toString());
    return this.http.get<MatchSuggestionsResponse>(
      `${this.baseUrl}/suggestions`,
      { headers: this.getHeaders(), params }
    );
  }

}
