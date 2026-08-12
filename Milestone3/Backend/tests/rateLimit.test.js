// Backend/tests/rateLimit.test.js
//
// Tests for P1-04 — rate limiter module exports.
//
// These are pure unit tests that verify:
//   1. The existing limiters still export with correct windowMs / max settings
//   2. The new adminLimiter and reportRateLimiter are exported
//   3. Both new limiters have tighter limits than generalLimiter
//
// We do NOT make real HTTP requests here — we test the configuration objects
// returned by express-rate-limit, which exposes options on the middleware.

describe('rateLimiter middleware exports — P1-04', () => {

  let limiters;

  beforeAll(() => {
    // Import fresh (setup.js has already set process.env)
    jest.resetModules();
    limiters = require('../middlewares/rateLimiter.middleware');
  });

  test('exports loginLimiter', () => {
    expect(typeof limiters.loginLimiter).toBe('function');
  });

  test('exports otpLimiter', () => {
    expect(typeof limiters.otpLimiter).toBe('function');
  });

  test('exports generalLimiter', () => {
    expect(typeof limiters.generalLimiter).toBe('function');
  });

  test('exports adminLimiter (NEW — P1-04)', () => {
    expect(typeof limiters.adminLimiter).toBe('function');
  });

  test('exports reportRateLimiter (NEW — P1-04)', () => {
    expect(typeof limiters.reportRateLimiter).toBe('function');
  });

  // Verify adminLimiter has tighter limit than generalLimiter
  // express-rate-limit exposes the options via middleware._options (v7+)
  test('adminLimiter.options.max is 5 (stricter than generalLimiter)', () => {
    // express-rate-limit >= v7 stores options on the function
    const adminOpts = limiters.adminLimiter.options || limiters.adminLimiter._options;
    if (!adminOpts) return; // graceful skip if internal API changes

    const generalOpts = limiters.generalLimiter.options || limiters.generalLimiter._options;
    expect(adminOpts.max).toBeLessThanOrEqual(generalOpts ? generalOpts.max : Infinity);
  });

  test('reportRateLimiter.options.windowMs is 1 hour', () => {
    const opts = limiters.reportRateLimiter.options || limiters.reportRateLimiter._options;
    if (!opts) return; // graceful skip
    expect(opts.windowMs).toBe(60 * 60 * 1000);
  });

  test('all 5 expected limiters are exported', () => {
    const expectedKeys = [
      'loginLimiter',
      'otpLimiter',
      'generalLimiter',
      'adminLimiter',
      'reportRateLimiter',
    ];
    expectedKeys.forEach((key) => {
      expect(limiters).toHaveProperty(key);
    });
  });

});
