// Backend/server.js

const dotenv = require('dotenv');
dotenv.config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');

const connectDB       = require('./config/db');
const authRoutes      = require('./routes/auth.routes');
const userRoutes      = require('./routes/users.routes');
const opportunityRouter = require('./routes/opportunity.routes');
const applicationRoutes = require('./routes/application.routes');
const errorHandler    = require('./middlewares/error.middleware');
const { verifySmtpConnection } = require('./utils/sendEmail');

const app = express();

// ── 1. Security Headers ────────────────────────────────────────────────────
// helmet() sets secure HTTP response headers (X-Content-Type-Options,
// X-Frame-Options, Strict-Transport-Security, etc.)
app.use(helmet());

// ── 2. CORS ────────────────────────────────────────────────────────────────
// Restrict cross-origin requests to the configured Angular client origin.
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

// ── 3. Body Parsers ────────────────────────────────────────────────────────
// 2 MB JSON limit prevents excessive payload attacks.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ── 4. Database Connection ─────────────────────────────────────────────────
connectDB();

// ── 5. SMTP Connection Verification ───────────────────────────────────────
// Verify on startup — logs a warning if misconfigured but never crashes.
verifySmtpConnection();

// ── 6. API Routes ──────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/opportunities', opportunityRouter);
app.use('/api/applications',  applicationRoutes);

// ── 7. Health Check ────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'WasteZero API is running.' });
});

// ── 8. 404 Fallback (unmatched routes) ────────────────────────────────────
// Must come AFTER all route mounts, BEFORE the global error handler.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

// ── 9. Global Error Handler ────────────────────────────────────────────────
// MUST be mounted last — Express identifies 4-arg middleware as error handlers.
app.use(errorHandler);

// ── Start Server ───────────────────────────────────────────────────────────
// PORT defaults to 5001 to match the Angular frontend's environment.ts target.
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`WasteZero API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});
