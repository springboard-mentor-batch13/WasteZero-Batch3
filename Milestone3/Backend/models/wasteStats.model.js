// Backend/models/wasteStats.model.js
//
// Stores per-pickup recycling statistics for each volunteer.
// Used by Developer B's analytics pipelines in M4:
//   - GET /api/v1/dashboard/metrics        (user personal dashboard)
//   - GET /api/v1/stats/recycling-breakdown (admin analytics)
//
// Records are written when a Pickup transitions to 'Completed', by
// pickup.service.js#recordWasteStatsForPickup — see that function for the
// write path (M4 Developer B).

const mongoose = require('mongoose');
const { ALLOWED_WASTE_TYPES } = require('../constants/wasteTypes');

const wasteStatsSchema = new mongoose.Schema(
  {
    // The volunteer whose pickup generated this stat entry
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'user_id is required'],
    },

    // The NGO who entered these waste details (Pickup.agent_id at completion
    // time). Nullable: an admin can force-complete a pickup that was never
    // claimed by an NGO (still Pending → Completed), so there's no agent to
    // attribute the entry to in that case.
    ngo_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // The pickup that was completed
    pickup_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pickup',
      required: [true, 'pickup_id is required'],
    },

    // Waste category — must be one of the canonical values in ALLOWED_WASTE_TYPES.
    // Using the shared constant ensures analytics pipelines and this schema stay in sync.
    category: {
      type: String,
      required: [true, 'category is required'],
      enum: {
        values: ALLOWED_WASTE_TYPES,
        message: '{VALUE} is not a valid waste category',
      },
    },

    // Weight of waste collected in kilograms
    weight: {
      type: Number,
      required: [true, 'weight is required'],
      min: [0.01, 'weight must be at least 0.01 kg'],
    },

    // Pre-calculated CO₂ equivalent saved, in kilograms.
    // Calculated by co2Calculator.js (to be built in M4) using category + weight.
    co2_saved_kg: {
      type: Number,
      required: [true, 'co2_saved_kg is required'],
      min: [0, 'co2_saved_kg cannot be negative'],
    },

    // When the pickup was completed / when this stat was recorded
    date: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// ── MongoDB Indexes ────────────────────────────────────────────────────────

// Recycling breakdown analytics: group by category, filter/sort by date
// Supports: GET /api/v1/stats/recycling-breakdown?month=YYYY-MM
wasteStatsSchema.index({ category: 1, date: -1 });

// User dashboard: volunteer's personal impact metrics, date-sorted
// Supports: GET /api/v1/dashboard/metrics (scoped to req.user.id)
wasteStatsSchema.index({ user_id: 1, date: -1 });

// NGO dashboard: NGO's own recycling contribution, date-sorted
// Supports: GET /api/v1/dashboard/metrics (NGO role, scoped to req.user.id)
wasteStatsSchema.index({ ngo_id: 1, date: -1 });

// Idempotency guard, enforced at the DB layer: recordWasteStatsForPickup()
// (pickup.service.js) only does a check-then-act existence check before
// insertMany(), which is not atomic — a tight double-fire of that
// fire-and-forget call (e.g. a retried request racing the first insert)
// could double-insert rows before the first insert's existence is visible.
// A pickup can legitimately produce multiple WasteStats rows (one per waste
// category), so the uniqueness constraint is per {pickup_id, category}, not
// per pickup_id alone. This is the hard guarantee; the exists()-then-insert
// check in the service remains as a fast-path that avoids hitting this
// constraint on the common (non-racing) path.
wasteStatsSchema.index({ pickup_id: 1, category: 1 }, { unique: true });

const WasteStats = mongoose.model('WasteStats', wasteStatsSchema);

module.exports = WasteStats;