const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits - standard recommended IV length for GCM

/**
 * Retrieves the 32-byte secret key from process.env.CHAT_ENCRYPTION_KEY
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

/**
 * Encrypts plaintext string using AES-256-GCM
 * @param {string} text - Plaintext message
 * @returns {{ encryptedData: string, iv: string, authTag: string }}
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
 * Decrypts hex ciphertext using AES-256-GCM
 * @param {string} encryptedData - Hex ciphertext
 * @param {string} ivHex - Hex IV
 * @param {string} authTagHex - Hex Auth Tag
 * @returns {string} Plaintext string
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