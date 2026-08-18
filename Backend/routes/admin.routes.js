// Backend/routes/admin.routes.js
//
// Developer A M4 — Admin API Routes
//
// Mounted at: /api/v1/admin
//
// Middleware chain for ALL routes:
//   protect → requireAdmin → adminLimiter → [validation] → controller
//
// RBAC matrix:
//   Anonymous  → 401 (protect)
//   Volunteer  → 403 (requireAdmin)
//   NGO        → 403 (requireAdmin)
//   Admin      → continues
//
// ROUTE INVENTORY:
//   GET    /users                        → list users
//   GET    /users/:id                    → user details
//   PATCH  /users/:id/suspend            → suspend / unsuspend
//   PATCH  /users/:id/role               → change role
//   DELETE /opportunities/:id            → soft-delete (remove)
//   PATCH  /opportunities/:id/restore    → restore removed opportunity
//   GET    /logs                         → audit log retrieval

const express = require('express');
const router = express.Router();

const { protect } = require('../middlewares/auth.middleware');
const { requireAdmin } = require('../middlewares/rbac.middleware');
const { adminLimiter } = require('../middlewares/rateLimiter.middleware');

const adminController    = require('../controllers/admin.controller');
const auditController    = require('../controllers/audit.controller');
const dashboardController = require('../controllers/dashboard.controller');

const {
  validate,
  userIdParam,
  opportunityIdParam,
  userListQueryRules,
  suspendUserRules,
  updateRoleRules,
  removeOpportunityRules,
  restoreOpportunityRules,
  auditLogQueryRules,
} = require('../validations/admin.validation');

// ── Global guard — applied to all routes in this router ─────────────────────
// protect verifies JWT and loads a fresh DB user (suspension-aware).
// requireAdmin rejects non-admin roles with 403.
// adminLimiter (5 req/min) prevents admin endpoint abuse.
router.use(protect, requireAdmin, adminLimiter);

// ── Admin Dashboard Stats ───────────────────────────────────────────────────
//
// BUG FIX: These two routes previously lived ONLY in dashboardRoutes
// (mounted at /api/v1). Because their paths start with /admin/, every
// request to them entered adminRoutes first (via app.use('/api/v1/admin',
// adminRoutes)), ran the router-level adminLimiter (+1 token), found no
// matching route, and fell through. dashboardRoutes then matched and ran
// adminLimiter again (+1 more token). Net: 2 tokens per stats call → the
// 5/min budget was exhausted on normal page load before any suspend attempt.
//
// Adding the routes HERE terminates the request inside adminRoutes.
// adminLimiter fires exactly once (via router.use above). No security change.

// GET /api/v1/admin/dashboard/stats
// Platform-wide KPI metrics — designed for 30–60 s polling intervals.
router.get('/dashboard/stats', dashboardController.getAdminDashboardStats);

// GET /api/v1/admin/dashboard/summary-reports
// Summary pie/bar chart data for users, pickups, opportunities, applications.
router.get('/dashboard/summary-reports', dashboardController.getSummaryReports);

// ── User Management ──────────────────────────────────────────────────────────

// GET /api/v1/admin/users
// List users with pagination, search, role filter, suspension filter
router.get(
  '/users',
  userListQueryRules(),
  validate,
  adminController.getUsers
);

// GET /api/v1/admin/users/:id
// Get a single user's details
router.get(
  '/users/:id',
  userIdParam(),
  validate,
  adminController.getUserById
);

// PATCH /api/v1/admin/users/:id/suspend
// Suspend or unsuspend a user
router.patch(
  '/users/:id/suspend',
  userIdParam(),
  suspendUserRules(),
  validate,
  adminController.toggleUserSuspension
);

// PATCH /api/v1/admin/users/:id/role
// Update a user's role
router.patch(
  '/users/:id/role',
  userIdParam(),
  updateRoleRules(),
  validate,
  adminController.updateUserRole
);

// ── Opportunity Moderation ───────────────────────────────────────────────────

// DELETE /api/v1/admin/opportunities/:id
// Admin soft-delete an opportunity
router.delete(
  '/opportunities/:id',
  opportunityIdParam(),
  removeOpportunityRules(),
  validate,
  adminController.removeOpportunity
);

// PATCH /api/v1/admin/opportunities/:id/restore
// Restore a previously removed opportunity
router.patch(
  '/opportunities/:id/restore',
  opportunityIdParam(),
  restoreOpportunityRules(),
  validate,
  adminController.restoreOpportunity
);

// ── Audit Log Retrieval ──────────────────────────────────────────────────────

// GET /api/v1/admin/logs
// Read-only audit log feed (newest first)
// NOTE: NO PUT/PATCH/DELETE route for logs — AdminLog is append-only
router.get(
  '/logs',
  auditLogQueryRules(),
  validate,
  auditController.getAuditLogs
);

module.exports = router;
