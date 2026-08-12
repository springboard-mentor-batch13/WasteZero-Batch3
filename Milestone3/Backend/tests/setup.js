// Backend/tests/setup.js
//
// Global Jest test setup.
// Sets bare-minimum environment variables so modules that validate env
// at import time (crypto.js, config/env.js) do not crash or call process.exit().
//
// IMPORTANT: This file is loaded BEFORE any test file runs via
// jest.config.js `globalSetup` → actually via `setupFiles` so that
// process.env is populated before any module import chain runs.

// Minimum 32-char JWT secret to satisfy validateEnv()
process.env.JWT_SECRET     = 'testsecret_that_is_exactly_32_chars!!';
process.env.MONGO_URI      = 'mongodb://localhost:27017/wastezero_test';
process.env.CLIENT_URL     = 'http://localhost:4200';
process.env.ADMIN_INIT_SECRET = 'test_admin_init_secret_16';
process.env.NODE_ENV       = 'test';

// 64-char hex key to satisfy crypto.js getEncryptionKey() validation.
// This is a dummy test key — NEVER use this value in production.
process.env.CHAT_ENCRYPTION_KEY = 'a'.repeat(64);

// SMTP / Cloudinary — set stubs so imports don't fail
process.env.SMTP_HOST      = 'smtp.test.local';
process.env.SMTP_PORT      = '587';
process.env.SMTP_SECURE    = 'false';
process.env.EMAIL          = 'test@test.local';
process.env.EMAIL_PASS     = 'testpassword';
process.env.CLOUDINARY_CLOUD_NAME = 'test_cloud';
process.env.CLOUDINARY_API_KEY    = 'test_api_key';
process.env.CLOUDINARY_API_SECRET = 'test_api_secret';
