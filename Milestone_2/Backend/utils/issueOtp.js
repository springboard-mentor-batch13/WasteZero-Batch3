// Backend/utils/issueOtp.js
//
// Issues an OTP by:
//   1. Generating a cryptographically secure 6-digit code
//   2. Hashing it with bcrypt (never store plaintext OTPs)
//   3. Upserting a document into the dedicated Otp collection
//      (upsert replaces any previous OTP for the same email+purpose,
//       preventing multi-token accumulation)
//   4. Sending the plaintext OTP to the user by email
//
// The 'payload' parameter is used by the atomic registration flow to
// temporarily store user registration data before the User record exists.

const bcrypt = require('bcryptjs');
const generateOtp = require('./generateOtp');
const emailBody = require('./emailBody');
const OtpModel = require('../models/otp.model');

/**
 * @param {string} email   - Recipient's email address
 * @param {string} purpose - 'verify' | 'forgot-password' | 'change-password'
 * @param {object|null} payload - Optional pending registration data (atomic flow)
 */
const issueOtp = async (email, purpose = 'verify', payload = null) => {
  const otp = generateOtp();
  const hashedOtp = await bcrypt.hash(otp, 10);

  // Upsert: if a document for (email, purpose) already exists, replace it.
  // This invalidates any previously issued OTP for this action and resets
  // the TTL window to 10 minutes from now.
  await OtpModel.findOneAndUpdate(
    { email: email.trim().toLowerCase(), purpose },
    {
      otp: hashedOtp,
      payload: payload ?? null,
      createdAt: new Date(),   // Reset TTL clock on re-issue
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Map purpose to a human-readable email subject/title
  let title = 'Verification';
  if (purpose === 'forgot-password')  title = 'Password Reset';
  if (purpose === 'change-password')  title = 'Password Change';

  // Dispatch the plaintext OTP — the stored copy is always hashed
  await emailBody(email, otp, title);
};

module.exports = issueOtp;