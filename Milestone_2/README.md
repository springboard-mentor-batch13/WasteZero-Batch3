# WasteZero — Responsible Waste Management Platform

A full-stack volunteer management platform that connects NGOs with volunteers for waste management initiatives.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Angular 21 (standalone components, signals) |
| Backend | Node.js · Express 5 |
| Database | MongoDB (Mongoose) |
| Auth | JWT + OTP via Nodemailer |
| Storage | Cloudinary (image uploads) |
| UI | Angular Material · Bootstrap 5 |

---

## Project Structure

```
Milestone2/
├── Backend/                        # Express REST API
│   ├── config/          db.js
│   ├── controllers/
│   ├── middlewares/
│   ├── models/
│   ├── routes/
│   ├── services/
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
│           │   │   └── features/   # auth · dashboard · opportunities · applications · profile
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

The API will start on `http://localhost:5001`.

### Frontend Setup

```bash
cd Frontend_milestone2/Frontend/waste-zero-frontend
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
- Manage profile and change password

### NGO
- Create, edit, and delete volunteering opportunities
- Upload cover images (Cloudinary)
- Review and accept/reject applications

### Admin
- All NGO capabilities on any opportunity
- User and application oversight

---

## API Overview

| Resource | Base Route |
|----------|-----------|
| Auth | `/api/auth` |
| Users | `/api/users` |
| Opportunities | `/api/opportunities` |
| Applications | `/api/applications` |

All routes require a `Bearer <token>` Authorization header (except login/register/forgot-password).

---

## Environment Variables

Copy `Backend/.env.example` to `Backend/.env` and populate all values. See the example file for descriptions of each variable.

> **Never commit your `.env` file.** It is listed in `.gitignore`.
