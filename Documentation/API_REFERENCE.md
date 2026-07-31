# API Reference
# WasteZero Backend API

**Base URL:** `http://localhost:5001/api`  
**Authentication:** Bearer Token (`Authorization: Bearer <JWT>`)  
**Content-Type:** `application/json` (except where multipart noted)

---

## Table of Contents

- [Auth](#auth)
- [Users (Profile)](#users-profile)
- [Opportunities](#opportunities)
- [Applications](#applications)
- [Pickups](#pickups)
- [Matches](#matches)
- [Messages](#messages)
- [Notifications](#notifications)

---

## Auth

### POST `/api/auth/register`

Register a new user. User document is NOT created immediately. An OTP is sent to the email address provided. User is only created upon successful OTP verification.

**Access:** Public  
**Rate limit:** None (OTP resend is rate-limited separately)

**Request Body:**
```json
{
  "name": "Asha Rao",
  "username": "asharao",
  "email": "asha@example.com",
  "password": "SecurePass123!",
  "role": "volunteer"
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `name` | string | Yes | Min 2 chars |
| `username` | string | Yes | Min 3 chars, alphanumeric + underscore |
| `email` | string | Yes | Valid email format |
| `password` | string | Yes | Min 8 chars, uppercase, lowercase, number, special char |
| `role` | string | Yes | `volunteer`, `ngo`, or `admin` |

**Success Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to asha@example.com. Please verify your email to complete registration."
}
```

**Error Responses:**

| Status | Message |
|---|---|
| 400 | Validation error (field-level) |
| 409 | Email or username already registered |

---

### POST `/api/auth/verify-otp`

Verify the registration OTP. Creates the user document if OTP is valid.

**Access:** Public

**Request Body:**
```json
{
  "email": "asha@example.com",
  "otp": "123456"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Email verified. Registration complete.",
  "data": {
    "_id": "6801f...",
    "name": "Asha Rao",
    "username": "asharao",
    "email": "asha@example.com",
    "role": "volunteer",
    "isVerified": true
  }
}
```

**Error Responses:**

| Status | Message |
|---|---|
| 400 | Invalid or expired OTP |
| 400 | OTP has been locked after too many failed attempts |
| 404 | No pending registration for this email |

---

### POST `/api/auth/resend-otp`

Resend a registration OTP. Refreshes the OTP code without re-creating the registration payload.

**Access:** Public  
**Rate limit:** 5 per 10 minutes per IP

**Request Body:**
```json
{
  "email": "asha@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "New OTP sent to asha@example.com."
}
```

---

### POST `/api/auth/login`

Authenticate a user with username or email and password.

**Access:** Public  
**Rate limit:** 10 per 15 minutes per IP

**Request Body:**
```json
{
  "identifier": "asharao",
  "password": "SecurePass123!"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `identifier` | string | Yes | Username or email |
| `password` | string | Yes | |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful.",
  "token": "eyJhbGciOiJIUzI1NiIsInR5...",
  "user": {
    "_id": "6801f...",
    "name": "Asha Rao",
    "username": "asharao",
    "email": "asha@example.com",
    "role": "volunteer",
    "isVerified": true,
    "skills": [],
    "wasteTypes": [],
    "locations": {}
  }
}
```

**Error Responses:**

| Status | Message |
|---|---|
| 401 | Invalid credentials |
| 403 | Please verify your email before logging in |

---

### POST `/api/auth/forgot-password`

Request a password reset OTP. Always returns success (enumeration-safe) — no hint about whether the email exists.

**Access:** Public  
**Rate limit:** 5 per 10 minutes per IP

**Request Body:**
```json
{
  "email": "asha@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "If an account with that email exists, a password reset OTP has been sent."
}
```

---

### POST `/api/auth/reset-password`

Reset password using the OTP received via forgot-password.

**Access:** Public

**Request Body:**
```json
{
  "email": "asha@example.com",
  "otp": "789012",
  "newPassword": "NewSecurePass456!"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset successfully."
}
```

**Error Responses:**

| Status | Message |
|---|---|
| 400 | Invalid or expired OTP |
| 400 | New password cannot be the same as your current password |
| 404 | User not found |

---

## Users (Profile)

### GET `/api/users/profile`

Get the current logged-in user's profile.

**Access:** Private (Any authenticated user)

**Headers:** `Authorization: Bearer <token>`

**Success Response (200):**
```json
{
  "success": true,
  "message": "User profile fetched successfully.",
  "data": {
    "user": {
      "_id": "6801f...",
      "name": "Asha Rao",
      "username": "asharao",
      "email": "asha@example.com",
      "role": "volunteer",
      "skills": ["First Aid", "Driving"],
      "wasteTypes": [],
      "bio": "Passionate about the environment.",
      "locations": {
        "primary": { "city": "Bangalore", "state": "Karnataka" },
        "secondary": []
      },
      "isVerified": true,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-02T00:00:00.000Z"
    }
  }
}
```

---

### PUT `/api/users/profile`

Update the current logged-in user's profile.

**Access:** Private (Any authenticated user)

**Request Body (all fields optional; only provided fields are updated):**
```json
{
  "name": "Asha R.",
  "bio": "I love helping.",
  "skills": ["First Aid", "Driving", "Data Entry"],
  "wasteTypes": [],
  "locations": {
    "primary": { "city": "Bangalore", "state": "Karnataka" },
    "secondary": [
      { "city": "Mysore", "state": "Karnataka" }
    ]
  }
}
```

> **Note:** `wasteTypes` can only be set by NGO users. Volunteers setting `wasteTypes` will have it ignored or rejected depending on profile completeness. Profile save is blocked if completeness requirements are not met after the update.

**Profile Completeness Requirements:**
- **Volunteer:** `locations.primary.city`, `locations.primary.state`, and at least one skill
- **NGO:** `locations.primary.city`, `locations.primary.state`, and at least one wasteType

**Success Response (200):**
```json
{
  "success": true,
  "message": "Profile updated successfully.",
  "data": { "user": { ... } }
}
```

**Error Responses:**

| Status | Message |
|---|---|
| 400 | Profile incomplete: missing city, state, or skills/wasteTypes |

---

### POST `/api/users/change-password/send-otp`

Request an OTP to the logged-in user's email address to authorize a password change.

**Access:** Private (Any authenticated user)

**Request Body:** (empty)

**Success Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to your registered email."
}
```

---

### PUT `/api/users/change-password/verify-otp`

Verify the change-password OTP and set the new password.

**Access:** Private (Any authenticated user)

**Request Body:**
```json
{
  "otp": "456789",
  "newPassword": "NewSecurePass789!"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password changed successfully."
}
```

**Error Responses:**

| Status | Message |
|---|---|
| 400 | Invalid or expired OTP |
| 400 | New password cannot be the same as your current password |

---

## Opportunities

### POST `/api/opportunities`

Create a new volunteer opportunity.

**Access:** Private (NGO, Admin)  
**Content-Type:** `multipart/form-data` (when uploading an image); `application/json` otherwise

**Request Body:**
```json
{
  "title": "Weekend Beach Cleanup",
  "description": "Help us clean Juhu Beach this Saturday.",
  "required_skills": ["Physical Fitness", "Driving"],
  "duration": "4 hours",
  "location": "Juhu, Mumbai, Maharashtra",
  "status": "open",
  "date": "2026-08-15T06:00:00.000Z"
}
```

For image upload, use `multipart/form-data` with `image` as the file field.

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | Yes | Max 100 chars |
| `description` | string | Yes | |
| `required_skills` | string[] | Yes | Min 1 item |
| `duration` | string | Yes | |
| `location` | string | Yes | Free text |
| `status` | string | No | Default: `open` |
| `date` | ISO date string | No | Future date |
| `image` | file (form-data) | No | Uploaded to Cloudinary |

**Success Response (201):**
```json
{
  "success": true,
  "message": "Opportunity created successfully.",
  "data": {
    "_id": "opp123...",
    "ngo_id": "ngo456...",
    "title": "Weekend Beach Cleanup",
    "required_skills": ["Physical Fitness", "Driving"],
    "status": "open",
    "image": "https://res.cloudinary.com/...",
    "createdAt": "2026-07-31T..."
  }
}
```

---

### GET `/api/opportunities`

Get all opportunities (paginated).

**Access:** Private (Any)

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 10) |
| `sort` | string | Sort field and direction (e.g., `-createdAt`) |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Opportunities fetched successfully.",
  "data": {
    "opportunities": [ { ... }, { ... } ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "totalPages": 3
    }
  }
}
```

---

### GET `/api/opportunities/search`

Full-text search across opportunity title and description.

**Access:** Private (Any)

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `q` | string | Yes | Search keyword |
| `page` | number | No | |
| `limit` | number | No | |

**Success Response (200):** Same shape as list.

---

### GET `/api/opportunities/filter`

Filter opportunities by status, skill, location, and sort.

**Access:** Private (Any)

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `status` | string | `open`, `in-progress`, `closed` |
| `skill` | string | Skill keyword (partial, case-insensitive) |
| `location` | string | Location keyword (partial, case-insensitive) |
| `sort` | string | e.g., `date`, `-date`, `createdAt`, `-createdAt` |
| `page` | number | |
| `limit` | number | |

---

### GET `/api/opportunities/my-opportunities`

Get all opportunities created by the logged-in NGO/Admin.

**Access:** Private (NGO, Admin)

**Success Response:** Same shape as list.

---

### GET `/api/opportunities/:id`

Get a single opportunity by ID.

**Access:** Private (Any)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Opportunity fetched successfully.",
  "data": { ... }
}
```

**Error:** 404 if not found; 400 if invalid ObjectId.

---

### PUT `/api/opportunities/:id`

Update an opportunity. Owner NGO/Admin only.

**Access:** Private (NGO — owner only; Admin)  
**Content-Type:** `multipart/form-data` or `application/json`

**Request Body:** All fields are optional. Only provided fields are updated.

**Success Response (200):**
```json
{
  "success": true,
  "message": "Opportunity updated successfully.",
  "data": { ... }
}
```

**Error:** 403 if not the owner.

---

### DELETE `/api/opportunities/:id`

Delete an opportunity and its Cloudinary image (if any).

**Access:** Private (NGO — owner only; Admin)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Opportunity deleted successfully.",
  "data": null
}
```

---

## Applications

### POST `/api/applications`

Apply for an opportunity.

**Access:** Private (Volunteer)

**Request Body:**
```json
{
  "opportunity_id": "opp123..."
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Application submitted successfully.",
  "data": {
    "_id": "app789...",
    "opportunity_id": "opp123...",
    "volunteer_id": "vol456...",
    "status": "pending"
  }
}
```

**Error Responses:**

| Status | Message |
|---|---|
| 400 | This opportunity is closed |
| 400 | You have already applied for this opportunity |
| 404 | Opportunity not found |
| 409 | Duplicate (DB constraint) |

---

### GET `/api/applications`

Get applications.

**Access:** Private (NGO — own opportunities only; Admin — all)

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `opportunity` | ObjectId | Filter by opportunity ID |
| `status` | string | `pending`, `accepted`, `rejected` |
| `page` | number | |
| `limit` | number | |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Applications fetched successfully.",
  "data": {
    "page": 1,
    "limit": 10,
    "applications": [ { ... } ]
  }
}
```

---

### GET `/api/applications/my-applications`

Get the logged-in volunteer's own applications (with populated opportunity).

**Access:** Private (Volunteer)

**Success Response (200):**
```json
{
  "success": true,
  "message": "My applications fetched successfully.",
  "data": [ { ...application, "opportunity_id": { ...opportunity } } ]
}
```

---

### GET `/api/applications/:id`

Get a single application by ID.

**Access:** Private (Volunteer — own; NGO — for own opportunity; Admin — any)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Application fetched successfully.",
  "data": { ... }
}
```

---

### PUT `/api/applications/:id`

Update application status (accept or reject).

**Access:** Private (NGO — must own the opportunity; Admin)

**Request Body:**
```json
{
  "status": "accepted"
}
```

Allowed values: `accepted`, `rejected`. Application must currently be `pending`.

**Success Response (200):**
```json
{
  "success": true,
  "message": "Application status updated successfully.",
  "data": { ... }
}
```

**Error Responses:**

| Status | Message |
|---|---|
| 400 | Application already accepted/rejected |
| 403 | Not the opportunity owner |

---

### DELETE `/api/applications/:id`

Withdraw (delete) a pending application.

**Access:** Private (Volunteer — own applications only)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Application withdrawn successfully.",
  "data": null
}
```

**Error:** 400 if application is not pending.

---

## Pickups

### POST `/api/pickups`

Create a new pickup request.

**Access:** Private (Volunteer)

**Request Body:**
```json
{
  "address": {
    "city": "Bangalore",
    "area": "Koramangala"
  },
  "scheduledDate": "2026-08-10",
  "preferredTimeSlot": {
    "start": "09:00",
    "end": "11:00"
  },
  "wasteTypes": ["Plastic", "E-Waste"],
  "notes": "2 bags of plastic bottles and an old laptop."
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `address.city` | string | Yes | Non-empty |
| `address.area` | string | No | |
| `scheduledDate` | date | Yes | Must be in the future |
| `preferredTimeSlot.start` | string | Yes | HH:mm format |
| `preferredTimeSlot.end` | string | Yes | HH:mm format, after start |
| `wasteTypes` | string[] | No | |
| `notes` | string | No | Max 500 chars |

**Success Response (201):**
```json
{
  "success": true,
  "message": "Pickup created successfully.",
  "data": {
    "_id": "pickup001...",
    "user_id": "vol456...",
    "agent_id": null,
    "address": { "city": "Bangalore", "area": "Koramangala" },
    "scheduledDate": "2026-08-10T00:00:00.000Z",
    "preferredTimeSlot": { "start": "09:00", "end": "11:00" },
    "wasteTypes": ["Plastic", "E-Waste"],
    "notes": "2 bags of plastic bottles and an old laptop.",
    "status": "Pending",
    "completedAt": null
  }
}
```

---

### GET `/api/pickups`

List all pickups in the system.

**Access:** Private (Admin only)

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `status` | string | `Pending`, `Assigned`, `Completed`, `Cancelled` |
| `page` | number | |
| `limit` | number | |

**Success Response (200):**
```json
{
  "success": true,
  "message": "All pickups fetched successfully.",
  "data": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "totalPages": 5,
    "pickups": [ { ... } ]
  }
}
```

---

### GET `/api/pickups/my-pickups`

Get the logged-in volunteer's own pickup requests.

**Access:** Private (Volunteer)

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `status` | string | Filter by status |
| `page` | number | |
| `limit` | number | |

---

### GET `/api/pickups/available`

Get pickup requests matched to the logged-in NGO's coverage area and waste types. Always returns `Pending` pickups only.

**Access:** Private (NGO)

**Requires complete profile:** NGO must have `locations.primary.city` and `wasteTypes` set.

**Error (400) if profile incomplete:**
```json
{
  "success": false,
  "message": "Complete your profile to see matched pickups. Missing: city, wasteTypes.",
  "missingFields": ["city", "wasteTypes"]
}
```

---

### GET `/api/pickups/assigned-to-me`

Get pickups currently or previously assigned to the logged-in NGO.

**Access:** Private (NGO)

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `status` | string | `Assigned`, `Completed`, `Cancelled` (not `Pending`) |

---

### GET `/api/pickups/:id`

Get a single pickup by ID.

**Access:** Private  
**Access rules:**
- Volunteer: must be the owner (`user_id`)
- NGO: must be owner OR assigned agent
- Admin: any

---

### PUT `/api/pickups/:id`

Update a pickup's editable fields. Owner volunteer only, Pending status only.

**Access:** Private (Volunteer — owner only)

**Request Body (all optional):**
```json
{
  "address": { "city": "Bangalore", "area": "Indiranagar" },
  "scheduledDate": "2026-08-12",
  "preferredTimeSlot": { "start": "10:00", "end": "12:00" },
  "wasteTypes": ["Glass"],
  "notes": "Updated notes."
}
```

**Error:** 400 if not Pending.

---

### DELETE `/api/pickups/:id`

Delete a pickup. Owner volunteer only, Pending status only.

**Access:** Private (Volunteer — owner only)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Pickup deleted successfully.",
  "data": null
}
```

**Error:** 400 if not Pending; 409 if claimed in the gap (race condition).

---

### PATCH `/api/pickups/:id/cancel`

Cancel a pending pickup (volunteer action).

**Access:** Private (Volunteer — owner only)

**Request Body:** (empty)

**Error:** 400 if not Pending; 409 if claimed simultaneously (race condition).

---

### PATCH `/api/pickups/:id/status`

Transition a pickup's status (NGO action).

**Access:** Private (NGO)

**Request Body:**
```json
{
  "status": "Assigned"
}
```

**Allowed transitions for NGO:**

| From | To | Condition |
|---|---|---|
| `Pending` | `Assigned` | NGO must be eligible (city + wasteType match) |
| `Assigned` | `Completed` | NGO must be the assigned agent |
| `Assigned` | `Cancelled` | NGO must be the assigned agent |

**Error Responses:**

| Status | Message |
|---|---|
| 400 | Cannot move pickup from X to Y |
| 403 | NGO not eligible (wrong city or wasteTypes) |
| 409 | This pickup was just updated by someone else |

---

## Matches

### GET `/api/matches/suggestions`

Get ranked opportunity suggestions for the logged-in volunteer.

**Access:** Private (Volunteer)

**Requires complete volunteer profile:** city, state, and at least one skill.

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `limit` | number | Max results (default: 10, max: 50) |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Match suggestions fetched successfully.",
  "data": {
    "count": 3,
    "matches": [
      {
        "_id": "opp123...",
        "title": "Beach Cleanup",
        "location": "Bangalore, Karnataka",
        "required_skills": ["Physical Fitness"],
        "matchScore": 2,
        "matchedSkillCount": 1,
        "locationMatch": true
      }
    ]
  }
}
```

---

## Messages

> **Note:** Primary messaging happens via Socket.IO (`message:send`, `message:read`, `message:typing`). These REST endpoints are for fetching conversation history and the conversation list.

### GET `/api/messages/conversations`

Get a WhatsApp-style conversation list for the logged-in user.

**Access:** Private (Any)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Conversations fetched successfully.",
  "data": [
    {
      "conversationId": "userId1_userId2",
      "otherUser": {
        "_id": "userId2...",
        "name": "Green Earth NGO",
        "email": "ngo@example.com",
        "role": "ngo"
      },
      "lastMessage": {
        "_id": "msg001...",
        "sender_id": "userId1...",
        "receiver_id": "userId2...",
        "content": "Hello, we saw your pickup request.",
        "status": "read",
        "createdAt": "2026-07-31T..."
      }
    }
  ]
}
```

---

### GET `/api/messages?with=:userId`

Get the full message history between the logged-in user and another user.

**Access:** Private (Any)

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `with` | ObjectId | Yes | The other user's ID |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Message history fetched successfully.",
  "data": [
    {
      "_id": "msg001...",
      "sender_id": "userId1...",
      "receiver_id": "userId2...",
      "conversation_id": "userId1_userId2",
      "content": "Hello!",
      "status": "read",
      "readAt": "2026-07-31T...",
      "createdAt": "2026-07-31T..."
    }
  ]
}
```

> `iv` and `authTag` are **never** included in the response. Content is always decrypted plaintext.

---

## Notifications

### GET `/api/notifications`

Get the logged-in user's notifications, paginated, newest first.

**Access:** Private (Any)

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `page` | number | (default: 1) |
| `limit` | number | (default: 20) |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Notifications fetched successfully.",
  "data": {
    "page": 1,
    "limit": 20,
    "notifications": [
      {
        "_id": "notif001...",
        "user_id": "userId1...",
        "type": "opportunity_match",
        "message": "New opportunity \"Beach Cleanup\" in Bangalore matches your skills. Apply now!",
        "reference_id": "opp123...",
        "isRead": false,
        "createdAt": "2026-07-31T..."
      }
    ]
  }
}
```

> `iv` and `authTag` are **never** included. Message is always decrypted plaintext.

---

### PUT `/api/notifications/:id/read`

Mark a single notification as read. Ownership-scoped — can only mark own notifications.

**Access:** Private (Any — owner only)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Notification marked as read.",
  "data": {
    "_id": "notif001...",
    "isRead": true,
    ...
  }
}
```

**Error (404):** If notification not found OR belongs to another user (intentionally ambiguous).
