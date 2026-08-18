// Backend/controllers/users.controllers.js

const User = require('../models/users.model');
const issueOtp = require('../utils/issueOtp');
const verifyOtp = require('../utils/verifyOtp');
const passwordValidator = require('../utils/passwordValidator');
const { checkProfileCompleteness } = require('../utils/profileCompleteness');

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
    locations: user.locations,
    wasteTypes: user.wasteTypes,
    skills: user.skills,
    bio: user.bio,
    isVerified: user.isVerified,
    settings: user.settings,
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

    const { name, locations, wasteTypes, skills, bio, settings } = req.body;

    if (typeof name === 'string') {
      user.name = name.trim();
    }

    // Coverage/home area (primary + secondary city/state) is used by both
    // the Pickup module (NGO coverage matching) and the volunteer-opportunity
    // matching engine (services/matching.service.js), so any role may set it.
    if (locations !== undefined) {
      const sanitizeLoc = (loc) => ({
        city: typeof loc?.city === 'string' ? loc.city.trim() : undefined,
        state: typeof loc?.state === 'string' ? loc.state.trim() : undefined,
      });

      user.locations = {
        primary: locations.primary ? sanitizeLoc(locations.primary) : undefined,
        secondary: Array.isArray(locations.secondary)
          ? locations.secondary.map(sanitizeLoc)
          : [],
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

    if (settings && typeof settings === 'object') {
      if (!user.settings) user.settings = {};
      if (typeof settings.emailNotifications === 'boolean') user.settings.emailNotifications = settings.emailNotifications;
      if (typeof settings.pushNotifications === 'boolean') user.settings.pushNotifications = settings.pushNotifications;
      if (typeof settings.messageAlerts === 'boolean') user.settings.messageAlerts = settings.messageAlerts;
      if (typeof settings.pickupAlerts === 'boolean') user.settings.pickupAlerts = settings.pickupAlerts;
      if (typeof settings.opportunityAlerts === 'boolean') user.settings.opportunityAlerts = settings.opportunityAlerts;
      if (['light', 'dark', 'system'].includes(settings.themePreference)) user.settings.themePreference = settings.themePreference;
    }

   
    const { complete, missing } = checkProfileCompleteness(user);
    if (!complete) {
      return res.status(400).json({
        success: false,
        message: `Please complete your profile before saving. Missing: ${missing.join(', ')}.`,
        missingFields: missing,
      });
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


/* ============================================
   Search Users by Username
   GET /api/users/search?username=&targetRole=
   Volunteer callers may only search NGOs.
   NGO callers may only search Volunteers.
   Admin callers may search Volunteers and NGOs.
============================================ */

const searchUsers = async (req, res) => {
  try {
    const { username, targetRole } = req.query;

    if (!username || typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({
        success: false,
        message: "Query param 'username' is required.",
      });
    }

    const callerRole = req.user.role;
    let roleFilter;

    if (callerRole === 'admin') {
      if (targetRole) {
        if (!['volunteer', 'ngo'].includes(targetRole)) {
          return res.status(403).json({
            success: false,
            message: 'Admin search target must be either volunteer or ngo.',
          });
        }
        roleFilter = targetRole;
      } else {
        roleFilter = { $in: ['volunteer', 'ngo'] };
      }
    } else {
      // Enforce the allowed target-role pairing for non-admin callers.
      // Volunteer → may only search NGOs.
      // NGO       → may only search Volunteers.
      const allowedTargetRole = callerRole === 'volunteer' ? 'ngo' : 'volunteer';

      if (targetRole && targetRole !== allowedTargetRole) {
        return res.status(403).json({
          success: false,
          message: `As a ${callerRole} you may only search ${allowedTargetRole} users.`,
        });
      }

      roleFilter = targetRole || allowedTargetRole;
    }

    // Case-insensitive prefix match on username or name. Escaping special regex chars
    // prevents ReDoS from crafted input (same convention as other services).
    const escapedQuery = username.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(`^${escapedQuery}`, 'i');

    const users = await User.find({
      role: roleFilter,
      $or: [
        { username: searchRegex },
        { name: searchRegex },
      ],
    })
      .select('_id name username role')
      .limit(10)
      .lean();

    return res.status(200).json({
      success: true,
      data: users,
      message: 'Users fetched successfully.',
    });
  } catch (error) {
    console.error('Search Users Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to search users.',
    });
  }
};

const defaultSettings = {
  emailNotifications: true,
  pushNotifications: true,
  messageAlerts: true,
  pickupAlerts: true,
  opportunityAlerts: true,
  themePreference: 'system',
};

/* ============================================
   Get Logged-in User Settings
   GET /api/users/settings
============================================ */
const getUserSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('settings').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.status(200).json({
      success: true,
      settings: { ...defaultSettings, ...(user.settings || {}) },
    });
  } catch (error) {
    console.error('Get Settings Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch settings.' });
  }
};

/* ============================================
   Update Logged-in User Settings
   PUT /api/users/settings
============================================ */
const updateUserSettings = async (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' && req.body.settings ? req.body.settings : (req.body || {});
    const { emailNotifications, pushNotifications, messageAlerts, pickupAlerts, opportunityAlerts, themePreference } = payload;
    
    const updateFields = {};
    if (typeof emailNotifications === 'boolean') updateFields['settings.emailNotifications'] = emailNotifications;
    if (typeof pushNotifications === 'boolean') updateFields['settings.pushNotifications'] = pushNotifications;
    if (typeof messageAlerts === 'boolean') updateFields['settings.messageAlerts'] = messageAlerts;
    if (typeof pickupAlerts === 'boolean') updateFields['settings.pickupAlerts'] = pickupAlerts;
    if (typeof opportunityAlerts === 'boolean') updateFields['settings.opportunityAlerts'] = opportunityAlerts;
    if (['light', 'dark', 'system'].includes(themePreference)) updateFields['settings.themePreference'] = themePreference;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select('settings').lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Settings updated successfully.',
      settings: { ...defaultSettings, ...(user.settings || {}) },
    });
  } catch (error) {
    console.error('Update Settings Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update settings.' });
  }
};

/* ============================================
   Get Platform Admin Contact
   GET /api/users/admin-contact
   Accessible to authenticated Volunteers and NGOs for support/messaging.
============================================ */
const getAdminContact = async (req, res) => {
  try {
    const admin = await User.findOne({ role: 'admin', isSuspended: { $ne: true } })
      .select('_id name username email role')
      .lean();

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Platform administrator contact not found.',
      });
    }

    return res.status(200).json({
      success: true,
      data: admin,
      message: 'Admin contact fetched successfully.',
    });
  } catch (error) {
    console.error('Get Admin Contact Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch admin contact.',
    });
  }
};

// Export Controllers
module.exports = {
  getUserProfile,
  updateUserProfile,
  getUserSettings,
  updateUserSettings,
  getAdminContact,
  sendChangePasswordOtp,
  changePasswordWithOtp,
  searchUsers,
};
