// Backend/sockets/rateLimiter.js
//
// REST endpoints already protect against abuse via
// middlewares/rateLimiter.middleware.js (loginLimiter / otpLimiter), but
// that middleware is built on express-rate-limit, which counts requests
// per HTTP call — it has no concept of a long-lived socket connection.
// A single buggy or malicious client could otherwise fire thousands of
// message:send events per second over one open connection, hammering
// MongoDB writes. rate-limiter-flexible is the standard equivalent for
// persistent connections; scoping it to only the one event that writes
// to the database (message:send) keeps this addition minimal rather than
// wrapping every socket event in defensive infrastructure it doesn't need.

const { RateLimiterMemory } = require('rate-limiter-flexible');

// 20 messages per 10-second window per user — generous for real chat use,
// tight enough to stop a scripted spam loop.
const messageLimiter = new RateLimiterMemory({
  points: 20,
  duration: 10,
});

module.exports = { messageLimiter };