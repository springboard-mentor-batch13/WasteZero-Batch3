// Backend\controllers\auth.controllers.js

const User = require("../models/users.model");
const generateToken = require("../utils/generateToken");
const issueOtp = require("../utils/issueOtp");
const passwordValidator = require("../utils/passwordValidator");
const verifyOtp = require("../utils/verifyOtp");

/* ============================================
   Register User
   POST /api/auth/register
============================================ */

const registerUser = async (req, res) => {
  try {
    const { name, username, email, password, role } = req.body;
    const allowedRoles = ["volunteer", "ngo"];
    const userRole = allowedRoles.includes(role) ? role : "volunteer";
    // Validate password
    if (!passwordValidator(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain uppercase, lowercase, number, special character and be at least 8 characters long.",
      });
    }

    // Check existing user
    const existingUser = await User.findOne({
      $or: [
        { email: email.trim().toLowerCase() },
        { username: username.toLowerCase() },
      ],
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email or username already exists.",
      });
    }

    // Create user
    const user = await User.create({
      name: name.trim(),
      username: username.trim().toLowerCase(),
      email: email.trim().toLowerCase(),
      password,
      role: userRole,
      isVerified: false,
    });

    // Send verification OTP — if this fails, roll back the user
    try {
      await issueOtp(user, "verify");
    } catch (otpError) {
      console.error("OTP Send Error during registration:", otpError);

      // Roll back: remove the user so they can retry registration cleanly
      await User.findByIdAndDelete(user._id);

      return res.status(500).json({
        success: false,
        message:
          "Registration failed while sending the verification email. Please try registering again.",
      });
    }

    return res.status(201).json({
      success: true,
      message:
        "Registration successful. Please verify your email using the OTP sent to your email address.",
    });
  } catch (error) {
    console.error("Register Error:", error);

    return res.status(500).json({
      success: false,
      message: "Registration failed.",
      error: error.message,
    });
  }
};

/* ============================================
   Login User
   POST /api/auth/login
============================================ */

const loginUser = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Username/email and password are required.",
      });
    }

    // Find user by username or email
    const user = await User.findOne({
      $or: [
        { username: identifier.trim().toLowerCase() },
        { email: identifier.trim().toLowerCase() },
      ],
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid username/email or password.",
      });
    }

    // Check password
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid username/email or password.",
      });
    }

    // Check email verification
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message:
          "Your email is not verified. Please verify your account before logging in.",
      });
    }

    // Generate JWT
    const token = generateToken(user._id, user.role);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed.",
      error: error.message,
    });
  }
};

/* ============================================
   Verify Email OTP
   POST /api/auth/verify-otp
============================================ */

const verifyUserOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required.",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+otp +otpExpiry +otpPurpose");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const result = await verifyOtp(user, otp, "verify");

    if (!result.success) {
      return res.status(400).json(result);
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;
    user.otpPurpose = null;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Email verified successfully.",
    });

  } catch (error) {
    console.error("Verify OTP Error:", error);

    return res.status(500).json({
      success: false,
      message: "OTP verification failed.",
      error: error.message,
    });
  }
};


/* ============================================
   Resend Verification OTP
   POST /api/auth/resend-otp
============================================ */

const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "User is already verified.",
      });
    }

    await issueOtp(user, "verify");

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully.",
    });

  } catch (error) {
    console.error("Resend OTP Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to resend OTP.",
      error: error.message,
    });
  }
};

/* ============================================
   Forgot Password
   POST /api/auth/forgot-password
============================================ */

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (!user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Please verify your email before resetting your password.",
      });
    }

    await issueOtp(user, "forgot-password");

    return res.status(200).json({
      success: true,
      message: "Password reset OTP sent successfully.",
    });

  } catch (error) {
    console.error("Forgot Password Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send password reset OTP.",
      error: error.message,
    });
  }
};


/* ============================================
   Reset Password
   POST /api/auth/reset-password
============================================ */

const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, OTP and new password are required.",
      });
    }

    if (!passwordValidator(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain uppercase, lowercase, number, special character and be at least 8 characters long.",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+password +otp +otpExpiry +otpPurpose");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const result = await verifyOtp(user, otp, "forgot-password");

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Prevent reusing the current password
    const samePassword = await user.matchPassword(newPassword);

    if (samePassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from the current password.",
      });
    }

    // Password will be hashed by the pre-save hook
    user.password = newPassword;

    // Clear OTP
    user.otp = null;
    user.otpExpiry = null;
    user.otpPurpose = null;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successful.",
    });

  } catch (error) {
    console.error("Reset Password Error:", error);

    return res.status(500).json({
      success: false,
      message: "Password reset failed.",
      error: error.message,
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  verifyUserOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
};