const express = require('express');
const { body, query } = require('express-validator');
const router = express.Router();

const { admin, collections } = require('../config/database');
const { authenticate, requireSeller, requireAdmin, optionalAuth } = require('../middleware/auth');
const { asyncHandler, validationHandler, AppError } = require('../middleware/errorHandler');
const { logger } = require('../config/logger');

// Product categories
const CATEGORIES = [
  'mobile', 'camera', 'computers', 'fashion', 'beauty', 'books',
  'furniture', 'gym', 'home', 'services', 'sports', 'pets'
];

// Validation rules
const createProductValidation = [
  body('name').trim().isLength({ min: 3, max: 100 }).withMessage('Product name must be between 3 and 100 characters'),
  body('description').trim().isLength({ min: 10, max: 2000 }).withMessage('Description must be between 10 and 2000 characters'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('category').isIn(CATEGORIES).withMessage('Invalid category'),
  body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
  body('condition').isIn(['new', 'used', 'refurbished']).withMessage('Invalid condition'),
  body('location').optional().trim().isLength({ max: 100 }).withMessage('Location must not exceed 100 characters'),
  body('specifications').optional().isObject().withMessage('Specifications must be an object'),
  body('tags').optional().isArray().withMessage('Tags must be an array')
];

const updateProductValidation = [
  body('name').optional().trim().isLength({ min: 3, max: 100 }).withMessage('Product name must be between 3 and 100 characters'),
  body('description').optional().trim().isLength({ min: 10, max: 2000 }).withMessage('Description must be between 10 and 2000 characters'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('category').optional().isIn(CATEGORIES).withMessage('Invalid category'),
  body('stock').optional().isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
  body('condition').optional().isIn(['new', 'used', 'refurbished']).withMessage('Invalid condition'),
  body('location').optional().trim().isLength({ max: 100 }).withMessage('Location must not exceed 100 characters'),
  body('specifications').optional().isObject().withMessage('Specifications must be an object'),
  body('tags').optional().isArray().withMessage('Tags must be an array')
];

const searchValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('minPrice').optional().isFloat({ min: 0 }).withMessage('Minimum price must be a positive number'),
  query('maxPrice').optional().isFloat({ min: 0 }).withMessage('Maximum price must be a positive number'),
  query('category').optional().isIn(CATEGORIES).withMessage('Invalid category'),
  query('condition').optional().isIn(['new', 'used', 'refurbished']).withMessage('Invalid condition'),
  query('sortBy').optional().isIn(['price', 'createdAt', 'name', 'rating']).withMessage('Invalid sort field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc')
];

// @desc    Get all products with filtering and pagination
// @route   GET /api/products
// @access  Public
router.get('/', optionalAuth, validationHandler(searchValidation), asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 12,
    search,
    category,
    minPrice,
    maxPrice,
    condition,
    location,
    seller,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  let query = collections.products.where('isActive', '==', true);

  // Add filters
  if (category) {
    query = query.where('category', '==', category);
  }

  if (seller) {
    query = query.where('sellerId', '==', seller);
  }

  if (condition) {
    query = query.where('condition', '==', condition);
  }

  // Execute query
  const snapshot = await query.get();
  let products = snapshot.docs.map(doc => {
    const productData = doc.data();
    return {
      id: doc.id,
      ...productData,
      // Don't expose seller's personal info
      seller: {
        id: productData.sellerId,
        name: productData.sellerName || 'Seller'
      }
    };
  });

  // Client-side filtering for complex queries
  if (search) {
    const searchLower = search.toLowerCase();
    products = products.filter(product =>
      product.name.toLowerCase().includes(searchLower) ||
      product.description.toLowerCase().includes(searchLower) ||
      (product.tags && product.tags.some(tag => tag.toLowerCase().includes(searchLower)))
    );
  }

  if (minPrice || maxPrice) {
    products = products.filter(product => {
      const price = parseFloat(product.price);
      if (minPrice && price < parseFloat(minPrice)) return false;
      if (maxPrice && price > parseFloat(maxPrice)) return false;
      return true;
    });
  }

  if (location) {
    const locationLower = location.toLowerCase();
    products = products.filter(product =>
      product.location && product.location.toLowerCase().includes(locationLower)
    );
  }

  // Sort products
  products.sort((a, b) => {
    let aValue, bValue;
    
    switch (sortBy) {
      case 'price':
        aValue = parseFloat(a.price);
        bValue = parseFloat(b.price);
        break;
      case 'name':
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
        break;
      case 'rating':
        aValue = a.averageRating || 0;
        bValue = b.averageRating || 0;
        break;
      case 'createdAt':
      default:
        aValue = a.createdAt?.toDate?.() || new Date(a.createdAt);
        bValue = b.createdAt?.toDate?.() || new Date(b.createdAt);
        break;
    }

    if (sortOrder === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedProducts = products.slice(startIndex, endIndex);

  const total = products.length;
  const totalPages = Math.ceil(total / limit);

  res.json({
    success: true,
    data: {
      products: paginatedProducts,
      pagination: {
        current: parseInt(page),
        pages: totalPages,
        total,
        limit: parseInt(limit)
      },
      filters: {
        categories: CATEGORIES,
        conditions: ['new', 'used', 'refurbished']
      }
    }
  });
}));

// @desc    Get product by ID
// @route   GET /api/products/:id
// @access  Public
router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const productDoc = await collections.products.doc(id).get();

  if (!productDoc.exists) {
    throw new AppError('Product not found', 404);
  }

  const productData = productDoc.data();

  // Check if product is active or user is the seller/admin
  if (!productData.isActive && 
      (!req.user || (req.user.id !== productData.sellerId && req.user.role !== 'Admin'))) {
    throw new AppError('Product not found', 404);
  }

  // Get seller information
  let sellerInfo = { id: productData.sellerId, name: 'Seller' };
  try {
    const sellerDoc = await collections.users.doc(productData.sellerId).get();
    if (sellerDoc.exists) {
      const seller = sellerDoc.data();
      sellerInfo = {
        id: seller.id,
        name: seller.name,
        avatar: seller.profile?.avatar,
        rating: seller.sellerRating || 0,
        totalSales: seller.totalSales || 0,
        joinedAt: seller.createdAt,
        verified: seller.verification?.cnic?.verified || false
      };
    }
  } catch (error) {
    logger.warn('Failed to fetch seller info', { productId: id, sellerId: productData.sellerId });
  }

  // Increment view count
  if (req.user?.id !== productData.sellerId) {
    await collections.products.doc(id).update({
      views: admin.firestore.FieldValue.increment(1)
    });
  }

  res.json({
    success: true,
    data: {
      product: {
        id: productDoc.id,
        ...productData,
        seller: sellerInfo
      }
    }
  });
}));

// @desc    Create new product
// @route   POST /api/products
// @access  Private/Seller
router.post('/', authenticate, requireSeller, validationHandler(createProductValidation), asyncHandler(async (req, res) => {
  const {
    name,
    description,
    price,
    category,
    stock,
    condition,
    location,
    specifications,
    tags,
    images
  } = req.body;

  // Get seller information
  const sellerDoc = await collections.users.doc(req.user.id).get();
  if (!sellerDoc.exists) {
    throw new AppError('Seller not found', 404);
  }

  const seller = sellerDoc.data();

  const productData = {
    name: name.trim(),
    description: description.trim(),
    price: parseFloat(price),
    category,
    stock: parseInt(stock),
    condition,
    location: location?.trim() || null,
    specifications: specifications || {},
    tags: tags || [],
    images: images || [],
    sellerId: req.user.id,
    sellerName: seller.name,
    isActive: true,
    isFeatured: false,
    views: 0,
    favorites: 0,
    averageRating: 0,
    totalReviews: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const productRef = await collections.products.add(productData);
  const productId = productRef.id;

  // Update document with ID
  await productRef.update({ id: productId });

  logger.info('Product created', { productId, sellerId: req.user.id, category, price });

  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    data: {
      product: {
        id: productId,
        ...productData
      }
    }
  });
}));

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Seller
router.put('/:id', authenticate, validationHandler(updateProductValidation), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const productDoc = await collections.products.doc(id).get();

  if (!productDoc.exists) {
    throw new AppError('Product not found', 404);
  }

  const productData = productDoc.data();

  // Check if user owns this product or is admin
  if (productData.sellerId !== req.user.id && req.user.role !== 'Admin') {
    throw new AppError('Access denied', 403);
  }

  const updates = {};
  const allowedFields = [
    'name', 'description', 'price', 'category', 'stock', 
    'condition', 'location', 'specifications', 'tags', 'images'
  ];

  // Only update provided fields
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      if (field === 'price') {
        updates[field] = parseFloat(req.body[field]);
      } else if (field === 'stock') {
        updates[field] = parseInt(req.body[field]);
      } else if (field === 'name' || field === 'description' || field === 'location') {
        updates[field] = req.body[field]?.trim();
      } else {
        updates[field] = req.body[field];
      }
    }
  });

  if (Object.keys(updates).length === 0) {
    throw new AppError('No valid fields to update', 400);
  }

  updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

  await collections.products.doc(id).update(updates);

  logger.info('Product updated', { productId: id, sellerId: req.user.id, updates: Object.keys(updates) });

  res.json({
    success: true,
    message: 'Product updated successfully'
  });
}));

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Seller
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const productDoc = await collections.products.doc(id).get();

  if (!productDoc.exists) {
    throw new AppError('Product not found', 404);
  }

  const productData = productDoc.data();

  // Check if user owns this product or is admin
  if (productData.sellerId !== req.user.id && req.user.role !== 'Admin') {
    throw new AppError('Access denied', 403);
  }

  // Soft delete - mark as inactive instead of deleting
  await collections.products.doc(id).update({
    isActive: false,
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  logger.info('Product deleted', { productId: id, sellerId: req.user.id });

  res.json({
    success: true,
    message: 'Product deleted successfully'
  });
}));

// @desc    Get seller's products
// @route   GET /api/products/seller/my-products
// @access  Private/Seller
router.get('/seller/my-products', authenticate, requireSeller, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status = 'all' } = req.query;

  let query = collections.products.where('sellerId', '==', req.user.id);

  // Filter by status
  if (status === 'active') {
    query = query.where('isActive', '==', true);
  } else if (status === 'inactive') {
    query = query.where('isActive', '==', false);
  }

  const snapshot = await query.orderBy('createdAt', 'desc').get();
  const products = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedProducts = products.slice(startIndex, endIndex);

  const total = products.length;
  const totalPages = Math.ceil(total / limit);

  // Calculate stats
  const stats = {
    total: products.length,
    active: products.filter(p => p.isActive).length,
    inactive: products.filter(p => !p.isActive).length,
    totalViews: products.reduce((sum, p) => sum + (p.views || 0), 0),
    totalValue: products.filter(p => p.isActive).reduce((sum, p) => sum + (p.price * p.stock), 0)
  };

  res.json({
    success: true,
    data: {
      products: paginatedProducts,
      stats,
      pagination: {
        current: parseInt(page),
        pages: totalPages,
        total,
        limit: parseInt(limit)
      }
    }
  });
}));

// @desc    Update product status (Admin only)
// @route   PUT /api/products/:id/status
// @access  Private/Admin
router.put('/:id/status', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive, isFeatured } = req.body;

  const productDoc = await collections.products.doc(id).get();

  if (!productDoc.exists) {
    throw new AppError('Product not found', 404);
  }

  const updates = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  if (typeof isActive === 'boolean') {
    updates.isActive = isActive;
  }

  if (typeof isFeatured === 'boolean') {
    updates.isFeatured = isFeatured;
  }

  if (Object.keys(updates).length === 1) { // Only updatedAt
    throw new AppError('No valid status updates provided', 400);
  }

  await collections.products.doc(id).update(updates);

  logger.info('Product status updated by admin', { 
    adminId: req.user.id, 
    productId: id, 
    updates 
  });

  res.json({
    success: true,
    message: 'Product status updated successfully'
  });
}));

// @desc    Get categories with product counts
// @route   GET /api/products/categories
// @access  Public
router.get('/categories/list', asyncHandler(async (req, res) => {
  // Get all active products
  const snapshot = await collections.products.where('isActive', '==', true).get();
  const products = snapshot.docs.map(doc => doc.data());

  // Count products by category
  const categoryCounts = CATEGORIES.reduce((counts, category) => {
    counts[category] = products.filter(p => p.category === category).length;
    return counts;
  }, {});

  const categories = CATEGORIES.map(category => ({
    id: category,
    name: category.charAt(0).toUpperCase() + category.slice(1),
    slug: category,
    productCount: categoryCounts[category]
  }));

  res.json({
    success: true,
    data: {
      categories
    }
  });
}));

// @desc    Add product to favorites
// @route   POST /api/products/:id/favorite
// @access  Private
router.post('/:id/favorite', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const productDoc = await collections.products.doc(id).get();

  if (!productDoc.exists) {
    throw new AppError('Product not found', 404);
  }

  // Check if already favorited
  const favoriteQuery = await collections.users.doc(req.user.id)
    .collection('favorites').doc(id).get();

  if (favoriteQuery.exists) {
    throw new AppError('Product already in favorites', 400);
  }

  // Add to user's favorites
  await collections.users.doc(req.user.id)
    .collection('favorites').doc(id).set({
      productId: id,
      addedAt: admin.firestore.FieldValue.serverTimestamp()
    });

  // Increment product favorites count
  await collections.products.doc(id).update({
    favorites: admin.firestore.FieldValue.increment(1)
  });

  logger.info('Product added to favorites', { userId: req.user.id, productId: id });

  res.json({
    success: true,
    message: 'Product added to favorites'
  });
}));

// @desc    Remove product from favorites
// @route   DELETE /api/products/:id/favorite
// @access  Private
router.delete('/:id/favorite', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if favorited
  const favoriteQuery = await collections.users.doc(req.user.id)
    .collection('favorites').doc(id).get();

  if (!favoriteQuery.exists) {
    throw new AppError('Product not in favorites', 400);
  }

  // Remove from user's favorites
  await collections.users.doc(req.user.id)
    .collection('favorites').doc(id).delete();

  // Decrement product favorites count
  await collections.products.doc(id).update({
    favorites: admin.firestore.FieldValue.increment(-1)
  });

  logger.info('Product removed from favorites', { userId: req.user.id, productId: id });

  res.json({
    success: true,
    message: 'Product removed from favorites'
  });
}));

// @desc    Get user's favorite products
// @route   GET /api/products/favorites
// @access  Private
router.get('/user/favorites', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 12 } = req.query;

  // Get user's favorites
  const favoritesSnapshot = await collections.users.doc(req.user.id)
    .collection('favorites').orderBy('addedAt', 'desc').get();

  const favoriteIds = favoritesSnapshot.docs.map(doc => doc.id);

  if (favoriteIds.length === 0) {
    return res.json({
      success: true,
      data: {
        products: [],
        pagination: {
          current: 1,
          pages: 0,
          total: 0,
          limit: parseInt(limit)
        }
      }
    });
  }

  // Get products in batches (Firestore limit)
  const products = [];
  const batchSize = 10;

  for (let i = 0; i < favoriteIds.length; i += batchSize) {
    const batch = favoriteIds.slice(i, i + batchSize);
    const productSnapshot = await collections.products
      .where(admin.firestore.FieldPath.documentId(), 'in', batch)
      .get();
    
    productSnapshot.docs.forEach(doc => {
      const productData = doc.data();
      if (productData.isActive) {
        products.push({
          id: doc.id,
          ...productData
        });
      }
    });
  }

  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedProducts = products.slice(startIndex, endIndex);

  const total = products.length;
  const totalPages = Math.ceil(total / limit);

  res.json({
    success: true,
    data: {
      products: paginatedProducts,
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