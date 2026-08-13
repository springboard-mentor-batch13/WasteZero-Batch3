// Backend/controllers/admin.controller.js
//
// Developer A M4 — Admin HTTP Controller
//
// Handles all administrative user management and opportunity moderation endpoints.
// Contains NO business logic — delegates entirely to admin.service.js.
//
// All endpoints require:
//   protect → requireAdmin → adminLimiter → validate → controller
//
// SECURITY INVARIANTS enforced by this layer:
//   - All pagination defaults are set here (page=1, limit=10)
//   - targetUserId is ALWAYS taken from req.params.id (never req.body)
//   - adminId is ALWAYS taken from req.user.id (never req.body)
//   - After suspension, forceDisconnectUser is called non-critically
//   - After every successful mutation, auditService.logAction() is called

const mongoose = require('mongoose');
const adminService = require('../services/admin.service');
const auditService = require('../services/audit.service');
const { forceDisconnectUser } = require('../sockets/adminSocket');
const { sendSuccess, sendError } = require('../utils/apiResponse');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// ── GET /api/v1/admin/users ──────────────────────────────────────────────────

/**
 * @desc    List all users with pagination, search, and filtering
 * @route   GET /api/v1/admin/users
 * @access  Admin only
 */
const getUsers = async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page,  10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const result = await adminService.getUsers({
      page,
      limit,
      search:      req.query.search,
      role:        req.query.role,
      isSuspended: req.query.isSuspended,
      city:        req.query.city,
      sort:        req.query.sort,
      order:       req.query.order,
    });

    return res.status(200).json({
      success: true,
      message: 'Users fetched successfully.',
      results: result.users.length,
      pagination: {
        total:      result.total,
        page:       result.page,
        limit:      result.limit,
        totalPages: result.totalPages,
      },
      data: { users: result.users },
    });
  } catch (error) {
    console.error('[Admin] getUsers error:', error.message);
    return sendError(res, 'Failed to fetch users.', 500);
  }
};

// ── GET /api/v1/admin/users/:id ──────────────────────────────────────────────

/**
 * @desc    Get a single user's details
 * @route   GET /api/v1/admin/users/:id
 * @access  Admin only
 */
const getUserById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 'Invalid user ID.', 400);
    }

    const user = await adminService.getUserById(req.params.id);
    if (!user) {
      return sendError(res, 'User not found.', 404);
    }

    return sendSuccess(res, { user }, 'User details fetched successfully.');
  } catch (error) {
    console.error('[Admin] getUserById error:', error.message);
    return sendError(res, 'Failed to fetch user details.', 500);
  }
};

// ── PATCH /api/v1/admin/users/:id/suspend ────────────────────────────────────

/**
 * @desc    Suspend or unsuspend a user account
 * @route   PATCH /api/v1/admin/users/:id/suspend
 * @access  Admin only
 *
 * Body: { suspend: true|false, reason?: string }
 *
 * SECURITY:
 *   - targetUserId from req.params.id (never req.body)
 *   - adminId from req.user.id (never req.body)
 *   - Audit log generated for every successful mutation
 *   - On suspend: forceDisconnectUser() called to invalidate active sessions
 */
const toggleUserSuspension = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 'Invalid user ID.', 400);
    }

    const targetUserId = req.params.id;
    const adminId      = req.user.id;          // ALWAYS from req.user, not req.body
    const suspend      = req.body.suspend;
    const reason       = req.body.reason;

    let result;
    let action;

    if (suspend) {
      result = await adminService.suspendUser(targetUserId, adminId, reason);
      action = 'USER_SUSPENDED';

      // Force-disconnect the suspended user's active socket sessions.
      // This is a best-effort enhancement — not the sole enforcement mechanism
      // (protect middleware re-checks isSuspended on every HTTP request).
      // The call is intentionally non-blocking.
      try {
        forceDisconnectUser(targetUserId, reason);
      } catch (socketErr) {
        // Socket disconnect failure must NEVER abort the suspension
        console.warn('[Admin] Socket disconnect failed for suspended user:', socketErr.message);
      }
    } else {
      result = await adminService.unsuspendUser(targetUserId, adminId);
      action = 'USER_UNSUSPENDED';
    }

    // Append-only audit log — derived from req, not req.body (non-blocking)
    auditService.logAction({
      adminId,
      action,
      targetType: 'User',
      targetId:   targetUserId,
      details:    suspend
        ? `Admin suspended user. Reason: ${reason}`
        : 'Admin unsuspended user.',
      before: result.before,
      after:  result.after,
      req,
    }).catch((err) => {
      console.error('[Admin] toggleUserSuspension audit log failed (non-fatal):', err.message);
    });

    return res.status(200).json({
      success: true,
      message: suspend
        ? 'User account has been suspended successfully.'
        : 'User account has been unsuspended successfully.',
      data: {
        userId:      result.after._id,
        isSuspended: result.after.isSuspended,
        suspendedAt: result.after.suspendedAt,
      },
    });
  } catch (error) {
    const status = error.statusCode || 500;
    const message = error.statusCode
      ? error.message          // Operational error from service (403/404/409) — safe to return
      : 'Failed to update suspension status.';
    if (!error.statusCode) console.error('[Admin] toggleUserSuspension error:', error.message);
    return sendError(res, message, status);
  }
};

// ── PATCH /api/v1/admin/users/:id/role ───────────────────────────────────────

/**
 * @desc    Update a user's role
 * @route   PATCH /api/v1/admin/users/:id/role
 * @access  Admin only
 *
 * Body: { role: 'volunteer'|'ngo'|'admin' }
 *
 * SECURITY:
 *   - Self-role-change blocked in service layer
 *   - Last-admin protection enforced in service layer
 *   - Audit log generated for every successful mutation
 */
const updateUserRole = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 'Invalid user ID.', 400);
    }

    const result = await adminService.updateUserRole(
      req.params.id,
      req.user.id,    // adminId — ALWAYS from req.user
      req.body.role
    );

    auditService.logAction({
      adminId:    req.user.id,
      action:     'USER_ROLE_CHANGED',
      targetType: 'User',
      targetId:   req.params.id,
      details:    `Role changed from '${result.before.role}' to '${result.after.role}'.`,
      before:     result.before,
      after:      result.after,
      req,
    }).catch((err) => {
      console.error('[Admin] updateUserRole audit log failed (non-fatal):', err.message);
    });

    return res.status(200).json({
      success: true,
      message: 'User role updated successfully.',
      data: {
        userId: result.after._id,
        role:   result.after.role,
      },
    });
  } catch (error) {
    const status = error.statusCode || 500;
    const message = error.statusCode
      ? error.message          // Operational error from service (403/404/409) — safe to return
      : 'Failed to update user role.';
    if (!error.statusCode) console.error('[Admin] updateUserRole error:', error.message);
    return sendError(res, message, status);
  }
};

// ── DELETE /api/v1/admin/opportunities/:id ────────────────────────────────────

/**
 * @desc    Admin soft-delete (remove) an opportunity
 * @route   DELETE /api/v1/admin/opportunities/:id
 * @access  Admin only
 *
 * Body (optional): { reason: string }
 *
 * SECURITY:
 *   - Uses softDelete — NOT physical delete
 *   - removedBy ALWAYS set from req.user.id (never req.body)
 *   - Applications are preserved (not cascade-deleted)
 *   - Audit log generated
 */
const removeOpportunity = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 'Invalid opportunity ID.', 400);
    }

    const reason = (req.body && req.body.reason)
      ? String(req.body.reason).trim().slice(0, 255)
      : null;

    const result = await adminService.removeOpportunity(
      req.params.id,
      req.user.id,   // adminId — ALWAYS from req.user, never req.body
      reason
    );

    auditService.logAction({
      adminId:    req.user.id,
      action:     'OPPORTUNITY_REMOVED',
      targetType: 'Opportunity',
      targetId:   req.params.id,
      details:    `Opportunity removed by admin. Reason: ${reason || 'none'}`,
      before:     result.before,
      after:      result.after,
      req,
    }).catch((err) => {
      console.error('[Admin] removeOpportunity audit log failed (non-fatal):', err.message);
    });

    return res.status(200).json({
      success: true,
      message: 'Opportunity removed by administrator.',
      data: {
        opportunityId:    result.after._id,
        isRemovedByAdmin: result.after.isRemovedByAdmin,
        removedAt:        result.after.removedAt,
      },
    });
  } catch (error) {
    const status = error.statusCode || 500;
    const message = error.statusCode
      ? error.message          // Operational error from service (403/404/409) — safe to return
      : 'Failed to remove opportunity.';
    if (!error.statusCode) console.error('[Admin] removeOpportunity error:', error.message);
    return sendError(res, message, status);
  }
};

// ── PATCH /api/v1/admin/opportunities/:id/restore ─────────────────────────────

/**
 * @desc    Restore an admin-removed opportunity
 * @route   PATCH /api/v1/admin/opportunities/:id/restore
 * @access  Admin only
 *
 * SECURITY:
 *   - Only restores if isRemovedByAdmin is currently true (409 otherwise)
 *   - All soft-delete fields cleared atomically
 *   - Audit log generated
 */
const restoreOpportunity = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 'Invalid opportunity ID.', 400);
    }

    const result = await adminService.restoreOpportunity(
      req.params.id,
      req.user.id
    );

    auditService.logAction({
      adminId:    req.user.id,
      action:     'OPPORTUNITY_RESTORED',
      targetType: 'Opportunity',
      targetId:   req.params.id,
      details:    'Opportunity restored by admin.',
      before:     result.before,
      after:      result.after,
      req,
    }).catch((err) => {
      console.error('[Admin] restoreOpportunity audit log failed (non-fatal):', err.message);
    });

    return res.status(200).json({
      success: true,
      message: 'Opportunity restored successfully.',
      data: {
        opportunityId:    result.after._id,
        isRemovedByAdmin: result.after.isRemovedByAdmin,
      },
    });
  } catch (error) {
    const status = error.statusCode || 500;
    const message = error.statusCode
      ? error.message          // Operational error from service (403/404/409) — safe to return
      : 'Failed to restore opportunity.';
    if (!error.statusCode) console.error('[Admin] restoreOpportunity error:', error.message);
    return sendError(res, message, status);
  }
};

module.exports = {
  getUsers,
  getUserById,
  toggleUserSuspension,
  updateUserRole,
  removeOpportunity,
  restoreOpportunity,
};
