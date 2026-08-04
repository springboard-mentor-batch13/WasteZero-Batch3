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


UserSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: 'admin' } }
);

module.exports = mongoose.model('User', UserSchema);