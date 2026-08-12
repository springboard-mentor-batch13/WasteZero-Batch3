// Backend/models/pickup.model.js

const mongoose = require('mongoose');
const { ALLOWED_WASTE_TYPES } = require('../constants/wasteTypes');
const { canTransition, SWEEP_CANDIDATE_STATUSES } = require('../utils/pickup.transitions');

// ---------------------------------------------------------------------------
// Status enum
// ---------------------------------------------------------------------------
// 'Missed' is intentionally included here so Mongoose accepts it when the
// system sweep writes it.  No API endpoint accepts 'Missed' as an input —
// that is enforced in validation + canTransition(), not at the schema level.
const PICKUP_STATUSES = ['Pending', 'Assigned', 'Completed', 'Cancelled', 'Missed'];

// Maximum times a volunteer may reschedule a single Missed pickup.
// Exported so validation, service, and tests all reference the same constant.
const RESCHEDULE_CAP = 2;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const pickupSchema = new mongoose.Schema(
  {
    // ── Ownership ────────────────────────────────────────────────────────
    user_id: {
      // Volunteer who created the pickup request
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'Pickup must belong to a volunteer'],
      index:    true, // fast: getMyPickups, ownership checks
    },

    agent_id: {
      // NGO who has claimed the pickup; null whenever the pickup is not Assigned
      // (including after a reschedule — the old NGO does not auto-reassign)
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
      index:   true, // fast: getAssignedToMe
    },

    // ── Location ─────────────────────────────────────────────────────────
    address: {
      city: {
        type:     String,
        required: true,
        trim:     true,
      },
      area: {
        type: String,
        trim: true,
      },
    },

    // ── Schedule ─────────────────────────────────────────────────────────
    scheduledDate: {
      type:     Date,
      required: true,
    },

    preferredTimeSlot: {
      // Stored in 24-hour HH:mm format — never change this.
      // 12-hour display strings (startDisplay/endDisplay) are added by the
      // response layer (addTimeDisplayFields) and never persisted here.
      start: {
        type:     String,
        required: true,
      },
      end: {
        type:     String,
        required: true,
      },
    },

    // ── Precomputed sweep anchor ──────────────────────────────────────────
    // Absolute Date = date(scheduledDate) + time(preferredTimeSlot.end).
    // Set at create time; replaced on reschedule.
    // Lets the sweep run a single indexed Mongo query instead of filtering
    // candidates in JS with per-document HH:mm string parsing.
    missedCutoffAt: {
      type:    Date,
      default: null,
      index:   true, // used by sweep: { status, missedCutoffAt: { $lte: now } }
    },

    // ── Waste ─────────────────────────────────────────────────────────────
    wasteTypes: [
      {
        type: String,
        trim: true,
        enum: {
          values:  ALLOWED_WASTE_TYPES,
          message: '{VALUE} is not a valid waste type. Allowed: ' + ALLOWED_WASTE_TYPES.join(', '),
        },
      },
    ],

    notes: {
      type:      String,
      trim:      true,
      maxlength: 500,
    },

    // ── Status ────────────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    { values: PICKUP_STATUSES, message: '{VALUE} is not a valid status' },
      default: 'Pending',
    },

    // ── Audit timestamps ─────────────────────────────────────────────────
    completedAt: {
      // Set when status → Completed; never cleared (Completed is terminal).
      type:    Date,
      default: null,
    },

    missedAt: {
      // Set ONLY by the automatic sweep when status → Missed.
      // Cleared back to null on reschedule (Missed → Pending).
      // Never set by any API endpoint or any role.
      type:    Date,
      default: null,
    },

    rescheduleCount: {
      // Incremented atomically by the reschedule service function.
      // Once it hits RESCHEDULE_CAP the pickup stays Missed permanently.
      // Never decremented.
      type:    Number,
      default: 0,
      min:     0,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// Volunteer "my pickups" list — sorted newest first
pickupSchema.index({ user_id: 1, createdAt: -1 });

// NGO "assigned to me" list — filtered by agent + status + date
pickupSchema.index({ agent_id: 1, status: 1, scheduledDate: 1 });

// NGO discovery feed — Pending pickups by city
pickupSchema.index({ status: 1, 'address.city': 1, scheduledDate: 1 });

// Sweep query: open pickups whose cutoff has passed
// Compound with status first because the sweep only touches two statuses.
pickupSchema.index({ status: 1, missedCutoffAt: 1 });

// Multikey index — supports $in matching against an NGO's wasteTypes array
pickupSchema.index({ wasteTypes: 1 });

// ---------------------------------------------------------------------------
// Statics — expose constants so controllers and tests import from one place
// ---------------------------------------------------------------------------
pickupSchema.statics.STATUSES        = PICKUP_STATUSES;
pickupSchema.statics.RESCHEDULE_CAP  = RESCHEDULE_CAP;
pickupSchema.statics.canTransition   = canTransition; // convenience re-export
pickupSchema.statics.SWEEP_CANDIDATE_STATUSES = SWEEP_CANDIDATE_STATUSES;

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
const Pickup = mongoose.model('Pickup', pickupSchema);

module.exports = Pickup;