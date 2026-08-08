// matching.service.ts
// Fetch matched opportunities with their match scores.

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface OpportunityMatch { id: number | string; title: string; organization: string; location?: string; requiredSkills?: string[]; matchScore?: number; }

@Injectable({ providedIn: 'root' })
export class MatchingService {
  private base = '/api/matching';
  constructor(private http: HttpClient) {}
  getMatchedOpportunities(): Observable<OpportunityMatch[]> { return this.http.get<OpportunityMatch[]>(`${this.base}/opportunities`); }
}
