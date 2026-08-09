// Backend/sockets/socket.middleware.js


const jwt = require('jsonwebtoken');
const User = require('../models/users.model');

const socketAuthMiddleware = async (socket, next) => {
  try {
  
    let rawToken =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token;

    if (!rawToken) {
      return next(new Error('Access denied. No token provided.'));
    }

    // Strip "Bearer " prefix if present (case-insensitive to be safe)
    if (rawToken.startsWith('Bearer ') || rawToken.startsWith('bearer ')) {
      rawToken = rawToken.split(' ')[1];
    }

    const decoded = jwt.verify(rawToken, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password').lean();

    if (!user) {
      return next(new Error('User no longer exists.'));
    }

  
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