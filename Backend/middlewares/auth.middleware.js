// Backend/middlewares/auth.middleware.js
//


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

    // P0-02: Suspension check — enforced against CURRENT DB state, not JWT claims.
    // A user may hold a previously issued valid JWT that pre-dates suspension.
    // This check runs on every protected request to ensure immediate enforcement.
    if (user.isSuspended) {
      const reason = user.suspensionReason
        ? `Account suspended: ${user.suspensionReason}`
        : 'Account suspended. Please contact support.';

      return res.status(403).json({
        success: false,
        message: reason,
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