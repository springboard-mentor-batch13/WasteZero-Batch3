// Backend/services/audit.service.js
//
// Append-only audit logging service for all admin write operations.
//
// CONTRACT:
//   - Only AdminLog.create() is used — no update, patch, or delete.
//   - admin_id, ip_address, user_agent are ALWAYS derived server-side.
//   - client req.body MUST NOT contribute to any audit field.
//   - Audit failure is logged but NEVER propagates to the caller.
//     (A failed audit log must not roll back a successful admin action.)
//
// USAGE:
//   await auditService.logAction({
//     adminId: req.user.id,       // ObjectId string — from req.user (server-set by protect)
//     action:  'USER_SUSPENDED',  // Must be in ADMIN_LOG_ACTIONS
//     targetType: 'User',         // Must be in ADMIN_LOG_TARGET_TYPES
//     targetId: userId,           // ObjectId string of affected resource
//     details: 'Suspended ...',   // Human-readable description (max 500 chars)
//     before: { ... },            // Pre-mutation snapshot (optional)
//     after:  { ... },            // Post-mutation snapshot (optional)
//     req,                        // Express Request object — for IP + user-agent derivation
//   });
//
// IMPORTANT: logAction is intentionally non-throwing. Any DB error is caught
// and printed but never re-thrown — the calling controller should not fail
// because an audit record could not be written (the mutation already succeeded).
// For transaction-critical audit writes (if ever required), the caller should
// await and handle errors explicitly.

const AdminLog = require('../models/admin-log.model');

/**
 * Derive the real client IP from the request.
 * Handles common reverse-proxy headers and falls back to remoteAddress.
 * NEVER reads from req.body (server-side only).
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
const deriveIp = (req) => {
  // Trust the leftmost IP in X-Forwarded-For when behind a trusted proxy.
  // In production, Express's app.set('trust proxy', 1) should be enabled.
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || 'unknown';
};

/**
 * Derive the client User-Agent.
 * NEVER reads from req.body.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
const deriveUserAgent = (req) =>
  req.headers['user-agent'] || '';

/**
 * Sanitise a before/after snapshot so it is safe to persist.
 * Removes password hashes, OTPs, tokens, and other sensitive fields before storing.
 *
 * @param {object|null} snapshot
 * @returns {object|null}
 */
const sanitiseSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const plain = typeof snapshot.toObject === 'function' ? snapshot.toObject() : { ...snapshot };
  const { password, otp, token, secret, __v, ...safe } = plain;
  return safe;
};

/**
 * Append-only audit log insertion.
 *
 * @param {object} params
 * @param {string}  params.adminId     - ObjectId string of the acting admin (req.user.id)
 * @param {string}  params.action      - One of ADMIN_LOG_ACTIONS
 * @param {string}  params.targetType  - One of ADMIN_LOG_TARGET_TYPES
 * @param {string}  params.targetId    - ObjectId string of affected resource
 * @param {string}  params.details     - Human-readable description (max 500 chars)
 * @param {object}  [params.before]    - Pre-mutation state snapshot (optional)
 * @param {object}  [params.after]     - Post-mutation state snapshot (optional)
 * @param {import('express').Request} params.req - Express request (for IP + UA)
 * @returns {Promise<void>}
 */
const logAction = async ({
  adminId,
  action,
  targetType,
  targetId,
  details,
  before = null,
  after = null,
  req,
}) => {
  try {
    await AdminLog.create({
      admin_id:    adminId,
      action,
      target_type: targetType,
      target_id:   targetId,
      details:     details.slice(0, 500),  // Enforce 500-char cap server-side too
      changes: {
        before: sanitiseSnapshot(before),
        after:  sanitiseSnapshot(after),
      },
      ip_address:  deriveIp(req),
      user_agent:  deriveUserAgent(req),
      // timestamp defaults to Date.now() in the schema — never client-supplied
    });
  } catch (err) {
    // Log but NEVER throw — a failed audit record must not roll back the
    // successful admin action that triggered it.
    console.error('[AuditService] Failed to write AdminLog:', err.message, {
      action,
      targetType,
      targetId,
      adminId,
    });
  }
};

module.exports = { logAction };
