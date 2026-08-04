// Backend/sockets/rateLimiter.js


const { RateLimiterMemory } = require('rate-limiter-flexible');

// 20 messages per 10-second window per user — generous for real chat use,
// tight enough to stop a scripted spam loop.
const messageLimiter = new RateLimiterMemory({
  points: 20,
  duration: 10,
});

module.exports = { messageLimiter };