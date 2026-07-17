// Backend\utils\verifyOtp.js

const bcrypt = require("bcryptjs");

const verifyOtp = async (user, otp, purpose) => {
  if (!user.otp) {
    return {
      success: false,
      message: "OTP not found.",
    };
  }

  if (user.otpPurpose !== purpose) {
    return {
      success: false,
      message: "Invalid OTP purpose.",
    };
  }

  if (user.otpExpiry < Date.now()) {
    return {
      success: false,
      message: "OTP has expired.",
    };
  }

  const valid = await bcrypt.compare(
    otp,
    user.otp
  );

  if (!valid) {
    return {
      success: false,
      message: "Invalid OTP.",
    };
  }

  return {
    success: true,
  };
};

module.exports = verifyOtp;