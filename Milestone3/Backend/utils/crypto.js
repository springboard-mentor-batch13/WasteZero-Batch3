// Backend/utils/crypto.js

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — standard recommended IV length for GCM mode


function getEncryptionKey() {
  const hexKey = process.env.CHAT_ENCRYPTION_KEY;
  if (!hexKey || hexKey.length !== 64) {
    throw new Error(
      'CHAT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes) in environment variables.'
    );
  }
  return Buffer.from(hexKey, 'hex');
}


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
