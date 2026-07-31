// Backend/controllers/auth.controllers.js

const bcrypt = require('bcryptjs');
const User = require('../models/users.model');
const generateToken = require('../utils/generateToken');
const issueOtp = require('../utils/issueOtp');
const passwordValidator = require('../utils/passwordValidator');
const verifyOtp = require('../utils/verifyOtp');
const OtpModel = require('../models/otp.model');

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

    // SECURITY: Only one admin account may ever exist. This is an early,
    // friendly check (avoids sending an OTP email for a request that can
    // never succeed) — the real, race-safe guarantee is the partial unique
    // index on { role: 'admin' } in the User model, enforced again below
    // when the OTP is verified and the User document is actually created.
    if (role === 'admin') {
      const adminExists = await User.exists({ role: 'admin' });
      if (adminExists) {
        return res.status(403).json({
          success: false,
          message: 'An admin account already exists. Only one admin is allowed.',
        });
      }
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

    // SECURITY: Hash the password now, before it ever gets written to the
    // Otp collection. Otp documents carrying a registration payload are
    // deliberately kept around for up to 24h (PENDING_REGISTRATION_TTL_MS,
    // see models/otp.model.js) so resendOtp keeps working — that's far too
    // long for a plaintext password to sit unencrypted in MongoDB. Hashing
    // here means only the bcrypt hash ever touches the Otp collection (and
    // any resend of it via resendOtp), and if a user re-registers before
    // verifying, the old plaintext was never stored at all.
    const hashedPassword = await bcrypt.hash(password, 10);

    // Store registration payload inside the OTP document — no User created yet.
    // The User record will be atomically created when the OTP is verified.
    // NOTE: password is already hashed above — the User pre-save hook is
    // told to skip re-hashing it (see models/users.model.js / $locals.skipHash
    // usage in verifyUserOtp below).
    const pendingPayload = {
      name: name.trim(),
      username: username.trim().toLowerCase(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
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
        locations: user.locations,
        wasteTypes: user.wasteTypes,
        skills: user.skills,
        bio: user.bio,
        isVerified: user.isVerified,
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
      // payload.password is already a bcrypt hash (hashed in registerUser
      // before it was ever written to the Otp document) — set skipHash so
      // the pre-save hook doesn't hash it a second time.
      const newUser = new User({
        name: payload.name,
        username: payload.username,
        email: payload.email,
        password: payload.password,
        role: payload.role,
        isVerified: true,
      });
      newUser.$locals.skipHash = true;
      await newUser.save();
    } catch (createError) {
      if (createError.code === 11000) {
        const field = Object.keys(createError.keyValue || {})[0] || 'username';

        // Race case: two admin registrations were both verified before
        // either User document existed, so the early check in registerUser
        // couldn't catch it. The partial unique index on { role: 'admin' }
        // rejects the second insert here — surface a clear message instead
        // of the generic duplicate-field one.
        if (field === 'role' && payload.role === 'admin') {
          return res.status(409).json({
            success: false,
            message:
              'An admin account was just registered by someone else. Only one admin is allowed.',
          });
        }

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