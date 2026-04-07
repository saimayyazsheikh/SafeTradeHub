/* ========================================
   ADMIN-DASHBOARD.JS - Real-time Admin Dashboard
   ======================================== */

// Firebase instances (already initialized in HTML)
let auth, db;

// Initialize Firebase instances safely
try {
  auth = firebase.auth();
  db = firebase.firestore();
  console.log('Firebase instances initialized successfully');
} catch (error) {
  console.error('Firebase instances initialization error:', error);
  auth = null;
  db = null;
}

// Global variables
let currentSection = 'dashboard';
let adminData = {
  stats: {},
  users: [],
  products: [],
  orders: [],
  escrows: [],
  disputes: [],
  transactions: [],
  logistics: {},
  recentActivity: []
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  if (document.body.classList.contains('admin-dashboard-body')) {
    initializeDashboard();
  }
});

// Initialize dashboard
async function initializeDashboard() {
  console.log('Initializing Admin Dashboard');
  
  // Wait for AuthManager to initialize
  await waitForAuthManager();
  
  // Setup navigation
  setupNavigation();
  
  // Show dashboard section by default
  showSection('dashboard');
  
  // Setup event listeners
  setupEventListeners();
  
  // Load initial data
  await loadDashboardData();
}

// Wait for AuthManager to be available
async function waitForAuthManager() {
  let attempts = 0;
  const maxAttempts = 50; // 5 seconds max wait
  
  while (!window.authManager && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  
  if (!window.authManager) {
    console.warn('AuthManager not available after waiting');
  }
}

// Setup navigation
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  console.log('Setting up navigation for', navItems.length, 'items');
  
  navItems.forEach(item => {
    const section = item.getAttribute('data-section');
    console.log('Navigation item:', section, item);
    
    item.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Navigation clicked:', section);
      if (section) {
        showSection(section);
      }
    });
  });
}

// Show section
async function showSection(sectionName) {
  console.log('Switching to section:', sectionName);
  
  // Update navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  
  const activeNavItem = document.querySelector(`[data-section="${sectionName}"]`);
  if (activeNavItem) {
    activeNavItem.classList.add('active');
  }
  
  // Hide all sections
  document.querySelectorAll('.admin-section').forEach(section => {
    section.classList.remove('active');
  });
  
  // Show target section
  const targetSection = document.getElementById(`${sectionName}-section`);
  if (targetSection) {
    targetSection.classList.add('active');
    currentSection = sectionName;
    
    // Load section data
    await loadSectionData(sectionName);
  } else {
    console.error('Section not found:', sectionName);
  }
}

// Load section data
async function loadSectionData(sectionName) {
  console.log('Loading data for section:', sectionName);
  
  switch (sectionName) {
    case 'dashboard':
      await loadDashboardData();
      break;
    case 'users':
      await loadUsersData();
      break;
    case 'verification':
      await loadVerificationData();
      break;
    case 'products':
      await loadProductsData();
      break;
    case 'categories':
      await loadCategoriesData();
      break;
    case 'orders':
      await loadOrdersData();
      break;
    case 'logistics':
      await loadLogisticsData();
      break;
    case 'escrow':
      await loadEscrowData();
      break;
    case 'disputes':
      await loadDisputesData();
      break;
    case 'transactions':
      await loadTransactionsData();
      break;
    case 'analytics':
      await loadAnalyticsData();
      break;
    case 'settings':
      await loadSettingsData();
      break;
  }
}

// Get data from localStorage using correct keys
function getLocalStorageData(key) {
  try {
    // Map to correct localStorage keys used by your website
    const keyMap = {
      'users': 'userData', // User data is stored differently
      'orders': 'sthub_orders',
      'escrows': 'sthub_escrows', 
      'disputes': 'sthub_disputes',
      'products': 'sthub_products',
      'cart': 'sthub_cart'
    };
    
    const actualKey = keyMap[key] || key;
    const data = localStorage.getItem(actualKey);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error(`Error reading ${key} from localStorage:`, error);
    return [];
  }
}

// Load Dashboard Data
async function loadDashboardData() {
  try {
    showLoading('dashboard');
    
    // Load real data from localStorage
    const stats = await getRealStatsFromLocalStorage();
    adminData.stats = stats;
    
    // Load recent activity
    const recentActivity = await getRecentActivityFromLocalStorage();
    adminData.recentActivity = recentActivity;
    
    // Update dashboard UI
    updateDashboardStats();
    updateRecentActivity();
    
    hideLoading('dashboard');
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    showError('Failed to load dashboard data');
    hideLoading('dashboard');
  }
}

// Get real statistics from localStorage
async function getRealStatsFromLocalStorage() {
  try {
    // Get user data (single user object, not array)
    const userData = JSON.parse(localStorage.getItem('userData') || 'null');
    const users = userData ? [userData] : [];
    
    // Get other data using correct keys
    const products = getLocalStorageData('products');
    const orders = getLocalStorageData('orders');
    const escrows = getLocalStorageData('escrows');
    const disputes = getLocalStorageData('disputes');
    
    console.log('LocalStorage data found:', {
      users: users.length,
      products: products.length,
      orders: orders.length,
      escrows: escrows.length,
      disputes: disputes.length
    });
    
    // Calculate statistics
    const stats = {
      users: {
        total: users.length,
        active: users.filter(u => u.isActive !== false).length,
        buyers: users.filter(u => u.role === 'Buyer').length,
        sellers: users.filter(u => u.role === 'Seller').length,
        verified: users.filter(u => u.verification?.email && u.verification?.phone).length
      },
      products: {
        total: products.length,
        active: products.filter(p => p.isActive !== false).length,
        categories: [...new Set(products.map(p => p.category))].length
      },
      orders: {
        total: orders.length,
        pending: orders.filter(o => o.status === 'pending').length,
        shipped: orders.filter(o => o.status === 'shipped').length,
        delivered: orders.filter(o => o.status === 'delivered').length,
        cancelled: orders.filter(o => o.status === 'cancelled').length,
        totalValue: orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0)
      },
      escrows: {
        total: escrows.length,
        held: escrows.filter(e => e.status === 'held').length,
        released: escrows.filter(e => e.status === 'released').length,
        disputed: escrows.filter(e => e.status === 'disputed').length,
        totalHeld: escrows.filter(e => e.status === 'held').reduce((sum, e) => sum + (e.amount || 0), 0)
      },
      disputes: {
        total: disputes.length,
        open: disputes.filter(d => d.status === 'open').length,
        resolved: disputes.filter(d => d.status === 'resolved').length,
        highPriority: disputes.filter(d => d.priority === 'high').length
      }
    };
    
    return stats;
  } catch (error) {
    console.error('Error calculating real stats:', error);
    return {
      users: { total: 0, active: 0, buyers: 0, sellers: 0, verified: 0 },
      products: { total: 0, active: 0, categories: 0 },
      orders: { total: 0, pending: 0, shipped: 0, delivered: 0, cancelled: 0, totalValue: 0 },
      escrows: { total: 0, held: 0, released: 0, disputed: 0, totalHeld: 0 },
      disputes: { total: 0, open: 0, resolved: 0, highPriority: 0 }
    };
  }
}

// Get recent activity from localStorage
async function getRecentActivityFromLocalStorage() {
  try {
    const activities = [];
    const orders = getLocalStorageData('orders');
    const users = getLocalStorageData('users');
    
    // Get recent orders
    const recentOrders = orders
      .sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at))
      .slice(0, 5);
    
    recentOrders.forEach(order => {
      const buyer = users.find(u => u.id === order.buyerId || u.uid === order.buyerId);
      const seller = users.find(u => u.id === order.sellerId || u.uid === order.sellerId);
      
      activities.push({
        id: order.id,
        type: 'order',
        message: `New order from ${buyer?.name || 'Unknown'} to ${seller?.name || 'Unknown'}`,
        timestamp: order.createdAt || order.created_at,
        status: order.status
      });
    });
    
    return activities;
  } catch (error) {
    console.error('Error getting recent activity:', error);
    return [];
  }
}

// Load Users Data
async function loadUsersData() {
  try {
    showLoading('users');
    
    // Load real users from localStorage
    const userData = JSON.parse(localStorage.getItem('userData') || 'null');
    adminData.users = userData ? [{
      id: userData.id || userData.uid,
      ...userData
    }] : [];
    
    console.log('Loaded users from localStorage:', adminData.users.length);
    updateUsersTable();
    
    hideLoading('users');
  } catch (error) {
    console.error('Error loading users data:', error);
    showError('Failed to load users data');
    hideLoading('users');
  }
}

// Load Orders Data
async function loadOrdersData() {
  try {
    showLoading('orders');
    
    // Load real orders from localStorage
    const orders = getLocalStorageData('orders');
    adminData.orders = orders.map(order => ({
      id: order.id,
      ...order
    }));
    
    console.log('Loaded orders from localStorage:', adminData.orders.length);
    
    // Calculate status counts from real data
    const statusCounts = {
      pending: adminData.orders.filter(o => o.status === 'pending').length,
      shipped: adminData.orders.filter(o => o.status === 'shipped').length,
      delivered: adminData.orders.filter(o => o.status === 'delivered').length,
      disputed: adminData.orders.filter(o => o.status === 'disputed').length
    };
    
    // Update order status counts
    updateElementText('pendingOrdersCount', statusCounts.pending);
    updateElementText('shippedOrdersCount', statusCounts.shipped);
    updateElementText('deliveredOrdersCount', statusCounts.delivered);
    updateElementText('disputedOrdersCount', statusCounts.disputed);
    
    // Update orders table
    updateOrdersTable();
    
    hideLoading('orders');
  } catch (error) {
    console.error('Error loading orders data:', error);
    showError('Failed to load orders data');
    hideLoading('orders');
  }
}

// Load Products Data
async function loadProductsData() {
  try {
    showLoading('products');
    
    // Load real products from localStorage
    const products = getLocalStorageData('products');
    adminData.products = products.map(product => ({
      id: product.id,
      ...product
    }));
    
    console.log('Loaded products from localStorage:', adminData.products.length);
    updateProductsTable();
    
    hideLoading('products');
  } catch (error) {
    console.error('Error loading products data:', error);
    showError('Failed to load products data');
    hideLoading('products');
  }
}

// Load Categories Data
async function loadCategoriesData() {
  try {
    showLoading('categories');
    
    // Get categories from products
    const products = getLocalStorageData('products');
    const categories = [...new Set(products.map(p => p.category))].filter(Boolean);
    
    adminData.categories = categories.map(category => ({
      id: category.toLowerCase().replace(/\s+/g, '-'),
      name: category,
      productCount: products.filter(p => p.category === category).length
    }));
    
    console.log('Loaded categories from localStorage:', adminData.categories.length);
    updateCategoriesTable();
    
    hideLoading('categories');
  } catch (error) {
    console.error('Error loading categories data:', error);
    showError('Failed to load categories data');
    hideLoading('categories');
  }
}

// Load Disputes Data
async function loadDisputesData() {
  try {
    showLoading('disputes');
    
    // Load real disputes from localStorage
    const disputes = getLocalStorageData('disputes');
    adminData.disputes = disputes.map(dispute => ({
      id: dispute.id,
      ...dispute
    }));
    
    console.log('Loaded disputes from localStorage:', adminData.disputes.length);
    updateDisputesTable();
    
    hideLoading('disputes');
  } catch (error) {
    console.error('Error loading disputes data:', error);
    showError('Failed to load disputes data');
    hideLoading('disputes');
  }
}

// Load Transactions Data
async function loadTransactionsData() {
  try {
    showLoading('transactions');
    
    // Load real escrows as transactions from localStorage
    const escrows = getLocalStorageData('escrows');
    adminData.transactions = escrows.map(escrow => ({
      id: escrow.id,
      ...escrow
    }));
    
    console.log('Loaded transactions from localStorage:', adminData.transactions.length);
    updateTransactionsTable();
    
    hideLoading('transactions');
  } catch (error) {
    console.error('Error loading transactions data:', error);
    showError('Failed to load transactions data');
    hideLoading('transactions');
  }
}

// Load Escrow Data
async function loadEscrowData() {
  try {
    showLoading('escrow');
    
    // Load real escrows from localStorage
    const escrows = getLocalStorageData('escrows');
    adminData.escrows = escrows.map(escrow => ({
      id: escrow.id,
      ...escrow
    }));
    
    console.log('Loaded escrows from localStorage:', adminData.escrows.length);
    updateEscrowTable();
    
    hideLoading('escrow');
  } catch (error) {
    console.error('Error loading escrow data:', error);
    showError('Failed to load escrow data');
    hideLoading('escrow');
  }
}

// Load Verification Data
async function loadVerificationData() {
  try {
    showLoading('verification');
    
    // Load user data from localStorage and check verification status
    const userData = JSON.parse(localStorage.getItem('userData') || 'null');
    const users = userData ? [userData] : [];
    
    // Filter users with pending verification
    adminData.pendingVerifications = users.filter(user => {
      const verification = user.verification || {};
      return verification.email && !verification.phone;
    }).map(user => ({
      id: user.id || user.uid,
      ...user
    }));
    
    console.log('Loaded verification data from localStorage:', adminData.pendingVerifications.length);
    updateVerificationTable();
    
    hideLoading('verification');
  } catch (error) {
    console.error('Error loading verification data:', error);
    showError('Failed to load verification data');
    hideLoading('verification');
  }
}

// Load Logistics Data
async function loadLogisticsData() {
  try {
    showLoading('logistics');
    
    // Load orders from localStorage for logistics activity
    const orders = getLocalStorageData('orders');
    const logisticsActivity = orders.filter(order => 
      order.status === 'shipped' || order.status === 'delivered'
    ).map(order => ({
      id: order.id,
      orderId: order.id,
      status: order.status,
      trackingNumber: order.trackingNumber,
      timestamp: order.createdAt
    }));
    
    // Real logistics data based on actual orders
    adminData.logistics = {
      providers: [
        { id: 'tcs', name: 'TCS Express', status: 'active', activeShipments: orders.filter(o => o.status === 'shipped').length, deliveryRate: 0 },
        { id: 'leopards', name: 'Leopards Courier', status: 'inactive', activeShipments: 0, deliveryRate: 0 },
        { id: 'postex', name: 'PostEx', status: 'inactive', activeShipments: 0, deliveryRate: 0 }
      ],
      activity: logisticsActivity
    };
    
    console.log('Loaded logistics data from localStorage:', adminData.logistics.activity.length, 'activities');
    
    // Update logistics UI
    updateLogisticsProviders();
    updateLogisticsActivity();
    
    hideLoading('logistics');
  } catch (error) {
    console.error('Error loading logistics data:', error);
    showError('Failed to load logistics data');
    hideLoading('logistics');
  }
}

// Load Analytics Data
async function loadAnalyticsData() {
  console.log('Loading analytics data...');
}

// Load Settings Data
async function loadSettingsData() {
  console.log('Loading settings data...');
}

// Update Dashboard Statistics
function updateDashboardStats() {
  const stats = adminData.stats;
  
  // Update main stats
  updateElementText('totalUsers', stats.users?.total || 0);
  updateElementText('totalOrders', stats.orders?.total || 0);
  updateElementText('totalRevenue', `$${stats.orders?.totalValue || 0}`);
  updateElementText('pendingDisputes', stats.disputes?.open || 0);
  
  // Update navigation badges
  updateElementText('usersCount', stats.users?.total || 0);
  updateElementText('productsCount', stats.products?.total || 0);
  updateElementText('pendingVerifications', stats.users?.verified || 0);
}

// Update Recent Activity
function updateRecentActivity() {
  const activityContainer = document.getElementById('recentActivityList');
  if (!activityContainer) return;
  
  if (adminData.recentActivity.length === 0) {
    activityContainer.innerHTML = `
      <div class="activity-item">
        <div class="activity-icon order">
          <i class="fas fa-info-circle"></i>
        </div>
        <div class="activity-content">
          <p>No recent activity</p>
          <small>Activity will appear here as users interact with the platform</small>
        </div>
      </div>
    `;
    return;
  }
  
  activityContainer.innerHTML = adminData.recentActivity.map(activity => `
    <div class="activity-item">
      <div class="activity-icon ${activity.type}">
        <i class="fas fa-${getActivityIcon(activity.type)}"></i>
      </div>
      <div class="activity-content">
        <p>${activity.message}</p>
        <small>${formatTimestamp(activity.timestamp)}</small>
      </div>
    </div>
  `).join('');
}

// Update Users Table
function updateUsersTable() {
  const tableBody = document.querySelector('#usersTable tbody');
  if (!tableBody) return;
  
  if (adminData.users.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center">No users found</td>
      </tr>
    `;
    return;
  }
  
  tableBody.innerHTML = adminData.users.map(user => `
    <tr>
      <td>${user.name || 'N/A'}</td>
      <td>${user.email || 'N/A'}</td>
      <td><span class="role-badge ${user.role?.toLowerCase()}">${user.role || 'N/A'}</span></td>
      <td><span class="status-badge ${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span></td>
      <td>${formatTimestamp(user.createdAt)}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="viewUser('${user.id}')">View</button>
        <button class="btn btn-sm btn-secondary" onclick="editUser('${user.id}')">Edit</button>
      </td>
    </tr>
  `).join('');
}

// Update Orders Table
function updateOrdersTable() {
  const tableBody = document.querySelector('#ordersTable tbody');
  if (!tableBody) return;
  
  if (adminData.orders.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center">No orders found</td>
      </tr>
    `;
    return;
  }
  
  tableBody.innerHTML = adminData.orders.map(order => `
    <tr>
      <td>${order.id}</td>
      <td>${order.buyerName || 'N/A'}</td>
      <td>${order.sellerName || 'N/A'}</td>
      <td>$${order.totalAmount || 0}</td>
      <td><span class="status-badge ${order.status}">${order.status || 'N/A'}</span></td>
      <td>${order.trackingNumber || 'N/A'}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="viewOrder('${order.id}')">View</button>
        <button class="btn btn-sm btn-secondary" onclick="updateOrderStatus('${order.id}')">Update</button>
      </td>
    </tr>
  `).join('');
}

// Update Products Table
function updateProductsTable() {
  const tableBody = document.querySelector('#productsTable tbody');
  if (!tableBody) return;
  
  if (adminData.products.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center">No products found</td>
      </tr>
    `;
    return;
  }
  
  tableBody.innerHTML = adminData.products.map(product => `
    <tr>
      <td>${product.title || product.name || 'N/A'}</td>
      <td>${product.category || 'N/A'}</td>
      <td>$${product.price || 0}</td>
      <td>${product.stock || 0}</td>
      <td><span class="status-badge ${product.isActive ? 'active' : 'inactive'}">${product.isActive ? 'Active' : 'Inactive'}</span></td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="viewProduct('${product.id}')">View</button>
        <button class="btn btn-sm btn-secondary" onclick="editProduct('${product.id}')">Edit</button>
      </td>
    </tr>
  `).join('');
}

// Update Categories Table
function updateCategoriesTable() {
  const tableBody = document.querySelector('#categoriesTable tbody');
  if (!tableBody) return;
  
  if (adminData.categories.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="text-center">No categories found</td>
      </tr>
    `;
    return;
  }
  
  tableBody.innerHTML = adminData.categories.map(category => `
    <tr>
      <td>${category.name}</td>
      <td>${category.productCount}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="viewCategory('${category.id}')">View</button>
        <button class="btn btn-sm btn-secondary" onclick="editCategory('${category.id}')">Edit</button>
      </td>
    </tr>
  `).join('');
}

// Update Disputes Table
function updateDisputesTable() {
  const tableBody = document.querySelector('#disputesTable tbody');
  if (!tableBody) return;
  
  if (adminData.disputes.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center">No disputes found</td>
      </tr>
    `;
    return;
  }
  
  tableBody.innerHTML = adminData.disputes.map(dispute => `
    <tr>
      <td>${dispute.id}</td>
      <td>${dispute.orderId || 'N/A'}</td>
      <td>${dispute.complainantName || 'N/A'}</td>
      <td><span class="status-badge ${dispute.status}">${dispute.status || 'N/A'}</span></td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="viewDispute('${dispute.id}')">View</button>
        <button class="btn btn-sm btn-success" onclick="resolveDispute('${dispute.id}')">Resolve</button>
      </td>
    </tr>
  `).join('');
}

// Update Transactions Table
function updateTransactionsTable() {
  const tableBody = document.querySelector('#transactionsTable tbody');
  if (!tableBody) return;
  
  if (adminData.transactions.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center">No transactions found</td>
      </tr>
    `;
    return;
  }
  
  tableBody.innerHTML = adminData.transactions.map(transaction => `
    <tr>
      <td>${transaction.id}</td>
      <td>${transaction.orderId || 'N/A'}</td>
      <td>$${transaction.amount || 0}</td>
      <td><span class="status-badge ${transaction.status}">${transaction.status || 'N/A'}</span></td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="viewTransaction('${transaction.id}')">View</button>
        <button class="btn btn-sm btn-success" onclick="releaseEscrow('${transaction.id}')">Release</button>
      </td>
    </tr>
  `).join('');
}

// Update Escrow Table
function updateEscrowTable() {
  const tableBody = document.querySelector('#escrowTable tbody');
  if (!tableBody) return;
  
  if (adminData.escrows.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center">No escrows found</td>
      </tr>
    `;
    return;
  }
  
  tableBody.innerHTML = adminData.escrows.map(escrow => `
    <tr>
      <td>${escrow.id}</td>
      <td>${escrow.orderId || 'N/A'}</td>
      <td>$${escrow.amount || 0}</td>
      <td><span class="status-badge ${escrow.status}">${escrow.status || 'N/A'}</span></td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="viewEscrow('${escrow.id}')">View</button>
        <button class="btn btn-sm btn-success" onclick="releaseEscrow('${escrow.id}')">Release</button>
      </td>
    </tr>
  `).join('');
}

// Update Verification Table
function updateVerificationTable() {
  const tableBody = document.querySelector('#verificationTable tbody');
  if (!tableBody) return;
  
  if (adminData.pendingVerifications.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center">No pending verifications</td>
      </tr>
    `;
    return;
  }
  
  tableBody.innerHTML = adminData.pendingVerifications.map(user => `
    <tr>
      <td>${user.name || 'N/A'}</td>
      <td>${user.email || 'N/A'}</td>
      <td><span class="verification-status pending">Pending</span></td>
      <td>
        <button class="btn btn-sm btn-success" onclick="approveVerification('${user.id}')">Approve</button>
        <button class="btn btn-sm btn-danger" onclick="rejectVerification('${user.id}')">Reject</button>
      </td>
    </tr>
  `).join('');
}

// Update Logistics Providers
function updateLogisticsProviders() {
  const providers = adminData.logistics.providers;
  
  providers.forEach(provider => {
    updateElementText(`${provider.id}ActiveShipments`, provider.activeShipments);
    updateElementText(`${provider.id}DeliveryRate`, `${provider.deliveryRate}%`);
  });
}

// Update Logistics Activity
function updateLogisticsActivity() {
  const activityContainer = document.getElementById('logisticsActivity');
  if (!activityContainer) return;
  
  if (adminData.logistics.activity.length === 0) {
    activityContainer.innerHTML = `
      <div class="activity-item">
        <div class="activity-icon order">
          <i class="fas fa-info-circle"></i>
        </div>
        <div class="activity-content">
          <p>No logistics activity</p>
          <small>Activity will appear here as orders are shipped and delivered</small>
        </div>
      </div>
    `;
    return;
  }
  
  activityContainer.innerHTML = adminData.logistics.activity.map(activity => `
    <div class="activity-item">
      <div class="activity-icon ${activity.status}">
        <i class="fas fa-${getActivityIcon(activity.status)}"></i>
      </div>
      <div class="activity-content">
        <p>Order ${activity.orderId} - ${activity.status}</p>
        <small>${activity.trackingNumber ? `Tracking: ${activity.trackingNumber}` : 'No tracking number'}</small>
      </div>
    </div>
  `).join('');
}

// Utility Functions
function updateElementText(id, text) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

function getActivityIcon(type) {
  const icons = {
    'order': 'shopping-cart',
    'user': 'user',
    'dispute': 'gavel',
    'payment': 'credit-card',
    'delivery': 'truck',
    'shipped': 'truck',
    'delivered': 'check-circle'
  };
  return icons[type] || 'info-circle';
}

function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A';
  try {
    return new Date(timestamp).toLocaleDateString();
  } catch (error) {
    return 'N/A';
  }
}

function showLoading(section) {
  console.log(`Loading ${section}...`);
}

function hideLoading(section) {
  console.log(`Finished loading ${section}`);
}

function showSuccess(message) {
  const notification = document.createElement('div');
  notification.className = 'notification success';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #10b981;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 1000;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
  `;
  notification.innerHTML = `
    <i class="fas fa-check-circle"></i>
    <span style="margin-left: 8px;">${message}</span>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

function showError(message) {
  const notification = document.createElement('div');
  notification.className = 'notification error';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ef4444;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 1000;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
  `;
  notification.innerHTML = `
    <i class="fas fa-exclamation-circle"></i>
    <span style="margin-left: 8px;">${message}</span>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 5000);
}

// Setup Event Listeners
function setupEventListeners() {
  // Search functionality
  const searchInputs = document.querySelectorAll('[id$="Search"]');
  searchInputs.forEach(input => {
    input.addEventListener('input', handleSearch);
  });

  // Filter functionality
  const filterSelects = document.querySelectorAll('[id$="Filter"]');
  filterSelects.forEach(select => {
    select.addEventListener('change', handleFilter);
  });
}

// Search and Filter Functions
function handleSearch(e) {
  const searchTerm = e.target.value.toLowerCase();
  const tableId = e.target.id.replace('Search', 'Table');
  const table = document.getElementById(tableId);
  
  if (!table) return;
  
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(searchTerm) ? '' : 'none';
  });
}

function handleFilter(e) {
  const filterValue = e.target.value;
  const tableId = e.target.id.replace('Filter', 'Table');
  const table = document.getElementById(tableId);
  
  if (!table) return;
  
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    if (!filterValue) {
      row.style.display = '';
      return;
    }
    
    const statusCell = row.querySelector('.status-badge');
    if (statusCell) {
      const status = statusCell.textContent.toLowerCase();
      row.style.display = status.includes(filterValue.toLowerCase()) ? '' : 'none';
    }
  });
}

// Action Functions
async function updateOrderStatus(orderId) {
  const newStatus = prompt('Enter new status (pending, processing, shipped, delivered, cancelled, disputed):');
  if (!newStatus) return;

  const trackingNumber = newStatus === 'shipped' ? prompt('Enter tracking number:') : null;

  try {
    // Update order in localStorage
    const orders = getLocalStorageData('orders');
    const orderIndex = orders.findIndex(o => o.id === orderId);
    
    if (orderIndex !== -1) {
      orders[orderIndex].status = newStatus;
      if (trackingNumber) {
        orders[orderIndex].trackingNumber = trackingNumber;
      }
      orders[orderIndex].updatedAt = new Date().toISOString();
      
      localStorage.setItem('sthub_orders', JSON.stringify(orders));
      
      // Reload orders data
      await loadOrdersData();
      showSuccess('Order status updated successfully');
    } else {
      showError('Order not found');
    }
  } catch (error) {
    console.error('Error updating order status:', error);
    showError('Failed to update order status');
  }
}

async function approveVerification(userId) {
  try {
    const userData = JSON.parse(localStorage.getItem('userData') || 'null');
    if (userData && userData.id === userId) {
      userData.verification = userData.verification || {};
      userData.verification.phone = true;
      userData.verification.address = true;
      userData.verification.id = true;
      
      localStorage.setItem('userData', JSON.stringify(userData));
      
      // Reload verification data
      await loadVerificationData();
      showSuccess('Verification approved successfully');
    } else {
      showError('User not found');
    }
  } catch (error) {
    console.error('Error approving verification:', error);
    showError('Failed to approve verification');
  }
}

async function rejectVerification(userId) {
  try {
    const userData = JSON.parse(localStorage.getItem('userData') || 'null');
    if (userData && userData.id === userId) {
      userData.verification = userData.verification || {};
      userData.verification.phone = false;
      userData.verification.address = false;
      userData.verification.id = false;
      
      localStorage.setItem('userData', JSON.stringify(userData));
      
      // Reload verification data
      await loadVerificationData();
      showSuccess('Verification rejected');
    } else {
      showError('User not found');
    }
  } catch (error) {
    console.error('Error rejecting verification:', error);
    showError('Failed to reject verification');
  }
}

// Placeholder functions for other actions
function viewUser(userId) { alert(`View user: ${userId}`); }
function editUser(userId) { alert(`Edit user: ${userId}`); }
function viewOrder(orderId) { alert(`View order: ${orderId}`); }
function viewProduct(productId) { alert(`View product: ${productId}`); }
function editProduct(productId) { alert(`Edit product: ${productId}`); }
function viewCategory(categoryId) { alert(`View category: ${categoryId}`); }
function editCategory(categoryId) { alert(`Edit category: ${categoryId}`); }
function viewDispute(disputeId) { alert(`View dispute: ${disputeId}`); }
function resolveDispute(disputeId) { alert(`Resolve dispute: ${disputeId}`); }
function viewTransaction(transactionId) { alert(`View transaction: ${transactionId}`); }
function viewEscrow(escrowId) { alert(`View escrow: ${escrowId}`); }
function releaseEscrow(escrowId) { alert(`Release escrow: ${escrowId}`); }

// Refresh functions
function refreshDashboard() {
  loadDashboardData();
}

function refreshOrders() {
  loadOrdersData();
}

function syncLogistics() {
  loadLogisticsData();
}

// Export functions for global access
window.showSection = showSection;
window.refreshDashboard = refreshDashboard;
window.refreshOrders = refreshOrders;
window.syncLogistics = syncLogistics;
window.updateOrderStatus = updateOrderStatus;
window.approveVerification = approveVerification;
window.rejectVerification = rejectVerification;
window.viewUser = viewUser;
window.editUser = editUser;
window.viewOrder = viewOrder;
window.viewProduct = viewProduct;
window.editProduct = editProduct;
window.viewCategory = viewCategory;
window.editCategory = editCategory;
window.viewDispute = viewDispute;
window.resolveDispute = resolveDispute;
window.viewTransaction = viewTransaction;
window.viewEscrow = viewEscrow;
window.releaseEscrow = releaseEscrow;
