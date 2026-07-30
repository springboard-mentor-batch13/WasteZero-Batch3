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

    // Structured coverage/home area — used by:
    //   - the Pickup module to match NGOs to pickups by city (see
    //     services/pickup.service.js: getUserCities, isNgoEligibleForPickup)
    //   - the volunteer-opportunity matching engine to match volunteers to
    //     opportunities by city/state (see services/matching.service.js)
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

    // NGO's accepted waste categories — used by the Pickup module to match
    // NGOs to pickups whose wasteTypes overlap with this list (see
    // services/pickup.service.js: getPickupsForNgo, isNgoEligibleForPickup).
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

    // isVerified is the only OTP-related field that remains on the User document.
    // All OTP codes, expiry, and purpose have been moved to the dedicated
    // Otp collection (models/otp.model.js), keeping this schema clean.
    isVerified: {
      type: Boolean,
      default: false,
    },
  },

  {
    timestamps: true,
  }
);

// Hash password before saving — only runs when password field is modified.
//
// SECURITY: the atomic-registration flow (controllers/auth.controllers.js)
// already bcrypt-hashes the password itself before it ever leaves that
// controller, so a plaintext password never sits in the Otp collection.
// That means the value arriving here at User-creation time is *already* a
// bcrypt hash. To avoid hashing an already-hashed value (which would break
// login, since matchPassword would then compare against a hash-of-a-hash),
// the caller sets `this.$locals.skipHash = true` before saving. `$locals`
// is Mongoose's built-in per-document scratch space for passing flags into
// hooks — it is never persisted to MongoDB.
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

// SECURITY: Enforce a single admin account at the database level.
// A partial unique index only applies to documents matching the filter
// (role: 'admin'), so non-admin users are completely unaffected, but
// MongoDB will reject (E11000) any attempt to insert/update a *second*
// document with role: 'admin'. This is race-safe — unlike an
// application-level "does an admin already exist?" check, it holds even
// if two admin-registration requests are verified at the same instant.
UserSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: 'admin' } }
);

module.exports = mongoose.model('User', UserSchema);