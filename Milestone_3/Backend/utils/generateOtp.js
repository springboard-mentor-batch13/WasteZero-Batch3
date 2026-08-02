// Backend/utils/generateOtp.js
//
// Generates a cryptographically secure 6-digit OTP using Node's built-in
// crypto module.  crypto.randomInt(min, max) uses a CSPRNG (Cryptographically
// Secure Pseudo-Random Number Generator), unlike Math.random() which is
// predictable and unsuitable for security-sensitive tokens.

const { randomInt } = require('crypto');

const generateOTP = () => {
  // randomInt(100000, 1000000) → integer in [100000, 999999] inclusive
  return randomInt(100000, 1000000).toString();
};

module.exports = generateOTP;