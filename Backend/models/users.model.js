// Backend/models/users.model.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a full name'],
      trim: true,
    },

    username: {
      type: String,
      required: [true, 'Please add a username'],
      unique: true,           // Enforced at both Mongoose and MongoDB index level
      lowercase: true,
      trim: true,
      index: true,            // Explicit index for fast login lookups by username
    },

    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,           // Enforced at both Mongoose and MongoDB index level
      lowercase: true,
      trim: true,
      index: true,            // Explicit index for fast login / OTP lookups by email
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please add a valid email',
      ],
    },

    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: [8, 'Password must be at least 8 characters long'],
      select: false,          // Never returned in queries by default
    },

    role: {
      type: String,
      enum: ['volunteer', 'ngo', 'admin'],
      default: 'volunteer',
    },

    locations: {
      primary: {
        city: { type: String, trim: true },
        state: { type: String, trim: true },
      },
      secondary: [
        {
          city: { type: String, trim: true },
          state: { type: String, trim: true },
        },
      ],
    },

   
    wasteTypes: {
      type: [String],
      default: [],
    },

    skills: {
      type: [String],
      default: [],
    },

    bio: {
      type: String,
      default: '',
    },

    
    isVerified: {
      type: Boolean,
      default: false,
    },

    settings: {
      emailNotifications: { type: Boolean, default: true },
      pushNotifications: { type: Boolean, default: true },
      messageAlerts: { type: Boolean, default: true },
      pickupAlerts: { type: Boolean, default: true },
      opportunityAlerts: { type: Boolean, default: true },
      themePreference: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    },

    // ── P0-01: Suspension Foundation ──────────────────────────────────────
    // Required by M4 admin suspension feature, protect middleware, and login.
    // All M4 suspension-gate checks depend on this field existing in the DB.

    isSuspended: {
      type: Boolean,
      default: false,
      index: true,            // Fast lookup in protect middleware on every request
    },

    suspensionReason: {
      type: String,
      default: null,
      maxlength: [255, 'Suspension reason cannot exceed 255 characters'],
      trim: true,
    },

    suspendedAt: {
      type: Date,
      default: null,
    },

    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },

  {
    timestamps: true,
  }
);


UserSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  if (this.$locals.skipHash) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Instance method for login password comparison
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};


// ── MongoDB Indexes ────────────────────────────────────────────────────────

// Enforce single-admin constraint at the database layer.
// partialFilterExpression scopes uniqueness only to admin documents.
UserSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: 'admin' } }
);

// P0-01 Compound index: supports admin dashboard queries that filter by role + suspension status.
// e.g. User.find({ role: 'volunteer', isSuspended: false }) — used in M4 analytics $facet.
UserSchema.index({ role: 1, isSuspended: 1 });

module.exports = mongoose.model('User', UserSchema);