import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, delay, map, tap } from 'rxjs/operators';

import { environment } from '../../../environments/environment';

import {
  AdminLog,
  AdminReport,
  AdminUser,
  AdminUserStatus,
  ReportType,
} from '../models/admin.model';

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = `${environment.apiUrl}/admin`;

  private readonly usersKey = 'wastezero-admin-mock-users';
  private readonly logsKey = 'wastezero-admin-mock-logs';

  private readonly seedUsers: AdminUser[] = [
    {
      id: 'u-1001',
      name: 'Arun Kumar',
      username: 'arunkumar',
      email: 'arun@example.com',
      role: 'volunteer',
      status: 'active',
      verified: true,
      joinedAt: '2026-07-02T09:30:00Z',
      lastActiveAt: '2026-08-10T15:20:00Z',
      location: 'Chennai',
      phone: '+91 90000 10001',
    },
    {
      id: 'u-1002',
      name: 'Priya Nair',
      username: 'priyanair',
      email: 'priya@example.com',
      role: 'ngo',
      status: 'active',
      verified: true,
      joinedAt: '2026-06-21T11:10:00Z',
      lastActiveAt: '2026-08-11T10:10:00Z',
      location: 'Coimbatore',
      phone: '+91 90000 10002',
    },
    {
      id: 'u-1003',
      name: 'Rahul Das',
      username: 'rahuldas',
      email: 'rahul@example.com',
      role: 'volunteer',
      status: 'suspended',
      verified: true,
      joinedAt: '2026-05-16T08:45:00Z',
      lastActiveAt: '2026-07-28T12:00:00Z',
      location: 'Bengaluru',
      phone: '+91 90000 10003',
    },
    {
      id: 'u-1004',
      name: 'Green Earth NGO',
      username: 'greenearth',
      email: 'admin@greenearth.org',
      role: 'ngo',
      status: 'active',
      verified: true,
      joinedAt: '2026-04-12T06:15:00Z',
      lastActiveAt: '2026-08-09T17:35:00Z',
      location: 'Madurai',
    },
    {
      id: 'u-1005',
      name: 'Meena Krishnan',
      username: 'meenak',
      email: 'meena@example.com',
      role: 'volunteer',
      status: 'active',
      verified: false,
      joinedAt: '2026-07-19T13:25:00Z',
      lastActiveAt: '2026-08-08T09:15:00Z',
      location: 'Salem',
      phone: '+91 90000 10005',
    },
    {
      id: 'u-1006',
      name: 'WasteZero Admin',
      username: 'admin',
      email: 'admin@wastezero.com',
      role: 'admin',
      status: 'active',
      verified: true,
      joinedAt: '2026-01-01T08:00:00Z',
      lastActiveAt: '2026-08-11T12:30:00Z',
      location: 'Chennai',
    },
    {
      id: 'u-1007',
      name: 'Vikram Singh',
      username: 'viksingh',
      email: 'vikram@example.com',
      role: 'volunteer',
      status: 'active',
      verified: true,
      joinedAt: '2026-06-04T10:00:00Z',
      lastActiveAt: '2026-08-07T18:20:00Z',
      location: 'Hyderabad',
    },
    {
      id: 'u-1008',
      name: 'EcoCare Foundation',
      username: 'ecocare',
      email: 'hello@ecocare.org',
      role: 'ngo',
      status: 'suspended',
      verified: true,
      joinedAt: '2026-03-23T09:10:00Z',
      lastActiveAt: '2026-07-31T11:40:00Z',
      location: 'Pune',
    },
    {
      id: 'u-1009',
      name: 'Ananya Rao',
      username: 'ananyarao',
      email: 'ananya@example.com',
      role: 'volunteer',
      status: 'active',
      verified: true,
      joinedAt: '2026-07-24T14:00:00Z',
      lastActiveAt: '2026-08-10T07:45:00Z',
      location: 'Mysuru',
    },
    {
      id: 'u-1010',
      name: 'Clean City Initiative',
      username: 'cleancity',
      email: 'team@cleancity.org',
      role: 'ngo',
      status: 'active',
      verified: true,
      joinedAt: '2026-05-30T07:30:00Z',
      lastActiveAt: '2026-08-06T16:05:00Z',
      location: 'Kochi',
    },
    {
      id: 'u-1011',
      name: 'Sanjay Patel',
      username: 'sanjayp',
      email: 'sanjay@example.com',
      role: 'volunteer',
      status: 'active',
      verified: false,
      joinedAt: '2026-08-01T09:00:00Z',
      lastActiveAt: '2026-08-10T20:00:00Z',
      location: 'Mumbai',
    },
    {
      id: 'u-1012',
      name: 'Asha Menon',
      username: 'ashamenon',
      email: 'asha@example.com',
      role: 'volunteer',
      status: 'active',
      verified: true,
      joinedAt: '2026-06-14T12:00:00Z',
      lastActiveAt: '2026-08-05T14:50:00Z',
      location: 'Kozhikode',
    },
  ];

  private readonly seedLogs: AdminLog[] = [
    {
      id: 'l-001',
      action: 'LOGIN',
      description: 'Admin signed in',
      actorName: 'WasteZero Admin',
      actorRole: 'admin',
      createdAt: '2026-08-11T12:30:00Z',
    },
    {
      id: 'l-002',
      action: 'USER_SUSPENDED',
      description: 'User account suspended',
      actorName: 'WasteZero Admin',
      actorRole: 'admin',
      targetName: 'Rahul Das',
      createdAt: '2026-08-10T12:00:00Z',
    },
    {
      id: 'l-003',
      action: 'REPORT_DOWNLOADED',
      description: 'User report downloaded as CSV',
      actorName: 'WasteZero Admin',
      actorRole: 'admin',
      createdAt: '2026-08-10T11:20:00Z',
    },
    {
      id: 'l-004',
      action: 'USER_ACTIVATED',
      description: 'User account activated',
      actorName: 'WasteZero Admin',
      actorRole: 'admin',
      targetName: 'EcoCare Foundation',
      createdAt: '2026-08-09T16:45:00Z',
    },
    {
      id: 'l-005',
      action: 'USER_UPDATED',
      description: 'User profile updated',
      actorName: 'WasteZero Admin',
      actorRole: 'admin',
      targetName: 'Priya Nair',
      createdAt: '2026-08-08T10:15:00Z',
    },
    {
      id: 'l-006',
      action: 'LOGIN',
      description: 'Admin signed in',
      actorName: 'WasteZero Admin',
      actorRole: 'admin',
      createdAt: '2026-08-07T09:10:00Z',
    },
    {
      id: 'l-007',
      action: 'LOGOUT',
      description: 'Admin signed out',
      actorName: 'WasteZero Admin',
      actorRole: 'admin',
      createdAt: '2026-08-07T08:50:00Z',
    },
    {
      id: 'l-008',
      action: 'REPORT_DOWNLOADED',
      description: 'Activity report downloaded as PDF',
      actorName: 'WasteZero Admin',
      actorRole: 'admin',
      createdAt: '2026-08-06T15:30:00Z',
    },
  ];

  getUsers(): Observable<AdminUser[]> {
    return this.http
      .get<any>(`${this.baseUrl}/users`, {
        headers: this.headers(),
      })
      .pipe(
        map((res) => (Array.isArray(res) ? res : (res?.data?.users ?? res?.users ?? []))),
        catchError(() => this.mockUsers()),
      );
  }

  updateUserStatus(id: string, status: AdminUserStatus): Observable<AdminUser> {
    return this.http
      .put<any>(`${this.baseUrl}/users/${id}/status`, { status }, { headers: this.headers() })
      .pipe(
        map((res) => res?.data?.user ?? res?.user ?? res),
        tap((user) => this.persistUser(user)),
        catchError(() => this.updateMockUserStatus(id, status)),
      );
  }

  getLogs(filters: { action?: string; date?: string }): Observable<AdminLog[]> {
    let params = new HttpParams();

    if (filters.action) {
      params = params.set('action', filters.action);
    }

    if (filters.date) {
      params = params.set('date', filters.date);
    }

    return this.http
      .get<any>(`${this.baseUrl}/logs`, {
        headers: this.headers(),
        params,
      })
      .pipe(
        map((res) => (Array.isArray(res) ? res : (res?.data?.logs ?? res?.logs ?? []))),
        catchError(() => this.mockLogs(filters)),
      );
  }

  getReport(type: ReportType, startDate: string, endDate: string): Observable<AdminReport> {
    const params = new HttpParams().set('startDate', startDate).set('endDate', endDate);

    return this.http
      .get<any>(`${this.baseUrl}/reports/${type}`, {
        headers: this.headers(),
        params,
      })
      .pipe(
        map((res) => res?.data?.report ?? res?.report ?? res),
        catchError(() => this.mockReport(type, startDate, endDate)),
      );
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
    });
  }

  private mockUsers(): Observable<AdminUser[]> {
    return of(this.readUsers()).pipe(delay(450));
  }

  private mockLogs(filters: { action?: string; date?: string }): Observable<AdminLog[]> {
    let logs = this.readLogs();

    if (filters.action) {
      logs = logs.filter((log) => log.action === filters.action);
    }

    if (filters.date) {
      logs = logs.filter((log) => log.createdAt.slice(0, 10) === filters.date);
    }

    return of(logs).pipe(delay(350));
  }

  private mockReport(
    type: ReportType,
    startDate: string,
    endDate: string,
  ): Observable<AdminReport> {
    const reports: Record<ReportType, AdminReport> = {
      user: {
        type,
        title: 'User Report',
        generatedAt: new Date().toISOString(),
        columns: ['Date', 'New Users', 'Active Users', 'Suspended Users', 'Verified Users'],
        rows: [
          {
            Date: startDate,
            'New Users': 8,
            'Active Users': 10,
            'Suspended Users': 2,
            'Verified Users': 9,
          },
          {
            Date: endDate,
            'New Users': 5,
            'Active Users': 11,
            'Suspended Users': 2,
            'Verified Users': 10,
          },
        ],
      },

      pickup: {
        type,
        title: 'Pickup Report',
        generatedAt: new Date().toISOString(),
        columns: ['Date', 'Requested', 'Scheduled', 'Completed', 'Cancelled'],
        rows: [
          {
            Date: startDate,
            Requested: 18,
            Scheduled: 14,
            Completed: 11,
            Cancelled: 2,
          },
          {
            Date: endDate,
            Requested: 23,
            Scheduled: 18,
            Completed: 15,
            Cancelled: 3,
          },
        ],
      },

      opportunity: {
        type,
        title: 'Opportunity Report',
        generatedAt: new Date().toISOString(),
        columns: ['Date', 'Posted', 'Active', 'Applications', 'Filled'],
        rows: [
          {
            Date: startDate,
            Posted: 7,
            Active: 18,
            Applications: 42,
            Filled: 5,
          },
          {
            Date: endDate,
            Posted: 9,
            Active: 22,
            Applications: 57,
            Filled: 7,
          },
        ],
      },

      activity: {
        type,
        title: 'Full Activity Report',
        generatedAt: new Date().toISOString(),
        columns: ['Date', 'Logins', 'User Actions', 'Pickup Actions', 'Reports Downloaded'],
        rows: [
          {
            Date: startDate,
            Logins: 31,
            'User Actions': 16,
            'Pickup Actions': 24,
            'Reports Downloaded': 3,
          },
          {
            Date: endDate,
            Logins: 39,
            'User Actions': 21,
            'Pickup Actions': 29,
            'Reports Downloaded': 5,
          },
        ],
      },
    };

    return of({
      ...reports[type],
      title: `${reports[type].title} (${startDate} to ${endDate})`,
    }).pipe(delay(500));
  }

  private updateMockUserStatus(id: string, status: AdminUserStatus): Observable<AdminUser> {
    const users = this.readUsers();

    const index = users.findIndex((user) => user.id === id);

    if (index < 0) {
      return throwError(() => new Error('User not found'));
    }

    const updated = {
      ...users[index],
      status,
    };

    users[index] = updated;

    localStorage.setItem(this.usersKey, JSON.stringify(users));

    const logs = this.readLogs();

    logs.unshift({
      id: `l-${Date.now()}`,
      action: status === 'suspended' ? 'USER_SUSPENDED' : 'USER_ACTIVATED',
      description: status === 'suspended' ? 'User account suspended' : 'User account activated',
      actorName: 'WasteZero Admin',
      actorRole: 'admin',
      targetName: updated.name,
      createdAt: new Date().toISOString(),
    });

    localStorage.setItem(this.logsKey, JSON.stringify(logs));

    return of(updated).pipe(delay(500));
  }

  private persistUser(user: AdminUser): void {
    if (!user?.id) {
      return;
    }

    const users = this.readUsers();

    const index = users.findIndex((item) => item.id === user.id);

    if (index >= 0) {
      users[index] = {
        ...users[index],
        ...user,
      };

      localStorage.setItem(this.usersKey, JSON.stringify(users));
    }
  }

  private readUsers(): AdminUser[] {
    const raw = localStorage.getItem(this.usersKey);

    if (!raw) {
      localStorage.setItem(this.usersKey, JSON.stringify(this.seedUsers));

      return [...this.seedUsers];
    }

    try {
      return JSON.parse(raw) as AdminUser[];
    } catch {
      localStorage.setItem(this.usersKey, JSON.stringify(this.seedUsers));

      return [...this.seedUsers];
    }
  }

  private readLogs(): AdminLog[] {
    const raw = localStorage.getItem(this.logsKey);

    if (!raw) {
      localStorage.setItem(this.logsKey, JSON.stringify(this.seedLogs));

      return [...this.seedLogs];
    }

    try {
      return JSON.parse(raw) as AdminLog[];
    } catch {
      localStorage.setItem(this.logsKey, JSON.stringify(this.seedLogs));

      return [...this.seedLogs];
    }
  }
}
