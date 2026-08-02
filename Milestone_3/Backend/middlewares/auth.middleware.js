// Backend/middlewares/auth.middleware.js
//
// JWT authentication middleware.
//
// 'protect'   → Verifies the Bearer token and attaches req.user.
//               Uses .lean() since the user object is read-only here —
//               no Mongoose document methods are called on req.user.
//               Adds a string `id` property for backward compatibility
//               because Mongoose virtuals are not available on lean objects.
//
// 'authorize' → Role-based access control guard.

const jwt = require('jsonwebtoken');
const User = require('../models/users.model');

/* ============================================
   Protect Routes (JWT Verification)
============================================ */

const protect = async (req, res, next) => {
  let token;

  try {
    // Extract Bearer token from Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    // Verify JWT signature and decode payload
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Load user from DB (.lean() returns a plain JS object)
    const user = await User.findById(decoded.id)
      .select('-password')
      .lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists.',
      });
    }

    // Add `id` back for backward compatibility
    req.user = {
      ...user,
      id: user._id.toString(),
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired.',
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Authentication failed.',
    });
  }
};

/* ============================================
   Role Authorization
============================================ */

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. ${req.user.role} is not authorized to perform this action.`,
      });
    }

    next();
  };
};

module.exports = {
  protect,
  authorize,
};