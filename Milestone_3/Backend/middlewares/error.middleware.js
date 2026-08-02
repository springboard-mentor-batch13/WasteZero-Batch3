// Backend/middlewares/error.middleware.js
//
// Global Express error-handling middleware (4-argument signature).
// Must be mounted LAST in server.js — after all routes and the 404 fallback.
//
// Security:
//   - In production, raw error messages and stack traces are NEVER sent to
//     the client (could expose internal implementation details or DB schema).
//   - In development, a structured error object with message + stack is
//     returned so developers can debug efficiently.

const errorHandler = (err, req, res, next) => {
  // Log all errors server-side for debugging and monitoring
  console.error(`[ErrorHandler] ${err.name}: ${err.message}`);

  let statusCode = err.statusCode || 500;
  let message    = err.message    || 'Internal Server Error';

  // ── MongoDB / Mongoose error normalisation ─────────────────────────────

  // Duplicate key (e.g. unique email or username)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    statusCode  = 409;
    message     = `${field} already exists.`;
  }

  // Mongoose schema validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message    = Object.values(err.errors).map((e) => e.message).join(', ');
  }

  // Invalid ObjectId (malformed Mongoose cast)
  if (err.name === 'CastError') {
    statusCode = 400;
    message    = 'Invalid resource ID.';
  }

  // ── JWT error normalisation ────────────────────────────────────────────

  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message    = 'Invalid authentication token.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message    = 'Authentication token has expired.';
  }

  // ── multer error normalisation ─────────────────────────────────────────
  // multer v2 wraps file rejection errors as MulterError instances
  if (err.name === 'MulterError') {
    statusCode = 400;
    message    = err.message || 'File upload error.';
  }

  // ── Production shield ──────────────────────────────────────────────────
  // In production, replace generic 500 messages with a safe fallback.
  // Do not expose stack traces or raw system error messages to clients.
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && statusCode === 500) {
    message = 'An unexpected error occurred. Please try again later.';
  }

  const responseBody = {
    success: false,
    message,
  };

  // In development, include error details for easier debugging
  if (!isProduction) {
    responseBody.error = err.name;
    if (err.stack) {
      responseBody.stack = err.stack.split('\n').slice(0, 6).join('\n');
    }
  }

  return res.status(statusCode).json(responseBody);
};

module.exports = errorHandler;