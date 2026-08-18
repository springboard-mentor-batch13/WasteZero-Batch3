# WasteZero M4 — Developer A API Documentation
## Platform Governance & Admin Controls

**Base URL:** `/api/v1/admin`  
**Authentication:** All endpoints require a valid Bearer JWT token.  
**Authorization:** All endpoints require `role: 'admin'` — enforced via `protect` → `requireAdmin` middleware chain.  
**Rate Limiting:** All endpoints are rate-limited by `adminLimiter` (5 requests/minute per IP).

---

## Admin RBAC

### Middleware Chain
```
protect → requireAdmin → adminLimiter → [validation] → controller
```

| Caller | Result |
|--------|--------|
| No token | `401 Unauthorized` |
| Expired token | `401 Unauthorized` |
| Volunteer | `403 Forbidden` |
| NGO | `403 Forbidden` |
| Suspended Admin | `403 Forbidden` (caught by `protect`) |
| Admin | `200` / continues |

### Security Invariants
- `admin_id`, `suspendedBy`, `removedBy`, `timestamp`, `ip_address`, `user_agent` are **never accepted from the client body** — all derived server-side.
- Audit logs are **append-only** — no PUT/PATCH/DELETE routes exist for `AdminLog`.
- Admin **cannot suspend, unsuspend, or change their own role**.
- The **last admin cannot be demoted** — system ensures ≥1 admin at all times.
- All ObjectId parameters are validated before any DB query.
- Search strings are regex-escaped to prevent ReDoS attacks.

---

## Endpoints

---

### 1. GET `/api/v1/admin/users`

**Purpose:** Paginated listing of platform users with search and filtering.  
**Auth:** Admin  

**Query Parameters:**

| Param | Type | Default | Constraints | Description |
|-------|------|---------|-------------|-------------|
| `page` | integer | `1` | min: 1 | Page number |
| `limit` | integer | `10` | min: 1, max: 100 | Items per page |
| `role` | string | — | `volunteer\|ngo\|admin` | Filter by role |
| `isSuspended` | string | — | `true\|false` | Filter by suspension status |
| `search` | string | — | max 100 chars | Search name, email, username |
| `sort` | string | `createdAt` | `createdAt\|updatedAt\|name\|email\|role` | Sort field |
| `order` | string | `desc` | `asc\|desc` | Sort direction |

**Response 200:**
```json
{
  "success": true,
  "message": "Users fetched successfully.",
  "results": 10,
  "pagination": { "total": 142, "page": 1, "limit": 10, "totalPages": 15 },
  "data": {
    "users": [
      {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
        "name": "Alice Johnson",
        "username": "alicej",
        "email": "alice@example.com",
        "role": "volunteer",
        "isSuspended": false,
        "suspensionReason": null,
        "createdAt": "2026-07-15T10:30:00.000Z"
      }
    ]
  }
}
```

**Security Notes:**
- `password` is NEVER returned (schema `select: false` + projection).
- Search uses regex-escaped strings to prevent ReDoS.
- Sort field is from a server-side whitelist — no arbitrary sort injection.

**Errors:** `400` (invalid query params), `401`, `403`, `429` (rate limited), `500`

---

### 2. GET `/api/v1/admin/users/:id`

**Purpose:** Get detailed profile of a single user.  
**Auth:** Admin  
**URL Param:** `:id` — MongoDB ObjectId

**Response 200:**
```json
{
  "success": true,
  "message": "User details fetched successfully.",
  "data": {
    "user": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "name": "Alice Johnson",
      "username": "alicej",
      "email": "alice@example.com",
      "role": "volunteer",
      "bio": "Environmental activist.",
      "skills": ["Sorting", "Loading"],
      "isSuspended": false,
      "suspensionReason": null,
      "suspendedAt": null,
      "suspendedBy": null,
      "isVerified": true,
      "createdAt": "2026-07-15T10:30:00.000Z"
    }
  }
}
```

**Security Notes:** `password` is excluded from projection.

**Errors:** `400` (invalid ObjectId), `401`, `403`, `404` (user not found), `429`, `500`

---

### 3. PATCH `/api/v1/admin/users/:id/suspend`

**Purpose:** Suspend or unsuspend a user account.  
**Auth:** Admin  
**URL Param:** `:id` — MongoDB ObjectId of the target user

**Request Body (Suspend):**
```json
{
  "suspend": true,
  "reason": "Violation of community standards regarding illegal dumping posts."
}
```

**Request Body (Unsuspend):**
```json
{
  "suspend": false
}
```

> [!IMPORTANT]
> `admin_id`, `suspendedBy`, `suspendedAt` must NOT be provided in the request body.
> These are always derived server-side and any client-provided values are rejected with 400.

**Behavior on SUSPEND:**
- Sets `isSuspended = true`
- Sets `suspensionReason = reason`
- Sets `suspendedAt = new Date()` (server time)
- Sets `suspendedBy = req.user.id` (server-derived, never from body)
- Emits `account:suspended` Socket.IO event to all of the user's active connections
- Force-disconnects all active socket sessions
- Creates `AdminLog` entry with `USER_SUSPENDED` action

**Behavior on UNSUSPEND:**
- Clears `isSuspended = false`
- Clears `suspensionReason = null`
- Clears `suspendedAt = null`
- Clears `suspendedBy = null`
- Creates `AdminLog` entry with `USER_UNSUSPENDED` action

**Response 200:**
```json
{
  "success": true,
  "message": "User account has been suspended successfully.",
  "data": {
    "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "isSuspended": true,
    "suspendedAt": "2026-08-10T14:20:00.000Z"
  }
}
```

**Self-Action Protection:** Admin cannot suspend/unsuspend their own account → `403`

**Errors:** `400` (missing/invalid reason, invalid ObjectId, forbidden client fields), `401`, `403` (self-action or non-admin), `404` (user not found), `429`, `500`

---

### 4. PATCH `/api/v1/admin/users/:id/role`

**Purpose:** Update a user's role.  
**Auth:** Admin  
**URL Param:** `:id` — MongoDB ObjectId of the target user

**Request Body:**
```json
{
  "role": "ngo"
}
```

**Allowed Values:** `volunteer`, `ngo`, `admin`

> [!IMPORTANT]
> `admin_id` must NOT be provided in the request body.

**Behavior:**
- Validates that the new role is in the enum
- **Self-role-change protection:** Admin cannot change their own role → `403`
- **Last-admin protection:** If the target is the only admin and the new role is not `admin` → `409`
- Captures before/after state
- Creates `AdminLog` entry with `USER_ROLE_CHANGED` action

**Response 200:**
```json
{
  "success": true,
  "message": "User role updated successfully.",
  "data": {
    "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "role": "ngo"
  }
}
```

**Errors:** `400` (invalid role), `401`, `403` (self-change or non-admin), `404` (not found), `409` (last-admin), `429`, `500`

---

### 5. DELETE `/api/v1/admin/opportunities/:id`

**Purpose:** Admin soft-delete (remove) an opportunity from public listings.  
**Auth:** Admin  
**URL Param:** `:id` — MongoDB ObjectId of the opportunity

**Request Body (optional):**
```json
{
  "reason": "Inappropriate content in opportunity description."
}
```

> [!CAUTION]
> This is a **soft-delete** — the Opportunity document is NOT physically removed.
> `removedBy`, `removedAt`, `isRemovedByAdmin` must NOT be provided in the request body.

**Behavior:**
- Sets `isRemovedByAdmin = true`
- Sets `removalReason = reason || null`
- Sets `removedAt = new Date()` (server time)
- Sets `removedBy = req.user.id` (server-derived)
- Opportunity is excluded from all public feeds immediately
- Applications for this opportunity are **preserved** (no cascade delete)
- Creates `AdminLog` entry with `OPPORTUNITY_REMOVED` action

**Response 200:**
```json
{
  "success": true,
  "message": "Opportunity removed by administrator.",
  "data": {
    "opportunityId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "isRemovedByAdmin": true,
    "removedAt": "2026-08-10T14:20:00.000Z"
  }
}
```

**Errors:** `400` (invalid ObjectId, forbidden body fields), `401`, `403`, `404` (not found), `429`, `500`

---

### 6. PATCH `/api/v1/admin/opportunities/:id/restore`

**Purpose:** Restore a previously admin-removed opportunity.  
**Auth:** Admin  
**URL Param:** `:id` — MongoDB ObjectId of the opportunity

**Request Body:** None required.

> [!IMPORTANT]
> `isRemovedByAdmin`, `removedBy` must NOT be provided in the body.

**Behavior:**
- Validates opportunity exists
- Returns `409` if `isRemovedByAdmin` is currently `false` (cannot restore what was not removed)
- Clears all 4 soft-delete fields atomically: `isRemovedByAdmin=false`, `removalReason=null`, `removedAt=null`, `removedBy=null`
- Opportunity is immediately visible in public feeds again
- Creates `AdminLog` entry with `OPPORTUNITY_RESTORED` action

**Response 200:**
```json
{
  "success": true,
  "message": "Opportunity restored successfully.",
  "data": {
    "opportunityId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "isRemovedByAdmin": false
  }
}
```

**Errors:** `400` (invalid ObjectId), `401`, `403`, `404` (not found), `409` (not removed), `429`, `500`

---

### 7. GET `/api/v1/admin/logs`

**Purpose:** Retrieve paginated, filtered admin audit log entries.  
**Auth:** Admin  

> [!IMPORTANT]
> **AdminLog is APPEND-ONLY.** There are no PUT, PATCH, or DELETE endpoints for audit logs.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Items per page (default: 20, max: 100) |
| `action` | string | Filter by action type (enum validated) |
| `target_type` | string | Filter by target entity type |
| `target_id` | ObjectId | Filter by specific target resource ID |
| `adminId` | ObjectId | Filter by the admin who performed the action |
| `startDate` | ISO 8601 | Filter logs from this date (inclusive) |
| `endDate` | ISO 8601 | Filter logs up to this date (inclusive, end of day) |

**Always sorted:** newest first (`timestamp: -1`) — not overrideable by client.

**Response 200:**
```json
{
  "success": true,
  "message": "Audit logs fetched successfully.",
  "results": 5,
  "pagination": { "total": 42, "page": 1, "limit": 20, "totalPages": 3 },
  "data": {
    "logs": [
      {
        "_id": "66b1c2d3e4f5a6b7c8d9e0f1",
        "admin_id": { "_id": "64f0001", "name": "System Admin", "email": "admin@example.com" },
        "action": "USER_SUSPENDED",
        "target_type": "User",
        "target_id": "64f1a2b3c4d5e6f7a8b9c0d1",
        "details": "Admin suspended user. Reason: Community standards violation",
        "changes": {
          "before": { "_id": "...", "isSuspended": false },
          "after":  { "_id": "...", "isSuspended": true }
        },
        "ip_address": "192.168.1.50",
        "user_agent": "Mozilla/5.0 ...",
        "timestamp": "2026-08-10T14:20:00.000Z"
      }
    ]
  }
}
```

**Errors:** `400` (invalid filter params), `401`, `403`, `429`, `500`

---

## Socket Integration

### `account:suspended` Event
When an admin suspends a user, the backend:
1. Completes the DB mutation first.
2. Emits `account:suspended` to the user's Socket.IO room (`user:<userId>`).
3. Force-disconnects all sockets in that room.

**Angular Client should listen:**
```typescript
this.socket.on('account:suspended', (data) => {
  // data.message = "Account suspended: <reason>"
  this.router.navigate(['/suspended']);
});
```

**Enforcement:** Socket disconnect is a UX enhancement. HTTP suspension is enforced independently by the `protect` middleware on every request.

---

## Audit Log Actions

| Action | Trigger |
|--------|---------|
| `USER_SUSPENDED` | PATCH `/users/:id/suspend` with `suspend: true` |
| `USER_UNSUSPENDED` | PATCH `/users/:id/suspend` with `suspend: false` |
| `USER_ROLE_CHANGED` | PATCH `/users/:id/role` |
| `OPPORTUNITY_REMOVED` | DELETE `/opportunities/:id` |
| `OPPORTUNITY_RESTORED` | PATCH `/opportunities/:id/restore` |
| `PICKUP_STATUS_OVERRIDE` | Reserved for future admin pickup override (Developer B) |
| `REPORT_DOWNLOADED` | Reserved for future report download tracking (Developer B) |

---

## Error Response Format

All error responses follow the existing project format:
```json
{
  "success": false,
  "message": "Human-readable error description."
}
```

No stack traces or internal error details are exposed in production responses.
