const bcrypt = require("bcryptjs");

const generateOtp = require("./generateOtp");
const emailBody = require("./emailBody");

const issueOtp = async (
  user,
  purpose = "verify"
) => {
  const otp = generateOtp();

  const hashedOtp = await bcrypt.hash(otp, 10);

  user.otp = hashedOtp;
  user.otpExpiry = new Date(
    Date.now() + Number(process.env.OTP_EXPIRY || 300000)
  );

  user.otpPurpose = purpose;

  await user.save();

  let title = "Verification";

  if (purpose === "forgot-password")
    title = "Password Reset";

  if (purpose === "change-password")
    title = "Password Change";

  await  emailBody(user.email, otp, title);
};

module.exports = issueOtp;