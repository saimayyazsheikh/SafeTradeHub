// ========================================
// PRODUCT-MANAGEMENT.JS - JavaScript for product management functionality
// ========================================

// Global variables
let products = [];
let filteredProducts = [];
let currentUser = null;
let currentPage = 1;
let itemsPerPage = 12;
let currentView = 'grid';
let currentProduct = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
  initializeProductManagement();
});

async function initializeProductManagement() {
  try {
    console.log('🛍️ Product Management: Starting initialization...');

    // Wait for AuthManager
    if (window.AuthManager) {
      await window.AuthManager.waitForInit();
      currentUser = window.AuthManager.getCurrentUser();

      if (!currentUser) {
        console.error('❌ Product Management: User not authenticated');
        window.location.href = 'auth.html?mode=signin&redirect=' + encodeURIComponent('product-management.html');
        return;
      }

      console.log('✅ Product Management: User authenticated:', currentUser.name);
    }

    // Temporarily allow all authenticated users for testing
    // TODO: Restore seller role restriction after testing
    // if (currentUser.role !== 'Seller' && currentUser.role !== 'Admin') {
    //   alert('Only sellers can manage products. Please contact support to upgrade your account.');
    //   window.location.href = 'dashboard.html';
    //   return;
    // }

    setupEventListeners();
    await loadProducts();
    updateStatistics();

    console.log('✅ Product Management: Initialization complete');

  } catch (error) {
    console.error('❌ Product Management: Initialization error:', error);
    showToast('Failed to initialize product management', 'error');
  }
}

function setupEventListeners() {
  // Search input
  const searchInput = document.getElementById('productSearch');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(handleSearch, 300));
  }

  // Filter controls
  const statusFilter = document.getElementById('statusFilter');
  const categoryFilter = document.getElementById('categoryFilter');
  const sortBy = document.getElementById('sortBy');

  if (statusFilter) statusFilter.addEventListener('change', applyFilters);
  if (categoryFilter) categoryFilter.addEventListener('change', applyFilters);
  if (sortBy) sortBy.addEventListener('change', applyFilters);

  // Clear filters
  const clearFiltersBtn = document.getElementById('clearFilters');
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', clearFilters);
  }

  // View controls
  const gridViewBtn = document.getElementById('gridView');
  const listViewBtn = document.getElementById('listView');

  if (gridViewBtn) gridViewBtn.addEventListener('click', () => switchView('grid'));
  if (listViewBtn) listViewBtn.addEventListener('click', () => switchView('list'));

  // Modal actions
  setupModalEventListeners();
}

function setupModalEventListeners() {
  console.log('🔧 Setting up modal event listeners');

  // Product actions modal
  const editProductBtn = document.getElementById('editProduct');
  const markAsSoldBtn = document.getElementById('markAsSold');
  const toggleStatusBtn = document.getElementById('toggleStatus');
  const viewAnalyticsBtn = document.getElementById('viewAnalytics');
  const duplicateProductBtn = document.getElementById('duplicateProduct');
  const deleteProductBtn = document.getElementById('deleteProduct');

  console.log('📋 Modal buttons found:', {
    editProduct: !!editProductBtn,
    markAsSold: !!markAsSoldBtn,
    toggleStatus: !!toggleStatusBtn,
    viewAnalytics: !!viewAnalyticsBtn,
    duplicateProduct: !!duplicateProductBtn,
    deleteProduct: !!deleteProductBtn
  });

  if (editProductBtn) {
    editProductBtn.addEventListener('click', () => {
      console.log('✏️ Edit Product clicked');
      editProduct();
    });
  }

  if (markAsSoldBtn) {
    markAsSoldBtn.addEventListener('click', () => {
      console.log('💰 Mark as Sold clicked');
      markAsSold();
    });
  }

  if (toggleStatusBtn) {
    toggleStatusBtn.addEventListener('click', () => {
      console.log('🔄 Toggle Status clicked');
      toggleProductStatus();
    });
  }

  if (viewAnalyticsBtn) {
    viewAnalyticsBtn.addEventListener('click', () => {
      console.log('📊 View Analytics clicked');
      viewProductAnalytics();
    });
  }

  if (duplicateProductBtn) {
    duplicateProductBtn.addEventListener('click', () => {
      console.log('📋 Duplicate Product clicked');
      duplicateProduct();
    });
  }

  if (deleteProductBtn) {
    deleteProductBtn.addEventListener('click', () => {
      console.log('🗑️ Delete Product clicked');
      deleteProduct();
    });
  }

  // Confirmation modal
  const confirmActionBtn = document.getElementById('confirmAction');
  if (confirmActionBtn) {
    confirmActionBtn.addEventListener('click', executeConfirmedAction);
  }

  console.log('✅ Modal event listeners setup complete');
}

// Data Loading
// Data Loading
async function loadProducts() {
  try {
    showLoading(true, 'Loading products...');

    if (!currentUser) {
      console.warn('⚠️ Product Management: No user logged in');
      return;
    }

    console.log('🔄 Loading products for seller:', currentUser.id);

    // Fetch products from Firebase RTDB
    const productsRef = firebase.database().ref('products');

    // Query products where sellerId matches current user
    // Note: This requires .indexOn: ["sellerId"] in Firebase Rules
    const snapshot = await productsRef.orderByChild('sellerId').equalTo(currentUser.id).once('value');

    const productsData = [];
    if (snapshot.exists()) {
      snapshot.forEach(childSnapshot => {
        const product = childSnapshot.val();
        // Ensure ID is included
        product.id = childSnapshot.key;
        productsData.push(product);
      });
    }

    console.log(`✅ Found ${productsData.length} products for seller`);

    // Sort by createdAt desc (newest first)
    productsData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    products = productsData;
    filteredProducts = [...products];
    renderProducts();
    updateStatistics();

  } catch (error) {
    console.error('❌ Product Management: Load products error:', error);
    showToast('Failed to load products', 'error');
    showEmptyState();
  } finally {
    showLoading(false);
  }
}

// Rendering
function renderProducts() {
  const container = document.getElementById('productsContainer');
  const emptyState = document.getElementById('emptyState');
  const loadingState = document.getElementById('loadingState');

  if (!container) return;

  // Hide loading state
  if (loadingState) {
    loadingState.style.display = 'none';
  }

  if (filteredProducts.length === 0) {
    container.innerHTML = '';
    if (emptyState) {
      emptyState.style.display = 'block';
    }
    return;
  }

  // Hide empty state
  if (emptyState) {
    emptyState.style.display = 'none';
  }

  // Paginate products
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  // Render products
  if (currentView === 'grid') {
    container.innerHTML = paginatedProducts.map(product => renderProductCard(product)).join('');
  } else {
    container.innerHTML = paginatedProducts.map(product => renderProductListItem(product)).join('');
  }

  // Update pagination
  updatePagination();

  // Add click listeners to product cards
  addProductCardListeners();
}

function renderProductCard(product) {
  const statusClass = getStatusClass(product.status);
  const statusText = getStatusText(product.status);

  console.log('🖼️ Rendering product card for:', product.name);
  console.log('   Product images:', product.images);
  console.log('   Images length:', product.images ? product.images.length : 'undefined');

  // Get main image with better fallback
  let mainImage = '';
  if (product.images && product.images.length > 0) {
    // Find main image or use first image
    const mainImg = product.images.find(img => img.isMain) || product.images[0];
    mainImage = mainImg.url;
    console.log('   Using image:', mainImg.url, 'isMain:', mainImg.isMain);
  } else {
    // Create a simple placeholder
    mainImage = `data:image/svg+xml;base64,${btoa(`
      <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="300" fill="#f3f4f6"/>
        <rect x="50" y="50" width="300" height="200" fill="#e5e7eb" rx="8"/>
        <text x="200" y="120" text-anchor="middle" fill="#6b7280" font-family="Arial" font-size="16">No Image</text>
        <text x="200" y="140" text-anchor="middle" fill="#9ca3af" font-family="Arial" font-size="12">400x300</text>
      </svg>
    `)}`;
    console.log('   Using placeholder image');
  }

  console.log('   Final image URL:', mainImage);

  return `
    <div class="product-card" data-product-id="${product.id}">
      <div class="product-image">
        <img src="${mainImage}" alt="${product.name}" loading="lazy">
        <div class="product-status ${statusClass}">${statusText}</div>
        <div class="product-actions">
          <button class="action-btn" onclick="openProductActions('${product.id}')" title="More actions">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="1"/>
              <circle cx="12" cy="5" r="1"/>
              <circle cx="12" cy="19" r="1"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="product-content">
        <h3 class="product-title">${product.name}</h3>
        <p class="product-description">${product.description}</p>
        <div class="product-meta">
          <div class="product-price">RS ${product.price.toFixed(2)}</div>
          <div class="product-category">${product.category}</div>
        </div>
        <div class="product-stats">
          <div class="stat-item">
            <svg viewBox="0 0 24 24">
              <path d="M1,12C1,12 5,4 12,4C19,4 23,12 23,12C23,12 19,20 12,20C5,20 1,12 1,12Z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span>${product.views || 0} views</span>
          </div>
          <div class="stat-item">
            <svg viewBox="0 0 24 24">
              <path d="M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z"/>
            </svg>
            <span>${product.favorites || 0} favorites</span>
          </div>
        </div>
        <div class="product-footer">
          <div class="product-date">${formatDate(product.createdAt)}</div>
          <div class="product-menu">
            <button class="menu-trigger" onclick="openProductActions('${product.id}')">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="1"/>
                <circle cx="12" cy="5" r="1"/>
                <circle cx="12" cy="19" r="1"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderProductListItem(product) {
  const statusClass = getStatusClass(product.status);
  const statusText = getStatusText(product.status);

  // Get main image with better fallback
  let mainImage = '';
  if (product.images && product.images.length > 0) {
    // Find main image or use first image
    const mainImg = product.images.find(img => img.isMain) || product.images[0];
    mainImage = mainImg.url;
  } else {
    // Create a simple placeholder
    mainImage = `data:image/svg+xml;base64,${btoa(`
      <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="300" fill="#f3f4f6"/>
        <rect x="50" y="50" width="300" height="200" fill="#e5e7eb" rx="8"/>
        <text x="200" y="120" text-anchor="middle" fill="#6b7280" font-family="Arial" font-size="16">No Image</text>
        <text x="200" y="140" text-anchor="middle" fill="#9ca3af" font-family="Arial" font-size="12">400x300</text>
      </svg>
    `)}`;
  }

  return `
    <div class="product-card" data-product-id="${product.id}">
      <div class="product-image">
        <img src="${mainImage}" alt="${product.name}" loading="lazy">
        <div class="product-status ${statusClass}">${statusText}</div>
      </div>
      <div class="product-content">
        <div class="product-header">
          <h3 class="product-title">${product.name}</h3>
          <div class="product-price">RS ${product.price.toFixed(2)}</div>
        </div>
        <p class="product-description">${product.description}</p>
        <div class="product-meta">
          <div class="product-category">${product.category}</div>
          <div class="product-stats">
            <div class="stat-item">
              <svg viewBox="0 0 24 24">
                <path d="M1,12C1,12 5,4 12,4C19,4 23,12 23,12C23,12 19,20 12,20C5,20 1,12 1,12Z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <span>${product.views || 0}</span>
            </div>
            <div class="stat-item">
              <svg viewBox="0 0 24 24">
                <path d="M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z"/>
              </svg>
              <span>${product.favorites || 0}</span>
            </div>
          </div>
        </div>
        <div class="product-footer">
          <div class="product-date">${formatDate(product.createdAt)}</div>
          <div class="product-actions">
            <button class="btn btn-secondary btn-small" onclick="editProduct('${product.id}')">Edit</button>
            <button class="btn btn-primary btn-small" onclick="openProductActions('${product.id}')">More</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function addProductCardListeners() {
  // Add any additional event listeners for product cards
  const productCards = document.querySelectorAll('.product-card');
  productCards.forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't trigger if clicking on buttons
      if (e.target.closest('button')) return;

      const productId = card.dataset.productId;
      viewProductDetails(productId);
    });
  });
}

// Statistics
function updateStatistics() {
  const activeProducts = products.filter(p => p.isActive && p.status !== 'sold').length;
  const soldProducts = products.filter(p => p.status === 'sold').length;
  const draftProducts = products.filter(p => !p.isActive).length;
  const totalRevenue = products.filter(p => p.status === 'sold').reduce((sum, p) => sum + p.price, 0);

  // Update DOM elements
  const activeEl = document.getElementById('activeProducts');
  const soldEl = document.getElementById('soldProducts');
  const draftEl = document.getElementById('draftProducts');
  const revenueEl = document.getElementById('totalRevenue');

  if (activeEl) activeEl.textContent = activeProducts;
  if (soldEl) soldEl.textContent = soldProducts;
  if (draftEl) draftEl.textContent = draftProducts;
  if (revenueEl) revenueEl.textContent = `RS ${totalRevenue.toFixed(2)}`;
}

// Filtering and Search
function handleSearch(e) {
  const query = e.target.value.toLowerCase().trim();

  console.log('🔍 Searching for:', query);

  if (!query) {
    filteredProducts = [...products];
  } else {
    filteredProducts = products.filter(product =>
      product.name.toLowerCase().includes(query) ||
      product.description.toLowerCase().includes(query) ||
      product.category.toLowerCase().includes(query)
    );
  }

  console.log('📋 Filtered products:', filteredProducts.length);
  currentPage = 1;
  renderProducts();
}

function applyFilters() {
  const statusFilter = document.getElementById('statusFilter').value;
  const categoryFilter = document.getElementById('categoryFilter').value;
  const sortBy = document.getElementById('sortBy').value;

  filteredProducts = [...products];

  // Apply status filter
  if (statusFilter) {
    filteredProducts = filteredProducts.filter(product => {
      switch (statusFilter) {
        case 'active':
          return product.isActive && product.status !== 'sold';
        case 'sold':
          return product.status === 'sold';
        case 'draft':
          return !product.isActive;
        case 'inactive':
          return !product.isActive;
        default:
          return true;
      }
    });
  }

  // Apply category filter
  if (categoryFilter) {
    filteredProducts = filteredProducts.filter(product => product.category === categoryFilter);
  }

  // Apply sorting
  filteredProducts.sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'price':
        return b.price - a.price;
      case 'views':
        return (b.views || 0) - (a.views || 0);
      case 'favorites':
        return (b.favorites || 0) - (a.favorites || 0);
      case 'createdAt':
      default:
        return new Date(b.createdAt) - new Date(a.createdAt);
    }
  });

  currentPage = 1;
  renderProducts();
}

function clearFilters() {
  document.getElementById('productSearch').value = '';
  document.getElementById('statusFilter').value = '';
  document.getElementById('categoryFilter').value = '';
  document.getElementById('sortBy').value = 'createdAt';

  filteredProducts = [...products];
  currentPage = 1;
  renderProducts();
}

// View Controls
function switchView(view) {
  currentView = view;

  // Update button states
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-view="${view}"]`).classList.add('active');

  // Update container class
  const container = document.getElementById('productsContainer');
  if (container) {
    container.className = `products-container ${view}-view`;
  }

  renderProducts();
}

// Product Actions
function openProductActions(productId) {
  console.log('🎯 Opening product actions for:', productId);

  currentProduct = products.find(p => p.id === productId);
  if (!currentProduct) {
    console.error('❌ Product not found:', productId);
    return;
  }

  console.log('📦 Current product:', currentProduct);

  const modal = document.getElementById('productActionsModal');
  const productName = document.getElementById('modalProductName');
  const toggleStatusText = document.getElementById('toggleStatusText');

  if (productName) {
    productName.textContent = currentProduct.name;
    console.log('📝 Modal title set to:', currentProduct.name);
  }

  if (toggleStatusText) {
    const statusText = currentProduct.isActive ? 'Deactivate' : 'Activate';
    toggleStatusText.textContent = statusText;
    console.log('🔄 Toggle status text set to:', statusText);
  }

  if (modal) {
    modal.classList.add('show');
    console.log('✅ Modal opened successfully');
  } else {
    console.error('❌ Modal element not found');
  }
}

function closeProductActionsModal() {
  const modal = document.getElementById('productActionsModal');
  if (modal) {
    modal.classList.remove('show');
  }
  currentProduct = null;
}

function editProduct(productId = null) {
  const product = productId ? products.find(p => p.id === productId) : currentProduct;
  if (!product) return;

  console.log('✏️ Editing product:', product.name);

  // Redirect to edit page with product ID
  window.location.href = `product-edit.html?id=${product.id}`;
}

function markAsSold(productId = null) {
  const product = productId ? products.find(p => p.id === productId) : currentProduct;
  if (!product) return;

  console.log('💰 Marking as sold:', product.name);

  showConfirmationModal(
    'Mark as Sold',
    `Are you sure you want to mark "${product.name}" as sold? This will make it unavailable for purchase.`,
    () => updateProductStatus(product.id, 'sold')
  );
}

function toggleProductStatus(productId = null) {
  const product = productId ? products.find(p => p.id === productId) : currentProduct;
  if (!product) return;

  console.log('🔄 Toggling product status for:', product.name);

  const newStatus = product.isActive ? 'inactive' : 'active';
  const action = product.isActive ? 'deactivate' : 'activate';

  showConfirmationModal(
    `${action.charAt(0).toUpperCase() + action.slice(1)} Product`,
    `Are you sure you want to ${action} "${product.name}"?`,
    () => updateProductStatus(product.id, newStatus)
  );
}

function viewProductAnalytics(productId = null) {
  const product = productId ? products.find(p => p.id === productId) : currentProduct;
  if (!product) return;

  console.log('📊 Viewing analytics for:', product.name);

  // Redirect to analytics page
  window.location.href = `product-analytics.html?id=${product.id}`;
}

function duplicateProduct(productId = null) {
  const product = productId ? products.find(p => p.id === productId) : currentProduct;
  if (!product) return;

  console.log('📋 Duplicating product:', product.name);

  showConfirmationModal(
    'Duplicate Product',
    `Are you sure you want to create a copy of "${product.name}"?`,
    () => createProductCopy(product.id)
  );
}

function deleteProduct(productId = null) {
  const product = productId ? products.find(p => p.id === productId) : currentProduct;
  if (!product) return;

  console.log('🗑️ Deleting product:', product.name);

  showConfirmationModal(
    'Delete Product',
    `Are you sure you want to permanently delete "${product.name}"? This action cannot be undone.`,
    () => performDeleteProduct(product.id),
    'danger'
  );
}

// API Calls
async function updateProductStatus(productId, status) {
  try {
    showLoading(true, 'Updating product status...');

    console.log('🔄 Updating product status:', productId, 'to', status);

    // TEMPORARY: Update localStorage for testing
    const testProducts = JSON.parse(localStorage.getItem('testProducts') || '[]');
    const productIndex = testProducts.findIndex(p => p.id === productId);

    if (productIndex !== -1) {
      testProducts[productIndex].status = status;
      testProducts[productIndex].isActive = status === 'active';
      testProducts[productIndex].updatedAt = new Date().toISOString();

      localStorage.setItem('testProducts', JSON.stringify(testProducts));

      // Update local data
      products = testProducts;
      filteredProducts = [...products];
      renderProducts();
      updateStatistics();

      showToast('Product status updated successfully', 'success');
      closeProductActionsModal();

      console.log('✅ Product status updated in localStorage');
    } else {
      throw new Error('Product not found');
    }

    /* ORIGINAL API CODE - COMMENTED OUT FOR TESTING
    const token = localStorage.getItem('authToken');
    const response = await fetch(`/api/products/${productId}/status`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status })
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Update local data
      const productIndex = products.findIndex(p => p.id === productId);
      if (productIndex !== -1) {
        products[productIndex].status = status;
        products[productIndex].isActive = status === 'active';
      }
      
      filteredProducts = [...products];
      renderProducts();
      updateStatistics();
      
      showToast('Product status updated successfully', 'success');
      closeProductActionsModal();
    } else {
      throw new Error(result.message || 'Failed to update product status');
    }
    */

  } catch (error) {
    console.error('❌ Product Management: Update status error:', error);
    showToast(error.message || 'Failed to update product status', 'error');
  } finally {
    showLoading(false);
  }
}

async function createProductCopy(productId) {
  try {
    showLoading(true, 'Creating product copy...');

    console.log('📋 Creating copy of product:', productId);

    // TEMPORARY: Duplicate in localStorage for testing
    const testProducts = JSON.parse(localStorage.getItem('testProducts') || '[]');
    const originalProduct = testProducts.find(p => p.id === productId);

    if (!originalProduct) {
      throw new Error('Product not found');
    }

    // Create duplicate
    const duplicateProduct = {
      ...originalProduct,
      id: 'test_' + Date.now(),
      name: `${originalProduct.name} (Copy)`,
      isActive: false, // Start as draft
      status: 'draft',
      views: 0,
      favorites: 0,
      averageRating: 0,
      totalReviews: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    testProducts.push(duplicateProduct);
    localStorage.setItem('testProducts', JSON.stringify(testProducts));

    // Update local data
    products = testProducts;
    filteredProducts = [...products];
    renderProducts();
    updateStatistics();

    showToast('Product copied successfully', 'success');
    closeProductActionsModal();

    console.log('✅ Product duplicated in localStorage:', duplicateProduct.id);

    /* ORIGINAL API CODE - COMMENTED OUT FOR TESTING
    const originalProduct = products.find(p => p.id === productId);
    if (!originalProduct) throw new Error('Product not found');
    
    const copyData = {
      ...originalProduct,
      name: `${originalProduct.name} (Copy)`,
      isActive: false, // Start as draft
      status: 'draft',
      views: 0,
      favorites: 0,
      createdAt: new Date().toISOString()
    };
    
    // Remove ID and other unique fields
    delete copyData.id;
    delete copyData.createdAt;
    delete copyData.updatedAt;
    
    const token = localStorage.getItem('authToken');
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(copyData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast('Product copied successfully', 'success');
      await loadProducts(); // Reload products
      closeProductActionsModal();
    } else {
      throw new Error(result.message || 'Failed to copy product');
    }
    */

  } catch (error) {
    console.error('❌ Product Management: Copy product error:', error);
    showToast(error.message || 'Failed to copy product', 'error');
  } finally {
    showLoading(false);
  }
}

async function performDeleteProduct(productId) {
  try {
    showLoading(true, 'Deleting product...');

    console.log('🗑️ Deleting product:', productId);

    // TEMPORARY: Delete from localStorage for testing
    const testProducts = JSON.parse(localStorage.getItem('testProducts') || '[]');
    const productIndex = testProducts.findIndex(p => p.id === productId);

    if (productIndex !== -1) {
      testProducts.splice(productIndex, 1);
      localStorage.setItem('testProducts', JSON.stringify(testProducts));

      // Update local data
      products = testProducts;
      filteredProducts = [...products];
      renderProducts();
      updateStatistics();

      showToast('Product deleted successfully', 'success');
      closeProductActionsModal();

      console.log('✅ Product deleted from localStorage');
    } else {
      throw new Error('Product not found');
    }

    /* ORIGINAL API CODE - COMMENTED OUT FOR TESTING
    const token = localStorage.getItem('authToken');
    const response = await fetch(`/api/products/${productId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Remove from local data
      products = products.filter(p => p.id !== productId);
      filteredProducts = [...products];
      renderProducts();
      updateStatistics();
      
      showToast('Product deleted successfully', 'success');
      closeProductActionsModal();
    } else {
      throw new Error(result.message || 'Failed to delete product');
    }
    */

  } catch (error) {
    console.error('❌ Product Management: Delete product error:', error);
    showToast(error.message || 'Failed to delete product', 'error');
  } finally {
    showLoading(false);
  }
}

// Confirmation Modal
let pendingAction = null;

function showConfirmationModal(title, message, action, type = 'warning') {
  console.log('⚠️ Showing confirmation modal:', title);

  const modal = document.getElementById('confirmationModal');
  const titleEl = document.getElementById('confirmationTitle');
  const messageEl = document.getElementById('confirmationMessage');
  const confirmBtn = document.getElementById('confirmAction');

  if (!modal || !titleEl || !messageEl || !confirmBtn) {
    console.error('❌ Confirmation modal elements not found');
    return;
  }

  titleEl.textContent = title;
  messageEl.textContent = message;

  if (confirmBtn) {
    confirmBtn.textContent = type === 'danger' ? 'Delete' : 'Confirm';
    confirmBtn.className = `btn ${type === 'danger' ? 'btn-danger' : 'btn-primary'}`;
  }

  pendingAction = action;

  if (modal) {
    modal.classList.add('show');
    console.log('✅ Confirmation modal shown');
  }
}

function closeConfirmationModal() {
  const modal = document.getElementById('confirmationModal');
  if (modal) {
    modal.classList.remove('show');
  }
  pendingAction = null;
}

function executeConfirmedAction() {
  console.log('✅ Confirmation action executed');

  if (pendingAction) {
    pendingAction();
  }
  closeConfirmationModal();
}

// Pagination
function updatePagination() {
  const pagination = document.getElementById('pagination');
  if (!pagination) return;

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  if (totalPages <= 1) {
    pagination.style.display = 'none';
    return;
  }

  pagination.style.display = 'flex';

  let paginationHTML = '';

  // Previous button
  paginationHTML += `
    <button ${currentPage <= 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">
      <svg viewBox="0 0 24 24">
        <path d="M15,18L9,12L15,6"/>
      </svg>
    </button>
  `;

  // Page numbers
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);

  if (startPage > 1) {
    paginationHTML += `<button onclick="changePage(1)">1</button>`;
    if (startPage > 2) {
      paginationHTML += `<span>...</span>`;
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    paginationHTML += `
      <button ${i === currentPage ? 'class="active"' : ''} onclick="changePage(${i})">${i}</button>
    `;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      paginationHTML += `<span>...</span>`;
    }
    paginationHTML += `<button onclick="changePage(${totalPages})">${totalPages}</button>`;
  }

  // Next button
  paginationHTML += `
    <button ${currentPage >= totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">
      <svg viewBox="0 0 24 24">
        <path d="M9,18L15,12L9,6"/>
      </svg>
    </button>
  `;

  pagination.innerHTML = paginationHTML;
}

function changePage(page) {
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  if (page < 1 || page > totalPages) return;

  currentPage = page;
  renderProducts();

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Utility Functions
function getStatusClass(status) {
  switch (status) {
    case 'active':
      return 'active';
    case 'sold':
      return 'sold';
    case 'draft':
      return 'draft';
    case 'inactive':
      return 'inactive';
    default:
      return 'draft';
  }
}

function getStatusText(status) {
  switch (status) {
    case 'active':
      return 'Active';
    case 'sold':
      return 'Sold';
    case 'draft':
      return 'Draft';
    case 'inactive':
      return 'Inactive';
    default:
      return 'Draft';
  }
}

function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (error) {
    return 'Invalid date';
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function showLoading(show, text = 'Processing...') {
  const overlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');

  if (overlay) {
    overlay.classList.toggle('show', show);
  }

  if (loadingText) {
    loadingText.textContent = text;
  }
}

function showToast(message, type = 'info') {
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span>${message}</span>
      <button style="background: none; border: none; cursor: pointer; margin-left: 12px;" onclick="this.parentElement.parentElement.remove()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
        </svg>
      </button>
    </div>
  `;

  // Add to page
  document.body.appendChild(toast);

  // Show toast
  setTimeout(() => toast.classList.add('show'), 100);

  // Auto remove after 5 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function showEmptyState() {
  const container = document.getElementById('productsContainer');
  const emptyState = document.getElementById('emptyState');
  const loadingState = document.getElementById('loadingState');

  if (container) container.innerHTML = '';
  if (loadingState) loadingState.style.display = 'none';
  if (emptyState) emptyState.style.display = 'block';
}

function viewProductDetails(productId) {
  // Redirect to product details page
  window.location.href = `product-details.html?id=${productId}`;
}

// Global functions for HTML onclick handlers
window.openProductActions = openProductActions;
window.closeProductActionsModal = closeProductActionsModal;
window.closeConfirmationModal = closeConfirmationModal;
window.executeConfirmedAction = executeConfirmedAction;
window.changePage = changePage;
window.editProduct = editProduct;
window.markAsSold = markAsSold;
window.toggleProductStatus = toggleProductStatus;
window.viewProductAnalytics = viewProductAnalytics;
window.duplicateProduct = duplicateProduct;
window.deleteProduct = deleteProduct;

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializeProductManagement,
    loadProducts,
    renderProducts,
    updateProductStatus,
    deleteProduct
  };
}
