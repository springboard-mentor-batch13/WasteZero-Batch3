// Backend/server.js

const dotenv = require('dotenv');
dotenv.config();

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

// ===== Socket =====
const { initSocket } = require('./sockets');

// ===== Notification Cleanup =====
const { cleanupExpiredNotifications } = require('./services/notification.service');

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
});