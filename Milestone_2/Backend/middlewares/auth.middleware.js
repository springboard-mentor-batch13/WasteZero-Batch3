// Backend\middlewares\auth.middleware.js

const jwt = require("jsonwebtoken");
const User = require("../models/users.model");

/* ============================================
   Protect Routes
============================================ */

const protect = async (req, res, next) => {
  let token;

  try {
    // Check Authorization Header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find User
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists.",
      });
    }

    req.user = user;

    next();
  } catch (error) {
    console.error("Authentication Error:", error);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token has expired.",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Authentication failed.",
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
        message: "Authentication required.",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. ${req.user.role} is not authorized.`,
      });
    }

    next();
  };
};

module.exports = {
  protect,
  authorize,
};