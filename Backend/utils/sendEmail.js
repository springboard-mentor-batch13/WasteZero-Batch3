// // Backend/utils/sendEmail.js

// const nodemailer = require('nodemailer');

// // ── Create pooled transporter ──────────────────────────────────────────────
// const transporter = nodemailer.createTransport({
//   host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
//   port:   parseInt(process.env.SMTP_PORT || '587', 10),
//   secure: process.env.SMTP_SECURE === 'true',  // true = port 465 (SSL), false = STARTTLS
//   auth: {
//     user: process.env.EMAIL,
//     pass: process.env.EMAIL_PASS,
//   },
//   pool: true,                    // Reuse TCP connections (SMTP connection pool)
//   maxConnections: 5,             // Max simultaneous SMTP connections in the pool
//   maxMessages: 100,              // Max messages per connection before reconnect
//   rateDelta: 1000,               // Time window for rate throttling (ms)
//   rateLimit: 10,                 // Max messages per rateDelta window
//   tls: {
//     rejectUnauthorized: process.env.NODE_ENV === 'production', // Strict in prod only
//   },
// });


// const verifySmtpConnection = async () => {
//   try {
//     await transporter.verify();
//     console.log('[SMTP] Connection verified successfully.');
//   } catch (err) {
//     console.warn('[SMTP] Connection verification failed. Emails may not send:', err.message);
//   }
// };

// /**
//  * Send an email.
//  *
//  * @param {string} to      - Recipient email address
//  * @param {string} subject - Email subject
//  * @param {string} html    - HTML body content
//  * @throws {Error} If the send operation fails (allows callers to handle gracefully)
//  */
// const sendEmail = async ({ to, subject, html }) => {
//   const mailOptions = {
//     from: `"WasteZero" <${process.env.EMAIL}>`,
//     to,
//     subject,
//     html,
//   };

//   await transporter.sendMail(mailOptions);
// };

// module.exports = sendEmail;
// module.exports.verifySmtpConnection = verifySmtpConnection;




const { BrevoClient } = require('@getbrevo/brevo');
 
const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
});
 
/**
 * Send an email using Brevo API.
 *
 * @param {string} to      - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html    - HTML body
 */
const sendEmail = async ({ to, subject, html }) => {
  try {
    const response = await brevo.transactionalEmails.sendTransacEmail({
      sender: {
        name: process.env.EMAIL_FROM_NAME || 'WasteZero',
        email: process.env.EMAIL_FROM,
      },
      to: [
        {
          email: to,
        },
      ],
      subject,
      htmlContent: html,
    });
 
    console.log('[EMAIL] Brevo sent successfully:', response.messageId);
 
    return response;
  } catch (error) {
    console.error('[EMAIL] Brevo error:', error);
    throw error;
  }
};
 
module.exports = sendEmail;
 