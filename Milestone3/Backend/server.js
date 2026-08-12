// Backend/server.js

const dotenv = require('dotenv');
dotenv.config();

// P1-05: Validate all required environment variables before anything else starts.
// Fails fast with a descriptive error instead of silent undefined behaviour.
// CHAT_ENCRYPTION_KEY is validated separately by utils/crypto.js on import.
const { validateEnv } = require('./config/env');
try {
  validateEnv();
} catch (err) {
  console.error('[FATAL] Environment validation failed:', err.message);
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');

const connectDB = require('./config/db');
const resolveCorsOrigin = require('./config/corsOrigin');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/users.routes');
const opportunityRouter = require('./routes/opportunity.routes');
const applicationRoutes = require('./routes/application.routes');
const pickupRoutes = require('./routes/pickup.routes');

// ===== Milestone 3 Routes =====
const matchRoutes = require('./routes/match.routes');
const messageRoutes = require('./routes/message.routes');
const notificationRoutes = require('./routes/notification.routes');

// ===== Milestone 4 Routes =====
const adminRoutes = require('./routes/admin.routes');
const dashboardRoutes = require('./routes/dashboard.routes'); // Developer B — dashboard/analytics/stats
const reportRoutes = require('./routes/report.routes');       // Developer B — report downloads

// ===== Socket =====
const { initSocket } = require('./sockets');

// ===== Notification Cleanup =====
const { cleanupExpiredNotifications } = require('./services/notification.service');

// ===== Pickup Missed-Detection Sweep =====
const { startMissedPickupSweep } = require('./services/pickup.sweep');


const errorHandler = require('./middlewares/error.middleware');
const { verifySmtpConnection } = require('./utils/sendEmail');

const app = express();

// ======================================================
// Security Headers
// ======================================================
app.use(helmet());

// ======================================================
// CORS
// ======================================================
app.use(
  cors({
    origin: resolveCorsOrigin(),
    credentials: true,
  })
);

// ======================================================
// Body Parsers
// ======================================================
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ======================================================
// Database
// ======================================================
connectDB();

// ======================================================
// SMTP Verification
// ======================================================
verifySmtpConnection();

// ======================================================
// API Routes
// ======================================================

app.use('/api/auth', authRoutes);

app.use('/api/users', userRoutes);

app.use('/api/opportunities', opportunityRouter);

app.use('/api/applications', applicationRoutes);

app.use('/api/pickups', pickupRoutes);

// ================= Milestone 3 =================

app.use('/api/matches', matchRoutes);

app.use('/api/messages', messageRoutes);

app.use('/api/notifications', notificationRoutes);

// ================= Milestone 4 =================

// Developer A: Platform Governance & Admin Controls
// All endpoints require Admin role (enforced inside the router via protect + requireAdmin)
app.use('/api/v1/admin', adminRoutes);

// Developer B: Analytics, Dashboard Aggregations & Report Downloads
// dashboardRoutes internally resolves to /api/v1/admin/dashboard/stats,
// /api/v1/dashboard/metrics, and /api/v1/stats/* (see routes/dashboard.routes.js header)
app.use('/api/v1', dashboardRoutes);
app.use('/api/v1/admin/reports', reportRoutes);

// ======================================================
// Health Check
// ======================================================
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'WasteZero API is running.',
  });
});

// ======================================================
// 404 Handler
// ======================================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

// ======================================================
// Global Error Handler
// ======================================================
app.use(errorHandler);

// ======================================================
// HTTP Server + Socket.IO
// ======================================================

const httpServer = http.createServer(app);

initSocket(httpServer);

// ======================================================
// Start Server
// ======================================================

const PORT = process.env.PORT || 5001;

httpServer.listen(PORT, () => {
  console.log(
    `WasteZero API running on port ${PORT} [${
      process.env.NODE_ENV || 'development'
    }]`
  );

  // ── Hourly notification cleanup job ──────────────────────────────────
  // Deletes read notifications where readAt+24h has elapsed.
  // Runs immediately on startup and then every hour thereafter.
  // NEVER deletes unread notifications — the query is hard-scoped to
  // isRead:true && readAt:{$ne:null, $lte:cutoff}.
  const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  const runCleanup = async () => {
    try {
      const deleted = await cleanupExpiredNotifications();
      if (deleted > 0) {
        console.log(`[Notification Cleanup] Deleted ${deleted} expired notification(s).`);
      }
    } catch (err) {
      // Log but never crash the server — cleanup is a maintenance task,
      // not a user-facing operation.
      console.error('[Notification Cleanup] Error during cleanup:', err.message);
    }
  };

  // Immediate run on server start (catches any backlog from downtime)
  runCleanup();

  // Subsequent runs every hour
  setInterval(runCleanup, CLEANUP_INTERVAL_MS);

  // ── Missed-pickup sweep ───────────────────────────────────────────────────
  // Detects Pending/Assigned pickups whose preferredTimeSlot.end has passed
  // and flips them to Missed, then notifies affected parties.
  // Runs immediately on startup (catches anything missed during downtime)
  // and then every 15 minutes.
  //
  // KNOWN LIMITATION: single-process only — needs a distributed lock or a
  // proper scheduler (agenda/bullmq) before horizontal scaling.
  startMissedPickupSweep();
});