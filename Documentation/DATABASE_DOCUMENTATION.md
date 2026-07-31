# Database Documentation
# WasteZero MongoDB Schema Reference

**Database:** MongoDB (Atlas or Local)  
**ODM:** Mongoose ^8.x  
**Collections:** 7

---

## Table of Contents

1. [Collection Overview](#1-collection-overview)
2. [Collection: users](#2-collection-users)
3. [Collection: otps](#3-collection-otps)
4. [Collection: opportunities](#4-collection-opportunities)
5. [Collection: applications](#5-collection-applications)
6. [Collection: pickups](#6-collection-pickups)
7. [Collection: messages](#7-collection-messages)
8. [Collection: notifications](#8-collection-notifications)
9. [Index Summary](#9-index-summary)
10. [Data Flow Diagrams](#10-data-flow-diagrams)
11. [Security Notes](#11-security-notes)

---

## 1. Collection Overview

| Collection | Purpose | Encrypted Fields |
|---|---|---|
| `users` | User accounts (all roles) | None |
| `otps` | Temporary OTP codes + registration payloads | OTP (bcrypt-hashed) |
| `opportunities` | Volunteer opportunities posted by NGOs | None |
| `applications` | Volunteer applications for opportunities | None |
| `pickups` | Volunteer waste pickup requests | None |
| `messages` | Direct messages between Volunteer and NGO | `content` (AES-256-GCM) |
| `notifications` | In-app notification records | `message` (AES-256-GCM) |

---

## 2. Collection: `users`

**Mongoose Model:** `User`  
**File:** `Backend/models/users.model.js`

### Schema

```
users
├── _id             ObjectId            [auto]
├── name            String              required, trim
├── username        String              required, unique, lowercase, trim
├── email           String              required, unique, lowercase, trim
├── password        String              required, bcrypt-hashed, select:false
├── role            String              enum['volunteer','ngo','admin'], default:'volunteer'
├── locations
│   ├── primary
│   │   ├── city   String              optional, trim
│   │   └── state  String              optional, trim
│   └── secondary  [{ city, state }]   optional array
├── wasteTypes      [String]            default:[], NGO-specific
├── skills          [String]            default:[], volunteer-specific
├── bio             String              default:''
├── isVerified      Boolean             default:false
├── createdAt       Date                auto (timestamps:true)
└── updatedAt       Date                auto (timestamps:true)
```

### Indexes

```javascript
// Unique indexes (auto from unique:true)
{ username: 1 }   // unique
{ email: 1 }      // unique

// Explicit indexes for query performance
{ username: 1 }   // fast login by username
{ email: 1 }      // fast login/OTP lookup by email

// Partial unique index — enforces single admin account
{ role: 1 }, { unique: true, partialFilterExpression: { role: 'admin' } }
```

### Pre-Save Hook

```javascript
// Hash password only when modified
// Skip if $locals.skipHash === true (atomic registration flow)
UserSchema.pre('save', async function() {
  if (!this.isModified('password') || this.$locals.skipHash) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});
```

### Instance Method

```javascript
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};
```

### Validation Notes

- `password` has `select: false` — never returned in queries unless explicitly selected
- `email` is validated by regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- `role` must be one of: `'volunteer'`, `'ngo'`, `'admin'`
- Only one admin document can exist (partial unique index on `role:'admin'`)

### Profile Completeness Rules

Enforced at the application layer (`utils/profileCompleteness.js`), not at the schema level:

| Role | Required for completeness |
|---|---|
| `volunteer` | `locations.primary.city`, `locations.primary.state`, `skills` (min 1) |
| `ngo` | `locations.primary.city`, `locations.primary.state`, `wasteTypes` (min 1) |
| `admin` | No completeness requirement |

---

## 3. Collection: `otps`

**Mongoose Model:** `Otp`  
**File:** `Backend/models/otp.model.js`

### Schema

```
otps
├── _id             ObjectId            [auto]
├── email           String              required, lowercase, trim, index
├── otp             String              required, bcrypt-hashed OTP code
├── purpose         String              enum['verify','forgot-password','change-password']
├── payload         Mixed               null (other purposes) or pending registration data (verify)
├── createdAt       Date                default:Date.now
├── otpExpiresAt    Date                required — 10-minute validity window
├── attempts        Number              default:0 — failed verification attempts
└── expireAt        Date                required — TTL index target
```

### Indexes

```javascript
{ email: 1 }                              // fast lookup
{ email: 1, purpose: 1 }, { unique: true } // one OTP per email per purpose
{ expireAt: 1 }, { expireAfterSeconds: 0 } // TTL auto-delete
```

### Two Expiry Concepts

| Field | Purpose | Set By |
|---|---|---|
| `otpExpiresAt` | Application-layer 10-minute code validity window | `utils/issueOtp.js` |
| `expireAt` | When MongoDB TTL index deletes the document | `utils/issueOtp.js` |

**For `verify` OTPs:** `expireAt` is set further in the future than `otpExpiresAt` so the registration `payload` survives past the first code window (enabling `resendOtp()` to work after the initial code expires).

**For all other OTPs:** `expireAt === otpExpiresAt` — document is deleted as soon as the code expires.

### The `payload` Field

For `purpose: 'verify'` — stores the pending registration data:

```json
{
  "name": "Asha Rao",
  "username": "asharao",
  "hashedPassword": "$2a$10$...",
  "role": "volunteer"
}
```

> The password stored in `payload.hashedPassword` is **already bcrypt-hashed** by the registration controller before storage. The User `pre('save')` hook uses `$locals.skipHash = true` to avoid double-hashing.

### Brute Force Protection

- `attempts` is incremented on each failed OTP verification
- After 5 failed attempts: all subsequent verifications for that OTP are blocked (locked)
- A fresh `resendOtp()` call resets `attempts` to 0 with the new code

---

## 4. Collection: `opportunities`

**Mongoose Model:** `Opportunity`  
**File:** `Backend/models/opportunity.model.js`

### Schema

```
opportunities
├── _id             ObjectId            [auto]
├── ngo_id          ObjectId → User     required, index (ownership + queries)
├── title           String              required, maxlength:100, trim
├── description     String              required, trim
├── required_skills [String]            required, min 1 item
├── duration        String              required, trim
├── location        String              required, trim (free text)
├── date            Date                optional, default:null
├── image           String              Cloudinary CDN URL, default:''
├── imagePublicId   String              Cloudinary public_id, default:null
├── status          String              enum['open','in-progress','closed'], default:'open'
├── createdAt       Date                auto (timestamps:true)
└── updatedAt       Date                auto (timestamps:true)
```

### Indexes

```javascript
{ title: 'text', description: 'text' }   // full-text search
{ status: 1, createdAt: -1 }            // status filter + newest sort
{ date: 1, createdAt: -1 }             // upcoming events sort
```

### Field Notes

- `location` is **free text**, not structured — opportunity-volunteer matching uses regex word-boundary search against this field
- `image` stores the Cloudinary CDN `secure_url` (HTTPS)
- `imagePublicId` stores the Cloudinary `public_id` needed to delete the asset when the opportunity is deleted or its image updated
- `required_skills` is an array of strings — matching is case-insensitive

---

## 5. Collection: `applications`

**Mongoose Model:** `Application`  
**File:** `Backend/models/application.model.js`

### Schema

```
applications
├── _id             ObjectId            [auto]
├── opportunity_id  ObjectId → Opportunity  required, index
├── volunteer_id    ObjectId → User         required, index
├── status          String              enum['pending','accepted','rejected'], default:'pending'
├── createdAt       Date                auto (timestamps:true)
└── updatedAt       Date                auto (timestamps:true)
```

### Indexes

```javascript
{ opportunity_id: 1 }                              // filter by opportunity
{ volunteer_id: 1 }                                // filter by volunteer
{ opportunity_id: 1, volunteer_id: 1 }, { unique: true }  // prevent duplicate applications
```

### Business Rules

- A volunteer can only have one application per opportunity (enforced at DB level by unique compound index)
- Once `status` transitions from `pending` to `accepted` or `rejected`, it cannot be changed again (enforced at application layer)
- Volunteers can only withdraw `pending` applications (application layer)

---

## 6. Collection: `pickups`

**Mongoose Model:** `Pickup`  
**File:** `Backend/models/pickup.model.js`

### Schema

```
pickups
├── _id                         ObjectId            [auto]
├── user_id                     ObjectId → User     required, index (volunteer owner)
├── agent_id                    ObjectId → User     default:null, index (assigned NGO)
├── address
│   ├── area                    String              optional, trim
│   └── city                    String              required, trim
├── scheduledDate               Date                required
├── preferredTimeSlot
│   ├── start                   String              required (HH:mm)
│   └── end                     String              required (HH:mm)
├── wasteTypes                  [String]            optional
├── notes                       String              optional, maxlength:500
├── status                      String              enum[PICKUP_STATUSES], default:'Pending'
├── completedAt                 Date                default:null
├── createdAt                   Date                auto (timestamps:true)
└── updatedAt                   Date                auto (timestamps:true)
```

### Status Values

```javascript
const PICKUP_STATUSES = ['Pending', 'Assigned', 'Completed', 'Cancelled'];
```

### Status Transition Map

```
General (ALLOWED_TRANSITIONS):
  Pending   → Assigned  | Cancelled
  Assigned  → Completed | Cancelled
  Completed → (terminal)
  Cancelled → (terminal)

NGO-Only (NGO_ALLOWED_TRANSITIONS):
  Pending   → Assigned           // NGO claims a matching pickup
  Assigned  → Completed | Cancelled  // NGO finishes or cancels their claimed pickup
  (NGOs cannot transition Pending → Cancelled — that's volunteer-only via /cancel)
```

### Instance Methods

```javascript
pickup.canTransitionTo(nextStatus)    // checks ALLOWED_TRANSITIONS
pickup.canNgoTransitionTo(nextStatus) // checks NGO_ALLOWED_TRANSITIONS
```

### Static Properties

```javascript
Pickup.STATUSES                    // ['Pending', 'Assigned', 'Completed', 'Cancelled']
Pickup.ALLOWED_TRANSITIONS         // full transition map
Pickup.NGO_ALLOWED_TRANSITIONS     // NGO-only transition map
```

### Indexes

```javascript
{ user_id: 1, createdAt: -1 }                     // volunteer's pickup history
{ agent_id: 1, status: 1, scheduledDate: 1 }      // NGO's assigned pickups
{ status: 1, 'address.city': 1, scheduledDate: 1 } // NGO discovery feed
{ wasteTypes: 1 }                                  // multikey for $in matching
```

### Atomic Operations

All status transitions use `findOneAndUpdate` with a filter that re-asserts the expected current state, preventing double-claim race conditions:

```javascript
// Claim (Pending → Assigned)
Pickup.findOneAndUpdate(
  { _id: pickupId, status: 'Pending' },
  { status: 'Assigned', agent_id: ngoId },
  { new: true }
)

// Complete/Cancel (Assigned → * by assigned NGO)
Pickup.findOneAndUpdate(
  { _id: pickupId, status: 'Assigned', agent_id: ngoId },
  { status: nextStatus, completedAt: new Date() /* if Completed */ },
  { new: true }
)

// Volunteer cancel (Pending → Cancelled)
Pickup.findOneAndUpdate(
  { _id: pickupId, status: 'Pending', user_id: volunteerId },
  { status: 'Cancelled' },
  { new: true }
)

// Volunteer delete (Pending only)
Pickup.findOneAndDelete(
  { _id: pickupId, status: 'Pending', user_id: volunteerId }
)
```

**Return `null`** → document changed between read and write (another actor won the race) → controller returns HTTP 409.

---

## 7. Collection: `messages`

**Mongoose Model:** `Message`  
**File:** `Backend/models/message.model.js`

### Schema

```
messages
├── _id             ObjectId            [auto]
├── sender_id       ObjectId → User     required
├── receiver_id     ObjectId → User     required
├── conversation_id String              required — deterministic: sort([idA,idB]).join('_')
├── content         String              required — AES-256-GCM CIPHERTEXT (hex-encoded)
├── iv              String              required — Initialization Vector (hex, 12 bytes)
├── authTag         String              required — GCM Auth Tag (hex)
├── status          String              enum['sent','delivered','read'], default:'sent'
├── readAt          Date                optional — set when status transitions to 'read'
├── createdAt       Date                auto (timestamps:true)
└── updatedAt       Date                auto (timestamps:true)
```

### Indexes

```javascript
{ conversation_id: 1, createdAt: -1 }   // primary: fetch conversation history
{ sender_id: 1, createdAt: -1 }        // sender-scoped queries
{ receiver_id: 1, createdAt: -1 }      // receiver-scoped queries
```

### Encryption

- `content` is **never** stored as plaintext
- Each message is encrypted with a **unique random IV** (12 bytes, 96 bits)
- Encryption uses `AES-256-GCM` (Node.js `crypto` module)
- The 32-byte key comes from `CHAT_ENCRYPTION_KEY` (64-char hex string in `.env`)
- `iv` and `authTag` are required for decryption — they are **stripped from all API responses** to prevent frontend exposure

### Conversation ID Algorithm

```javascript
buildConversationId(id1, id2) = [id1.toString(), id2.toString()].sort().join('_')
```

Single source of truth in `sockets/rooms.js`. `message.service.js` imports it from there.

### Messaging Role Restriction

- Only `volunteer ↔ ngo` pairs are allowed
- `volunteer ↔ volunteer` → rejected with error
- `ngo ↔ ngo` → rejected with error
- Enforced in `messageService.createMessage()` (application layer)

---

## 8. Collection: `notifications`

**Mongoose Model:** `Notification`  
**File:** `Backend/models/notification.model.js`

### Schema

```
notifications
├── _id             ObjectId            [auto]
├── user_id         ObjectId → User     required
├── type            String              enum['message','opportunity_match','pickup_match']
├── message         String              required — AES-256-GCM CIPHERTEXT (hex-encoded)
├── iv              String              required — Initialization Vector (hex)
├── authTag         String              required — GCM Auth Tag (hex)
├── reference_id    Mixed               null | ObjectId | String conversation_id
├── isRead          Boolean             default:false
├── createdAt       Date                auto (timestamps:true)
└── updatedAt       Date                auto (timestamps:true)
```

### Indexes

```javascript
{ user_id: 1, isRead: 1, createdAt: -1 }   // unread count + sorted feed
```

### `reference_id` Type

`Mixed` (not `ObjectId`) because:
- `message` type notifications use a **string** conversation ID (e.g., `6801abc..._6802def...`)
- `opportunity_match` and `pickup_match` types use a **MongoDB ObjectId**

`Mixed` accepts both without casting errors.

### Notification Types and Their `reference_id`

| `type` | `reference_id` | Navigate To |
|---|---|---|
| `message` | `String` — `conversationId` | `/messages?with={otherUserId}` |
| `opportunity_match` | `ObjectId` — `opportunity._id` | `/opportunities/{id}` |
| `pickup_match` | `ObjectId` — `pickup._id` | `/pickups/available` |

### Encryption

Same as messages — `message` field stores AES-256-GCM ciphertext. All API responses and socket events return decrypted plaintext. `iv` and `authTag` are always stripped.

---

## 9. Index Summary

| Collection | Index | Type | Purpose |
|---|---|---|---|
| users | `{username: 1}` | Unique | Fast login by username |
| users | `{email: 1}` | Unique | Fast login/OTP lookup |
| users | `{role: 1}` partial | Partial Unique | Single admin enforcement |
| otps | `{email: 1}` | Standard | Fast OTP lookup |
| otps | `{email: 1, purpose: 1}` | Unique | One OTP per purpose per email |
| otps | `{expireAt: 1}` | TTL | Auto-delete expired OTPs |
| opportunities | `{title, description}` | Text | Full-text search |
| opportunities | `{status, createdAt}` | Compound | Status filter + sort |
| opportunities | `{date, createdAt}` | Compound | Date sort |
| applications | `{opportunity_id, volunteer_id}` | Unique | Prevent duplicate applications |
| pickups | `{user_id, createdAt}` | Compound | Volunteer history |
| pickups | `{agent_id, status, scheduledDate}` | Compound | NGO assigned view |
| pickups | `{status, 'address.city', scheduledDate}` | Compound | NGO discovery feed |
| pickups | `{wasteTypes}` | Multikey | Waste type matching |
| messages | `{conversation_id, createdAt}` | Compound | Conversation history |
| messages | `{sender_id, createdAt}` | Compound | Sender queries |
| messages | `{receiver_id, createdAt}` | Compound | Receiver queries |
| notifications | `{user_id, isRead, createdAt}` | Compound | Notification feed + badge |

---

## 10. Data Flow Diagrams

### Registration Flow (OTP-Gated)

```
POST /api/auth/register
  → Validate input
  → Hash password (bcrypt)
  → upsert Otp { email, purpose:'verify', payload:{name,username,hashedPwd,role}, expireAt }
  → Send OTP email
  → return 200 (user NOT created yet)

POST /api/auth/verify-otp
  → Find Otp { email, purpose:'verify' }
  → Check attempts < MAX; check otpExpiresAt not past; bcrypt.compare(otp, stored)
  → Success: extract payload from Otp → create User { ...payload, $locals.skipHash:true }
  → Delete Otp document
  → return 201 (user created)
```

### Message Flow (Socket.IO)

```
socket.emit('message:send', { receiverId, content })
  → Validate payload
  → Check rate limit (20/10s)
  → messageService.createMessage({ sender_id, sender_role, receiver_id, content })
      → Fetch receiver (check role)
      → Enforce Volunteer↔NGO rule
      → encrypt(content) → { encryptedData, iv, authTag }
      → Message.create({ sender_id, receiver_id, content:encryptedData, iv, authTag, conversation_id })
      → return { ...messageDoc, content:plaintext, iv:undefined, authTag:undefined }
  → io.to('user:{receiverId}').emit('message:new', decryptedMessage)
  → ack({ success:true, data:decryptedMessage })
  → notificationService.dispatch({ user_id:receiverId, type:'message', message:'New message from...' })
      → encrypt(plaintext) → { encryptedData, iv, authTag }
      → Notification.create({ user_id, type, message:ciphertext, iv, authTag, reference_id:conversationId })
      → io.to('user:{receiverId}').emit('notification:new', { ...notif, message:plaintext })
```

### Pickup Matching Flow

```
POST /api/pickups (Volunteer creates pickup)
  → pickupService.createPickup(volunteerId, body)
  → matchingService.notifyMatchedNgos(pickup) [fire-and-forget]
      → User.find({ role:'ngo', wasteTypes:{$exists:true, $not:{$size:0}} })
      → For each NGO: isNgoEligibleForPickup(ngo, pickup)
          → ngo.locations.primary.city ∈ ngo cities (case-insensitive)
          → ngo.wasteTypes ∩ pickup.wasteTypes ≠ ∅
      → For each eligible NGO: notificationService.dispatch({ type:'pickup_match', ... })
```

---

## 11. Security Notes

### Password Security

- bcrypt cost factor: 10
- Never returned in queries (`select: false`)
- Double-hashing prevented by `$locals.skipHash = true` in atomic registration flow

### OTP Security

- bcrypt-hashed in database (same algorithm as passwords)
- 10-minute expiry window enforced at application layer (`otpExpiresAt`)
- Maximum 5 verification attempts before lockout
- Enumeration-safe: forgot-password always returns success
- TTL index auto-deletes expired OTPs
- Unique compound index prevents OTP accumulation

### Message/Notification Security

- AES-256-GCM encryption with unique per-message random IV
- Authentication tag ensures ciphertext integrity (tamper-detection)
- `iv` and `authTag` never sent to frontend (always stripped before API responses)
- Socket push always uses original plaintext (in-memory at dispatch time)
- MongoDB stores only ciphertext

### Admin Account

- Enforced as single at DB level via partial unique index
- Cannot be `user_id` or `agent_id` on any pickup (pickup workflow excludes admin)
