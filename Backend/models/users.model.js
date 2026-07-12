const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please add a full name"],
      trim: true,
    },

    username: {
      type: String,
      required: [true, "Please add a username"],
      unique: true,
      lowercase: true,
      trim: true,
    },

    email: {
      type: String,
      required: [true, "Please add an email"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please add a valid email",
      ],
    },

    password: {
      type: String,
      required: [true, "Please add a password"],
      minlength: [8, "Password must be at least 8 characters long"],
      select: false,
    },

    role: {
      type: String,
      enum: ["volunteer", "ngo", "admin"],
      default: "volunteer",
    },

    location: {
      type: String,
      default: "",
    },

    skills: {
      type: [String],
      default: [],
    },

    bio: {
      type: String,
      default: "",
    },

  //==================OTP related fields==================//
    otp: {
      type: String,
      default: null,
      select: false,
    },

    otpExpiry: {
      type: Date,
      default: null,
      select: false,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    otpPurpose: {
      type: String,
      enum: [
        "verify",
        "forgot-password",
        "change-password",
      ],
      default: null,
      select: false,
    },
  },

  {
    timestamps: true,
  }
);

// Hash password before saving
UserSchema.pre("save", async function () {

    if (!this.isModified("password")) {
        return;
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);

});

// Compare entered password with hashed password
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);