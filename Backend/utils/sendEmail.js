// Backend/utils/sendEmail.js
//
// Configures a pooled SMTP transporter using environment variables.
// Supports any SMTP provider (Gmail, SendGrid, Mailgun, etc.) via
// SMTP_HOST / SMTP_PORT / SMTP_SECURE environment variables.
//
// Connection pooling (pool: true) reuses TCP connections across multiple
// messages, significantly reducing send latency under load.
//
// verifySmtpConnection() is called once on server startup to catch
// misconfiguration early without crashing the process on failure.

const nodemailer = require('nodemailer');

// ── Create pooled transporter ──────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',  // true = port 465 (SSL), false = STARTTLS
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASS,
  },
  pool: true,                    // Reuse TCP connections (SMTP connection pool)
  maxConnections: 5,             // Max simultaneous SMTP connections in the pool
  maxMessages: 100,              // Max messages per connection before reconnect
  rateDelta: 1000,               // Time window for rate throttling (ms)
  rateLimit: 10,                 // Max messages per rateDelta window
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production', // Strict in prod only
  },
});

/**
 * Verify the SMTP connection on application startup.
 * Logs a warning if verification fails — never crashes the process,
 * since the email service is non-critical to the API's core function.
 */
const verifySmtpConnection = async () => {
  try {
    await transporter.verify();
    console.log('[SMTP] Connection verified successfully.');
  } catch (err) {
    console.warn('[SMTP] Connection verification failed. Emails may not send:', err.message);
  }
};

/**
 * Send an email.
 *
 * @param {string} to      - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html    - HTML body content
 * @throws {Error} If the send operation fails (allows callers to handle gracefully)
 */
const sendEmail = async ({ to, subject, html }) => {
  const mailOptions = {
    from: `"WasteZero" <${process.env.EMAIL}>`,
    to,
    subject,
    html,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
module.exports.verifySmtpConnection = verifySmtpConnection;