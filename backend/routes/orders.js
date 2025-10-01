const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const { admin, collections } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { asyncHandler, validationHandler, AppError } = require('../middleware/errorHandler');
const { logger, logTransaction } = require('../config/logger');

// Order statuses
const ORDER_STATUSES = [
  'pending', 'confirmed', 'shipped_to_escrow', 'at_escrow', 
  'awaiting_buyer_confirm', 'completed', 'cancelled', 'refunded'
];

// Validation rules
const createOrderValidation = [
  body('items').isArray({ min: 1 }).withMessage('Order must contain at least one item'),
  body('items.*.productId').notEmpty().withMessage('Product ID is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.price').isFloat({ min: 0 }).withMessage('Price must be positive'),
  body('shippingAddress').isObject().withMessage('Shipping address is required'),
  body('shippingAddress.street').notEmpty().withMessage('Street address is required'),
  body('shippingAddress.city').notEmpty().withMessage('City is required'),
  body('shippingAddress.state').notEmpty().withMessage('State is required'),
  body('shippingAddress.postalCode').notEmpty().withMessage('Postal code is required'),
  body('shippingAddress.country').notEmpty().withMessage('Country is required'),
  body('paymentMethod').isIn(['escrow', 'direct']).withMessage('Invalid payment method')
];

const updateOrderValidation = [
  body('status').optional().isIn(ORDER_STATUSES).withMessage('Invalid order status'),
  body('trackingNumber').optional().isString().withMessage('Tracking number must be a string'),
  body('notes').optional().isString().withMessage('Notes must be a string')
];

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
router.post('/', authenticate, validationHandler(createOrderValidation), asyncHandler(async (req, res) => {
  const { items, shippingAddress, paymentMethod, notes } = req.body;

  // Validate products and calculate total
  let totalAmount = 0;
  const orderItems = [];

  for (const item of items) {
    const productDoc = await collections.products.doc(item.productId).get();
    
    if (!productDoc.exists) {
      throw new AppError(`Product ${item.productId} not found`, 404);
    }

    const product = productDoc.data();

    if (!product.isActive) {
      throw new AppError(`Product ${product.name} is not available`, 400);
    }

    if (product.stock < item.quantity) {
      throw new AppError(`Insufficient stock for ${product.name}. Available: ${product.stock}`, 400);
    }

    // Verify price hasn't changed significantly (within 5%)
    const priceDiff = Math.abs(product.price - item.price) / product.price;
    if (priceDiff > 0.05) {
      throw new AppError(`Price for ${product.name} has changed. Please refresh and try again.`, 400);
    }

    const orderItem = {
      productId: item.productId,
      productName: product.name,
      productImage: product.images?.[0] || null,
      sellerId: product.sellerId,
      sellerName: product.sellerName,
      quantity: item.quantity,
      unitPrice: product.price,
      totalPrice: product.price * item.quantity,
      category: product.category
    };

    orderItems.push(orderItem);
    totalAmount += orderItem.totalPrice;
  }

  // Create order
  const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  
  const orderData = {
    id: orderId,
    buyerId: req.user.id,
    buyerName: req.user.name,
    items: orderItems,
    totalAmount,
    status: 'pending',
    paymentMethod,
    paymentStatus: 'pending',
    shippingAddress,
    notes: notes || null,
    timeline: [
      {
        status: 'pending',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        description: 'Order created and awaiting payment'
      }
    ],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  // Save order
  await collections.orders.doc(orderId).set(orderData);

  // Update product stock
  const batch = admin.firestore().batch();
  
  for (const item of orderItems) {
    const productRef = collections.products.doc(item.productId);
    batch.update(productRef, {
      stock: admin.firestore.FieldValue.increment(-item.quantity),
      totalSold: admin.firestore.FieldValue.increment(item.quantity)
    });
  }

  await batch.commit();

  // Create escrow if payment method is escrow
  if (paymentMethod === 'escrow') {
    const escrowData = {
      id: `ESC-${Date.now()}`,
      orderId,
      buyerId: req.user.id,
      sellerId: orderItems[0].sellerId, // For multi-seller orders, this would need modification
      amount: totalAmount,
      status: 'pending',
      timeline: [
        {
          status: 'pending',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          description: 'Escrow created, awaiting payment'
        }
      ],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await collections.escrows.doc(escrowData.id).set(escrowData);
  }

  // Notify sellers
  const io = req.app.get('io');
  const sellerIds = [...new Set(orderItems.map(item => item.sellerId))];
  
  for (const sellerId of sellerIds) {
    io.to(`user_${sellerId}`).emit('new_order', {
      orderId,
      buyerName: req.user.name,
      totalAmount,
      itemCount: orderItems.filter(item => item.sellerId === sellerId).length
    });
  }

  logTransaction('order_created', {
    orderId,
    buyerId: req.user.id,
    totalAmount,
    itemCount: orderItems.length,
    paymentMethod
  });

  res.status(201).json({
    success: true,
    message: 'Order created successfully',
    data: {
      order: {
        id: orderId,
        ...orderData
      }
    }
  });
}));

// @desc    Get user's orders
// @route   GET /api/orders
// @access  Private
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status, type = 'buyer' } = req.query;

  let query;
  
  if (type === 'seller' && req.user.role === 'Seller') {
    // Get orders where user is the seller
    query = collections.orders.where('items', 'array-contains-any', 
      [{ sellerId: req.user.id }]); // This is a simplified approach
  } else {
    // Get orders where user is the buyer
    query = collections.orders.where('buyerId', '==', req.user.id);
  }

  if (status && ORDER_STATUSES.includes(status)) {
    query = query.where('status', '==', status);
  }

  const snapshot = await query.orderBy('createdAt', 'desc').get();
  let orders = snapshot.docs.map(doc => {
    const orderData = doc.data();
    
    // Filter items for seller view
    if (type === 'seller') {
      orderData.items = orderData.items.filter(item => item.sellerId === req.user.id);
    }
    
    return orderData;
  });

  // For seller view, filter out orders that don't have items for this seller
  if (type === 'seller') {
    orders = orders.filter(order => order.items.length > 0);
  }

  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedOrders = orders.slice(startIndex, endIndex);

  const total = orders.length;
  const totalPages = Math.ceil(total / limit);

  res.json({
    success: true,
    data: {
      orders: paginatedOrders,
      pagination: {
        current: parseInt(page),
        pages: totalPages,
        total,
        limit: parseInt(limit)
      }
    }
  });
}));

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const orderDoc = await collections.orders.doc(id).get();

  if (!orderDoc.exists) {
    throw new AppError('Order not found', 404);
  }

  const orderData = orderDoc.data();

  // Check if user has access to this order
  const isbuyer = orderData.buyerId === req.user.id;
  const isSeller = orderData.items.some(item => item.sellerId === req.user.id);
  const isAdmin = req.user.role === 'Admin';

  if (!isbuyer && !isSeller && !isAdmin) {
    throw new AppError('Access denied', 403);
  }

  // Get related escrow if exists
  let escrow = null;
  if (orderData.paymentMethod === 'escrow') {
    const escrowQuery = await collections.escrows.where('orderId', '==', id).get();
    if (!escrowQuery.empty) {
      escrow = escrowQuery.docs[0].data();
    }
  }

  res.json({
    success: true,
    data: {
      order: orderData,
      escrow
    }
  });
}));

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private
router.put('/:id/status', authenticate, validationHandler(updateOrderValidation), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, trackingNumber, notes } = req.body;

  const orderDoc = await collections.orders.doc(id).get();

  if (!orderDoc.exists) {
    throw new AppError('Order not found', 404);
  }

  const orderData = orderDoc.data();

  // Check permissions based on status update
  const isAdmin = req.user.role === 'Admin';
  const isBuyer = orderData.buyerId === req.user.id;
  const isSeller = orderData.items.some(item => item.sellerId === req.user.id);

  // Define who can update what status
  const statusPermissions = {
    'confirmed': ['Admin', 'Seller'],
    'shipped_to_escrow': ['Admin', 'Seller'],
    'at_escrow': ['Admin'],
    'awaiting_buyer_confirm': ['Admin'],
    'completed': ['Admin', 'Buyer'],
    'cancelled': ['Admin', 'Buyer', 'Seller'],
    'refunded': ['Admin']
  };

  if (status && statusPermissions[status]) {
    const allowedRoles = statusPermissions[status];
    let hasPermission = false;

    if (allowedRoles.includes('Admin') && isAdmin) hasPermission = true;
    if (allowedRoles.includes('Buyer') && isBuyer) hasPermission = true;
    if (allowedRoles.includes('Seller') && isSeller) hasPermission = true;

    if (!hasPermission) {
      throw new AppError('Access denied for this status update', 403);
    }
  }

  // Validate status transition
  const validTransitions = {
    'pending': ['confirmed', 'cancelled'],
    'confirmed': ['shipped_to_escrow', 'cancelled'],
    'shipped_to_escrow': ['at_escrow', 'cancelled'],
    'at_escrow': ['awaiting_buyer_confirm', 'cancelled'],
    'awaiting_buyer_confirm': ['completed', 'cancelled'],
    'completed': ['refunded'],
    'cancelled': [],
    'refunded': []
  };

  if (status && !validTransitions[orderData.status].includes(status)) {
    throw new AppError(`Cannot transition from ${orderData.status} to ${status}`, 400);
  }

  // Build update data
  const updateData = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  if (status) {
    updateData.status = status;
    updateData.timeline = admin.firestore.FieldValue.arrayUnion({
      status,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      description: notes || `Order status updated to ${status}`,
      updatedBy: req.user.id
    });
  }

  if (trackingNumber) {
    updateData.trackingNumber = trackingNumber;
  }

  if (notes) {
    updateData.notes = notes;
  }

  await collections.orders.doc(id).update(updateData);

  // Update related escrow status if applicable
  if (status && orderData.paymentMethod === 'escrow') {
    const escrowStatusMap = {
      'confirmed': 'held',
      'shipped_to_escrow': 'shipped_to_escrow',
      'at_escrow': 'at_escrow',
      'awaiting_buyer_confirm': 'awaiting_confirmation',
      'completed': 'released',
      'cancelled': 'cancelled',
      'refunded': 'refunded'
    };

    const escrowStatus = escrowStatusMap[status];
    if (escrowStatus) {
      const escrowQuery = await collections.escrows.where('orderId', '==', id).get();
      if (!escrowQuery.empty) {
        const escrowDoc = escrowQuery.docs[0];
        await escrowDoc.ref.update({
          status: escrowStatus,
          timeline: admin.firestore.FieldValue.arrayUnion({
            status: escrowStatus,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            description: `Order status updated to ${status}`
          }),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
  }

  // Send real-time notifications
  const io = req.app.get('io');
  
  // Notify buyer
  io.to(`user_${orderData.buyerId}`).emit('order_status_updated', {
    orderId: id,
    status,
    message: `Your order has been updated to ${status}`
  });

  // Notify sellers
  const sellerIds = [...new Set(orderData.items.map(item => item.sellerId))];
  for (const sellerId of sellerIds) {
    io.to(`user_${sellerId}`).emit('order_status_updated', {
      orderId: id,
      status,
      message: `Order ${id} has been updated to ${status}`
    });
  }

  logTransaction('order_status_updated', {
    orderId: id,
    oldStatus: orderData.status,
    newStatus: status,
    updatedBy: req.user.id
  });

  res.json({
    success: true,
    message: 'Order status updated successfully'
  });
}));

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private
router.put('/:id/cancel', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const orderDoc = await collections.orders.doc(id).get();

  if (!orderDoc.exists) {
    throw new AppError('Order not found', 404);
  }

  const orderData = orderDoc.data();

  // Check if user can cancel this order
  const isBuyer = orderData.buyerId === req.user.id;
  const isSeller = orderData.items.some(item => item.sellerId === req.user.id);
  const isAdmin = req.user.role === 'Admin';

  if (!isBuyer && !isSeller && !isAdmin) {
    throw new AppError('Access denied', 403);
  }

  // Check if order can be cancelled
  const cancellableStatuses = ['pending', 'confirmed'];
  if (!cancellableStatuses.includes(orderData.status)) {
    throw new AppError('Order cannot be cancelled at this stage', 400);
  }

  // Update order status
  await collections.orders.doc(id).update({
    status: 'cancelled',
    cancellationReason: reason || 'Cancelled by user',
    cancelledBy: req.user.id,
    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
    timeline: admin.firestore.FieldValue.arrayUnion({
      status: 'cancelled',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      description: reason || 'Order cancelled',
      updatedBy: req.user.id
    }),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Restore product stock
  const batch = admin.firestore().batch();
  
  for (const item of orderData.items) {
    const productRef = collections.products.doc(item.productId);
    batch.update(productRef, {
      stock: admin.firestore.FieldValue.increment(item.quantity),
      totalSold: admin.firestore.FieldValue.increment(-item.quantity)
    });
  }

  await batch.commit();

  // Cancel related escrow
  if (orderData.paymentMethod === 'escrow') {
    const escrowQuery = await collections.escrows.where('orderId', '==', id).get();
    if (!escrowQuery.empty) {
      const escrowDoc = escrowQuery.docs[0];
      await escrowDoc.ref.update({
        status: 'cancelled',
        timeline: admin.firestore.FieldValue.arrayUnion({
          status: 'cancelled',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          description: 'Order cancelled'
        }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  // Send notifications
  const io = req.app.get('io');
  
  // Notify buyer if cancelled by seller
  if (isSeller) {
    io.to(`user_${orderData.buyerId}`).emit('order_cancelled', {
      orderId: id,
      reason: reason || 'Cancelled by seller'
    });
  }

  // Notify sellers if cancelled by buyer
  if (isBuyer) {
    const sellerIds = [...new Set(orderData.items.map(item => item.sellerId))];
    for (const sellerId of sellerIds) {
      io.to(`user_${sellerId}`).emit('order_cancelled', {
        orderId: id,
        reason: reason || 'Cancelled by buyer'
      });
    }
  }

  logTransaction('order_cancelled', {
    orderId: id,
    cancelledBy: req.user.id,
    reason: reason || 'No reason provided'
  });

  res.json({
    success: true,
    message: 'Order cancelled successfully'
  });
}));

// @desc    Get order statistics (Admin only)
// @route   GET /api/orders/stats
// @access  Private/Admin
router.get('/stats/overview', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const ordersSnapshot = await collections.orders.get();
  const orders = ordersSnapshot.docs.map(doc => doc.data());

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    shipped: orders.filter(o => o.status === 'shipped_to_escrow').length,
    completed: orders.filter(o => o.status === 'completed').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
    totalValue: orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + o.totalAmount, 0),
    averageOrderValue: 0
  };

  const activeOrders = orders.filter(o => o.status !== 'cancelled');
  if (activeOrders.length > 0) {
    stats.averageOrderValue = stats.totalValue / activeOrders.length;
  }

  // Calculate trends (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentOrders = orders.filter(o => {
    if (!o.createdAt) return false;
    const createdDate = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
    return createdDate >= thirtyDaysAgo;
  });

  stats.recentOrders = recentOrders.length;
  stats.recentValue = recentOrders.reduce((sum, o) => sum + o.totalAmount, 0);

  res.json({
    success: true,
    data: {
      stats
    }
  });
}));

// @desc    Get all orders (Admin only)
// @route   GET /api/orders/admin/all
// @access  Private/Admin
router.get('/admin/all', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, search } = req.query;

  let query = collections.orders;

  if (status && ORDER_STATUSES.includes(status)) {
    query = query.where('status', '==', status);
  }

  const snapshot = await query.orderBy('createdAt', 'desc').get();
  let orders = snapshot.docs.map(doc => doc.data());

  // Client-side search filtering
  if (search) {
    const searchLower = search.toLowerCase();
    orders = orders.filter(order =>
      order.id.toLowerCase().includes(searchLower) ||
      order.buyerName.toLowerCase().includes(searchLower) ||
      order.items.some(item => 
        item.productName.toLowerCase().includes(searchLower) ||
        item.sellerName.toLowerCase().includes(searchLower)
      )
    );
  }

  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedOrders = orders.slice(startIndex, endIndex);

  const total = orders.length;
  const totalPages = Math.ceil(total / limit);

  res.json({
    success: true,
    data: {
      orders: paginatedOrders,
      pagination: {
        current: parseInt(page),
        pages: totalPages,
        total,
        limit: parseInt(limit)
      }
    }
  });
}));

module.exports = router;