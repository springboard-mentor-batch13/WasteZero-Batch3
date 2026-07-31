// Backend/utils/crypto.js
//
// AES-256-GCM symmetric encryption/decryption for messages and notifications.
// Node.js built-in `crypto` module is used — no extra npm dependency.
//
// Key requirement: CHAT_ENCRYPTION_KEY must be a 64-character hex string
// (i.e. 32 raw bytes) stored in the environment.
//
// Generate a new key with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — standard recommended IV length for GCM mode

/**
 * Retrieves the 32-byte secret key from process.env.CHAT_ENCRYPTION_KEY.
 * Throws immediately if the key is missing or the wrong length so the
 * server fails fast on startup/first-use rather than silently corrupting data.
 */
function getEncryptionKey() {
  const hexKey = process.env.CHAT_ENCRYPTION_KEY;
  if (!hexKey || hexKey.length !== 64) {
    throw new Error(
      'CHAT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes) in environment variables.'
    );
  }
  return Buffer.from(hexKey, 'hex');
}

// ── Startup validation ────────────────────────────────────────────────────────
// Validate CHAT_ENCRYPTION_KEY the moment this module is first required so
// the server fails immediately on boot with a clear error rather than
// starting successfully and then crashing silently on the first encrypt/decrypt
// call. If the key is absent or malformed, exit with a non-zero code so
// process managers (pm2, Docker, systemd) know to restart and alert.
try {
  getEncryptionKey();
} catch (err) {
  console.error('[crypto] FATAL:', err.message);
  process.exit(1);
}


/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * @param {string} text - Plaintext to encrypt (must be a non-empty string)
 * @returns {{ encryptedData: string, iv: string, authTag: string }}
 *   All values are hex-encoded strings suitable for MongoDB storage.
 */
function encrypt(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Content to encrypt must be a non-empty string.');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag,
  };
}

/**
 * Decrypts hex-encoded AES-256-GCM ciphertext back to plaintext.
 *
 * @param {string} encryptedData - Hex-encoded ciphertext
 * @param {string} ivHex         - Hex-encoded IV (12 bytes / 24 hex chars)
 * @param {string} authTagHex    - Hex-encoded GCM authentication tag
 * @returns {string} Decrypted plaintext
 */
function decrypt(encryptedData, ivHex, authTagHex) {
  if (!encryptedData || !ivHex || !authTagHex) {
    throw new Error('Missing required components for AES-256-GCM decryption.');
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = { encrypt, decrypt };
