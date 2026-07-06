import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private http = inject(HttpClient);

  private baseUrl = 'http://localhost:5000/api/auth';

  login(data: any): Observable<any> {
  return this.http.post<any>(`${this.baseUrl}/login`, data);
}
 register(data: any): Observable<any> {
  return this.http.post<any>(`${this.baseUrl}/register`, data);
}

}