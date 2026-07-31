# Testing Guide
# WasteZero — Complete Test Flows

**Backend Base URL:** `http://localhost:5001/api`  
**Frontend URL:** `http://localhost:4200`  
**Test Tool:** Postman, cURL, or automated test scripts

---

## Table of Contents

1. [Environment Setup](#1-environment-setup)
2. [Authentication Flows](#2-authentication-flows)
3. [Profile Flows](#3-profile-flows)
4. [Opportunity Flows](#4-opportunity-flows)
5. [Application Flows](#5-application-flows)
6. [Pickup Flows](#6-pickup-flows)
7. [Match Suggestion Flows](#7-match-suggestion-flows)
8. [Messaging Flows](#8-messaging-flows)
9. [Notification Flows](#9-notification-flows)
10. [Admin Flows](#10-admin-flows)
11. [Security & Edge Cases](#11-security--edge-cases)
12. [Race Condition Tests](#12-race-condition-tests)
13. [Socket.IO Testing](#13-socketio-testing)
14. [End-to-End Regression Checklist](#14-end-to-end-regression-checklist)

---

## 1. Environment Setup

### Required Accounts to Test All Flows

Create these 3 test accounts:

| Role | Name | Email | Username | Password |
|---|---|---|---|---|
| volunteer | Test Volunteer | volunteer@test.com | testvolunteer | Test@1234! |
| ngo | Test NGO | ngo@test.com | testngo | Test@1234! |
| admin | Test Admin | admin@test.com | testadmin | Test@1234! |

### Postman Collection Variables

```
{{BASE_URL}}          = http://localhost:5001/api
{{VOLUNTEER_TOKEN}}   = (set after login)
{{NGO_TOKEN}}         = (set after login)
{{ADMIN_TOKEN}}       = (set after login)
{{OPPORTUNITY_ID}}    = (set after create)
{{APPLICATION_ID}}    = (set after apply)
{{PICKUP_ID}}         = (set after create)
{{VOLUNTEER_ID}}      = (set from login response)
{{NGO_ID}}            = (set from login response)
```

---

## 2. Authentication Flows

### 2.1 Register (All Roles)

**Endpoint:** `POST {{BASE_URL}}/auth/register`

**Test 1 — Register Volunteer (Success)**
```json
{
  "name": "Test Volunteer",
  "username": "testvolunteer",
  "email": "volunteer@test.com",
  "password": "Test@1234!",
  "role": "volunteer"
}
```
Expected: `200 OK`, OTP sent to email

**Test 2 — Register with Duplicate Email (Fail)**
```json
{
  "name": "Duplicate",
  "username": "different",
  "email": "volunteer@test.com",
  "password": "Test@1234!",
  "role": "volunteer"
}
```
Expected: `409 Conflict`

**Test 3 — Weak Password (Fail)**
```json
{
  "name": "Weak User",
  "username": "weakuser",
  "email": "weak@test.com",
  "password": "password",
  "role": "volunteer"
}
```
Expected: `400 Bad Request` — password validation error

**Test 4 — Invalid Role (Fail)**
```json
{
  "role": "superuser",
  ...
}
```
Expected: `400 Bad Request`

---

### 2.2 Verify OTP

**Endpoint:** `POST {{BASE_URL}}/auth/verify-otp`

**Test 1 — Valid OTP (Success)**
```json
{
  "email": "volunteer@test.com",
  "otp": "<6-digit code from email>"
}
```
Expected: `201 Created`, user document created

**Test 2 — Wrong OTP (Fail)**
```json
{
  "email": "volunteer@test.com",
  "otp": "000000"
}
```
Expected: `400 Bad Request` — Invalid OTP

**Test 3 — Login Before Verifying (Fail)**

Skip verification, try to login:
Expected: `403 Forbidden` — Please verify your email

---

### 2.3 Login

**Endpoint:** `POST {{BASE_URL}}/auth/login`

**Test 1 — Login with Username (Success)**
```json
{
  "identifier": "testvolunteer",
  "password": "Test@1234!"
}
```
Expected: `200 OK`, `{ token, user }`

**Test 2 — Login with Email (Success)**
```json
{
  "identifier": "volunteer@test.com",
  "password": "Test@1234!"
}
```
Expected: `200 OK`

**Test 3 — Wrong Password (Fail)**
```json
{
  "identifier": "testvolunteer",
  "password": "WrongPass123!"
}
```
Expected: `401 Unauthorized`

**Test 4 — Non-Existent User (Fail)**
```json
{
  "identifier": "doesnotexist",
  "password": "Test@1234!"
}
```
Expected: `401 Unauthorized`

---

### 2.4 Forgot Password

**Endpoint:** `POST {{BASE_URL}}/auth/forgot-password`

**Test 1 — Real Email (Success — enumeration-safe)**
```json
{ "email": "volunteer@test.com" }
```
Expected: `200 OK`, always returns same success message

**Test 2 — Fake Email (Success — enumeration-safe)**
```json
{ "email": "doesnotexist@test.com" }
```
Expected: `200 OK`, same message (no hint that email doesn't exist)

---

### 2.5 Reset Password

**Endpoint:** `POST {{BASE_URL}}/auth/reset-password`

**Test 1 — Valid OTP + New Password (Success)**
```json
{
  "email": "volunteer@test.com",
  "otp": "<code from forgot-password email>",
  "newPassword": "NewTest@5678!"
}
```
Expected: `200 OK`

**Test 2 — Same as Current Password (Fail)**

Use the reset flow but provide the same password as current:
Expected: `400 Bad Request`

---

## 3. Profile Flows

### 3.1 Get Profile

**Endpoint:** `GET {{BASE_URL}}/users/profile`  
**Headers:** `Authorization: Bearer {{VOLUNTEER_TOKEN}}`

Expected: `200 OK`, user object without password

---

### 3.2 Update Profile (Volunteer)

**Endpoint:** `PUT {{BASE_URL}}/users/profile`  
**Headers:** `Authorization: Bearer {{VOLUNTEER_TOKEN}}`

**Test 1 — Complete Profile (Success)**
```json
{
  "name": "Test Volunteer Updated",
  "bio": "I love volunteering!",
  "skills": ["First Aid", "Driving", "Data Entry"],
  "locations": {
    "primary": { "city": "Bangalore", "state": "Karnataka" },
    "secondary": [{ "city": "Mysore", "state": "Karnataka" }]
  }
}
```
Expected: `200 OK`

**Test 2 — Incomplete Profile (Fail — missing skills)**
```json
{
  "locations": { "primary": { "city": "Bangalore", "state": "Karnataka" } }
}
```
Expected: `400 Bad Request`, profile incomplete

---

### 3.3 Update Profile (NGO)

**Endpoint:** `PUT {{BASE_URL}}/users/profile`  
**Headers:** `Authorization: Bearer {{NGO_TOKEN}}`

**Test 1 — NGO Complete Profile (Success)**
```json
{
  "name": "Test NGO Updated",
  "bio": "We collect all types of waste.",
  "wasteTypes": ["Plastic", "E-Waste", "Glass"],
  "locations": {
    "primary": { "city": "Bangalore", "state": "Karnataka" }
  }
}
```
Expected: `200 OK`

---

### 3.4 Change Password (Authenticated)

**Step 1 — Request OTP:**  
`POST {{BASE_URL}}/users/change-password/send-otp`  
Headers: `Authorization: Bearer {{VOLUNTEER_TOKEN}}`  
Body: (empty)

**Step 2 — Verify OTP + New Password:**  
`PUT {{BASE_URL}}/users/change-password/verify-otp`
```json
{
  "otp": "<code from email>",
  "newPassword": "AnotherPass@99!"
}
```

---

## 4. Opportunity Flows

### 4.1 Create Opportunity (NGO)

**Endpoint:** `POST {{BASE_URL}}/opportunities`  
**Headers:** `Authorization: Bearer {{NGO_TOKEN}}`

**Test 1 — Valid Opportunity (Success)**
```json
{
  "title": "Weekend Beach Cleanup",
  "description": "Help us clean Juhu Beach.",
  "required_skills": ["Physical Fitness", "Driving"],
  "duration": "4 hours",
  "location": "Juhu, Mumbai, Maharashtra",
  "status": "open",
  "date": "2027-08-15T06:00:00.000Z"
}
```
Expected: `201 Created`

**Test 2 — Volunteer Tries to Create (Fail)**  
Headers: `Authorization: Bearer {{VOLUNTEER_TOKEN}}`  
Expected: `403 Forbidden`

**Test 3 — Missing Required Fields (Fail)**
```json
{
  "title": "Incomplete"
}
```
Expected: `422 Unprocessable Entity`

---

### 4.2 List Opportunities

**Endpoint:** `GET {{BASE_URL}}/opportunities`  
**Headers:** `Authorization: Bearer {{VOLUNTEER_TOKEN}}`

Expected: `200 OK`, paginated list

**Pagination:**
```
GET /opportunities?page=1&limit=5
```

---

### 4.3 Search Opportunities

**Endpoint:** `GET {{BASE_URL}}/opportunities/search?q=beach`  
**Headers:** `Authorization: Bearer {{VOLUNTEER_TOKEN}}`

Expected: `200 OK`, opportunities with "beach" in title or description

---

### 4.4 Filter Opportunities

**Endpoint:** `GET {{BASE_URL}}/opportunities/filter`

```
?status=open
?status=open&skill=driving
?location=bangalore
?sort=-createdAt
?sort=date
```

---

### 4.5 My Opportunities (NGO)

**Endpoint:** `GET {{BASE_URL}}/opportunities/my-opportunities`  
**Headers:** `Authorization: Bearer {{NGO_TOKEN}}`

Expected: only opportunities created by this NGO

---

### 4.6 Update Opportunity (NGO, Owner Only)

**Endpoint:** `PUT {{BASE_URL}}/opportunities/{{OPPORTUNITY_ID}}`  
**Headers:** `Authorization: Bearer {{NGO_TOKEN}}`

```json
{
  "title": "Updated Beach Cleanup",
  "status": "closed"
}
```
Expected: `200 OK`

**Test — Different NGO Tries to Update (Fail)**  
Expected: `403 Forbidden`

---

### 4.7 Delete Opportunity (NGO)

**Endpoint:** `DELETE {{BASE_URL}}/opportunities/{{OPPORTUNITY_ID}}`  
**Headers:** `Authorization: Bearer {{NGO_TOKEN}}`

Expected: `200 OK`, Cloudinary image deleted if present

---

## 5. Application Flows

### 5.1 Apply for Opportunity (Volunteer)

**Endpoint:** `POST {{BASE_URL}}/applications`  
**Headers:** `Authorization: Bearer {{VOLUNTEER_TOKEN}}`

```json
{
  "opportunity_id": "{{OPPORTUNITY_ID}}"
}
```
Expected: `201 Created`, `{ status: "pending" }`

**Test — Apply Twice (Fail)**  
Expected: `409 Conflict` — already applied

**Test — Apply to Closed Opportunity (Fail)**  
Create a closed opportunity first, then apply:  
Expected: `400 Bad Request`

---

### 5.2 My Applications (Volunteer)

**Endpoint:** `GET {{BASE_URL}}/applications/my-applications`  
**Headers:** `Authorization: Bearer {{VOLUNTEER_TOKEN}}`

Expected: list of applications with populated opportunity data

---

### 5.3 Get Applications (NGO)

**Endpoint:** `GET {{BASE_URL}}/applications`  
**Headers:** `Authorization: Bearer {{NGO_TOKEN}}`

Expected: applications for NGO's own opportunities only

**With filter:**
```
?opportunity={{OPPORTUNITY_ID}}
?status=pending
```

---

### 5.4 Accept/Reject Application (NGO)

**Endpoint:** `PUT {{BASE_URL}}/applications/{{APPLICATION_ID}}`  
**Headers:** `Authorization: Bearer {{NGO_TOKEN}}`

**Accept:**
```json
{ "status": "accepted" }
```
Expected: `200 OK`

**Reject:**
```json
{ "status": "rejected" }
```
Expected: `200 OK`

**Test — Update Already-Accepted Application (Fail)**  
Expected: `400 Bad Request` — already accepted

---

### 5.5 Withdraw Application (Volunteer)

**Endpoint:** `DELETE {{BASE_URL}}/applications/{{APPLICATION_ID}}`  
**Headers:** `Authorization: Bearer {{VOLUNTEER_TOKEN}}`

Expected: `200 OK` (only works if application is `pending`)

**Test — Withdraw Accepted Application (Fail)**  
Expected: `400 Bad Request`

---

## 6. Pickup Flows

### 6.1 Create Pickup (Volunteer)

**Endpoint:** `POST {{BASE_URL}}/pickups`  
**Headers:** `Authorization: Bearer {{VOLUNTEER_TOKEN}}`

**Test 1 — Valid Pickup (Success)**
```json
{
  "address": {
    "city": "Bangalore",
    "area": "Koramangala"
  },
  "scheduledDate": "2027-08-10",
  "preferredTimeSlot": {
    "start": "09:00",
    "end": "11:00"
  },
  "wasteTypes": ["Plastic", "E-Waste"],
  "notes": "2 bags of plastic."
}
```
Expected: `201 Created`, `status: "Pending"`

**Test 2 — Past Date (Fail)**
```json
{
  "scheduledDate": "2020-01-01",
  ...
}
```
Expected: `422 Unprocessable Entity`

**Test 3 — Invalid Time Format (Fail)**
```json
{
  "preferredTimeSlot": { "start": "9am", "end": "11am" },
  ...
}
```
Expected: `422 Unprocessable Entity`

**Test 4 — End Before Start (Fail)**
```json
{
  "preferredTimeSlot": { "start": "11:00", "end": "09:00" },
  ...
}
```
Expected: `422 Unprocessable Entity`

**Test 5 — NGO Tries to Create (Fail)**
Expected: `403 Forbidden`

---

### 6.2 My Pickups (Volunteer)

**Endpoint:** `GET {{BASE_URL}}/pickups/my-pickups`  
**Headers:** `Authorization: Bearer {{VOLUNTEER_TOKEN}}`

```
?status=Pending
?status=Completed
?page=1&limit=5
```

---

### 6.3 Available Pickups (NGO with Complete Profile)

**Endpoint:** `GET {{BASE_URL}}/pickups/available`  
**Headers:** `Authorization: Bearer {{NGO_TOKEN}}`

**Test 1 — Profile Complete (Success)**

Ensure NGO has `locations.primary.city: "Bangalore"` and `wasteTypes: ["Plastic"]`

The volunteer created a pickup in Bangalore with `wasteTypes: ["Plastic"]` — NGO should see it.

**Test 2 — Profile Incomplete (Fail)**

NGO without city or wasteTypes:  
Expected: `400 Bad Request`, `{ success: false, missingFields: [...] }`

---

### 6.4 Claim Pickup (NGO → Assigned)

**Endpoint:** `PATCH {{BASE_URL}}/pickups/{{PICKUP_ID}}/status`  
**Headers:** `Authorization: Bearer {{NGO_TOKEN}}`

```json
{ "status": "Assigned" }
```
Expected: `200 OK`, `status: "Assigned"`, `agent_id` set to NGO's ID

**Test — NGO Not Eligible (Wrong City) (Fail)**  
Expected: `403 Forbidden`

---

### 6.5 Complete Pickup (NGO)

**Endpoint:** `PATCH {{BASE_URL}}/pickups/{{PICKUP_ID}}/status`  
**Headers:** `Authorization: Bearer {{NGO_TOKEN}}`

```json
{ "status": "Completed" }
```
Expected: `200 OK`, `status: "Completed"`, `completedAt` set

---

### 6.6 Cancel Pickup (NGO, Assigned)

**Endpoint:** `PATCH {{BASE_URL}}/pickups/{{PICKUP_ID}}/status`

```json
{ "status": "Cancelled" }
```
Expected: `200 OK` (only works on Assigned pickups)

---

### 6.7 Volunteer Cancel Pickup (Pending)

**Endpoint:** `PATCH {{BASE_URL}}/pickups/{{PICKUP_ID}}/cancel`  
**Headers:** `Authorization: Bearer {{VOLUNTEER_TOKEN}}`

Expected: `200 OK`, `status: "Cancelled"`

**Test — Cancel Non-Pending Pickup (Fail)**  
Expected: `400 Bad Request`

---

### 6.8 Delete Pickup (Volunteer, Pending)

**Endpoint:** `DELETE {{BASE_URL}}/pickups/{{PICKUP_ID}}`  
**Headers:** `Authorization: Bearer {{VOLUNTEER_TOKEN}}`

Expected: `200 OK`

---

### 6.9 Update Pickup (Volunteer, Pending)

**Endpoint:** `PUT {{BASE_URL}}/pickups/{{PICKUP_ID}}`

```json
{
  "notes": "Updated notes.",
  "wasteTypes": ["Glass"]
}
```
Expected: `200 OK`

---

### 6.10 All Pickups (Admin)

**Endpoint:** `GET {{BASE_URL}}/pickups`  
**Headers:** `Authorization: Bearer {{ADMIN_TOKEN}}`

Expected: all pickups with populated user and agent references

---

## 7. Match Suggestion Flows

**Endpoint:** `GET {{BASE_URL}}/matches/suggestions`  
**Headers:** `Authorization: Bearer {{VOLUNTEER_TOKEN}}`

**Test 1 — Complete Volunteer Profile (Success)**

Ensure volunteer has:
- `skills: ["Physical Fitness"]`
- `locations.primary.city: "Mumbai"` (or wherever the test opportunity is)

An NGO must have created an opportunity with `required_skills: ["Physical Fitness"]` in Mumbai.

Expected: `200 OK`, ranked `matches[]` array

**Test 2 — Incomplete Profile (Fail)**

Reset volunteer profile to have no skills:  
Expected: `400 Bad Request`, `{ missingFields: ["skills"] }`

**Test 3 — NGO Accesses (Fail)**  
Expected: `403 Forbidden` — volunteer-only route

**Test 4 — With Limit**
```
?limit=5
```
Expected: max 5 results

---

## 8. Messaging Flows

### 8.1 Send Message (Socket.IO)

Use `socket-test.js` or Postman Socket.IO:

1. Connect Volunteer with valid JWT
2. Connect NGO with valid JWT
3. Volunteer emits `message:send` to NGO's ID
4. NGO should receive `message:new` event
5. NGO should receive `notification:new` event

**Test — Volunteer to Volunteer (Fail)**  
Expected: ack `{ success: false, message: "Messaging is only allowed between Volunteers and NGOs" }`

**Test — Content > 2000 chars (Fail)**  
Expected: ack `{ success: false, message: "Message content exceeds 2000 characters" }`

---

### 8.2 Get Conversations (REST)

**Endpoint:** `GET {{BASE_URL}}/messages/conversations`  
**Headers:** `Authorization: Bearer {{VOLUNTEER_TOKEN}}`

Expected: list with `{ conversationId, otherUser, lastMessage }` (plaintext content)

---

### 8.3 Get Message History (REST)

**Endpoint:** `GET {{BASE_URL}}/messages?with={{NGO_ID}}`  
**Headers:** `Authorization: Bearer {{VOLUNTEER_TOKEN}}`

Expected: messages oldest-first, plaintext content (never ciphertext)

---

### 8.4 Read Receipt (Socket.IO)

1. NGO emits `message:read` with `{ conversationId: "volunteerid_ngoid" }`
2. Volunteer should receive `message:read` event with `{ conversationId, readerId: NGO_ID }`

**Test — Non-Participant Sends Read (Fail)**  
Use a third user's socket:  
Expected: ack `{ success: false, message: "You are not a participant in this conversation" }`

---

## 9. Notification Flows

### 9.1 Get Notifications

**Endpoint:** `GET {{BASE_URL}}/notifications`  
**Headers:** `Authorization: Bearer {{VOLUNTEER_TOKEN}}`

Expected: paginated list, decrypted plaintext messages, no `iv`/`authTag` fields

**Test — No iv/authTag in Response**  
Inspect the response — `iv` and `authTag` fields must not appear.

---

### 9.2 Mark Notification as Read

**Endpoint:** `PUT {{BASE_URL}}/notifications/{{NOTIFICATION_ID}}/read`  
**Headers:** `Authorization: Bearer {{VOLUNTEER_TOKEN}}`

Expected: `200 OK`, `isRead: true`

**Test — Mark Another User's Notification (Fail)**  
Use volunteer's token to mark NGO's notification ID:  
Expected: `404 Not Found` (ownership-scoped, intentionally ambiguous)

---

### 9.3 Notification Triggers

Verify notifications are created in these scenarios:

| Trigger | Recipient | Type |
|---|---|---|
| NGO creates opportunity matching volunteer's skills + city | Volunteer | `opportunity_match` |
| Volunteer creates pickup matching NGO's city + wasteTypes | NGO | `pickup_match` |
| User sends a message | Receiver | `message` |

---

## 10. Admin Flows

### 10.1 Admin Login

Register admin (only one can exist), verify OTP, login:

```json
{
  "identifier": "testadmin",
  "password": "Test@1234!"
}
```

**Test — Second Admin Register (Fail)**  
Expected: `409 Conflict` (partial unique index on role:'admin')

---

### 10.2 Admin — All Applications

**Endpoint:** `GET {{BASE_URL}}/applications`  
**Headers:** `Authorization: Bearer {{ADMIN_TOKEN}}`

Expected: all applications system-wide (not filtered to any NGO)

---

### 10.3 Admin — All Pickups

**Endpoint:** `GET {{BASE_URL}}/pickups`  
**Headers:** `Authorization: Bearer {{ADMIN_TOKEN}}`

Expected: all pickups in the system

---

## 11. Security & Edge Cases

### 11.1 Invalid JWT

**Headers:** `Authorization: Bearer invalidtoken`

Expected: `401 Unauthorized`

---

### 11.2 Missing JWT

No Authorization header:

Expected: `401 Unauthorized`

---

### 11.3 Invalid ObjectId Parameter

```
GET /api/pickups/notanobjectid
```
Expected: `400 Bad Request`

---

### 11.4 Expired JWT

Wait for token to expire (or manually create with short expiry):  
Expected: `401 Unauthorized`, `{ message: "Token has expired." }`

---

### 11.5 Accessing Another User's Resource

Volunteer A tries to withdraw Volunteer B's application:  
Expected: `403 Forbidden`

---

### 11.6 Message Encryption Verification

Query MongoDB directly to verify that message `content` field is stored as ciphertext (not plaintext). The REST response should return readable text; the database should not.

---

## 12. Race Condition Tests

### 12.1 Simultaneous Pickup Claim

1. Create a Pending pickup as volunteer
2. Simultaneously (within milliseconds) send two `PATCH /:id/status` requests with `{ status: "Assigned" }` from two different NGO accounts
3. Expected: exactly one returns `200 OK` with `status: "Assigned"`, the other returns `409 Conflict`

### 12.2 Simultaneous Volunteer Cancel and NGO Claim

1. Create a Pending pickup
2. Simultaneously: Volunteer sends `PATCH /:id/cancel`, NGO sends `PATCH /:id/status { "Assigned" }`
3. Expected: exactly one succeeds; the other gets `409 Conflict`

### 12.3 Duplicate Application Race

1. Send two simultaneous `POST /applications` requests with the same opportunity_id from the same volunteer token
2. Expected: exactly one returns `201 Created`, the other returns `409 Conflict`

---

## 13. Socket.IO Testing

### With socket-test.js

```bash
# Install socket.io-client if not already
cd Backend
npm install

# Run volunteer socket client
node socket-test.js

# Run NGO socket client (in another terminal)
node socket-test-ngo.js
```

### Manual Event Testing Checklist

| Event | Sends | Receives | Tested? |
|---|---|---|---|
| `message:send` | Volunteer | NGO gets `message:new` | |
| `message:send` | NGO | Volunteer gets `message:new` | |
| `message:read` | NGO | Volunteer gets `message:read` | |
| `message:typing` | Volunteer | NGO gets `message:typing` | |
| Create opportunity | System | Volunteer gets `notification:new` (opportunity_match) | |
| Create pickup | System | NGO gets `notification:new` (pickup_match) | |
| Send message | System | Receiver gets `notification:new` (message) | |

---

## 14. End-to-End Regression Checklist

### Milestone 1 (Auth + Profile)

- [ ] Volunteer registers → OTP email received
- [ ] OTP verified → user created
- [ ] Login with username → JWT
- [ ] Login with email → JWT
- [ ] Invalid credentials → 401
- [ ] Unverified login → 403
- [ ] Get profile → correct user data
- [ ] Update profile (volunteer, complete) → success
- [ ] Update profile (incomplete) → 400
- [ ] Forgot password → email received
- [ ] Reset password → works
- [ ] Change password (OTP) → works
- [ ] Change to same password → blocked

### Milestone 2 (Opportunities + Applications + Pickups)

- [ ] NGO creates opportunity → success
- [ ] Volunteer cannot create → 403
- [ ] List opportunities → paginated
- [ ] Search opportunities → relevant results
- [ ] Filter by status → filtered
- [ ] NGO updates own opportunity → success
- [ ] NGO cannot update other NGO's opportunity → 403
- [ ] NGO deletes opportunity → success + Cloudinary cleanup
- [ ] Volunteer applies → pending application
- [ ] Duplicate application → 409
- [ ] Apply to closed opportunity → 400
- [ ] NGO accepts application → accepted (terminal)
- [ ] Cannot change accepted/rejected → 400
- [ ] Volunteer withdraws pending → success
- [ ] Volunteer cannot withdraw accepted → 400
- [ ] Volunteer creates pickup → Pending
- [ ] NGO claims pickup → Assigned (atomic)
- [ ] NGO completes pickup → Completed
- [ ] Volunteer cancels pending → Cancelled
- [ ] Volunteer cannot cancel assigned → 400
- [ ] Volunteer deletes pending → success
- [ ] Two NGOs claim same pickup → exactly one 409

### Milestone 3 (Matching + Messaging + Notifications)

- [ ] Match suggestions → ranked list (complete profile)
- [ ] Match suggestions → 400 (incomplete profile)
- [ ] Creating opportunity triggers volunteer notification
- [ ] Creating pickup triggers NGO notification
- [ ] Volunteer messages NGO → real-time delivery
- [ ] NGO messages volunteer → real-time delivery
- [ ] Volunteer messages volunteer → rejected
- [ ] Typing indicator received by other user
- [ ] Read receipt broadcast to sender
- [ ] Conversation list shows latest message
- [ ] Message history returns correct thread
- [ ] Message content is plaintext (not ciphertext) in API
- [ ] iv/authTag never appears in any response
- [ ] Notification list returns decrypted messages
- [ ] Mark notification as read → isRead: true
- [ ] Cannot mark other user's notification → 404
- [ ] Socket rate limit: 21st message → rejected
- [ ] Socket reconnect after page refresh works
