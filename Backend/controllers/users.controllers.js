// Backend/controllers/users.controllers.js

const User = require('../models/users.model');
const issueOtp = require('../utils/issueOtp');
const verifyOtp = require('../utils/verifyOtp');
const passwordValidator = require('../utils/passwordValidator');

/* ============================================
   Helper: Shape a safe user object for responses
============================================ */
const toSafeUser = (user, { includeCreatedAt = false } = {}) => {
  const safeUser = {
    id: user._id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    location: user.location,
    locations: user.locations,
    wasteTypes: user.wasteTypes,
    skills: user.skills,
    bio: user.bio,
    isVerified: user.isVerified,
  };

  if (includeCreatedAt) {
    safeUser.createdAt = user.createdAt;
  }

  return safeUser;
};

/* ============================================
   Get Logged-in User Profile
   GET /api/users/profile
============================================ */

const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    return res.status(200).json({
      success: true,
      user: toSafeUser(user, { includeCreatedAt: true }),
    });
  } catch (error) {
    console.error('Get Profile Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch profile.',
    });
  }
};

/* ============================================
   Update User Profile
   PUT /api/users/profile
============================================ */

const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    const { name, location, locations, wasteTypes, skills, bio } = req.body;

    if (typeof name === 'string') {
      user.name = name.trim();
    }

    if (typeof location === 'string') {
      user.location = location.trim();
    }

    // Coverage/home area (city + state) is used by both the Pickup module
    // (NGO coverage matching) and the volunteer-opportunity matching engine
    // (services/matching.service.js), so any role may set it.
    if (locations !== undefined) {
      const sanitizeLoc = (loc) => ({
        city: typeof loc?.city === 'string' ? loc.city.trim() : undefined,
        state: typeof loc?.state === 'string' ? loc.state.trim() : undefined,
      });

      user.locations = {
        primary: locations.primary ? sanitizeLoc(locations.primary) : undefined,
        secondary: Array.isArray(locations.secondary)
          ? locations.secondary.map(sanitizeLoc)
          : undefined,
      };
    }

    // wasteTypes is an NGO-only concept — the Pickup module only ever reads
    // it off NGO users (services/pickup.service.js).
    if (user.role === 'ngo' && wasteTypes !== undefined) {
      if (!Array.isArray(wasteTypes)) {
        return res.status(400).json({
          success: false,
          message: 'wasteTypes must be an array of strings.',
        });
      }

      const uniqueWasteTypes = [
        ...new Set(
          wasteTypes
            .filter((w) => typeof w === 'string')
            .map((w) => w.trim())
            .filter((w) => w !== '')
        ),
      ];

      user.wasteTypes = uniqueWasteTypes;
    }

    if (skills !== undefined) {
      const uniqueSkills = [
        ...new Set(
          skills
            .map((skill) => skill.trim())
            .filter((skill) => skill !== '')
        ),
      ];

      if (uniqueSkills.length > 10) {
        return res.status(400).json({
          success: false,
          message: 'You can add a maximum of 10 skills.',
        });
      }

      user.skills = uniqueSkills;
    }

    if (typeof bio === 'string') {
      user.bio = bio.trim();
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: toSafeUser(user),
    });
  } catch (error) {
    console.error('Update Profile Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile.',
    });
  }
};

/* ============================================
   Send Change Password OTP
   POST /api/users/change-password/send-otp
   
   Sends OTP to the logged-in user's email.
   OTP is written to the Otp collection, not the User document.
============================================ */

const sendChangePasswordOtp = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email first.',
      });
    }

    try {
      await issueOtp(user.email, 'change-password');
    } catch (otpError) {
      console.error('Send Change Password OTP - Email Error:', otpError);
      return res.status(502).json({
        success: false,
        message:
          'Could not send the OTP email right now. Please try again in a moment.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Password change OTP sent successfully.',
    });
  } catch (error) {
    console.error('Send Change Password OTP Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send OTP.',
    });
  }
};

/* ============================================
   Change Password Using OTP
   PUT /api/users/change-password/verify-otp
   
   Verifies OTP from the Otp collection and updates the password.
============================================ */

const changePasswordWithOtp = async (req, res) => {
  try {
    const { otp, newPassword } = req.body;

    if (!otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'OTP and new password are required.',
      });
    }

    if (!passwordValidator(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          'Password must contain uppercase, lowercase, number, special character and be at least 8 characters long.',
      });
    }

    // Fetch user with password field for comparison
    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    // Defence-in-depth: re-check even though sendChangePasswordOtp already gates this
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email first.',
      });
    }

    // Verify OTP against the Otp collection using the user's email
    const result = await verifyOtp(user.email, otp, 'change-password');

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Prevent reusing the current password
    const samePassword = await user.matchPassword(newPassword);
    if (samePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from the current password.',
      });
    }

    // Assign new password — pre-save hook hashes it
    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully.',
    });
  } catch (error) {
    console.error('Change Password Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to change password.',
    });
  }
};

// Export Controllers
module.exports = {
  getUserProfile,
  updateUserProfile,
  sendChangePasswordOtp,
  changePasswordWithOtp,
};
