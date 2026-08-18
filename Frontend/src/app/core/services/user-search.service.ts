// ============================================
// USER SEARCH SERVICE — WasteZero Milestone 3
// Calls GET /api/users/search for username-based user discovery.
// Used by Messages page to find users to start new conversations.
// ============================================

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface SearchUserResult {
  _id: string;
  name: string;
  username: string;
  role: 'volunteer' | 'ngo' | 'admin' | string;
  email?: string;
}

export interface UserSearchResponse {
  success: boolean;
  message: string;
  data: SearchUserResult[];
}

@Injectable({
  providedIn: 'root'
})
export class UserSearchService {

  private http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/users/search`;

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  /**
   * Search users by username or name.
   * targetRole defaults to undefined — searches across all roles (Volunteer, NGO, Admin).
   * Optionally pass targetRole ('volunteer', 'ngo', or 'admin') to filter by a specific role.
   */
  searchUsers(username: string, targetRole?: string): Observable<UserSearchResponse> {
    let params = new HttpParams().set('username', username);
    if (targetRole) {
      params = params.set('targetRole', targetRole);
    }

    return this.http.get<UserSearchResponse>(this.baseUrl, {
      headers: this.getHeaders(),
      params
    });
  }
}
