import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthResponse, User } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private http = inject(HttpClient);

  private readonly baseUrl = `${environment.apiUrl}/auth`;

  private currentUserSignal = signal<User | null>(this.getUserFromStorage());

  readonly currentUser = this.currentUserSignal.asReadonly();

  readonly isLoggedIn = computed(() => this.currentUserSignal() !== null);

  login(credentials: {
    username: string;
    password: string;
  }): Observable<AuthResponse> {

    return this.http
      .post<AuthResponse>(`${this.baseUrl}/login`, credentials)
      .pipe(
        tap((response) => {
          if (response.success) {
            this.saveSession(response.token, response.user);
          }
        })
      );
  }

  register(userData: {
    name: string;
    username: string;
    email: string;
    password: string;
    role: string;
  }): Observable<AuthResponse> {

    return this.http
      .post<AuthResponse>(`${this.baseUrl}/register`, userData)
      .pipe(
        tap((response) => {
          if (response.success) {
            this.saveSession(response.token, response.user);
          }
        })
      );
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.currentUserSignal.set(null);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getCurrentUser(): User | null {
    return this.currentUserSignal();
  }

  private saveSession(token: string, user: User): void {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    this.currentUserSignal.set(user);
  }

  private getUserFromStorage(): User | null {
    const storedUser = localStorage.getItem('user');

    if (!storedUser) {
      return null;
    }

    try {
      return JSON.parse(storedUser) as User;
    } catch {
      localStorage.removeItem('user');
      return null;
    }
  }
}