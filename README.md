# 🌱 WasteZero Hub

<div align="center">

![WasteZero Banner](https://img.shields.io/badge/WasteZero-Eco%20Logistics%20%26%20Community%20Platform-2E7D32?style=for-the-badge&logo=leaf&logoColor=white)

**A full-stack, enterprise-grade platform uniting Citizens, NGOs, and Administrators to streamline recyclable waste collection, mobilize environmental volunteers, and measure quantifiable ecological impact.**

[![Node.js Version](https://img.shields.io/badge/Node.js-v18%2B%20%7C%20v20%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-5.x-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![Angular](https://img.shields.io/badge/Angular-21.x-DD0031?style=flat-square&logo=angular&logoColor=white)](https://angular.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas%20%2F%20Mongoose-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8%2B-010101?style=flat-square&logo=socket.io&logoColor=white)](https://socket.io/)
[![License](https://img.shields.io/badge/License-ISC-blue?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [System Architecture](#-system-architecture)
- [Core Modules & Capabilities](#-core-modules--capabilities)
  - [1. User Roles & Role-Based Access Control (RBAC)](#1-user-roles--role-based-access-control-rbac)
  - [2. Recyclable Waste Pickup Logistics](#2-recyclable-waste-pickup-logistics)
  - [3. Volunteering Opportunities & Smart Matching](#3-volunteering-opportunities--smart-matching)
  - [4. Real-Time Encrypted Messaging & Notifications](#4-real-time-encrypted-messaging--notifications)
  - [5. Ecological Analytics & CO₂ Impact Calculation](#5-ecological-analytics--co-impact-calculation)
  - [6. Multi-Format Reporting & Export Engine](#6-multi-format-reporting--export-engine)
  - [7. Platform Governance & Append-Only Audit Logging](#7-platform-governance--append-only-audit-logging)
- [Security & Defensive Engineering](#-security--defensive-engineering)
- [Technology Stack](#-technology-stack)
- [Project Directory Structure](#-project-directory-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup & Environment Configuration](#backend-setup--environment-configuration)
  - [Frontend Setup & Environment Configuration](#frontend-setup--environment-configuration)
  - [First-Time Admin Account Initialization](#first-time-admin-account-initialization)
- [Running Tests & Quality Assurance](#-running-tests--quality-assurance)
- [API Reference Summary](#-api-reference-summary)
- [WebSocket & Real-Time Event Architecture](#-websocket--real-time-event-architecture)
- [Background Workers & Automation](#-background-workers--automation)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌍 Overview

**WasteZero Hub** addresses the fragmentation in municipal and community waste management by bridging the gap between environmentally conscious individuals (**Volunteers**) and waste collection organizations (**NGOs**), governed under a strict platform administration umbrella (**Admins**).

### What WasteZero Delivers:
1. **On-Demand Doorstep Recyclable Pickup Scheduling**: Eliminates uncollected recyclable waste via automated matching and state-machine logistics.
2. **Community Mobilization**: Enables NGOs to publish cleanup/recycling drives and connects volunteers through an intelligent skill- and location-based scoring engine.
3. **Quantifiable CO₂ Impact Measurement**: Translates kilograms of collected materials (*Plastic, Paper, Glass, E-Waste, Organic*) into live carbon offset metrics.
4. **Zero-Trust Platform Governance**: Offers immutable audit trails, tiered rate limiting, data encryption at rest, and automated background maintenance routines.

---

## 🏗 System Architecture

```
                                  +---------------------------------------+
                                  |     Angular 21 Client Application    |
                                  |  (Material 21, Bootstrap, RxJS, Sockets) |
                                  +-------------------+-------------------+
                                                      |
                                       HTTPS / WSS    | REST + Socket.IO
                                                      v
+---------------------------------------------------------------------------------------------------------+
|                                      Express.js 5 Application Server                                    |
|                                                                                                         |
|  +------------------------+  +------------------------+  +-----------------------+  +----------------+  |
|  |     Security Layer     |  |   Authentication/RBAC  |  |  Tiered Rate Limiter  |  | Input Validate |  |
|  | (Helmet, CORS, Crypto) |  | (JWT, Protect, Guards) |  | (Auth, Admin, Export) |  |  (Sanitizers)  |  |
|  +------------------------+  +------------------------+  +-----------------------+  +----------------+  |
|                                                                                                         |
|  +---------------------------------------------------------------------------------------------------+  |
|  |                                         Controllers & Services                                    |  |
|  |  - Auth & Profile Service       - Opportunity & Smart Matching Service                            |  |
|  |  - Pickup Logistics Engine      - Application Review Flow                                         |  |
|  |  - Real-Time Messaging Engine   - Analytics & CO₂ Calculator Engine                               |  |
|  |  - Report Generator (CSV/XLSX/PDF) - Governance & Append-Only Audit Logger                           |  |
|  +---------------------------------------------------------------------------------------------------+  |
|                                                                                                         |
|  +---------------------------------------------------------------------------------------------------+  |
|  |                                        Background Workers                                         |  |
|  |  - Missed Pickup Sweep (15m interval + MongoDB Distributed SweepLock)                              |  |
|  |  - Expired Read Notifications Cleanup (Hourly TTL job)                                            |  |
|  +---------------------------------------------------------------------------------------------------+  |
+-------------------+---------------------+--------------------+--------------------+---------------------+
                    |                     |                    |                    |
                    v                     v                    v                    v
         +--------------------+  +------------------+  +---------------+  +-------------------+
         |  MongoDB Database  |  |  Cloudinary API  |  |  SMTP Server  |  |  Socket.IO Server |
         | (TTL, Index, Aggs) |  | (Media Storage)  |  | (OTP Emails)  |  |  (Rooms & Events) |
         +--------------------+  +------------------+  +---------------+  +-------------------+
```

---

## 🌟 Core Modules & Capabilities

### 1. User Roles & Role-Based Access Control (RBAC)

WasteZero implements a multi-tier permission model across three user personas:

| Capability / Resource | Volunteer | NGO | Admin |
|:---|:---:|:---:|:---:|
| **Schedule / Cancel / Reschedule Waste Pickups** | ✅ | ❌ | 👁️ (Monitor & Override) |
| **Claim & Complete Waste Pickups** | ❌ | ✅ | 👁️ (Monitor & Force Status) |
| **Create & Manage Cleanup Opportunities** | ❌ | ✅ | 🛡️ (Moderate / Restore) |
| **Apply for Volunteer Opportunities** | ✅ | ❌ | ❌ |
| **Review & Accept / Reject Applications** | ❌ | ✅ | 👁️ (Read All) |
| **Direct 1-on-1 Encrypted Messaging** | ✅ | ✅ | ❌ (Support Only) |
| **Personal Dashboard & Leaderboard** | ✅ | ✅ | 📊 (Platform-Wide Analytics) |
| **Self-Service Reports (CSV / XLSX / PDF)** | ✅ (Own Data) | ✅ (Org Data) | ✅ (Platform Full Data) |
| **User Suspension / Role Management** | ❌ | ❌ | ✅ (With Auto Socket Kick) |
| **Access Append-Only Audit Logs** | ❌ | ❌ | ✅ (Read-Only) |

---

### 2. Recyclable Waste Pickup Logistics

A state-machine engine managing the full lifecycle of recyclable waste pickups:

```
  [ Volunteer Schedules ]
             │
             ▼
        ( Pending ) ──( Volunteer Cancels / Edits )──> [ Cancelled ]
             │
             ├──( NGO Claims )──> ( Assigned ) ──( NGO Completes )──> [ Completed ] ──> +WasteStats Record
             │                         │                                                    (CO₂ Calculated)
             │                         └──( NGO/Volunteer Cancels )──> [ Cancelled ]
             │
             ▼ (Preferred time slot end passes without completion)
        [ Missed ] ──( Automated Sweep Worker detects cutoff )
             │
             └──( Volunteer Reschedules — max 2 times )──> ( Pending )
```

- **Supported Categories:** `Plastic`, `Paper`, `Glass`, `E-Waste`, `Organic`.
- **Dynamic Matching:** NGOs automatically discover pending pickups filtered by matching city and the specific waste streams their facility accepts.
- **Rescheduling Resilience:** Missed pickups can be rescheduled up to 2 times by the owner before requiring fresh booking.
- **Fail-Safe Background Sweep:** Automated cron-style worker marks overdue items as `Missed` and dispatches alerts to both parties.

---

### 3. Volunteering Opportunities & Smart Matching

- **Drive Creation:** NGOs publish drives with rich descriptions, requirements, location coordinates/address, date ranges, and cover images uploaded directly to Cloudinary.
- **Smart Opportunity Matcher (`matching.service.js`):**
  - Evaluates volunteer skill overlap against required drive competencies.
  - Computes location proximity (City and Country alignment).
  - Generates ranked match scores to recommend the most relevant drives on the volunteer feed.
- **Application Management:** Volunteers can submit applications with personal notes, track real-time application status, or withdraw before decisions are made.

---

### 4. Real-Time Encrypted Messaging & Notifications

- **End-to-End Database Encryption:** Direct chat messages and sensitive notifications are encrypted at rest using **AES-256-GCM** with authentication tags (`CHAT_ENCRYPTION_KEY`).
- **Live WebSocket Channels:** Instant delivery of direct messages, typing status indicators, and notification badges using dedicated user rooms (`user:<userId>`).
- **Self-Cleaning Notification Center:**
  - Automated background cleaner removes read notifications where `readAt + 24 hours` has elapsed.
  - Unread notifications are retained permanently until acknowledged.

---

### 5. Ecological Analytics & CO₂ Impact Calculation

The built-in environmental calculator transforms raw weight data into verified carbon offset equivalents:

$$\text{CO}_2\text{ Saved (kg)} = \sum \left( \text{Weight of Material (kg)} \times \text{Emission Factor} \right)$$

*Emission Factors configured in `constants/wasteTypes.js`:*
- **Plastic:** $1.50\text{ kg CO}_2\text{e / kg}$
- **Paper:** $0.90\text{ kg CO}_2\text{e / kg}$
- **Glass:** $0.30\text{ kg CO}_2\text{e / kg}$
- **E-Waste:** $2.50\text{ kg CO}_2\text{e / kg}$
- **Organic:** $0.50\text{ kg CO}_2\text{e / kg}$

Interactive charts display **Yearly Aggregations**, **Monthly Comparisons**, **Weekly Run-Rates**, and **Daily Trends**, complemented by community **Leaderboard Rankings**.

---

### 6. Multi-Format Reporting & Export Engine

A multi-tier reporting system offering interactive previews and on-demand file generation:

```
[ Frontend Filter Selection ] ──> [ GET /browse/:type (Paginated JSON Table) ]
                                                │
                                                ▼ (Admin / User Confirms)
                                  [ GET /download/:type?format=csv|xlsx|pdf ]
                                                │
                        ┌───────────────────────┼───────────────────────┐
                        ▼                       ▼                       ▼
                  [ CSV Stream ]        [ Styled ExcelJS ]       [ PDFKit Document ]
                  (Fast / Light)        (Auto-width cells,       (Branded headers,
                                         Color highlights,        Summary cards,
                                         Calculated sums)         Paginated tables)
```

- **Volunteer Reports:** My Applications, My Pickup Contributions.
- **NGO Reports:** Hosted Opportunities, Volunteer Applications Received, Handled Pickups.
- **Admin Reports:** Comprehensive Users Register, Platform Pickups, Opportunities Directory, Applications Overview, and Full Platform Activity Master Logs.

---

### 7. Platform Governance & Append-Only Audit Logging

- **User Lifecycle Governance:** Admins can search, filter, promote/demote roles (with safeguards preventing the demotion of the last remaining admin), and suspend malicious accounts.
- **Instant Revocation:** Account suspension immediately dispatches an `account:suspended` WebSocket event and severs all active client sockets.
- **Opportunity Content Moderation:** Soft-delete (`isRemovedByAdmin`) and atomic restoration of community drives.
- **Append-Only Audit Ledger:** Immutable `AdminLog` collection capturing actor ID, target resource, before/after JSON diffs, IP address, user agent, and timestamp.

---

## 🔒 Security & Defensive Engineering

WasteZero is architected with strict defensive programming practices:

1. **Tiered Rate Limiting:**
   - `loginLimiter` & `otpLimiter`: 10 requests / 10 minutes (prevents brute-force credential and OTP guessing).
   - `generalLimiter`: 100 requests / 15 minutes for standard read/write APIs.
   - `adminLimiter`: 5 requests / 1 minute (shields sensitive admin mutations).
   - `reportRateLimiter`: 5–10 downloads / hour (protects server memory during PDF/XLSX generation).
2. **Cryptographic Protection:**
   - Passwords hashed with `bcryptjs` (salt factor 10).
   - AES-256-GCM symmetric encryption at rest for messages & notifications.
   - Fast-fail environment validator (`config/env.js`) ensuring JWT secret has $\ge 32$ characters and chat encryption key has 64 hex characters.
3. **NoSQL & ReDoS Mitigation:**
   - Whitelisted sort fields and query keys.
   - Sanitized, regex-escaped text search strings preventing catastrophic backtracking.
   - Strictly controlled database projection to exclude password hashes.
4. **Concurrency & Distributed Safety:**
   - Background pickup sweep uses an atomic MongoDB `SweepLock` with TTL expiration to prevent double-execution across clustered server instances.
   - OTP records leverage native MongoDB TTL indexes for automated 10-minute expiry.

---

## 💻 Technology Stack

### Frontend (Client-Side)
- **Framework:** [Angular 21](https://angular.dev/) (Standalone Components, Signals, Reactive Architecture)
- **Language:** [TypeScript 5.9](https://www.typescriptlang.org/)
- **UI Components & Styling:** [Angular Material 21](https://material.angular.dev/), [Bootstrap 5.3](https://getbootstrap.com/), Vanilla CSS / SCSS Design Tokens
- **Real-Time Client:** [Socket.IO Client 4.8](https://socket.io/docs/v4/client-api/)
- **Reactive State & Streams:** [RxJS 7.8](https://rxjs.dev/)
- **Unit & Component Testing:** [Vitest](https://vitest.dev/) / [JSDOM](https://github.com/jsdom/jsdom)

### Backend (Server-Side)
- **Runtime & Server:** [Node.js](https://nodejs.org/) & [Express.js 5](https://expressjs.com/)
- **Database & ODM:** [MongoDB](https://www.mongodb.com/) via [Mongoose 9](https://mongoosejs.com/)
- **Real-Time Engine:** [Socket.IO 4.8](https://socket.io/)
- **Security & Headers:** [Helmet](https://helmetjs.github.io/), [CORS](https://github.com/expressjs/cors), [bcryptjs](https://github.com/dcodeIO/bcrypt.js)
- **File Uploads & Cloud Media:** [Multer 2](https://github.com/expressjs/multer) & [Cloudinary SDK 2](https://cloudinary.com/)
- **Report Generation:** [ExcelJS 4.4](https://github.com/exceljs/exceljs), [PDFKit 0.19](https://pdfkit.org/)
- **Email Delivery:** [Nodemailer 9](https://nodemailer.com/)
- **Validation & Rate Limiting:** [express-validator 7](https://express-validator.github.io/), [express-rate-limit 8](https://github.com/express-rate-limit/express-rate-limit), [rate-limiter-flexible 11](https://github.com/animir/node-rate-limiter-flexible)
- **Testing Framework:** [Jest 29](https://jestjs.io/), [Supertest 7](https://github.com/ladjs/supertest), [cross-env](https://github.com/kentcdodds/cross-env)

---

## 📁 Project Directory Structure

```
HUB/
├── .gitignore                     # Monorepo root git exclusion rules
├── README.md                      # Comprehensive project documentation
│
├── Backend/                       # Express.js REST API & WebSocket Server
│   ├── config/                    # DB connection, CORS, and env variable validation
│   ├── constants/                 # Waste types, emission factors, and statuses
│   ├── controllers/               # HTTP request handlers
│   │   ├── admin.controller.js
│   │   ├── application.controllers.js
│   │   ├── audit.controller.js
│   │   ├── auth.controllers.js
│   │   ├── dashboard.controller.js
│   │   ├── match.controller.js
│   │   ├── message.controller.js
│   │   ├── ngoReport.controller.js
│   │   ├── notification.controller.js
│   │   ├── opportunity.controllers.js
│   │   ├── pickup.controllers.js
│   │   ├── report.controller.js
│   │   ├── users.controllers.js
│   │   └── volunteerReport.controller.js
│   ├── docs/                      # Admin API specification and milestone contracts
│   ├── middlewares/               # Auth, RBAC, Rate Limiting, Error handling, Multer
│   ├── models/                    # Mongoose Schemas (User, Pickup, Opportunity, WasteStats, etc.)
│   ├── routes/                    # Express Router definitions
│   ├── services/                  # Business logic & aggregation pipelines
│   │   ├── analytics.service.js   # Heavy MongoDB aggregations & trend calculation
│   │   ├── matching.service.js    # Volunteer ↔ Opportunity scoring algorithm
│   │   ├── pickup.sweep.js        # Background missed pickup cron worker
│   │   ├── report.service.js      # Multi-format streaming exporter (CSV, XLSX, PDF)
│   │   └── ...
│   ├── sockets/                   # WebSocket handlers, user rooms, event bridges
│   ├── tests/                     # Jest & Supertest automated integration test suite
│   ├── utils/                     # AES-256 crypto, CO₂ calculators, PDF/Excel formatters
│   ├── validations/               # express-validator schema rules
│   ├── .env.example               # Backend environment variable template
│   ├── package.json
│   └── server.js                  # Application entry point & worker scheduler
│
└── Frontend/                      # Angular 21 Single Page Application (SPA)
    ├── angular.json               # Angular CLI configuration
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.html
        ├── main.ts                # Angular bootstrap entry
        ├── styles.css             # Global tokens, themes, and utility classes
        ├── environments/          # Environment endpoints (API & Socket URLs)
        └── app/
            ├── app.config.ts      # Providers, animations, HTTP interceptors
            ├── app.routes.ts      # Top-level routing & role guards
            ├── core/              # Singleton services, route guards, TypeScript interfaces
            │   ├── guards/        # authGuard, adminGuard, ngoGuard, volunteerGuard
            │   ├── models/        # Data models for User, Pickup, Opportunity, Reports
            │   └── services/      # ApiService, AuthService, SocketService, ThemeService
            └── features/          # Feature modules with dedicated UI components
                ├── admin/         # Admin Management Panel & Governance
                ├── applications/  # Volunteer applications & NGO review
                ├── auth/          # Login, Register, OTP verification, Password Reset
                ├── change-password/
                ├── dashboard/     # Role-based dashboards, trends & leaderboard
                ├── faq/           # Frequently asked questions & help guide
                ├── layout/        # Navbar, Sidebar, Notification dropdown shell
                ├── messages/      # Real-time encrypted 1-on-1 chat
                ├── opportunities/ # Drive discovery, detailed view, creation form
                ├── pickups/       # Pickup scheduling, NGO management, Admin monitor
                ├── profile/       # User profile editor & Avatar upload
                ├── reports/       # Interactive preview table & file export page
                └── settings/      # System & notification preferences
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your local environment:
- **Node.js**: `v18.x` or `v20.x` LTS (Check with `node -v`)
- **npm**: `v9.x` or `v10.x` (Check with `npm -v`)
- **MongoDB**: Local MongoDB instance (`mongodb://localhost:27017`) or a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster connection string.
- **Cloudinary Account**: Free account for media storage credentials ([Cloudinary Dashboard](https://cloudinary.com/)).
- **SMTP Provider**: Gmail App Password or any standard SMTP service for verification emails.

---

### Backend Setup & Environment Configuration

1. **Navigate to the Backend directory:**
   ```bash
   cd Backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy the example file to `.env`:
   ```bash
   cp .env.example .env
   ```

4. **Populate `.env` with your credentials:**
   ```env
   # Server Configuration
   PORT=5001
   NODE_ENV=development
   CLIENT_URL=http://localhost:4200

   # Database Connection
   MONGO_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/wastezero?retryWrites=true&w=majority

   # JWT Secret (Must be >= 32 characters)
   JWT_SECRET=your_super_secret_jwt_key_with_at_least_32_characters
   JWT_EXPIRES_IN=7d

   # Timezone Offset in minutes (e.g., IST = 330, EST = -300)
   APP_TZ_OFFSET_MINUTES=330

   # SMTP / Email Service
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   EMAIL=your_email@gmail.com
   EMAIL_PASS=your_gmail_app_password

   # Cloudinary Media Storage
   CLOUDINARY_CLOUD_NAME=your_cloudinary_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret

   # AES-256-GCM Chat Encryption Key (Exactly 64 hex characters)
   # Generate using: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   CHAT_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

   # First-Admin Initialization Secret (>= 16 characters)
   ADMIN_INIT_SECRET=a_very_secure_random_bootstrap_secret_1234
   ```

5. **Start the Backend Server:**
   ```bash
   # Development mode with Nodemon auto-reload:
   npm run dev

   # Production mode:
   npm start
   ```
   *The backend will boot on `http://localhost:5001`.*

---

### Frontend Setup & Environment Configuration

1. **Navigate to the Frontend directory in a new terminal:**
   ```bash
   cd Frontend
   ```

2. **Install frontend dependencies:**
   ```bash
   npm install
   ```

3. **Verify Environment Endpoints (`src/environments/environment.ts`):**
   ```typescript
   export const environment = {
     production: false,
     apiUrl: 'http://localhost:5001/api',
     socketUrl: 'http://localhost:5001'
   };
   ```

4. **Start the Angular Development Server:**
   ```bash
   npm start
   # or
   ng serve
   ```
   *Open your browser and navigate to `http://localhost:4200`.*

---

### First-Time Admin Account Initialization

WasteZero employs a protected bootstrapping endpoint to create the primary administrator account without manual database edits:

```bash
curl -X POST http://localhost:5001/api/auth/admin/setup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "System Administrator",
    "username": "admin",
    "email": "admin@wastezero.org",
    "password": "StrongAdminPassword123!",
    "adminInitSecret": "a_very_secure_random_bootstrap_secret_1234"
  }'
```

> **Security Note:** Once the first administrator account is created in the database, this endpoint permanently disables itself and rejects any subsequent requests with `403 Forbidden`.

---

## 🧪 Running Tests & Quality Assurance

### Backend Automated Test Suite
The backend contains a suite of unit, integration, and security tests using **Jest** and **Supertest**.

```bash
cd Backend

# Run all test suites
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with code coverage report
npm run test:coverage
```

**What the tests verify:**
- RBAC permissions matrix and route guards.
- Rate limiter thresholds and token replenishment.
- Pickup lifecycle state transitions and background sweep invariants.
- Admin governance, user suspensions, and audit log generation.
- AES-256-GCM symmetric encryption/decryption round-trips.
- Input validation sanitization against ReDoS attacks.

---

## 📡 API Reference Summary

### Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/register` | Public | Register new Volunteer or NGO account |
| `POST` | `/admin/setup` | Secret Gated | Bootstrap primary system administrator |
| `POST` | `/login` | Public | Authenticate user & receive JWT token |
| `POST` | `/verify-otp` | Public | Validate email verification OTP code |
| `POST` | `/resend-otp` | Public | Request a fresh OTP token |
| `POST` | `/forgot-password` | Public | Request password reset token |
| `POST` | `/reset-password` | Public | Submit new password with verification token |

### Users & Profiles (`/api/users`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/profile` | Authenticated | Retrieve authenticated user profile |
| `PUT` | `/profile` | Authenticated | Update user bio, skills, location, and avatar |
| `GET` | `/search` | Authenticated | Cross-role user search directory |
| `GET` | `/settings` | Authenticated | Retrieve user preferences |
| `PUT` | `/settings` | Authenticated | Update theme, email, and notification settings |
| `POST` | `/change-password/send-otp` | Authenticated | Request OTP to change password |
| `PUT` | `/change-password/verify-otp` | Authenticated | Commit password update with OTP |

### Waste Pickups (`/api/pickups`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/` | Volunteer | Schedule a new waste pickup |
| `GET` | `/my-pickups` | Volunteer | Paginated pickup history for volunteer |
| `GET` | `/available` | NGO | Feed of pending pickups matching NGO location |
| `GET` | `/assigned-to-me` | NGO | Pickups currently claimed by the NGO |
| `GET` | `/:id` | Owner / NGO / Admin | Get detailed pickup information |
| `PUT` | `/:id` | Volunteer (Pending) | Modify scheduled pickup details |
| `DELETE` | `/:id` | Volunteer (Pending) | Delete scheduled pickup |
| `PATCH` | `/:id/cancel` | Volunteer (Pending) | Cancel scheduled pickup |
| `PATCH` | `/:id/status` | NGO | Claim, complete, or cancel pickup |
| `PATCH` | `/:id/reschedule` | Volunteer (Missed) | Reschedule missed pickup (max 2 times) |
| `GET` | `/` | Admin | Platform-wide pickup oversight |
| `PUT` | `/admin/:id` | Admin | Administrative pickup data correction |
| `PATCH` | `/admin/:id/status` | Admin | Force pickup status to Completed / Cancelled |
| `DELETE` | `/admin/:id` | Admin | Administrative hard deletion |

### Opportunities & Applications (`/api/opportunities`, `/api/applications`, `/api/matches`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/opportunities` | Authenticated | Browse public volunteering drives |
| `POST` | `/api/opportunities` | NGO / Admin | Create new opportunity with image upload |
| `GET` | `/api/opportunities/:id` | Authenticated | Get opportunity details |
| `PUT` | `/api/opportunities/:id` | Owner / Admin | Update opportunity details |
| `DELETE` | `/api/opportunities/:id` | Owner / Admin | Delete opportunity |
| `GET` | `/api/matches/suggestions` | Volunteer | Get ranked recommendations by skills & geo |
| `POST` | `/api/applications` | Volunteer | Apply for a volunteering opportunity |
| `GET` | `/api/applications/my-applications` | Volunteer | List submitted volunteer applications |
| `GET` | `/api/applications` | NGO / Admin | List applications for hosted opportunities |
| `PUT` | `/api/applications/:id` | NGO / Admin | Accept or reject application |
| `DELETE` | `/api/applications/:id` | Volunteer | Withdraw pending application |

### Real-Time Messaging & Notifications (`/api/messages`, `/api/notifications`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/messages/conversations` | Authenticated | Get user conversation threads |
| `GET` | `/api/messages?with=<userId>` | Authenticated | Retrieve decrypted 1-on-1 chat history |
| `GET` | `/api/notifications` | Authenticated | Fetch active notification feed |
| `GET` | `/api/notifications/unread-count` | Authenticated | Get count of unread notifications |
| `PUT` | `/api/notifications/:id/read` | Authenticated | Mark individual notification as read |
| `PUT` | `/api/notifications/read-all` | Authenticated | Mark all notifications as read |
| `DELETE` | `/api/notifications/clear-all` | Authenticated | Purge all notifications from mailbox |

### Analytics & Dashboards (`/api/v1`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/dashboard/metrics` | Volunteer / NGO | Personal metrics (pickups, CO₂, drives) |
| `GET` | `/api/v1/dashboard/upcoming` | Authenticated | Role-scoped upcoming drives & pickups |
| `GET` | `/api/v1/stats/leaderboard` | Authenticated | Top contributors and caller rank |
| `GET` | `/api/v1/stats/recycling-breakdown` | Authenticated | Material category weight breakdown |
| `GET` | `/api/v1/stats/monthly-trends` | Authenticated | Monthly pickup & weight trends |
| `GET` | `/api/v1/stats/weekly-trends` | Authenticated | Weekly pickup volume distribution |
| `GET` | `/api/v1/stats/daily-trends` | Authenticated | Daily activity metrics |
| `GET` | `/api/v1/stats/co2-factors` | Authenticated | Reference table for CO₂ factors |
| `GET` | `/api/v1/admin/dashboard/stats` | Admin | Platform KPI stats with growth metrics |

### Reports & Data Export (`/api/v1/reports`, `/api/v1/ngo/reports`, `/api/v1/admin/reports`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/reports/browse/:type` | Volunteer | Paginated JSON preview of personal data |
| `GET` | `/api/v1/reports/download/:type` | Volunteer | Download file (`csv`, `xlsx`, `pdf`) |
| `GET` | `/api/v1/ngo/reports/browse/:type` | NGO | Paginated preview of NGO operations |
| `GET` | `/api/v1/ngo/reports/download/:type` | NGO | Download NGO operational report |
| `GET` | `/api/v1/admin/reports/browse/:type` | Admin | Paginated preview across entire platform |
| `GET` | `/api/v1/admin/reports/:type` | Admin | Download platform-wide audit & activity report |

### Admin Governance (`/api/v1/admin`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/users` | Admin | Paginated user management directory |
| `GET` | `/users/:id` | Admin | Detailed user profile and audit info |
| `PATCH` | `/users/:id/suspend` | Admin | Suspend or reactivate user account |
| `PATCH` | `/users/:id/role` | Admin | Change user role (`volunteer`, `ngo`, `admin`) |
| `DELETE` | `/opportunities/:id` | Admin | Moderation soft-delete of opportunity |
| `PATCH` | `/opportunities/:id/restore` | Admin | Restore moderated opportunity |
| `GET` | `/logs` | Admin | Paginated append-only audit trail logs |

---

## ⚡ WebSocket & Real-Time Event Architecture

WasteZero utilizes **Socket.IO** with authenticated handshake middleware. Upon connection, users join a secure personal room: `user:<userId>`.

### Socket Events Summary

| Channel / Event | Direction | Payload Description |
|:---|:---:|:---|
| `message:send` | Client ➔ Server | Send encrypted message to recipient |
| `message:receive` | Server ➔ Client | Deliver new incoming chat message |
| `message:typing` | Bidirectional | Live typing indicator broadcast |
| `notification:new` | Server ➔ Client | Push real-time notification alert |
| `pickup:status_updated` | Server ➔ Client | Alert volunteer when pickup is claimed/completed |
| `account:suspended` | Server ➔ Client | Force UI suspension redirect & disconnect socket |

---

## ⚙️ Background Workers & Automation

The backend runs scheduled background jobs to maintain platform health:

1. **Missed Pickup Sweep Worker (`services/pickup.sweep.js`):**
   - **Frequency:** Every 15 minutes + on server boot.
   - **Logic:** Identifies `Pending` or `Assigned` pickups whose preferred time slot end has elapsed. Transitions status to `Missed` and dispatches notifications.
   - **Concurrency Safe:** Utilizes an atomic `SweepLock` document in MongoDB with a 10-minute lease to prevent race conditions in multi-process setups.
2. **Notification Expiration Cleanup (`services/notification.service.js`):**
   - **Frequency:** Hourly.
   - **Logic:** Deletes notifications where `isRead: true` and `readAt <= (Now - 24 hours)`.

---

## 🤝 Contributing

Contributions make the open-source community an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. **Fork the Project**
2. **Create your Feature Branch:**
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. **Commit your Changes:**
   ```bash
   git commit -m 'feat: Add some AmazingFeature'
   ```
4. **Push to the Branch:**
   ```bash
   git push origin feature/AmazingFeature
   ```
5. **Open a Pull Request**

---

## 📄 License

Distributed under the **ISC License**. See `LICENSE` for more information.

<div align="center">

Made with 💚 for a Cleaner, Greener Earth 🌍

</div>
