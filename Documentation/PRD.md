# Product Requirements Document (PRD)
# WasteZero — Full-Stack Waste Management Platform

**Version:** 3.0  
**Last Updated:** 2026-07-31  
**Status:** Milestone 3 Backend Complete | Milestone 3 Frontend Not Built  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision](#2-product-vision)
3. [Problem Statement](#3-problem-statement)
4. [Goals](#4-goals)
5. [Non-Goals](#5-non-goals)
6. [User Roles](#6-user-roles)
7. [User Personas](#7-user-personas)
8. [Functional Requirements](#8-functional-requirements)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [User Stories](#10-user-stories)
11. [Complete User Journey](#11-complete-user-journey)
12. [Complete Screen Flow](#12-complete-screen-flow)
13. [Navigation Flow](#13-navigation-flow)
14. [Feature List](#14-feature-list)
15. [Milestone-Wise Features](#15-milestone-wise-features)
16. [Current Project Status](#16-current-project-status)
17. [Pending Features](#17-pending-features)
18. [Assumptions](#18-assumptions)
19. [Acceptance Criteria](#19-acceptance-criteria)

---

## 1. Executive Summary

WasteZero is a MEAN-stack (MongoDB, Express.js, Angular 21, Node.js) web platform that connects **volunteers** who want to participate in environmental/waste-management activities with **NGOs** that organize them. The platform supports three distinct workflows:

1. **Volunteer Opportunity Matching** — NGOs post volunteer opportunities; volunteers are notified when their skills and location match an open opportunity; volunteers apply; NGOs accept or reject.
2. **Waste Pickup Coordination** — Volunteers submit pickup requests (household waste to be collected); NGOs with matching city and waste-type coverage are notified and can claim the pickup; status transitions atomically from Pending → Assigned → Completed/Cancelled.
3. **Real-Time Messaging & Notifications** — Volunteers and NGOs communicate directly via Socket.IO-powered instant messaging. All system events (opportunity matches, pickup matches, new messages) generate in-app notifications delivered over WebSockets and persisted to MongoDB with AES-256-GCM encryption.

---

## 2. Product Vision

> **"Connect people who care about the environment with the organizations that need them most."**

WasteZero aims to be the primary digital infrastructure for volunteer–NGO coordination in the waste-management sector, lowering barriers to participation through intelligent matching, transparent status tracking, and seamless real-time communication.

---

## 3. Problem Statement

| Problem | Impact |
|---|---|
| NGOs struggle to find volunteers with the right skills in the right location | Low volunteer utilization, opportunities go unfulfilled |
| Volunteers don't know which opportunities are relevant to them | Disengagement, missed chances to contribute |
| Waste pickup coordination is manual, slow, and error-prone | NGOs miss pickups, volunteers wait indefinitely |
| No real-time communication between volunteers and NGOs | Reliance on email/phone, coordination breakdowns |
| Sensitive user data (messages, notifications) stored in plaintext | Data breach risk |

---

## 4. Goals

### Business Goals
- Create a trustworthy, production-grade platform that NGOs and volunteers can rely on
- Enable data-driven matching to maximize volunteer utilization
- Reduce coordination overhead through automation

### Product Goals
- Deliver a complete registration → verification → matching → communication workflow
- Provide role-specific dashboards and views (volunteer, NGO, admin)
- Support real-time updates for all time-sensitive actions

### Technical Goals
- End-to-end AES-256-GCM encryption for all stored messages and notifications
- Atomic database operations to prevent race conditions in competitive workflows (pickup claiming)
- Sub-second Socket.IO event delivery for typing indicators and messages
- Zero data leakage of crypto internals (iv, authTag) to frontend clients

---

## 5. Non-Goals

The following are explicitly **not** in scope for the current milestones:

- Payment processing or donation features
- Social media sharing or public volunteer profiles
- Mobile native apps (iOS/Android)
- Multi-language/i18n support
- Advanced analytics dashboard or reporting exports
- Volunteer ratings or feedback systems
- Push notifications via FCM/APNS
- In-app video/audio calls
- Admin CRUD on all entities (admin is read-only for pickups)
- Volunteer-to-volunteer messaging (only Volunteer ↔ NGO allowed)
- NGO-to-NGO messaging

---

## 6. User Roles

### 6.1 Volunteer

A registered individual who wants to participate in environmental volunteer activities or schedule waste pickups from their home.

**Capabilities:**
- Register, verify email via OTP, login
- Complete profile (name, bio, skills, primary location)
- Browse, search, and filter volunteer opportunities
- Receive automatic notifications when new opportunities match their skills and location
- Apply for open opportunities
- Withdraw pending applications
- View their own applications and their status
- Create waste pickup requests
- Track their pickup requests (Pending, Assigned, Completed, Cancelled)
- Cancel or delete their own pending pickup requests
- Edit pending pickup details
- View matched opportunity suggestions (`/api/matches/suggestions`)
- Send and receive real-time messages to/from NGOs
- View notifications (opportunity matches, pickup matches, new messages)

**Cannot:**
- Create opportunities (403)
- View all applications (403)
- Access NGO's pickup discovery feed
- Claim or complete pickups
- Message other volunteers

### 6.2 NGO (Non-Governmental Organization)

A registered organization that either posts volunteer opportunities or performs waste pickups.

**Capabilities:**
- Register, verify email via OTP, login
- Complete profile (name, bio, wasteTypes, primary location)
- Create, edit, delete volunteer opportunities (with optional Cloudinary image)
- View and manage applications for their own opportunities (accept/reject)
- View their own opportunities
- Receive notifications when new pickups match their coverage area and waste types
- Browse the available pickup feed (city + wasteTypes matched, Pending only)
- Claim a pickup (Pending → Assigned)
- Complete an assigned pickup (Assigned → Completed)
- Cancel an assigned pickup (Assigned → Cancelled)
- View pickups assigned to them
- Send and receive real-time messages to/from volunteers
- View notifications

**Cannot:**
- Create pickup requests (403)
- Cancel a Pending pickup they haven't claimed
- Access other NGO's assigned pickups
- Edit/delete opportunities owned by other NGOs

### 6.3 Admin

A single super-user account for system oversight. Only one admin account can exist.

**Capabilities:**
- Register (first admin only), verify, login
- Get any pickup by ID
- List all pickups in the system (with optional status filter)
- View all applications (with optional opportunity/status filter)
- Access protected routes

**Cannot:**
- Create, edit, delete, or cancel pickups
- Create, edit, or delete opportunities
- Message users
- View pickup matching feed (designed for NGOs only)
- Admin cannot exist as a pickup `user_id` or `agent_id`

---

## 7. User Personas

### Persona 1 — Asha Rao (Volunteer)
- **Age:** 26
- **Background:** Software engineer interested in environmental causes
- **Skills:** First Aid, Driving, Data Entry
- **Location:** Bangalore, Karnataka
- **Goal:** Find weekend volunteer activities near her home that match her skills
- **Pain point:** Sifts through irrelevant social media posts to find opportunities
- **WasteZero value:** Receives tailored opportunity suggestions automatically; can schedule household plastic waste for pickup in minutes

### Persona 2 — Green Earth NGO (Director: Priya Sharma)
- **NGO Focus:** Plastic and e-waste collection in Bangalore
- **Team:** 5 field workers
- **Goal:** Coordinate weekend cleanup drives and manage pickup logistics
- **Pain point:** Manually reaching out to volunteers by phone; missed pickups because of no-shows
- **WasteZero value:** Posts opportunities once, system notifies all eligible volunteers; sees real-time pickup dashboard; chats with volunteers directly

### Persona 3 — Super Admin
- **Role:** System administrator for the WasteZero platform
- **Goal:** Monitor system health, audit pickup and application data
- **WasteZero value:** Read-only view of all pickups, applications, users

---

## 8. Functional Requirements

### FR-AUTH-01: User Registration
- System accepts name, username, email, password (min 8 chars, uppercase, lowercase, number, special char), and role (volunteer/ngo/admin)
- System does NOT create user immediately — stores registration data in `otps` collection with `purpose: "verify"`
- System sends 6-digit OTP to the provided email
- Rate-limited to prevent OTP abuse

### FR-AUTH-02: Email OTP Verification
- User submits email + OTP
- If valid and not expired: user document created in `users` collection with `isVerified: true`; OTP document deleted
- If invalid: returns 400 with error; OTP attempt counter incremented
- After 5 failed attempts: OTP document locked (further attempts blocked)

### FR-AUTH-03: Login
- Accepts `identifier` (username or email) + password
- Returns JWT (7-day expiry) + user object on success
- Returns 403 if email not verified
- Returns 401 if wrong password or user not found

### FR-AUTH-04: Forgot Password / Reset Password
- `forgot-password`: always returns success (enumeration-safe); sends OTP if email exists
- `reset-password`: accepts email + OTP + newPassword; validates OTP, checks new password ≠ current, updates password

### FR-AUTH-05: Change Password (Authenticated)
- Two-step: first request OTP to logged-in user's email; then verify OTP + new password

### FR-PROFILE-01: Get Profile
- Returns current user's profile (all fields except password, iv, authTag)

### FR-PROFILE-02: Update Profile
- Accepts name, bio, skills (volunteer), wasteTypes (NGO), locations (primary + secondary)
- Blocks save if profile is still incomplete after merge (completeness check: requires primary city + state + skills for volunteers, primary city + state + wasteTypes for NGOs)

### FR-OPP-01: Create Opportunity (NGO/Admin)
- Required fields: title, description, required_skills[], duration, location
- Optional: image (multipart/form-data → Cloudinary), date, status
- After creation: fire-and-forget matching notification to all eligible volunteers

### FR-OPP-02: Read Opportunities (all logged-in users)
- List all (paginated), get by ID, search by text, filter by status/skill/location/sort

### FR-OPP-03: My Opportunities (NGO/Admin)
- Returns only opportunities created by the logged-in NGO

### FR-OPP-04: Update/Delete Opportunity (NGO/Admin, owner only)
- checkOpportunityOwnership middleware enforces ownership
- Delete also removes Cloudinary image asset

### FR-APP-01: Apply for Opportunity (Volunteer)
- Opportunity must be `open`; no duplicate applications
- Creates application with `status: "pending"`

### FR-APP-02: Get Applications
- Volunteer: their own; NGO: for their opportunities; Admin: all

### FR-APP-03: Accept/Reject Application (NGO)
- Only for `pending` applications of owned opportunities
- Status becomes terminal (cannot re-change from accepted/rejected)

### FR-APP-04: Withdraw Application (Volunteer)
- Only for own `pending` applications
- Deletes the application document

### FR-PICKUP-01: Create Pickup (Volunteer)
- Required: address.city, scheduledDate (future), preferredTimeSlot.start/end (HH:mm), wasteTypes[]
- After creation: fire-and-forget matching notification to eligible NGOs

### FR-PICKUP-02: Read Pickups
- Volunteer: own pickups (`/my-pickups`)
- NGO: available pickups matched to their profile (`/available`); assigned pickups (`/assigned-to-me`)
- Admin: all pickups (`GET /api/pickups`)
- By ID: access-controlled by `checkPickupViewAccess`

### FR-PICKUP-03: Update Pickup (Volunteer, Pending only)
- Can update address, scheduledDate, preferredTimeSlot, wasteTypes, notes
- Re-triggers NGO matching if city or wasteTypes changed

### FR-PICKUP-04: Status Transition (NGO)
- `PATCH /api/pickups/:id/status`
- NGO must be eligible (city + wasteTypes match) enforced by `checkPickupNgoMatch`
- Atomically: Pending → Assigned (sets agent_id), Assigned → Completed (sets completedAt), Assigned → Cancelled
- Race condition protection: 409 if another request already changed state

### FR-PICKUP-05: Cancel Pickup (Volunteer, Pending only)
- `PATCH /api/pickups/:id/cancel`
- Atomic: returns 409 if pickup was claimed in the gap

### FR-PICKUP-06: Delete Pickup (Volunteer, Pending only)
- Atomic: returns 409 if pickup was claimed in the gap

### FR-MATCH-01: Opportunity Match Suggestions (Volunteer)
- `GET /api/matches/suggestions`
- Requires complete profile; returns ranked list (skill count + location score)
- Capped at 50; default 10

### FR-MSG-01: Send Message (Socket.IO)
- `message:send` event with `{receiverId, content}`
- Only Volunteer ↔ NGO allowed
- Content ≤ 2000 chars
- Rate limited: 20 messages per 10 seconds per user
- Encrypted with AES-256-GCM before storage
- Broadcasts decrypted `message:new` to receiver's room
- Dispatches encrypted `message` type notification

### FR-MSG-02: Typing Indicator (Socket.IO)
- `message:typing` event with `{receiverId}`
- Fire-and-forget; no DB write; forwarded as `message:typing` with `{senderId}` to receiver

### FR-MSG-03: Read Receipt (Socket.IO)
- `message:read` event with `{conversationId}`
- Verifies caller is a participant
- Updates all receiver's unread messages in conversation to `status: "read"`, sets `readAt`
- Broadcasts `message:read` event with `{conversationId, readerId}` to the other user

### FR-MSG-04: Get Message History (REST)
- `GET /api/messages?with=userId`
- Returns messages oldest-first, decrypted

### FR-MSG-05: Get Conversations (REST)
- `GET /api/messages/conversations`
- Returns WhatsApp-style list: conversation ID, other user profile, last message (decrypted)

### FR-NOTIF-01: Get Notifications (REST)
- Paginated, newest first, decrypted
- Types: `message`, `opportunity_match`, `pickup_match`

### FR-NOTIF-02: Mark Notification Read (REST)
- Ownership-scoped (can only mark own notifications)

---

## 9. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Security | All messages and notifications stored AES-256-GCM encrypted in MongoDB |
| NFR-02 | Security | JWT tokens expire in 7 days; validated on every request |
| NFR-03 | Security | Passwords bcrypt-hashed (cost factor 10) |
| NFR-04 | Security | OTPs bcrypt-hashed in database; expire in 10 minutes via MongoDB TTL index |
| NFR-05 | Security | iv/authTag never returned to frontend |
| NFR-06 | Security | Helmet.js HTTP security headers on all responses |
| NFR-07 | Security | CORS restricted to `CLIENT_URL` |
| NFR-08 | Rate Limiting | Login: express-rate-limit; OTP endpoints: express-rate-limit |
| NFR-09 | Rate Limiting | Socket message:send: 20 messages per 10 seconds per user |
| NFR-10 | Availability | Backend starts only if `CHAT_ENCRYPTION_KEY` is valid (fail-fast) |
| NFR-11 | Concurrency | Pickup claim, cancel, delete operations are atomic (findOneAndUpdate with state filter) |
| NFR-12 | Data Integrity | One-application-per-volunteer-per-opportunity enforced at DB layer (unique compound index) |
| NFR-13 | Performance | MongoDB indexes on all frequently queried fields |
| NFR-14 | Reliability | Matching/notification failures never fail the parent operation (fire-and-forget) |
| NFR-15 | Scalability | Socket.IO uses user-scoped rooms for O(1) targeted delivery |
| NFR-16 | API | Consistent JSON response format: `{success, message, data}` |
| NFR-17 | Body Size | Express body parser limited to 2MB |

---

## 10. User Stories

### Authentication

| ID | Role | Story | Priority |
|---|---|---|---|
| US-001 | Any User | As a new user, I want to register with my name, email, and password so I can create an account | P0 |
| US-002 | Any User | As a new user, I want to verify my email with an OTP so my account is activated | P0 |
| US-003 | Any User | As a registered user, I want to log in with my username or email | P0 |
| US-004 | Any User | As a logged-in user, I want to log out and clear my session | P0 |
| US-005 | Any User | As a user who forgot their password, I want to reset it via email OTP | P1 |
| US-006 | Logged-in | As a logged-in user, I want to change my password using an OTP for security | P1 |

### Profile

| ID | Role | Story | Priority |
|---|---|---|---|
| US-010 | Any | As a user, I want to view my profile information | P0 |
| US-011 | Volunteer | As a volunteer, I want to set my skills and home city so I get matched with relevant opportunities | P0 |
| US-012 | NGO | As an NGO, I want to set my accepted waste types and city so I receive relevant pickup notifications | P0 |

### Opportunities

| ID | Role | Story | Priority |
|---|---|---|---|
| US-020 | NGO | As an NGO, I want to post a volunteer opportunity with required skills and location | P0 |
| US-021 | Volunteer | As a volunteer, I want to browse all open opportunities | P0 |
| US-022 | Volunteer | As a volunteer, I want to search opportunities by keyword | P1 |
| US-023 | Volunteer | As a volunteer, I want to filter opportunities by status, skill, and location | P1 |
| US-024 | Volunteer | As a volunteer, I want to see opportunities that best match my profile (ranked suggestions) | P1 |
| US-025 | Volunteer | As a volunteer, I want to receive a notification when a new matching opportunity is posted | P1 |
| US-026 | NGO | As an NGO, I want to edit or delete opportunities I own | P0 |
| US-027 | NGO | As an NGO, I want to view all my posted opportunities in one place | P0 |

### Applications

| ID | Role | Story | Priority |
|---|---|---|---|
| US-030 | Volunteer | As a volunteer, I want to apply for an open opportunity with one click | P0 |
| US-031 | Volunteer | As a volunteer, I want to see all my applications and their current status | P0 |
| US-032 | Volunteer | As a volunteer, I want to withdraw a pending application | P1 |
| US-033 | NGO | As an NGO, I want to see all applications for my opportunities | P0 |
| US-034 | NGO | As an NGO, I want to accept or reject individual applications | P0 |

### Pickups

| ID | Role | Story | Priority |
|---|---|---|---|
| US-040 | Volunteer | As a volunteer, I want to schedule a waste pickup by specifying address, date, time, and waste types | P0 |
| US-041 | Volunteer | As a volunteer, I want to see all my pickup requests and their status | P0 |
| US-042 | Volunteer | As a volunteer, I want to edit a pending pickup request | P1 |
| US-043 | Volunteer | As a volunteer, I want to cancel or delete a pending pickup | P1 |
| US-044 | NGO | As an NGO, I want to see pickup requests in my city that match my waste types | P0 |
| US-045 | NGO | As an NGO, I want to claim (assign myself to) a pickup | P0 |
| US-046 | NGO | As an NGO, I want to mark a claimed pickup as completed | P0 |
| US-047 | NGO | As an NGO, I want to see all pickups currently assigned to me | P0 |

### Messaging

| ID | Role | Story | Priority |
|---|---|---|---|
| US-050 | Volunteer/NGO | As a user, I want to send real-time messages to the other party | P0 |
| US-051 | Volunteer/NGO | As a user, I want to see when the other party is typing | P1 |
| US-052 | Volunteer/NGO | As a sender, I want to see when my message has been read | P1 |
| US-053 | Volunteer/NGO | As a user, I want to view my full conversation history | P0 |
| US-054 | Volunteer/NGO | As a user, I want to see a list of all my conversations | P0 |

### Notifications

| ID | Role | Story | Priority |
|---|---|---|---|
| US-060 | Any | As a user, I want to see real-time notifications when events happen | P0 |
| US-061 | Any | As a user, I want to view my notification history | P0 |
| US-062 | Any | As a user, I want to mark a notification as read | P1 |
| US-063 | Volunteer | As a volunteer, I want to be notified when an opportunity matches my profile | P1 |
| US-064 | NGO | As an NGO, I want to be notified when a pickup matches my coverage | P1 |

---

## 11. Complete User Journey

### Journey 1 — Volunteer Registers and Finds an Opportunity

```
1. Volunteer visits /register
2. Fills in: name, username, email, password, role=volunteer
3. Backend creates OTP doc (NOT user yet); sends email
4. Volunteer is redirected to /verify-otp
5. Enters 6-digit OTP from email
6. User document created in MongoDB; OTP deleted
7. Volunteer logs in at /login (email or username + password)
8. Backend returns JWT + user object
9. Frontend stores token + user in localStorage
10. Volunteer redirected to /dashboard
11. Volunteer goes to /profile to set skills + city
12. Profile completeness check passes → saved
13. Volunteer visits /opportunities → sees all open opportunities
14. Volunteer visits "Match Suggestions" → sees personalized ranked list
15. Volunteer clicks "Apply" on an opportunity
16. Status: "pending" in their applications list
17. NGO logs in, sees new application under their opportunity
18. NGO accepts the application
19. Volunteer's application shows "accepted"
```

### Journey 2 — Volunteer Creates a Pickup Request

```
1. Volunteer (logged in, profile complete) visits Pickups section
2. Fills pickup form: city, area, date, time slot, waste types, notes
3. Backend creates pickup (status: Pending)
4. Backend fires-and-forgets: finds eligible NGOs, sends encrypted notification
5. Volunteer sees pickup in "My Pickups" with status Pending
6. NGO logs in, sees notification ("New pickup in your city")
7. NGO visits "Available Pickups" feed — sees matching Pending pickups
8. NGO clicks "Claim" → PATCH /api/pickups/:id/status {status: "Assigned"}
9. Atomic DB write succeeds (only one NGO can win if two try simultaneously)
10. Volunteer sees pickup status updated to "Assigned" with NGO's name
11. NGO completes the pickup → status: "Completed", completedAt set
12. Volunteer sees "Completed" in their pickup history
```

### Journey 3 — Real-Time Chat

```
1. Volunteer and NGO are both logged in with active Socket.IO connections
2. Each socket authenticated with JWT at handshake
3. Each socket joins their personal room: user:{userId}
4. Volunteer types a message → "message:typing" event fires → NGO sees typing indicator
5. Volunteer sends message → "message:send" event
6. Server: validates payload, checks rate limit, encrypts content, saves to MongoDB
7. Server: emits decrypted "message:new" to NGO's room
8. NGO's UI displays message instantly
9. Server: creates encrypted notification, emits "notification:new" (plaintext) to NGO's room
10. NGO clicks the conversation → "message:read" event fires
11. Server marks all receiver's messages as read, sets readAt
12. Server broadcasts "message:read" event to Volunteer's room
13. Volunteer sees read receipt
```

---

## 12. Complete Screen Flow

### Authentication Flow
```
/login ──── (success) ──→ /dashboard
         └─ (no account) → /register ──→ /verify-otp ──→ /login
         └─ (forgot) ────→ /forgot-password ──→ /reset-password ──→ /login
```

### Authenticated Flow (protected by authGuard + Layout shell)
```
/dashboard
├── /profile              (view + edit own profile)
├── /change-password      (two-step OTP change)
├── /opportunities
│   ├── /opportunities            (browse all)
│   ├── /opportunities/create     (NGO only)
│   ├── /opportunities/:id        (view details + apply)
│   └── /opportunities/:id/edit   (NGO owner only)
├── /applications
│   ├── /applications             (my-applications for volunteer)
│   └── /applications/:id         (detail view)
│
│ ── Milestone 3 (FRONTEND NOT YET BUILT) ──
├── /pickups                      (NOT IMPLEMENTED in frontend)
├── /matches                      (NOT IMPLEMENTED in frontend)
├── /messages                     (NOT IMPLEMENTED in frontend)
└── /notifications                (NOT IMPLEMENTED in frontend)
```

---

## 13. Navigation Flow

### Implemented Navigation (Milestone 1 + 2 Frontend)

The `Layout` component provides the shell (navbar + sidebar/menu) for all authenticated routes. The Angular `authGuard` redirects unauthenticated users to `/login`.

```
AppComponent
└── RouterOutlet
    ├── Login (public)
    ├── Register (public)
    ├── VerifyOtp (public)
    ├── ForgotPassword (public)
    ├── ResetPassword (public)
    └── Layout (protected, canActivate: [authGuard])
        ├── Dashboard
        ├── Profile
        ├── ChangePassword
        ├── Opportunities (child routes from opportunityRoutes)
        └── Applications (child routes from applicationRoutes)
```

### Milestone 3 Navigation (NOT YET BUILT)

Milestone 3 frontend routes need to be added to `app.routes.ts` inside the Layout children:

```
└── Layout (protected)
    ├── ... (existing M1/M2 routes)
    ├── pickups        (new)
    ├── matches        (new)
    ├── messages       (new)
    └── notifications  (new)
```

---

## 14. Feature List

| Feature | Status | Role |
|---|---|---|
| User Registration (OTP-gated) | ✅ Complete | All |
| Email OTP Verification | ✅ Complete | All |
| Login (JWT) | ✅ Complete | All |
| Forgot Password | ✅ Complete | All |
| Reset Password (OTP) | ✅ Complete | All |
| Change Password (OTP, authenticated) | ✅ Complete | All |
| View Profile | ✅ Complete | All |
| Update Profile | ✅ Complete | All |
| Create Opportunity | ✅ Complete | NGO/Admin |
| List All Opportunities (paginated) | ✅ Complete | All |
| Get Opportunity by ID | ✅ Complete | All |
| Search Opportunities | ✅ Complete | All |
| Filter Opportunities | ✅ Complete | All |
| My Opportunities | ✅ Complete | NGO/Admin |
| Edit Opportunity | ✅ Complete | NGO/Admin |
| Delete Opportunity | ✅ Complete | NGO/Admin |
| Cloudinary Image Upload | ✅ Complete | NGO/Admin |
| Apply for Opportunity | ✅ Complete | Volunteer |
| My Applications | ✅ Complete | Volunteer |
| View All Applications | ✅ Complete | NGO/Admin |
| Accept/Reject Application | ✅ Complete | NGO/Admin |
| Withdraw Application | ✅ Complete | Volunteer |
| Create Pickup | ✅ Complete | Volunteer |
| My Pickups | ✅ Complete | Volunteer |
| Available Pickups (NGO feed) | ✅ Complete | NGO |
| Claim Pickup (Assigned) | ✅ Complete | NGO |
| Complete Pickup | ✅ Complete | NGO |
| Cancel Pickup (NGO, Assigned) | ✅ Complete | NGO |
| Cancel Pickup (Volunteer, Pending) | ✅ Complete | Volunteer |
| Edit Pickup | ✅ Complete | Volunteer |
| Delete Pickup | ✅ Complete | Volunteer |
| Assigned To Me | ✅ Complete | NGO |
| All Pickups (admin view) | ✅ Complete | Admin |
| Opportunity Match Suggestions | ✅ Complete | Volunteer |
| Auto-notify volunteers on opportunity create | ✅ Complete | System |
| Auto-notify NGOs on pickup create | ✅ Complete | System |
| Real-Time Messaging (Socket.IO) | ✅ Complete | Volunteer/NGO |
| Typing Indicator | ✅ Complete | Volunteer/NGO |
| Read Receipts | ✅ Complete | Volunteer/NGO |
| Message Encryption (AES-256-GCM) | ✅ Complete | System |
| Get Conversations (REST) | ✅ Complete | All |
| Get Message History (REST) | ✅ Complete | All |
| Get Notifications (REST) | ✅ Complete | All |
| Mark Notification Read | ✅ Complete | All |
| Notification Encryption | ✅ Complete | System |
| Atomic Pickup Operations | ✅ Complete | System |
| Socket Rate Limiting | ✅ Complete | System |
| **Milestone 3 Frontend** | ❌ Not Built | — |

---

## 15. Milestone-Wise Features

### Milestone 1 — Core Authentication & Profile

**Backend:** ✅ Complete  
**Frontend:** ✅ Complete

| Feature | Description |
|---|---|
| Registration | OTP-gated atomic user creation |
| Email Verification | 6-digit OTP, bcrypt-hashed, TTL 10 min |
| Login | JWT (7-day), accepts username or email |
| Forgot/Reset Password | Enumeration-safe, OTP-gated |
| Change Password | Authenticated, OTP-gated, same-password rejected |
| Get/Update Profile | Completeness enforcement |

### Milestone 2 — Opportunities & Applications & Pickups

**Backend:** ✅ Complete  
**Frontend:** ✅ Complete (Opportunities + Applications)  
**Frontend:** ❌ Not Built (Pickups)

| Feature | Description |
|---|---|
| Opportunity CRUD | NGO creates/edits/deletes; optional Cloudinary image |
| Opportunity Search | Full-text MongoDB text index |
| Opportunity Filter | By status, skill, location, sort order |
| Apply/Withdraw | Volunteer applies; unique constraint; withdraw pending only |
| Application Management | NGO accepts/rejects; terminal states |
| Pickup Creation | Volunteer creates; validation (date future, time HH:mm format) |
| Pickup Status Machine | Pending → Assigned → Completed/Cancelled |
| Atomic Race Guards | 409 on concurrent claim/delete |

### Milestone 3 — Matching, Messaging, Notifications

**Backend:** ✅ Complete  
**Frontend:** ❌ Not Built

| Feature | Description |
|---|---|
| Opportunity Match Suggestions | Ranked by skill + location score; profile completeness required |
| Auto-Volunteer Notification | On opportunity create, notifies matching volunteers |
| Auto-NGO Notification | On pickup create, notifies eligible NGOs |
| Real-Time Messaging | Socket.IO; Volunteer ↔ NGO only; AES-256-GCM |
| Typing Indicator | Fire-and-forget; no DB write |
| Read Receipts | Bulk mark conversation read; broadcasts to sender |
| Conversation List | WhatsApp-style, aggregated, decrypted last message |
| Message History | Oldest-first, decrypted |
| Notifications | In-app, encrypted storage, socket push (plaintext) |
| Mark Notification Read | Ownership-scoped |

---

## 16. Current Project Status

### Backend — ✅ Fully Implemented (All 3 Milestones)

All API endpoints, socket events, services, middleware, models, validations, and utilities are implemented and tested.

### Frontend — Milestone 1 + Milestone 2 Partially Implemented

| Component | Status |
|---|---|
| Register | ✅ Built |
| Verify OTP | ✅ Built |
| Login | ✅ Built |
| Forgot Password | ✅ Built |
| Reset Password | ✅ Built |
| Dashboard | ✅ Built |
| Profile View + Edit | ✅ Built |
| Change Password | ✅ Built |
| Opportunities List | ✅ Built |
| Create/Edit Opportunity | ✅ Built |
| Opportunity Detail | ✅ Built |
| Application Management | ✅ Built |
| **Pickups Module** | ❌ Not Built |
| **Match Suggestions** | ❌ Not Built |
| **Messaging Module** | ❌ Not Built |
| **Notification Center** | ❌ Not Built |

---

## 17. Pending Features

> All items marked **Not Implemented** below refer to **frontend only** — the backend is complete.

### High Priority (Milestone 3 Frontend)

1. **Messaging Module** — Conversation list, chat window, typing indicator, read receipts, Socket.IO integration
2. **Notification Center** — Notification badge with unread count, notification list, mark-as-read, real-time socket push
3. **Pickup Module** — Volunteer pickup creation form, my pickups list, status tracking; NGO available pickups feed, claim action, assigned pickups list

### Medium Priority

4. **Match Suggestions Page** — Volunteer-facing ranked opportunity list from `/api/matches/suggestions`
5. **Admin Pickup View** — Admin-only view of all pickups

### Low Priority / Future

6. **Pagination controls** in pickup and notification lists
7. **Image upload** UI in opportunity create/edit
8. **Offline message queue** — messages queued when socket disconnected
9. **Unread message count** per conversation in sidebar
10. **Search conversations** by user name

---

## 18. Assumptions

1. The Angular frontend is a standalone SPA connecting to the Express backend at `http://localhost:5001`
2. All emails are sent via SMTP (Gmail with App Password supported); email delivery is not guaranteed for local development without real SMTP credentials
3. Cloudinary credentials must be valid for image upload; image upload is optional for opportunities
4. `CHAT_ENCRYPTION_KEY` is a mandatory environment variable; server will not start without a valid 64-character hex key
5. Only one admin account can exist in the system
6. Pickup matching uses case-insensitive city string comparison (not geo-coordinates)
7. The Socket.IO rate limiter uses in-memory storage; resets on server restart
8. OTP documents have a 10-minute TTL enforced by a MongoDB TTL index
9. JWT tokens are stored in `localStorage` (not HttpOnly cookies); appropriate for development
10. The Frontend uses Angular 21 with standalone components and signals for state management

---

## 19. Acceptance Criteria

### Authentication
- [x] Volunteer/NGO/Admin can register with valid data → receives OTP email
- [x] User cannot log in before verifying OTP
- [x] OTP expires after 10 minutes
- [x] Wrong OTP returns 400
- [x] Login with verified user returns JWT
- [x] Expired JWT returns 401
- [x] Deleted user's token returns 401

### Profile
- [x] Profile save blocked if missing required fields (city, state, skills/wasteTypes)
- [x] Skills limited to 10 per user
- [x] wasteTypes only saveable by NGO role

### Opportunities
- [x] Only NGO/Admin can create opportunities
- [x] Volunteer cannot create (403)
- [x] Opportunity matching notifications fire on creation
- [x] NGO can only edit/delete own opportunities

### Applications
- [x] Volunteer cannot apply to closed opportunity
- [x] Duplicate application returns 409
- [x] NGO can accept/reject only for own opportunities
- [x] Once accepted/rejected, status cannot change again

### Pickups
- [x] Volunteer cannot create with past date (400)
- [x] Invalid time format rejected (400)
- [x] End time must be after start time (400)
- [x] NGO can only claim pickups in their city with matching waste types
- [x] Concurrent claim: exactly one NGO wins, other gets 409
- [x] Completed/Cancelled pickups cannot transition further
- [x] Volunteer cannot delete/cancel non-Pending pickup

### Messaging
- [x] Volunteer cannot message another volunteer
- [x] NGO cannot message another NGO
- [x] Messages content stored as AES-256-GCM ciphertext (not plaintext) in MongoDB
- [x] iv and authTag never returned to frontend
- [x] Rate limit: 21st message in 10s returns error
- [x] Socket connection without valid JWT rejected

### Notifications
- [x] Opportunity creation triggers matching volunteer notifications
- [x] Pickup creation triggers matching NGO notifications
- [x] New message triggers notification for recipient
- [x] Socket push notification contains plaintext (not ciphertext)
- [x] REST notification API returns decrypted message
- [x] Mark-as-read scoped to owner (cannot mark another user's notification)
