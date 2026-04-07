const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const cron = require('node-cron');

const { admin, collections } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { asyncHandler, validationHandler, AppError } = require('../middleware/errorHandler');
const { logger, logTransaction } = require('../config/logger');

// Escrow statuses
const ESCROW_STATUSES = [
  'pending', 'held', 'shipped_to_escrow', 'at_escrow', 
  'awaiting_confirmation', 'released', 'refunded', 'disputed', 'cancelled'
];

// Validation rules
const createEscrowValidation = [
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be at least $0.01'),
  body('sellerId').notEmpty().withMessage('Seller ID is required')
];

const releaseEscrowValidation = [
  body('escrowId').notEmpty().withMessage('Escrow ID is required'),
  body('releaseAmount').optional().isFloat({ min: 0 }).withMessage('Release amount must be positive'),
  body('reason').optional().isString().withMessage('Reason must be a string')
];

const refundEscrowValidation = [
  body('escrowId').notEmpty().withMessage('Escrow ID is required'),
  body('refundAmount').optional().isFloat({ min: 0 }).withMessage('Refund amount must be positive'),
  body('reason').notEmpty().withMessage('Refund reason is required')
];

// @desc    Create escrow transaction from wallet tokens
// @route   POST /api/escrow/create
// @access  Private
router.post('/create', authenticate, validationHandler(createEscrowValidation), asyncHandler(async (req, res) => {
  const { orderId, amount, sellerId, productDetails } = req.body;

  // Verify buyer has sufficient balance
  const buyerDoc = await collections.users.doc(req.user.id).get();
  if (!buyerDoc.exists) {
    throw new AppError('Buyer not found', 404);
  }

  const buyerData = buyerDoc.data();
  const buyerBalance = buyerData.wallet?.balance || 0;

  if (buyerBalance < amount) {
    throw new AppError('Insufficient wallet balance for escrow', 400);
  }

  // Verify seller exists
  const sellerDoc = await collections.users.doc(sellerId).get();
  if (!sellerDoc.exists) {
    throw new AppError('Seller not found', 404);
  }

  // Verify order exists and belongs to buyer
  const orderDoc = await collections.orders.doc(orderId).get();
  if (!orderDoc.exists) {
    throw new AppError('Order not found', 404);
  }

  const orderData = orderDoc.data();
  if (orderData.buyerId !== req.user.id) {
    throw new AppError('Order does not belong to this buyer', 403);
  }

  if (orderData.status !== 'pending') {
    throw new AppError('Order is not in pending status', 400);
  }

  const escrowId = `ESC-${Date.now()}-${orderId}`;
  
  try {
    // Use batch for atomic operation
    const batch = admin.firestore().batch();

    // Create escrow record
    const escrowData = {
      id: escrowId,
      orderId,
      buyerId: req.user.id,
      sellerId,
      amount,
      status: 'held',
      paymentMethod: 'wallet_tokens',
      productDetails: productDetails || {},
      timeline: [{
        status: 'created',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        description: 'Escrow created and tokens held from buyer wallet',
        updatedBy: req.user.id
      }, {
        status: 'held',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        description: 'Tokens successfully held in escrow',
        updatedBy: 'system'
      }],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const escrowRef = collections.escrows.doc(escrowId);
    batch.set(escrowRef, escrowData);

    // Update order status
    const orderRef = collections.orders.doc(orderId);
    batch.update(orderRef, {
      status: 'confirmed',
      escrowId,
      timeline: admin.firestore.FieldValue.arrayUnion({
        status: 'confirmed',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        description: 'Payment confirmed - tokens held in escrow'
      }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    // Hold tokens in buyer's wallet
    const walletTransaction = {
      id: `ESC-HOLD-${Date.now()}-${orderId}`,
      userId: req.user.id,
      type: 'escrow_hold',
      amount: -amount,
      status: 'completed',
      orderId,
      escrowId,
      description: `Escrow hold for order ${orderId}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Update buyer wallet balance and create transaction
    const walletBatch = admin.firestore().batch();
    
    const walletTransactionRef = collections.walletTransactions.doc(walletTransaction.id);
    walletBatch.set(walletTransactionRef, walletTransaction);
    
    const buyerRef = collections.users.doc(req.user.id);
    walletBatch.update(buyerRef, {
      'wallet.balance': admin.firestore.FieldValue.increment(-amount),
      'wallet.totalSpent': admin.firestore.FieldValue.increment(amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await walletBatch.commit();

    // Send notifications
    const io = req.app.get('io');
    
    // Notify buyer
    io.to(`user_${req.user.id}`).emit('escrow_created', {
      escrowId,
      orderId,
      amount,
      message: `Escrow created successfully. $${amount} held from your wallet.`
    });

    // Notify seller
    io.to(`user_${sellerId}`).emit('order_confirmed', {
      escrowId,
      orderId,
      amount,
      message: `Order ${orderId} confirmed! Payment secured in escrow.`
    });

    logTransaction('escrow_created', {
      escrowId,
      orderId,
      buyerId: req.user.id,
      sellerId,
      amount
    });

    res.status(201).json({
      success: true,
      message: 'Escrow created successfully',
      data: {
        escrowId,
        orderId,
        amount,
        status: 'held'
      }
    });
  } catch (error) {
    logger.error('Escrow creation failed:', error);
    throw new AppError('Failed to create escrow', 500);
  }
}));

// @desc    Get all escrow transactions
// @route   GET /api/escrow
// @access  Private
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status, type = 'all' } = req.query;

  let query = collections.escrows;

  // Filter based on user role and type
  if (req.user.role !== 'Admin') {
    if (type === 'buyer' || type === 'all') {
      query = query.where('buyerId', '==', req.user.id);
    } else if (type === 'seller') {
      query = query.where('sellerId', '==', req.user.id);
    }
  }

  if (status && ESCROW_STATUSES.includes(status)) {
    query = query.where('status', '==', status);
  }

  const snapshot = await query.orderBy('createdAt', 'desc').get();
  const escrows = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // Additional filtering for mixed user roles
  let filteredEscrows = escrows;
  if (req.user.role !== 'Admin' && type === 'all') {
    filteredEscrows = escrows.filter(escrow => 
      escrow.buyerId === req.user.id || escrow.sellerId === req.user.id
    );
  }

  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedEscrows = filteredEscrows.slice(startIndex, endIndex);

  const total = filteredEscrows.length;
  const totalPages = Math.ceil(total / limit);

  res.json({
    success: true,
    data: {
      escrows: paginatedEscrows,
      pagination: {
        current: parseInt(page),
        pages: totalPages,
        total,
        limit: parseInt(limit)
      }
    }
  });
}));

// @desc    Get escrow by ID
// @route   GET /api/escrow/:id
// @access  Private
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const escrowDoc = await collections.escrows.doc(id).get();

  if (!escrowDoc.exists) {
    throw new AppError('Escrow transaction not found', 404);
  }

  const escrowData = escrowDoc.data();

  // Check if user has access to this escrow
  const isBuyer = escrowData.buyerId === req.user.id;
  const isSeller = escrowData.sellerId === req.user.id;
  const isAdmin = req.user.role === 'Admin';

  if (!isBuyer && !isSeller && !isAdmin) {
    throw new AppError('Access denied', 403);
  }

  // Get related order
  let order = null;
  if (escrowData.orderId) {
    const orderDoc = await collections.orders.doc(escrowData.orderId).get();
    if (orderDoc.exists) {
      order = orderDoc.data();
    }
  }

  res.json({
    success: true,
    data: {
      escrow: {
        id: escrowDoc.id,
        ...escrowData
      },
      order
    }
  });
}));

// @desc    Update escrow status (Admin only)
// @route   PUT /api/escrow/:id/status
// @access  Private/Admin
router.put('/:id/status', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes, location } = req.body;

  if (!status || !ESCROW_STATUSES.includes(status)) {
    throw new AppError('Invalid escrow status', 400);
  }

  const escrowDoc = await collections.escrows.doc(id).get();

  if (!escrowDoc.exists) {
    throw new AppError('Escrow transaction not found', 404);
  }

  const escrowData = escrowDoc.data();

  // Validate status transition
  const validTransitions = {
    'pending': ['held', 'cancelled'],
    'held': ['shipped_to_escrow', 'refunded', 'cancelled'],
    'shipped_to_escrow': ['at_escrow', 'cancelled'],
    'at_escrow': ['awaiting_confirmation', 'disputed', 'cancelled'],
    'awaiting_confirmation': ['released', 'disputed', 'refunded'],
    'released': [],
    'refunded': [],
    'disputed': ['released', 'refunded'],
    'cancelled': []
  };

  if (!validTransitions[escrowData.status].includes(status)) {
    throw new AppError(`Cannot transition from ${escrowData.status} to ${status}`, 400);
  }

  // Build update data
  const updateData = {
    status,
    timeline: admin.firestore.FieldValue.arrayUnion({
      status,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      description: notes || `Escrow status updated to ${status}`,
      updatedBy: req.user.id,
      location: location || null
    }),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  // Add specific fields based on status
  if (status === 'at_escrow' && location) {
    updateData.escrowLocation = location;
  }

  if (status === 'released') {
    updateData.releasedAt = admin.firestore.FieldValue.serverTimestamp();
    updateData.releasedBy = req.user.id;
  }

  if (status === 'refunded') {
    updateData.refundedAt = admin.firestore.FieldValue.serverTimestamp();
    updateData.refundedBy = req.user.id;
  }

  await collections.escrows.doc(id).update(updateData);

  // Update related order status if applicable
  if (escrowData.orderId) {
    const orderStatusMap = {
      'held': 'confirmed',
      'shipped_to_escrow': 'shipped_to_escrow',
      'at_escrow': 'at_escrow',
      'awaiting_confirmation': 'awaiting_buyer_confirm',
      'released': 'completed',
      'refunded': 'refunded',
      'cancelled': 'cancelled'
    };

    const orderStatus = orderStatusMap[status];
    if (orderStatus) {
      await collections.orders.doc(escrowData.orderId).update({
        status: orderStatus,
        timeline: admin.firestore.FieldValue.arrayUnion({
          status: orderStatus,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          description: `Escrow status updated to ${status}`
        }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  // Send real-time notifications
  const io = req.app.get('io');
  
  // Notify buyer
  io.to(`user_${escrowData.buyerId}`).emit('escrow_status_updated', {
    escrowId: id,
    orderId: escrowData.orderId,
    status,
    message: `Your escrow transaction has been updated to ${status}`
  });

  // Notify seller
  io.to(`user_${escrowData.sellerId}`).emit('escrow_status_updated', {
    escrowId: id,
    orderId: escrowData.orderId,
    status,
    message: `Escrow transaction ${id} has been updated to ${status}`
  });

  logTransaction('escrow_status_updated', {
    escrowId: id,
    orderId: escrowData.orderId,
    oldStatus: escrowData.status,
    newStatus: status,
    updatedBy: req.user.id
  });

  res.json({
    success: true,
    message: 'Escrow status updated successfully'
  });
}));

// @desc    Release escrow funds (Admin only)
// @route   POST /api/escrow/release
// @access  Private/Admin
router.post('/release', authenticate, requireAdmin, validationHandler(releaseEscrowValidation), asyncHandler(async (req, res) => {
  const { escrowId, releaseAmount, reason } = req.body;

  const escrowDoc = await collections.escrows.doc(escrowId).get();

  if (!escrowDoc.exists) {
    throw new AppError('Escrow transaction not found', 404);
  }

  const escrowData = escrowDoc.data();

  // Check if escrow can be released
  const releasableStatuses = ['awaiting_confirmation', 'disputed'];
  if (!releasableStatuses.includes(escrowData.status)) {
    throw new AppError('Escrow cannot be released at this stage', 400);
  }

  const amountToRelease = releaseAmount || escrowData.amount;

  if (amountToRelease > escrowData.amount) {
    throw new AppError('Release amount cannot exceed escrow amount', 400);
  }

  // Update escrow status
  await collections.escrows.doc(escrowId).update({
    status: 'released',
    releasedAmount: amountToRelease,
    releasedAt: admin.firestore.FieldValue.serverTimestamp(),
    releasedBy: req.user.id,
    releaseReason: reason || 'Funds released by admin',
    timeline: admin.firestore.FieldValue.arrayUnion({
      status: 'released',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      description: reason || 'Funds released to seller',
      amount: amountToRelease,
      updatedBy: req.user.id
    }),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Update related order
  if (escrowData.orderId) {
    await collections.orders.doc(escrowData.orderId).update({
      status: 'completed',
      timeline: admin.firestore.FieldValue.arrayUnion({
        status: 'completed',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        description: 'Escrow funds released - order completed'
      }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  // Create transaction record
  const transactionData = {
    id: `TXN-${Date.now()}`,
    type: 'escrow_release',
    escrowId,
    orderId: escrowData.orderId,
    fromUserId: escrowData.buyerId,
    toUserId: escrowData.sellerId,
    amount: amountToRelease,
    status: 'completed',
    description: `Escrow funds released for order ${escrowData.orderId}`,
    processedBy: req.user.id,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await collections.transactions.doc(transactionData.id).set(transactionData);

  // Release tokens to seller's wallet
  const walletTransaction = {
    id: `ESC-REL-${Date.now()}-${escrowData.orderId}`,
    userId: escrowData.sellerId,
    type: 'escrow_release',
    amount: amountToRelease,
    status: 'completed',
    orderId: escrowData.orderId,
    escrowId,
    description: `Escrow release for order ${escrowData.orderId}`,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  // Update seller wallet balance
  const walletBatch = admin.firestore().batch();
  
  const walletTransactionRef = collections.walletTransactions.doc(walletTransaction.id);
  walletBatch.set(walletTransactionRef, walletTransaction);
  
  const sellerRef = collections.users.doc(escrowData.sellerId);
  walletBatch.update(sellerRef, {
    'wallet.balance': admin.firestore.FieldValue.increment(amountToRelease),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await walletBatch.commit();

  // Send notifications
  const io = req.app.get('io');
  
  // Notify seller
  io.to(`user_${escrowData.sellerId}`).emit('funds_released', {
    escrowId,
    orderId: escrowData.orderId,
    amount: amountToRelease,
    message: `Funds of $${amountToRelease} have been released to your account`
  });

  // Notify buyer
  io.to(`user_${escrowData.buyerId}`).emit('escrow_completed', {
    escrowId,
    orderId: escrowData.orderId,
    message: 'Transaction completed successfully'
  });

  logTransaction('escrow_released', {
    escrowId,
    orderId: escrowData.orderId,
    amount: amountToRelease,
    releasedBy: req.user.id,
    sellerId: escrowData.sellerId
  });

  res.json({
    success: true,
    message: 'Escrow funds released successfully',
    data: {
      transactionId: transactionData.id,
      amountReleased: amountToRelease
    }
  });
}));

// @desc    Refund escrow funds (Admin only)
// @route   POST /api/escrow/refund
// @access  Private/Admin
router.post('/refund', authenticate, requireAdmin, validationHandler(refundEscrowValidation), asyncHandler(async (req, res) => {
  const { escrowId, refundAmount, reason } = req.body;

  const escrowDoc = await collections.escrows.doc(escrowId).get();

  if (!escrowDoc.exists) {
    throw new AppError('Escrow transaction not found', 404);
  }

  const escrowData = escrowDoc.data();

  // Check if escrow can be refunded
  const refundableStatuses = ['held', 'shipped_to_escrow', 'at_escrow', 'awaiting_confirmation', 'disputed'];
  if (!refundableStatuses.includes(escrowData.status)) {
    throw new AppError('Escrow cannot be refunded at this stage', 400);
  }

  const amountToRefund = refundAmount || escrowData.amount;

  if (amountToRefund > escrowData.amount) {
    throw new AppError('Refund amount cannot exceed escrow amount', 400);
  }

  // Update escrow status
  await collections.escrows.doc(escrowId).update({
    status: 'refunded',
    refundedAmount: amountToRefund,
    refundedAt: admin.firestore.FieldValue.serverTimestamp(),
    refundedBy: req.user.id,
    refundReason: reason,
    timeline: admin.firestore.FieldValue.arrayUnion({
      status: 'refunded',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      description: reason,
      amount: amountToRefund,
      updatedBy: req.user.id
    }),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Update related order
  if (escrowData.orderId) {
    await collections.orders.doc(escrowData.orderId).update({
      status: 'refunded',
      timeline: admin.firestore.FieldValue.arrayUnion({
        status: 'refunded',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        description: `Escrow refunded: ${reason}`
      }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Restore product stock
    const orderDoc = await collections.orders.doc(escrowData.orderId).get();
    if (orderDoc.exists) {
      const orderData = orderDoc.data();
      const batch = admin.firestore().batch();
      
      for (const item of orderData.items) {
        const productRef = collections.products.doc(item.productId);
        batch.update(productRef, {
          stock: admin.firestore.FieldValue.increment(item.quantity)
        });
      }
      
      await batch.commit();
    }
  }

  // Create transaction record
  const transactionData = {
    id: `TXN-${Date.now()}`,
    type: 'escrow_refund',
    escrowId,
    orderId: escrowData.orderId,
    fromUserId: escrowData.sellerId,
    toUserId: escrowData.buyerId,
    amount: amountToRefund,
    status: 'completed',
    description: `Escrow refund for order ${escrowData.orderId}: ${reason}`,
    processedBy: req.user.id,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await collections.transactions.doc(transactionData.id).set(transactionData);

  // Refund tokens to buyer's wallet
  const walletTransaction = {
    id: `ESC-REF-${Date.now()}-${escrowData.orderId}`,
    userId: escrowData.buyerId,
    type: 'refund',
    amount: amountToRefund,
    status: 'completed',
    orderId: escrowData.orderId,
    escrowId,
    description: reason,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  // Update buyer wallet balance
  const walletBatch = admin.firestore().batch();
  
  const walletTransactionRef = collections.walletTransactions.doc(walletTransaction.id);
  walletBatch.set(walletTransactionRef, walletTransaction);
  
  const buyerRef = collections.users.doc(escrowData.buyerId);
  walletBatch.update(buyerRef, {
    'wallet.balance': admin.firestore.FieldValue.increment(amountToRefund),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await walletBatch.commit();

  // Send notifications
  const io = req.app.get('io');
  
  // Notify buyer
  io.to(`user_${escrowData.buyerId}`).emit('refund_processed', {
    escrowId,
    orderId: escrowData.orderId,
    amount: amountToRefund,
    message: `Refund of $${amountToRefund} has been processed to your account`
  });

  // Notify seller
  io.to(`user_${escrowData.sellerId}`).emit('escrow_refunded', {
    escrowId,
    orderId: escrowData.orderId,
    message: `Order ${escrowData.orderId} has been refunded`
  });

  logTransaction('escrow_refunded', {
    escrowId,
    orderId: escrowData.orderId,
    amount: amountToRefund,
    refundedBy: req.user.id,
    buyerId: escrowData.buyerId,
    reason
  });

  res.json({
    success: true,
    message: 'Escrow refund processed successfully',
    data: {
      transactionId: transactionData.id,
      amountRefunded: amountToRefund
    }
  });
}));

// @desc    Buyer confirms delivery
// @route   POST /api/escrow/:id/confirm-delivery
// @access  Private/Buyer
router.post('/:id/confirm-delivery', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rating, review } = req.body;

  const escrowDoc = await collections.escrows.doc(id).get();

  if (!escrowDoc.exists) {
    throw new AppError('Escrow transaction not found', 404);
  }

  const escrowData = escrowDoc.data();

  // Check if user is the buyer
  if (escrowData.buyerId !== req.user.id) {
    throw new AppError('Only the buyer can confirm delivery', 403);
  }

  // Check if escrow is in the right status
  if (escrowData.status !== 'awaiting_confirmation') {
    throw new AppError('Delivery confirmation not available at this stage', 400);
  }

  // Update escrow to trigger release
  await collections.escrows.doc(id).update({
    status: 'released',
    deliveryConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    deliveryConfirmedBy: req.user.id,
    buyerRating: rating || null,
    buyerReview: review || null,
    releasedAt: admin.firestore.FieldValue.serverTimestamp(),
    timeline: admin.firestore.FieldValue.arrayUnion({
      status: 'released',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      description: 'Delivery confirmed by buyer - funds released',
      updatedBy: req.user.id
    }),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Update related order
  if (escrowData.orderId) {
    await collections.orders.doc(escrowData.orderId).update({
      status: 'completed',
      deliveryConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      timeline: admin.firestore.FieldValue.arrayUnion({
        status: 'completed',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        description: 'Delivery confirmed by buyer'
      }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  // Create transaction record for automatic release
  const transactionData = {
    id: `TXN-${Date.now()}`,
    type: 'escrow_release',
    escrowId: id,
    orderId: escrowData.orderId,
    fromUserId: escrowData.buyerId,
    toUserId: escrowData.sellerId,
    amount: escrowData.amount,
    status: 'completed',
    description: `Automatic escrow release after buyer confirmation`,
    processedBy: 'system',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await collections.transactions.doc(transactionData.id).set(transactionData);

  // Release tokens to seller's wallet
  const walletTransaction = {
    id: `ESC-REL-${Date.now()}-${escrowData.orderId}`,
    userId: escrowData.sellerId,
    type: 'escrow_release',
    amount: escrowData.amount,
    status: 'completed',
    orderId: escrowData.orderId,
    escrowId: id,
    description: `Delivery confirmed - escrow released`,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  // Update seller wallet balance
  const walletBatch = admin.firestore().batch();
  
  const walletTransactionRef = collections.walletTransactions.doc(walletTransaction.id);
  walletBatch.set(walletTransactionRef, walletTransaction);
  
  const sellerRef = collections.users.doc(escrowData.sellerId);
  walletBatch.update(sellerRef, {
    'wallet.balance': admin.firestore.FieldValue.increment(escrowData.amount),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await walletBatch.commit();

  // Send notifications
  const io = req.app.get('io');
  
  // Notify seller
  io.to(`user_${escrowData.sellerId}`).emit('delivery_confirmed', {
    escrowId: id,
    orderId: escrowData.orderId,
    amount: escrowData.amount,
    rating,
    message: 'Buyer confirmed delivery - funds released!'
  });

  logTransaction('delivery_confirmed', {
    escrowId: id,
    orderId: escrowData.orderId,
    buyerId: req.user.id,
    sellerId: escrowData.sellerId,
    amount: escrowData.amount,
    rating: rating || null
  });

  res.json({
    success: true,
    message: 'Delivery confirmed successfully - funds have been released to the seller',
    data: {
      transactionId: transactionData.id
    }
  });
}));

// @desc    Get escrow statistics (Admin only)
// @route   GET /api/escrow/stats
// @access  Private/Admin
router.get('/stats/overview', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const escrowsSnapshot = await collections.escrows.get();
  const escrows = escrowsSnapshot.docs.map(doc => doc.data());

  const stats = {
    total: escrows.length,
    pending: escrows.filter(e => e.status === 'pending').length,
    held: escrows.filter(e => e.status === 'held').length,
    atEscrow: escrows.filter(e => e.status === 'at_escrow').length,
    awaitingConfirmation: escrows.filter(e => e.status === 'awaiting_confirmation').length,
    released: escrows.filter(e => e.status === 'released').length,
    refunded: escrows.filter(e => e.status === 'refunded').length,
    disputed: escrows.filter(e => e.status === 'disputed').length,
    totalHeld: escrows.filter(e => ['held', 'shipped_to_escrow', 'at_escrow', 'awaiting_confirmation'].includes(e.status))
                     .reduce((sum, e) => sum + e.amount, 0),
    totalProcessed: escrows.filter(e => ['released', 'refunded'].includes(e.status))
                           .reduce((sum, e) => sum + e.amount, 0)
  };

  // Calculate average processing time for completed escrows
  const completedEscrows = escrows.filter(e => 
    e.status === 'released' && e.createdAt && e.releasedAt
  );

  if (completedEscrows.length > 0) {
    const totalTime = completedEscrows.reduce((sum, e) => {
      const created = e.createdAt.toDate ? e.createdAt.toDate() : new Date(e.createdAt);
      const released = e.releasedAt.toDate ? e.releasedAt.toDate() : new Date(e.releasedAt);
      return sum + (released - created);
    }, 0);
    
    stats.averageProcessingTime = Math.round(totalTime / completedEscrows.length / (1000 * 60 * 60 * 24)); // days
  } else {
    stats.averageProcessingTime = 0;
  }

  res.json({
    success: true,
    data: {
      stats
    }
  });
}));

// @desc    Auto-release expired escrows (Cron job)
// @route   Internal function
// @access  System
const autoReleaseExpiredEscrows = async () => {
  try {
    const autoReleaseThreshold = new Date();
    autoReleaseThreshold.setDate(autoReleaseThreshold.getDate() - (process.env.ESCROW_AUTO_RELEASE_DAYS || 21));

    const expiredEscrowsQuery = await collections.escrows
      .where('status', '==', 'awaiting_confirmation')
      .where('createdAt', '<=', autoReleaseThreshold)
      .get();

    const batch = admin.firestore().batch();
    const notifications = [];

    for (const doc of expiredEscrowsQuery.docs) {
      const escrowData = doc.data();
      const escrowId = doc.id;

      // Update escrow status
      batch.update(doc.ref, {
        status: 'released',
        releasedAt: admin.firestore.FieldValue.serverTimestamp(),
        releasedBy: 'system',
        autoReleased: true,
        timeline: admin.firestore.FieldValue.arrayUnion({
          status: 'released',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          description: 'Automatically released after expiration period',
          updatedBy: 'system'
        }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Update related order
      if (escrowData.orderId) {
        const orderRef = collections.orders.doc(escrowData.orderId);
        batch.update(orderRef, {
          status: 'completed',
          autoCompleted: true,
          timeline: admin.firestore.FieldValue.arrayUnion({
            status: 'completed',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            description: 'Automatically completed after escrow expiration'
          }),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      notifications.push({
        buyerId: escrowData.buyerId,
        sellerId: escrowData.sellerId,
        escrowId,
        orderId: escrowData.orderId,
        amount: escrowData.amount
      });

      logTransaction('escrow_auto_released', {
        escrowId,
        orderId: escrowData.orderId,
        amount: escrowData.amount,
        buyerId: escrowData.buyerId,
        sellerId: escrowData.sellerId
      });
    }

    if (expiredEscrowsQuery.size > 0) {
      await batch.commit();
      logger.info(`Auto-released ${expiredEscrowsQuery.size} expired escrow transactions`);

      // Send notifications (if socket.io is available)
      // This would need to be integrated with the main app's socket instance
      // notifications.forEach(notif => {
      //   io.to(`user_${notif.sellerId}`).emit('auto_release', {
      //     escrowId: notif.escrowId,
      //     orderId: notif.orderId,
      //     amount: notif.amount,
      //     message: 'Funds automatically released after confirmation period'
      //   });
      // });
    }
  } catch (error) {
    logger.error('Error in auto-release cron job:', error);
  }
};

// Schedule auto-release cron job to run daily at 2 AM
cron.schedule('0 2 * * *', autoReleaseExpiredEscrows);

module.exports = router;