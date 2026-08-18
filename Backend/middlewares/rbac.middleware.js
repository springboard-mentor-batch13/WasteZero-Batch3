// Backend/middlewares/rbac.middleware.js
//
// Role-Based Access Control middleware for Developer A M4 admin endpoints.
//
// CONTRACT:
//   All routes using requireAdmin MUST be preceded by protect middleware.
//   protect ensures req.user is a live DB record (not stale JWT claims).
//
// DESIGN:
//   requireAdmin is intentionally NOT a re-implementation of protect or authorize.
//   It is a thin, single-purpose guard that reads from req.user (already DB-fresh)
//   and returns consistent JSON error shapes used across the project.
//
// RBAC matrix (M4 spec §7.1):
//   Anonymous        → 401 (handled by protect before this middleware runs)
//   Volunteer        → 403
//   NGO              → 403
//   Admin            → next()

const requireAdmin = (req, res, next) => {
  // protect middleware MUST run first — if req.user is absent, treat as 401
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.',
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Administrator privileges required.',
    });
  }

  next();
};

// RBAC matrix (personal-dashboard endpoints — e.g. /dashboard/metrics):
//   Anonymous        → 401 (handled by protect before this middleware runs)
//   Volunteer        → next()
//   NGO              → next()
//   Admin            → 403 (admin has no personal volunteer/NGO metrics —
//                          use /admin/dashboard/stats instead)
const blockAdmin = (req, res, next) => {
  // protect middleware MUST run first — if req.user is absent, treat as 401
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.',
    });
  }

  if (req.user.role === 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. This endpoint is not available for administrator accounts. Use /api/v1/admin/dashboard/stats instead.',
    });
  }

  next();
};

module.exports = { requireAdmin, blockAdmin };
