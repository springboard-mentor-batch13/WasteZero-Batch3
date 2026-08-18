// Backend/controllers/audit.controller.js
//
// Developer A M4 — Audit Log HTTP Controller
//
// Handles:
//   GET /api/v1/admin/logs
//
// IMMUTABILITY CONTRACT:
//   AdminLog records are APPEND-ONLY.
//   This controller ONLY exposes a read (GET) endpoint.
//   There is NO PUT, PATCH, or DELETE for audit logs.
//
// SECURITY:
//   - Admin only (protected by protect + requireAdmin middleware chain)
//   - All filters are whitelist-validated by admin.validation.js
//   - Newest-first ordering is always enforced (not overrideable by client)
//   - Page/limit capped at 100

const AdminLog = require('../models/admin-log.model');
const { sendSuccess, sendError } = require('../utils/apiResponse');

/**
 * @desc    Retrieve paginated, filtered audit log entries
 * @route   GET /api/v1/admin/logs
 * @access  Admin only
 *
 * Query params (all optional, all validated by admin.validation.js):
 *   page, limit, action, target_type, target_id, adminId, startDate, endDate
 */
const getAuditLogs = async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page,  10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip  = (page - 1) * limit;

    // ── Build filter — only from whitelisted, validated query params ─────────
    const filter = {};

    // action — validated enum by admin.validation.js
    if (req.query.action) {
      filter.action = req.query.action;
    }

    // target_type — validated enum
    if (req.query.target_type) {
      filter.target_type = req.query.target_type;
    }

    // target_id — validated ObjectId
    if (req.query.target_id) {
      filter.target_id = req.query.target_id;
    }

    // adminId — filter logs by the admin who performed the action
    if (req.query.adminId) {
      filter.admin_id = req.query.adminId;
    }

    // Date range — both converted to Date by .toDate() in validation
    if (req.query.startDate || req.query.endDate) {
      filter.timestamp = {};
      if (req.query.startDate) {
        filter.timestamp.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        // Include the full endDate day (up to 23:59:59.999)
        const end = new Date(req.query.endDate);
        end.setHours(23, 59, 59, 999);
        filter.timestamp.$lte = end;
      }
    }

    // ── Query — always newest first ──────────────────────────────────────────
    const [logs, total] = await Promise.all([
      AdminLog.find(filter)
        .populate('admin_id', 'name email')   // Admin name/email for display
        .sort({ timestamp: -1 })              // ALWAYS newest first — not overrideable
        .skip(skip)
        .limit(limit)
        .lean(),
      AdminLog.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Audit logs fetched successfully.',
      results: logs.length,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data: { logs },
    });
  } catch (error) {
    console.error('[Audit] getAuditLogs error:', error.message);
    return sendError(res, 'Failed to fetch audit logs.', 500);
  }
};

module.exports = { getAuditLogs };
