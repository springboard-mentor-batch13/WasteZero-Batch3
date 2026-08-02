# WasteZero — Milestone 3

A full-stack volunteer management platform connecting volunteers, NGOs, and administrators for sustainable waste management initiatives.

---

## Project Structure

```
WasteZero/
├── Backend/          # Node.js + Express REST API + Socket.IO
├── Frontend/         # Angular 21 (zoneless, standalone components)
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Angular 21, TypeScript, Angular Material |
| Backend | Node.js, Express 5, Socket.IO |
| Database | MongoDB Atlas (Mongoose) |
| Auth | JWT + OTP email verification |
| Real-time | Socket.IO (messaging, notifications) |
| File Storage | Cloudinary |

---

## Features

### Milestone 1
- User registration & login (Volunteer / NGO / Admin)
- OTP email verification
- JWT authentication with role-based access
- User profile management

### Milestone 2
- Opportunity creation and management (NGO / Admin)
- Volunteer opportunity discovery and applications
- Application review workflow (NGO)
- Volunteer–opportunity matching engine
- Admin dashboard

### Milestone 3
- **Real-time messaging** — Volunteer ↔ NGO (Socket.IO, AES-256-GCM encrypted)
- **Pickup scheduling** — Volunteer requests, NGO management, Admin monitoring
- **Notification system** — Real-time in-app notifications with type-specific actions
- **Contact NGO flow** — Direct conversation initiation from opportunity pages
- **Username search** — Discover and start new conversations
- Role-based sidebar and route guards

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+
- MongoDB Atlas account (or local MongoDB)
- Cloudinary account (for image uploads)

### Backend Setup

```bash
cd Backend
npm install
cp .env.example .env      # Fill in your credentials
npm start                  # or: npx nodemon server.js
```

### Frontend Setup

```bash
cd Frontend
npm install
npm start                  # Runs on http://localhost:4200
```

---

## Environment Variables

All secrets are managed via `Backend/.env` (never committed).  
See [`Backend/.env.example`](Backend/.env.example) for the full list of required variables.

| Variable | Description |
|----------|-------------|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret key for JWT signing (min 32 chars) |
| `EMAIL` / `EMAIL_PASS` | SMTP credentials for OTP emails |
| `CLOUDINARY_*` | Cloudinary cloud name, API key, secret |
| `CHAT_ENCRYPTION_KEY` | 64-char hex key for AES-256-GCM message encryption |
| `CLIENT_URL` | Frontend origin for CORS (default: `http://localhost:4200`) |

---

## API Overview

| Prefix | Description |
|--------|-------------|
| `POST /api/auth/*` | Registration, login, OTP, password reset |
| `GET/PUT /api/users/*` | Profile, password change, user search |
| `GET/POST/PUT/DELETE /api/opportunities/*` | Opportunity CRUD |
| `GET/POST/PUT /api/applications/*` | Application lifecycle |
| `GET/POST /api/messages/*` | Conversations and message history |
| `GET/POST/PUT /api/pickups/*` | Pickup scheduling and management |
| `GET/POST/PUT /api/notifications/*` | Notification fetch and mark-read |
| `GET /api/match/*` | Volunteer–opportunity matching |

Real-time events are handled over Socket.IO at the same server port.

---

## Role Permissions

| Feature | Volunteer | NGO | Admin |
|---------|-----------|-----|-------|
| Browse opportunities | ✅ | ✅ | ✅ |
| Create opportunities | ❌ | ✅ | ✅ |
| Apply to opportunities | ✅ | ❌ | ❌ |
| Review applications | ❌ | ✅ | ❌ |
| Message (Volunteer ↔ NGO) | ✅ | ✅ | ❌ |
| Schedule pickups | ✅ | ❌ | ❌ |
| Manage pickups | ❌ | ✅ | ❌ |
| Monitor all pickups | ❌ | ❌ | ✅ |
| Admin dashboard | ❌ | ❌ | ✅ |
