// Backend/models/pickup.model.js

const mongoose = require('mongoose');


const PICKUP_STATUSES = ['Pending', 'Assigned', 'Completed', 'Cancelled'];

const pickupSchema = new mongoose.Schema(
  {
    user_id: {
      // Volunteer who created the pickup request
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Pickup must belong to a volunteer'],
      index: true,            // Fast queries: getMyPickups, ownership checks
    },

    agent_id: {
      // NGO who accepted/is handling the pickup
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,            // Fast queries: getAssignedToMe
    },

    address: {
      area: {
        type: String,
        trim: true,
      },
      city: {
        type: String,
        required: true,
        trim: true,
      },
    },

    scheduledDate: {
      type: Date,
      required: true,
    },

    preferredTimeSlot: {
      start: {
        type: String,
        required: true,
      },
      end: {
        type: String,
        required: true,
      },
    },

    wasteTypes: [
      {
        type: String,
        trim: true,
      },
    ],

    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    status: {
      type: String,
      enum: {
        values: PICKUP_STATUSES,
        message: '{VALUE} is not a valid status',
      },
      default: 'Pending',
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ── MongoDB Indexes ────────────────────────────────────────────────────

// "My pickups" list (volunteer) — sorted newest first
pickupSchema.index({ user_id: 1, createdAt: -1 });

// "Assigned to me" list (NGO) — filtered by status, sorted by schedule
pickupSchema.index({ agent_id: 1, status: 1, scheduledDate: 1 });

// NGO discovery feed — status + city is the primary filter combo
pickupSchema.index({ status: 1, 'address.city': 1, scheduledDate: 1 });

// Multikey index — supports $in matching against a volunteer/NGO's wasteTypes
pickupSchema.index({ wasteTypes: 1 });


const ALLOWED_TRANSITIONS = {
  Pending: ['Assigned', 'Cancelled'],
  Assigned: ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};


const NGO_ALLOWED_TRANSITIONS = {
  Pending: ['Assigned'],
  Assigned: ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

pickupSchema.methods.canTransitionTo = function (nextStatus) {
  return (ALLOWED_TRANSITIONS[this.status] || []).includes(nextStatus);
};

// Used by the NGO status-transition controller instead of canTransitionTo,
// so an NGO can never reach a transition it isn't the rightful actor for.
pickupSchema.methods.canNgoTransitionTo = function (nextStatus) {
  return (NGO_ALLOWED_TRANSITIONS[this.status] || []).includes(nextStatus);
};

pickupSchema.statics.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;
pickupSchema.statics.NGO_ALLOWED_TRANSITIONS = NGO_ALLOWED_TRANSITIONS;
pickupSchema.statics.STATUSES = PICKUP_STATUSES;

const Pickup = mongoose.model('Pickup', pickupSchema);

module.exports = Pickup;