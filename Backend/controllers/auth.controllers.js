// Backend/controllers/auth.controllers.js

const User = require('../models/users.model');
const generateToken = require('../utils/generateToken');
const issueOtp = require('../utils/issueOtp');
const passwordValidator = require('../utils/passwordValidator');
const verifyOtp = require('../utils/verifyOtp');

/* ============================================
   Register User (Atomic Flow)
   POST /api/auth/register
   
   SECURITY: The User record is NOT created until email is verified.
   Instead, registration data is stored in the OTP document's payload.
   This prevents unverified ghost accounts accumulating in the DB.
============================================ */

const registerUser = async (req, res) => {
  try {
    const { name, username, email, password, role } = req.body;

    // Allow only valid roles
    const allowedRoles = ['volunteer', 'ngo', 'admin'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Allowed roles are volunteer, ngo and admin.',
      });
    }

    // Validate password strength
    if (!passwordValidator(password)) {
      return res.status(400).json({
        success: false,
        message:
          'Password must contain uppercase, lowercase, number, special character and be at least 8 characters long.',
      });
    }

    // Check for existing verified users only
    // (pending registrations are stored in the OTP collection, not the User collection)
    const existingUser = await User.findOne({
      $or: [
        { email: email.trim().toLowerCase() },
        { username: username.trim().toLowerCase() },
      ],
    }).lean();

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email or username already exists.',
      });
    }

    // Store registration payload inside the OTP document — no User created yet.
    // The User record will be atomically created when the OTP is verified.
    const pendingPayload = {
      name: name.trim(),
      username: username.trim().toLowerCase(),
      email: email.trim().toLowerCase(),
      password,   // Will be hashed by the User model pre-save hook on creation
      role,
    };

    try {
      await issueOtp(email.trim().toLowerCase(), 'verify', pendingPayload);
    } catch (otpError) {
      console.error('OTP Send Error during registration:', otpError);
      return res.status(500).json({
        success: false,
        message:
          'Registration failed while sending the verification email. Please try registering again.',
      });
    }

    return res.status(201).json({
      success: true,
      message:
        'Registration initiated. Please verify your email using the OTP sent to your email address.',
    });
  } catch (error) {
    console.error('Register Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Registration failed.',
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
        message: 'Username/email and password are required.',
      });
    }

    // Find user by username or email
    const user = await User.findOne({
      $or: [
        { username: identifier.trim().toLowerCase() },
        { email: identifier.trim().toLowerCase() },
      ],
    }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username/email or password.',
      });
    }

    // Constant-time password comparison (via bcrypt)
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username/email or password.',
      });
    }

    // Email must be verified before login is permitted
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message:
          'Your email is not verified. Please verify your account before logging in.',
      });
    }

    // Issue JWT
    const token = generateToken(user._id, user.role);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
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
    console.error('Login Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Login failed.',
    });
  }
};

/* ============================================
   Verify Email OTP (Atomic User Creation)
   POST /api/auth/verify-otp
   
   On valid OTP: extract payload from OTP doc,
   create the User record, delete the OTP doc.
============================================ */

const verifyUserOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const result = await verifyOtp(normalizedEmail, otp, 'verify');

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Check if user was already created (handles duplicate verify-otp submissions)
    const existingUser = await User.findOne({ email: normalizedEmail }).lean();
    if (existingUser) {
      return res.status(200).json({
        success: true,
        message: 'Email already verified. You can now log in.',
      });
    }

    // Extract registration payload stored in the OTP document
    const payload = result.payload;
    if (!payload) {
      return res.status(400).json({
        success: false,
        message: 'Registration data not found. Please register again.',
      });
    }

    // Atomically create the verified User record.
    //
    // Race note: the duplicate-username check in registerUser only queries
    // the User collection, and a pending registration lives only in the
    // OTP document's payload (not uniqueness-enforced) until this point.
    // So two people can both start registering with the same username —
    // neither exists as a User yet, so both pass that check — and whoever
    // verifies second hits the username unique-index here. That's caught
    // explicitly below instead of falling through to the generic 500,
    // since by this point their OTP has already been consumed (deleted by
    // verifyOtp) and they need a clear signal to register again.
    try {
      await User.create({
        name: payload.name,
        username: payload.username,
        email: payload.email,
        password: payload.password,   // Pre-save hook hashes this automatically
        role: payload.role,
        isVerified: true,
      });
    } catch (createError) {
      if (createError.code === 11000) {
        const field = Object.keys(createError.keyValue || {})[0] || 'username';
        return res.status(409).json({
          success: false,
          message:
            field === 'username'
              ? 'That username was taken by another registration just now. Please register again with a different username.'
              : `That ${field} was just registered by someone else. Please register again.`,
        });
      }
      throw createError;
    }

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully. You can now log in.',
    });
  } catch (error) {
    console.error('Verify OTP Error:', error);
    return res.status(500).json({
      success: false,
      message: 'OTP verification failed.',
    });
  }
};

/* ============================================
   Resend Verification OTP
   POST /api/auth/resend-otp
   
   SECURITY: Returns a generic success message regardless of whether
   the email exists — prevents user enumeration attacks.
============================================ */

const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Lookup the pending OTP document (not the User — user may not exist yet)
    const OtpModel = require('../models/otp.model');

    const otpDoc = await OtpModel.findOne({ email: normalizedEmail, purpose: 'verify' });

    // Privacy: do not reveal whether the email is known to us
    if (!otpDoc || !otpDoc.payload) {
      return res.status(200).json({
        success: true,
        message: 'If this email is awaiting verification, a new OTP has been sent.',
      });
    }

    await issueOtp(normalizedEmail, 'verify', otpDoc.payload);

    return res.status(200).json({
      success: true,
      message: 'If this email is awaiting verification, a new OTP has been sent.',
    });
  } catch (error) {
    console.error('Resend OTP Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to resend OTP.',
    });
  }
};

/* ============================================
   Forgot Password
   POST /api/auth/forgot-password
   
   SECURITY: Returns a generic message regardless of whether the email
   exists — prevents user enumeration attacks.
============================================ */

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Only dispatch if a verified user exists; never reveal which branch runs
    const user = await User.findOne({ email: normalizedEmail, isVerified: true }).lean();

    if (user) {
      try {
        await issueOtp(normalizedEmail, 'forgot-password');
      } catch (otpError) {
        console.error('Forgot Password OTP Error:', otpError);
        // Intentional: swallow error to keep generic response
      }
    }

    // Always return the same response regardless of user existence
    return res.status(200).json({
      success: true,
      message:
        'If this email is registered, a password reset OTP has been sent.',
    });
  } catch (error) {
    console.error('Forgot Password Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process the request.',
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
        message: 'Email, OTP and new password are required.',
      });
    }

    if (!passwordValidator(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          'Password must contain uppercase, lowercase, number, special character and be at least 8 characters long.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Verify OTP against the Otp collection
    const result = await verifyOtp(normalizedEmail, otp, 'forgot-password');

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Load the user document with the password field for comparison
    const user = await User.findOne({ email: normalizedEmail }).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    // Prevent reusing the current password
    const samePassword = await user.matchPassword(newPassword);
    if (samePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from the current password.',
      });
    }

    // Assign new password — pre-save hook will hash it
    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password reset successful.',
    });
  } catch (error) {
    console.error('Reset Password Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Password reset failed.',
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