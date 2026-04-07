const express = require('express');
const router = express.Router();

const { admin, collections } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { logger } = require('../config/logger');

const DISPUTE_STATUSES = ['open', 'under_review', 'resolved', 'closed'];

// @desc    Create dispute
// @route   POST /api/disputes
// @access  Private
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { orderId, issue, description, evidence } = req.body;

  if (!orderId || !issue || !description) {
    throw new AppError('Order ID, issue, and description are required', 400);
  }

  // Check if order exists and user has access
  const orderDoc = await collections.orders.doc(orderId).get();
  if (!orderDoc.exists) {
    throw new AppError('Order not found', 404);
  }

  const orderData = orderDoc.data();
  const isBuyer = orderData.buyerId === req.user.id;
  const isSeller = orderData.items.some(item => item.sellerId === req.user.id);

  if (!isBuyer && !isSeller) {
    throw new AppError('Access denied', 403);
  }

  const disputeId = `DISP-${Date.now()}`;
  const disputeData = {
    id: disputeId,
    orderId,
    reportedBy: req.user.id,
    issue,
    description,
    evidence: evidence || [],
    status: 'open',
    priority: 'medium',
    assignedTo: null,
    resolution: null,
    timeline: [
      {
        action: 'created',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        description: 'Dispute created',
        userId: req.user.id
      }
    ],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await collections.disputes.doc(disputeId).set(disputeData);

  logger.info('Dispute created', { disputeId, orderId, reportedBy: req.user.id, issue });

  res.status(201).json({
    success: true,
    message: 'Dispute created successfully',
    data: {
      dispute: disputeData
    }
  });
}));

// @desc    Get user's disputes
// @route   GET /api/disputes
// @access  Private
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;

  let query = collections.disputes.where('reportedBy', '==', req.user.id);

  if (status && DISPUTE_STATUSES.includes(status)) {
    query = query.where('status', '==', status);
  }

  const snapshot = await query.orderBy('createdAt', 'desc').get();
  const disputes = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedDisputes = disputes.slice(startIndex, endIndex);

  const total = disputes.length;
  const totalPages = Math.ceil(total / limit);

  res.json({
    success: true,
    data: {
      disputes: paginatedDisputes,
      pagination: {
        current: parseInt(page),
        pages: totalPages,
        total,
        limit: parseInt(limit)
      }
    }
  });
}));

// @desc    Get all disputes (Admin only)
// @route   GET /api/disputes/admin/all
// @access  Private/Admin
router.get('/admin/all', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, priority } = req.query;

  let query = collections.disputes;

  if (status && DISPUTE_STATUSES.includes(status)) {
    query = query.where('status', '==', status);
  }

  if (priority && ['low', 'medium', 'high'].includes(priority)) {
    query = query.where('priority', '==', priority);
  }

  const snapshot = await query.orderBy('createdAt', 'desc').get();
  const disputes = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedDisputes = disputes.slice(startIndex, endIndex);

  const total = disputes.length;
  const totalPages = Math.ceil(total / limit);

  res.json({
    success: true,
    data: {
      disputes: paginatedDisputes,
      pagination: {
        current: parseInt(page),
        pages: totalPages,
        total,
        limit: parseInt(limit)
      }
    }
  });
}));

// @desc    Resolve dispute (Admin only)
// @route   PUT /api/disputes/:id/resolve
// @access  Private/Admin
router.put('/:id/resolve', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { resolution, action } = req.body;

  if (!resolution) {
    throw new AppError('Resolution is required', 400);
  }

  const disputeDoc = await collections.disputes.doc(id).get();
  if (!disputeDoc.exists) {
    throw new AppError('Dispute not found', 404);
  }

  await collections.disputes.doc(id).update({
    status: 'resolved',
    resolution,
    resolvedBy: req.user.id,
    resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
    timeline: admin.firestore.FieldValue.arrayUnion({
      action: 'resolved',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      description: resolution,
      userId: req.user.id
    }),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  logger.info('Dispute resolved', { disputeId: id, resolvedBy: req.user.id });

  res.json({
    success: true,
    message: 'Dispute resolved successfully'
  });
}));

module.exports = router;