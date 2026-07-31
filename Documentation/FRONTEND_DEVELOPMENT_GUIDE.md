# Frontend Development Guide
# WasteZero — Milestone 3 Frontend Implementation

**Target:** Angular 21 (standalone components, signals)  
**Backend:** Fully implemented for all 3 Milestones  
**Goal:** Build Milestone 3 frontend features: Pickups, Match Suggestions, Messaging, Notifications

---

## Table of Contents

1. [Project Setup](#1-project-setup)
2. [Technology Stack](#2-technology-stack)
3. [Existing Architecture](#3-existing-architecture)
4. [Environment Configuration](#4-environment-configuration)
5. [Feature: Pickups Module](#5-feature-pickups-module)
6. [Feature: Match Suggestions](#6-feature-match-suggestions)
7. [Feature: Messaging Module](#7-feature-messaging-module)
8. [Feature: Notifications Module](#8-feature-notifications-module)
9. [Socket.IO Integration Guide](#9-socketio-integration-guide)
10. [Recommended: HTTP Interceptor](#10-recommended-http-interceptor)
11. [Route Integration](#11-route-integration)
12. [Layout Integration](#12-layout-integration)
13. [Type Definitions for M3](#13-type-definitions-for-m3)
14. [Service Layer for M3](#14-service-layer-for-m3)
15. [Role-Based UI Rendering](#15-role-based-ui-rendering)
16. [Testing Checklist](#16-testing-checklist)
17. [Common Gotchas](#17-common-gotchas)

---

## 1. Project Setup

### Running the Frontend

```bash
cd Frontend
npm install
npm start   # ng serve — runs at http://localhost:4200
```

### Running the Backend

```bash
cd Backend
npm install
node server.js  # runs at http://localhost:5001
```

### Prerequisites

- Node.js 18+
- Angular CLI 21+ (`npm install -g @angular/cli`)
- Backend `.env` fully configured (see `Backend/.env.example`)
- MongoDB running (Atlas or local)

---

## 2. Technology Stack

| Technology | Purpose |
|---|---|
| Angular 21 | SPA framework |
| Angular Material | UI components |
| Bootstrap 5 | Layout + utilities |
| Angular Signals | State management |
| Angular Reactive Forms | Form handling |
| Angular HttpClient | REST API calls |
| socket.io-client | Real-time WebSocket events |

### Installing socket.io-client

```bash
cd Frontend
npm install socket.io-client
```

---

## 3. Existing Architecture

### Routing (`app/app.routes.ts`)

All authenticated routes are children of the `Layout` component, which provides the navbar and layout shell. The `authGuard` protects all children.

```typescript
{
  path: '',
  component: Layout,
  canActivate: [authGuard],
  children: [
    { path: 'dashboard', component: Dashboard },
    { path: 'profile', component: Profile },
    { path: 'change-password', component: ChangePassword },
    { path: 'opportunities', children: opportunityRoutes },
    { path: 'applications', children: applicationRoutes }
    // ← Add M3 routes here
  ]
}
```

### Auth Service (`core/services/auth.service.ts`)

Key APIs:
- `auth.currentUser()` — Signal<User | null>
- `auth.isLoggedIn()` — Computed<boolean>
- `auth.getToken()` — string | null
- `auth.getCurrentUser()` — User | null

### User Interface (`core/models/user.model.ts`)

```typescript
export interface User {
  id?: string;
  _id?: string;
  name: string;
  username: string;
  email: string;
  role: 'volunteer' | 'ngo' | 'admin';
  locations?: UserLocations;
  wasteTypes?: string[];
  skills?: string[];
  bio?: string;
  isVerified?: boolean;
}
```

### Existing Services

| Service | File | Methods |
|---|---|---|
| AuthService | `auth.service.ts` | login, register, verifyOtp, forgotPassword, resetPassword |
| ProfileService | `profile.service.ts` | getProfile, updateProfile |
| OpportunityService | `opportunity.service.ts` | Full CRUD + search + filter |
| ApplicationService | `application.service.ts` | apply, getApplications, updateStatus, withdraw |

---

## 4. Environment Configuration

### `src/environments/environment.ts`

Add `socketUrl` for the Milestone 3 socket connection:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:5001/api',
  socketUrl: 'http://localhost:5001'   // Add this for Socket.IO
};
```

---

## 5. Feature: Pickups Module

### Overview

- **Volunteer:** Create pickup requests, view my pickups, edit pending, cancel/delete pending
- **NGO:** View available pickups (matched), claim (Pending → Assigned), complete/cancel (Assigned)
- **Admin:** View all pickups (read-only)

### API Endpoints

| Action | Method | Endpoint | Access |
|---|---|---|---|
| Create | POST | `/api/pickups` | Volunteer |
| My Pickups | GET | `/api/pickups/my-pickups` | Volunteer |
| Available | GET | `/api/pickups/available` | NGO |
| Assigned To Me | GET | `/api/pickups/assigned-to-me` | NGO |
| All Pickups | GET | `/api/pickups` | Admin |
| Get By ID | GET | `/api/pickups/:id` | Owner/NGO/Admin |
| Update | PUT | `/api/pickups/:id` | Volunteer (owner, Pending) |
| Delete | DELETE | `/api/pickups/:id` | Volunteer (owner, Pending) |
| Cancel | PATCH | `/api/pickups/:id/cancel` | Volunteer (owner, Pending) |
| Status Transition | PATCH | `/api/pickups/:id/status` | NGO (eligible/assigned) |

### Pickup Type Definitions

```typescript
// core/models/pickup.model.ts  [NEW FILE]

export type PickupStatus = 'Pending' | 'Assigned' | 'Completed' | 'Cancelled';

export interface PickupAddress {
  city: string;
  area?: string;
}

export interface TimeSlot {
  start: string;  // HH:mm
  end: string;    // HH:mm
}

export interface Pickup {
  _id: string;
  user_id: string | { _id: string; name: string; email: string };
  agent_id: string | { _id: string; name: string; email: string } | null;
  address: PickupAddress;
  scheduledDate: string;
  preferredTimeSlot: TimeSlot;
  wasteTypes: string[];
  notes?: string;
  status: PickupStatus;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePickupPayload {
  address: PickupAddress;
  scheduledDate: string;
  preferredTimeSlot: TimeSlot;
  wasteTypes?: string[];
  notes?: string;
}

export interface UpdatePickupPayload {
  address?: PickupAddress;
  scheduledDate?: string;
  preferredTimeSlot?: TimeSlot;
  wasteTypes?: string[];
  notes?: string;
}

export interface PickupListResponse {
  success: boolean;
  message: string;
  data: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    pickups: Pickup[];
  };
}

export interface PickupResponse {
  success: boolean;
  message: string;
  data: Pickup;
}
```

### Pickup Service

```typescript
// core/services/pickup.service.ts  [NEW FILE]
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { CreatePickupPayload, UpdatePickupPayload, PickupListResponse, PickupResponse } from '../models/pickup.model';

@Injectable({ providedIn: 'root' })
export class PickupService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly url = `${environment.apiUrl}/pickups`;

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.getToken()}` });
  }

  createPickup(payload: CreatePickupPayload): Observable<PickupResponse> {
    return this.http.post<PickupResponse>(this.url, payload, { headers: this.headers() });
  }

  getMyPickups(params?: { status?: string; page?: number; limit?: number }): Observable<PickupListResponse> {
    let httpParams = new HttpParams();
    if (params?.status) httpParams = httpParams.set('status', params.status);
    if (params?.page) httpParams = httpParams.set('page', params.page.toString());
    if (params?.limit) httpParams = httpParams.set('limit', params.limit.toString());
    return this.http.get<PickupListResponse>(`${this.url}/my-pickups`, { headers: this.headers(), params: httpParams });
  }

  getAvailablePickups(params?: { page?: number; limit?: number }): Observable<PickupListResponse> {
    let httpParams = new HttpParams();
    if (params?.page) httpParams = httpParams.set('page', params.page.toString());
    if (params?.limit) httpParams = httpParams.set('limit', params.limit.toString());
    return this.http.get<PickupListResponse>(`${this.url}/available`, { headers: this.headers(), params: httpParams });
  }

  getAssignedToMe(params?: { status?: string }): Observable<PickupListResponse> {
    let httpParams = new HttpParams();
    if (params?.status) httpParams = httpParams.set('status', params.status);
    return this.http.get<PickupListResponse>(`${this.url}/assigned-to-me`, { headers: this.headers(), params: httpParams });
  }

  getAllPickups(params?: { status?: string; page?: number }): Observable<PickupListResponse> {
    let httpParams = new HttpParams();
    if (params?.status) httpParams = httpParams.set('status', params.status);
    if (params?.page) httpParams = httpParams.set('page', params.page.toString());
    return this.http.get<PickupListResponse>(this.url, { headers: this.headers(), params: httpParams });
  }

  getPickupById(id: string): Observable<PickupResponse> {
    return this.http.get<PickupResponse>(`${this.url}/${id}`, { headers: this.headers() });
  }

  updatePickup(id: string, payload: UpdatePickupPayload): Observable<PickupResponse> {
    return this.http.put<PickupResponse>(`${this.url}/${id}`, payload, { headers: this.headers() });
  }

  deletePickup(id: string): Observable<any> {
    return this.http.delete(`${this.url}/${id}`, { headers: this.headers() });
  }

  cancelPickup(id: string): Observable<PickupResponse> {
    return this.http.patch<PickupResponse>(`${this.url}/${id}/cancel`, {}, { headers: this.headers() });
  }

  updateStatus(id: string, status: string): Observable<PickupResponse> {
    return this.http.patch<PickupResponse>(`${this.url}/${id}/status`, { status }, { headers: this.headers() });
  }
}
```

### Pickup Create Form Validation

```typescript
// Reactive form example
pickupForm = this.fb.group({
  address: this.fb.group({
    city: ['', Validators.required],
    area: ['']
  }),
  scheduledDate: ['', [Validators.required, futureDateValidator()]],
  preferredTimeSlot: this.fb.group({
    start: ['', [Validators.required, Validators.pattern(/^\d{2}:\d{2}$/)]],
    end: ['', [Validators.required, Validators.pattern(/^\d{2}:\d{2}$/)]]
  }),
  wasteTypes: [[]],
  notes: ['', Validators.maxLength(500)]
});

// Custom validator for future date
function futureDateValidator(): ValidatorFn {
  return (control: AbstractControl) => {
    const value = control.value;
    if (!value) return null;
    const selected = new Date(value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selected >= today ? null : { pastDate: true };
  };
}
```

### Role-Based Pickup UI

```html
<!-- In pickup component template -->
@if (user().role === 'volunteer') {
  <!-- Show: My Pickups + Create button -->
}

@if (user().role === 'ngo') {
  <!-- Show: Available Pickups + Assigned To Me tabs -->
}

@if (user().role === 'admin') {
  <!-- Show: All Pickups (read-only) -->
}
```

---

## 6. Feature: Match Suggestions

### Overview

Volunteer-only feature. Shows a ranked list of open opportunities that match the volunteer's skills and location.

### API Endpoint

`GET /api/matches/suggestions?limit=10`

**Requires complete volunteer profile** (city + state + skills). If incomplete, backend returns 400 with `missingFields`.

### Match Service

```typescript
// core/services/match.service.ts  [NEW FILE]
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface MatchSuggestion {
  _id: string;
  title: string;
  description: string;
  required_skills: string[];
  location: string;
  duration: string;
  status: string;
  matchScore: number;
  matchedSkillCount: number;
  locationMatch: boolean;
}

@Injectable({ providedIn: 'root' })
export class MatchService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly url = `${environment.apiUrl}/matches`;

  getSuggestions(limit = 10): Observable<any> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${this.auth.getToken()}` });
    const params = new HttpParams().set('limit', limit.toString());
    return this.http.get(`${this.url}/suggestions`, { headers, params });
  }
}
```

### Profile Incomplete Handling

```typescript
// Handle the 400 response from /api/matches/suggestions
this.matchService.getSuggestions().subscribe({
  next: (res) => { this.matches = res.data.matches; },
  error: (err) => {
    if (err.status === 400 && err.error?.missingFields) {
      // Display: "Complete your profile to see match suggestions"
      // Link to /profile
      this.missingFields = err.error.missingFields;
    }
  }
});
```

---

## 7. Feature: Messaging Module

### Overview

Real-time 1:1 messaging between Volunteer and NGO using Socket.IO.
REST APIs used for conversation list and message history.
Socket.IO events used for sending, receiving, typing, and read receipts.

### REST APIs

| Action | Method | Endpoint |
|---|---|---|
| Conversations list | GET | `/api/messages/conversations` |
| Message history | GET | `/api/messages?with=:userId` |

### Socket.IO Events

See [SOCKET_DOCUMENTATION.md](./SOCKET_DOCUMENTATION.md) for full event reference.

### Message Type Definitions

```typescript
// core/models/message.model.ts  [NEW FILE]

export interface Message {
  _id: string;
  sender_id: string;
  receiver_id: string;
  conversation_id: string;
  content: string;   // Always plaintext (decrypted by backend)
  status: 'sent' | 'delivered' | 'read';
  readAt?: string;
  createdAt: string;
}

export interface Conversation {
  conversationId: string;
  otherUser: {
    _id: string;
    name: string;
    email: string;
    role: string;
  } | null;
  lastMessage: Message;
}
```

### Message Service (REST layer)

```typescript
// core/services/message.service.ts  [NEW FILE]
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class MessageService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly url = `${environment.apiUrl}/messages`;

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.getToken()}` });
  }

  getConversations(): Observable<any> {
    return this.http.get(this.url + '/conversations', { headers: this.headers() });
  }

  getMessageHistory(withUserId: string): Observable<any> {
    const params = new HttpParams().set('with', withUserId);
    return this.http.get(this.url, { headers: this.headers(), params });
  }
}
```

### Socket Service (Milestone 3)

Create a shared `SocketService`:

```typescript
// core/services/socket.service.ts  [NEW FILE]
import { Injectable, inject, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { Message } from '../models/message.model';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private auth = inject(AuthService);
  private socket: Socket | null = null;

  // Signals for reactive UI
  readonly newMessage = signal<Message | null>(null);
  readonly typingUserId = signal<string | null>(null);
  readonly readConversationId = signal<string | null>(null);

  connect(): void {
    const token = this.auth.getToken();
    if (!token || this.socket?.connected) return;

    this.socket = io(environment.socketUrl, {
      auth: { token }
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket?.id);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });

    this.socket.on('message:new', (msg: Message) => {
      this.newMessage.set(msg);
    });

    this.socket.on('message:typing', ({ senderId }: { senderId: string }) => {
      this.typingUserId.set(senderId);
      // Auto-clear after 3 seconds
      setTimeout(() => this.typingUserId.set(null), 3000);
    });

    this.socket.on('message:read', ({ conversationId }: { conversationId: string }) => {
      this.readConversationId.set(conversationId);
    });

    this.socket.on('notification:new', (notification: any) => {
      // Handle in NotificationService or directly
    });
  }

  sendMessage(receiverId: string, content: string): Promise<Message> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      this.socket.emit('message:send', { receiverId, content }, (ack: any) => {
        if (ack.success) resolve(ack.data);
        else reject(new Error(ack.message));
      });
    });
  }

  markRead(conversationId: string): void {
    this.socket?.emit('message:read', { conversationId });
  }

  sendTyping(receiverId: string): void {
    this.socket?.emit('message:typing', { receiverId });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}
```

### When to Connect/Disconnect

- **Connect:** After successful login (in `AppComponent` or `Layout`)
- **Disconnect:** On logout

```typescript
// In app.ts or layout.ts
ngOnInit() {
  if (this.auth.isLoggedIn()) {
    this.socketService.connect();
  }
}

// In auth.service.ts logout():
logout(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  this.currentUserSignal.set(null);
  inject(SocketService).disconnect();
}
```

### Chat Window Component

Key UX requirements:
- Messages sorted oldest-first (already returned that way by `/api/messages?with=`)
- Auto-scroll to bottom on new message
- Show typing indicator when `socketService.typingUserId()` matches the other user
- Emit `message:typing` with debounce (500ms) on input change
- Emit `message:read` when the user opens the conversation
- Handle 409/rate limit errors gracefully

---

## 8. Feature: Notifications Module

### Overview

- Show a notification badge in the navbar with unread count
- Notification center page/dropdown with full list
- Mark individual notifications as read
- Real-time updates via `notification:new` socket event

### API Endpoints

| Action | Method | Endpoint |
|---|---|---|
| Get notifications | GET | `/api/notifications?page=1&limit=20` |
| Mark as read | PUT | `/api/notifications/:id/read` |

### Notification Type Definitions

```typescript
// core/models/notification.model.ts  [NEW FILE]

export type NotificationType = 'message' | 'opportunity_match' | 'pickup_match';

export interface AppNotification {
  _id: string;
  user_id: string;
  type: NotificationType;
  message: string;          // Always plaintext (decrypted by backend)
  reference_id: string | null;  // ObjectId or conversationId string
  isRead: boolean;
  createdAt: string;
}

export interface NotificationListResponse {
  success: boolean;
  message: string;
  data: {
    page: number;
    limit: number;
    notifications: AppNotification[];
  };
}
```

### Notification Service

```typescript
// core/services/notification.service.ts  [NEW FILE]
import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { AppNotification } from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly url = `${environment.apiUrl}/notifications`;

  readonly notifications = signal<AppNotification[]>([]);
  readonly unreadCount = computed(() => this.notifications().filter(n => !n.isRead).length);

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.getToken()}` });
  }

  loadNotifications(page = 1, limit = 20): void {
    const params = new HttpParams().set('page', page).set('limit', limit);
    this.http.get<any>(this.url, { headers: this.headers(), params }).subscribe({
      next: (res) => {
        if (page === 1) {
          this.notifications.set(res.data.notifications);
        } else {
          this.notifications.update(existing => [...existing, ...res.data.notifications]);
        }
      }
    });
  }

  markAsRead(id: string): void {
    this.http.put<any>(`${this.url}/${id}/read`, {}, { headers: this.headers() }).subscribe({
      next: (res) => {
        this.notifications.update(list =>
          list.map(n => n._id === id ? { ...n, isRead: true } : n)
        );
      }
    });
  }

  // Called by SocketService when 'notification:new' fires
  addNotification(notification: AppNotification): void {
    this.notifications.update(existing => [notification, ...existing]);
  }
}
```

### Navbar Badge

```html
<!-- In layout/navbar component -->
<button mat-icon-button [routerLink]="['/notifications']">
  <mat-icon>notifications</mat-icon>
  @if (notificationService.unreadCount() > 0) {
    <span class="badge">{{ notificationService.unreadCount() }}</span>
  }
</button>
```

### Notification Navigation

When user clicks a notification, navigate based on type:

```typescript
handleNotificationClick(notification: AppNotification): void {
  this.notificationService.markAsRead(notification._id);

  switch (notification.type) {
    case 'opportunity_match':
      this.router.navigate(['/opportunities', notification.reference_id]);
      break;
    case 'pickup_match':
      this.router.navigate(['/pickups/available']);
      break;
    case 'message':
      // reference_id is conversationId string: "userId1_userId2"
      // Extract the other user's ID
      const ids = notification.reference_id?.split('_') ?? [];
      const currentUserId = this.auth.getCurrentUser()?.id;
      const otherUserId = ids.find(id => id !== currentUserId);
      if (otherUserId) {
        this.router.navigate(['/messages'], { queryParams: { with: otherUserId } });
      }
      break;
  }
}
```

---

## 9. Socket.IO Integration Guide

### Install

```bash
cd Frontend
npm install socket.io-client
```

### Auth Token Format

The token passed to Socket.IO must include the `Bearer ` prefix:

```typescript
auth: { token: `Bearer ${this.auth.getToken()}` }
```

### Reconnection Handling

Socket.IO auto-reconnects by default. If the JWT expires during an active session, the server will reject the reconnection. Handle this:

```typescript
socket.on('connect_error', (err) => {
  if (err.message.includes('expired') || err.message.includes('Invalid token')) {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
});
```

### Throttling Typing Events

Don't emit `message:typing` on every keystroke — debounce it:

```typescript
// In chat window component
private typingSubject = new Subject<void>();

ngOnInit() {
  this.typingSubject.pipe(debounceTime(500)).subscribe(() => {
    if (this.otherUserId) {
      this.socketService.sendTyping(this.otherUserId);
    }
  });
}

onInputChange(): void {
  this.typingSubject.next();
}
```

---

## 10. Recommended: HTTP Interceptor

The existing M1/M2 services manually attach the `Authorization` header in each call. For M3, add an interceptor:

```typescript
// core/interceptors/auth.interceptor.ts  [NEW FILE]
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();

  if (token) {
    const cloned = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
    return next(cloned);
  }

  return next(req);
};
```

Register in `app.config.ts`:

```typescript
// app.config.ts
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};
```

---

## 11. Route Integration

Add M3 routes to `app/app.routes.ts` inside the Layout children:

```typescript
// Import new components
import { PickupListComponent } from './features/pickups/pickup-list/pickup-list';
import { PickupCreateComponent } from './features/pickups/pickup-create/pickup-create';
import { MatchSuggestionsComponent } from './features/matches/match-suggestions/match-suggestions';
import { MessagesComponent } from './features/messages/messages/messages';
import { NotificationsComponent } from './features/notifications/notifications/notifications';

// In Layout children:
{ path: 'pickups', component: PickupListComponent },
{ path: 'pickups/create', component: PickupCreateComponent },
{ path: 'matches', component: MatchSuggestionsComponent },
{ path: 'messages', component: MessagesComponent },
{ path: 'notifications', component: NotificationsComponent },
```

---

## 12. Layout Integration

The `Layout` component (`features/layout/layout`) provides the navigation shell. Update the navbar/sidebar to add links for M3 features (conditionally shown by role):

```html
<!-- Volunteer-only nav items -->
@if (user().role === 'volunteer') {
  <a [routerLink]="['/pickups']">My Pickups</a>
  <a [routerLink]="['/matches']">Match Suggestions</a>
}

<!-- NGO-only nav items -->
@if (user().role === 'ngo') {
  <a [routerLink]="['/pickups/available']">Available Pickups</a>
  <a [routerLink]="['/pickups/assigned']">Assigned To Me</a>
}

<!-- All logged-in users -->
<a [routerLink]="['/messages']">Messages</a>
<a [routerLink]="['/notifications']">
  Notifications
  @if (unreadCount() > 0) { <span class="badge">{{ unreadCount() }}</span> }
</a>
```

---

## 13. Type Definitions for M3

Create these files in `src/app/core/models/`:

| File | Purpose |
|---|---|
| `pickup.model.ts` | Pickup, PickupStatus, CreatePickupPayload, PickupListResponse |
| `message.model.ts` | Message, Conversation |
| `notification.model.ts` | AppNotification, NotificationType, NotificationListResponse |

See full definitions in Sections 5, 7, and 8 above.

---

## 14. Service Layer for M3

Create these files in `src/app/core/services/`:

| File | Purpose |
|---|---|
| `pickup.service.ts` | All pickup API calls |
| `match.service.ts` | Match suggestions API |
| `message.service.ts` | REST: conversations + history |
| `notification.service.ts` | REST: list + mark-read + signal store |
| `socket.service.ts` | Socket.IO connection + events |

See full implementations in Sections 5, 6, 7, 8, and 9 above.

---

## 15. Role-Based UI Rendering

Use Angular's `@if` directive with the current user's role:

```typescript
// In component
user = inject(AuthService).currentUser;  // signal
role = computed(() => this.user()?.role);
```

```html
<!-- Volunteer-only content -->
@if (role() === 'volunteer') {
  <app-create-pickup-button />
}

<!-- NGO-only content -->
@if (role() === 'ngo') {
  <app-claim-pickup-button [pickup]="pickup" />
}

<!-- Admin-only content -->
@if (role() === 'admin') {
  <app-admin-pickup-table [pickups]="allPickups" />
}
```

---

## 16. Testing Checklist

After implementing M3 frontend, verify the following end-to-end:

### Pickups (Volunteer)
- [ ] Create a pickup with valid data → success
- [ ] Create with past date → client-side validation error
- [ ] View "My Pickups" → own pickups listed
- [ ] Edit a Pending pickup → success
- [ ] Cancel a Pending pickup → status changes to Cancelled
- [ ] Delete a Pending pickup → removed from list
- [ ] Try to edit an Assigned pickup → blocked (UI hides/disables edit)

### Pickups (NGO)
- [ ] NGO with incomplete profile visits "Available" → error message with missing fields
- [ ] NGO with complete profile visits "Available" → sees matched Pending pickups
- [ ] Click "Claim" → status changes to Assigned; NGO sees it in "Assigned To Me"
- [ ] Click "Complete" on an Assigned pickup → Completed
- [ ] Two NGOs try to claim same pickup → one gets 409, other succeeds

### Match Suggestions (Volunteer)
- [ ] Volunteer with complete profile visits Matches → ranked list
- [ ] Volunteer with incomplete profile → error with missing fields list
- [ ] Click on a suggestion → navigates to opportunity detail

### Messaging
- [ ] Send a message → appears in chat for both users
- [ ] Typing indicator appears when other user is typing
- [ ] Read receipt updates after opening conversation
- [ ] NGO cannot message another NGO (backend enforces, show error)
- [ ] 21st message in 10 seconds → rate limit error toast

### Notifications
- [ ] Unread badge shows count in navbar
- [ ] Real-time notification badge increments when backend sends `notification:new`
- [ ] Click notification → navigates to correct page
- [ ] Click "Mark as read" → badge decrements
- [ ] Notification list is paginated

---

## 17. Common Gotchas

### 1. `req.user.id` vs `req.user._id`

The backend attaches both `id` (string) and `_id` (ObjectId) to `req.user`. Always use `user.id` (string) for comparison operations. The frontend's `User` interface has both `id?` and `_id?` — prefer `id`.

### 2. Conversation ID Format

`conversationId = [idA, idB].sort().join('_')` — order doesn't matter. When parsing:

```typescript
const [part1, part2] = conversationId.split('_');
const otherUserId = part1 === currentUserId ? part2 : part1;
```

### 3. `message:read` Participant Verification

The backend verifies the caller is a participant by checking `conversationId.split('_').includes(socket.user.id)`. If you build the conversation ID client-side, make sure it matches the format exactly.

### 4. Notification `reference_id` Type

For `message` type notifications, `reference_id` is a **string** conversation ID, NOT a MongoDB ObjectId. Don't try to navigate to `/messages/{reference_id}` — parse the user IDs first.

### 5. Socket Reconnects After Page Refresh

On page refresh, the Angular app re-initializes. Re-connect the socket in `AppComponent.ngOnInit()` if the user is already logged in:

```typescript
ngOnInit() {
  if (this.auth.isLoggedIn()) {
    this.socketService.connect();
    this.notificationService.loadNotifications();
  }
}
```

### 6. Pickup `status` is Capitalized

The backend uses `'Pending'`, `'Assigned'`, `'Completed'`, `'Cancelled'` (initial capital). Unlike opportunity `status` which is lowercase (`'open'`, `'in-progress'`, `'closed'`). Don't mix them.

### 7. Available Pickups Require Complete NGO Profile

`GET /api/pickups/available` returns **400** (not 200 with empty array) if the NGO's profile is missing city or wasteTypes. Handle this error state in the UI and provide a link to the profile page.

### 8. Match Suggestions Require Complete Volunteer Profile

Same pattern — `GET /api/matches/suggestions` returns 400 if profile incomplete.

### 9. `iv` and `authTag` Never in Responses

You will never see `iv` or `authTag` in any API response. The backend always strips them. All `content` (messages) and `message` (notifications) fields are decrypted plaintext.

### 10. Socket Rate Limit Error Shape

The rate limiter uses `rate-limiter-flexible` which rejects with a `RateLimiterRes` object (not an `Error`). The server converts this to an ack message: `"You are sending messages too quickly. Please slow down."` — the frontend just needs to display this string.
