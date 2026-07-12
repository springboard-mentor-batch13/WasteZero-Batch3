const User = require("../models/users.model");
const issueOtp = require("../utils/issueOtp");
const verifyOtp = require("../utils/verifyOtp");
const passwordValidator = require("../utils/passwordValidator");

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
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      user: toSafeUser(user, { includeCreatedAt: true }),
    });

  } catch (error) {
    console.error("Get Profile Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch profile.",
      error: error.message,
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
        message: "User not found.",
      });
    }

    const {
      name,
      location,
      skills,
      bio,
    } = req.body;

    if (typeof name === "string") {
      user.name = name.trim();
    }

    if (typeof location === "string") {
      user.location = location.trim();
    }

    if (skills !== undefined) {

      const uniqueSkills = [...new Set(
        skills
          .map(skill => skill.trim())
          .filter(skill => skill !== "")
      )];

      if (uniqueSkills.length > 10) {
        return res.status(400).json({
          success: false,
          message: "You can add a maximum of 10 skills."
        });
      }

      user.skills = uniqueSkills;
    }

    if (typeof bio === "string") {
      user.bio = bio.trim();
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: toSafeUser(user),
    });

  } catch (error) {
    console.error("Update Profile Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update profile.",
      error: error.message,
    });
  }
};

/* ============================================
   Send Change Password OTP
   POST /api/users/change-password/send-otp
============================================ */

const sendChangePasswordOtp = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first.",
      });
    }

    try {
      await issueOtp(user, "change-password");
    } catch (otpError) {
      console.error("Send Change Password OTP - Email Error:", otpError);

      return res.status(502).json({
        success: false,
        message:
          "Could not send the OTP email right now. Please try again in a moment.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Password change OTP sent successfully.",
    });

  } catch (error) {
    console.error("Send Change Password OTP Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send OTP.",
      error: error.message,
    });
  }
};


/* ============================================
   Change Password Using OTP
   PUT /api/users/change-password/verify-otp
============================================ */

const changePasswordWithOtp = async (req, res) => {
  try {
    const { otp, newPassword } = req.body;

    if (!otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "OTP and new password are required.",
      });
    }

    if (!passwordValidator(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain uppercase, lowercase, number, special character and be at least 8 characters long.",
      });
    }

    // Fetch the user FIRST — isVerified can't be checked before this exists
    const user = await User.findById(req.user.id).select(
      "+password +otp +otpExpiry +otpPurpose"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Defense-in-depth: re-check verification status even though
    // sendChangePasswordOtp already gates this earlier in the flow
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first.",
      });
    }

    const result = await verifyOtp(user, otp, "change-password");

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Prevent using the current password again
    const samePassword = await user.matchPassword(newPassword);

    if (samePassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from the current password.",
      });
    }

    // Password will be hashed by the model's pre-save hook
    user.password = newPassword;

    // Clear OTP
    user.otp = null;
    user.otpExpiry = null;
    user.otpPurpose = null;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password changed successfully.",
    });

  } catch (error) {
    console.error("Change Password Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to change password.",
      error: error.message,
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
