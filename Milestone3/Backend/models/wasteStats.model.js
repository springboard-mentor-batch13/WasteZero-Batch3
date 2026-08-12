// Backend/models/wasteStats.model.js
//
// Stores per-pickup recycling statistics for each volunteer.
// Used by Developer B's analytics pipelines in M4:
//   - GET /api/v1/dashboard/metrics        (user personal dashboard)
//   - GET /api/v1/stats/recycling-breakdown (admin analytics)
//
// Records are written when a Pickup transitions to 'Completed'.
// DO NOT implement that write logic until M4 — this is the schema foundation only.

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

const WasteStats = mongoose.model('WasteStats', wasteStatsSchema);

module.exports = WasteStats;
