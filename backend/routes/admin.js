const express = require('express');
const router = express.Router();

const { admin, collections } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { logger } = require('../config/logger');

// @desc    Get dashboard statistics
// @route   GET /api/admin/dashboard
// @access  Private/Admin
router.get('/dashboard', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  try {
    // Get all collections data in parallel
    const [usersSnapshot, productsSnapshot, ordersSnapshot, escrowsSnapshot, disputesSnapshot] = await Promise.all([
      collections.users.get(),
      collections.products.get(),
      collections.orders.get(),
      collections.escrows.get(),
      collections.disputes.get()
    ]);

    const users = usersSnapshot.docs.map(doc => doc.data());
    const products = productsSnapshot.docs.map(doc => doc.data());
    const orders = ordersSnapshot.docs.map(doc => doc.data());
    const escrows = escrowsSnapshot.docs.map(doc => doc.data());
    const disputes = disputesSnapshot.docs.map(doc => doc.data());

    // Calculate statistics
    const stats = {
      users: {
        total: users.length,
        active: users.filter(u => u.isActive).length,
        buyers: users.filter(u => u.role === 'Buyer').length,
        sellers: users.filter(u => u.role === 'Seller').length,
        verified: users.filter(u => u.verification?.email && u.verification?.cnic?.verified).length
      },
      products: {
        total: products.length,
        active: products.filter(p => p.isActive).length,
        categories: [...new Set(products.map(p => p.category))].length
      },
      orders: {
        total: orders.length,
        pending: orders.filter(o => o.status === 'pending').length,
        completed: orders.filter(o => o.status === 'completed').length,
        cancelled: orders.filter(o => o.status === 'cancelled').length,
        totalValue: orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + (o.totalAmount || 0), 0)
      },
      escrows: {
        total: escrows.length,
        held: escrows.filter(e => ['held', 'shipped_to_escrow', 'at_escrow', 'awaiting_confirmation'].includes(e.status)).length,
        totalHeld: escrows.filter(e => ['held', 'shipped_to_escrow', 'at_escrow', 'awaiting_confirmation'].includes(e.status))
                          .reduce((sum, e) => sum + (e.amount || 0), 0),
        released: escrows.filter(e => e.status === 'released').length,
        disputed: escrows.filter(e => e.status === 'disputed').length
      },
      disputes: {
        total: disputes.length,
        open: disputes.filter(d => d.status === 'open').length,
        resolved: disputes.filter(d => d.status === 'resolved').length,
        highPriority: disputes.filter(d => d.priority === 'high' && d.status === 'open').length
      }
    };

    // Calculate trends (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentUsers = users.filter(u => {
      if (!u.createdAt) return false;
      const createdDate = u.createdAt.toDate ? u.createdAt.toDate() : new Date(u.createdAt);
      return createdDate >= thirtyDaysAgo;
    });

    const recentOrders = orders.filter(o => {
      if (!o.createdAt) return false;
      const createdDate = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
      return createdDate >= thirtyDaysAgo;
    });

    stats.trends = {
      newUsers: recentUsers.length,
      newOrders: recentOrders.length,
      recentRevenue: recentOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0)
    };

    res.json({
      success: true,
      data: {
        stats
      }
    });
  } catch (error) {
    logger.error('Error fetching admin dashboard stats:', error);
    throw new AppError('Failed to fetch dashboard statistics', 500);
  }
}));

// @desc    Get recent activity
// @route   GET /api/admin/activity
// @access  Private/Admin
router.get('/activity', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { limit = 20 } = req.query;

  try {
    // Get recent orders, users, and disputes
    const [recentOrdersSnapshot, recentUsersSnapshot, recentDisputesSnapshot] = await Promise.all([
      collections.orders.orderBy('createdAt', 'desc').limit(10).get(),
      collections.users.orderBy('createdAt', 'desc').limit(10).get(),
      collections.disputes.orderBy('createdAt', 'desc').limit(10).get()
    ]);

    const activities = [];

    // Add recent orders
    recentOrdersSnapshot.docs.forEach(doc => {
      const order = doc.data();
      activities.push({
        type: 'order',
        action: 'created',
        description: `New order ${order.id} for $${order.totalAmount}`,
        user: order.buyerName,
        timestamp: order.createdAt,
        data: {
          orderId: order.id,
          amount: order.totalAmount
        }
      });
    });

    // Add recent users
    recentUsersSnapshot.docs.forEach(doc => {
      const user = doc.data();
      activities.push({
        type: 'user',
        action: 'registered',
        description: `New ${user.role.toLowerCase()} registered: ${user.name}`,
        user: user.name,
        timestamp: user.createdAt,
        data: {
          userId: user.id,
          role: user.role
        }
      });
    });

    // Add recent disputes
    recentDisputesSnapshot.docs.forEach(doc => {
      const dispute = doc.data();
      activities.push({
        type: 'dispute',
        action: 'created',
        description: `New dispute for order ${dispute.orderId}`,
        user: 'User',
        timestamp: dispute.createdAt,
        data: {
          disputeId: dispute.id,
          orderId: dispute.orderId
        }
      });
    });

    // Sort by timestamp and limit
    activities.sort((a, b) => {
      const aTime = a.timestamp?.toDate?.() || new Date(a.timestamp);
      const bTime = b.timestamp?.toDate?.() || new Date(b.timestamp);
      return bTime - aTime;
    });

    const limitedActivities = activities.slice(0, parseInt(limit));

    res.json({
      success: true,
      data: {
        activities: limitedActivities
      }
    });
  } catch (error) {
    logger.error('Error fetching admin activity:', error);
    throw new AppError('Failed to fetch recent activity', 500);
  }
}));

// @desc    Get system health
// @route   GET /api/admin/health
// @access  Private/Admin
router.get('/health', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: 'healthy',
      cache: 'healthy',
      storage: 'healthy'
    },
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  };

  // Check database connectivity
  try {
    await collections.users.limit(1).get();
    health.services.database = 'healthy';
  } catch (error) {
    health.services.database = 'unhealthy';
    health.status = 'degraded';
  }

  res.json({
    success: true,
    data: health
  });
}));

// @desc    Get all orders with filtering and pagination
// @route   GET /api/admin/orders
// @access  Private/Admin
router.get('/orders', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20, search } = req.query;

  try {
    let query = collections.orders;

    // Apply status filter
    if (status && status !== '') {
      query = query.where('status', '==', status);
    }

    // Get orders
    const ordersSnapshot = await query.orderBy('createdAt', 'desc').get();
    let orders = ordersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      orders = orders.filter(order => 
        order.id.toLowerCase().includes(searchLower) ||
        order.buyerName?.toLowerCase().includes(searchLower) ||
        order.sellerName?.toLowerCase().includes(searchLower)
      );
    }

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedOrders = orders.slice(startIndex, endIndex);

    // Get order status counts
    const statusCounts = {
      pending: orders.filter(o => o.status === 'pending').length,
      shipped: orders.filter(o => o.status === 'shipped').length,
      delivered: orders.filter(o => o.status === 'delivered').length,
      disputed: orders.filter(o => o.status === 'disputed').length
    };

    res.json({
      success: true,
      data: {
        orders: paginatedOrders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: orders.length,
          pages: Math.ceil(orders.length / limit)
        },
        statusCounts
      }
    });
  } catch (error) {
    logger.error('Error fetching orders:', error);
    throw new AppError('Failed to fetch orders', 500);
  }
}));

// @desc    Update order status
// @route   PUT /api/admin/orders/:id/status
// @access  Private/Admin
router.put('/orders/:id/status', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, trackingNumber, notes } = req.body;

  const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'disputed'];
  if (!validStatuses.includes(status)) {
    throw new AppError('Invalid order status', 400);
  }

  try {
    const orderRef = collections.orders.doc(id);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      throw new AppError('Order not found', 404);
    }

    const updateData = {
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.id
    };

    if (trackingNumber) {
      updateData.trackingNumber = trackingNumber;
    }

    if (notes) {
      updateData.adminNotes = notes;
    }

    // Add status history
    const statusHistory = orderDoc.data().statusHistory || [];
    statusHistory.push({
      status,
      timestamp: new Date(),
      updatedBy: req.user.id,
      notes
    });
    updateData.statusHistory = statusHistory;

    await orderRef.update(updateData);

    logger.info('Order status updated by admin', {
      adminId: req.user.id,
      orderId: id,
      newStatus: status
    });

    res.json({
      success: true,
      message: 'Order status updated successfully'
    });
  } catch (error) {
    logger.error('Error updating order status:', error);
    throw new AppError('Failed to update order status', 500);
  }
}));

// @desc    Get logistics providers and their status
// @route   GET /api/admin/logistics/providers
// @access  Private/Admin
router.get('/logistics/providers', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  try {
    // Mock data for logistics providers - in real implementation, this would come from database
    const providers = [
      {
        id: 'tcs',
        name: 'TCS Express',
        status: 'active',
        activeShipments: 45,
        deliveryRate: 98,
        apiEndpoint: process.env.TCS_API_ENDPOINT,
        isConfigured: !!process.env.TCS_API_KEY
      },
      {
        id: 'leopards',
        name: 'Leopards Courier',
        status: 'active',
        activeShipments: 32,
        deliveryRate: 96,
        apiEndpoint: process.env.LEOPARDS_API_ENDPOINT,
        isConfigured: !!process.env.LEOPARDS_API_KEY
      },
      {
        id: 'postex',
        name: 'PostEx',
        status: 'inactive',
        activeShipments: 0,
        deliveryRate: 0,
        apiEndpoint: process.env.POSTEX_API_ENDPOINT,
        isConfigured: !!process.env.POSTEX_API_KEY
      }
    ];

    res.json({
      success: true,
      data: { providers }
    });
  } catch (error) {
    logger.error('Error fetching logistics providers:', error);
    throw new AppError('Failed to fetch logistics providers', 500);
  }
}));

// @desc    Get recent logistics activity
// @route   GET /api/admin/logistics/activity
// @access  Private/Admin
router.get('/logistics/activity', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { limit = 20 } = req.query;

  try {
    // Get recent orders with tracking updates
    const ordersSnapshot = await collections.orders
      .where('status', 'in', ['shipped', 'delivered'])
      .orderBy('updatedAt', 'desc')
      .limit(parseInt(limit))
      .get();

    const activities = ordersSnapshot.docs.map(doc => {
      const order = doc.data();
      const latestStatus = order.statusHistory?.[order.statusHistory.length - 1];
      
      return {
        id: doc.id,
        orderId: order.id,
        type: order.status === 'delivered' ? 'delivery' : 'pickup',
        status: order.status,
        trackingNumber: order.trackingNumber,
        provider: order.logisticsProvider || 'TCS Express',
        timestamp: latestStatus?.timestamp || order.updatedAt,
        customerName: order.buyerName,
        location: order.deliveryAddress?.city || 'Unknown'
      };
    });

    res.json({
      success: true,
      data: { activities }
    });
  } catch (error) {
    logger.error('Error fetching logistics activity:', error);
    throw new AppError('Failed to fetch logistics activity', 500);
  }
}));

// @desc    Update logistics provider configuration
// @route   PUT /api/admin/logistics/providers/:id
// @access  Private/Admin
router.put('/logistics/providers/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, apiKey, apiEndpoint } = req.body;

  try {
    // In a real implementation, this would update the provider configuration in database
    // For now, we'll just log the update
    logger.info('Logistics provider configuration updated', {
      adminId: req.user.id,
      providerId: id,
      status
    });

    res.json({
      success: true,
      message: `${id} provider configuration updated successfully`
    });
  } catch (error) {
    logger.error('Error updating logistics provider:', error);
    throw new AppError('Failed to update logistics provider', 500);
  }
}));

module.exports = router;