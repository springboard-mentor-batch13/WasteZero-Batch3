// Backend/config/env.js
//
// Centralized startup environment validation.
//
// Called ONCE at the very top of server.js before any routes or DB connection.
// Designed to be testable: throws an Error instead of calling process.exit()
// directly — the caller (server.js) does the exit so Jest can import this
// module without terminating the test process.
//
// NEVER print actual secret values — only their lengths or existence.

const REQUIRED_VARS = [
  { key: 'MONGO_URI',         minLength: 10,  description: 'MongoDB connection string' },
  { key: 'JWT_SECRET',        minLength: 32,  description: 'JWT signing secret (min 32 chars)' },
  { key: 'CLIENT_URL',        minLength: 10,  description: 'CORS allowed origin URL' },
  { key: 'ADMIN_INIT_SECRET', minLength: 16,  description: 'Admin initialization secret (min 16 chars)' },
];

/**
 * Validates all required environment variables.
 *
 * @throws {Error} Describing the first missing or malformed variable.
 *                 Does NOT call process.exit() — the caller handles that.
 * @returns {void}
 */
const validateEnv = () => {
  const errors = [];

  for (const { key, minLength, description } of REQUIRED_VARS) {
    const value = process.env[key];

    if (!value || value.trim() === '') {
      errors.push(`[ENV] MISSING: ${key} — ${description} is required.`);
      continue;
    }

    if (value.trim().length < minLength) {
      errors.push(
        `[ENV] INVALID: ${key} — ${description}. ` +
        `Must be at least ${minLength} characters (got ${value.trim().length}).`
      );
    }
  }

  // NOTE: CHAT_ENCRYPTION_KEY is validated by Backend/utils/crypto.js at import time.
  // It calls process.exit(1) directly for that key — do not duplicate here.

  if (errors.length > 0) {
    throw new Error('\n' + errors.join('\n'));
  }
};

module.exports = { validateEnv };
