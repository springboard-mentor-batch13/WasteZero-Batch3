// Backend/utils/emailBody.js
//
// Composes and sends OTP email messages.
// Uses the sendEmail utility (which wraps the pooled SMTP transporter).

const sendEmail = require('./sendEmail');

/**
 * @param {string} email   - Recipient's email address
 * @param {string} otp     - Plaintext OTP code to include in the email body
 * @param {string} purpose - Human-readable label e.g. "Verification", "Password Reset"
 */
const emailBody = async (email, otp, purpose = 'Verification') => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #2e7d32;">WasteZero</h2>

      <p>Your OTP for <strong>${purpose}</strong> is:</p>

      <h1 style="letter-spacing: 8px; color: #1b5e20; font-size: 36px;">
        ${otp}
      </h1>

      <p>This OTP is valid for <strong>10 minutes</strong>.</p>

      <p style="color: #757575;">If you did not request this, please ignore this email.</p>
    </div>
  `;

  await sendEmail({
    to:      email,
    subject: `WasteZero ${purpose} OTP`,
    html,
  });
};

module.exports = emailBody;