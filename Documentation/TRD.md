# Technical Requirements Document (TRD)
# WasteZero — Full-Stack Application

**Version:** 3.0  
**Last Updated:** 2026-07-31  
**Status:** Milestone 3 Backend Complete | Milestone 3 Frontend Not Built  

---

## Table of Contents

1. [Technology Stack](#1-technology-stack)
2. [System Architecture](#2-system-architecture)
3. [Project Structure](#3-project-structure)
4. [Database Schema](#4-database-schema)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Middleware Stack](#6-middleware-stack)
7. [API Architecture](#7-api-architecture)
8. [Real-Time Architecture (Socket.IO)](#8-real-time-architecture-socketio)
9. [Encryption Architecture](#9-encryption-architecture)
10. [Matching Algorithm](#10-matching-algorithm)
11. [Atomic Operations](#11-atomic-operations)
12. [Frontend Architecture](#12-frontend-architecture)
13. [Environment Variables](#13-environment-variables)
14. [Deployment Considerations](#14-deployment-considerations)
15. [Known Constraints and Design Decisions](#15-known-constraints-and-design-decisions)

---

## 1. Technology Stack

### Backend

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Runtime | Node.js | ≥18.x | Server runtime |
| Framework | Express.js | ^4.x | HTTP server / routing |
| Database | MongoDB | Atlas (cloud) or local | Primary data store |
| ODM | Mongoose | ^8.x | Schema definitions, queries, indexes |
| WebSocket | Socket.IO | ^4.x | Real-time messaging and notifications |
| Authentication | jsonwebtoken | ^9.x | JWT signing and verification |
| Password hashing | bcryptjs | ^2.x | Password and OTP hashing |
| Email | nodemailer | ^6.x | SMTP email delivery (OTP emails) |
| Image storage | cloudinary | ^1.x | Opportunity image upload and lifecycle |
| File upload | multer | ^1.x | Multipart form data parsing |
| Security | helmet | ^7.x | HTTP security headers |
| CORS | cors | ^2.x | Cross-origin resource sharing |
| Rate limiting | express-rate-limit | ^7.x | HTTP request throttling |
| Rate limiting | rate-limiter-flexible | ^5.x | Socket.IO message throttling |
| Validation | express-validator | ^7.x | Request body/param validation |
| Encryption | Node.js `crypto` (built-in) | N/A | AES-256-GCM for messages/notifications |

### Frontend

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Framework | Angular | ^21.2.x | SPA framework |
| UI Components | Angular Material | ^21.2.x | Material Design component library |
| CSS Framework | Bootstrap | ^5.3.x | Layout and utility classes |
| State | Angular Signals | (built-in) | Reactive state management |
| HTTP | Angular HttpClient | (built-in) | REST API communication |
| Forms | Angular Reactive Forms | (built-in) | Form handling and validation |
| Language | TypeScript | ~5.9.x | Typed JavaScript |
| Build | Angular CLI / @angular/build | ^21.x | Build tooling |

---

## 2. System Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Browser (Angular 21 SPA)           │
│  ┌─────────────┐   ┌────────────────────────────┐   │
│  │  HTTP/REST  │   │    Socket.IO Client         │   │
│  │  (Angular   │   │    (ws:// or wss://)        │   │
│  │  HttpClient)│   │                            │   │
│  └──────┬──────┘   └──────────────┬─────────────┘   │
└─────────┼────────────────────────┼─────────────────-─┘
          │ HTTP                   │ WS
          ▼                        ▼
┌─────────────────────────────────────────────────────┐
│              Node.js HTTP Server                    │
│  ┌───────────────────────────────────────────────┐  │
│  │                  Express.js                   │  │
│  │  Helmet → CORS → BodyParser → Routes          │  │
│  │  protect middleware (JWT verify + DB lookup)  │  │
│  │  authorize middleware (role check)            │  │
│  │  validate middleware (express-validator)       │  │
│  │  Controllers → Services → Models → MongoDB    │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │              Socket.IO Server                 │  │
│  │  socketAuthMiddleware (JWT verify + DB lookup)│  │
│  │  registerMessageEvents                        │  │
│  │  registerNotificationEvents                   │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────┐
│               MongoDB Atlas (or local)              │
│  Collections: users, otps, opportunities,           │
│               applications, pickups,               │
│               messages, notifications               │
└────────────────────────────────────────────────────┘
          │
          ▼ (Cloudinary CDN)
┌─────────────────────────────────────────────────────┐
│                   Cloudinary                         │
│  Opportunity image upload, CDN URL delivery,        │
│  lifecycle management (delete on opportunity delete)│
└─────────────────────────────────────────────────────┘
```

---

## 3. Project Structure

### Backend (`/Backend`)

```
Backend/
├── server.js                    # Express app entry point; HTTP server; Socket.IO init
├── .env                         # Local environment variables (not in git)
├── .env.example                 # Environment variable template
│
├── config/
│   ├── db.js                    # MongoDB connection via Mongoose
│   ├── corsOrigin.js            # Resolves CLIENT_URL with fallback defaults
│   └── cloudinary.js            # Cloudinary SDK configuration
│
├── controllers/
│   ├── auth.controllers.js      # Register, verify-OTP, login, forgot/reset/change-password
│   ├── users.controllers.js     # Profile get/update, change-password
│   ├── opportunity.controllers.js  # Opportunity CRUD, search, filter, my-opportunities
│   ├── application.controllers.js  # Apply, get, update status, withdraw
│   ├── pickup.controllers.js    # Full pickup lifecycle (create, read, update, delete, status)
│   ├── match.controller.js      # Opportunity match suggestions for volunteer
│   ├── message.controller.js    # REST: conversations list, message history
│   └── notification.controller.js  # REST: list notifications, mark read
│
├── models/
│   ├── users.model.js           # User schema (name, email, password, role, skills, locations, wasteTypes)
│   ├── otp.model.js             # OTP schema (email, otp, purpose, payload, TTL)
│   ├── opportunity.model.js     # Opportunity schema (ngo_id, title, required_skills, location, image, status)
│   ├── application.model.js     # Application schema (opportunity_id, volunteer_id, status)
│   ├── pickup.model.js          # Pickup schema (user_id, agent_id, address, wasteTypes, status, STATUSES enum)
│   ├── message.model.js         # Message schema (sender_id, receiver_id, conversation_id, content[encrypted], iv, authTag)
│   └── notification.model.js    # Notification schema (user_id, type, message[encrypted], iv, authTag, reference_id, isRead)
│
├── routes/
│   ├── auth.routes.js           # /api/auth
│   ├── users.routes.js          # /api/users
│   ├── opportunity.routes.js    # /api/opportunities
│   ├── application.routes.js    # /api/applications
│   ├── pickup.routes.js         # /api/pickups
│   ├── match.routes.js          # /api/matches
│   ├── message.routes.js        # /api/messages
│   └── notification.routes.js   # /api/notifications
│
├── middlewares/
│   ├── auth.middleware.js        # protect (JWT verify), authorize (role check)
│   ├── role.middleware.js        # Resource-level ownership guards + getOwnedOpportunityIds
│   ├── upload.middleware.js      # Multer + Cloudinary upload pipeline
│   ├── error.middleware.js       # Global Express error handler
│   └── rateLimiter.middleware.js # HTTP rate limiters (loginLimiter, otpLimiter)
│
├── services/
│   ├── application.service.js   # apply(), getApplications(), updateStatus(), withdraw()
│   ├── opportunity.service.js   # CRUD + search + filter for opportunities
│   ├── pickup.service.js        # Full pickup service (create, read, transition, atomic ops, isNgoEligibleForPickup)
│   ├── matching.service.js      # Volunteer ↔ opportunity matching; NGO ↔ pickup matching; notification dispatch
│   ├── message.service.js       # createMessage, getConversationHistory, saveMessage, listConversationsForUser
│   └── notification.service.js  # dispatch, listForUser, markRead; wrappers: createNotification, getNotificationsForUser, markNotificationRead
│
├── sockets/
│   ├── index.js                 # Socket.IO server init (initSocket, getIO)
│   ├── socket.middleware.js     # JWT auth at socket handshake
│   ├── rooms.js                 # getUserRoom(id), buildConversationId(id1, id2)
│   ├── rateLimiter.js           # Socket-level rate limiter (20 msgs/10s per user)
│   └── events/
│       ├── message.events.js    # message:send, message:read, message:typing
│       └── notification.events.js  # (placeholder; server-push only)
│
├── utils/
│   ├── apiResponse.js           # sendSuccess(res, data, message, status), sendError(res, message, status, detail)
│   ├── queryBuilder.js          # Extracts pagination (skip, limit, page) and sort from req.query
│   ├── sendEmail.js             # Nodemailer transporter + verifySmtpConnection()
│   ├── generateOtp.js           # Generates 6-digit OTP string
│   ├── issueOtp.js              # Hash + upsert into Otp collection; send email
│   ├── verifyOtp.js             # Lookup, expiry check, attempt count, bcrypt verify, delete on success
│   ├── crypto.js                # encrypt(text) / decrypt(ciphertext, iv, authTag) — AES-256-GCM
│   └── profileCompleteness.js   # checkProfileCompleteness(user) → {complete, missing[]}
│
└── validations/
    ├── auth.validation.js       # registerValidation, loginValidation, etc.
    ├── opportunity.validation.js
    ├── application.validation.js
    ├── pickup.validation.js
    ├── message.validation.js
    └── notification.validation.js
```

### Frontend (`/Frontend`)

```
Frontend/
├── angular.json                 # Angular CLI project configuration
├── package.json                 # Dependencies
├── tsconfig.json                # TypeScript base config
│
└── src/
    ├── index.html               # HTML shell
    ├── main.ts                  # Angular bootstrap
    ├── styles.css               # Global CSS + Bootstrap imports
    ├── material-theme.scss      # Angular Material theme
    │
    ├── environments/
    │   └── environment.ts       # { production: false, apiUrl: 'http://localhost:5001/api' }
    │
    └── app/
        ├── app.ts               # AppComponent (root)
        ├── app.routes.ts        # Route definitions
        ├── app.config.ts        # App-level providers (HttpClient, Router)
        │
        ├── core/
        │   ├── guards/
        │   │   └── auth.guard.ts        # Redirects unauthenticated users to /login
        │   ├── models/
        │   │   ├── user.model.ts        # User, AuthResponse, ProfileResponse, ApiResponse interfaces
        │   │   ├── opportunity.model.ts  # Opportunity, OpportunityListResponse, Pagination interfaces
        │   │   └── application.model.ts  # Application, ApplicationResponse interfaces
        │   └── services/
        │       ├── auth.service.ts       # Login, register, OTP, password, JWT storage, currentUser signal
        │       ├── profile.service.ts    # Get/update user profile
        │       ├── opportunity.service.ts # Full opportunity CRUD + search + filter
        │       ├── application.service.ts # Apply, get applications, update status, withdraw
        │       └── opportunity-store.service.ts  # Shared signal store for opportunity list
        │
        └── features/
            ├── layout/          # Shell component: navbar, sidebar, router-outlet
            ├── auth/
            │   ├── login/
            │   ├── register/
            │   ├── verify-otp/
            │   ├── forgot-password/
            │   └── reset-password/
            ├── dashboard/
            ├── profile/
            ├── change-password/
            ├── opportunities/   # List, create, edit, detail + applicationRoutes
            └── applications/    # My applications, application detail
```

---

## 4. Database Schema

### Collection: `users`

| Field | Type | Description | Constraints |
|---|---|---|---|
| `_id` | ObjectId | MongoDB document ID | auto |
| `name` | String | Full name | required, trim |
| `username` | String | Unique login name | required, unique, lowercase, index |
| `email` | String | Email address | required, unique, lowercase, index |
| `password` | String | Bcrypt hash (cost=10) | required, `select: false` |
| `role` | String | `volunteer`, `ngo`, `admin` | enum, default: `volunteer` |
| `locations.primary.city` | String | Primary city | optional, trim |
| `locations.primary.state` | String | Primary state | optional, trim |
| `locations.secondary[]` | Array | Secondary locations | optional |
| `wasteTypes` | String[] | NGO accepted waste categories | default: [] |
| `skills` | String[] | Volunteer skills | default: [] |
| `bio` | String | User bio | default: '' |
| `isVerified` | Boolean | Email verified | default: false |
| `createdAt` | Date | Mongoose timestamp | auto |
| `updatedAt` | Date | Mongoose timestamp | auto |

**Indexes:**
- `username`: unique index
- `email`: unique index
- `role`: partial unique index where role='admin' (max one admin)

**Pre-save hook:** bcrypt-hashes `password` on modification (skipped if `$locals.skipHash = true`)  
**Instance method:** `matchPassword(enteredPassword)` → bcrypt.compare

---

### Collection: `otps`

| Field | Type | Description | Constraints |
|---|---|---|---|
| `_id` | ObjectId | MongoDB document ID | auto |
| `email` | String | User's email | required, lowercase, index |
| `otp` | String | Bcrypt-hashed OTP | required |
| `purpose` | String | `verify`, `forgot-password`, `change-password` | required, enum |
| `payload` | Mixed | Registration data (for `verify` purpose) | default: null |
| `createdAt` | Date | Manual creation timestamp | default: Date.now |
| `otpExpiresAt` | Date | 10-min OTP validity deadline | required |
| `attempts` | Number | Failed verification attempts | default: 0 |
| `expireAt` | Date | TTL index target (doc delete time) | required, TTL index |

**Indexes:**
- `email`: index for fast lookup
- `{email, purpose}`: compound unique index (one OTP per purpose per email)
- `expireAt`: TTL index (`expireAfterSeconds: 0`)

> **Note:** `verify` OTPs set `expireAt` further in the future than `otpExpiresAt` to allow `resendOtp()` to work after the first code expires (the payload must survive). All other purposes set `expireAt === otpExpiresAt`.

---

### Collection: `opportunities`

| Field | Type | Description | Constraints |
|---|---|---|---|
| `_id` | ObjectId | MongoDB document ID | auto |
| `ngo_id` | ObjectId → User | Owner NGO | required, index |
| `title` | String | Opportunity title | required, maxlength: 100, trim |
| `description` | String | Detailed description | required, trim |
| `required_skills` | String[] | Skills volunteers must have | required, min 1 item |
| `duration` | String | Activity duration | required, trim |
| `location` | String | Free-text location | required, trim |
| `date` | Date | Scheduled event date | optional, default: null |
| `image` | String | Cloudinary CDN secure URL | default: '' |
| `imagePublicId` | String | Cloudinary public_id for deletion | default: null |
| `status` | String | `open`, `in-progress`, `closed` | enum, default: `open` |
| `createdAt` | Date | Mongoose timestamp | auto |
| `updatedAt` | Date | Mongoose timestamp | auto |

**Indexes:**
- `{title, description}`: text index (full-text search)
- `{status, createdAt}`: compound (status filter + sort)
- `{date, createdAt}`: compound (upcoming events sort)

---

### Collection: `applications`

| Field | Type | Description | Constraints |
|---|---|---|---|
| `_id` | ObjectId | MongoDB document ID | auto |
| `opportunity_id` | ObjectId → Opportunity | Target opportunity | required, index |
| `volunteer_id` | ObjectId → User | Applying volunteer | required, index |
| `status` | String | `pending`, `accepted`, `rejected` | enum, default: `pending` |
| `createdAt` | Date | Mongoose timestamp | auto |
| `updatedAt` | Date | Mongoose timestamp | auto |

**Indexes:**
- `{opportunity_id, volunteer_id}`: compound unique index (one application per volunteer per opportunity)

---

### Collection: `pickups`

| Field | Type | Description | Constraints |
|---|---|---|---|
| `_id` | ObjectId | MongoDB document ID | auto |
| `user_id` | ObjectId → User | Volunteer owner | required, index |
| `agent_id` | ObjectId → User | Assigned NGO | default: null, index |
| `address.area` | String | Optional area/landmark | optional, trim |
| `address.city` | String | City for matching | required, trim |
| `scheduledDate` | Date | Requested pickup date | required |
| `preferredTimeSlot.start` | String | Start time (HH:mm) | required |
| `preferredTimeSlot.end` | String | End time (HH:mm) | required |
| `wasteTypes` | String[] | Types of waste | optional |
| `notes` | String | Additional notes | optional, maxlength: 500 |
| `status` | String | `Pending`, `Assigned`, `Completed`, `Cancelled` | enum, default: `Pending` |
| `completedAt` | Date | Completion timestamp | default: null |
| `createdAt` | Date | Mongoose timestamp | auto |
| `updatedAt` | Date | Mongoose timestamp | auto |

**Indexes:**
- `{user_id, createdAt}`: volunteer's history
- `{agent_id, status, scheduledDate}`: NGO assigned view
- `{status, 'address.city', scheduledDate}`: NGO discovery feed
- `{wasteTypes}`: multikey index for $in matching

**Instance methods:**
- `canTransitionTo(nextStatus)`: checks ALLOWED_TRANSITIONS
- `canNgoTransitionTo(nextStatus)`: checks NGO_ALLOWED_TRANSITIONS (excludes Pending → Cancelled)

**Status Machine:**
```
Pending → Assigned | Cancelled
Assigned → Completed | Cancelled
Completed → (terminal)
Cancelled → (terminal)
```

> **NGO restriction:** NGO can only cancel a pickup it has been assigned to (`Assigned → Cancelled`). An eligible-but-unassigned NGO cannot cancel a `Pending` pickup.

---

### Collection: `messages`

| Field | Type | Description | Constraints |
|---|---|---|---|
| `_id` | ObjectId | MongoDB document ID | auto |
| `sender_id` | ObjectId → User | Message sender | required |
| `receiver_id` | ObjectId → User | Message receiver | required |
| `conversation_id` | String | Deterministic: `sort([idA,idB]).join('_')` | required |
| `content` | String | **AES-256-GCM ciphertext** (hex-encoded) | required |
| `iv` | String | Initialization vector (hex) | required |
| `authTag` | String | GCM authentication tag (hex) | required |
| `status` | String | `sent`, `delivered`, `read` | enum, default: `sent` |
| `readAt` | Date | Timestamp when receiver marked read | optional |
| `createdAt` | Date | Mongoose timestamp | auto |
| `updatedAt` | Date | Mongoose timestamp | auto |

**Indexes:**
- `{conversation_id, createdAt}`: primary conversation query
- `{sender_id, createdAt}`: sender queries
- `{receiver_id, createdAt}`: receiver queries

> **Security:** `content` is never stored as plaintext. `iv` and `authTag` are never returned to frontend clients.

---

### Collection: `notifications`

| Field | Type | Description | Constraints |
|---|---|---|---|
| `_id` | ObjectId | MongoDB document ID | auto |
| `user_id` | ObjectId → User | Notification recipient | required |
| `type` | String | `message`, `opportunity_match`, `pickup_match` | required, enum |
| `message` | String | **AES-256-GCM ciphertext** (hex-encoded) | required |
| `iv` | String | Initialization vector (hex) | required |
| `authTag` | String | GCM authentication tag (hex) | required |
| `reference_id` | Mixed | ObjectId or String conversation_id | default: null |
| `isRead` | Boolean | Read status | default: false |
| `createdAt` | Date | Mongoose timestamp | auto |
| `updatedAt` | Date | Mongoose timestamp | auto |

**Indexes:**
- `{user_id, isRead, createdAt}`: unread count + sorted feed

> **Note:** `reference_id` is `Mixed` (not `ObjectId`) because `message` type notifications use deterministic string conversation IDs (e.g. `abc_def`) which cannot be cast to ObjectId.

---

## 5. Authentication & Authorization

### JWT Flow

1. Login → `jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' })`
2. Client stores token in `localStorage` under key `'token'`
3. Client sends `Authorization: Bearer <token>` on every protected request
4. `protect` middleware: `jwt.verify(token, JWT_SECRET)` → `User.findById(decoded.id).select('-password').lean()`
5. `req.user = { ...user, id: user._id.toString() }`

### Role Guards

```
protect → authorize('volunteer') → controller
protect → authorize('ngo') → controller
protect → authorize('volunteer', 'ngo', 'admin') → controller
```

### Resource-Level Guards (role.middleware.js)

| Middleware | Purpose |
|---|---|
| `checkApplicationOwnershipByNGO` | NGO can only accept/reject applications for their own opportunities |
| `checkApplicationOwnershipByVolunteer` | Volunteer can only withdraw their own applications |
| `checkApplicationViewAccess` | Volunteer: own; NGO: for their opportunities; Admin: any |
| `checkOpportunityOwnership` | NGO can only edit/delete own opportunities |
| `checkPickupOwnershipByVolunteer` | Volunteer can only edit/cancel their own pickups |
| `checkPickupDeleteAccess` | Volunteer can only delete their own pickups |
| `checkPickupViewAccess` | Volunteer: own; NGO: own + assigned; Admin: any |
| `checkPickupNgoMatch` | NGO must be city+wasteType eligible (Pending) or assigned agent (Assigned/Completed/Cancelled) |
| `getOwnedOpportunityIds` | Helper: returns all opportunity IDs owned by an NGO |

---

## 6. Middleware Stack

### HTTP Request Pipeline (per request)

```
Request
  → Helmet (security headers)
  → CORS (origin check)
  → BodyParser JSON/URLEncoded (2MB limit)
  → Route-level rate limiter (if applicable)
  → protect (JWT verify + DB user lookup)
  → authorize (role check)
  → Resource-level guard (ownership/access check)
  → express-validator (body/param validation)
  → validate (check validation errors, return 422 if any)
  → Controller
  → Service
  → Model → MongoDB
  → apiResponse.sendSuccess/sendError
Response
```

### Rate Limiters

| Limiter | Route | Limit |
|---|---|---|
| `loginLimiter` | `POST /api/auth/login` | 10 per 15 min per IP |
| `otpLimiter` | `POST /api/auth/resend-otp`, `POST /api/auth/forgot-password` | 5 per 10 min per IP |
| `messageLimiter` | Socket `message:send` event | 20 per 10 seconds per user ID |

---

## 7. API Architecture

### Response Format

All REST endpoints return the following JSON envelope:

```json
{
  "success": true | false,
  "message": "Human-readable status message",
  "data": { ... }
}
```

Error responses additionally include a `detail` field when available.

### HTTP Status Codes Used

| Code | Usage |
|---|---|
| 200 | Success (GET, PUT, PATCH) |
| 201 | Resource created (POST) |
| 400 | Validation error / business rule violation |
| 401 | Missing or invalid token |
| 403 | Insufficient permissions / role |
| 404 | Resource not found |
| 409 | Conflict (duplicate / race condition) |
| 422 | express-validator validation failure |
| 500 | Internal server error |

### Route Prefix: `/api`

| Prefix | Router File | Description |
|---|---|---|
| `/api/auth` | auth.routes.js | Registration, verification, login, password flows |
| `/api/users` | users.routes.js | Profile, change password |
| `/api/opportunities` | opportunity.routes.js | Opportunity CRUD, search, filter |
| `/api/applications` | application.routes.js | Apply, manage, withdraw |
| `/api/pickups` | pickup.routes.js | Full pickup lifecycle |
| `/api/matches` | match.routes.js | Opportunity match suggestions |
| `/api/messages` | message.routes.js | Conversation list + message history |
| `/api/notifications` | notification.routes.js | Notifications list + mark read |

---

## 8. Real-Time Architecture (Socket.IO)

### Connection

```
Client → ws://localhost:5001
  → socket.handshake.auth.token OR socket.handshake.query.token
  → socketAuthMiddleware: jwt.verify → User.findById → socket.user = {...user, id}
  → socket.join(`user:${userId}`)
  → registerMessageEvents(io, socket)
  → registerNotificationEvents(io, socket)
```

### Room Strategy

Every connected user joins exactly one personal room: `user:{userId}`

This means:
- A user with 3 browser tabs open has 3 sockets, all in the same room
- Any `io.to(getUserRoom(userId)).emit(...)` call delivers to all their active sessions
- No manual socket-id-to-user-id bookkeeping anywhere

### Conversation IDs

```javascript
buildConversationId(id1, id2) = [id1, id2].sort().join('_')
```

Deterministic: `userA + userB` always produces the same ID as `userB + userA`. Used as the MongoDB `conversation_id` field and for the `message:read` participant verification.

### Events

#### Client → Server

| Event | Payload | Description |
|---|---|---|
| `message:send` | `{ receiverId: string, content: string }` | Send a message; ack `{success, data}` or `{success: false, message}` |
| `message:read` | `{ conversationId: string }` | Mark conversation as read; ack `{success}` |
| `message:typing` | `{ receiverId: string }` | Signal typing indicator; fire-and-forget |

#### Server → Client

| Event | Payload | Description |
|---|---|---|
| `message:new` | Full message object (plaintext content) | New message from another user |
| `message:read` | `{ conversationId, readerId }` | Other participant marked messages read |
| `message:typing` | `{ senderId }` | The other user is typing |
| `notification:new` | Full notification object (plaintext message) | New notification (match, message, pickup) |
| `error` | `{ event, message }` | Non-acked error for fire-and-forget events |

---

## 9. Encryption Architecture

### Algorithm

AES-256-GCM (Authenticated Encryption with Associated Data)

### Key

`CHAT_ENCRYPTION_KEY` environment variable — must be a **64-character hexadecimal string** (32 raw bytes).

Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Stored in `.env`; **never committed to version control**.

Server calls `getEncryptionKey()` at module load time — if the key is missing or wrong length, `process.exit(1)` is called immediately (fail-fast).

### Encrypt

```javascript
encrypt(text) → { encryptedData, iv, authTag }
```

- Generates a fresh random 12-byte IV per message
- All output values are hex-encoded strings suitable for MongoDB storage
- Input must be a non-empty string

### Decrypt

```javascript
decrypt(encryptedData, ivHex, authTagHex) → plaintext
```

- Reconstructs the 32-byte key from the env variable
- GCM authentication tag verification ensures ciphertext integrity
- Any decryption failure is caught by callers and replaced with `'[Message Decryption Failed]'`

### What Gets Encrypted

| Collection | Field | Encrypted? |
|---|---|---|
| messages | `content` | ✅ Yes |
| notifications | `message` | ✅ Yes |
| All others | N/A | ❌ No |

### What Callers Receive

- REST controllers: decrypted plaintext in response; `iv` and `authTag` stripped
- Socket events: original plaintext (server has it in-memory at dispatch time)
- MongoDB: only ciphertext + iv + authTag stored

---

## 10. Matching Algorithm

### Volunteer ↔ Opportunity Matching

**Trigger:** After `createOpportunity()` succeeds (fire-and-forget)  
**Pull endpoint:** `GET /api/matches/suggestions` (returns ranked list)

**Conditions (both required):**
1. At least one of the opportunity's `required_skills` matches the volunteer's `skills` (case-insensitive, trimmed)
2. The opportunity's free-text `location` field contains the volunteer's `city` or `state` as a whole-word match (case-insensitive regex)

**Ranking (pull endpoint only):**
```
matchScore = (number of matching skills) + (1 if location matches)
```

Sorted by `matchScore DESC`, ties broken by `createdAt DESC`. Capped at `limit` (default 10, max 50).

**Profile requirement:** Volunteer must have skills AND primary city set. Missing fields → 400 with `missingFields` list.

---

### NGO ↔ Pickup Matching

**Trigger:** After `createPickup()` succeeds (fire-and-forget)  
**Pull endpoint:** `GET /api/pickups/available` (NGO discovery feed)

**Conditions (both required):**
1. Pickup's `address.city` case-insensitively matches NGO's `locations.primary.city` or any secondary city
2. At least one of the pickup's `wasteTypes` matches the NGO's `wasteTypes` (case-insensitive, trimmed)

**Profile requirement:** NGO must have wasteTypes AND primary city set. Missing fields → 400 with `missingFields` list.

---

## 11. Atomic Operations

### Why Atomic

Multiple concurrent actors (different NGOs) can attempt to claim the same pickup simultaneously. A standard read-modify-write (findById → mutate → save) has a check-then-act gap that allows two NGOs to both pass the guard and both write, corrupting the pickup state.

### How

`findOneAndUpdate` with a filter that re-asserts the **expected current state** as part of the same operation:

```javascript
// Claim (Pending → Assigned)
Pickup.findOneAndUpdate(
  { _id: pickupId, status: 'Pending' },
  { status: 'Assigned', agent_id: ngoId },
  { new: true }
);

// Complete/Cancel (Assigned → ...)
Pickup.findOneAndUpdate(
  { _id: pickupId, status: 'Assigned', agent_id: ngoId },  // agent_id baked into filter
  { status: nextStatus },
  { new: true }
);

// Volunteer cancel
Pickup.findOneAndUpdate(
  { _id: pickupId, status: 'Pending', user_id: volunteerId },
  { status: 'Cancelled' },
  { new: true }
);

// Volunteer delete
Pickup.findOneAndDelete(
  { _id: pickupId, status: 'Pending', user_id: volunteerId }
);
```

**Return value:** If the filter doesn't match (someone else won the race), returns `null`. The controller then responds with HTTP 409.

---

## 12. Frontend Architecture

### State Management

Angular Signals (built-in, Angular 17+) used for all reactive state:

```typescript
// auth.service.ts
private currentUserSignal = signal<User | null>(this.getUserFromStorage());
readonly currentUser = this.currentUserSignal.asReadonly();
readonly isLoggedIn = computed(() => this.currentUserSignal() !== null);
```

No NgRx or third-party state management library used.

### Auth Guard

```typescript
// core/guards/auth.guard.ts
// Redirects to /login if not authenticated
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? true : inject(Router).createUrlTree(['/login']);
};
```

### HTTP Interceptor

No global HTTP interceptor is used. The `Authorization` header is attached manually per service call via `getAuthHeaders()` in `AuthService`:

```typescript
private getAuthHeaders(): HttpHeaders {
  return new HttpHeaders({ Authorization: `Bearer ${this.getToken()}` });
}
```

> **Note for M3 Frontend Developer:** For Milestone 3, it is strongly recommended to add an `HttpInterceptor` that automatically attaches the Authorization header to all requests, rather than passing headers manually to every service call.

### Component Pattern

All components are **standalone** (Angular 17+ standalone API). No NgModules used.

### Routing

Lazy loading is not currently configured. All routes are eagerly loaded. For M3, consider lazy-loading the messaging and notifications modules.

### Form Pattern

Reactive Forms (`FormBuilder`, `FormGroup`, `FormControl`, `Validators`) used consistently.

---

## 13. Environment Variables

### Backend (`.env`)

| Variable | Required | Description | Example |
|---|---|---|---|
| `PORT` | No | Express server port | `5001` |
| `NODE_ENV` | No | Environment mode | `development` |
| `MONGO_URI` | **Yes** | MongoDB connection string | `mongodb+srv://...` |
| `JWT_SECRET` | **Yes** | JWT signing secret (min 32 chars) | `your_jwt_secret` |
| `JWT_EXPIRES_IN` | No | JWT expiration | `7d` |
| `OTP_EXPIRY` | No | Documentation only (TTL enforced by MongoDB) | `600000` |
| `CLIENT_URL` | **Yes** | Angular frontend origin | `http://localhost:4200` |
| `SMTP_HOST` | **Yes** | SMTP server | `smtp.gmail.com` |
| `SMTP_PORT` | **Yes** | SMTP port | `587` |
| `SMTP_SECURE` | No | TLS | `false` |
| `EMAIL` | **Yes** | Sender email address | `yourapp@gmail.com` |
| `EMAIL_PASS` | **Yes** | SMTP password / App Password | `abcd efgh ijkl mnop` |
| `CLOUDINARY_CLOUD_NAME` | **Yes** | Cloudinary cloud name | `your_cloud` |
| `CLOUDINARY_API_KEY` | **Yes** | Cloudinary API key | `123456789` |
| `CLOUDINARY_API_SECRET` | **Yes** | Cloudinary API secret | `abc...` |
| `CHAT_ENCRYPTION_KEY` | **Yes** | 64-char hex AES-256-GCM key | `a1b2c3d4...` (64 chars) |

### Frontend (`environment.ts`)

| Variable | Value |
|---|---|
| `production` | `false` (dev) |
| `apiUrl` | `http://localhost:5001/api` |

---

## 14. Deployment Considerations

### Backend

- Run `npm install` in `/Backend`
- Copy `.env.example` to `.env` and fill all required values
- Generate `CHAT_ENCRYPTION_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Start: `node server.js` or `npm start`
- For production: use PM2 or similar; set `NODE_ENV=production`
- MongoDB Atlas: create cluster, allowlist IPs, use connection string with `?retryWrites=true&w=majority`
- Ensure MongoDB TTL indexes are built (they're defined in `otp.model.js` — auto-created on first connection)

### Frontend

- Run `npm install` in `/Frontend`
- Update `environment.ts` with production `apiUrl` if deploying remotely
- Build: `ng build --configuration production`
- Serve `dist/` via Nginx, Apache, or static hosting (Netlify, Vercel)
- Ensure CORS `CLIENT_URL` on backend matches the deployed frontend domain

---

## 15. Known Constraints and Design Decisions

| Decision | Rationale |
|---|---|
| OTP stored in separate `otps` collection | Decouples OTP lifecycle from user document; allows atomic registration (user only created on OTP success); supports resend without overwriting user fields |
| `req.user.id` is a string, not an ObjectId | `.lean()` returns `_id` as ObjectId; `id: user._id.toString()` added for compatibility with all controller lookups |
| AES-256-GCM with per-message random IV | Each message uses a fresh IV, so two identical plaintexts produce different ciphertexts — eliminates patterns |
| Pickup matching uses city string comparison, not geo-coordinates | Simpler to implement; appropriate for the current NGO profile structure (`locations.primary.city` is a plain string, not lat/lng) |
| `reference_id` in notifications is `Mixed`, not `ObjectId` | `message` type notifications use deterministic string conversation IDs, which cannot be cast to ObjectId |
| Only one admin account enforced by partial unique DB index | Race-safe; prevents the check-then-insert race that would allow two concurrent admin registrations |
| Socket rate limiter uses in-memory storage | No Redis dependency; acceptable for single-instance deployment; resets on restart |
| No global HTTP interceptor in Angular frontend | Manual header attachment per service call; M3 frontend dev should add an interceptor |
| `.lean()` on all read-only queries | Returns plain JS objects instead of Mongoose documents; eliminates overhead of getters/setters/methods |
| Cloudinary delete on opportunity delete | Prevents orphaned assets from accumulating in the CDN storage |
| `$locals.skipHash = true` for atomic registration | The atomic registration flow pre-hashes the password before storing in `otps.payload`, so the User `pre('save')` hook must not hash again |
