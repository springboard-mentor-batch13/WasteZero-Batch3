// Backend/models/opportunity.model.js

const mongoose = require('mongoose');

const opportunitySchema = new mongoose.Schema(
  {
    ngo_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Opportunity must belong to an NGO'],
      index: true,            // Fast queries: getMyOpportunities, ownership checks
    },

    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },

    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },

    required_skills: {
      type: [String],
      required: [true, 'At least one required skill must be specified'],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: 'Required skills array cannot be empty',
      },
    },

    duration: {
      type: String,
      required: [true, 'Duration is required'],
      trim: true,
    },

    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
    },

    // ── Opportunity Event Date ─────────────────────────────────────────
    // The scheduled date for the volunteer event.
    // Optional — existing opportunities without a date remain valid.
    date: {
      type: Date,
      default: null,
    },

    
    image: {
      type: String,
      default: '',
    },

    imagePublicId: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: {
        values: ['open', 'in-progress', 'closed'],
        message: '{VALUE} is not a valid status',
      },
      default: 'open',
    },
  },
  {
    timestamps: true,
  }
);

// ── MongoDB Indexes ────────────────────────────────────────────────────

// Text index for full-text search across title and description
opportunitySchema.index({ title: 'text', description: 'text' });

// Compound index for the public feed: status filter + chronological sort
// Covers: GET /api/opportunities, GET /api/opportunities/filter?status=
opportunitySchema.index({ status: 1, createdAt: -1 });

// Compound index for upcoming sort: date ascending (nulls sort last by default)
opportunitySchema.index({ date: 1, createdAt: -1 });

const Opportunity = mongoose.model('Opportunity', opportunitySchema);

module.exports = Opportunity;