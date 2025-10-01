const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const router = express.Router();

const { admin, db, collections } = require('../config/database');
const { authenticate, verifyFirebaseToken, generateToken, generateRefreshToken } = require('../middleware/auth');
const { asyncHandler, validationHandler, AppError } = require('../middleware/errorHandler');
const { logger, logSecurity } = require('../config/logger');

// Validation rules
const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters long'),
  body('role').isIn(['Buyer', 'Seller']).withMessage('Role must be either Buyer or Seller'),
  body('phone').optional().isMobilePhone().withMessage('Please provide a valid phone number')
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required')
];

const resetPasswordValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email')
];

const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters long')
];

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', validationHandler(registerValidation), asyncHandler(async (req, res) => {
  const { email, password, name, role, phone } = req.body;

  // Check if user already exists
  const existingUser = await collections.users.where('email', '==', email).get();
  if (!existingUser.empty) {
    throw new AppError('User already exists with this email', 400);
  }

  // Hash password
  const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create user in Firestore
  const userData = {
    name: name.trim(),
    email: email.toLowerCase(),
    password: hashedPassword,
    role,
    phone: phone || null,
    isActive: true,
    emailVerified: false,
    phoneVerified: false,
    verification: {
      email: false,
      phone: false,
      address: { submitted: false, verified: false },
      cnic: { submitted: false, verified: false },
      selfie: { submitted: false, verified: false },
      shop: role === 'Seller' ? { submitted: false, verified: false } : undefined
    },
    profile: {
      avatar: null,
      bio: null,
      location: null
    },
    settings: {
      notifications: {
        email: true,
        push: true,
        sms: false
      },
      privacy: {
        showEmail: false,
        showPhone: false
      }
    },
    wallet: {
      balance: 0,
      totalDeposited: 0,
      totalSpent: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const userRef = await collections.users.add(userData);
  const userId = userRef.id;

  // Update document with ID
  await userRef.update({ id: userId });

  // Generate tokens
  const token = generateToken({ userId, email, role });
  const refreshToken = generateRefreshToken({ userId });

  // Store refresh token
  await collections.users.doc(userId).update({
    refreshToken,
    lastLogin: admin.firestore.FieldValue.serverTimestamp()
  });

  logger.info('User registered successfully', { userId, email, role });

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      user: {
        id: userId,
        name,
        email,
        role,
        emailVerified: false,
        phoneVerified: false
      },
      token,
      refreshToken
    }
  });
}));

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
router.post('/login', validationHandler(loginValidation), asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user
  const userQuery = await collections.users.where('email', '==', email.toLowerCase()).get();
  if (userQuery.empty) {
    logSecurity('Failed login attempt', { email, reason: 'User not found' });
    throw new AppError('Invalid credentials', 401);
  }

  const userDoc = userQuery.docs[0];
  const user = userDoc.data();

  // Check if user is active
  if (!user.isActive) {
    logSecurity('Login attempt by deactivated user', { email });
    throw new AppError('Account is deactivated. Please contact support.', 401);
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    logSecurity('Failed login attempt', { email, reason: 'Invalid password' });
    throw new AppError('Invalid credentials', 401);
  }

  // Generate tokens
  const token = generateToken({ userId: user.id, email: user.email, role: user.role });
  const refreshToken = generateRefreshToken({ userId: user.id });

  // Update last login and refresh token
  await collections.users.doc(user.id).update({
    refreshToken,
    lastLogin: admin.firestore.FieldValue.serverTimestamp()
  });

  logger.info('User logged in successfully', { userId: user.id, email });

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        verification: user.verification
      },
      token,
      refreshToken
    }
  });
}));

// @desc    Firebase OAuth login
// @route   POST /api/auth/firebase-login
// @access  Public
router.post('/firebase-login', asyncHandler(async (req, res) => {
  const { firebaseToken } = req.body;

  if (!firebaseToken) {
    throw new AppError('Firebase token is required', 400);
  }

  try {
    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
    const { uid, email, name } = decodedToken;

    // Check if user exists
    let userDoc = await collections.users.doc(uid).get();
    
    if (!userDoc.exists) {
      // Create new user
      const userData = {
        id: uid,
        name: name || 'User',
        email: email,
        role: 'Buyer', // Default role
        isActive: true,
        emailVerified: true, // Firebase handles email verification
        phoneVerified: false,
        verification: {
          email: true,
          phone: false,
          address: { submitted: false, verified: false },
          cnic: { submitted: false, verified: false },
          selfie: { submitted: false, verified: false }
        },
        profile: {
          avatar: decodedToken.picture || null,
          bio: null,
          location: null
        },
        settings: {
          notifications: {
            email: true,
            push: true,
            sms: false
          },
          privacy: {
            showEmail: false,
            showPhone: false
          }
        },
        wallet: {
          balance: 0,
          totalDeposited: 0,
          totalSpent: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        },
        authProvider: 'firebase',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await collections.users.doc(uid).set(userData);
      userDoc = await collections.users.doc(uid).get();
    }

    const user = userDoc.data();

    // Check if user is active
    if (!user.isActive) {
      throw new AppError('Account is deactivated. Please contact support.', 401);
    }

    // Generate tokens
    const token = generateToken({ userId: user.id, email: user.email, role: user.role });
    const refreshToken = generateRefreshToken({ userId: user.id });

    // Update last login
    await collections.users.doc(user.id).update({
      refreshToken,
      lastLogin: admin.firestore.FieldValue.serverTimestamp()
    });

    logger.info('Firebase user logged in successfully', { userId: user.id, email });

    res.json({
      success: true,
      message: 'Firebase login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          emailVerified: user.emailVerified,
          phoneVerified: user.phoneVerified,
          verification: user.verification
        },
        token,
        refreshToken
      }
    });

  } catch (error) {
    logSecurity('Firebase login failed', { error: error.message });
    throw new AppError('Firebase authentication failed', 401);
  }
}));

// @desc    Refresh token
// @route   POST /api/auth/refresh-token
// @access  Public
router.post('/refresh-token', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AppError('Refresh token is required', 400);
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const userId = decoded.userId;

    // Find user and verify refresh token
    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists || userDoc.data().refreshToken !== refreshToken) {
      throw new AppError('Invalid refresh token', 401);
    }

    const user = userDoc.data();

    // Generate new tokens
    const newToken = generateToken({ userId: user.id, email: user.email, role: user.role });
    const newRefreshToken = generateRefreshToken({ userId: user.id });

    // Update refresh token
    await collections.users.doc(userId).update({
      refreshToken: newRefreshToken
    });

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token: newToken,
        refreshToken: newRefreshToken
      }
    });

  } catch (error) {
    throw new AppError('Invalid refresh token', 401);
  }
}));

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const userDoc = await collections.users.doc(req.user.id).get();
  
  if (!userDoc.exists) {
    throw new AppError('User not found', 404);
  }

  const user = userDoc.data();

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        verification: user.verification,
        profile: user.profile,
        settings: user.settings,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    }
  });
}));

// @desc    Update profile
// @route   PUT /api/auth/profile
// @access  Private
router.put('/profile', authenticate, asyncHandler(async (req, res) => {
  const { name, phone, bio, location } = req.body;
  
  const updateData = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  if (name) updateData.name = name.trim();
  if (phone) updateData.phone = phone;
  if (bio !== undefined) updateData['profile.bio'] = bio;
  if (location !== undefined) updateData['profile.location'] = location;

  await collections.users.doc(req.user.id).update(updateData);

  logger.info('User profile updated', { userId: req.user.id });

  res.json({
    success: true,
    message: 'Profile updated successfully'
  });
}));

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
router.put('/change-password', authenticate, validationHandler(changePasswordValidation), asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const userDoc = await collections.users.doc(req.user.id).get();
  const user = userDoc.data();

  // Verify current password
  const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isCurrentPasswordValid) {
    throw new AppError('Current password is incorrect', 400);
  }

  // Hash new password
  const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  // Update password
  await collections.users.doc(req.user.id).update({
    password: hashedPassword,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  logSecurity('Password changed', { userId: req.user.id });

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
}));

// @desc    Logout
// @route   POST /api/auth/logout
// @access  Private
router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  // Remove refresh token
  await collections.users.doc(req.user.id).update({
    refreshToken: null
  });

  logger.info('User logged out', { userId: req.user.id });

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
}));

// @desc    Request password reset
// @route   POST /api/auth/forgot-password
// @access  Public
router.post('/forgot-password', validationHandler(resetPasswordValidation), asyncHandler(async (req, res) => {
  const { email } = req.body;

  // Find user
  const userQuery = await collections.users.where('email', '==', email.toLowerCase()).get();
  if (userQuery.empty) {
    // Don't reveal if user exists
    return res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
  }

  const userDoc = userQuery.docs[0];
  const user = userDoc.data();

  // Generate reset token
  const resetToken = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Store reset token
  await collections.users.doc(user.id).update({
    passwordResetToken: resetToken,
    passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // TODO: Send email with reset link
  // const resetURL = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  
  logger.info('Password reset requested', { userId: user.id, email });

  res.json({
    success: true,
    message: 'If an account with that email exists, a password reset link has been sent.',
    // In development, return the token
    ...(process.env.NODE_ENV === 'development' && { resetToken })
  });
}));

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    throw new AppError('Token and new password are required', 400);
  }

  if (newPassword.length < 6) {
    throw new AppError('Password must be at least 6 characters long', 400);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const userDoc = await collections.users.doc(decoded.userId).get();
    if (!userDoc.exists) {
      throw new AppError('Invalid token', 400);
    }

    const user = userDoc.data();

    // Check if token matches and hasn't expired
    if (user.passwordResetToken !== token || new Date() > user.passwordResetExpires.toDate()) {
      throw new AppError('Invalid or expired token', 400);
    }

    // Hash new password
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password and clear reset token
    await collections.users.doc(decoded.userId).update({
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    logSecurity('Password reset completed', { userId: decoded.userId });

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      throw new AppError('Invalid or expired token', 400);
    }
    throw error;
  }
}));

module.exports = router;