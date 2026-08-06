import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthResponse, User } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private http = inject(HttpClient);

  private readonly authUrl = `${environment.apiUrl}/auth`;
  private readonly userUrl = `${environment.apiUrl}/users`;

  private currentUserSignal = signal<User | null>(
    this.getUserFromStorage()
  );

  readonly currentUser = this.currentUserSignal.asReadonly();

  readonly isLoggedIn = computed(() => this.currentUserSignal() !== null);

  // =====================================
  // LOGIN
  // =====================================

  login(credentials: {
    username: string;
    password: string;
  }): Observable<AuthResponse> {

    return this.http.post<AuthResponse>(
      `${this.authUrl}/login`,
      {
        identifier: credentials.username,
        password: credentials.password
      }
    ).pipe(
      tap((response) => {
        if (response.success) {
          this.saveSession(response.token, response.user);
        }
      })
    );

  }

  // =====================================
  // REGISTER
  // =====================================

  register(userData: {
    name: string;
    username: string;
    email: string;
    password: string;
    role: string;
  }): Observable<AuthResponse> {

    return this.http.post<AuthResponse>(
      `${this.authUrl}/register`,
      userData
    );

  }

  // =====================================
  // VERIFY EMAIL OTP
  // =====================================

  verifyOtp(data: {
    email: string;
    otp: string;
  }): Observable<any> {

    return this.http.post(
      `${this.authUrl}/verify-otp`,
      data
    );

  }

  // =====================================
  // RESEND EMAIL OTP
  // =====================================

  resendOtp(email: string): Observable<any> {

    return this.http.post(
      `${this.authUrl}/resend-otp`,
      {
        email
      }
    );

  }

  // =====================================
  // SEND CHANGE PASSWORD OTP
  // =====================================

  sendChangePasswordOtp(): Observable<any> {

    return this.http.post(
      `${this.userUrl}/change-password/send-otp`,
      {},
      {
        headers: this.getAuthHeaders()
      }
    );

  }

  // =====================================
  // VERIFY CHANGE PASSWORD OTP
  // =====================================

  verifyChangePasswordOtp(data: {
    otp: string;
    newPassword: string;
  }): Observable<any> {

    return this.http.put(
      `${this.userUrl}/change-password/verify-otp`,
      data,
      {
        headers: this.getAuthHeaders()
      }
    );

  }

  // =====================================
// FORGOT PASSWORD
// =====================================

forgotPassword(email: string): Observable<any> {

  return this.http.post(

    `${this.authUrl}/forgot-password`,

    {

      email

    }

  );

}
// =====================================
// RESET PASSWORD
// =====================================

resetPassword(data: {

  email: string;

  otp: string;

  newPassword: string;

}): Observable<any> {

  return this.http.post(

    `${this.authUrl}/reset-password`,

    data

  );

}

  // =====================================
  // LOGOUT
  // =====================================

  logout(): void {

    localStorage.removeItem('token');
    localStorage.removeItem('user');

    this.currentUserSignal.set(null);

  }

  // =====================================
  // TOKEN
  // =====================================

  getToken(): string | null {

    return localStorage.getItem('token');

  }

  // =====================================
  // CURRENT USER
  // =====================================

  getCurrentUser(): User | null {

    return this.currentUserSignal();

  }

  // =====================================
  // AUTH HEADERS
  // =====================================

  private getAuthHeaders(): HttpHeaders {

    return new HttpHeaders({

      Authorization: `Bearer ${this.getToken()}`

    });

  }

  // =====================================
  // SAVE SESSION
  // =====================================

  private saveSession(token: string, user: User): void {

    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));

    this.currentUserSignal.set(user);

  }

  // =====================================
  // GET USER FROM STORAGE
  // =====================================

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