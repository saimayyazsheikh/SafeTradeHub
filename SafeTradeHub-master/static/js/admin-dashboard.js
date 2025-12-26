/* ========================================
   ADMIN-DASHBOARD.JS - Real-time Admin Dashboard
   ======================================== */

// Firebase instances (already initialized in HTML)
let auth, db;

// Initialize Firebase instances safely
try {
  // Use the instances exposed by admin-dashboard.html if available
  if (window.auth && window.db) {
    auth = window.auth;
    db = window.db;
    console.log('Using shared AdminPanel instances');
  } else {
    // Fallback if not defined (though they should be)
    // We must try to get the AdminPanel app to match the HTML
    let adminApp;
    try {
      adminApp = firebase.app("AdminPanel");
    } catch (e) {
      // If app not found, maybe we are in a context where config is available?
      // For now, let's try default but log a warning.
      // Ideally we should not hit this if HTML is correct.
      console.warn('AdminPanel app not found in window, falling back to default (might cause session mismatch)');
      auth = firebase.auth();
      db = firebase.database();
    }

    if (adminApp) {
      auth = adminApp.auth();
      db = adminApp.database();
    }
  }
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
document.addEventListener('DOMContentLoaded', function () {
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
    case 'wallet':
      await loadWalletData();
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
    const stats = await getDashboardStats();
    adminData.stats = stats;

    // Load trending products (using existing products data)
    // We ensure products are loaded first
    if (!adminData.products || adminData.products.length === 0) {
      const products = getLocalStorageData('products');
      adminData.products = products;
    }

    // Update dashboard UI
    updateDashboardStats();

    hideLoading('dashboard');
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    showError('Failed to load dashboard data');
    hideLoading('dashboard');
  }
}

// Refresh Dashboard
window.refreshDashboard = async function () {
  await loadDashboardData();
  showSuccess('Dashboard refreshed successfully');
};

// Get real statistics
async function getDashboardStats() {
  try {
    // 1. Fetch Users from Firebase
    let users = [];
    try {
      const snapshot = await db.ref('users').once('value');
      if (snapshot.exists()) {
        snapshot.forEach(child => {
          users.push({ id: child.key, ...child.val() });
        });
      }
    } catch (e) {
      console.error('Error fetching users for stats:', e);
    }

    // 2. Fetch Orders from Firebase
    let orders = [];
    try {
      const snapshot = await db.ref('orders').once('value');
      if (snapshot.exists()) {
        snapshot.forEach(child => {
          orders.push({ id: child.key, ...child.val() });
        });
      }
    } catch (e) {
      console.error('Error fetching orders for stats:', e);
    }

    // 3. Get other data from localStorage (for now, until migrated)
    const products = getLocalStorageData('products');
    const escrows = getLocalStorageData('escrows');
    const disputes = getLocalStorageData('disputes');

    console.log('Dashboard data loaded:', {
      users: users.length,
      products: products.length,
      orders: orders.length,
      escrows: escrows.length,
      disputes: disputes.length
    });

    // Calculate statistics
    const today = new Date().setHours(0, 0, 0, 0);
    const isToday = (date) => {
      if (!date) return false;
      const d = new Date(date);
      return d.setHours(0, 0, 0, 0) === today;
    };

    const stats = {
      users: {
        total: users.length,
        active: users.filter(u => u.isActive !== false).length,
        buyers: users.filter(u => u.role === 'Buyer').length,
        sellers: users.filter(u => u.role === 'Seller').length,
        verified: users.filter(u => u.verification && (u.verification.cnic?.verified || u.verification.shop?.verified)).length,
        today: users.filter(u => isToday(u.createdAt)).length
      },
      products: {
        total: products.length,
        active: products.filter(p => p.isActive !== false).length,
        today: products.filter(p => isToday(p.createdAt)).length,
        categories: [...new Set(products.map(p => p.category))].length
      },
      orders: {
        total: orders.length,
        pending: orders.filter(o => o.status === 'pending').length,
        completed: orders.filter(o => o.status === 'delivered' || o.status === 'completed').length,
        today: orders.filter(o => isToday(o.createdAt)).length,
        today: orders.filter(o => isToday(o.createdAt)).length,
        // Revenue is strictly the Platform Fee (Escrow Fee), not the total GMV
        totalValue: orders.reduce((acc, o) => acc + (parseFloat(o.escrowFee) || 0), 0).toFixed(0),
        revenueToday: orders.filter(o => isToday(o.createdAt)).reduce((acc, o) => acc + (parseFloat(o.escrowFee) || 0), 0).toFixed(0)
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
    console.error('Error calculating dashboard stats:', error);
    return {
      users: { total: 0, active: 0, buyers: 0, sellers: 0, verified: 0, today: 0 },
      products: { total: 0, active: 0, categories: 0 },
      orders: { total: 0, pending: 0, shipped: 0, delivered: 0, cancelled: 0, totalValue: 0, today: 0, revenueToday: 0 },
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

    // Fetch all users from RTDB
    const snapshot = await db.ref('users').once('value');
    const users = [];
    snapshot.forEach(child => {
      users.push({ id: child.key, ...child.val() });
    });

    adminData.users = users;

    console.log('Loaded users from RTDB:', adminData.users.length);
    updateUsersTable();
    updateElementText('usersCount', adminData.users.length);

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

    // Fetch all orders from RTDB
    const snapshot = await db.ref('orders').once('value');
    const orders = [];
    snapshot.forEach(child => {
      orders.push({ id: child.key, ...child.val() });
    });

    // Sort by date desc
    orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    adminData.orders = orders;

    console.log('Loaded orders from RTDB:', adminData.orders.length);

    // Calculate status counts from real data
    const statusCounts = {
      pending: adminData.orders.filter(o => o.status === 'pending').length,
      shipped: adminData.orders.filter(o => o.status === 'shipped' || o.status === 'shipped_to_escrow').length,
      delivered: adminData.orders.filter(o => o.status === 'delivered' || o.status === 'completed').length,
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

    // Fetch all products from RTDB
    const snapshot = await db.ref('products').once('value');
    const products = [];
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        products.push({ id: child.key, ...child.val() });
      });
    }

    adminData.products = products;

    console.log('Loaded products from RTDB:', adminData.products.length);
    updateProductsTable();
    updateElementText('productsCount', adminData.products.length);

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

    // Get categories from products (since we don't have a dedicated categories node yet)
    const products = adminData.products;
    const uniqueCategories = [...new Set(products.map(p => p.category))].filter(Boolean);

    adminData.categories = uniqueCategories.map((category, index) => ({
      id: category.toLowerCase().replace(/\s+/g, '-'),
      name: category,
      description: `All ${category} related products`,
      productCount: products.filter(p => p.category === category).length,
      status: 'Active',
      createdAt: new Date().toISOString() // Placeholder date
    }));

    console.log('Loaded categories:', adminData.categories.length);
    updateCategoriesTable();
    updateElementText('categoriesCount', adminData.categories.length);

    hideLoading('categories');
  } catch (error) {
    console.error('Error loading categories data:', error);
    showError('Failed to load categories data');
    hideLoading('categories');
  }
}

// Update Categories Table
function updateCategoriesTable() {
  const tableBody = document.querySelector('#categoriesTable tbody');
  if (!tableBody) return;

  if (adminData.categories.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center">No categories found</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = adminData.categories.map((category, index) => {
    const seqId = (index + 1).toString().padStart(3, '0');
    return `
    <tr>
      <td>${seqId}</td>
      <td><span style="font-weight: 600; text-transform: capitalize;">${category.name}</span></td>
      <td>${category.description}</td>
      <td><span class="badge badge-primary">${category.productCount} Products</span></td>
      <td><span class="status-badge active">${category.status}</span></td>
      <td>${new Date(category.createdAt).toLocaleDateString()}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="viewCategory('${category.id}')" title="View Details">
            <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-secondary" onclick="editCategory('${category.id}')" title="Edit Category">
            <i class="fas fa-edit"></i>
        </button>
      </td>
    </tr>
  `}).join('');
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
// Load Escrow Data
async function loadEscrowData() {
  try {
    showLoading('escrow');

    // Fetch all escrows from RTDB
    const snapshot = await db.ref('escrows').once('value');
    const escrows = [];
    snapshot.forEach(child => {
      escrows.push({ id: child.key, ...child.val() });
    });

    // Sort by date desc
    escrows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    adminData.escrows = escrows;

    console.log('Loaded escrows from RTDB:', adminData.escrows.length);
    updateEscrowTable();

    hideLoading('escrow');
  } catch (error) {
    console.error('Error loading escrow data:', error);
    showError('Failed to load escrow data');
    hideLoading('escrow');
  }
}

// Update Escrow Table
function updateEscrowTable() {
  const tableBody = document.querySelector('#escrowTableBody'); // Ensure your HTML has this ID or generic table selector
  // Fallback selector if specific ID missing
  const container = document.getElementById('escrow-section');
  const tbody = container ? container.querySelector('tbody') : null;

  if (!tbody) return;

  if (!adminData.escrows || adminData.escrows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center">No active escrows found</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = adminData.escrows.map((escrow, index) => {
    const amount = parseFloat(escrow.amount || 0).toLocaleString();
    const status = (escrow.status || 'pending').toLowerCase();
    // Map status to CSS classes in dashboard.css
    let statusClass = 'pending';
    if (status === 'released') statusClass = 'delivered'; // 'delivered' style is Green
    else if (status === 'disputed' || status === 'refunded') statusClass = 'cancelled';
    else if (status === 'holding' || status === 'held') statusClass = 'pending';

    const date = escrow.createdAt ? new Date(escrow.createdAt).toLocaleDateString() : 'N/A';

    // Check if actionable
    const canRelease = status === 'holding' || status === 'held';

    // Actions
    // 1. Release Button (Only if holding)
    const releaseBtn = canRelease ? `
        <button class="btn btn-sm btn-success" onclick="releaseEscrow('${escrow.id}')" title="Release Payment">
            <i class="fas fa-check"></i>
        </button>
    ` : `
        <button class="btn btn-sm btn-secondary" disabled style="opacity: 0.5; cursor: not-allowed;" title="${status}">
             <i class="fas fa-check"></i>
        </button>
    `;

    // 2. View Button (Always, maps to Order View for full details)
    const viewBtn = `
        <button class="btn btn-sm btn-primary" onclick="viewOrder('${escrow.orderId}')" title="View Details">
            <i class="fas fa-eye"></i>
        </button>
    `;

    // Link
    const orderLink = `<a href="#" onclick="viewOrder('${escrow.orderId}'); return false;">#${escrow.orderId ? escrow.orderId.substring(0, 8) : 'N/A'}</a>`;

    return `
    <tr>
      <td>#${escrow.id.substring(0, 8)}</td>
      <td>${orderLink}</td>
      <td>RS ${amount}</td>
      <td><span class="status-badge ${statusClass}">${status.toUpperCase()}</span></td>
      <td>${date}</td>
      <td>
        <div style="display: flex; gap: 8px;">
            ${releaseBtn}
            ${viewBtn}
        </div>
      </td>
    </tr>
  `}).join('');
}

// Release Escrow Payment (Global)
window.releaseEscrow = async function (escrowId) {
  if (!await showConfirmationModal('Release Payment', 'Are you sure you want to release these funds to the seller? This cannot be undone.', { confirmText: 'Release Funds', confirmColor: '#10b981' })) return;

  try {
    showLoading(true);
    const escrowRef = db.ref(`escrows/${escrowId}`);
    const snapshot = await escrowRef.once('value');
    const escrow = snapshot.val();

    if (!escrow) throw new Error('Escrow record not found');
    if (escrow.status === 'released') throw new Error('Funds already released');

    // 1. Fetch Order Data (REQUIRED for Fee and Verification)
    const orderSnap = await db.ref(`orders/${escrow.orderId}`).once('value');
    const order = orderSnap.val();

    if (!order) throw new Error('Associated order not found');

    // 2. Identify Seller (Robust Lookup)
    let sellerId = escrow.sellerId;

    // If missing, invalid, or mismatch, prefer order's seller
    if (!sellerId || sellerId === 'admin' || sellerId === 'undefined') {
      sellerId = order.sellerId;

      // Deep lookup fallback
      if (!sellerId || sellerId === 'admin' || sellerId === 'undefined') {
        if (order.items && order.items.length > 0) {
          sellerId = order.items[0].sellerId;

          // Double deep: Check product owner
          if (!sellerId || sellerId === 'admin' || sellerId === 'undefined') {
            try {
              const prodSnap = await db.ref(`products/${order.items[0].id}/sellerId`).once('value');
              if (prodSnap.exists()) sellerId = prodSnap.val();
            } catch (e) { console.error(e); }
          }
        }
      }
    }

    if (!sellerId || sellerId === 'admin') throw new Error('Could not resolve valid seller ID to credit funds.');

    // 3. Perform Transaction
    const totalAmount = parseFloat(escrow.amount);
    // Fee is in the ORDER object
    const fee = parseFloat(order.escrowFee || 0);
    const payoutAmount = totalAmount - fee;

    const updates = {};

    // Update Escrow
    updates[`escrows/${escrowId}/status`] = 'released';
    updates[`escrows/${escrowId}/releasedAt`] = firebase.database.ServerValue.TIMESTAMP;

    // Update Order
    updates[`orders/${escrow.orderId}/status`] = 'completed';
    updates[`orders/${escrow.orderId}/paymentStatus`] = 'paid';

    // Update Wallet (Transaction) - Credit ONLY the payout amount
    const walletRef = db.ref(`users/${sellerId}/wallet`);
    await walletRef.transaction(wallet => {
      if (!wallet) wallet = { balance: 0, totalEarned: 0 };
      wallet.balance = (wallet.balance || 0) + payoutAmount;
      wallet.totalEarned = (wallet.totalEarned || 0) + payoutAmount;
      return wallet;
    });

    // Create Wallet Transaction Record
    const txnId = db.ref('walletTransactions').push().key;
    updates[`walletTransactions/${txnId}`] = {
      userId: sellerId,
      type: 'credit',
      amount: payoutAmount,
      fee: fee, // Record the fee for transparency
      description: `Order Payment #${escrow.orderId} (less RS ${fee} fee)`,
      referenceId: escrow.orderId,
      status: 'completed',
      createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    // Notify Seller
    const notifId = db.ref('notifications').push().key;
    updates[`notifications/${notifId}`] = {
      userId: sellerId,
      block: 'order_update',
      title: 'Payment Released',
      message: `Funds for Order #${escrow.orderId} (RS ${payoutAmount}) have been released to your wallet. (Service Fee: RS ${fee})`,
      read: false,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    // Execute all updates
    await db.ref().update(updates);

    showSuccess('Funds released to seller successfully');
    loadEscrowData(); // Refresh UI

  } catch (e) {
    console.error('Release failed:', e);
    showError(e.message);
  } finally {
    showLoading(false);
  }
};

// Load Verification Data
async function loadVerificationData() {
  try {
    showLoading('verification');

    // Fetch all users from RTDB
    const snapshot = await db.ref('users').once('value');
    const users = [];
    snapshot.forEach(child => {
      users.push({ id: child.key, ...child.val() });
    });

    // Filter users with pending verification
    adminData.pendingVerifications = users.filter(user => {
      const v = user.verification || {};
      // Check for pending CNIC or Shop verification
      const cnicPending = v.cnic && v.cnic.submitted && !v.cnic.verified && v.cnic.status !== 'rejected';
      const shopPending = v.shop && v.shop.submitted && !v.shop.verified && v.shop.status !== 'rejected';
      return cnicPending || shopPending;
    }).map(user => {
      const v = user.verification || {};
      let types = [];

      if (v.cnic && v.cnic.submitted && !v.cnic.verified) {
        types.push('CNIC');
        if (v.selfie && v.selfie.submitted) types.push('Live Selfie');
      }
      if (v.shop && v.shop.submitted && !v.shop.verified) {
        types.push('Shop');
      }

      const typeString = types.join(' / ');

      // Determine earliest submitted date
      let submittedAt = Date.now();
      if (v.cnic?.submittedAt) submittedAt = v.cnic.submittedAt;
      if (v.shop?.submittedAt && v.shop.submittedAt < submittedAt) submittedAt = v.shop.submittedAt;

      return {
        id: user.id,
        // Use displayName logic consistent with user table
        name: user.displayName || user.name || user.fullName || user.username || 'Unknown User',
        email: user.email || 'N/A',
        type: typeString || 'Identity',
        submittedAt: submittedAt,
        ...user
      };
    });

    console.log('Loaded verification data from RTDB:', adminData.pendingVerifications.length);
    updateVerificationTable();
    updateElementText('pendingVerifications', adminData.pendingVerifications.length);

    hideLoading('verification');
  } catch (error) {
    console.error('Error loading verification data:', error);
    showError('Failed to load verification data');
    hideLoading('verification');
  }
}

// Update Verification Table
function updateVerificationTable() {
  const tbody = document.getElementById('verificationTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (adminData.pendingVerifications.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">No pending verifications</td></tr>';
    return;
  }

  // Get Firebase project details for the link
  const appOptions = firebase.app().options;
  const projectId = appOptions.projectId;
  const dbInstance = appOptions.databaseURL.replace('https://', '').replace('.firebaseio.com', '');

  adminData.pendingVerifications.forEach((user, index) => {
    const tr = document.createElement('tr');

    // Sequential ID
    const seqId = (index + 1).toString().padStart(3, '0');

    // Firebase Console Link
    const firebaseLink = `https://console.firebase.google.com/project/${projectId}/database/${dbInstance}/data/users/${user.id}`;

    // Format Date
    const submittedDate = user.submittedAt ? new Date(user.submittedAt).toLocaleDateString() : 'N/A';

    tr.innerHTML = `
      <td>
        <a href="${firebaseLink}" target="_blank" title="View in Firebase Console" style="text-decoration: underline; color: #4f46e5; font-weight: bold;">
            #${seqId}
        </a>
      </td>
      <td>
        <div class="user-info">
          <span>${user.name}</span>
        </div>
      </td>
      <td>${user.email}</td>
      <td><span class="badge badge-info">${user.type}</span></td>
      <td><span class="badge badge-warning">Pending</span></td>
      <td>${submittedDate}</td>
      <td>
        <button class="btn btn-sm btn-success" onclick="approveVerification('${user.id}')" title="Approve">
          <i class="fas fa-check"></i>
        </button>
        <button class="btn btn-sm btn-danger" onclick="rejectVerification('${user.id}')" title="Reject">
          <i class="fas fa-times"></i>
        </button>
        <button class="btn btn-sm btn-primary" onclick="viewVerificationDetails('${user.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// View Verification Details
window.viewVerificationDetails = async function (userId) {
  console.log('viewVerificationDetails called for:', userId);
  try {
    const user = adminData.pendingVerifications.find(u => u.id === userId);

    // User lookup logic
    let targetUser = user;
    if (!targetUser) {
      console.log('User not found in pending list, searching all users...');
      targetUser = adminData.users.find(u => u.userId === userId || u.id === userId);
    }

    if (!targetUser) {
      alert('Error: User data not found for ID: ' + userId);
      return;
    }

    const modal = document.getElementById('verificationModal');
    if (!modal) {
      alert('Error: Modal element not found');
      return;
    }
    const modalBody = document.getElementById('modalBody');
    const modalTitle = document.getElementById('modalTitle');
    const approveBtn = document.getElementById('modalApproveBtn');
    const rejectBtn = document.getElementById('modalRejectBtn');

    modalTitle.textContent = `Verify ${targetUser.name}`;

    const v = targetUser.verification || {};
    let content = '<div class="verification-details">';
    let hasContent = false;

    // Identity Verification Section
    if (v.cnic && v.cnic.submitted) {
      hasContent = true;
      content += `
        <div class="verification-section" style="margin-bottom: 24px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h4 style="margin:0;">Identity Verification (CNIC)</h4>
            <div>
              ${v.cnic.verified ?
          '<span class="badge badge-success">Verified</span>' :
          v.cnic.status === 'rejected' ?
            '<span class="badge badge-danger">Rejected</span>' :
            `
                <button class="btn btn-sm btn-success" onclick="approveVerification('${userId}', 'cnic')" style="margin-right:8px;">Approve Identity</button>
                <button class="btn btn-sm btn-danger" onclick="rejectVerification('${userId}', 'cnic')">Reject Identity</button>
                `
        }
            </div>
          </div>
          <p><strong>Status:</strong> ${v.cnic.verified ? 'Verified' : (v.cnic.status || 'Pending')}</p>
          
          <div class="cnic-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px;">
            <div>
              <p style="font-size: 0.9rem; color: #6b7280; margin-bottom: 4px;">Front:</p>
              <img src="${v.cnic.frontUrl}" style="width: 100%; border-radius: 8px; border: 1px solid #e5e7eb; cursor: pointer;" onclick="window.open('${v.cnic.frontUrl}', '_blank')">
            </div>
            <div>
              <p style="font-size: 0.9rem; color: #6b7280; margin-bottom: 4px;">Back:</p>
              <img src="${v.cnic.backUrl}" style="width: 100%; border-radius: 8px; border: 1px solid #e5e7eb; cursor: pointer;" onclick="window.open('${v.cnic.backUrl}', '_blank')">
            </div>
          </div>

          ${v.selfie && v.selfie.url ? `
            <div style="margin-top: 16px;">
              <p style="font-size: 0.9rem; color: #6b7280; margin-bottom: 4px;">Selfie:</p>
              <img src="${v.selfie.url}" style="width: 150px; border-radius: 8px; border: 1px solid #e5e7eb; cursor: pointer;" onclick="window.open('${v.selfie.url}', '_blank')">
            </div>
          ` : ''}
        </div>
      `;
    }

    // Shop Verification Section
    if (v.shop && v.shop.submitted) {
      hasContent = true;
      content += `
        <div class="verification-section" style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h4 style="margin:0;">Shop Verification</h4>
            <div>
              ${v.shop.verified ?
          '<span class="badge badge-success">Verified</span>' :
          v.shop.status === 'rejected' ?
            '<span class="badge badge-danger">Rejected</span>' :
            `
                <button class="btn btn-sm btn-success" onclick="approveVerification('${userId}', 'shop')" style="margin-right:8px;">Approve Shop</button>
                <button class="btn btn-sm btn-danger" onclick="rejectVerification('${userId}', 'shop')">Reject Shop</button>
                `
        }
            </div>
          </div>
          <p><strong>Name:</strong> ${v.shop.name}</p>
          <p><strong>Type:</strong> ${v.shop.businessType || 'N/A'}</p>
          <p><strong>Address:</strong> ${v.shop.address}</p>
          <p><strong>Phone:</strong> ${v.shop.phone || 'N/A'}</p>
          <p><strong>Email:</strong> ${v.shop.email || 'N/A'}</p>
          ${v.shop.locationData && v.shop.locationData.coords ? `<p><strong>Location:</strong> ${v.shop.locationData.coords.latitude}, ${v.shop.locationData.coords.longitude}</p>` : ''}
          <p><strong>Status:</strong> ${v.shop.verified ? 'Verified' : (v.shop.status || 'Pending')}</p>

          <h4 style="margin-top: 16px; font-size: 0.9rem;">Photos</h4>
          <div class="photo-grid" style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px;">
            ${(v.shop.photoUrls || []).map(url => `
              <img src="${url}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd; cursor: pointer;" onclick="window.open('${url}', '_blank')">
            `).join('')}
          </div>

          <h4 style="margin-top: 16px; font-size: 0.9rem;">Documents</h4>
          <div class="doc-grid" style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px;">
            ${(v.shop.docUrls || []).map(url => `
              <div style="text-align: center;">
                <img src="${url}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd; cursor: pointer;" onclick="window.open('${url}', '_blank')">
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (!hasContent) {
      content += '<p>No submitted verification data found explicitly (CNIC or Shop).</p>';
    }

    content += '</div>';
    modalBody.innerHTML = content;

    // Hide global buttons as we now have specific ones
    if (approveBtn) approveBtn.style.display = 'none';
    if (rejectBtn) rejectBtn.style.display = 'none';

    modal.style.display = 'block';
  } catch (err) {
    console.error('Error in viewVerificationDetails:', err);
    alert('An error occurred while opening details:\n' + err.message);
  }
};

window.closeVerificationModal = function () {
  document.getElementById('verificationModal').style.display = 'none';
};

window.approveVerification = async function (userId, type) {
  const typeName = type === 'cnic' ? 'Identity' : type === 'shop' ? 'Shop' : 'Verification';

  const confirmed = await showConfirmationModal(
    `Approve ${typeName}`,
    `Are you sure you want to approve this ${typeName}?`,
    { confirmText: 'Approve', confirmColor: '#22c55e' }
  );

  if (!confirmed) return;

  try {
    const user = adminData.pendingVerifications.find(u => u.id === userId);
    const updates = {};

    // Approve Identity
    if ((!type || type === 'cnic') && user.verification?.cnic?.submitted) {
      updates['verification/cnic/verified'] = true;
      updates['verification/cnic/status'] = 'approved';
      updates['verification/selfie/verified'] = true; // Assume selfie approved with CNIC
    }

    // Approve Shop
    if ((!type || type === 'shop') && user.verification?.shop?.submitted) {
      updates['verification/shop/verified'] = true;
      updates['verification/shop/status'] = 'approved';
      updates['role'] = 'Seller'; // Upgrade to Seller if shop approved
    }

    await db.ref('users/' + userId).update(updates);

    showSuccess(`${typeName} approved successfully`);

    // Refresh data and view
    await loadVerificationData();
    // Re-open modal to show updated status if we are still viewing
    const updatedUser = adminData.pendingVerifications.find(u => u.id === userId);
    if (updatedUser) {
      viewVerificationDetails(userId);
    } else {
      closeVerificationModal();
    }
  } catch (error) {
    console.error('Error approving verification:', error);
    showError('Error approving verification: ' + error.message);
  }
};

window.rejectVerification = async function (userId, type) {
  const typeName = type === 'cnic' ? 'Identity' : type === 'shop' ? 'Shop' : 'Verification';

  const reason = await showConfirmationModal(
    `Reject ${typeName}`,
    `Please enter reason for ${typeName} rejection:`,
    { showInput: true, confirmText: 'Reject', confirmColor: '#ef4444' }
  );

  if (!reason) return;

  try {
    const user = adminData.pendingVerifications.find(u => u.id === userId);
    const updates = {};

    // Reject Identity
    if ((!type || type === 'cnic') && user.verification?.cnic?.submitted) {
      updates['verification/cnic/verified'] = false;
      updates['verification/cnic/status'] = 'rejected';
      updates['verification/cnic/rejectionReason'] = reason;
    }

    // Reject Shop
    if ((!type || type === 'shop') && user.verification?.shop?.submitted) {
      updates['verification/shop/verified'] = false;
      updates['verification/shop/status'] = 'rejected';
      updates['verification/shop/rejectionReason'] = reason;
    }

    await db.ref('users/' + userId).update(updates);

    showSuccess(`${typeName} rejected`);

    // Refresh data and view
    await loadVerificationData();
    // Re-open modal to show updated status if we are still viewing
    const updatedUser = adminData.pendingVerifications.find(u => u.id === userId);
    if (updatedUser) {
      viewVerificationDetails(userId);
    } else {
      closeVerificationModal();
    }
  } catch (error) {
    console.error('Error rejecting verification:', error);
    showError('Error rejecting verification: ' + error.message);
  }
};

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

// ========================================
// WALLET MANAGEMENT
// ========================================

async function loadWalletData() {
  console.log('Loading wallet data...');
  showLoading(true);

  try {
    // 0. Load Users (for ID mapping)
    const userSnapshot = await db.ref('users').once('value');
    const users = [];
    userSnapshot.forEach(child => {
      users.push({ id: child.key, ...child.val() });
    });
    // Sort users by createdAt to ensure consistent ID numbering
    users.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    adminData.users = users; // Save to global data

    // 1. Load Deposits
    db.ref('deposits').on('value', (snapshot) => {
      const deposits = [];
      snapshot.forEach(child => {
        deposits.push({ id: child.key, ...child.val() });
      });
      // Sort by date desc
      deposits.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      adminData.deposits = deposits; // Save to global
      renderDeposits(deposits);
      updateWalletStats();
    });

    // 2. Load Withdrawals
    db.ref('withdrawals').on('value', (snapshot) => {
      const withdrawals = [];
      snapshot.forEach(child => {
        withdrawals.push({ id: child.key, ...child.val() });
      });
      withdrawals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      adminData.withdrawals = withdrawals; // Save to global
      renderWithdrawals(withdrawals);
      updateWalletStats();
    });

    // 3. Load Wallet Transactions
    db.ref('walletTransactions').limitToLast(50).on('value', (snapshot) => {
      const transactions = [];
      snapshot.forEach(child => {
        transactions.push({ id: child.key, ...child.val() });
      });
      transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      renderWalletTransactions(transactions);
    });

  } catch (error) {
    console.error('Error loading wallet data:', error);
    showToast('Error loading wallet data', 'error');
  } finally {
    showLoading(false);
  }
}

function getUserDisplayId(userId) {
  if (!adminData.users) return 'User #---';
  const index = adminData.users.findIndex(u => u.id === userId);
  if (index === -1) return 'User #---';
  return `User #${String(index + 1).padStart(3, '0')}`;
}

function renderDeposits(deposits) {
  const tbody = document.getElementById('depositRequestsTableBody');
  const filter = document.getElementById('depositStatusFilter')?.value || 'pending';

  if (!tbody) return;
  tbody.innerHTML = '';

  const filteredDeposits = filter === 'all'
    ? deposits
    : deposits.filter(d => d.status === filter);

  if (filteredDeposits.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">No deposits found</td></tr>';
    return;
  }

  filteredDeposits.forEach((deposit, index) => {
    const requestId = String(index + 1).padStart(3, '0');
    const userDisplayId = getUserDisplayId(deposit.userId);

    const tr = document.createElement('tr');
    tr.innerHTML = `
            <td>#${requestId}</td>
            <td>
                <div class="d-flex align-items-center">
                    <div>
                        <div class="fw-bold">${deposit.userName || 'Unknown'}</div>
                        <div class="text-muted small">
                            <a href="#" onclick="viewUser('${deposit.userId}'); return false;" style="text-decoration: none; color: #667eea; font-weight: 600;">
                                ${userDisplayId}
                            </a>
                        </div>
                    </div>
                </div>
            </td>
            <td>RS ${parseFloat(deposit.amount).toLocaleString()}</td>
            <td>${deposit.method}</td>
            <td>
                <a href="${deposit.screenshotUrl}" target="_blank" class="btn btn-sm btn-info">
                    <i class="fas fa-image"></i> View
                </a>
            </td>
            <td><span class="badge bg-${getStatusBadgeColor(deposit.status)}">${deposit.status}</span></td>
            <td>${new Date(deposit.createdAt).toLocaleDateString()}</td>
            <td>
                ${deposit.status === 'pending' ? `
                <button class="btn btn-sm btn-success me-1" onclick="approveDeposit('${deposit.id}')">
                    <i class="fas fa-check"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="rejectDeposit('${deposit.id}')">
                    <i class="fas fa-times"></i>
                </button>
                ` : '-'}
            </td>
        `;
    tbody.appendChild(tr);
  });
}

function filterDeposits() {
  // Re-fetch or re-render based on current data
  // Since we have a listener, we can just trigger a re-render if we stored the data globally
  // For simplicity, we'll reload the data which triggers the listener
  // Better approach: Store deposits in a global variable
  db.ref('deposits').once('value').then(snapshot => {
    const deposits = [];
    snapshot.forEach(child => deposits.push({ id: child.key, ...child.val() }));
    deposits.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    renderDeposits(deposits);
  });
}

async function approveDeposit(depositId) {
  if (!await showConfirmationModal('Approve Deposit', 'Are you sure you want to approve this deposit?', { confirmText: 'Approve', confirmColor: '#28a745' })) return;

  try {
    showLoading(true);
    const depositRef = db.ref(`deposits/${depositId}`);
    const snapshot = await depositRef.once('value');
    const deposit = snapshot.val();

    if (!deposit) throw new Error('Deposit not found');
    if (deposit.status !== 'pending') throw new Error('Deposit is not pending');

    // 1. Update Deposit Status
    await depositRef.update({ status: 'approved', processedAt: firebase.database.ServerValue.TIMESTAMP });

    // 2. Update User Wallet
    const userWalletRef = db.ref(`users/${deposit.userId}/wallet`);
    await userWalletRef.transaction(wallet => {
      if (!wallet) wallet = { balance: 0, totalDeposited: 0 };
      wallet.balance = (wallet.balance || 0) + deposit.amount;
      wallet.totalDeposited = (wallet.totalDeposited || 0) + deposit.amount;
      return wallet;
    });

    // 3. Create Transaction Record
    await db.ref('walletTransactions').push({
      userId: deposit.userId,
      type: 'deposit',
      amount: deposit.amount,
      status: 'completed',
      referenceId: depositId,
      description: `Deposit via ${deposit.method}`,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });

    // 4. Send Notification
    await db.ref('notifications').push({
      userId: deposit.userId,
      title: 'Deposit Approved',
      message: `Your deposit of RS ${deposit.amount} has been approved and added to your wallet.`,
      read: false,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });

    showToast('Deposit approved successfully');
  } catch (error) {
    console.error('Error approving deposit:', error);
    showToast('Failed to approve deposit: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function rejectDeposit(depositId) {
  if (!await showConfirmationModal('Reject Deposit', 'Are you sure you want to reject this deposit?', { confirmText: 'Reject', confirmColor: '#dc3545' })) return;

  try {
    showLoading(true);
    await db.ref(`deposits/${depositId}`).update({
      status: 'rejected',
      processedAt: firebase.database.ServerValue.TIMESTAMP
    });

    // Send Notification
    const snapshot = await db.ref(`deposits/${depositId}`).once('value');
    const deposit = snapshot.val();

    await db.ref('notifications').push({
      userId: deposit.userId,
      title: 'Deposit Rejected',
      message: `Your deposit of RS ${deposit.amount} was rejected. Please check the details and try again.`,
      read: false,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });

    showToast('Deposit rejected');
  } catch (error) {
    console.error('Error rejecting deposit:', error);
    showToast('Failed to reject deposit', 'error');
  } finally {
    showLoading(false);
  }
}

function updateWalletStats() {
  try {
    const users = adminData.users || [];
    const deposits = adminData.deposits || [];
    const withdrawals = adminData.withdrawals || [];

    // 1. Total System Balance (Sum of all user wallets)
    const totalBalance = users.reduce((sum, user) => sum + (user.wallet?.balance || 0), 0);
    updateElementText('totalSystemBalance', `RS ${totalBalance.toLocaleString()}`);

    // 2. Pending Withdrawals
    const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending');
    const totalPendingWithdrawals = pendingWithdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);
    updateElementText('totalPendingWithdrawals', `RS ${totalPendingWithdrawals.toLocaleString()}`);

    // 3. Pending Deposits
    const pendingDeposits = deposits.filter(d => d.status === 'pending');
    const totalPendingDepositsAmount = pendingDeposits.reduce((sum, d) => sum + (d.amount || 0), 0);
    updateElementText('totalPendingDeposits', `RS ${totalPendingDepositsAmount.toLocaleString()}`);

    // 4. Completed Withdrawals
    const completedWithdrawalsCount = withdrawals.filter(w => w.status === 'approved').length;
    updateElementText('completedWithdrawalsCount', completedWithdrawalsCount);

    // 3. Total Commission (Mock: 5% of total deposits for now, or 0 if no logic)
    // Alternatively, sum of 'commission' field if it exists. For now, let's use 0 or a mock.
    // Let's calculate it as 1% of total approved withdrawals + deposits as a placeholder
    const totalApprovedDeposits = deposits.filter(d => d.status === 'approved').reduce((sum, d) => sum + (d.amount || 0), 0);
    const totalCommission = totalApprovedDeposits * 0.01; // 1% fee example
    updateElementText('totalCommission', `RS ${totalCommission.toLocaleString()}`);

  } catch (error) {
    console.error('Error updating wallet stats:', error);
  }
}

function updateElementText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// Helper for status colors
function getStatusBadgeColor(status) {
  switch (status) {
    case 'approved': return 'success';
    case 'pending': return 'warning';
    case 'rejected': return 'danger';
    default: return 'secondary';
  }
}

// Make functions global
window.approveDeposit = approveDeposit;
window.rejectDeposit = rejectDeposit;
function filterDeposits() {
  if (adminData.deposits) {
    renderDeposits(adminData.deposits);
  }
}

function filterWithdrawals() {
  if (adminData.withdrawals) {
    renderWithdrawals(adminData.withdrawals);
  }
}

// Make functions global
window.approveDeposit = approveDeposit;
window.rejectDeposit = rejectDeposit;
window.filterDeposits = filterDeposits;
window.filterWithdrawals = filterWithdrawals;

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
  updateElementText('totalRevenue', `RS ${stats.orders?.totalValue || 0}`);
  updateElementText('pendingDisputes', stats.disputes?.open || 0);

  // Update trends (Real Data)
  const usersToday = stats.users?.today || 0;
  const ordersToday = stats.orders?.today || 0;
  const revenueToday = stats.orders?.revenueToday || 0;
  const openDisputes = stats.disputes?.open || 0;

  updateElementHTML('usersTrend', usersToday > 0
    ? `<i class="fas fa-arrow-up"></i> ${usersToday} new today`
    : `<i class="fas fa-minus"></i> No new users today`);

  updateElementHTML('ordersTrend', ordersToday > 0
    ? `<i class="fas fa-arrow-up"></i> ${ordersToday} new today`
    : `<i class="fas fa-minus"></i> No new orders today`);

  updateElementHTML('revenueTrend', revenueToday > 0
    ? `<i class="fas fa-arrow-up"></i> RS ${revenueToday} today`
    : `<i class="fas fa-minus"></i> No revenue today`);

  updateElementHTML('disputesTrend', openDisputes > 0
    ? `<i class="fas fa-exclamation-circle"></i> ${openDisputes} open`
    : `<i class="fas fa-check-circle"></i> All clear`);

  // Update navigation badges
  updateElementText('usersCount', stats.users?.total || 0);
  updateElementText('productsCount', stats.products?.total || 0);
  updateElementText('pendingVerifications', stats.users?.verified || 0);
}

function updateElementHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// Update Trending Products
function updateTrendingProducts() {
  const tbody = document.getElementById('trendingProductsList');
  if (!tbody) return;

  const products = adminData.products || [];

  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4">No products found</td></tr>';
    return;
  }

  // Simulate "Trending" by taking first 5 or random
  // In a real app, we would sort by sales count
  const trending = products.slice(0, 5);

  tbody.innerHTML = trending.map(product => `
    <tr>
      <td>
        <div class="d-flex align-items-center">
          <div class="bg-light rounded p-1 me-2" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-box text-secondary"></i>
          </div>
          <div>
            <div class="fw-bold text-dark">${product.name}</div>
            <div class="small text-muted">${product.category}</div>
          </div>
        </div>
      </td>
      <td>RS ${parseFloat(product.price).toLocaleString()}</td>
      <td>${Math.floor(Math.random() * 50) + 1} Sales</td>
      <td><span class="badge bg-${product.status === 'active' ? 'success' : 'secondary'}">${product.status || 'Active'}</span></td>
    </tr>
  `).join('');
}

// Update Users Table
function updateUsersTable() {
  const tableBody = document.querySelector('#usersTable tbody');
  if (!tableBody) return;

  if (adminData.users.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center">No users found</td>
      </tr>
    `;
    return;
  }

  // Sort users: Admins first
  const sortedUsers = [...adminData.users].sort((a, b) => {
    const roleA = (a.role || '').toLowerCase();
    const roleB = (b.role || '').toLowerCase();
    if (roleA === 'admin' && roleB !== 'admin') return -1;
    if (roleA !== 'admin' && roleB === 'admin') return 1;
    return 0;
  });

  tableBody.innerHTML = sortedUsers.map((user, index) => {
    // Determine Verification Status
    let statusBadge = '<span class="badge badge-secondary">Unverified</span>';
    if (user.verification && (user.verification.cnic?.verified || user.verification.shop?.verified)) {
      statusBadge = '<span class="badge badge-success">Verified</span>';
    } else if (user.verification && (user.verification.cnic?.submitted || user.verification.shop?.submitted)) {
      statusBadge = '<span class="badge badge-warning">Pending</span>';
    }

    // Format Date
    const joinedDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A';

    // Sequential ID (001, 002, etc.)
    const seqId = (index + 1).toString().padStart(3, '0');

    // Firebase Console Link (Dynamic)
    const appOptions = firebase.app().options;
    const projectId = appOptions.projectId;
    // Extract instance name from databaseURL (e.g., https://xxx.firebaseio.com -> xxx)
    const dbInstance = appOptions.databaseURL.replace('https://', '').replace('.firebaseio.com', '');

    const firebaseLink = `https://console.firebase.google.com/project/${projectId}/database/${dbInstance}/data/users/${user.id}`;

    // Name Resolution (Try multiple fields)
    // Firebase stores it as 'displayName' usually, but we check others too
    const displayName = user.displayName || user.name || user.fullName || user.username || 'Unknown User';

    // Role Formatting
    const role = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'User';
    const roleBadgeClass = role === 'Admin' ? 'badge-danger' : (role === 'Seller' ? 'badge-success' : 'badge-info');

    return `
    <tr>
      <td>
        <a href="${firebaseLink}" target="_blank" title="View in Firebase Console" style="text-decoration: underline; color: #4f46e5; font-weight: bold;">
            #${seqId}
        </a>
      </td>
      <td>
        <div class="d-flex align-items-center">
            <span>${displayName}</span>
        </div>
      </td>
      <td>${user.email || 'N/A'}</td>
      <td><span class="badge ${roleBadgeClass}">${role}</span></td>
      <td>${statusBadge}</td>
      <td>${joinedDate}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="viewUser('${user.id}')" title="View Details">
            <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-secondary" onclick="editUser('${user.id}')" title="Edit User">
            <i class="fas fa-edit"></i>
        </button>
      </td>
    </tr>
  `}).join('');
}

// Update Orders Table
async function updateOrdersTable() {
  const tableBody = document.querySelector('#ordersTable tbody');
  if (!tableBody) return;

  if (!adminData.orders || adminData.orders.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center">No orders found</td>
      </tr>
    `;
    return;
  }

  // Show loading state in table
  tableBody.innerHTML = '<tr><td colspan="9" class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading order details...</td></tr>';

  const rows = await Promise.all(adminData.orders.map(async (order) => {
    // Format Date
    const date = order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A';

    // Format Items
    const itemsCount = Array.isArray(order.items) ? order.items.length : 0;
    const itemsSummary = itemsCount > 0
      ? `${itemsCount} item${itemsCount > 1 ? 's' : ''}`
      : 'No items';

    // Format Total
    const total = order.total ? `RS ${parseFloat(order.total).toLocaleString()}` : 'RS 0';

    // Buyer Info
    const buyerName = order.buyer ? order.buyer.name : (order.buyerName || 'Unknown');
    const buyerEmail = order.buyer ? order.buyer.email : (order.buyerEmail || 'N/A');
    const buyerId = order.buyerId || 'N/A';

    // Seller Info Logic (Robust Fallback)
    let sellerId = order.sellerId;
    let sellerName = order.sellerName;

    // 1. If ID invalid/admin, try first item
    if ((!sellerId || sellerId === 'admin') && order.items && order.items.length > 0) {
      if (order.items[0].sellerId && order.items[0].sellerId !== 'admin') {
        sellerId = order.items[0].sellerId;
      }
    }

    // 2. Deep Filter: If still invalid, look up product owner in DB
    if ((!sellerId || sellerId === 'admin') && order.items && order.items.length > 0 && order.items[0].id) {
      try {
        const productSnapshot = await db.ref('products/' + order.items[0].id + '/sellerId').once('value');
        if (productSnapshot.exists()) {
          sellerId = productSnapshot.val();
        }
      } catch (e) {
        console.error('Error looking up product seller:', e);
      }
    }

    // 3. Resolve User Details
    let sellerUser = adminData.users.find(u => u.id === sellerId);

    // If user not found in cache, strict fetch
    if (!sellerUser && sellerId && sellerId !== 'admin' && sellerId !== 'N/A') {
      try {
        const userSnap = await db.ref('users/' + sellerId).once('value');
        if (userSnap.exists()) {
          sellerUser = { id: sellerId, ...userSnap.val() };
          // Optionally add to cache
          adminData.users.push(sellerUser);
        }
      } catch (e) { /* ignore */ }
    }

    const sellerDisplayName = sellerUser ? (sellerUser.name || sellerUser.displayName || sellerName) : (sellerName || 'Unknown');
    const sellerEmail = sellerUser ? sellerUser.email : 'N/A';
    const sellerDisplayId = sellerId || 'N/A';

    // Tracking
    const tracking = order.trackingNumber ? order.trackingNumber : 'Pending';

    // Firebase Link
    const appOptions = firebase.app().options;
    const projectId = appOptions.projectId;
    const dbInstance = appOptions.databaseURL.replace('https://', '').replace('.firebaseio.com', '');
    const firebaseLink = `https://console.firebase.google.com/project/${projectId}/database/${dbInstance}/data/orders/${order.id}`;

    return `
    <tr>
      <td>
        <a href="${firebaseLink}" target="_blank" title="View in Firebase Console" style="text-decoration: underline; color: #4f46e5; font-weight: bold;">
          #${order.id.slice(-6)}
        </a>
      </td>
      <td>
        <div class="d-flex flex-column">
          <span class="fw-bold" style="font-size: 0.9rem;">${buyerName}</span>
          <span class="small text-muted" style="font-size: 0.8rem;">${buyerEmail}</span>
          <span class="small text-muted" style="font-size: 0.75rem;">ID: ${buyerId.slice(0, 8)}...</span>
        </div>
      </td>
      <td>
        <div class="d-flex flex-column">
          <span class="fw-bold" style="font-size: 0.9rem;">${sellerDisplayName}</span>
          <span class="small text-muted" style="font-size: 0.8rem;">${sellerEmail}</span>
          <span class="small text-muted" style="font-size: 0.75rem;">ID: ${sellerDisplayId.substring(0, 8)}...</span>
        </div>
      </td>
      <td>${itemsSummary}</td>
      <td>${total}</td>
      <td><span class="badge badge-${getStatusBadgeColor(order.status)}">${order.status || 'Pending'}</span></td>
      <td><span style="font-family: monospace;">${tracking}</span></td>
      <td>${date}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="viewOrder('${order.id}')" title="View Details">
            <i class="fas fa-eye"></i>
        </button>
      </td>
    </tr>
  `;
  }));

  tableBody.innerHTML = rows.join('');
}

// View Order Details
// View Order Details
window.viewOrder = async function (orderId) {
  if (!orderId || orderId === 'undefined' || orderId === 'null') {
    showError('Invalid Order ID');
    return;
  }

  let order = adminData.orders.find(o => o.id === orderId);

  // Usage of local cache failed, try fetching direct
  if (!order) {
    try {
      showLoading('Fetching order details...');
      const snapshot = await db.ref(`orders/${orderId}`).once('value');
      if (snapshot.exists()) {
        order = { id: snapshot.key, ...snapshot.val() };
        // Optional: Add to cache for next time
        adminData.orders.push(order);
      } else {
        hideLoading();
        showError('Order Details not found in database.');
        return;
      }
      hideLoading();
    } catch (e) {
      hideLoading();
      console.error(e);
      showError('Error fetching order details: ' + e.message);
      return;
    }
  }

  if (!order) return;

  const modal = document.getElementById('orderViewModal');
  const modalBody = document.getElementById('orderViewBody');

  // Helper to format currency
  const formatCurrency = (amount) => `RS ${parseFloat(amount || 0).toLocaleString()}`;

  // Buyer Details
  const buyerName = order.buyer ? order.buyer.name : (order.buyerName || 'Unknown');
  const buyerEmail = order.buyer ? order.buyer.email : (order.buyerEmail || 'N/A');
  const buyerPhone = order.buyer ? order.buyer.phone : (order.buyerPhone || 'N/A');
  const buyerAddress = order.buyer ? order.buyer.address : (order.shippingAddress || 'N/A');

  // Seller Details Logic (Robust Fallback)
  let sellerId = order.sellerId;
  let sellerName = order.sellerName; // Fallback name

  // 1. If ID invalid/admin, try first item
  if ((!sellerId || sellerId === 'admin') && order.items && order.items.length > 0) {
    if (order.items[0].sellerId && order.items[0].sellerId !== 'admin') {
      sellerId = order.items[0].sellerId;
    }
  }

  // 2. Deep Filter: If still invalid, look up product owner in DB
  if ((!sellerId || sellerId === 'admin') && order.items && order.items.length > 0 && order.items[0].id) {
    try {
      const productSnapshot = await db.ref('products/' + order.items[0].id + '/sellerId').once('value');
      if (productSnapshot.exists()) {
        sellerId = productSnapshot.val();
        console.log('Resolved seller via product lookup:', sellerId);
      }
    } catch (e) {
      console.error('Error looking up product seller:', e);
    }
  }

  // 3. Resolve User Details
  let sellerUser = adminData.users.find(u => u.id === sellerId);

  // If user not found in cache, strict fetch
  if (!sellerUser && sellerId && sellerId !== 'admin' && sellerId !== 'N/A') {
    try {
      const userSnap = await db.ref('users/' + sellerId).once('value');
      if (userSnap.exists()) {
        sellerUser = { id: sellerId, ...userSnap.val() };
        // Optionally add to cache
        adminData.users.push(sellerUser);
      }
    } catch (e) {
      console.error('Error fetching seller details:', e);
    }
  }

  const sellerDisplayName = sellerUser ? (sellerUser.name || sellerUser.displayName || sellerName) : (sellerName || 'Unknown');
  const sellerEmail = sellerUser ? sellerUser.email : 'N/A';
  const sellerDisplayId = sellerId || 'N/A';

  // Items HTML
  const itemsHtml = (order.items || []).map(item => `
    <div style="display: flex; gap: 15px; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
      <img src="${item.image || item.img || '/static/images/placeholder.jpg'}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #eee;" onerror="this.src='/static/images/placeholder.jpg'">
      <div style="flex: 1;">
        <div style="font-weight: 600; color: #1f2937;">${item.title || item.name}</div>
        <div style="color: #6b7280; font-size: 0.9rem;">Price: ${formatCurrency(item.price)} x ${item.quantity || 1}</div>
      </div>
      <div style="font-weight: 600;">${formatCurrency((item.price || 0) * (item.quantity || 1))}</div>
    </div>
  `).join('');

  modalBody.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
      <!-- Left Column -->
      <div>
        <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 12px 0; color: #374151; font-size: 1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">Order Info</h4>
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 0.9rem;">
            <span style="color: #6b7280;">Order ID:</span> <span style="font-weight: 500;">#${order.id}</span>
            <span style="color: #6b7280;">Date:</span> <span style="font-weight: 500;">${new Date(order.createdAt).toLocaleString()}</span>
            <span style="color: #6b7280;">Status:</span> <span><span class="badge badge-${getStatusBadgeColor(order.status)}">${order.status}</span></span>
            <span style="color: #6b7280;">Total:</span> <span style="font-weight: 600; color: #059669;">${formatCurrency(order.total)}</span>
          </div>
        </div>

        <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 12px 0; color: #374151; font-size: 1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">Customer Details</h4>
          <div style="font-size: 0.9rem;">
            <p style="margin: 4px 0;"><strong>Name:</strong> ${buyerName}</p>
            <p style="margin: 4px 0;"><strong>Email:</strong> ${buyerEmail}</p>
            <p style="margin: 4px 0;"><strong>Phone:</strong> ${buyerPhone}</p>
            <p style="margin: 4px 0;"><strong>Address:</strong> ${buyerAddress}</p>
            <p style="margin: 4px 0; font-size: 0.8rem; color: #6b7280;">ID: ${order.buyerId}</p>
          </div>
        </div>

        <div style="background: #f9fafb; padding: 16px; border-radius: 8px;">
          <h4 style="margin: 0 0 12px 0; color: #374151; font-size: 1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">Seller Details</h4>
          <div style="font-size: 0.9rem;">
            <p style="margin: 4px 0;"><strong>Name:</strong> ${sellerDisplayName}</p>
            <p style="margin: 4px 0;"><strong>Email:</strong> ${sellerEmail}</p>
            <p style="margin: 4px 0; font-size: 0.8rem; color: #6b7280;">ID: ${sellerDisplayId}</p>
          </div>
        </div>
      </div>

      <!-- Right Column -->
      <div>
        <div style="background: #fff; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 12px 0; color: #374151; font-size: 1rem;">Order Items</h4>
          <div style="max-height: 300px; overflow-y: auto;">
            ${itemsHtml}
          </div>
          <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
              <span style="color: #6b7280;">Subtotal:</span>
              <span>${formatCurrency(order.subtotal)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
              <span style="color: #6b7280;">Shipping:</span>
              <span>${formatCurrency(order.shippingTotal)}</span>
            </div>
             <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
              <span style="color: #6b7280;">Escrow Fee:</span>
              <span>${formatCurrency(order.escrowFee)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 1.1rem; margin-top: 10px;">
              <span>Total:</span>
              <span>${formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        <div style="background: #f9fafb; padding: 16px; border-radius: 8px;">
          <h4 style="margin: 0 0 12px 0; color: #374151; font-size: 1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">Tracking</h4>
          
          <!-- Tracking Progress Bar -->
          <div style="margin: 20px 0;">
            ${(() => {
      const stages = ['pending', 'shipped', 'delivered'];
      const currentStatus = (order.status || 'pending').toLowerCase();

      // Determine current stage index
      let currentIndex = 0;
      if (currentStatus === 'delivered' || currentStatus === 'completed') currentIndex = 2;
      else if (currentStatus === 'shipped') currentIndex = 1;
      else currentIndex = 0;

      // Steps HTML
      return `
                <div style="display: flex; justify-content: space-between; position: relative; margin-bottom: 10px;">
                    <!-- Line Background -->
                    <div style="position: absolute; top: 50%; left: 0; right: 0; transform: translateY(-50%); height: 4px; background: #e5e7eb; z-index: 0;"></div>
                    <!-- Active Line -->
                    <div style="position: absolute; top: 50%; left: 0; width: ${currentIndex * 50}%; transform: translateY(-50%); height: 4px; background: #10b981; z-index: 0; transition: width 0.3s ease;"></div>

                    <!-- Step 1: Pending -->
                    <div style="position: relative; z-index: 1; text-align: center;">
                        <div style="width: 30px; height: 30px; background: ${currentIndex >= 0 ? '#10b981' : '#e5e7eb'}; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto; font-weight: bold;">
                            ${currentIndex > 0 ? '<i class="fas fa-check"></i>' : '1'}
                        </div>
                        <div style="font-size: 0.8rem; margin-top: 5px; color: ${currentIndex >= 0 ? '#374151' : '#9ca3af'}; font-weight: ${currentIndex >= 0 ? '600' : '400'};">Pending</div>
                    </div>

                    <!-- Step 2: Shipped -->
                    <div style="position: relative; z-index: 1; text-align: center;">
                        <div style="width: 30px; height: 30px; background: ${currentIndex >= 1 ? '#10b981' : (currentIndex === 1 ? '#3b82f6' : '#e5e7eb')}; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto; font-weight: bold;">
                             ${currentIndex > 1 ? '<i class="fas fa-check"></i>' : '2'}
                        </div>
                        <div style="font-size: 0.8rem; margin-top: 5px; color: ${currentIndex >= 1 ? '#374151' : '#9ca3af'}; font-weight: ${currentIndex >= 1 ? '600' : '400'};">Shipped</div>
                    </div>

                    <!-- Step 3: Delivered -->
                    <div style="position: relative; z-index: 1; text-align: center;">
                        <div style="width: 30px; height: 30px; background: ${currentIndex >= 2 ? '#10b981' : '#e5e7eb'}; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto; font-weight: bold;">
                             ${currentIndex >= 2 ? '<i class="fas fa-check"></i>' : '3'}
                        </div>
                        <div style="font-size: 0.8rem; margin-top: 5px; color: ${currentIndex >= 2 ? '#374151' : '#9ca3af'}; font-weight: ${currentIndex >= 2 ? '600' : '400'};">Delivered</div>
                    </div>
                </div>
                `;
    })()}
          </div>

          <div style="font-size: 0.9rem; margin-top: 20px; border-top: 1px dashed #e5e7eb; padding-top: 10px;">
            <p style="margin: 4px 0;"><strong>Tracking Number:</strong> <span style="font-family: monospace; background: #e5e7eb; padding: 2px 6px; border-radius: 4px;">${order.trackingNumber || 'Pending'}</span></p>
            <p style="margin: 4px 0;"><strong>Courier:</strong> ${order.courier || 'N/A'}</p>
            ${order.escrowLocation ? `<p style="margin: 4px 0;"><strong>Escrow Location:</strong> ${order.escrowLocation}</p>` : ''}
            
            ${order.trackingHistory ? `
              <div style="margin-top: 15px;">
                <h5 style="margin: 0 0 8px 0; font-size: 0.9rem; color: #4b5563;">History</h5>
                <div style="border-left: 2px solid #d1d5db; padding-left: 15px; margin-left: 5px;">
                  ${Object.values(order.trackingHistory).map(h => `
                    <div style="position: relative; margin-bottom: 12px;">
                      <div style="position: absolute; left: -20px; top: 6px; width: 8px; height: 8px; background: #9ca3af; border-radius: 50%;"></div>
                      <div style="font-weight: 500; font-size: 0.85rem;">${h.status}</div>
                      <div style="color: #6b7280; font-size: 0.75rem;">${new Date(h.timestamp).toLocaleString()}</div>
                      ${h.location ? `<div style="color: #6b7280; font-size: 0.75rem;">${h.location}</div>` : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'block';
};

window.closeOrderViewModal = function () {
  document.getElementById('orderViewModal').style.display = 'none';
};

// Update Products Table
function updateProductsTable() {
  const tableBody = document.querySelector('#productsTable tbody');
  if (!tableBody) return;

  if (adminData.products.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center">No products found</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = adminData.products.map((product, index) => {
    // Handle Images
    let imgUrl = 'images/placeholder.jpg';
    if (Array.isArray(product.images) && product.images.length > 0) {
      // Check if images are objects or strings
      const firstImg = product.images[0];
      imgUrl = typeof firstImg === 'string' ? firstImg : (firstImg.url || 'images/placeholder.jpg');
    } else if (typeof product.images === 'string') {
      imgUrl = product.images;
    } else if (product.img) {
      imgUrl = product.img;
    }

    // Sequential ID (001, 002, etc.)
    const seqId = (index + 1).toString().padStart(3, '0');

    // Firebase Console Link (Dynamic)
    const appOptions = firebase.app().options;
    const projectId = appOptions.projectId;
    // Extract instance name from databaseURL (e.g., https://xxx.firebaseio.com -> xxx)
    const dbInstance = appOptions.databaseURL.replace('https://', '').replace('.firebaseio.com', '');

    const firebaseLink = `https://console.firebase.google.com/project/${projectId}/database/${dbInstance}/data/products/${product.id}`;

    return `
    <tr>
      <td>
        <a href="${firebaseLink}" target="_blank" title="View in Firebase Console" style="text-decoration: underline; color: #4f46e5; font-weight: bold;">
            #${seqId}
        </a>
      </td>
      <td>
        <img src="${imgUrl}" alt="${product.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; border: 1px solid #eee;">
      </td>
      <td>
        <div class="product-info">
          <span style="font-weight: 600; display: block;">${product.title || product.name || 'N/A'}</span>
          <small style="color: #666;">${product.brand || ''}</small>
        </div>
      </td>
      <td><span class="badge badge-info">${product.category || 'N/A'}</span></td>
      <td>RS ${product.price || 0}</td>
      <td>${product.stock || 1}</td>
      <td><span class="status-badge ${product.isActive !== false ? 'active' : 'inactive'}">${product.isActive !== false ? 'Active' : 'Inactive'}</span></td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="viewProduct('${product.id}')" title="View Details">
            <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-secondary" onclick="editProduct('${product.id}')" title="Edit Product">
            <i class="fas fa-edit"></i>
        </button>
        <button class="btn btn-sm btn-danger" onclick="deleteProduct('${product.id}')" title="Delete Product">
            <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>
  `}).join('');
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

// Update Escrow Table (Removed duplicate)
// See main definition above



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

// Custom Confirmation Modal
function showConfirmationModal(title, message, options = {}) {
  return new Promise((resolve, reject) => {
    const modal = document.getElementById('confirmationModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const inputContainer = document.getElementById('confirmInputContainer');
    const input = document.getElementById('confirmInput');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');

    titleEl.textContent = title;
    messageEl.textContent = message;

    // Reset state
    input.value = '';
    inputContainer.style.display = options.showInput ? 'block' : 'none';

    if (options.confirmText) okBtn.textContent = options.confirmText;
    if (options.confirmColor) okBtn.style.backgroundColor = options.confirmColor;
    else okBtn.style.backgroundColor = '#2563eb'; // Default blue

    // Show modal
    modal.style.display = 'block';

    // Focus input if shown
    if (options.showInput) input.focus();

    // Handlers
    const cleanup = () => {
      modal.style.display = 'none';
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      window.onclick = null; // Remove global listener
    };

    okBtn.onclick = () => {
      const value = options.showInput ? input.value : true;
      if (options.showInput && !value) {
        alert('Please enter a reason');
        return;
      }
      cleanup();
      resolve(value);
    };

    cancelBtn.onclick = () => {
      cleanup();
      resolve(null); // Return null on cancel
    };

    // Close on click outside
    window.onclick = (event) => {
      if (event.target == modal) {
        cleanup();
        resolve(null);
      }
      // Re-attach original window.onclick if needed or handle other modals
      const editModal = document.getElementById('editUserModal');
      const verifModal = document.getElementById('verificationModal');
      if (event.target == editModal) closeEditUserModal();
      if (event.target == verifModal) closeVerificationModal();
    };
  });
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

  // Admin Dropdown Toggle
  const adminUserBtn = document.getElementById('adminUserBtn');
  const adminDropdown = document.getElementById('adminDropdown');

  if (adminUserBtn && adminDropdown) {
    adminUserBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      adminDropdown.classList.toggle('show');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!adminUserBtn.contains(e.target) && !adminDropdown.contains(e.target)) {
        adminDropdown.classList.remove('show');
      }
    });
  }
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
// Edit User Function
function editUser(userId) {
  const user = adminData.users.find(u => u.id === userId);
  if (!user) return;

  document.getElementById('editUserId').value = userId;
  // Use the same name resolution as the table
  document.getElementById('editUserName').value = user.displayName || user.name || user.fullName || user.username || '';
  document.getElementById('editUserEmail').value = user.email || '';
  document.getElementById('editUserRole').value = user.role || 'Buyer';

  document.getElementById('editUserModal').style.display = 'block';
}

function closeEditUserModal() {
  document.getElementById('editUserModal').style.display = 'none';
}

// Handle Edit User Form Submission
document.getElementById('editUserForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const userId = document.getElementById('editUserId').value;
  const name = document.getElementById('editUserName').value;
  const role = document.getElementById('editUserRole').value;
  const btn = e.target.querySelector('button[type="submit"]');
  const originalBtnText = btn.innerText;

  try {
    btn.disabled = true;
    btn.innerText = 'Saving...';

    // Update Firebase
    await db.ref('users/' + userId).update({
      displayName: name, // Standardize on displayName
      name: name,        // Update legacy field just in case
      role: role
    });

    // Refresh Data
    await loadUsersData();

    closeEditUserModal();
    showSuccess('User updated successfully');

  } catch (error) {
    console.error('Error updating user:', error);
    showError('Failed to update user');
  } finally {
    btn.disabled = false;
    btn.innerText = originalBtnText;
  }
});

// Close modal when clicking outside
window.onclick = function (event) {
  const modal = document.getElementById('editUserModal');
  if (event.target == modal) {
    closeEditUserModal();
  }
  const vModal = document.getElementById('verificationModal');
  if (event.target == vModal) {
    closeVerificationModal();
  }
}
// Product View Modal Functions
window.viewProduct = function (productId) {
  const product = adminData.products.find(p => p.id === productId);
  if (!product) return;

  const modal = document.getElementById('productViewModal');
  const modalBody = document.getElementById('productViewBody');

  // Handle Images
  let imagesHtml = '';
  if (Array.isArray(product.images) && product.images.length > 0) {
    imagesHtml = `<div style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 10px; margin-bottom: 15px;">
          ${product.images.map(img => {
      const url = typeof img === 'string' ? img : (img.url || 'images/placeholder.jpg');
      return `<img src="${url}" style="height: 150px; border-radius: 8px; border: 1px solid #eee; cursor: pointer;" onclick="window.open('${url}', '_blank')">`;
    }).join('')}
      </div>`;
  } else if (typeof product.images === 'string') {
    imagesHtml = `<div style="margin-bottom: 15px;"><img src="${product.images}" style="max-height: 200px; border-radius: 8px; border: 1px solid #eee;"></div>`;
  } else if (product.img) {
    imagesHtml = `<div style="margin-bottom: 15px;"><img src="${product.img}" style="max-height: 200px; border-radius: 8px; border: 1px solid #eee;"></div>`;
  }

  // Seller Info (Basic)
  const sellerInfo = product.sellerId ? `<p><strong>Seller ID:</strong> ${product.sellerId}</p>` : '';

  modalBody.innerHTML = `
      ${imagesHtml}
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div>
              <h3 style="margin-top: 0;">${product.title || product.name || 'N/A'}</h3>
              <p style="color: #666; margin-bottom: 15px;">${product.description || 'No description available.'}</p>
              <p><strong>Category:</strong> <span class="badge badge-info">${product.category || 'N/A'}</span></p>
              <p><strong>Brand:</strong> ${product.brand || 'N/A'}</p>
              <p><strong>Condition:</strong> ${product.condition || 'N/A'}</p>
          </div>
          <div>
              <div style="background: #f9fafb; padding: 15px; border-radius: 8px;">
                  <p style="font-size: 1.2rem; font-weight: bold; color: #4f46e5; margin-top: 0;">RS ${product.price || 0}</p>
                  <p><strong>Stock:</strong> ${product.stock || 0}</p>
                  <p><strong>Status:</strong> <span class="status-badge ${product.isActive !== false ? 'active' : 'inactive'}">${product.isActive !== false ? 'Active' : 'Inactive'}</span></p>
                  <p><strong>Created:</strong> ${product.createdAt ? new Date(product.createdAt).toLocaleDateString() : 'N/A'}</p>
                  ${sellerInfo}
              </div>
          </div>
      </div>
  `;

  modal.style.display = 'block';
};

window.closeProductViewModal = function () {
  document.getElementById('productViewModal').style.display = 'none';
};

// Product Edit Modal Functions
window.editProduct = function (productId) {
  const product = adminData.products.find(p => p.id === productId);
  if (!product) return;

  document.getElementById('editProductId').value = productId;
  document.getElementById('editProductName').value = product.title || product.name || '';
  document.getElementById('editProductPrice').value = product.price || 0;
  document.getElementById('editProductStock').value = product.stock || 0;
  document.getElementById('editProductCategory').value = (product.category || 'mobile').toLowerCase();
  document.getElementById('editProductStatus').value = product.isActive !== false ? 'true' : 'false';

  document.getElementById('productEditModal').style.display = 'block';
};

window.closeProductEditModal = function () {
  document.getElementById('productEditModal').style.display = 'none';
};

// Handle Edit Product Form Submission
document.getElementById('editProductForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const productId = document.getElementById('editProductId').value;
  const name = document.getElementById('editProductName').value;
  const price = parseFloat(document.getElementById('editProductPrice').value);
  const stock = parseInt(document.getElementById('editProductStock').value);
  const category = document.getElementById('editProductCategory').value;
  const isActive = document.getElementById('editProductStatus').value === 'true';

  const btn = e.target.querySelector('button[type="submit"]');
  const originalBtnText = btn.innerText;

  try {
    btn.disabled = true;
    btn.innerText = 'Saving...';

    // Update Firebase
    await db.ref('products/' + productId).update({
      title: name,
      name: name, // Keep both for compatibility
      price: price,
      stock: stock,
      category: category,
      isActive: isActive
    });

    // Refresh Data
    await loadProductsData();

    closeProductEditModal();
    showSuccess('Product updated successfully');

  } catch (error) {
    console.error('Error updating product:', error);
    showError('Failed to update product');
  } finally {
    btn.disabled = false;
    btn.innerText = originalBtnText;
  }
});

// Update window.onclick to handle new modals
const originalWindowOnClick = window.onclick;
window.onclick = function (event) {
  if (originalWindowOnClick) originalWindowOnClick(event);

  const viewModal = document.getElementById('productViewModal');
  if (event.target == viewModal) closeProductViewModal();

  const editModal = document.getElementById('productEditModal');
  if (event.target == editModal) closeProductEditModal();
};

window.viewOrder = viewOrder;
window.editProduct = editProduct; // Re-exporting explicitly

// Category Functions (Placeholders)
function viewCategory(categoryId) { alert(`View category: ${categoryId}`); }
function editCategory(categoryId) { alert(`Edit category: ${categoryId}`); }

window.viewCategory = viewCategory;
window.editCategory = editCategory;
window.viewDispute = viewDispute;
window.resolveDispute = resolveDispute;
window.viewTransaction = viewTransaction;
window.viewEscrow = viewEscrow;
window.releaseEscrow = releaseEscrow;

// Logout Function
window.logout = async function () {
  try {
    console.log('Logging out...');

    // 1. Sign out the primary instance
    if (auth) {
      await auth.signOut();
    }

    // 2. Explicitly sign out AdminPanel app if it exists
    try {
      const adminApp = firebase.app("AdminPanel");
      if (adminApp) {
        await adminApp.auth().signOut();
        console.log('Signed out AdminPanel app');
      }
    } catch (e) {
      console.log('AdminPanel app not found during logout');
    }

    // 3. Sign out default app just in case
    try {
      await firebase.auth().signOut();
      console.log('Signed out default app');
    } catch (e) {
      console.log('Default app not found during logout');
    }

    localStorage.removeItem('userData'); // Clear local storage
    window.location.href = 'admin-login.html';
  } catch (error) {
    console.error('Logout error:', error);
    // Force redirect anyway
    window.location.href = 'admin-login.html';
  }
};

// Dropdown Toggle
document.addEventListener('DOMContentLoaded', () => {
  const adminUserBtn = document.getElementById('adminUserBtn');
  const adminDropdown = document.getElementById('adminDropdown');

  if (adminUserBtn && adminDropdown) {
    adminUserBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      adminDropdown.style.display = adminDropdown.style.display === 'block' ? 'none' : 'block';
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!adminUserBtn.contains(e.target) && !adminDropdown.contains(e.target)) {
        adminDropdown.style.display = 'none';
      }
    });
  }
});


// Duplicate loadWalletData removed. Using the one defined earlier.

// Render Withdrawals Table
function renderWithdrawals(withdrawals) {
  const tbody = document.getElementById('withdrawalsTableBody');
  if (!tbody) return;

  const filter = document.getElementById('withdrawalStatusFilter')?.value || 'pending';
  const filteredWithdrawals = withdrawals.filter(w => filter === 'all' || w.status === filter);

  if (filteredWithdrawals.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">No withdrawal requests found</td></tr>';
    return;
  }

  tbody.innerHTML = filteredWithdrawals.map((w, index) => {
    const requestId = String(index + 1).padStart(3, '0');
    const userDisplayId = getUserDisplayId(w.userId);

    return `
    <tr>
      <td>#${requestId}</td>
      <td>
        <div class="d-flex align-items-center">
            <div>
                <div class="fw-bold">${w.userName || 'Unknown'}</div>
                <div class="text-muted small">
                    <a href="#" onclick="viewUser('${w.userId}'); return false;" style="text-decoration: none; color: #667eea; font-weight: 600;">
                        ${userDisplayId}
                    </a>
                </div>
            </div>
        </div>
      </td>
      <td>RS ${parseFloat(w.amount).toLocaleString()}</td>
      <td>${w.method}</td>
      <td>${w.details || '-'}</td>
      <td><span class="badge badge-${w.status === 'approved' ? 'success' : w.status === 'rejected' ? 'danger' : 'warning'}">${w.status}</span></td>
      <td>${new Date(w.createdAt).toLocaleDateString()}</td>
      <td>
        ${w.status === 'pending' ? `
        <button class="btn btn-sm btn-success" onclick="approveWithdrawal('${w.id}')" title="Approve">
          <i class="fas fa-check"></i>
        </button>
        <button class="btn btn-sm btn-danger" onclick="rejectWithdrawal('${w.id}')" title="Reject">
          <i class="fas fa-times"></i>
        </button>
        ` : '-'}
      </td>
    </tr>
  `}).join('');
}

// Render Wallet Transactions Table
function renderWalletTransactions(withdrawals) {
  const tbody = document.getElementById('walletTransactionsTableBody');
  if (!tbody) return;

  // Combine withdrawals and other transactions if available
  const transactions = withdrawals.map(w => ({
    id: w.id,
    user: w.userName,
    type: 'Withdrawal',
    amount: w.amount,
    status: w.status,
    date: w.createdAt
  })).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

  if (transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">No recent transactions</td></tr>';
    return;
  }

  tbody.innerHTML = transactions.map(t => `
    <tr>
      <td>#${t.id.substring(1, 6)}</td>
      <td>${t.user || 'Unknown'}</td>
      <td>${t.type}</td>
      <td>RS ${t.amount.toLocaleString()}</td>
      <td><span class="badge badge-${t.status === 'approved' ? 'success' : t.status === 'rejected' ? 'danger' : 'warning'}">${t.status}</span></td>
      <td>${new Date(t.date).toLocaleDateString()}</td>
    </tr>
  `).join('');
}

// Approve Withdrawal
async function approveWithdrawal(id) {
  if (!await showConfirmationModal('Approve Withdrawal', 'Are you sure you want to approve this withdrawal?', { confirmText: 'Approve', confirmColor: '#28a745' })) return;
  try {
    await db.ref('withdrawals/' + id).update({ status: 'approved', processedAt: firebase.database.ServerValue.TIMESTAMP });
    showSuccess('Withdrawal approved');
    showSuccess('Withdrawal approved');
    // loadWalletData(); // Removed to prevent duplicate listeners
  } catch (error) {
    console.error('Error approving withdrawal:', error);
    showError('Failed to approve withdrawal');
  }
}

// Reject Withdrawal
// Reject Withdrawal
async function rejectWithdrawal(id) {
  if (!await showConfirmationModal('Reject Withdrawal', 'Are you sure you want to reject this withdrawal?', { confirmText: 'Reject', confirmColor: '#dc3545' })) return;
  try {
    // 1. Fetch withdrawal details to get amount and userId
    const withdrawalSnap = await db.ref('withdrawals/' + id).once('value');
    if (!withdrawalSnap.exists()) {
      throw new Error('Withdrawal request not found');
    }
    const withdrawal = withdrawalSnap.val();

    if (withdrawal.status !== 'pending') {
      throw new Error('Withdrawal request is not pending');
    }

    // 2. Refund amount to user wallet
    const userWalletRef = db.ref('users/' + withdrawal.userId + '/wallet');
    const userWalletSnap = await userWalletRef.once('value');
    const currentBalance = userWalletSnap.val()?.balance || 0;
    const newBalance = currentBalance + parseFloat(withdrawal.amount);

    await userWalletRef.update({
      balance: newBalance
    });

    // 3. Update withdrawal status
    await db.ref('withdrawals/' + id).update({
      status: 'rejected',
      processedAt: firebase.database.ServerValue.TIMESTAMP,
      note: 'Refunded to wallet'
    });

    showSuccess('Withdrawal rejected and amount refunded to user wallet');
    showSuccess('Withdrawal rejected and amount refunded to user wallet');
    // loadWalletData(); // Removed to prevent duplicate listeners
  } catch (error) {
    console.error('Error rejecting withdrawal:', error);
    showError('Failed to reject withdrawal: ' + error.message);
  }
}

// Filter Withdrawals removed (duplicate)

// Export Wallet Data
window.exportWalletData = async function () {
  try {
    const snapshot = await db.ref('withdrawals').once('value');
    const withdrawals = [];
    snapshot.forEach(child => {
      withdrawals.push({ id: child.key, ...child.val() });
    });

    if (withdrawals.length === 0) {
      showError('No data to export');
      return;
    }

    // Define CSV headers
    const headers = ['ID', 'User Name', 'User ID', 'Amount', 'Method', 'Details', 'Status', 'Date'];

    // Map data to CSV rows
    const rows = withdrawals.map(w => [
      w.id,
      w.userName || 'Unknown',
      w.userId || 'Unknown',
      w.amount,
      w.method,
      w.details || '',
      w.status,
      new Date(w.createdAt).toLocaleDateString()
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `wallet_data_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

  } catch (error) {
    console.error('Error exporting wallet data:', error);
    showError('Failed to export data');
  }
};