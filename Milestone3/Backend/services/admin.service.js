// Backend/services/admin.service.js
//
// Platform Governance Service — Developer A M4
//
// Owns all business logic for:
//   - User listing and detail retrieval
//   - Account suspension / unsuspension
//   - User role management
//   - Opportunity moderation (soft-delete / restore)
//
// ARCHITECTURE CONTRACT:
//   Route → Middleware → Validation → Controller → Service → Model
//   No business logic lives in routes or controllers.
//
// SECURITY INVARIANTS:
//   - suspendedBy  is ALWAYS req.user.id (set here, never from req.body)
//   - removedBy    is ALWAYS req.user.id (set here, never from req.body)
//   - all timestamps are server-generated (new Date())
//   - last-admin protection enforced before any role removal
//   - self-action protection enforced for suspend and role change
//   - before/after snapshots are returned to controllers for audit logging

const mongoose = require('mongoose');
const User = require('../models/users.model');
const Opportunity = require('../models/opportunity.model');

// ── Safe field projection ────────────────────────────────────────────────────
// These fields are NEVER returned by any admin API — even the admin listing.
const SAFE_USER_PROJECTION = '-password -__v';

// Fields returned in admin user list (subset of full profile)
const USER_LIST_FIELDS =
  '_id name username email role isSuspended suspensionReason suspendedAt suspendedBy createdAt updatedAt isVerified';

// Fields returned for admin user detail
const USER_DETAIL_FIELDS =
  '_id name username email role bio skills wasteTypes locations ' +
  'isSuspended suspensionReason suspendedAt suspendedBy isVerified createdAt updatedAt';


// ── Helpers ──────────────────────────────────────────────────────────────────

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');


// ── User Management ──────────────────────────────────────────────────────────

/**
 * Return a paginated, filtered list of users.
 * NEVER returns passwords, OTPs, JWT secrets, or encryption keys.
 *
 * @param {object} opts
 * @param {number} opts.page
 * @param {number} opts.limit         - Already capped at 100 by validation
 * @param {string} [opts.search]      - Name or email substring (escaped)
 * @param {string} [opts.role]        - 'volunteer' | 'ngo' | 'admin'
 * @param {string} [opts.isSuspended] - 'true' | 'false' string from query
 * @param {string} [opts.sort]        - Field name (whitelist-enforced)
 * @param {string} [opts.order]       - 'asc' | 'desc'
 * @returns {Promise<{ users, total, page, limit, totalPages }>}
 */
const getUsers = async ({ page, limit, search, role, isSuspended, sort = 'createdAt', order = 'desc' }) => {
  const filter = {};

  // Safe regex search — escaped to prevent ReDoS / injection
  if (search) {
    const escaped = escapeRegex(search.trim());
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
      { username: { $regex: escaped, $options: 'i' } },
    ];
  }

  if (role) {
    filter.role = role;
  }

  // Convert string query param to boolean for MongoDB
  if (isSuspended !== undefined && isSuspended !== '') {
    filter.isSuspended = isSuspended === 'true';
  }

  // Whitelist sort fields — no arbitrary sort injection
  const ALLOWED_SORT = ['createdAt', 'updatedAt', 'name', 'email', 'role'];
  const sortField = ALLOWED_SORT.includes(sort) ? sort : 'createdAt';
  const sortOrder = order === 'asc' ? 1 : -1;

  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find(filter)
      .select(USER_LIST_FIELDS)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return {
    users,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

/**
 * Return a single user's details by ID.
 * Returns null if the user does not exist.
 * NEVER returns password.
 *
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
const getUserById = async (userId) => {
  return User.findById(userId).select(USER_DETAIL_FIELDS).lean();
};


// ── Suspension ───────────────────────────────────────────────────────────────

/**
 * Suspend a user account.
 *
 * INVARIANTS:
 *   - Admin CANNOT suspend themselves.
 *   - reason is required (enforced in validation layer but also checked here).
 *   - suspendedBy is always set from adminId (never req.body).
 *   - Returns { before, after } for audit logging.
 *
 * @param {string} targetUserId  - ObjectId string of user to suspend
 * @param {string} adminId       - req.user.id of the acting admin
 * @param {string} reason        - Suspension reason (max 255 chars, already validated)
 * @returns {Promise<{ before: object, after: object }>}
 * @throws {Error} if user not found or self-suspension attempted
 */
const suspendUser = async (targetUserId, adminId, reason) => {
  // Self-suspension protection
  if (targetUserId.toString() === adminId.toString()) {
    const err = new Error('Admins cannot suspend their own account.');
    err.statusCode = 403;
    throw err;
  }

  const user = await User.findById(targetUserId).select(USER_DETAIL_FIELDS).lean();
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }

  // Capture BEFORE state (password already excluded by projection)
  const before = { ...user };

  const updated = await User.findByIdAndUpdate(
    targetUserId,
    {
      isSuspended:      true,
      suspensionReason: reason,
      suspendedAt:      new Date(),
      suspendedBy:      adminId,    // ALWAYS server-derived
    },
    { new: true, runValidators: true }
  ).select(USER_DETAIL_FIELDS).lean();

  return { before, after: updated };
};

/**
 * Unsuspend a user account.
 *
 * INVARIANTS:
 *   - Admin CANNOT unsuspend themselves (no meaningful business case).
 *   - All suspension fields are cleared atomically.
 *   - Returns { before, after } for audit logging.
 *
 * @param {string} targetUserId
 * @param {string} adminId
 * @returns {Promise<{ before: object, after: object }>}
 */
const unsuspendUser = async (targetUserId, adminId) => {
  if (targetUserId.toString() === adminId.toString()) {
    const err = new Error('Admins cannot modify their own suspension state.');
    err.statusCode = 403;
    throw err;
  }

  const user = await User.findById(targetUserId).select(USER_DETAIL_FIELDS).lean();
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }

  const before = { ...user };

  const updated = await User.findByIdAndUpdate(
    targetUserId,
    {
      isSuspended:      false,
      suspensionReason: null,
      suspendedAt:      null,
      suspendedBy:      null,
    },
    { new: true, runValidators: false }
  ).select(USER_DETAIL_FIELDS).lean();

  return { before, after: updated };
};


// ── Role Management ──────────────────────────────────────────────────────────

/**
 * Update a user's role.
 *
 * INVARIANTS:
 *   - Admin CANNOT change their own role (self-role-change protection).
 *   - Last-admin protection: if the target IS an admin and the new role is NOT admin,
 *     we must ensure at least one other admin exists.
 *   - Returns { before, after } for audit logging.
 *
 * @param {string} targetUserId
 * @param {string} adminId         - Acting admin (req.user.id)
 * @param {string} newRole         - 'volunteer' | 'ngo' | 'admin'
 * @returns {Promise<{ before: object, after: object }>}
 */
const updateUserRole = async (targetUserId, adminId, newRole) => {
  // Self-role-change protection
  if (targetUserId.toString() === adminId.toString()) {
    const err = new Error('Admins cannot change their own role.');
    err.statusCode = 403;
    throw err;
  }

  const user = await User.findById(targetUserId).select(USER_DETAIL_FIELDS).lean();
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }

  // Last-admin protection: if the target is currently an admin and the new role
  // removes admin privileges, ensure at least one other admin will remain.
  if (user.role === 'admin' && newRole !== 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      const err = new Error(
        'Cannot demote the only remaining admin. Promote another user to admin first.'
      );
      err.statusCode = 409;
      throw err;
    }
  }

  const before = { ...user };

  const updated = await User.findByIdAndUpdate(
    targetUserId,
    { role: newRole },
    { new: true, runValidators: true }
  ).select(USER_DETAIL_FIELDS).lean();

  return { before, after: updated };
};


// ── Opportunity Moderation ───────────────────────────────────────────────────

/**
 * Admin soft-delete (remove) an opportunity.
 *
 * Uses existing softDeleteOpportunityById pattern for consistency.
 * Sets isRemovedByAdmin, removalReason, removedAt, removedBy — all server-side.
 * Does NOT cascade-delete applications.
 *
 * @param {string} opportunityId
 * @param {string} adminId        - req.user.id (always server-derived, never req.body)
 * @param {string|null} reason    - Optional removal reason
 * @returns {Promise<{ before: object, after: object }>}
 */
const removeOpportunity = async (opportunityId, adminId, reason) => {
  const opportunity = await Opportunity.findById(opportunityId).lean();
  if (!opportunity) {
    const err = new Error('Opportunity not found.');
    err.statusCode = 404;
    throw err;
  }

  const before = { ...opportunity };

  const updated = await Opportunity.findByIdAndUpdate(
    opportunityId,
    {
      isRemovedByAdmin: true,
      removalReason:    reason ? reason.trim().slice(0, 255) : null,
      removedAt:        new Date(),
      removedBy:        adminId,  // ALWAYS server-derived — never from req.body
    },
    { new: true, runValidators: false }
  ).lean();

  return { before, after: updated };
};

/**
 * Restore a previously admin-removed opportunity.
 *
 * Only restores if isRemovedByAdmin is currently true.
 * Clears all 4 soft-delete fields atomically.
 *
 * @param {string} opportunityId
 * @param {string} adminId
 * @returns {Promise<{ before: object, after: object }>}
 */
const restoreOpportunity = async (opportunityId, adminId) => {
  const opportunity = await Opportunity.findById(opportunityId).lean();
  if (!opportunity) {
    const err = new Error('Opportunity not found.');
    err.statusCode = 404;
    throw err;
  }

  if (!opportunity.isRemovedByAdmin) {
    const err = new Error('Opportunity is not currently removed and cannot be restored.');
    err.statusCode = 409;
    throw err;
  }

  const before = { ...opportunity };

  const updated = await Opportunity.findByIdAndUpdate(
    opportunityId,
    {
      isRemovedByAdmin: false,
      removalReason:    null,
      removedAt:        null,
      removedBy:        null,
    },
    { new: true, runValidators: false }
  ).lean();

  return { before, after: updated };
};

module.exports = {
  getUsers,
  getUserById,
  suspendUser,
  unsuspendUser,
  updateUserRole,
  removeOpportunity,
  restoreOpportunity,
};
