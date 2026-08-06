import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ProfileResponse, User } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {

  private http = inject(HttpClient);

  private readonly baseUrl = `${environment.apiUrl}/users`;

  private getHeaders(): HttpHeaders {

    const token = localStorage.getItem('token');

    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });

  }

  getProfile(): Observable<ProfileResponse> {

    return this.http.get<ProfileResponse>(
      `${this.baseUrl}/profile`,
      {
        headers: this.getHeaders()
      }
    );

  }

  updateProfile(payload: Record<string, unknown>): Observable<ProfileResponse> {

    return this.http.put<ProfileResponse>(
      `${this.baseUrl}/profile`,
      payload,
      {
        headers: this.getHeaders()
      }
    );

  }

}