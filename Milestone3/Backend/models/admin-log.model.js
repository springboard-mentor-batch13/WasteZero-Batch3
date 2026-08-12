// Backend/models/admin-log.model.js
//
// APPEND-ONLY audit trail for all admin write actions.
//
// IMPORTANT — enforcement rules:
//   - There must NEVER be a DELETE or UPDATE route/service for this collection.
//   - Only AdminLog.create() is permitted.
//   - The GET (read) path will be implemented in M4 (audit.controller.js).
//
// Usage (once audit.service.js exists in M4):
//   await AdminLog.create({ admin_id, action, target_type, target_id, ... });

const mongoose = require('mongoose');

const ADMIN_LOG_ACTIONS = [
  'USER_SUSPENDED',
  'USER_UNSUSPENDED',
  'USER_ROLE_CHANGED',
  'OPPORTUNITY_REMOVED',
  'OPPORTUNITY_RESTORED',
  'PICKUP_STATUS_OVERRIDE',
  'REPORT_DOWNLOADED',
];

const ADMIN_LOG_TARGET_TYPES = ['User', 'Opportunity', 'Pickup', 'Report'];

const adminLogSchema = new mongoose.Schema(
  {
    // The admin who performed the action
    admin_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'admin_id is required'],
      index: true,
    },

    // The type of administrative action performed
    action: {
      type: String,
      required: [true, 'action is required'],
      enum: {
        values: ADMIN_LOG_ACTIONS,
        message: '{VALUE} is not a valid admin log action',
      },
    },

    // The entity type that was affected
    target_type: {
      type: String,
      required: [true, 'target_type is required'],
      enum: {
        values: ADMIN_LOG_TARGET_TYPES,
        message: '{VALUE} is not a valid target type',
      },
    },

    // ObjectId of the affected resource
    target_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'target_id is required'],
    },

    // Human-readable summary of what was done
    details: {
      type: String,
      required: [true, 'details is required'],
      trim: true,
      maxlength: [500, 'details cannot exceed 500 characters'],
    },

    // Optional snapshot of before/after state for reversibility audit
    changes: {
      before: { type: mongoose.Schema.Types.Mixed, default: null },
      after:  { type: mongoose.Schema.Types.Mixed, default: null },
    },

    // Request metadata for forensic tracing
    ip_address: {
      type: String,
      default: null,
    },

    user_agent: {
      type: String,
      default: null,
    },

    // Explicit timestamp — not relying solely on createdAt
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // timestamps: true adds createdAt — we keep both for explicit querying
    timestamps: true,
    // Prevent accidental modifications at the ODM level
    // (no update hooks, no pre-save that can mutate)
  }
);

// ── MongoDB Indexes ────────────────────────────────────────────────────────

// Primary sort index: fetch recent logs quickly
adminLogSchema.index({ timestamp: -1 });

// Compound index: admin-scoped audit trail with chronological sort
// Supports: GET /api/v1/admin/logs?adminId=&startDate=&endDate=
adminLogSchema.index({ admin_id: 1, timestamp: -1 });

// Resource-level index: "who touched this resource, and when?"
adminLogSchema.index({ target_type: 1, target_id: 1 });

// Export action/target_type constants so controllers can import them
// without hardcoding strings — prevents typos in M4 audit calls.
const AdminLog = mongoose.model('AdminLog', adminLogSchema);

module.exports = AdminLog;
module.exports.ADMIN_LOG_ACTIONS = ADMIN_LOG_ACTIONS;
module.exports.ADMIN_LOG_TARGET_TYPES = ADMIN_LOG_TARGET_TYPES;
