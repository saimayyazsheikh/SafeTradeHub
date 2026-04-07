const jwt = require('jsonwebtoken');
const { admin, collections } = require('../config/database');
const { AppError } = require('./errorHandler');
const { logger, logSecurity } = require('../config/logger');

// Generate JWT token
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  });
};

// Generate refresh token
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  });
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError('Token has expired', 401);
    } else if (error.name === 'JsonWebTokenError') {
      throw new AppError('Invalid token', 401);
    }
    throw new AppError('Token verification failed', 401);
  }
};

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Access denied. No token provided.', 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify token
    const decoded = verifyToken(token);
    
    // Check if user exists and is active
    if (!collections || !collections.users) {
      throw new AppError('Database not initialized', 500);
    }

    const userDoc = await collections.users.doc(decoded.userId).get();
    
    if (!userDoc.exists) {
      throw new AppError('User not found', 401);
    }

    const user = userDoc.data();
    
    if (!user.isActive) {
      throw new AppError('Account is deactivated', 401);
    }

    // Add user info to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      logSecurity('Authentication failed', { error: error.message });
      next(new AppError('Authentication failed', 401));
    }
  }
};

// Firebase token verification
const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Access denied. No token provided.', 401);
    }

    const token = authHeader.substring(7);
    
    if (!admin || !admin.auth) {
      throw new AppError('Firebase not initialized', 500);
    }

    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Check if user exists in our database
    if (!collections || !collections.users) {
      throw new AppError('Database not initialized', 500);
    }

    const userDoc = await collections.users.doc(decodedToken.uid).get();
    
    if (!userDoc.exists) {
      throw new AppError('User not found', 401);
    }

    const user = userDoc.data();
    
    if (!user.isActive) {
      throw new AppError('Account is deactivated', 401);
    }

    // Add user info to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      firebaseUid: decodedToken.uid
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      logSecurity('Firebase authentication failed', { error: error.message });
      next(new AppError('Firebase authentication failed', 401));
    }
  }
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};

// Admin authorization middleware
const requireAdmin = authorize('Admin');

// Seller authorization middleware
const requireSeller = authorize('Seller');

// Buyer authorization middleware
const requireBuyer = authorize('Buyer');

// Optional authentication middleware (doesn't throw error if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    
    if (!collections || !collections.users) {
      req.user = null;
      return next();
    }

    const userDoc = await collections.users.doc(decoded.userId).get();
    
    if (!userDoc.exists || !userDoc.data().isActive) {
      req.user = null;
      return next();
    }

    const user = userDoc.data();
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    };

    next();
  } catch (error) {
    // If token is invalid, just set user to null and continue
    req.user = null;
    next();
  }
};

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  authenticate,
  verifyFirebaseToken,
  authorize,
  requireAdmin,
  requireSeller,
  requireBuyer,
  optionalAuth
};
