# Socket.IO Documentation
# WasteZero Real-Time Layer

**Socket.IO Server URL:** `ws://localhost:5001`  
**Socket.IO Version:** ^4.x  
**Transport:** WebSocket (with HTTP long-poll fallback)

---

## Table of Contents

1. [Connection and Authentication](#1-connection-and-authentication)
2. [Room Strategy](#2-room-strategy)
3. [Client → Server Events](#3-client--server-events)
   - [message:send](#31-messagesend)
   - [message:read](#32-messageread)
   - [message:typing](#33-messagetyping)
4. [Server → Client Events](#4-server--client-events)
   - [message:new](#41-messagenew)
   - [message:read](#42-messageread-server-push)
   - [message:typing](#43-messagetyping-server-push)
   - [notification:new](#44-notificationnew)
   - [error](#45-error)
5. [Rate Limiting](#5-rate-limiting)
6. [Error Handling](#6-error-handling)
7. [Connection Lifecycle](#7-connection-lifecycle)
8. [Code Examples](#8-code-examples)
9. [Testing Socket Events](#9-testing-socket-events)

---

## 1. Connection and Authentication

### Authentication Requirement

Every Socket.IO connection **must** be authenticated with a valid JWT token. The server rejects unauthenticated connections before any events are registered.

### How to Authenticate

Pass the JWT in **either** of two ways:

**Method 1 — auth object (recommended):**
```javascript
const socket = io('http://localhost:5001', {
  auth: { token: 'Bearer eyJhbGciOiJIUzI1NiIs...' }
});
```

**Method 2 — query parameter:**
```javascript
const socket = io('http://localhost:5001', {
  query: { token: 'Bearer eyJhbGciOiJIUzI1NiIs...' }
});
```

> Both `socket.handshake.auth.token` and `socket.handshake.query.token` are checked. Use the `auth` object for security.

### What the Server Does at Handshake

1. Extracts the token from `handshake.auth.token` or `handshake.query.token`
2. Verifies the JWT signature with `JWT_SECRET`
3. Re-fetches the user from MongoDB (`.lean()`, no password)
4. Sets `socket.user = { ...user, id: user._id.toString() }`
5. Socket joins `user:{userId}` room
6. Registers `message:send`, `message:read`, `message:typing` event handlers

### Connection Failure Reasons

| Error | Cause |
|---|---|
| `Access denied. No token provided.` | Token missing from both auth and query |
| `Token has expired.` | JWT expired; client must re-authenticate |
| `Invalid token.` | Malformed or tampered JWT |
| `User no longer exists.` | User was deleted after token was issued |
| `Authentication failed.` | Generic auth error |

---

## 2. Room Strategy

### Personal Room

Upon successful connection, every socket automatically joins its user's personal room:

```
user:{userId}
```

**Example:** User with ID `6801fabc...` joins room `user:6801fabc...`

### Why This Matters

- A user with multiple open tabs has multiple sockets — all in the same room
- Any server-to-client push is a single `io.to('user:{id}').emit(...)` call
- No manual socket-ID-to-user-ID bookkeeping required anywhere
- All tabs/devices receive the event simultaneously

### Conversation Room

A `conversation:{conversationId}` room naming convention exists in `rooms.js` but is **not currently used** for active subscriptions. It is reserved for future use.

### Conversation ID Format

```
buildConversationId(id1, id2) = [id1.toString(), id2.toString()].sort().join('_')
```

**Example:**
```
User A: 6801abc...
User B: 6802def...
Conversation ID: 6801abc..._6802def...  (alphabetically sorted)
```

This is deterministic — `A + B` always equals `B + A`.

---

## 3. Client → Server Events

### 3.1 `message:send`

Send a direct message to another user.

**Constraints:**
- Sender role must be `volunteer`, receiver role must be `ngo`, OR sender role `ngo` and receiver `volunteer`
- Content must be 1–2000 characters
- Rate limited: 20 messages per 10 seconds per user

**Payload:**
```javascript
socket.emit('message:send', {
  receiverId: '6802def...',  // MongoDB ObjectId string
  content: 'Hello! We saw your pickup request.'
}, (ack) => {
  // Acknowledgement callback
  if (ack.success) {
    console.log('Message sent:', ack.data);
  } else {
    console.error('Failed:', ack.message);
  }
});
```

**Payload Schema:**

| Field | Type | Required | Constraints |
|---|---|---|---|
| `receiverId` | string | Yes | Valid MongoDB ObjectId |
| `content` | string | Yes | 1–2000 chars, non-empty after trim |

**Acknowledgement (success):**
```json
{
  "success": true,
  "data": {
    "_id": "msg001...",
    "sender_id": "6801abc...",
    "receiver_id": "6802def...",
    "conversation_id": "6801abc..._6802def...",
    "content": "Hello! We saw your pickup request.",
    "status": "sent",
    "createdAt": "2026-07-31T12:00:00.000Z"
  }
}
```

**Acknowledgement (error):**
```json
{
  "success": false,
  "message": "Valid receiverId is required"
}
```

**What Happens After Successful Send:**

1. Message encrypted with AES-256-GCM and saved to MongoDB (`messages` collection)
2. Decrypted `message:new` event emitted to receiver's room
3. Sender receives ack `{success: true, data: message}`
4. Encrypted `message` type notification created for receiver; decrypted `notification:new` pushed to receiver's room

> `iv` and `authTag` are **never** sent to either client. Only plaintext `content` is delivered over WebSocket.

---

### 3.2 `message:read`

Mark all unread messages in a conversation as read.

**Payload:**
```javascript
socket.emit('message:read', {
  conversationId: '6801abc..._6802def...'
}, (ack) => {
  if (ack.success) {
    console.log('Marked as read');
  }
});
```

**Payload Schema:**

| Field | Type | Required | Constraints |
|---|---|---|---|
| `conversationId` | string | Yes | Format: `{id1}_{id2}` where caller is a participant |

**What the Server Does:**

1. Validates that `conversationId` contains exactly two IDs separated by `_`
2. Verifies the caller's user ID is one of the two IDs (participant check)
3. Calls `messageService.markConversationRead(conversationId, socket.user.id)` — bulk-updates all messages where `receiver_id === socket.user.id` and `status !== 'read'` to `{status: 'read', readAt: now}`
4. Finds the other participant's ID
5. Emits `message:read` event to the other participant's room (see §4.2)
6. Acknowledges `{success: true}` to caller

**Acknowledgement (success):** `{ "success": true }`  
**Acknowledgement (error):** `{ "success": false, "message": "You are not a participant in this conversation" }`

---

### 3.3 `message:typing`

Signal to another user that the current user is typing.

**Fire-and-forget** — no acknowledgement, no DB write, no rate limiting.

**Payload:**
```javascript
socket.emit('message:typing', {
  receiverId: '6802def...'
});
```

**Payload Schema:**

| Field | Type | Required | Constraints |
|---|---|---|---|
| `receiverId` | string | Yes | Valid MongoDB ObjectId |

Invalid `receiverId` is silently ignored (no error emitted).

---

## 4. Server → Client Events

The client should listen for these events on the socket instance:

### 4.1 `message:new`

Received when another user sends you a message.

```javascript
socket.on('message:new', (message) => {
  console.log('New message from:', message.sender_id);
  console.log('Content:', message.content);
});
```

**Payload:**
```json
{
  "_id": "msg001...",
  "sender_id": "6802def...",
  "receiver_id": "6801abc...",
  "conversation_id": "6801abc..._6802def...",
  "content": "Hello! We saw your pickup request.",
  "status": "sent",
  "createdAt": "2026-07-31T12:00:00.000Z",
  "updatedAt": "2026-07-31T12:00:00.000Z"
}
```

> `iv` and `authTag` are **never** included. Content is always decrypted plaintext.

---

### 4.2 `message:read` (server push)

Received when the other participant marks your messages as read.

```javascript
socket.on('message:read', ({ conversationId, readerId }) => {
  console.log(`Messages in ${conversationId} read by ${readerId}`);
  // Update UI to show read receipt
});
```

**Payload:**
```json
{
  "conversationId": "6801abc..._6802def...",
  "readerId": "6802def..."
}
```

---

### 4.3 `message:typing` (server push)

Received when the other user in a conversation is typing.

```javascript
socket.on('message:typing', ({ senderId }) => {
  console.log(`${senderId} is typing...`);
  // Show typing indicator; auto-hide after ~3 seconds of no events
});
```

**Payload:**
```json
{
  "senderId": "6802def..."
}
```

> No `conversationId` is included; the UI should infer the active conversation from the sender ID.

---

### 4.4 `notification:new`

Received when a new notification is created for the connected user. Triggered by:
- New direct message received
- New opportunity matches the volunteer's profile
- New pickup matches the NGO's coverage area

```javascript
socket.on('notification:new', (notification) => {
  console.log('Type:', notification.type);
  console.log('Message:', notification.message);
  console.log('Reference:', notification.reference_id);
  // Update notification badge count
});
```

**Payload:**
```json
{
  "_id": "notif001...",
  "user_id": "6801abc...",
  "type": "opportunity_match",
  "message": "New opportunity \"Beach Cleanup\" in Bangalore matches your skills. Apply now!",
  "reference_id": "opp123...",
  "isRead": false,
  "createdAt": "2026-07-31T..."
}
```

| `type` | `reference_id` | Meaning |
|---|---|---|
| `message` | String: `conversationId` | Someone sent you a message |
| `opportunity_match` | ObjectId: opportunity `_id` | New opportunity matches your volunteer profile |
| `pickup_match` | ObjectId: pickup `_id` | New pickup matches NGO's coverage |

> `iv` and `authTag` are **never** included. `message` is always decrypted plaintext.

---

### 4.5 `error`

Received for fire-and-forget events (those without an acknowledgement callback) when an error occurs.

```javascript
socket.on('error', ({ event, message }) => {
  console.error(`Error in event ${event}:`, message);
});
```

**Payload:**
```json
{
  "event": "message:send",
  "message": "You are sending messages too quickly. Please slow down."
}
```

> Most messaging errors are returned via the ack callback. This event is only emitted for fire-and-forget events that failed.

---

## 5. Rate Limiting

The `message:send` event is rate-limited using `rate-limiter-flexible` with in-memory storage.

| Limit | Window | Scope |
|---|---|---|
| 20 messages | 10 seconds | Per user ID (not per socket) |

**When exceeded:**

If the client provides an ack callback:
```json
{
  "success": false,
  "message": "You are sending messages too quickly. Please slow down."
}
```

If no ack callback:
```json
{
  "event": "message:send",
  "message": "You are sending messages too quickly. Please slow down."
}
```

> The rate limiter uses in-memory storage — it resets on server restart and does not scale across multiple Node processes. For multi-instance deployment, replace `RateLimiterMemory` with `RateLimiterRedis`.

---

## 6. Error Handling

### Connection-Level Errors

Handle the `connect_error` event on the client:

```javascript
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error.message);
  // error.message will be one of the auth failure strings from §1
});
```

### Event-Level Errors

For events with an ack callback (`message:send`, `message:read`):
```javascript
socket.emit('message:send', payload, (ack) => {
  if (!ack.success) {
    // Display ack.message to user
  }
});
```

For fire-and-forget events (`message:typing`): errors are silently ignored on the server side for invalid IDs.

---

## 7. Connection Lifecycle

```
Client                              Server

  socket.connect()  ──────────────→  socketAuthMiddleware
                                        jwt.verify(token)
                                        User.findById(decoded.id).lean()
                                        socket.user = { ...user, id }
                                        socket.join('user:{userId}')
                                        registerMessageEvents(io, socket)
  socket.connected = true  ←──────    (connection established)

  socket.emit('message:send')  ───→  assertValidSendPayload
                                        messageLimiter.consume(userId)
                                        messageService.createMessage(...)
                    io.to(receiverRoom).emit('message:new')  ──→  receiver
  ack({success, data})  ←──────────  
                                        notificationService.dispatch(...)
                    io.to(receiverRoom).emit('notification:new')  ──→  receiver

  socket.disconnect()  ───────────→  (socket leaves all rooms automatically)
```

---

## 8. Code Examples

### Angular Service Example (Milestone 3 Frontend)

```typescript
// socket.service.ts
import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;

  connect(token: string): void {
    this.socket = io(environment.socketUrl || 'http://localhost:5001', {
      auth: { token: `Bearer ${token}` }
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });

    this.socket.on('message:new', (message) => {
      // Push to messages signal/store
    });

    this.socket.on('notification:new', (notification) => {
      // Push to notifications signal/store
    });

    this.socket.on('message:typing', ({ senderId }) => {
      // Show typing indicator
    });

    this.socket.on('message:read', ({ conversationId, readerId }) => {
      // Update read receipts
    });
  }

  sendMessage(receiverId: string, content: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('message:send', { receiverId, content }, (ack: any) => {
        ack.success ? resolve(ack.data) : reject(new Error(ack.message));
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

### Node.js Test Client

See `Backend/socket-test.js` and `Backend/socket-test-ngo.js` for working examples of how to connect and send messages using the `socket.io-client` package.

```javascript
// socket-test.js (simplified)
const { io } = require('socket.io-client');

const token = 'Bearer eyJhbGciOiJIUzI1NiIs...';

const socket = io('http://localhost:5001', {
  auth: { token }
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);
  socket.emit('message:send', {
    receiverId: '6802def...',
    content: 'Test message'
  }, (ack) => {
    console.log('Ack:', ack);
  });
});

socket.on('message:new', (msg) => {
  console.log('Received:', msg.content);
});

socket.on('notification:new', (n) => {
  console.log('Notification:', n.message);
});
```

---

## 9. Testing Socket Events

### With Postman

Postman v10+ supports Socket.IO:

1. New → Socket.IO Request → URL: `http://localhost:5001`
2. In "Handshake" → Headers → add `Authorization: Bearer <token>`, **or**
3. In "Handshake" → Auth → set token directly
4. Connect
5. Add event listener: `message:new`, `notification:new`
6. Emit: `message:send` with JSON body `{ "receiverId": "...", "content": "Hello" }`

### With socket-test.js

Run two terminal sessions (one for each user):

```bash
# Terminal 1 — Volunteer
cd Backend
node socket-test.js

# Terminal 2 — NGO
node socket-test-ngo.js
```

### Rate Limit Testing

Emit more than 20 `message:send` events within 10 seconds:

```javascript
for (let i = 0; i < 25; i++) {
  socket.emit('message:send', { receiverId: '...', content: `Message ${i}` }, (ack) => {
    if (!ack.success) console.log(`Message ${i} failed:`, ack.message);
  });
}
// Messages 21-25 should receive: "You are sending messages too quickly."
```
