const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { admin, collections } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { asyncHandler, validationHandler, AppError } = require('../middleware/errorHandler');
const { logger, logTransaction } = require('../config/logger');

// Validation rules
const depositTokensValidation = [
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be at least $0.01'),
  body('paymentMethod').isIn(['card', 'bank_transfer', 'digital_wallet']).withMessage('Invalid payment method'),
  body('paymentDetails').isObject().withMessage('Payment details are required')
];

const transferTokensValidation = [
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be at least $0.01'),
  body('toUserId').notEmpty().withMessage('Recipient user ID is required'),
  body('description').optional().isString().withMessage('Description must be a string')
];

// @desc    Get user wallet balance and transactions
// @route   GET /api/wallet
// @access  Private
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, type } = req.query;

  // Get user wallet data
  const userDoc = await collections.users.doc(req.user.id).get();
  if (!userDoc.exists) {
    throw new AppError('User not found', 404);
  }

  const userData = userDoc.data();
  const wallet = userData.wallet || {
    balance: 0,
    totalDeposited: 0,
    totalSpent: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  // Get wallet transactions
  let transactionsQuery = collections.walletTransactions
    .where('userId', '==', req.user.id)
    .orderBy('createdAt', 'desc');

  if (type && ['deposit', 'withdrawal', 'escrow_hold', 'escrow_release', 'refund'].includes(type)) {
    transactionsQuery = transactionsQuery.where('type', '==', type);
  }

  const transactionsSnapshot = await transactionsQuery.get();
  const allTransactions = transactionsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const transactions = allTransactions.slice(startIndex, endIndex);

  const total = allTransactions.length;
  const totalPages = Math.ceil(total / limit);

  res.json({
    success: true,
    data: {
      wallet,
      transactions,
      pagination: {
        current: parseInt(page),
        pages: totalPages,
        total,
        limit: parseInt(limit)
      }
    }
  });
}));

// @desc    Deposit tokens to wallet
// @route   POST /api/wallet/deposit
// @access  Private
router.post('/deposit', authenticate, validationHandler(depositTokensValidation), asyncHandler(async (req, res) => {
  const { amount, paymentMethod, paymentDetails } = req.body;

  // In a real implementation, you would integrate with payment processors
  // For now, we'll simulate successful payment processing
  
  const transactionId = `DEP-${Date.now()}-${req.user.id}`;
  
  // Create wallet transaction record
  const walletTransaction = {
    id: transactionId,
    userId: req.user.id,
    type: 'deposit',
    amount: amount,
    status: 'completed',
    paymentMethod,
    paymentDetails: {
      method: paymentMethod,
      // Store sanitized payment details (never store full card numbers)
      last4: paymentDetails.last4 || null,
      brand: paymentDetails.brand || null,
      expiryMonth: paymentDetails.expiryMonth || null,
      expiryYear: paymentDetails.expiryYear || null
    },
    description: `Token deposit via ${paymentMethod}`,
    metadata: {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  // Use batch to ensure atomic operation
  const batch = admin.firestore().batch();

  // Add transaction record
  const transactionRef = collections.walletTransactions.doc(transactionId);
  batch.set(transactionRef, walletTransaction);

  // Update user wallet balance
  const userRef = collections.users.doc(req.user.id);
  batch.update(userRef, {
    'wallet.balance': admin.firestore.FieldValue.increment(amount),
    'wallet.totalDeposited': admin.firestore.FieldValue.increment(amount),
    'wallet.lastDepositAt': admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await batch.commit();

  // Send real-time notification
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${req.user.id}`).emit('wallet_updated', {
      type: 'deposit',
      amount,
      transactionId,
      message: `$${amount} has been added to your wallet`
    });
  }

  logTransaction('wallet_deposit', {
    userId: req.user.id,
    transactionId,
    amount,
    paymentMethod
  });

  res.json({
    success: true,
    message: 'Tokens deposited successfully',
    data: {
      transactionId,
      amount,
      newBalance: null // Will be calculated on next request
    }
  });
}));

// @desc    Transfer tokens between users (for testing)
// @route   POST /api/wallet/transfer
// @access  Private
router.post('/transfer', authenticate, validationHandler(transferTokensValidation), asyncHandler(async (req, res) => {
  const { amount, toUserId, description } = req.body;

  if (req.user.id === toUserId) {
    throw new AppError('Cannot transfer to yourself', 400);
  }

  // Check sender balance
  const senderDoc = await collections.users.doc(req.user.id).get();
  if (!senderDoc.exists) {
    throw new AppError('Sender not found', 404);
  }

  const senderData = senderDoc.data();
  const senderBalance = senderData.wallet?.balance || 0;

  if (senderBalance < amount) {
    throw new AppError('Insufficient balance', 400);
  }

  // Check recipient exists
  const recipientDoc = await collections.users.doc(toUserId).get();
  if (!recipientDoc.exists) {
    throw new AppError('Recipient not found', 404);
  }

  const transactionId = `TRF-${Date.now()}-${req.user.id}`;

  // Create transactions for both sender and recipient
  const batch = admin.firestore().batch();

  // Sender transaction
  const senderTransactionRef = collections.walletTransactions.doc(`${transactionId}-OUT`);
  batch.set(senderTransactionRef, {
    id: `${transactionId}-OUT`,
    userId: req.user.id,
    type: 'transfer_out',
    amount: -amount,
    status: 'completed',
    relatedUserId: toUserId,
    description: description || 'Token transfer',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Recipient transaction
  const recipientTransactionRef = collections.walletTransactions.doc(`${transactionId}-IN`);
  batch.set(recipientTransactionRef, {
    id: `${transactionId}-IN`,
    userId: toUserId,
    type: 'transfer_in',
    amount: amount,
    status: 'completed',
    relatedUserId: req.user.id,
    description: description || 'Token transfer received',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Update sender balance
  const senderRef = collections.users.doc(req.user.id);
  batch.update(senderRef, {
    'wallet.balance': admin.firestore.FieldValue.increment(-amount),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Update recipient balance
  const recipientRef = collections.users.doc(toUserId);
  batch.update(recipientRef, {
    'wallet.balance': admin.firestore.FieldValue.increment(amount),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await batch.commit();

  // Send notifications
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${req.user.id}`).emit('wallet_updated', {
      type: 'transfer_out',
      amount: -amount,
      transactionId,
      message: `$${amount} transferred to user`
    });

    io.to(`user_${toUserId}`).emit('wallet_updated', {
      type: 'transfer_in',
      amount,
      transactionId,
      message: `$${amount} received from user`
    });
  }

  logTransaction('wallet_transfer', {
    fromUserId: req.user.id,
    toUserId,
    transactionId,
    amount,
    description
  });

  res.json({
    success: true,
    message: 'Transfer completed successfully',
    data: {
      transactionId,
      amount
    }
  });
}));

// @desc    Hold tokens in escrow
// @route   POST /api/wallet/escrow-hold
// @access  Private
router.post('/escrow-hold', authenticate, asyncHandler(async (req, res) => {
  const { amount, orderId, escrowId } = req.body;

  if (!amount || amount <= 0) {
    throw new AppError('Invalid amount', 400);
  }

  if (!orderId) {
    throw new AppError('Order ID is required', 400);
  }

  // Check user balance
  const userDoc = await collections.users.doc(req.user.id).get();
  if (!userDoc.exists) {
    throw new AppError('User not found', 404);
  }

  const userData = userDoc.data();
  const userBalance = userData.wallet?.balance || 0;

  if (userBalance < amount) {
    throw new AppError('Insufficient balance for escrow hold', 400);
  }

  const transactionId = `ESC-HOLD-${Date.now()}-${orderId}`;

  // Use batch for atomic operation
  const batch = admin.firestore().batch();

  // Create escrow hold transaction
  const transactionRef = collections.walletTransactions.doc(transactionId);
  batch.set(transactionRef, {
    id: transactionId,
    userId: req.user.id,
    type: 'escrow_hold',
    amount: -amount,
    status: 'completed',
    orderId,
    escrowId: escrowId || null,
    description: `Escrow hold for order ${orderId}`,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Update user balance
  const userRef = collections.users.doc(req.user.id);
  batch.update(userRef, {
    'wallet.balance': admin.firestore.FieldValue.increment(-amount),
    'wallet.totalSpent': admin.firestore.FieldValue.increment(amount),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await batch.commit();

  // Send notification
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${req.user.id}`).emit('wallet_updated', {
      type: 'escrow_hold',
      amount: -amount,
      transactionId,
      orderId,
      message: `$${amount} held in escrow for order ${orderId}`
    });
  }

  logTransaction('escrow_hold', {
    userId: req.user.id,
    transactionId,
    amount,
    orderId,
    escrowId
  });

  res.json({
    success: true,
    message: 'Tokens held in escrow successfully',
    data: {
      transactionId,
      amount,
      orderId
    }
  });
}));

// @desc    Release escrow tokens (for completed orders)
// @route   POST /api/wallet/escrow-release
// @access  Private (used internally by escrow system)
router.post('/escrow-release', authenticate, asyncHandler(async (req, res) => {
  const { amount, orderId, sellerId, transactionId } = req.body;

  if (!amount || amount <= 0) {
    throw new AppError('Invalid amount', 400);
  }

  if (!sellerId) {
    throw new AppError('Seller ID is required', 400);
  }

  // Verify seller exists
  const sellerDoc = await collections.users.doc(sellerId).get();
  if (!sellerDoc.exists) {
    throw new AppError('Seller not found', 404);
  }

  const releaseTransactionId = `ESC-REL-${Date.now()}-${orderId}`;

  // Create release transaction for seller
  const batch = admin.firestore().batch();

  const releaseTransactionRef = collections.walletTransactions.doc(releaseTransactionId);
  batch.set(releaseTransactionRef, {
    id: releaseTransactionId,
    userId: sellerId,
    type: 'escrow_release',
    amount: amount,
    status: 'completed',
    orderId,
    relatedTransactionId: transactionId,
    description: `Escrow release for order ${orderId}`,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Update seller balance
  const sellerRef = collections.users.doc(sellerId);
  batch.update(sellerRef, {
    'wallet.balance': admin.firestore.FieldValue.increment(amount),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await batch.commit();

  // Send notification to seller
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${sellerId}`).emit('wallet_updated', {
      type: 'escrow_release',
      amount,
      transactionId: releaseTransactionId,
      orderId,
      message: `$${amount} released from escrow for order ${orderId}`
    });
  }

  logTransaction('escrow_release', {
    sellerId,
    transactionId: releaseTransactionId,
    amount,
    orderId,
    relatedTransactionId: transactionId
  });

  res.json({
    success: true,
    message: 'Escrow tokens released to seller',
    data: {
      transactionId: releaseTransactionId,
      amount,
      sellerId
    }
  });
}));

// @desc    Refund escrow tokens (for cancelled/disputed orders)
// @route   POST /api/wallet/escrow-refund
// @access  Private (used internally by escrow system)
router.post('/escrow-refund', authenticate, asyncHandler(async (req, res) => {
  const { amount, orderId, buyerId, transactionId, reason } = req.body;

  if (!amount || amount <= 0) {
    throw new AppError('Invalid amount', 400);
  }

  if (!buyerId) {
    throw new AppError('Buyer ID is required', 400);
  }

  // Verify buyer exists
  const buyerDoc = await collections.users.doc(buyerId).get();
  if (!buyerDoc.exists) {
    throw new AppError('Buyer not found', 404);
  }

  const refundTransactionId = `ESC-REF-${Date.now()}-${orderId}`;

  // Create refund transaction for buyer
  const batch = admin.firestore().batch();

  const refundTransactionRef = collections.walletTransactions.doc(refundTransactionId);
  batch.set(refundTransactionRef, {
    id: refundTransactionId,
    userId: buyerId,
    type: 'refund',
    amount: amount,
    status: 'completed',
    orderId,
    relatedTransactionId: transactionId,
    description: reason || `Escrow refund for order ${orderId}`,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Update buyer balance
  const buyerRef = collections.users.doc(buyerId);
  batch.update(buyerRef, {
    'wallet.balance': admin.firestore.FieldValue.increment(amount),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await batch.commit();

  // Send notification to buyer
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${buyerId}`).emit('wallet_updated', {
      type: 'refund',
      amount,
      transactionId: refundTransactionId,
      orderId,
      message: `$${amount} refunded to your wallet for order ${orderId}`
    });
  }

  logTransaction('escrow_refund', {
    buyerId,
    transactionId: refundTransactionId,
    amount,
    orderId,
    relatedTransactionId: transactionId,
    reason
  });

  res.json({
    success: true,
    message: 'Escrow tokens refunded to buyer',
    data: {
      transactionId: refundTransactionId,
      amount,
      buyerId
    }
  });
}));

// @desc    Get wallet statistics (Admin only)
// @route   GET /api/wallet/stats
// @access  Private/Admin
router.get('/stats/overview', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const usersSnapshot = await collections.users.get();
  const users = usersSnapshot.docs.map(doc => doc.data());

  const transactionsSnapshot = await collections.walletTransactions.get();
  const transactions = transactionsSnapshot.docs.map(doc => doc.data());

  const stats = {
    totalUsers: users.length,
    usersWithWallets: users.filter(u => u.wallet?.balance !== undefined).length,
    totalTokensInCirculation: users.reduce((sum, u) => sum + (u.wallet?.balance || 0), 0),
    totalDeposited: users.reduce((sum, u) => sum + (u.wallet?.totalDeposited || 0), 0),
    totalSpent: users.reduce((sum, u) => sum + (u.wallet?.totalSpent || 0), 0),
    totalTransactions: transactions.length,
    deposits: transactions.filter(t => t.type === 'deposit').length,
    escrowHolds: transactions.filter(t => t.type === 'escrow_hold').length,
    escrowReleases: transactions.filter(t => t.type === 'escrow_release').length,
    refunds: transactions.filter(t => t.type === 'refund').length
  };

  res.json({
    success: true,
    data: { stats }
  });
}));

module.exports = router;