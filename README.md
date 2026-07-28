# WasteZero — Responsible Waste Management Platform

A full-stack volunteer management platform that connects NGOs with volunteers for waste management initiatives — covering opportunity discovery, waste pickup requests, skill/location-based matching, and real-time chat and notifications.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Angular 21 (standalone components, signals) |
| Backend | Node.js · Express 5 |
| Database | MongoDB (Mongoose) |
| Real-time | Socket.IO (chat + live notifications) |
| Auth | JWT + OTP via Nodemailer |
| Storage | Cloudinary (image uploads) |
| UI | Angular Material · Bootstrap 5 |

---

## Project Structure

```
Milestone2/
├── Backend/                        # Express REST API + Socket.IO server
│   ├── config/          db.js
│   ├── controllers/
│   ├── middlewares/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── sockets/                    # Socket.IO bootstrap, auth, rooms, events
│   ├── utils/
│   ├── validations/
│   ├── server.js
│   ├── package.json
│   └── .env.example                # ← copy to .env and fill in values
│
├── Frontend_milestone2/
│   └── Frontend/
│       └── waste-zero-frontend/    # Angular application
│           ├── src/
│           │   ├── app/
│           │   │   ├── core/       # guards · models · services
│           │   │   └── features/   # auth · dashboard · opportunities · applications · pickups · matches · messages · profile
│           │   └── environments/
│           └── package.json
│
└── Docs/                           # PRD · TRD · planning documents
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 10
- MongoDB Atlas account
- Cloudinary account

### Backend Setup

```bash
cd Backend
npm install
cp .env.example .env       # fill in your values
node server.js             # or: npx nodemon server.js
```

The API (and Socket.IO server, on the same HTTP server) will start on `http://localhost:5001`.

### Frontend Setup

```bash
cd Frontend
npm install
npm start
```

The app will open on `http://localhost:4200`.

---

## Features

### Volunteer
- Browse and search volunteering opportunities
- Apply to opportunities
- Track application status
- Get ranked opportunity **match suggestions** based on skills + location
- Request a **waste pickup**, edit/cancel it while pending, view pickup history
- **Chat** with NGOs and receive **live notifications** (new messages, opportunity matches)
- Manage profile — including skills and location — and change password

### NGO
- Create, edit, and delete volunteering opportunities
- Upload cover images (Cloudinary)
- Review and accept/reject applications
- Browse **matched pending pickups** in their coverage area (city + waste type) and claim them
- Track pickups they're currently/previously assigned to, and mark them complete or cancelled
- **Chat** with volunteers and receive **live notifications**
- Configure coverage locations and accepted waste types on their profile

### Admin
- All NGO capabilities on any opportunity
- Read-only oversight of every pickup in the system, any status
- User and application oversight

---

## API Overview

| Resource | Base Route | Notes |
|----------|-----------|-------|
| Auth | `/api/auth` | Login/register/OTP — no token required |
| Users | `/api/users` | Profile (incl. skills, locations, waste types) |
| Opportunities | `/api/opportunities` | |
| Applications | `/api/applications` | |
| Pickups | `/api/pickups` | Role-gated by Volunteer / NGO / Admin — see Pickup RBAC below |
| Matches | `/api/matches` | `GET /suggestions` — volunteer's ranked opportunity matches |
| Messages | `/api/messages` | `GET /conversations`, `GET /?with=:userId` |
| Notifications | `/api/notifications` | `GET /`, `PUT /:id/read` |

All routes require a `Bearer <token>` Authorization header (except login/register/forgot-password).

### Pickup Module — Role Access

| Action | Volunteer | NGO | Admin |
|---|---|---|---|
| Create pickup | ✅ (owner only) | ❌ | ❌ |
| View own pickups | ✅ | — | — |
| View pickup by ID | ✅ (own) | ✅ (if assigned) | ✅ (any) |
| View all pickups | ❌ | ❌ | ✅ |
| View matched pending pickups | — | ✅ (`/available`) | — |
| Edit / delete pickup | ✅ (own, Pending only) | ❌ | ❌ |
| Cancel pending pickup | ✅ (own) | ❌ | ❌ |
| Claim pickup | ❌ | ✅ (location + waste type match) | ❌ |
| Complete / cancel assigned pickup | ❌ | ✅ (assigned NGO only) | ❌ |

### Matching Algorithm

`GET /api/matches/suggestions` scores every open opportunity for the logged-in volunteer (+1 per matching skill, +1 for a location match), sorts by score, and returns the top matches — see `Backend/services/matching.service.js`.

New opportunities also proactively notify matching volunteers on creation (push), independent of this pull-based endpoint.

### Real-time (Socket.IO)

| Event | Direction | Purpose |
|---|---|---|
| `message:send` | client → server | Send a chat message (Volunteer ↔ NGO only) |
| `message:new` | server → client | New message pushed to the recipient |
| `message:read` | client → server | Mark a conversation as read |
| `notification:new` | server → client | Live push when a notification is created |

---

## Environment Variables

Copy `Backend/.env.example` to `Backend/.env` and populate all values. See the example file for descriptions of each variable.

> **Never commit your `.env` file.** It is listed in `.gitignore`.