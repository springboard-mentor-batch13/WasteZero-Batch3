// Backend/tests/env.test.js
//
// P1-05: Tests for the centralized environment variable validator (config/env.js).
//
// These tests are pure unit tests — no DB connection, no HTTP server.
// They verify the validator throws correctly on missing/short vars and
// passes without error when all required vars are set.

const { validateEnv } = require('../config/env');

// Save the original env so we can restore it after each test
const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  // Restore all env vars to the setup.js values after each test
  Object.assign(process.env, ORIGINAL_ENV);
});

describe('validateEnv()', () => {

  test('passes when all required vars are set correctly', () => {
    // setup.js already sets all required vars — should not throw
    expect(() => validateEnv()).not.toThrow();
  });

  test('throws when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    expect(() => validateEnv()).toThrow(/JWT_SECRET/);
  });

  test('throws when JWT_SECRET is shorter than 32 characters', () => {
    process.env.JWT_SECRET = 'short';
    expect(() => validateEnv()).toThrow(/JWT_SECRET/);
  });

  test('passes when JWT_SECRET is exactly 32 characters', () => {
    process.env.JWT_SECRET = 'a'.repeat(32);
    expect(() => validateEnv()).not.toThrow();
  });

  test('throws when MONGO_URI is missing', () => {
    delete process.env.MONGO_URI;
    expect(() => validateEnv()).toThrow(/MONGO_URI/);
  });

  test('throws when CLIENT_URL is missing', () => {
    delete process.env.CLIENT_URL;
    expect(() => validateEnv()).toThrow(/CLIENT_URL/);
  });

  test('throws when ADMIN_INIT_SECRET is missing', () => {
    delete process.env.ADMIN_INIT_SECRET;
    expect(() => validateEnv()).toThrow(/ADMIN_INIT_SECRET/);
  });

  test('throws when ADMIN_INIT_SECRET is shorter than 16 characters', () => {
    process.env.ADMIN_INIT_SECRET = 'tooshort';
    expect(() => validateEnv()).toThrow(/ADMIN_INIT_SECRET/);
  });

  test('accumulates multiple errors in a single throw', () => {
    delete process.env.JWT_SECRET;
    delete process.env.ADMIN_INIT_SECRET;
    try {
      validateEnv();
      fail('Expected validateEnv() to throw');
    } catch (err) {
      expect(err.message).toMatch(/JWT_SECRET/);
      expect(err.message).toMatch(/ADMIN_INIT_SECRET/);
    }
  });

});
