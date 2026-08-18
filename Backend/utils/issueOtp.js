// Backend/utils/issueOtp.js


const bcrypt = require('bcryptjs');
const generateOtp = require('./generateOtp');
const emailBody = require('./emailBody');
const OtpModel = require('../models/otp.model');

const OTP_VALIDITY_MS = 10 * 60 * 1000;


const PENDING_REGISTRATION_TTL_MS = 5 * 60 * 60 * 1000;

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
  
  const expireAt = payload
    ? new Date(now.getTime() + PENDING_REGISTRATION_TTL_MS)
    : otpExpiresAt;

  
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