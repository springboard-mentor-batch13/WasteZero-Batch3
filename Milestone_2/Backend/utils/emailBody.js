// Backend\utils\emailBody.js

const sendEmail = require("../utils/sendEmail");

const emailBody = async (email, otp, purpose = "Verification") => {
  const html = `
    <div style="font-family: Arial, sans-serif;">
      <h2>WasteZero</h2>

      <p>Your OTP for <strong>${purpose}</strong> is:</p>

      <h1 style="letter-spacing:5px;">
        ${otp}
      </h1>

      <p>This OTP is valid for <strong>5 minutes</strong>.</p>

      <p>If you didn't request this, please ignore this email.</p>
    </div>
  `;

  await sendEmail(
    email,
    `WasteZero ${purpose} OTP`,
    html
  );
};

module.exports = emailBody;