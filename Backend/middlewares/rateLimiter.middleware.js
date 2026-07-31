// Backend\middlewares\rateLimiter.middleware.js

const rateLimit = require("express-rate-limit");

// Login limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: {
    success: false,
    message: "Too many login attempts. Please try again after 15 minutes.",
  },
});

// OTP limiter
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10,
  message: {
    success: false,
    message: "Too many OTP requests. Please try again after 10 minutes.",
  },
});

// General limiter — used on mutation endpoints that don't need OTP-level
// strictness but should still be protected from abuse (e.g. profile updates).
const generalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30,
  message: {
    success: false,
    message: "Too many requests. Please try again after 10 minutes.",
  },
});

module.exports = {
  loginLimiter,
  otpLimiter,
  generalLimiter,
};