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

// The OTP code itself is always only valid for 10 minutes — this is the
// security-critical window and is unaffected by how long the document
// persists in the DB (see models/otp.model.js).
const OTP_VALIDITY_MS = 10 * 60 * 1000;

// Pending registration payloads (purpose 'verify' + a payload) are kept
// around for 24 hours so resendOtp() can still find them and issue a fresh
// code well after the original 10-minute code has expired, instead of
// silently discarding the user's in-progress registration.
const PENDING_REGISTRATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * @param {string} email   - Recipient's email address
 * @param {string} purpose - 'verify' | 'forgot-password' | 'change-password'
 * @param {object|null} payload - Optional pending registration data (atomic flow)
 */
const issueOtp = async (email, purpose = 'verify', payload = null) => {
  const otp = generateOtp();
  const hashedOtp = await bcrypt.hash(otp, 10);

  const now = new Date();
  const otpExpiresAt = new Date(now.getTime() + OTP_VALIDITY_MS);
  // Documents carrying a pending-registration payload live much longer
  // than the code's own validity window; everything else (a bare OTP with
  // no payload) is cleaned up right when its code expires.
  const expireAt = payload
    ? new Date(now.getTime() + PENDING_REGISTRATION_TTL_MS)
    : otpExpiresAt;

  // Upsert: if a document for (email, purpose) already exists, replace it.
  // This invalidates any previously issued OTP for this action, resets the
  // attempt counter, and resets both expiry clocks.
  //
  // Race note: a plain upsert is not fully atomic against another
  // concurrent upsert for the same (email, purpose) that also finds no
  // existing document — both can attempt an insert, and the unique index
  // on {email, purpose} causes one of them to fail with E11000 (e.g. a user
  // double-clicking "resend" fast enough to fire two requests before the
  // first has written anything). Retry once as a plain update in that case
  // — by the time we retry, the other request's insert has landed, so this
  // becomes a normal update instead of an insert.
  const update = {
    otp: hashedOtp,
    payload: payload ?? null,
    createdAt: now,
    otpExpiresAt,
    attempts: 0,
    expireAt,
  };
  const filter = { email: email.trim().toLowerCase(), purpose };

  try {
    await OtpModel.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      await OtpModel.findOneAndUpdate(filter, update, { new: true });
    } else {
      throw err;
    }
  }

  // Map purpose to a human-readable email subject/title
  let title = 'Verification';
  if (purpose === 'forgot-password')  title = 'Password Reset';
  if (purpose === 'change-password')  title = 'Password Change';

  // Dispatch the plaintext OTP — the stored copy is always hashed
  await emailBody(email, otp, title);
};

module.exports = issueOtp;