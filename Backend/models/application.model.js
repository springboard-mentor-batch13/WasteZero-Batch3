// Backend/models/application.model.js

const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema(
  {
    opportunity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Opportunity',
      required: true,
      index: true,            // Fast filtering: getApplications by opportunity
    },

    volunteer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,            // Fast filtering: getMyApplications by volunteer
    },

    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index: enforces the one-application-per-volunteer-per-opportunity
// rule at the database layer (duplicate protection in addition to app-level checks)
applicationSchema.index(
  { opportunity_id: 1, volunteer_id: 1 },
  { unique: true }
);

module.exports = mongoose.model('Application', applicationSchema);