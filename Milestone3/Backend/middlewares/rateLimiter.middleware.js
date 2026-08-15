// Backend/middlewares/rateLimiter.middleware.js

const rateLimit = require('express-rate-limit');

// Login limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
});

// OTP limiter
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10,
  message: {
    success: false,
    message: 'Too many OTP requests. Please try again after 10 minutes.',
  },
});

// General limiter — used on mutation endpoints that don't need OTP-level
// strictness but should still be protected from abuse (e.g. profile updates).
// Also applied to expensive read endpoints: search, filter, conversations,
// messages, notifications, available pickups (P1-04).
const generalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30,
  message: {
    success: false,
    message: 'Too many requests. Please try again after 10 minutes.',
  },
});

// ── M4 Limiters ────────────────────────────────────────────────────────────
// These are defined here now so Developer A and B can import them
// directly when wiring their M4 admin/analytics routes.
// Memory-based store is acceptable for M4 milestone — Redis migration is P3.

// Admin operations limiter (P1-04 / P2 prerequisite)
// Applied to: all admin CRUD endpoints, dashboard stats, audit log queries.
// 5 requests per minute per admin IP.
const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: {
    success: false,
    message: 'Too many admin requests. Please slow down.',
  },
  // Skip counting successful responses? No — count all to prevent enumeration.
});

// Report download limiter (P2 prerequisite — Gate 4 security control)
// Applied to: GET /api/v1/admin/reports/:type
// 5 downloads per hour per admin. Prevents memory exhaustion from
// rapid-fire large report generation.
const reportRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    success: false,
    message: 'Report download limit reached. You may download up to 10 reports per hour.',
  },
});

// Volunteer report download limiter
// Applied to: GET /api/v1/reports/download/:type
// 10 downloads per hour per volunteer — slightly more generous than admin
// since volunteer reports are scoped to their own data only (smaller datasets).
const volunteerReportDlLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    success: false,
    message: 'Report download limit reached. You may download up to 10 reports per hour.',
  },
});

// NGO report download limiter
// Applied to: GET /api/v1/ngo/reports/download/:type
// 10 downloads per hour per NGO — same generosity as the volunteer limiter,
// since NGO reports are scoped to that NGO's own opportunities/applications/pickups.
const ngoReportDlLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    success: false,
    message: 'Report download limit reached. You may download up to 10 reports per hour.',
  },
});

module.exports = {
  loginLimiter,
  otpLimiter,
  generalLimiter,
  adminLimiter,
  reportRateLimiter,
  volunteerReportDlLimiter,
  ngoReportDlLimiter,
};