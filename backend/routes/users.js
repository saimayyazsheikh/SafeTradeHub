const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { admin, collections } = require('../config/database');
const { authenticate, requireAdmin, requireVerification } = require('../middleware/auth');
const { asyncHandler, validationHandler, AppError } = require('../middleware/errorHandler');
const { logger } = require('../config/logger');

// Validation rules
const updateProfileValidation = [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters long'),
  body('phone').optional().isMobilePhone().withMessage('Please provide a valid phone number'),
  body('bio').optional().isLength({ max: 500 }).withMessage('Bio must not exceed 500 characters')
];

const updateSettingsValidation = [
  body('notifications.email').optional().isBoolean().withMessage('Email notification setting must be boolean'),
  body('notifications.push').optional().isBoolean().withMessage('Push notification setting must be boolean'),
  body('notifications.sms').optional().isBoolean().withMessage('SMS notification setting must be boolean'),
  body('privacy.showEmail').optional().isBoolean().withMessage('Show email setting must be boolean'),
  body('privacy.showPhone').optional().isBoolean().withMessage('Show phone setting must be boolean')
];

// @desc    Get all users (Admin only)
// @route   GET /api/users
// @access  Private/Admin
router.get('/', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, role, status } = req.query;
  
  let query = collections.users;
  
  // Add filters
  if (role) {
    query = query.where('role', '==', role);
  }
  
  if (status === 'active') {
    query = query.where('isActive', '==', true);
  } else if (status === 'inactive') {
    query = query.where('isActive', '==', false);
  }
  
  // Execute query
  const snapshot = await query.get();
  let users = snapshot.docs.map(doc => {
    const userData = doc.data();
    // Remove sensitive data
    delete userData.password;
    delete userData.refreshToken;
    delete userData.passwordResetToken;
    return userData;
  });
  
  // Client-side filtering for search (Firestore doesn't support full-text search)
  if (search) {
    const searchLower = search.toLowerCase();
    users = users.filter(user => 
      user.name.toLowerCase().includes(searchLower) ||
      user.email.toLowerCase().includes(searchLower)
    );
  }
  
  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedUsers = users.slice(startIndex, endIndex);
  
  const total = users.length;
  const totalPages = Math.ceil(total / limit);
  
  res.json({
    success: true,
    data: {
      users: paginatedUsers,
      pagination: {
        current: parseInt(page),
        pages: totalPages,
        total,
        limit: parseInt(limit)
      }
    }
  });
}));

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Users can only view their own profile unless they're admin
  if (req.user.id !== id && req.user.role !== 'Admin') {
    throw new AppError('Access denied', 403);
  }
  
  const userDoc = await collections.users.doc(id).get();
  
  if (!userDoc.exists) {
    throw new AppError('User not found', 404);
  }
  
  const userData = userDoc.data();
  
  // Remove sensitive data if not admin
  if (req.user.role !== 'Admin') {
    delete userData.password;
    delete userData.refreshToken;
    delete userData.passwordResetToken;
  }
  
  res.json({
    success: true,
    data: {
      user: userData
    }
  });
}));

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
router.put('/profile', authenticate, validationHandler(updateProfileValidation), asyncHandler(async (req, res) => {
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

// @desc    Update user settings
// @route   PUT /api/users/settings
// @access  Private
router.put('/settings', authenticate, validationHandler(updateSettingsValidation), asyncHandler(async (req, res) => {
  const { notifications, privacy } = req.body;
  
  const updateData = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  
  if (notifications) {
    if (notifications.email !== undefined) updateData['settings.notifications.email'] = notifications.email;
    if (notifications.push !== undefined) updateData['settings.notifications.push'] = notifications.push;
    if (notifications.sms !== undefined) updateData['settings.notifications.sms'] = notifications.sms;
  }
  
  if (privacy) {
    if (privacy.showEmail !== undefined) updateData['settings.privacy.showEmail'] = privacy.showEmail;
    if (privacy.showPhone !== undefined) updateData['settings.privacy.showPhone'] = privacy.showPhone;
  }
  
  await collections.users.doc(req.user.id).update(updateData);
  
  logger.info('User settings updated', { userId: req.user.id });
  
  res.json({
    success: true,
    message: 'Settings updated successfully'
  });
}));

// @desc    Upload profile avatar
// @route   POST /api/users/avatar
// @access  Private
router.post('/avatar', authenticate, asyncHandler(async (req, res) => {
  const { avatarUrl } = req.body;
  
  if (!avatarUrl) {
    throw new AppError('Avatar URL is required', 400);
  }
  
  await collections.users.doc(req.user.id).update({
    'profile.avatar': avatarUrl,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  logger.info('User avatar updated', { userId: req.user.id });
  
  res.json({
    success: true,
    message: 'Avatar updated successfully',
    data: {
      avatarUrl
    }
  });
}));

// @desc    Submit verification documents
// @route   POST /api/users/verification
// @access  Private
router.post('/verification', authenticate, asyncHandler(async (req, res) => {
  const { type, documents } = req.body;
  
  if (!type || !documents) {
    throw new AppError('Verification type and documents are required', 400);
  }
  
  const validTypes = ['address', 'cnic', 'selfie', 'shop'];
  if (!validTypes.includes(type)) {
    throw new AppError('Invalid verification type', 400);
  }
  
  const updateData = {
    [`verification.${type}.submitted`]: true,
    [`verification.${type}.verified`]: false,
    [`verification.${type}.documents`]: documents,
    [`verification.${type}.submittedAt`]: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  
  await collections.users.doc(req.user.id).update(updateData);
  
  logger.info('Verification documents submitted', { 
    userId: req.user.id, 
    type,
    documentsCount: documents.length 
  });
  
  res.json({
    success: true,
    message: `${type.charAt(0).toUpperCase() + type.slice(1)} verification submitted successfully`
  });
}));

// @desc    Get verification status
// @route   GET /api/users/verification
// @access  Private
router.get('/verification/status', authenticate, asyncHandler(async (req, res) => {
  const userDoc = await collections.users.doc(req.user.id).get();
  
  if (!userDoc.exists) {
    throw new AppError('User not found', 404);
  }
  
  const user = userDoc.data();
  const verification = user.verification || {};
  
  res.json({
    success: true,
    data: {
      verification
    }
  });
}));

// @desc    Update user status (Admin only)
// @route   PUT /api/users/:id/status
// @access  Private/Admin
router.put('/:id/status', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;
  
  if (typeof isActive !== 'boolean') {
    throw new AppError('isActive must be a boolean value', 400);
  }
  
  const userDoc = await collections.users.doc(id).get();
  
  if (!userDoc.exists) {
    throw new AppError('User not found', 404);
  }
  
  await collections.users.doc(id).update({
    isActive,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  logger.info('User status updated by admin', { 
    adminId: req.user.id, 
    targetUserId: id, 
    newStatus: isActive ? 'active' : 'inactive' 
  });
  
  res.json({
    success: true,
    message: `User ${isActive ? 'activated' : 'deactivated'} successfully`
  });
}));

// @desc    Approve/Reject verification (Admin only)
// @route   PUT /api/users/:id/verification/:type
// @access  Private/Admin
router.put('/:id/verification/:type', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id, type } = req.params;
  const { verified, rejectionReason } = req.body;
  
  const validTypes = ['address', 'cnic', 'selfie', 'shop'];
  if (!validTypes.includes(type)) {
    throw new AppError('Invalid verification type', 400);
  }
  
  if (typeof verified !== 'boolean') {
    throw new AppError('verified must be a boolean value', 400);
  }
  
  const userDoc = await collections.users.doc(id).get();
  
  if (!userDoc.exists) {
    throw new AppError('User not found', 404);
  }
  
  const updateData = {
    [`verification.${type}.verified`]: verified,
    [`verification.${type}.reviewedAt`]: admin.firestore.FieldValue.serverTimestamp(),
    [`verification.${type}.reviewedBy`]: req.user.id,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  
  if (!verified && rejectionReason) {
    updateData[`verification.${type}.rejectionReason`] = rejectionReason;
  }
  
  await collections.users.doc(id).update(updateData);
  
  logger.info('Verification status updated by admin', { 
    adminId: req.user.id, 
    targetUserId: id, 
    type,
    verified,
    rejectionReason: rejectionReason || null
  });
  
  res.json({
    success: true,
    message: `${type.charAt(0).toUpperCase() + type.slice(1)} verification ${verified ? 'approved' : 'rejected'} successfully`
  });
}));

// @desc    Delete user (Admin only)
// @route   DELETE /api/users/:id
// @access  Private/Admin
router.delete('/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Prevent admin from deleting themselves
  if (req.user.id === id) {
    throw new AppError('Cannot delete your own account', 400);
  }
  
  const userDoc = await collections.users.doc(id).get();
  
  if (!userDoc.exists) {
    throw new AppError('User not found', 404);
  }
  
  // Instead of deleting, deactivate the user and mark as deleted
  await collections.users.doc(id).update({
    isActive: false,
    isDeleted: true,
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    deletedBy: req.user.id,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  logger.info('User deleted by admin', { 
    adminId: req.user.id, 
    targetUserId: id 
  });
  
  res.json({
    success: true,
    message: 'User deleted successfully'
  });
}));

// @desc    Get user statistics (Admin only)
// @route   GET /api/users/stats
// @access  Private/Admin
router.get('/stats/overview', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const usersSnapshot = await collections.users.get();
  const users = usersSnapshot.docs.map(doc => doc.data());
  
  const stats = {
    total: users.length,
    active: users.filter(u => u.isActive).length,
    inactive: users.filter(u => !u.isActive).length,
    buyers: users.filter(u => u.role === 'Buyer').length,
    sellers: users.filter(u => u.role === 'Seller').length,
    verified: users.filter(u => u.verification?.email && u.verification?.phone).length,
    pendingVerification: users.filter(u => !u.verification?.email || !u.verification?.phone).length
  };
  
  // Calculate registration trends (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentUsers = users.filter(u => {
    if (!u.createdAt) return false;
    const createdDate = u.createdAt.toDate ? u.createdAt.toDate() : new Date(u.createdAt);
    return createdDate >= thirtyDaysAgo;
  });
  
  stats.recentRegistrations = recentUsers.length;
  
  res.json({
    success: true,
    data: {
      stats
    }
  });
}));

module.exports = router;
