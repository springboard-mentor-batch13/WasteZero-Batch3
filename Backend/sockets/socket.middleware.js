// Backend/sockets/socket.middleware.js
//
// JWT authentication for the Socket.IO handshake. Deliberately mirrors
// auth.middleware.js's `protect` function: verifies the JWT, then
// re-fetches the user from MongoDB rather than trusting the token
// payload's role directly. This matters because a user's role can change
// after a token is issued (e.g. an admin demotes an NGO account) —
// re-fetching keeps socket-layer authorization consistent with the
// REST-layer's existing security posture instead of trusting up to
// 7 stale days of role data from the token.

const jwt = require('jsonwebtoken');
const User = require('../models/users.model');

const socketAuthMiddleware = async (socket, next) => {
  try {
    // 💡 Check both auth object AND query params
    const token = 
      socket.handshake.auth?.token || 
      socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Access denied. No token provided.'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password').lean();

    if (!user) {
      return next(new Error('User no longer exists.'));
    }

    // Same shape used across every REST controller/middleware — socket
    // event handlers can rely on socket.user.id / socket.user.role exactly
    // the way controllers rely on req.user.id / req.user.role.
    socket.user = {
      ...user,
      id: user._id.toString(),
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new Error('Token has expired.'));
    }

    if (error.name === 'JsonWebTokenError') {
      return next(new Error('Invalid token.'));
    }

    return next(new Error('Authentication failed.'));
  }
};

module.exports = socketAuthMiddleware;