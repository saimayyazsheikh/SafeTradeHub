// V2 Analytics State Management (Absolute Hoisting)
window.v2Charts = window.v2Charts || {};
window.v2AnalyticsActive = false;
window.v2GlobalStats = null;

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
  recentActivity: [],
  currentSearch: {
    users: '',
    products: '',
    disputes: '',
    orders: '',
    staff: '',
    escrow: '',
    verification: '',
    transactions: '',
    category: '',
    orderStatus: '',
    escrowStatus: '',
    disputeStatus: ''
  }
};

// ========================================
// FRAUD MONITOR STATE - declared at top level to prevent TDZ errors
// ========================================
let fraudReports = [];
let fraudListenerActive = false;
let globalUsersMap = {};
let currentWithdrawalId = null; // Moved to top level

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
  if (document.body.classList.contains('admin-dashboard-body')) {
    initializeDashboard();
  }
});

// Initialize dashboard
async function initializeDashboard() {


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

  // Initialize Sidebar Analytics Snapshot
  initDashboardSidebarAnalytics();

  // Set user role for notification manager
  if (window.NotificationManager) {
    window.NotificationManager.userRole = 'Admin';
  }
}

// Wait for AuthManager to be available
async function waitForAuthManager() {
  let attempts = 0;
  const maxAttempts = 50; // 5 seconds max wait

  while (!window.AuthManager && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
}

// Wait for Firebase Auth - uses onAuthStateChanged to avoid polling hang
async function waitForFirebaseAuth() {
  const currentAuth = window.auth || auth;
  if (!currentAuth) return;
  if (currentAuth.currentUser) return; // Already ready
  return new Promise(resolve => {
    const unsub = currentAuth.onAuthStateChanged(user => {
      unsub();
      resolve(user);
    });
    // Safety timeout - resolve after 3s regardless
    setTimeout(resolve, 3000);
  });
}

// Setup navigation
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');


  navItems.forEach(item => {
    const section = item.getAttribute('data-section');


    item.addEventListener('click', (e) => {
      e.preventDefault();

      if (section) {
        showSection(section);
      }
    });
  });
}

// Show section
async function showSection(sectionName) {


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

    case 'analytics':
      await loadAnalyticsData();
      break;
    case 'settings':
      await loadSettingsData();
      break;
    case 'wallet':
      await loadWalletData();
      break;
    case 'fraud-monitor':
      await loadFraudMonitorData();
      break;
    case 'profile':
      await loadProfileData();
      break;
  }
}

// Load Settings Data
async function loadSettingsData() {
  // Already populated in HTML, but we can sync from server/storage if needed
  console.log('Settings section loaded');
}

// Load Profile Data
async function loadProfileData() {
  try {
    showLoading('profile');

    let currentUser = null;
    if (window.AuthManager) {
      currentUser = window.AuthManager.getCurrentUser();
    }

    // Fallback to localStorage if AuthManager is still initializing
    if (!currentUser) {
      const storedData = localStorage.getItem('userData');
      currentUser = storedData ? JSON.parse(storedData) : null;
    }

    if (currentUser) {
      updateElementText('adminProfileName', currentUser.name || 'Administrator');
      updateElementText('adminProfileEmail', currentUser.email || 'admin@safetradehub.com');
      updateElementText('adminProfileId', currentUser.uid || currentUser.id || 'ADM-001');

      if (currentUser.createdAt) {
        updateElementText('adminProfileDate', new Date(currentUser.createdAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }));
      }
    }

    hideLoading('profile');
  } catch (error) {
    console.error('Error loading profile data:', error);
    hideLoading('profile');
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
  if (typeof initDashboardSidebarAnalytics === 'function') initDashboardSidebarAnalytics();
  showSuccess('Dashboard refreshed successfully');
};

/**
 * Sidebar Analytics Snapshot Implementation
 */
function initDashboardSidebarAnalytics() {
  if (typeof STHAnalytics === 'undefined') return;

  STHAnalytics.Admin.listenToGlobalMetrics((stats) => {
    // 1. Update Sidebar Mini Stats
    const fulfillmentEl = document.getElementById('sideFulfillmentRate');
    const issuesEl = document.getElementById('sideActiveIssues');

    if (fulfillmentEl) fulfillmentEl.innerText = stats.counters.fulfillmentRate + '%';
    if (issuesEl) issuesEl.innerText = stats.counters.activeDisputes;

    // 2. Render Sidebar Revenue Chart (Minimalist)
    const canvasId = 'dashboardSidebarChart';
    const trendData = stats.charts.revenueTrend;

    const labels = Object.keys(trendData || {}).sort().slice(-7); // Last 7 data points
    const data = labels.map(l => trendData[l]);

    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    if (window.v2Charts.sidePulse) window.v2Charts.sidePulse.destroy();

    window.v2Charts.sidePulse = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.map(l => l.split('-').slice(1).join('/')),
        datasets: [{
          data: data,
          borderColor: '#4f46e5',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: true,
          backgroundColor: 'rgba(79, 70, 229, 0.05)',
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: {
          x: { display: false },
          y: { display: false, beginAtZero: true }
        }
      }
    });
  });
}

// Logout Functionality
window.logout = async function () {
  try {
    const confirmed = await window.showConfirmModal({
      title: 'Logout Confirmation',
      message: 'Are you sure you want to end your administrative session? You will need to log in again to access the dashboard.',
      confirmText: 'Logout',
      type: 'danger'
    });

    if (confirmed) {
      // 1. Clear global AuthManager (Default Firebase Instance)
      if (window.AuthManager) {
        await window.AuthManager.signOut();
      }

      // 2. Clear AdminPanel Instance (Mandatory for dashboard persistence)
      if (window.auth && typeof window.auth.signOut === 'function') {
        await window.auth.signOut();
      }

      // 3. Clear storage fallback
      localStorage.removeItem('userData');
      localStorage.removeItem('authToken');

      // 4. Force Redirect
      window.location.replace('admin-login.html');
    }
  } catch (error) {
    console.error('Logout error:', error);
    window.location.replace('admin-login.html');
  }
};

// Custom Confirmation Modal Utility
window.showConfirmModal = function (options = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmationModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const iconContainer = document.getElementById('confirmIconContainer');

    titleEl.textContent = options.title || 'Confirm Action';
    messageEl.textContent = options.message || 'Are you sure?';

    if (options.confirmText) okBtn.textContent = options.confirmText;
    if (options.cancelText) cancelBtn.textContent = options.cancelText;

    if (options.type === 'danger') {
      okBtn.style.background = '#ef4444';
      iconContainer.innerHTML = '<div style="width: 70px; height: 70px; background: #fee2e2; color: #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto; font-size: 30px;"><i class="fas fa-exclamation-triangle"></i></div>';
    } else {
      okBtn.style.background = '#2563eb';
      iconContainer.innerHTML = '<div style="width: 70px; height: 70px; background: #dbeafe; color: #2563eb; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto; font-size: 30px;"><i class="fas fa-question-circle"></i></div>';
    }

    modal.style.display = 'block';

    const handleOk = () => {
      modal.style.display = 'none';
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      modal.style.display = 'none';
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      okBtn.removeEventListener('click', handleOk);
      cancelBtn.removeEventListener('click', handleCancel);
    };

    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);

    // Close on escape key
    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleKeydown);
        handleCancel();
      }
    };
    document.addEventListener('keydown', handleKeydown);
  });
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

    console.log('Stats Check:', {
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



    // Calculate status counts from real data (Aggregated for dashboard summary)
    const statusCounts = {
      pending: adminData.orders.filter(o => {
        const s = (o.status || '').toLowerCase();
        return s === 'pending' || s === 'placed';
      }).length,
      shipped: adminData.orders.filter(o => {
        const s = (o.status || '').toLowerCase();
        return ['sent_to_hub', 'received_at_origin', 'verified', 'sealed', 'in_transit', 'arrived_at_dest_hub', 'at_destination', 'out_for_delivery', 'shipped', 'shipped_to_escrow'].includes(s);
      }).length,
      delivered: adminData.orders.filter(o => {
        const s = (o.status || '').toLowerCase();
        return s === 'delivered' || s === 'completed';
      }).length,
      disputed: adminData.orders.filter(o => {
        const s = (o.status || '').toLowerCase();
        return s === 'disputed';
      }).length
    };

    // Update order status counts
    updateElementText('pendingOrdersCount', statusCounts.pending);
    updateElementText('shippedOrdersCount', statusCounts.shipped);
    updateElementText('deliveredOrdersCount', statusCounts.delivered);
    updateElementText('disputedOrdersCount', statusCounts.disputed);

    // Update orders table
    updateOrdersTable();

    // Update Global Logistics Pipeline
    updateGlobalLogisticsPipeline();

    hideLoading('orders');
  } catch (error) {
    console.error('Error loading orders data:', error);
    showError('Failed to load orders data');
    hideLoading('orders');
  }
}

function updateGlobalLogisticsPipeline() {
  const tbody = document.querySelector('#globalLogisticsTable tbody');
  if (!tbody) return;

  const now = Date.now();
  const filteredOrders = adminData.orders.filter(o => o.status !== 'cancelled');

  // Calculate Global Metrics
  const deliveredCount = adminData.orders.filter(o => {
    const s = (o.status || '').toLowerCase();
    return s === 'delivered' || s === 'completed';
  }).length;
  updateElementText('deliveredTotal', deliveredCount);

  // Bottlenecks: Orders with status not updated in > 24 hours
  const bottlenecked = filteredOrders.filter(o => {
    const lastUpdate = o.updatedAt ? (typeof o.updatedAt === 'number' ? o.updatedAt : new Date(o.updatedAt).getTime()) : o.createdAt || 0;
    return (now - lastUpdate) > (24 * 60 * 60 * 1000) && (o.status !== 'delivered' && o.status !== 'completed');
  });
  updateElementText('bottleneckCount', bottlenecked.length);

  if (filteredOrders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 30px; color: #94a3b8;">No shipments found in pipeline.</td></tr>';
    return;
  }

  tbody.innerHTML = filteredOrders.map(o => {
    const lastUpdateTs = o.updatedAt ? (typeof o.updatedAt === 'number' ? o.updatedAt : new Date(o.updatedAt).getTime()) : o.createdAt || 0;
    const hoursElapsed = (now - lastUpdateTs) / (1000 * 60 * 60);

    // SLA Status Determination
    let slaClass = '';
    let slaLabel = '';

    if (o.status !== 'delivered' && o.status !== 'completed') {
      if (hoursElapsed > 48) {
        slaClass = 'sla-alert-red';
        slaLabel = 'LATE (>48h)';
      } else if (hoursElapsed > 24) {
        slaClass = 'sla-alert-yellow';
        slaLabel = 'DELAYED (>24h)';
      } else {
        slaClass = 'sla-ok';
        slaLabel = 'ON TIME';
      }
    } else {
      slaClass = 'sla-done';
      slaLabel = 'FINISHED';
    }

    const isDisputed = o.status === 'disputed';
    const statusClass = isDisputed ? 'danger' : (o.status === 'delivered' || o.status === 'completed' ? 'success' : 'warning');

    return `
      <tr class="${isDisputed ? 'row-disputed' : ''}">
        <td>
            <div style="display: flex; align-items: center; gap: 8px;">
                <strong style="color: #2563eb;">#${o.id}</strong>
                ${isDisputed ? '<span class="pulse-red" title="Disputed Order"><i class="fas fa-exclamation-triangle"></i></span>' : ''}
            </div>
        </td>
        <td>
            <span class="status-badge ${statusClass}">
                ${formatOrderStatus(o.status)}
            </span>
        </td>
        <td>
            <div style="display: flex; flex-direction: column;">
                <span style="font-weight: 500;"><i class="fas fa-map-marker-alt" style="color: #3b82f6; font-size: 0.8rem;"></i> ${o.lastLocation || 'Origin'}</span>
                <small style="color: #94a3b8;">Recipient: ${o.shippingAddress ? o.shippingAddress.split(',').pop() : 'N/A'}</small>
            </div>
        </td>
        <td>
            <div class="sla-badge ${slaClass}">${slaLabel}</div>
            <small style="display: block; color: #94a3b8; margin-top: 4px;">Updated: ${formatDate(lastUpdateTs)}</small>
        </td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="viewOrderDetails('${o.id}')">
            <i class="fas fa-satellite"></i> LIVE TRACK
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Add SLA Styles if not present
  if (!document.getElementById('sla-monitor-styles')) {
    const style = document.createElement('style');
    style.id = 'sla-monitor-styles';
    style.textContent = `
        .sla-badge { font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: 4px; display: inline-block; }
        .sla-alert-red { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
        .sla-alert-yellow { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
        .sla-ok { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
        .sla-done { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }
        
        .row-disputed { background-color: #fff1f2 !important; }
        .pulse-red { color: #e11d48; animation: pulse-blink 1s infinite; }
        @keyframes pulse-blink {
            0% { opacity: 1; }
            50% { opacity: 0.4; }
            100% { opacity: 1; }
        }
    `;
    document.head.appendChild(style);
  }
}

function simulateThirdPartyLogistics() {
  showSuccess('Simulating external carrier update (FedEx/SafeShip)...');
  setTimeout(() => showSuccess('Outbound status synced for 12 shipments.'), 2000);
}

function exportLogisticsReport() {
  showSuccess('Generating Logistics Manifest v2.4...');
  setTimeout(() => showSuccess('Manifest exported to CSV.'), 1500);
}
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


    updateProductsTable();
    updateElementText('productsCount', adminData.products.length);

    hideLoading('products');
  } catch (error) {
    console.error('Error loading products data:', error);
    showError('Failed to load products data');
    hideLoading('products');
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


    updateDisputesTable();

    hideLoading('disputes');
  } catch (error) {
    console.error('Error loading disputes data:', error);
    showError('Failed to load disputes data');
    hideLoading('disputes');
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


    updateEscrowTable();

    hideLoading('escrow');
  } catch (error) {
    console.error('Error loading escrow data:', error);
    showError('Failed to load escrow data');
    hideLoading('escrow');
  }
}

// Update Escrow Table
function updateEscrowTable(searchTerm) {
  const tableBody = document.querySelector('#escrowTableBody');
  // Sync state if passed directly
  if (searchTerm !== undefined) adminData.currentSearch.escrow = searchTerm;
  const query = (adminData.currentSearch.escrow || "").toLowerCase().trim();

  // Fallback selector if specific ID missing
  const container = document.getElementById('escrow-section');
  const tbody = tableBody || (container ? container.querySelector('tbody') : null);

  if (!tbody) return;

  let escrows = adminData.escrows || [];

  // Apply status filter
  const statusFilter = (adminData.currentSearch.escrowStatus || "").toLowerCase();
  if (statusFilter) {
    escrows = escrows.filter(e => {
      const s = (e.status || "").toLowerCase();
      // 'held' value from dropdown matches 'held' or 'holding'
      if (statusFilter === 'held') return s === 'held' || s === 'holding';
      return s === statusFilter;
    });
  }

  // Apply search filter
  if (query) {
    escrows = escrows.filter(e => {
      const id = (e.id || "").toLowerCase();
      const orderId = (e.orderId || "").toLowerCase();
      const status = (e.status || "").toLowerCase();
      const displayStatus = (e.orderStatus ? formatOrderStatus(e.orderStatus) : status).toLowerCase();
      return id.includes(query) || orderId.includes(query) || status.includes(query) || displayStatus.includes(query);
    });
  }

  if (escrows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center">${query ? 'No matching escrows found' : 'No active escrows found'}</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = escrows.map((escrow, index) => {
    const amount = parseFloat(escrow.amount || 0).toLocaleString();
    const status = (escrow.status || 'pending').toLowerCase();
    // Map status to CSS classes in dashboard.css
    let statusClass = 'pending';
    if (status === 'released') statusClass = 'delivered'; // 'delivered' style is Green
    else if (status === 'disputed' || status === 'refunded') statusClass = 'cancelled';
    else if (status === 'holding' || status === 'held') statusClass = 'pending';

    const date = escrow.createdAt ? new Date(escrow.createdAt).toLocaleDateString() : 'N/A';

    // Determine Display Status (Format order status if applicable, otherwise use escrow status)
    const displayStatus = escrow.orderStatus ? formatOrderStatus(escrow.orderStatus) : (status.charAt(0).toUpperCase() + status.slice(1));

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
      <td><span class="status-badge ${statusClass}">${displayStatus}</span></td>
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
    const notifId = db.ref(`users/${sellerId}/notifications`).push().key;
    updates[`users/${sellerId}/notifications/${notifId}`] = {
      title: 'Payment Released',
      message: `Funds for Order #${escrow.orderId} (RS ${payoutAmount}) have been released to your wallet. (Service Fee: RS ${fee})`,
      type: 'payment',
      read: false,
      timestamp: firebase.database.ServerValue.TIMESTAMP
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
function updateVerificationTable(searchTerm = '') {
  const tbody = document.getElementById('verificationTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  const filteredData = adminData.pendingVerifications.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    return (
      user.name.toLowerCase().includes(searchLower) ||
      user.email.toLowerCase().includes(searchLower) ||
      user.id.toLowerCase().includes(searchLower)
    );
  });

  if (filteredData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center">${searchTerm ? 'No matching verifications found' : 'No pending verifications'}</td></tr>`;
    return;
  }

  // Get Firebase project details for the link
  const appOptions = firebase.app().options;
  const projectId = appOptions.projectId;
  const dbInstance = appOptions.databaseURL.replace('https://', '').replace('.firebaseio.com', '');

  filteredData.forEach((user, index) => {
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
        <div class="btn-group">
          <button class="btn btn-sm btn-success" onclick="approveVerification('${user.id}')" title="Approve">
            <i class="fas fa-check"></i>
          </button>
          <button class="btn btn-sm btn-danger" onclick="rejectVerification('${user.id}')" title="Reject">
            <i class="fas fa-times"></i>
          </button>
          <button class="btn btn-sm btn-primary" onclick="viewVerificationDetails('${user.id}')" title="View Details">
            <i class="fas fa-eye"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// View Verification Details
window.viewVerificationDetails = async function (userId) {

  try {
    const user = adminData.pendingVerifications.find(u => u.id === userId);

    // User lookup logic
    let targetUser = user;
    if (!targetUser) {

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
    let hasContent = false;
    let content = `
      <div style="display: grid; grid-template-columns: 1fr; gap: 24px; padding: 10px;">
        <!-- User Info Section -->
        <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
          <h4 style="margin: 0 0 15px 0; color: #1e293b; font-size: 1.1rem; border-bottom: 2px solid #cbd5e1; padding-bottom: 8px;">User Identity Record</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
             <div>
               <p style="margin: 5px 0; color: #64748b; font-size: 0.85rem;">Full Name</p>
               <p style="margin: 0; font-weight: 700; color: #1e293b;">${targetUser.name || 'N/A'}</p>
             </div>
             <div>
               <p style="margin: 5px 0; color: #64748b; font-size: 0.85rem;">Email Handle</p>
               <p style="margin: 0; font-weight: 700; color: #1e293b;">${targetUser.email || 'N/A'}</p>
             </div>
             <div>
               <p style="margin: 5px 0; color: #64748b; font-size: 0.85rem;">Submission Type</p>
               <p style="margin: 0; font-weight: 700; color: #6366f1;">${targetUser.type || 'N/A'}</p>
             </div>
             <div>
               <p style="margin: 5px 0; color: #64748b; font-size: 0.85rem;">Registry ID</p>
               <p style="margin: 0; font-family: monospace; font-size: 0.8rem; color: #475569;">#${userId}</p>
             </div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 20px;">
    `;

    // Identity Verification Section
    if (v.cnic && v.cnic.submitted) {
      hasContent = true;
      content += `
        <div class="verification-section">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h4 style="margin:0; color: #1e293b; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;">
               <i class="fas fa-id-card" style="color: #6366f1;"></i> Identity Verification (CNIC)
            </h4>
            <div class="admin-actions">
              ${v.cnic.verified ?
          '<span class="badge badge-success">Verified ✅</span>' :
          v.cnic.status === 'rejected' ?
            '<span class="badge badge-danger">Rejected ❌</span>' :
            `
                <button class="btn btn-sm btn-success" onclick="approveVerification('${userId}', 'cnic')" style="margin-right:8px; background-color: #22c55e; color: white; border: none; padding: 4px 10px; border-radius: 4px;">Approve Identity</button>
                <button class="btn btn-sm btn-danger" onclick="rejectVerification('${userId}', 'cnic')" style="background-color: #ef4444; color: white; border: none; padding: 4px 10px; border-radius: 4px;">Reject Identity</button>
                `
        }
            </div>
          </div>
          
          <div class="cnic-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 12px; margin-bottom: 15px;">
            <div>
              <p style="font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 8px;">Front Side:</p>
              <a href="${v.cnic.frontUrl}" target="_blank" title="Click to enlarge">
                <img src="${v.cnic.frontUrl}" style="width: 100%; height: 180px; object-fit: cover; border-radius: 12px; border: 3px solid #f1f5f9; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
              </a>
            </div>
            <div>
              <p style="font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 8px;">Back Side:</p>
              <a href="${v.cnic.backUrl}" target="_blank" title="Click to enlarge">
                <img src="${v.cnic.backUrl}" style="width: 100%; height: 180px; object-fit: cover; border-radius: 12px; border: 3px solid #f1f5f9; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
              </a>
            </div>
          </div>

          ${v.selfie && v.selfie.url ? `
            <div style="margin-top: 25px;">
              <h4 style="margin: 0 0 15px 0; color: #1e293b; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-user-circle" style="color: #6366f1;"></i> Live Selfie Verification
              </h4>
              <a href="${v.selfie.url}" target="_blank" title="Click to enlarge">
                <img src="${v.selfie.url}" style="width: 200px; height: 200px; object-fit: cover; border-radius: 50%; border: 4px solid #f1f5f9; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
              </a>
            </div>
          ` : ''}
        </div>
      `;
    }

    // Shop Verification Section
    if (v.shop && v.shop.submitted && (v.shop.documentUrl || (v.shop.docUrls && v.shop.docUrls.length > 0))) {
      hasContent = true;
      content += `
        <div class="verification-section" style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #f1f5f9;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <h4 style="margin:0; color: #1e293b; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;">
               <i class="fas fa-store" style="color: #10b981;"></i> Business Presence Verification
            </h4>
            <div class="admin-actions">
              ${v.shop.verified ?
          '<span class="badge badge-success">Verified ✅</span>' :
          v.shop.status === 'rejected' ?
            '<span class="badge badge-danger">Rejected ❌</span>' :
            `
                <button class="btn btn-sm btn-success" onclick="approveVerification('${userId}', 'shop')" style="margin-right:8px; background-color: #22c55e; color: white; border: none; padding: 4px 10px; border-radius: 4px;">Approve Shop</button>
                <button class="btn btn-sm btn-danger" onclick="rejectVerification('${userId}', 'shop')" style="background-color: #ef4444; color: white; border: none; padding: 4px 10px; border-radius: 4px;">Reject Shop</button>
                `
        }
            </div>
          </div>
          
          <div style="background: #f0fdf4; padding: 20px; border-radius: 12px; border: 1px solid #dcfce7; display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: center;">
            <div>
              <p style="margin: 5px 0;"><strong>Business Name:</strong> <span style="font-weight: 600;">${v.shop.name || 'N/A'}</span></p>
              <p style="margin: 5px 0;"><strong>Business Type:</strong> <span style="font-weight: 600; text-transform: capitalize;">${v.shop.businessType || 'N/A'}</span></p>
              <p style="margin: 5px 0;"><strong>Physical Address:</strong> <span style="font-weight: 600;">${v.shop.address || 'N/A'}</span></p>
              <p style="margin: 5px 0;"><strong>Verification Phone:</strong> <span style="font-weight: 600;">${v.shop.phone || 'N/A'}</span></p>
              ${v.shop.locationData && v.shop.locationData.coords ? `<p style="margin: 5px 0; color: #15803d; font-weight: 600;">✓ Location Coordinates Captured: ${v.shop.locationData.coords.latitude}, ${v.shop.locationData.coords.longitude}</p>` : ''}
            </div>
            
            <div style="text-align: center; background: white; padding: 12px; border-radius: 12px; border: 1px solid #dcfce7;">
              <p style="font-size: 0.8rem; font-weight: 700; color: #166534; margin-bottom: 8px;">Main Shop Document</p>
              <a href="${v.shop.documentUrl || (v.shop.docUrls && v.shop.docUrls[0])}" target="_blank" title="Click to enlarge">
                <img src="${v.shop.documentUrl || (v.shop.docUrls && v.shop.docUrls[0])}" style="width: 140px; height: 140px; object-fit: cover; border-radius: 8px; border: 2px solid #dcfce7; box-shadow: 0 4px 6px rgba(0,0,0,0.05);" onerror="this.src='/static/images/placeholder.jpg'">
              </a>
            </div>
          </div>

          <div style="margin-top: 16px;">
            <p style="font-weight: 600; font-size: 0.9rem; color: #374151; margin-bottom: 10px;">Supporting Visual Assets:</p>
            <div class="photo-grid" style="display: flex; gap: 12px; flex-wrap: wrap;">
              ${(v.shop.photoUrls || []).map(url => `
                <a href="${url}" target="_blank">
                  <img src="${url}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px; border: 1px solid #e5e7eb; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                </a>
              `).join('')}
              ${(v.shop.docUrls || []).slice(1).map(url => `
                <a href="${url}" target="_blank">
                  <img src="${url}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px; border: 1px solid #e5e7eb; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                </a>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    if (!hasContent) {
      content += `
        <div style="text-align: center; padding: 40px; color: #94a3b8;">
           <i class="fas fa-folder-open" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.5;"></i>
           <p>No submitted verification data found explicitly (CNIC or Shop).</p>
        </div>
      `;
    }

    content += '</div></div>';
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

    // Professional Routing Filter: Only notify the target user's personal bell if they are NOT the auditor
    const auditorUid = auth.currentUser.uid;
    const auditorSnap = await db.ref('users/' + auditorUid).once('value');
    const auditorName = auditorSnap.val()?.name || auditorSnap.val()?.displayName || 'Administrator';

    if (userId !== auditorUid) {
      // Send Personal Notification to Seller
      await db.ref(`users/${userId}/notifications`).push({
        title: `${typeName} Approved`,
        message: `Congratulations! Your ${typeName.toLowerCase()} has been verified. ${type === 'shop' ? 'You can now start listing products as a Seller.' : ''}`,
        type: type === 'shop' ? 'shop' : 'verification',
        read: false,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });
    }

    // Always push to Global Admin Trail for professional logging
    try {
      await db.ref('global_notifications/admin_alerts').push({
        title: `${typeName} Verification Approved`,
        message: `${typeName} for user ID ${userId.substring(0, 6)}... has been approved by ${auditorName}.`,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        userId: userId,
        type: 'verification'
      });
    } catch (logError) {
      console.warn('⚠️ Non-critical: Failed to push to Admin Trail:', logError);
    }

    showSuccess(`${typeName} approved successfully`);

    // Manually update local instance for immediate modal feedback
    if (user && user.verification) {
      if (type === 'cnic' || !type) {
        user.verification.cnic.verified = true;
        user.verification.cnic.status = 'approved';
      }
      if (type === 'shop' || !type) {
        user.verification.shop.verified = true;
        user.verification.shop.status = 'approved';
      }
    }

    // Refresh modal instantly
    viewVerificationDetails(userId);

    // Refresh background data
    loadVerificationData();
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

    // Professional Routing Filter
    const auditorUid = auth.currentUser.uid;
    const auditorSnap = await db.ref('users/' + auditorUid).once('value');
    const auditorName = auditorSnap.val()?.name || auditorSnap.val()?.displayName || 'Administrator';

    if (userId !== auditorUid) {
      // Send Notification to User
      await db.ref(`users/${userId}/notifications`).push({
        title: `${typeName} Rejected`,
        message: `Your ${typeName.toLowerCase()} verification was rejected. Reason: ${reason}`,
        type: 'alert',
        read: false,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });
    }

    // Always push to Global Admin Trail
    await db.ref('global_notifications/admin_alerts').push({
      title: `${typeName} Verification Rejected`,
      message: `${typeName} rejection for user ID ${userId.substring(0, 6)}... by ${auditorName}. Reason: ${reason}`,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      userId: userId,
      type: 'alert'
    });

    showSuccess(`${typeName} rejected`);

    // Manually update local instance for immediate modal feedback
    if (user && user.verification) {
      if (type === 'cnic' || !type) {
        user.verification.cnic.verified = false;
        user.verification.cnic.status = 'rejected';
      }
      if (type === 'shop' || !type) {
        user.verification.shop.verified = false;
        user.verification.shop.status = 'rejected';
      }
    }

    // Refresh modal instantly
    viewVerificationDetails(userId);

    // Refresh background data
    loadVerificationData();
  } catch (error) {
    console.error('Error rejecting verification:', error);
    showError('Error rejecting verification: ' + error.message);
  }
};

// Load Logistics Data
async function loadLogisticsData() {
  try {
    showLoading('logistics');

    // The initLogisticsHub function from logistics-hub-engine.js 
    // handles real-time data sync for the pipeline, stats, and activity.
    if (window.initLogisticsHub) {
      window.initLogisticsHub();
    } else {
      console.warn('Logistics Hub Engine not loaded yet');
    }

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

    // 2. Load Withdrawals (Merging legacy 'withdrawals' and new 'withdrawal_requests')
    const syncWithdrawals = () => {
      const wNode1 = db.ref('withdrawals');
      const wNode2 = db.ref('withdrawal_requests');

      const processSnap = (snap1, snap2) => {
        const merged = new Map();

        if (snap1 && snap1.exists()) {
          snap1.forEach(child => merged.set(child.key, { id: child.key, ...child.val() }));
        }
        if (snap2 && snap2.exists()) {
          snap2.forEach(child => merged.set(child.key, { id: child.key, ...child.val() }));
        }

        const withdrawals = Array.from(merged.values());
        withdrawals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        adminData.withdrawals = withdrawals;
        renderWithdrawals(withdrawals);

        // Update Header Count for debugging/visibility
        const countHeader = document.querySelector('#withdrawalsTableBody').closest('.content-card')?.querySelector('h3');
        if (countHeader && countHeader.textContent.includes('Withdrawal Requests')) {
          countHeader.innerHTML = `Withdrawal Requests <span class="badge badge-info" style="font-size: 0.8rem; margin-left: 8px;">${withdrawals.length} Total</span>`;
        }

        updateWalletStats();
      };

      // Real-time synchronization from BOTH nodes
      wNode1.on('value', (s1) => {
        wNode2.once('value').then(s2 => processSnap(s1, s2));
      });
      wNode2.on('value', (s2) => {
        wNode1.once('value').then(s1 => processSnap(s1, s2));
      });
    };

    syncWithdrawals();

    // 3. Load Wallet Transactions
    db.ref('walletTransactions').limitToLast(50).on('value', (snapshot) => {
      const transactions = [];
      snapshot.forEach(child => {
        transactions.push({ id: child.key, ...child.val() });
      });
      adminData.transactions = transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      renderWalletTransactions();
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
    const userWalletRef = db.ref(`wallets/${deposit.userId}`);
    await userWalletRef.transaction(wallet => {
      if (!wallet) wallet = { available_balance: 0, total_deposited: 0, in_escrow: 0, total_withdrawn: 0 };
      wallet.available_balance = (wallet.available_balance || 0) + deposit.amount;
      wallet.total_deposited = (wallet.total_deposited || 0) + deposit.amount;
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
    await db.ref(`users/${deposit.userId}/notifications`).push({
      title: 'Deposit Approved',
      message: `Your deposit of RS ${deposit.amount} has been approved and added to your wallet.`,
      type: 'payment',
      read: false,
      timestamp: firebase.database.ServerValue.TIMESTAMP
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

    await db.ref(`users/${deposit.userId}/notifications`).push({
      title: 'Deposit Rejected',
      message: `Your deposit of RS ${deposit.amount} was rejected. Please check the details and try again.`,
      type: 'alert',
      read: false,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    showToast('Deposit rejected');
  } catch (error) {
    console.error('Error rejecting deposit:', error);
    showToast('Failed to reject deposit', 'error');
  } finally {
    showLoading(false);
  }
}

async function updateWalletStats() {
  try {
    const users = adminData.users || [];
    const deposits = adminData.deposits || [];
    const withdrawals = adminData.withdrawals || [];

    // 1. Total System Balance (Sum of all user wallets)
    let totalBalance = 0;
    try {
      const walletsSnap = await db.ref('wallets').once('value');
      if (walletsSnap.exists()) {
        walletsSnap.forEach(snap => {
          totalBalance += (snap.val().available_balance || 0);
        });
      }
    } catch (e) { }
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

function getStatusBadgeColor(status) {
  const s = (status || '').toLowerCase();
  switch (s) {
    case 'pending':
    case 'order placed':
    case 'placed':
      return 'warning';

    case 'sent_to_hub':
    case 'received_at_origin':
    case 'received at origin hub':
    case 'arrived_at_dest_hub':
    case 'at destination hub':
    case 'at_destination':
      return 'primary';

    case 'verified':
    case 'verified & sealed':
    case 'sealed':
    case 'delivered':
    case 'approved':
      return 'success';

    case 'in_transit':
    case 'in transit':
    case 'out_for_delivery':
    case 'out for delivery':
      return 'info';

    case 'disputed':
    case 'rejected':
      return 'danger';

    case 'cancelled':
    case 'dismissed':
      return 'secondary';

    default:
      return 'secondary';
  }
}

// Map technical IDs to human tracking labels
function formatOrderStatus(status) {
  const s = (status || '').toLowerCase();
  const mapping = {
    'pending': 'Order Placed',
    'placed': 'Order Placed',
    'sent_to_hub': 'Received at Origin Hub',
    'received_at_origin': 'Received at Origin Hub',
    'verified': 'Verified & Sealed',
    'sealed': 'Verified & Sealed',
    'in_transit': 'In Transit',
    'arrived_at_dest_hub': 'At Destination Hub',
    'at_destination': 'At Destination Hub',
    'out_for_delivery': 'Out for Delivery',
    'delivered': 'Delivered',
    'disputed': 'Disputed',
    'cancelled': 'Cancelled'
  };
  return mapping[s] || status || 'Order Placed';
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

function renderAdminCharts(data) {
  const indigo = '#4f46e5';
  const indigoLight = 'rgba(79, 70, 229, 0.1)';

  // Reset charts if they exist (to handle potential re-renders)
  const chartIds = ['revenueChart', 'userGrowthChart', 'categoryPieChart', 'disputeChart'];
  chartIds.forEach(id => {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();
  });

  // Revenue Trend Line Chart
  if (data.revenueTrend && data.revenueTrend.data.some(d => d > 0)) {
    document.getElementById('revenueNoData').style.display = 'none';
    new Chart(document.getElementById('revenueChart'), {
      type: 'line',
      data: {
        labels: data.revenueTrend.labels,
        datasets: [{
          label: 'Revenue (RS)',
          data: data.revenueTrend.data,
          borderColor: indigo,
          backgroundColor: indigoLight,
          fill: true,
          tension: 0.4
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  } else {
    document.getElementById('revenueNoData').style.display = 'flex';
  }

  // User Growth Bar Chart
  if (data.userGrowth && data.userGrowth.data.some(d => d > 0)) {
    document.getElementById('userGrowthNoData').style.display = 'none';
    new Chart(document.getElementById('userGrowthChart'), {
      type: 'bar',
      data: {
        labels: data.userGrowth.labels,
        datasets: [{
          label: 'New Users',
          data: data.userGrowth.data,
          backgroundColor: indigo
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  } else {
    document.getElementById('userGrowthNoData').style.display = 'flex';
  }

  // Category Pie Chart
  if (data.categories && data.categories.data.length > 0) {
    document.getElementById('categoryNoData').style.display = 'none';
    new Chart(document.getElementById('categoryPieChart'), {
      type: 'pie',
      data: {
        labels: data.categories.labels,
        datasets: [{
          data: data.categories.data,
          backgroundColor: ['#4f46e5', '#818cf8', '#c7d2fe', '#6366f1', '#4338ca', '#312e81', '#4f46e5', '#818cf8']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  } else {
    document.getElementById('categoryNoData').style.display = 'flex';
  }

  // Dispute Resolution (using summary data)
  if (data.summary && (data.summary.disputes > 0 || data.summary.users > 0)) {
    document.getElementById('disputeNoData').style.display = 'none';
    new Chart(document.getElementById('disputeChart'), {
      type: 'doughnut',
      data: {
        labels: ['Active Disputes', 'Total Users'],
        datasets: [{
          data: [data.summary.disputes, data.summary.users],
          backgroundColor: ['#ef4444', '#10b981']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  } else {
    document.getElementById('disputeNoData').style.display = 'flex';
  }
}

// Load Settings Data
async function loadSettingsData() {

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
function updateUsersTable(searchTerm = null) {
  const tableBody = document.querySelector('#usersTable tbody');
  if (!tableBody) return;

  // Sync with global state if provided via direct call
  if (searchTerm !== null) {
    adminData.currentSearch.users = searchTerm;
  }

  const query = (adminData.currentSearch.users || "").toLowerCase().trim();

  // Filter Data based on query
  const filteredUsers = adminData.users.filter(user => {
    const name = (user.displayName || user.name || user.fullName || user.username || "").toLowerCase();
    const email = (user.email || "").toLowerCase();
    const role = (user.role || "").toLowerCase();
    const id = (user.id || "").toLowerCase();

    return name.includes(query) || email.includes(query) || role.includes(query) || id.includes(query);
  });

  if (filteredUsers.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center">No users matching search found</td>
      </tr>
    `;
    return;
  }

  // Sort filtered users: Admins first
  const sortedUsers = [...filteredUsers].sort((a, b) => {
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
        <button class="btn btn-sm btn-primary user-alert-btn" 
                data-user-id="${user.id}" 
                data-user-name="${displayName.replace(/"/g, '&quot;').replace(/'/g, '&apos;')}" 
                onclick="openUserAlertModal('${user.id}', this.getAttribute('data-user-name'))"
                title="Send Alert">
            <i class="fas fa-bell"></i>
        </button>
        <button class="btn btn-sm btn-secondary" onclick="editUser('${user.id}')" title="Edit User">
            <i class="fas fa-edit"></i>
        </button>
      </td>
    </tr>
  `}).join('');
}

// Update Orders Table
async function updateOrdersTable(searchTerm) {
  const tableBody = document.querySelector('#ordersTable tbody');
  if (!tableBody) return;

  // Sync state if passed directly
  if (searchTerm !== undefined) adminData.currentSearch.orders = searchTerm;
  const query = (adminData.currentSearch.orders || "").toLowerCase().trim();
  const statusFilter = (adminData.currentSearch.orderStatus || "").toLowerCase().trim();

  let filteredOrders = adminData.orders || [];

  // 1. Apply Search Filter
  if (query) {
    filteredOrders = filteredOrders.filter(order => {
      const id = (order.id || "").toLowerCase();
      const buyerName = (order.buyer ? order.buyer.name : (order.buyerName || "")).toLowerCase();
      const buyerEmail = (order.buyer ? order.buyer.email : (order.buyerEmail || "")).toLowerCase();
      const sellerName = (order.sellerName || "").toLowerCase();
      const statusText = (order.status || "").toLowerCase();
      const tracking = (order.trackingNumber || "").toLowerCase();

      return id.includes(query) ||
        buyerName.includes(query) ||
        buyerEmail.includes(query) ||
        sellerName.includes(query) ||
        statusText.includes(query) ||
        tracking.includes(query);
    });
  }

  // 2. Apply Status Filter
  if (statusFilter) {
    filteredOrders = filteredOrders.filter(order => {
      const status = (order.status || "").toLowerCase();
      return status === statusFilter;
    });
  }

  if (filteredOrders.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center">${query ? 'No matching orders found' : 'No orders found'}</td>
      </tr>
    `;
    return;
  }

  // Show loading state in table
  tableBody.innerHTML = '<tr><td colspan="9" class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading order details...</td></tr>';

  const rows = await Promise.all(filteredOrders.map(async (order) => {
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
    <tr data-status="${(order.status || 'pending').toLowerCase()}">
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
      <td><span class="badge badge-${getStatusBadgeColor(order.status)}">${formatOrderStatus(order.status)}</span></td>
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
            <span style="color: #6b7280;">Status:</span> <span><span class="badge badge-${getStatusBadgeColor(order.status)}">${formatOrderStatus(order.status)}</span></span>
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
// Update Products Table
function updateProductsTable(searchTerm = null, categoryFilter = null) {
  const tableBody = document.querySelector('#productsTable tbody');
  if (!tableBody) return;

  // Sync with global state if provided via direct call
  if (searchTerm !== null) adminData.currentSearch.products = searchTerm;
  if (categoryFilter !== null) adminData.currentSearch.category = categoryFilter;

  const query = (adminData.currentSearch.products || "").toLowerCase().trim();
  const cat = (adminData.currentSearch.category || "").toLowerCase().trim();

  // Filter Data
  const filteredProducts = adminData.products.filter(product => {
    const name = (product.name || "").toLowerCase();
    const id = (product.id || "").toLowerCase();
    const category = (product.category || "").toLowerCase();
    const description = (product.description || "").toLowerCase();

    const matchesSearch = !query || name.includes(query) || id.includes(query) || description.includes(query);
    const matchesCat = !cat || category === cat;

    return matchesSearch && matchesCat;
  });

  if (filteredProducts.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center">No products found matching your criteria</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filteredProducts.map((product, index) => {
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
function updateDisputesTable(searchTerm) {
  const tableBody = document.querySelector('#disputesTable tbody');
  if (!tableBody) return;

  // Sync state if passed directly
  if (searchTerm !== undefined) adminData.currentSearch.disputes = searchTerm;
  const query = (adminData.currentSearch.disputes || "").toLowerCase().trim();
  const statusFilter = (adminData.currentSearch.disputeStatus || "").toLowerCase().trim();

  let disputes = adminData.disputes || [];

  // 1. Apply status filter
  if (statusFilter) {
    disputes = disputes.filter(d => (d.status || "").toLowerCase() === statusFilter);
  }

  // 2. Apply search filter
  if (query) {
    disputes = disputes.filter(d => {
      const id = (d.id || "").toLowerCase();
      const orderId = (d.orderId || "").toLowerCase();
      const issue = (d.issue || d.reason || "").toLowerCase();
      const complainant = (d.complainantName || "").toLowerCase();
      return id.includes(query) || orderId.includes(query) || issue.includes(query) || complainant.includes(query);
    });
  }

  if (disputes.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center">${query || statusFilter ? 'No matching disputes found' : 'No active disputes found'}</td>
      </tr>
    `;
    return;
  }

  // Helper for priority color
  const getPriorityClass = (priority) => {
    if (!priority) return 'badge-secondary';
    const p = priority.toLowerCase();
    if (p === 'high' || p === 'critical') return 'badge-danger';
    if (p === 'medium') return 'badge-warning';
    return 'badge-info';
  };

  tableBody.innerHTML = disputes.map(dispute => {
    const date = dispute.createdAt ? new Date(dispute.createdAt).toLocaleDateString() : 'N/A';
    const statusClass = (dispute.status || 'open').toLowerCase().replace(' ', '-');

    return `
    <tr>
      <td>#${dispute.id.substring(0, 8)}</td>
      <td><a href="#" onclick="viewOrder('${dispute.orderId}'); return false;">#${dispute.orderId ? dispute.orderId.substring(0, 8) : 'N/A'}</a></td>
      <td>
        <div style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${dispute.issue || dispute.reason || 'N/A'}">
          ${dispute.issue || dispute.reason || 'N/A'}
        </div>
      </td>
      <td><span class="badge ${getPriorityClass(dispute.priority)}">${(dispute.priority || 'Medium').toUpperCase()}</span></td>
      <td><span class="status-badge ${statusClass}">${(dispute.status || 'Open').toUpperCase()}</span></td>
      <td>${date}</td>
      <td>
        <div style="display: flex; gap: 8px;">
            <button class="btn btn-sm btn-primary" onclick="viewDispute('${dispute.id}')" title="View Details">
                <i class="fas fa-eye"></i>
            </button>
            ${(dispute.status || 'open').toLowerCase() !== 'resolved' ? `
            <button class="btn btn-sm btn-success" onclick="resolveDispute('${dispute.id}')" title="Resolve Dispute">
                <i class="fas fa-gavel"></i>
            </button>
            ` : ''}
        </div>
      </td>
    </tr>
  `}).join('');
}

// Update Transactions Table


// Update Escrow Table (Removed duplicate)
// See main definition above



// Update Logistics Providers
// Legacy Logistics Update functions removed per mirrored Hub implementation

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

}

function hideLoading(section) {

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

  // Event Delegation for Withdrawal Actions
  document.addEventListener('click', async (e) => {
    // Handle withdrawal action buttons
    if (e.target.closest('.withdrawal-action-btn')) {
      const btn = e.target.closest('.withdrawal-action-btn');
      const action = btn.getAttribute('data-action');
      const requestId = btn.getAttribute('data-id');
      const userId = btn.getAttribute('data-uid');

      if (!requestId) return;

      switch (action) {
        case 'view':
          await openWithdrawalView(requestId);
          break;
        case 'approve':
          await openWithdrawalApprove(requestId);
          break;
        case 'reject':
          await openWithdrawalReject(requestId);
          break;
      }
    }

    // Handle view user links
    if (e.target.closest('.view-user-link')) {
      e.preventDefault();
      const link = e.target.closest('.view-user-link');
      const userId = link.getAttribute('data-user-id');
      if (userId) viewUser(userId);
    }

  });
}

// Search and Filter Functions
// Unified Search Router (State-Aware)
function handleSearch(e) {
  const searchTerm = e.target.value;
  const id = e.target.id;
  const query = searchTerm.toLowerCase().trim();

  // 1. Update Global State
  if (id === 'userSearch') adminData.currentSearch.users = searchTerm;
  else if (id === 'productSearch') adminData.currentSearch.products = searchTerm;
  else if (id === 'orderSearch') adminData.currentSearch.orders = searchTerm;
  else if (id === 'staffSearch') adminData.currentSearch.staff = searchTerm;
  else if (id === 'escrowSearch') adminData.currentSearch.escrow = searchTerm;
  else if (id === 'disputeSearch') adminData.currentSearch.disputes = searchTerm;
  else if (id === 'verificationSearch') adminData.currentSearch.verification = searchTerm;
  else if (id === 'walletSearch') adminData.currentSearch.transactions = searchTerm;

  // 2. Specialized Rendering Calls
  if (id === 'userSearch') {
    updateUsersTable(searchTerm);
  } else if (id === 'productSearch') {
    updateProductsTable(searchTerm);
  } else if (id === 'orderSearch') {
    updateOrdersTable(searchTerm);
  } else if (id === 'staffSearch') {
    updateStaffTable(searchTerm);
  } else if (id === 'verificationSearch') {
    if (window.updateVerificationTable) updateVerificationTable(searchTerm);
  } else if (id === 'escrowSearch') {
    updateEscrowTable(searchTerm);
  } else if (id === 'disputeSearch') {
    updateDisputesTable(searchTerm);
  } else if (id === 'walletSearch') {
    renderWalletTransactions(searchTerm);
  } else {
    // Generic Row-Hiding Fallback for unhandled sections
    const tableId = id.replace('Search', 'Table');
    const tableMapping = {
      'userTable': 'usersTable',
      'productTable': 'productsTable',
      'transactionTable': 'transactionsTable'
    };
    const targetId = tableMapping[tableId] || tableId;
    const table = document.getElementById(targetId);
    if (table) {
      const rows = table.querySelectorAll('tbody tr');
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
      });
    }
  }
}

function handleFilter(e) {
  const filterValue = e.target.value.toLowerCase().trim();
  const id = e.target.id;

  if (id === 'categoryFilter') {
    adminData.currentSearch.category = filterValue;
    updateProductsTable();
    return;
  }

  if (id === 'orderStatusFilter') {
    adminData.currentSearch.orderStatus = filterValue;
    updateOrdersTable();
    return;
  }

  if (id === 'escrowStatusFilter') {
    adminData.currentSearch.escrowStatus = filterValue;
    updateEscrowTable();
    return;
  }

  if (id === 'disputeStatusFilter') {
    adminData.currentSearch.disputeStatus = filterValue;
    updateDisputesTable();
    return;
  }

  // Generic Row-Hiding Fallback for other sections (Users, Transactions etc if they have basic filters)
  const tableId = id.replace('Filter', 'Table');
  const targetId = {
    'userTable': 'usersTable',
    'productTable': 'productsTable',
    'transactionTable': 'transactionsTable'
  }[tableId] || tableId;

  const table = document.getElementById(targetId);
  if (!table) return;

  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    if (!filterValue) {
      row.style.display = '';
      return;
    }

    const dataStatus = row.getAttribute('data-status');
    const statusCell = row.querySelector('.status-badge');
    const statusText = dataStatus || (statusCell ? statusCell.textContent.toLowerCase() : '');

    row.style.display = statusText.includes(filterValue) ? '' : 'none';
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
window.viewUser = async function (userId) {
  let user = adminData.users.find(u => u.id === userId);

  if (!user) {
    try {
      showLoading('users');
      const snap = await db.ref('users/' + userId).once('value');
      if (snap.exists()) {
        user = { id: snap.key, ...snap.val() };
      } else {
        showSuccess('User record not found in system.');
        return;
      }
    } catch (e) {
      console.error(e);
      return;
    } finally {
      hideLoading('users');
    }
  }

  const modal = document.getElementById('userDetailModal');
  if (!modal) return;

  // Populate Fields
  document.getElementById('uDetName').innerText = user.fullName || user.displayName || user.name || 'Unknown User';
  document.getElementById('uDetEmail').innerText = user.email || 'No email provided';
  document.getElementById('uDetId').innerText = user.id;
  document.getElementById('uDetPhone').innerText = user.phone || 'N/A';

  const role = user.role || 'User';
  const roleEl = document.getElementById('uDetRole');
  if (roleEl) {
    roleEl.innerText = role;
    roleEl.className = `badge ${role === 'Admin' ? 'badge-danger' : (role === 'Staff' ? 'badge-info' : 'badge-success')}`;
  }

  document.getElementById('uDetJoined').innerText = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A';
  document.getElementById('uDetAddress').innerText = user.address || (user.verification?.shop?.address) || 'No verified address on file.';

  const avatarImg = document.getElementById('uDetAvatar');
  if (avatarImg) {
    const displayName = user.fullName || user.displayName || user.name || 'User';
    const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random&color=fff&size=128`;
    avatarImg.src = user.profileImage || user.photoURL || fallbackAvatar;
  }

  // KYC Evidence Logic
  const kycGrid = document.getElementById('uDetKycGrid');
  const v = user.verification || {};
  let kycHtml = '';

  if (v.cnic) {
    if (v.cnic.frontUrl) kycHtml += `
      <div style="background: #f1f5f9; padding: 12px; border-radius: 12px; text-align: center;">
        <p style="font-size: 10px; font-weight: 700; color: #64748b; margin-bottom: 8px;">CNIC FRONT</p>
        <a href="${v.cnic.frontUrl}" target="_blank"><img src="${v.cnic.frontUrl}" style="width: 100%; height: 80px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0;"></a>
      </div>`;
    if (v.cnic.backUrl) kycHtml += `
      <div style="background: #f1f5f9; padding: 12px; border-radius: 12px; text-align: center;">
        <p style="font-size: 10px; font-weight: 700; color: #64748b; margin-bottom: 8px;">CNIC BACK</p>
        <a href="${v.cnic.backUrl}" target="_blank"><img src="${v.cnic.backUrl}" style="width: 100%; height: 80px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0;"></a>
      </div>`;
  }

  if (v.selfie?.url) kycHtml += `
      <div style="background: #f1f5f9; padding: 12px; border-radius: 12px; text-align: center;">
        <p style="font-size: 10px; font-weight: 700; color: #64748b; margin-bottom: 8px;">LIVE SELFIE</p>
        <a href="${v.selfie.url}" target="_blank"><img src="${v.selfie.url}" style="width: 100%; height: 80px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0;"></a>
      </div>`;

  if (v.shop?.documentUrl) kycHtml += `
      <div style="background: #f1f5f9; padding: 12px; border-radius: 12px; text-align: center;">
        <p style="font-size: 10px; font-weight: 700; color: #64748b; margin-bottom: 8px;">SHOP DOC</p>
        <a href="${v.shop.documentUrl}" target="_blank"><img src="${v.shop.documentUrl}" style="width: 100%; height: 80px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0;"></a>
      </div>`;

  if (kycGrid) kycGrid.innerHTML = kycHtml || '<p style="grid-column: 1/-1; color: #94a3b8; font-size: 13px;">No KYC intelligence assets submitted yet.</p>';

  // Audit Pulse Stats
  const pulse = document.getElementById('uDetPulse');
  if (pulse) {
    let statusColor = '#94a3b8';
    let statusText = 'UNVERIFIED';

    if (v.cnic?.verified || v.shop?.verified) { statusColor = '#10b981'; statusText = 'OFFICIALLY VERIFIED'; }
    else if (v.cnic?.submitted || v.shop?.submitted) { statusColor = '#f59e0b'; statusText = 'PENDING REVIEW'; }

    pulse.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
         <div style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; box-shadow: 0 0 10px ${statusColor};"></div>
         <span style="font-size: 11px; font-weight: 900; color: ${statusColor}; letter-spacing: 0.05em;">${statusText}</span>
      </div>
      <div style="margin-top: 10px;">
         <span style="display: block; font-size: 10px; color: #94a3b8;">Trust Score</span>
         <div style="height: 4px; background: #f1f5f9; border-radius: 2px; margin-top: 4px;">
            <div style="width: ${statusText === 'OFFICIALLY VERIFIED' ? '100%' : '30%'}; height: 100%; background: ${statusColor}; border-radius: 2px;"></div>
         </div>
      </div>
    `;
  }

  modal.style.display = 'block';
};

window.closeUserDetailModal = function () {
  const modal = document.getElementById('userDetailModal');
  if (modal) modal.style.display = 'none';
};
function viewOrderDetails(orderId) {
  window.open(`orderstatus.html?orderId=${orderId}`, '_blank');
}
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
function viewTransaction(id) { alert('Viewing transaction Details: ' + id); }
if (typeof viewDispute === 'function') window.viewDispute = viewDispute;
if (typeof resolveDispute === 'function') window.resolveDispute = resolveDispute;
if (typeof viewTransaction === 'function') window.viewTransaction = viewTransaction;
if (typeof viewEscrow === 'function') window.viewEscrow = viewEscrow;
if (typeof releaseEscrow === 'function') window.releaseEscrow = releaseEscrow;

async function resolveDispute(id) {
  const outcome = prompt('Select Arbitration Outcome:\n(e.g., refund_buyer, release_seller, replace_item)');
  if (!outcome) return;

  const comments = prompt('Enter official Arbitration resolution summary (Mandatory):');
  if (!comments) return;

  if (!confirm(`Are you sure you want to enforce this resolution?\nOutcome: ${outcome}`)) return;

  try {
    const db = firebase.database();
    await db.ref(`disputes/${id}`).update({
      status: 'resolved',
      outcome: outcome.toLowerCase(),
      resolution: comments,
      resolvedBy: 'Admin',
      resolvedAt: firebase.database.ServerValue.TIMESTAMP
    });

    const dispSnap = await db.ref(`disputes/${id}`).once('value');
    const disp = dispSnap.val();

    if (disp) {
      const notifData = {
        title: 'Dispute Arbitration Concluded',
        message: `The arbitration for order #${(disp.orderId || '').slice(-6)} is complete. Outcome: ${outcome.toUpperCase()}.\nAdmin Notes: ${comments}`,
        type: 'alert',
        read: false,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      };

      if (disp.buyerId && disp.buyerId !== 'unknown') await db.ref(`users/${disp.buyerId}/notifications`).push(notifData);
      if (disp.sellerId && disp.sellerId !== 'unknown') await db.ref(`users/${disp.sellerId}/notifications`).push(notifData);
      if (disp.orderId) await db.ref(`orders/${disp.orderId}`).update({ status: 'dispute_resolved', disputeOutcome: outcome });
    }

    if (window.NotificationManager) {
      window.NotificationManager.showToast('Dispute Resolved', 'The arbitration ruling has been securely enforced.', 'success');
    } else {
      alert('Arbitration ruling successfully enforced.');
    }
  } catch (e) {
    console.error('Arbitration Error:', e);
    alert('Critical error while enforcing resolution. See console.');
  }
}
// assignments moved up and guarded

// Logout Function
window.logout = async function () {
  try {


    // 1. Sign out the primary instance
    if (auth) {
      await auth.signOut();
    }

    // 2. Explicitly sign out AdminPanel app if it exists
    try {
      const adminApp = firebase.app("AdminPanel");
      if (adminApp) {
        await adminApp.auth().signOut();

      }
    } catch (e) {

    }

    // 3. Sign out default app just in case
    try {
      await firebase.auth().signOut();

    } catch (e) {

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

// Render Withdrawals Table with Event Delegation Support
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
    const requestId = w.id ? w.id.substring(1, 8).toUpperCase() : String(index + 1).padStart(3, '0');
    const userDisplayId = getUserDisplayId(w.userId);

    // Use data attributes for event delegation
    const viewBtn = w.status === 'pending' ? `
      <button class="btn btn-sm btn-outline-primary withdrawal-action-btn"
              data-action="view"
              data-id="${w.id}"
              data-uid="${w.userId}"
              title="View">
        <i class="fas fa-eye"></i>
      </button>` : `
      <button class="btn btn-sm btn-outline-secondary withdrawal-action-btn"
              data-action="view"
              data-id="${w.id}"
              data-uid="${w.userId}"
              title="View">
        <i class="fas fa-eye"></i>
      </button>`;

    const actionButtons = w.status === 'pending' ? `
      <div class="d-flex gap-1">
        ${viewBtn}
        <button class="btn btn-sm btn-success withdrawal-action-btn"
                data-action="approve"
                data-id="${w.id}"
                data-uid="${w.userId}"
                title="Approve">
          <i class="fas fa-check"></i>
        </button>
        <button class="btn btn-sm btn-danger withdrawal-action-btn"
                data-action="reject"
                data-id="${w.id}"
                data-uid="${w.userId}"
                title="Reject">
          <i class="fas fa-times"></i>
        </button>
      </div>` : viewBtn;

    return `
    <tr>
      <td>#${requestId}</td>
      <td>
        <div class="d-flex align-items-center">
            <div>
                <div class="fw-bold">${w.userName || 'Unknown'}</div>
                <div class="text-muted small">
                    <a href="#" class="view-user-link" data-user-id="${w.userId}" style="text-decoration: none; color: #667eea; font-weight: 600;">
                        ${userDisplayId}
                    </a>
                </div>
            </div>
        </div>
      </td>
      <td>RS ${parseFloat(w.amount || 0).toLocaleString()}</td>
      <td>${w.method || 'Bank Transfer'}</td>
      <td>${w.details || '-'}</td>
      <td><span class="badge badge-${w.status === 'approved' ? 'success' : w.status === 'rejected' ? 'danger' : 'warning'}">${w.status}</span></td>
      <td>${new Date(w.createdAt).toLocaleDateString()}</td>
      <td>${actionButtons}</td>
    </tr>
  `}).join('');
}

// Render Wallet Transactions Table
function renderWalletTransactions(searchTerm) {
  const tbody = document.getElementById('walletTransactionsTableBody');
  if (!tbody) return;

  // Sync state if passed directly
  if (searchTerm !== undefined) adminData.currentSearch.transactions = searchTerm;
  const query = (adminData.currentSearch.transactions || "").toLowerCase().trim();

  let transactions = adminData.transactions || [];

  // Apply search filter
  if (query) {
    transactions = transactions.filter(t => {
      const id = (t.id || "").toLowerCase();
      const user = (t.userName || t.user || "").toLowerCase();
      const type = (t.type || t.title || "").toLowerCase();
      const status = (t.status || "").toLowerCase();
      const amount = (t.amount || "").toString();

      return id.includes(query) || user.includes(query) || type.includes(query) || status.includes(query) || amount.includes(query);
    });
  }

  const displayList = transactions.slice(0, 50);

  if (displayList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">${query ? 'No matching transactions' : 'No recent transactions'}</td></tr>`;
    return;
  }

  tbody.innerHTML = displayList.map(t => {
    const status = t.status || 'completed';
    const statusClass = status === 'approved' || status === 'completed' || status === 'success' ? 'success' :
      status === 'rejected' || status === 'failed' ? 'danger' : 'warning';

    return `
      <tr>
        <td>#${t.id ? t.id.substring(0, 6) : 'N/A'}</td>
        <td>${t.userName || t.user || 'Unknown'}</td>
        <td>${t.type || t.title || 'Transaction'}</td>
        <td>RS ${(t.amount || 0).toLocaleString()}</td>
        <td><span class="badge badge-${statusClass}">${status}</span></td>
        <td>${t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'N/A'}</td>
      </tr>
    `;
  }).join('');
}

// Approve Withdrawal
async function approveWithdrawal(id) {
  if (!await showConfirmationModal('Approve Withdrawal', 'Are you sure you want to approve this withdrawal?', { confirmText: 'Approve', confirmColor: '#28a745' })) return;
  try {
    await db.ref('withdrawal_requests/' + id).update({ status: 'approved', processedAt: firebase.database.ServerValue.TIMESTAMP });
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
    const withdrawalSnap = await db.ref('withdrawal_requests/' + id).once('value');
    if (!withdrawalSnap.exists()) {
      throw new Error('Withdrawal request not found');
    }
    const withdrawal = withdrawalSnap.val();

    if (withdrawal.status !== 'pending') {
      throw new Error('Withdrawal request is not pending');
    }

    // 2. Refund amount to user wallet
    const userWalletRef = db.ref('wallets/' + withdrawal.userId);
    await userWalletRef.transaction(wallet => {
      if (!wallet) wallet = { available_balance: 0, in_escrow: 0, total_withdrawn: 0 };
      wallet.available_balance = (wallet.available_balance || 0) + parseFloat(withdrawal.amount);
      wallet.in_escrow = Math.max(0, (wallet.in_escrow || 0) - parseFloat(withdrawal.amount));
      return wallet;
    });

    // 3. Update withdrawal status
    await db.ref('withdrawal_requests/' + id).update({
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

// ==================== WITHDRAWAL MODAL FUNCTIONS ====================

// currentWithdrawalId declared at top level
let currentWithdrawalData = null;
let currentWithdrawalCollection = 'withdrawal_requests'; // Tracks which collection the current withdrawal is from

// Helper function to get withdrawal data from either collection
async function getWithdrawalData(requestId) {
  // Try withdrawal_requests first
  let snapshot = await db.ref('withdrawal_requests/' + requestId).once('value');
  if (snapshot.exists()) {
    return { data: snapshot.val(), collection: 'withdrawal_requests' };
  }

  // Fall back to withdrawals collection
  snapshot = await db.ref('withdrawals/' + requestId).once('value');
  if (snapshot.exists()) {
    const data = snapshot.val();
    // Migrate to withdrawal_requests for compatibility with new API
    await db.ref('withdrawal_requests/' + requestId).set(data);
    // Optionally remove from old collection (or keep as backup)
    // await db.ref('withdrawals/' + requestId).remove();
    return { data: data, collection: 'withdrawal_requests' };
  }

  return null;
}

// Open View Modal
async function openWithdrawalView(requestId) {
  try {
    const result = await getWithdrawalData(requestId);
    if (!result) {
      showError('Withdrawal request not found');
      return;
    }
    const { data, collection } = result;
    currentWithdrawalId = requestId;
    currentWithdrawalData = data;
    currentWithdrawalCollection = collection;

    // Fetch user's current balance
    let balance = '-';
    if (data.userId) {
      const walletSnap = await db.ref('wallets/' + data.userId).once('value');
      const wallet = walletSnap.val();
      balance = wallet ? 'RS ' + (wallet.available_balance || 0).toLocaleString() : 'RS 0';
    }

    // Populate modal
    document.getElementById('viewUserName').textContent = data.userName || 'Unknown';
    document.getElementById('viewAmount').textContent = 'RS ' + parseFloat(data.amount || 0).toLocaleString();
    document.getElementById('viewAccountTitle').textContent = data.bankDetails?.title || '-';
    document.getElementById('viewBankName').textContent = data.bankDetails?.bankName || '-';
    document.getElementById('viewAccountNumber').textContent = data.bankDetails?.accountNumber || '-';
    document.getElementById('viewCurrentBalance').textContent = balance;
    document.getElementById('viewRequestId').textContent = '#' + requestId;
    
    const statusEl = document.getElementById('viewStatus');
    const status = (data.status || 'pending').toLowerCase();
    statusEl.textContent = status.toUpperCase();
    
    // Premium Status Styling
    if (status === 'approved' || status === 'completed') {
      statusEl.style.background = '#dcfce7';
      statusEl.style.color = '#166534';
    } else if (status === 'rejected' || status === 'failed') {
      statusEl.style.background = '#fee2e2';
      statusEl.style.color = '#991b1b';
    } else {
      statusEl.style.background = '#fef3c7';
      statusEl.style.color = '#92400e';
    }
    
    document.getElementById('viewRequestDate').textContent = new Date(data.createdAt).toLocaleString();

    // Show modal
    document.getElementById('withdrawalViewModal').style.display = 'block';
  } catch (error) {
    console.error('Error opening view modal:', error);
    showError('Failed to load withdrawal details');
  }
}

// Open Approve Modal
async function openWithdrawalApprove(requestId) {
  try {
    const result = await getWithdrawalData(requestId);
    if (!result) {
      showError('Withdrawal request not found');
      return;
    }
    const { data, collection } = result;
    if (data.status !== 'pending') {
      showError('Withdrawal request is not pending');
      return;
    }
    currentWithdrawalId = requestId;
    currentWithdrawalData = data;
    currentWithdrawalCollection = collection;

    // Fetch user's current balance
    let balance = '-';
    if (data.userId) {
      const walletSnap = await db.ref('wallets/' + data.userId).once('value');
      const wallet = walletSnap.val();
      balance = 'RS ' + (wallet?.available_balance || 0).toLocaleString();
    }

    // Populate modal
    document.getElementById('approveUserName').textContent = data.userName || 'Unknown';
    document.getElementById('approveAmount').textContent = 'RS ' + parseFloat(data.amount || 0).toLocaleString();
    document.getElementById('approveCurrentBalance').textContent = balance;
    document.getElementById('approveBankDetails').textContent = `${data.bankDetails?.bankName || ''} - ${data.bankDetails?.title || ''} (${data.bankDetails?.accountNumber || ''})`;
    // Reset file input and note
    document.getElementById('proofUpload').value = '';
    document.getElementById('adminNote').value = '';

    // Show modal
    document.getElementById('withdrawalApproveModal').style.display = 'block';
  } catch (error) {
    console.error('Error opening approve modal:', error);
    showError('Failed to load withdrawal details');
  }
}

// Open Reject Modal
async function openWithdrawalReject(requestId) {
  try {
    const result = await getWithdrawalData(requestId);
    if (!result) {
      showError('Withdrawal request not found');
      return;
    }
    const { data, collection } = result;
    if (data.status !== 'pending') {
      showError('Withdrawal request is not pending');
      return;
    }
    currentWithdrawalId = requestId;
    currentWithdrawalData = data;
    currentWithdrawalCollection = collection;

    // Populate modal
    document.getElementById('rejectUserName').textContent = data.userName || 'Unknown';
    document.getElementById('rejectAmount').textContent = 'RS ' + parseFloat(data.amount || 0).toLocaleString();
    document.getElementById('rejectReason').value = '';

    // Show modal
    document.getElementById('withdrawalRejectModal').style.display = 'block';
  } catch (error) {
    console.error('Error opening reject modal:', error);
    showError('Failed to load withdrawal details');
  }
}

// Close modals
function closeWithdrawalViewModal() {
  document.getElementById('withdrawalViewModal').style.display = 'none';
}
function closeWithdrawalApproveModal() {
  document.getElementById('withdrawalApproveModal').style.display = 'none';
}
function closeWithdrawalRejectModal() {
  document.getElementById('withdrawalRejectModal').style.display = 'none';
}

// Process Withdrawal Approval (upload image & call API)
async function processWithdrawalApproval() {
  const fileInput = document.getElementById('proofUpload');
  const file = fileInput.files[0];
  if (!file) {
    showError('Please upload a payment screenshot');
    return;
  }

  const adminNote = document.getElementById('adminNote').value.trim();
  const requestId = currentWithdrawalId;
  if (!requestId || !currentWithdrawalData) {
    showError('No withdrawal selected');
    return;
  }

  try {
    showLoading(true);
    // 1. Upload image to Firebase Storage (use 'withdrawals' path for compatibility with storage rules)
    const timestamp = Date.now();
    const filename = `withdrawals/${requestId}/${timestamp}_${file.name}`;
    const storageRef = firebase.storage().ref(filename);
    const uploadTask = await storageRef.put(file);
    const proofUrl = await uploadTask.ref.getDownloadURL();

    // 2. Call approve-payout API
    const idToken = await firebase.auth().currentUser.getIdToken();
    const response = await fetch('/api/v1/wallet/approve-payout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        requestId: requestId,
        proofUrl: proofUrl,
        adminNote: adminNote,
        staffId: auth.currentUser?.uid || 'Admin'
      })
    });

    const result = await response.json();
    if (result.success) {
      showSuccess('Withdrawal approved and payout completed');
      closeWithdrawalApproveModal();
      // Refresh withdrawals table
      if (adminData.withdrawals) {
        renderWithdrawals(adminData.withdrawals);
      }
    } else {
      showError(result.error || 'Failed to approve payout');
    }
  } catch (error) {
    console.error('Approval error:', error);
    showError('Approval failed: ' + error.message);
  } finally {
    showLoading(false);
  }
}

// Process Withdrawal Rejection
async function processWithdrawalRejection() {
  const reason = document.getElementById('rejectReason').value.trim();
  if (!reason) {
    showError('Please provide a reason for rejection');
    return;
  }
  const requestId = currentWithdrawalId;
  if (!requestId || !currentWithdrawalData) {
    showError('No withdrawal selected');
    return;
  }

  try {
    showLoading(true);
    // Call existing reject-withdrawal endpoint
    const idToken = await firebase.auth().currentUser.getIdToken();
    const response = await fetch('/api/v1/wallet/reject-withdrawal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        requestId: requestId,
        reason: reason,
        staffId: auth.currentUser?.uid || 'Admin'
      })
    });

    const result = await response.json();
    if (result.success) {
      showSuccess('Withdrawal rejected and funds returned');
      closeWithdrawalRejectModal();
      // Refresh withdrawals table
      if (adminData.withdrawals) {
        renderWithdrawals(adminData.withdrawals);
      }
    } else {
      showError(result.error || 'Failed to reject withdrawal');
    }
  } catch (error) {
    console.error('Rejection error:', error);
    showError('Rejection failed: ' + error.message);
  } finally {
    showLoading(false);
  }
}

// Override old approve/reject functions to open modals (for backward compatibility)
window.approveWithdrawal = openWithdrawalApprove;
window.rejectWithdrawal = openWithdrawalReject;

// Filter Withdrawals removed (duplicate)

// Export Wallet Data
window.exportWalletData = async function () {
  try {
    const snapshot = await db.ref('withdrawal_requests').once('value');
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

// ========================================
// NOTIFICATION BROADCAST SYSTEM
// ========================================


window.openBroadcastModal = function () {
  document.getElementById('broadcastModal').style.display = 'block';
  document.getElementById('broadcastProgress').style.display = 'none';
};

window.closeBroadcastModal = function () {
  document.getElementById('broadcastModal').style.display = 'none';
};



window.sendBroadcast = async function () {
  const target = document.getElementById('broadcastTarget').value;
  const type = document.getElementById('broadcastType').value;
  const title = document.getElementById('broadcastTitle').value.trim();
  const message = document.getElementById('broadcastMessage').value.trim();

  if (!title || !message) {
    showError('Please provide both a title and message');
    return;
  }

  const btn = document.getElementById('btnSendBroadcast');
  const progressDiv = document.getElementById('broadcastProgress');
  const progressBar = document.getElementById('broadcastProgressBar');
  const statusText = document.getElementById('broadcastStatus');

  btn.disabled = true;
  progressDiv.style.display = 'block';

  try {
    const auditorUid = firebase.auth().currentUser.uid;
    const auditorSnap = await db.ref('users/' + auditorUid).once('value');
    const auditorName = auditorSnap.val()?.name || auditorSnap.val()?.displayName || 'Administrator';

    // Fetch users based on target
    let usersToNotify = [];
    const snapshot = await db.ref('users').once('value');
    const allUsers = snapshot.val();

    if (allUsers) {
      Object.entries(allUsers).forEach(([uid, data]) => {
        // Professional Routing Filter: Don't broadcast to yourself
        if (uid === auditorUid) return;

        let shouldNotify = false;
        if (target === 'all') shouldNotify = true;
        else if (target === 'seller' && (data.role === 'Seller' || data.role === 'seller')) shouldNotify = true;
        else if (target === 'staff' && (data.role === 'Staff' || data.role === 'staff' || data.role === 'System Management')) shouldNotify = true;
        else if (target === 'admin' && (data.role === 'Admin' || data.role === 'admin')) shouldNotify = true;

        if (shouldNotify) {
          usersToNotify.push(uid);
        }
      });
    }

    if (usersToNotify.length === 0) {
      showError('No users found for selected target');
      btn.disabled = false;
      progressDiv.style.display = 'none';
      return;
    }

    // Log Broadcast Action to Global Trail
    await db.ref('global_notifications/admin_alerts').push({
      title: `System Broadcast: ${title}`,
      message: `Admin ${auditorName} sent a broadcast to ${target} (${usersToNotify.length} users): ${message}`,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      userId: auditorUid,
      type: 'broadcast'
    });

    const total = usersToNotify.length;
    let count = 0;

    for (const uid of usersToNotify) {
      await db.ref(`users/${uid}/notifications`).push({
        title: title,
        message: message,
        type: type,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        read: false,
        isBroadcast: true
      });
      count++;
      const pct = Math.round((count / total) * 100);
      progressBar.style.width = pct + '%';
      statusText.textContent = `Sent to ${count} of ${total} users...`;
    }

    showSuccess(`Broadcast sent successfully to ${total} users`);
    setTimeout(() => closeBroadcastModal(), 1500);

  } catch (e) {
    console.error('Broadcast failed:', e);
    showError('Broadcast failed: ' + e.message);
  } finally {
    btn.disabled = false;
  }
};





// ========================================
// FRAUD MONITOR MODULE
// ========================================
// (fraudReports, fraudListenerActive, globalUsersMap declared at top of file)

async function fetchGlobalUsersOnce() {
  if (Object.keys(globalUsersMap).length > 0) return;
  const currentDb = window.db || db;
  if (!currentDb) return;
  try {
    const snap = await currentDb.ref('users').once('value');
    if (snap.exists()) {
      snap.forEach(u => { globalUsersMap[u.key] = u.val(); });
    }
  } catch (e) {
    console.warn("Global users pre-fetch failed (non-critical):", e);
  }
}

function loadFraudMonitorData() {
  const container = document.getElementById('fraudReportsContainer');
  if (!container) { console.error('FRAUD: Container not found'); return; }

  console.log('FRAUD: loadFraudMonitorData called, fraudListenerActive =', fraudListenerActive);

  // Always show spinner first
  container.innerHTML = `<div style="text-align:center;padding:60px;color:#64748b;">
    <i class="fas fa-spinner fa-spin fa-2x"></i>
    <p style="margin-top:15px;">Loading Security Reports...</p>
  </div>`;

  // If listener is already live, just re-render the cached data
  if (fraudListenerActive) {
    console.log('FRAUD: Listener active, re-rendering. fraudReports count =', fraudReports.length);
    renderFraudReports();
    return;
  }

  // Get database with every possible fallback
  let dbRef = null;
  try {
    dbRef = window.db || db;
    if (!dbRef && typeof firebase !== 'undefined') {
      try { dbRef = firebase.app('AdminPanel').database(); }
      catch(e1) {
        try { dbRef = firebase.database(); }
        catch(e2) { console.error('FRAUD: All Firebase fallbacks failed', e2); }
      }
    }
  } catch(e) { console.error('FRAUD: DB resolution error', e); }

  console.log('FRAUD: dbRef resolved =', !!dbRef);

  if (!dbRef) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:#ef4444;background:white;border-radius:12px;">
      <h4>No Database Connection</h4><p>Firebase is not initialized. Please hard-refresh (Ctrl+F5).</p>
    </div>`;
    return;
  }

  fraudListenerActive = true;
  console.log('FRAUD: Attaching listener to reports node...');

  // Hard 8-second timeout
  const hardTimeout = setTimeout(() => {
    console.warn('FRAUD: 8-second hard timeout fired');
    fraudListenerActive = false;
    try { dbRef.ref('reports').off(); } catch(e) {}
    container.innerHTML = `<div style="padding:40px;text-align:center;background:white;border-radius:12px;">
      <i class="fas fa-clock fa-2x" style="color:#f59e0b;margin-bottom:12px;display:block;"></i>
      <h4 style="color:#1e293b;">Timed Out — Firebase Did Not Respond</h4>
      <p style="color:#64748b;">This is almost always a <b>database permissions issue</b>. Your Admin role may not match the security rules.</p>
      <button onclick="fraudListenerActive=false;loadFraudMonitorData();" style="margin-top:15px;padding:10px 20px;background:#6366f1;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">
        Retry
      </button>
    </div>`;
  }, 8000);

  // Simple Firebase callback - no async/await
  dbRef.ref('reports').on('value',
    function(snapshot) {
      clearTimeout(hardTimeout);
      console.log('FRAUD: Firebase responded! snapshot exists =', snapshot.exists());

      fraudReports = [];
      let pendingCount = 0;

      if (snapshot.exists()) {
        snapshot.forEach(function(child) {
          const val = child.val();
          if (val) {
            fraudReports.push({ id: child.key, ...val });
            if ((val.status || '').toLowerCase() === 'pending') pendingCount++;
          }
        });
        fraudReports.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
      }

      // Update sidebar badge
      const badge = document.getElementById('fraudReportsCount');
      if (badge) { badge.textContent = pendingCount; badge.style.display = pendingCount > 0 ? 'inline-block' : 'none'; }

      // Update counter
      const counterBadge = document.getElementById('fraudActiveCounter');
      if (counterBadge) {
        counterBadge.textContent = pendingCount + ' PENDING REPORTS';
        counterBadge.style.background = pendingCount === 0 ? '#10b981' : '#ef4444';
      }

      renderFraudReports();
    },
    function(error) {
      clearTimeout(hardTimeout);
      fraudListenerActive = false;
      console.error('FRAUD: Firebase permission error:', error);
      container.innerHTML = `<div style="padding:40px;text-align:center;background:white;border-radius:12px;color:#ef4444;">
        <i class="fas fa-lock fa-2x" style="margin-bottom:12px;display:block;"></i>
        <h4>Access Denied</h4>
        <p style="color:#64748b;">${error.message || error.code}</p>
        <button onclick="fraudListenerActive=false;loadFraudMonitorData();" style="margin-top:15px;padding:10px 20px;background:#6366f1;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Retry</button>
      </div>`;
    }
  );

  // Fetch user names then re-render so "Anonymous User" gets resolved
  setTimeout(function() {
    fetchGlobalUsersOnce()
      .then(function() { renderFraudReports(); })
      .catch(function() {});
  }, 100);
}

async function renderFraudReports() {
  const container = document.getElementById('fraudReportsContainer');
  if (!container) return;

  if (fraudReports.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px; color: #94a3b8; background: white; border-radius: 12px; border: 1px dashed #cbd5e1;">
        <i class="fas fa-shield-check fa-3x" style="color: #10b981; margin-bottom: 15px;"></i>
        <h4>System Secure</h4>
        <p>No active fraud reports in the queue.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = fraudReports.map(report => {
    const isPending = (report.status === 'Pending' || report.status === 'pending');
    const reporterData = globalUsersMap[report.reportedById || report.reporter_uid];
    const reporterName = reporterData
      ? (reporterData.displayName || reporterData.fullName || reporterData.email || 'Anonymous User')
      : 'Anonymous User';
    const dateStr = report.timestamp ? new Date(report.timestamp).toLocaleString() : 'N/A';
    const resolvedTarget = report.targetId || report.target_product_id || 'N/A';

    return `
      <div class="fm-report-card" style="${!isPending ? 'border-left-color: #94a3b8; opacity: 0.8;' : ''}">
        <div class="fm-report-header">
          <div class="fm-report-title">
            <h3><i class="fas fa-flag" style="color: #ef4444; margin-right: 8px;"></i> ${report.reason || 'General Concern'}</h3>
            <div class="fm-report-meta">Reported by <strong>${reporterName}</strong> on ${dateStr}</div>
          </div>
          <span class="fm-status-badge ${isPending ? 'fm-status-pending' : 'fm-status-resolved'}">${report.status || 'Pending'}</span>
        </div>
        
        <div class="fm-report-grid">
          <div class="fm-detail-item">
            <label>Link (Target ID)</label>
            <span style="font-family: monospace; color: #3b82f6;">${resolvedTarget}</span>
          </div>
          <div class="fm-detail-item">
            <label>Evidence</label>
            <span>${(report.evidenceUrls && report.evidenceUrls.length) || (report.evidence_urls && report.evidence_urls.length) || 0} files</span>
          </div>
        </div>
        
        <div class="fm-report-desc">
          <strong>Observation:</strong><br>
          ${report.description || 'No description provided.'}
        </div>
        
        <div class="fm-action-bar">
          <button class="fm-btn fm-btn-investigate" onclick="openFraudModal('${report.id}')">
            <i class="fas fa-search"></i> Open Context
          </button>
          ${isPending ? `
            <button class="fm-btn fm-btn-dismiss" onclick="moderateAction('dismiss', '${resolvedTarget}', '${report.id}', this)">
              <i class="fas fa-times"></i> Clear
            </button>
            <button class="fm-btn fm-btn-delete" onclick="moderateAction('delete_listing', '${resolvedTarget}', '${report.id}', this)">
              <i class="fas fa-trash-alt"></i> Purge
            </button>
            <button class="fm-btn fm-btn-suspend" onclick="moderateAction('suspend_user', '${resolvedTarget}', '${report.id}', this)">
              <i class="fas fa-user-slash"></i> Ban User
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function openFraudModal(reportId) {
  const report = fraudReports.find(r => r.id === reportId);
  if (!report) return;

  let evidenceHtml = '<p style="color: #64748b; font-size: 0.9rem;">No photographic evidence provided.</p>';
  if (report.evidenceUrls && report.evidenceUrls.length > 0) {
    evidenceHtml = `
      <div class="fm-evidence-gallery">
        ${report.evidenceUrls.map(url => `
          <a href="${url}" target="_blank">
            <img src="${url}" class="fm-evidence-img" alt="Evidence">
          </a>
        `).join('')}
      </div>
    `;
  }

  const body = document.getElementById('fraudModalBody');
  body.innerHTML = `
    <div style="margin-bottom: 20px;">
      <h4 style="margin-bottom: 10px; color: #1e293b;">Photographic Evidence</h4>
      ${evidenceHtml}
    </div>
    <div style="margin-bottom: 20px;">
      <h4 style="margin-bottom: 10px; color: #1e293b;">Target Inspection</h4>
      <p style="color: #475569; font-size: 0.95rem; margin-bottom: 15px;">
        To thoroughly review the reported item context, click below to open the listing directly in a new tab.
      </p>
      <a href="/product-detail.html?id=${report.targetId}" target="_blank" class="fm-btn fm-btn-investigate" style="text-decoration:none;">
        <i class="fas fa-external-link-alt"></i> View Live Listing
      </a>
    </div>
  `;
  document.getElementById('fraudInvestigationModal').style.display = 'block';
}

function closeFraudModal() {
  document.getElementById('fraudInvestigationModal').style.display = 'none';
}

async function moderateAction(actionType, targetId, reportId, btnElement) {
  if (!confirm('Are you certain you want to perform this moderation action? This may be irreversible.')) return;

  const originalText = btnElement.innerHTML;
  btnElement.disabled = true;
  btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

  try {
    if (actionType === 'dismiss') {
      await db.ref(`reports/${reportId}`).update({ status: 'Dismissed' });
      showSuccess('Report dismissed.');
    }
    else if (actionType === 'delete_listing') {
      await db.ref(`products/${targetId}`).remove();
      await db.ref(`reports/${reportId}`).update({ status: 'Resolved (Deleted)' });
      showSuccess('Listing forcefully removed.');
    }
    else if (actionType === 'suspend_user') {
      // Find the product to get the sellerId
      const prodSnap = await db.ref(`products/${targetId}`).once('value');
      if (prodSnap.exists()) {
        const sellerId = prodSnap.val().sellerId || prodSnap.val().seller_id;
        if (sellerId) {
          // Force is_active and isActive to false for both legacy and new structures
          await db.ref(`users/${sellerId}`).update({
            isActive: false,
            is_active: false
          });
          await db.ref(`reports/${reportId}`).update({ status: 'Resolved (Suspended User)' });
          showSuccess('Seller suspended permanently.');
        } else {
          showError('Could not locate seller ID for this product.');
        }
      } else {
        // Product already gone?
        showError('Target product no longer exists.');
        await db.ref(`reports/${reportId}`).update({ status: 'Resolved (Missing Target)' });
      }
    }
  } catch (error) {
    console.error('Moderation error:', error);
    showError('Moderation action failed: ' + error.message);
  } finally {
    btnElement.disabled = false;
    btnElement.innerHTML = originalText;
  }
}

/**
 * Account Security & Password Management
 */

// Global toggle for password visibility in dashboard forms
window.toggleDashboardPassword = function (inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const icon = input.parentElement.querySelector('.password-toggle i');

  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
  }
};

// Core logic for updating the administrator password
window.updateAdminPassword = async function () {
  const currentPassEl = document.getElementById('currentPassword');
  const newPassEl = document.getElementById('newPassword');
  const confirmPassEl = document.getElementById('confirmPassword');

  const currentPassword = currentPassEl.value;
  const newPassword = newPassEl.value;
  const confirmPassword = confirmPassEl.value;

  // 1. Basic Validation
  if (!currentPassword || !newPassword || !confirmPassword) {
    showError('Please fill in all password fields.');
    return;
  }

  if (newPassword !== confirmPassword) {
    showError('New passwords do not match. Please try again.');
    return;
  }

  if (newPassword.length < 6) {
    showError('New password must be at least 6 characters long.');
    return;
  }

  const btn = document.querySelector('#passwordChangeForm .btn-primary');
  const originalContent = btn.innerHTML;

  try {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';

    // Ensure we are using the AdminPanel auth instance
    const user = window.auth.currentUser;
    if (!user) {
      throw new Error('Session inactive. Please log in again.');
    }

    // 2. Re-authenticate user (Security Requirement for sensitive data changes)
    // We use the EmailAuthProvider from the global firebase object
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);

    try {
      await user.reauthenticateWithCredential(credential);
    } catch (authError) {
      if (authError.code === 'auth/wrong-password') {
        throw new Error('The current password you entered is incorrect.');
      }
      throw authError;
    }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';

    // 3. Perform Password Update
    await user.updatePassword(newPassword);

    // 4. Success UI & Cleanup
    showSuccess('Password updated successfully! Redirecting to login...');

    currentPassEl.value = '';
    newPassEl.value = '';
    confirmPassEl.value = '';

    // 5. Force logout for security after password change
    setTimeout(() => {
      window.logout();
    }, 2500);

  } catch (error) {
    console.error('❌ Password update failure:', error);
    showError(error.message || 'Failed to update password. Please try again.');
    btn.disabled = false;
    btn.innerHTML = originalContent;
  }
};

/**
 * v2 Isolated Analytics Implementation
 */

async function loadAnalyticsData() {
  console.log('🚀 Syncing Platform Intelligence...');

  // 1. Ensure section is visible for layout calculations
  const section = document.getElementById('analytics-section');
  if (!section || !section.classList.contains('active')) return;

  if (typeof STHAnalytics === 'undefined') {
    console.error('Analytics Engine core missing!');
    return;
  }

  // 2. Prevent Duplicate Listeners
  if (v2AnalyticsActive) {
    console.log('📡 Analytics stream already active. Refreshing current view...');
    if (v2GlobalStats) refreshAllCharts();
    return;
  }

  // Initialize Category Toggle State
  let categoryMode = 'volume';

  const setupToggles = () => {
    const btnVol = document.getElementById('catToggleVolume');
    const btnVal = document.getElementById('catToggleValue');
    if (!btnVol || !btnVal) return;

    btnVol.onclick = () => {
      categoryMode = 'volume';
      btnVol.style.cssText = 'border:none; padding: 4px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; background: white; color: #1e293b; box-shadow: 0 2px 4px rgba(0,0,0,0.05);';
      btnVal.style.cssText = 'border:none; padding: 4px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; background: transparent; color: #64748b;';
      if (v2GlobalStats) refreshCategoryChart();
    };

    btnVal.onclick = () => {
      categoryMode = 'value';
      btnVal.style.cssText = 'border:none; padding: 4px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; background: white; color: #1e293b; box-shadow: 0 2px 4px rgba(0,0,0,0.05);';
      btnVol.style.cssText = 'border:none; padding: 4px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; background: transparent; color: #64748b;';
      if (v2GlobalStats) refreshCategoryChart();
    };
  };

  const refreshCategoryChart = () => {
    if (!v2GlobalStats) return;
    if (v2Charts.category) { v2Charts.category.destroy(); v2Charts.category = null; }
    v2Charts.category = STHAnalytics.Admin.renderCategoryChart('v2-categoryChart', v2GlobalStats.charts.categories, categoryMode);
  };

  const refreshAllCharts = () => {
    if (!v2GlobalStats) return;

    // Use timeout to ensure DOM layout is complete
    setTimeout(() => {
      if (v2Charts.revenue) v2Charts.revenue.destroy();
      v2Charts.revenue = STHAnalytics.Admin.renderRevenueChart('v2-revenueChart', v2GlobalStats.charts.revenueTrend);

      if (v2Charts.growth) v2Charts.growth.destroy();
      v2Charts.growth = STHAnalytics.Admin.renderGrowthChart('v2-growthChart', v2GlobalStats.charts.userGrowth);

      refreshCategoryChart();
    }, 50);
  };

  setupToggles();

  // 3. Start Global Stream
  STHAnalytics.Admin.listenToGlobalMetrics((stats) => {
    v2GlobalStats = stats;
    v2AnalyticsActive = true;

    // Update Top Counters
    const elements = {
      'v2-totalRevenue': 'RS ' + stats.counters.revenue.toLocaleString(),
      'v2-orderCount': stats.counters.orders.toLocaleString(),
      'v2-escrowValue': 'RS ' + stats.counters.escrowValue.toLocaleString(),
      'v2-activeDisputes': stats.counters.activeDisputes.toLocaleString(),
      'v2-usersNew24h': stats.counters.usersNew24h.toLocaleString(),
      'v2-fulfillmentRate': stats.counters.fulfillmentRate + '%'
    };

    Object.keys(elements).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerText = elements[id];
    });

    const progress = document.getElementById('v2-fulfillmentProgress');
    if (progress) progress.style.width = stats.counters.fulfillmentRate + '%';

    refreshAllCharts();
  });
}
