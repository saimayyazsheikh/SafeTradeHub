/* ========================================
   ADMIN-DASHBOARD.JS - JavaScript for admin dashboard module
   ======================================== */

// Admin credentials
const ADMIN_EMAIL = '221009@students.au.edu.pk';
const ADMIN_PASSWORD = 'Saim@12345';

// Storage keys
const USERS_KEY = 'sthub_users';
const PRODUCTS_KEY = 'sthub_products';
const ORDERS_KEY = 'sthub_orders';
const ESCROWS_KEY = 'sthub_escrows';
const DISPUTES_KEY = 'sthub_disputes';
const TRANSACTIONS_KEY = 'sthub_transactions';

// Global variables
let currentSection = 'dashboard';
let adminData = {
  users: [],
  products: [],
  orders: [],
  escrows: [],
  disputes: [],
  transactions: []
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  // Check if we're on login page or dashboard
  if (document.body.classList.contains('admin-login-body')) {
    initializeLogin();
  } else if (document.body.classList.contains('admin-dashboard-body')) {
    initializeDashboard();
  }
});

// Initialize login page
function initializeLogin() {
  console.log('Initializing Admin Login');
  
  const loginForm = document.getElementById('adminLoginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }
}

// Initialize dashboard
function initializeDashboard() {
  console.log('Initializing Admin Dashboard');
  
  // Check if user is logged in
  if (!isAdminLoggedIn()) {
    window.location.href = 'admin-login.html';
    return;
  }
  
  setupEventListeners();
  loadAllData();
  updateDashboardStats();
  showSection('dashboard');
}

// Setup event listeners
function setupEventListeners() {
  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function(e) {
      e.preventDefault();
      const section = this.dataset.section;
      showSection(section);
    });
  });
  
  // User dropdown
  const userBtn = document.getElementById('adminUserBtn');
  const userDropdown = document.getElementById('adminDropdown');
  
  if (userBtn && userDropdown) {
    userBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      userDropdown.classList.toggle('show');
    });
  }
  
  // Close dropdown when clicking outside
  document.addEventListener('click', function() {
    if (userDropdown) {
      userDropdown.classList.remove('show');
    }
  });
  
  // Search functionality
  setupSearchHandlers();
  
  // Filter functionality
  setupFilterHandlers();
}

// Setup search handlers
function setupSearchHandlers() {
  const searchInputs = [
    { id: 'userSearch', type: 'users' },
    { id: 'verificationSearch', type: 'verification' },
    { id: 'productSearch', type: 'products' },
    { id: 'categorySearch', type: 'categories' },
    { id: 'transactionSearch', type: 'transactions' },
    { id: 'orderSearch', type: 'orders' },
    { id: 'escrowSearch', type: 'escrow' },
    { id: 'disputeSearch', type: 'disputes' }
  ];
  
  searchInputs.forEach(({ id, type }) => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', debounce(() => {
        searchData(type, input.value);
      }, 300));
    }
  });
}

// Setup filter handlers
function setupFilterHandlers() {
  const filters = [
    { id: 'categoryFilter', type: 'products' },
    { id: 'verificationStatusFilter', type: 'verification' },
    { id: 'transactionStatusFilter', type: 'transactions' },
    { id: 'orderStatusFilter', type: 'orders' },
    { id: 'escrowStatusFilter', type: 'escrow' },
    { id: 'disputeStatusFilter', type: 'disputes' }
  ];
  
  filters.forEach(({ id, type }) => {
    const select = document.getElementById(id);
    if (select) {
      select.addEventListener('change', () => {
        filterData(type, select.value);
      });
    }
  });
}

// Handle login
function handleLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('adminEmail').value;
  const password = document.getElementById('adminPassword').value;
  const errorDiv = document.getElementById('loginError');
  
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    // Store login session
    sessionStorage.setItem('adminLoggedIn', 'true');
    sessionStorage.setItem('adminEmail', email);
    sessionStorage.setItem('adminLoginTime', new Date().toISOString());
    
    // Redirect to dashboard
    window.location.href = 'admin-dashboard.html';
  } else {
    // Show error
    errorDiv.style.display = 'flex';
    errorDiv.querySelector('#errorMessage').textContent = 'Invalid email or password';
    
    // Hide error after 3 seconds
    setTimeout(() => {
      errorDiv.style.display = 'none';
    }, 3000);
  }
}

// Check if admin is logged in
function isAdminLoggedIn() {
  return sessionStorage.getItem('adminLoggedIn') === 'true';
}

// Logout function
function logout() {
  sessionStorage.removeItem('adminLoggedIn');
  sessionStorage.removeItem('adminEmail');
  sessionStorage.removeItem('adminLoginTime');
  window.location.href = 'admin-login.html';
}

// Toggle password visibility
function togglePassword() {
  const passwordInput = document.getElementById('adminPassword');
  const toggleIcon = document.getElementById('passwordToggleIcon');
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    toggleIcon.classList.remove('fa-eye');
    toggleIcon.classList.add('fa-eye-slash');
  } else {
    passwordInput.type = 'password';
    toggleIcon.classList.remove('fa-eye-slash');
    toggleIcon.classList.add('fa-eye');
  }
}

// Show section
function showSection(sectionName) {
  // Hide all sections
  document.querySelectorAll('.admin-section').forEach(section => {
    section.classList.remove('active');
  });
  
  // Remove active class from all nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  
  // Show selected section
  const targetSection = document.getElementById(sectionName + '-section');
  if (targetSection) {
    targetSection.classList.add('active');
  }
  
  // Add active class to nav item
  const navItem = document.querySelector(`[data-section="${sectionName}"]`);
  if (navItem) {
    navItem.classList.add('active');
  }
  
  currentSection = sectionName;
  
  // Load section-specific data
  loadSectionData(sectionName);
}

// Load section-specific data
function loadSectionData(sectionName) {
  switch(sectionName) {
    case 'users':
      loadUsersData();
      break;
    case 'verification':
      loadVerificationData();
      break;
    case 'products':
      loadProductsData();
      break;
    case 'categories':
      loadCategoriesData();
      break;
    case 'transactions':
      loadTransactionsData();
      break;
    case 'orders':
      loadOrdersData();
      break;
    case 'escrow':
      loadEscrowData();
      break;
    case 'disputes':
      loadDisputesData();
      break;
    case 'analytics':
      loadAnalyticsData();
      break;
  }
}

// Load all data
function loadAllData() {
  try {
    adminData.users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    adminData.products = JSON.parse(localStorage.getItem(PRODUCTS_KEY) || '[]');
    adminData.orders = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
    adminData.escrows = JSON.parse(localStorage.getItem(ESCROWS_KEY) || '[]');
    adminData.disputes = JSON.parse(localStorage.getItem(DISPUTES_KEY) || '[]');
    adminData.transactions = JSON.parse(localStorage.getItem(TRANSACTIONS_KEY) || '[]');
    
    // Initialize sample data if empty
    initializeSampleData();
    
    console.log('Admin data loaded:', adminData);
  } catch (error) {
    console.error('Error loading admin data:', error);
  }
}

// Initialize sample data
function initializeSampleData() {
  // Sample users
  if (adminData.users.length === 0) {
    adminData.users = [
      {
        id: 'USR-001',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'Buyer',
        status: 'active',
        joined: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        verified: true
      },
      {
        id: 'USR-002',
        name: 'Jane Smith',
        email: 'jane@example.com',
        role: 'Seller',
        status: 'active',
        joined: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        verified: true
      },
      {
        id: 'USR-003',
        name: 'Mike Johnson',
        email: 'mike@example.com',
        role: 'Buyer',
        status: 'pending',
        joined: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        verified: false
      }
    ];
    localStorage.setItem(USERS_KEY, JSON.stringify(adminData.users));
  }
  
  // Sample products
  if (adminData.products.length === 0) {
    adminData.products = [
      {
        id: 'PROD-001',
        name: 'iPhone 14 Pro',
        category: 'mobile',
        price: 999.99,
        stock: 15,
        status: 'active',
        seller: 'USR-002'
      },
      {
        id: 'PROD-002',
        name: 'Samsung Galaxy S23',
        category: 'mobile',
        price: 899.99,
        stock: 8,
        status: 'active',
        seller: 'USR-002'
      },
      {
        id: 'PROD-003',
        name: 'MacBook Pro 16"',
        category: 'computers',
        price: 2499.99,
        stock: 5,
        status: 'active',
        seller: 'USR-002'
      }
    ];
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(adminData.products));
  }
  
  // Sample orders
  if (adminData.orders.length === 0) {
    adminData.orders = [
      {
        id: 'ORD-001',
        userId: 'USR-001',
        total: 999.99,
        status: 'completed',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'ORD-002',
        userId: 'USR-003',
        total: 899.99,
        status: 'pending',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];
    localStorage.setItem(ORDERS_KEY, JSON.stringify(adminData.orders));
  }
  
  // Sample escrow transactions
  if (adminData.escrows.length === 0) {
    adminData.escrows = [
      {
        id: 'ESC-001',
        orderId: 'ORD-001',
        amount: 999.99,
        status: 'released',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'ESC-002',
        orderId: 'ORD-002',
        amount: 899.99,
        status: 'held',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];
    localStorage.setItem(ESCROWS_KEY, JSON.stringify(adminData.escrows));
  }
  
  // Sample disputes
  if (adminData.disputes.length === 0) {
    adminData.disputes = [
      {
        id: 'DISP-001',
        orderId: 'ORD-003',
        issue: 'Product not as described',
        priority: 'high',
        status: 'open',
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];
    localStorage.setItem(DISPUTES_KEY, JSON.stringify(adminData.disputes));
  }
  
  // Sample transactions
  if (adminData.transactions.length === 0) {
    adminData.transactions = [
      {
        id: 'TXN-001',
        userId: 'USR-001',
        amount: 999.99,
        type: 'payment',
        status: 'completed',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'TXN-002',
        userId: 'USR-003',
        amount: 899.99,
        type: 'escrow',
        status: 'pending',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(adminData.transactions));
  }
}

// Update dashboard stats
function updateDashboardStats() {
  // Total users
  document.getElementById('totalUsers').textContent = adminData.users.length;
  
  // Total orders
  document.getElementById('totalOrders').textContent = adminData.orders.length;
  
  // Total revenue
  const totalRevenue = adminData.orders.reduce((sum, order) => sum + (order.total || 0), 0);
  document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
  
  // Pending disputes
  const pendingDisputes = adminData.disputes.filter(dispute => dispute.status === 'open').length;
  document.getElementById('pendingDisputes').textContent = pendingDisputes;
  
  // Update nav badges
  document.getElementById('usersCount').textContent = adminData.users.length;
  document.getElementById('productsCount').textContent = adminData.products.length;
  document.getElementById('transactionsCount').textContent = adminData.transactions.length;
  document.getElementById('ordersCount').textContent = adminData.orders.length;
  document.getElementById('escrowCount').textContent = adminData.escrows.length;
  document.getElementById('disputesCount').textContent = pendingDisputes;
  
  // Pending verifications
  const pendingVerifications = adminData.users.filter(user => !user.verified).length;
  document.getElementById('pendingVerifications').textContent = pendingVerifications;
  
  // Load recent activity
  loadRecentActivity();
}

// Load recent activity
function loadRecentActivity() {
  const activityContainer = document.getElementById('recentActivity');
  if (!activityContainer) return;
  
  const activities = [
    {
      icon: 'fas fa-user-plus',
      title: 'New user registered',
      time: '2 hours ago',
      color: '#667eea'
    },
    {
      icon: 'fas fa-shopping-cart',
      title: 'New order placed',
      time: '4 hours ago',
      color: '#38a169'
    },
    {
      icon: 'fas fa-exclamation-triangle',
      title: 'Dispute reported',
      time: '6 hours ago',
      color: '#e53e3e'
    },
    {
      icon: 'fas fa-shield-alt',
      title: 'Escrow funds released',
      time: '8 hours ago',
      color: '#667eea'
    }
  ];
  
  activityContainer.innerHTML = activities.map(activity => `
    <div class="activity-item">
      <div class="activity-icon" style="background: ${activity.color}20; color: ${activity.color}">
        <i class="${activity.icon}"></i>
      </div>
      <div class="activity-content">
        <div class="activity-title">${activity.title}</div>
        <div class="activity-time">${activity.time}</div>
      </div>
    </div>
  `).join('');
}

// Load users data
function loadUsersData() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = adminData.users.map(user => `
    <tr>
      <td>${user.id}</td>
      <td>${user.name}</td>
      <td>${user.email}</td>
      <td><span class="status-badge ${user.role.toLowerCase()}">${user.role}</span></td>
      <td><span class="status-badge ${user.status}">${user.status}</span></td>
      <td>${new Date(user.joined).toLocaleDateString()}</td>
      <td>
        <div class="action-buttons">
          <button class="action-btn-small btn-view" onclick="viewUser('${user.id}')">
            <i class="fas fa-eye"></i>
          </button>
          <button class="action-btn-small btn-edit" onclick="editUser('${user.id}')">
            <i class="fas fa-edit"></i>
          </button>
          <button class="action-btn-small btn-delete" onclick="deleteUser('${user.id}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Load products data
function loadProductsData() {
  const tbody = document.getElementById('productsTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = adminData.products.map(product => `
    <tr>
      <td>${product.id}</td>
      <td>${product.name}</td>
      <td><span class="status-badge">${product.category}</span></td>
      <td>${formatCurrency(product.price)}</td>
      <td>${product.stock}</td>
      <td><span class="status-badge ${product.status}">${product.status}</span></td>
      <td>
        <div class="action-buttons">
          <button class="action-btn-small btn-view" onclick="viewProduct('${product.id}')">
            <i class="fas fa-eye"></i>
          </button>
          <button class="action-btn-small btn-edit" onclick="editProduct('${product.id}')">
            <i class="fas fa-edit"></i>
          </button>
          <button class="action-btn-small btn-delete" onclick="deleteProduct('${product.id}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Load transactions data
function loadTransactionsData() {
  const tbody = document.getElementById('transactionsTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = adminData.transactions.map(transaction => {
    const user = adminData.users.find(u => u.id === transaction.userId);
    return `
      <tr>
        <td>${transaction.id}</td>
        <td>${user ? user.name : 'Unknown'}</td>
        <td>${formatCurrency(transaction.amount)}</td>
        <td><span class="status-badge">${transaction.type}</span></td>
        <td><span class="status-badge ${transaction.status}">${transaction.status}</span></td>
        <td>${new Date(transaction.createdAt).toLocaleDateString()}</td>
        <td>
          <div class="action-buttons">
            <button class="action-btn-small btn-view" onclick="viewTransaction('${transaction.id}')">
              <i class="fas fa-eye"></i>
            </button>
            <button class="action-btn-small btn-edit" onclick="editTransaction('${transaction.id}')">
              <i class="fas fa-edit"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Load escrow data
function loadEscrowData() {
  const tbody = document.getElementById('escrowTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = adminData.escrows.map(escrow => `
    <tr>
      <td>${escrow.id}</td>
      <td>${escrow.orderId}</td>
      <td>${formatCurrency(escrow.amount)}</td>
      <td><span class="status-badge ${escrow.status}">${escrow.status}</span></td>
      <td>${new Date(escrow.createdAt).toLocaleDateString()}</td>
      <td>
        <div class="action-buttons">
          <button class="action-btn-small btn-view" onclick="viewEscrow('${escrow.id}')">
            <i class="fas fa-eye"></i>
          </button>
          ${escrow.status === 'held' ? `
            <button class="action-btn-small btn-edit" onclick="releaseEscrow('${escrow.id}')">
              <i class="fas fa-unlock"></i>
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

// Load disputes data
function loadDisputesData() {
  const tbody = document.getElementById('disputesTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = adminData.disputes.map(dispute => `
    <tr>
      <td>${dispute.id}</td>
      <td>${dispute.orderId}</td>
      <td>${dispute.issue}</td>
      <td><span class="status-badge ${dispute.priority}">${dispute.priority}</span></td>
      <td><span class="status-badge ${dispute.status}">${dispute.status}</span></td>
      <td>${new Date(dispute.createdAt).toLocaleDateString()}</td>
      <td>
        <div class="action-buttons">
          <button class="action-btn-small btn-view" onclick="viewDispute('${dispute.id}')">
            <i class="fas fa-eye"></i>
          </button>
          <button class="action-btn-small btn-edit" onclick="resolveDispute('${dispute.id}')">
            <i class="fas fa-gavel"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Load verification data
function loadVerificationData() {
  const tbody = document.getElementById('verificationTableBody');
  if (!tbody) return;
  
  // Get verification data from users
  const verificationData = adminData.users.map(user => ({
    id: user.id,
    name: user.name,
    email: user.email,
    documentType: 'ID Card',
    status: user.verified ? 'approved' : 'pending',
    submitted: user.joined
  }));
  
  tbody.innerHTML = verificationData.map(verification => `
    <tr>
      <td>${verification.id}</td>
      <td>${verification.name}</td>
      <td>${verification.email}</td>
      <td><span class="status-badge">${verification.documentType}</span></td>
      <td><span class="status-badge ${verification.status}">${verification.status}</span></td>
      <td>${new Date(verification.submitted).toLocaleDateString()}</td>
      <td>
        <div class="action-buttons">
          <button class="action-btn-small btn-view" onclick="viewVerification('${verification.id}')">
            <i class="fas fa-eye"></i>
          </button>
          ${verification.status === 'pending' ? `
            <button class="action-btn-small btn-edit" onclick="approveVerification('${verification.id}')">
              <i class="fas fa-check"></i>
            </button>
            <button class="action-btn-small btn-delete" onclick="rejectVerification('${verification.id}')">
              <i class="fas fa-times"></i>
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

// Load categories data
function loadCategoriesData() {
  const tbody = document.getElementById('categoriesTableBody');
  if (!tbody) return;
  
  const categories = [
    { id: 'CAT-001', name: 'Mobile', description: 'Mobile phones and accessories', productsCount: 15, status: 'active', created: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'CAT-002', name: 'Camera', description: 'Cameras and photography equipment', productsCount: 8, status: 'active', created: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'CAT-003', name: 'Computers', description: 'Laptops, desktops and computer accessories', productsCount: 12, status: 'active', created: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'CAT-004', name: 'Fashion', description: 'Clothing and fashion accessories', productsCount: 25, status: 'active', created: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'CAT-005', name: 'Beauty', description: 'Beauty and cosmetic products', productsCount: 18, status: 'active', created: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'CAT-006', name: 'Books', description: 'Books and educational materials', productsCount: 30, status: 'active', created: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'CAT-007', name: 'Furniture', description: 'Home and office furniture', productsCount: 22, status: 'active', created: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'CAT-008', name: 'Gym', description: 'Fitness and gym equipment', productsCount: 14, status: 'active', created: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'CAT-009', name: 'Home', description: 'Home and garden products', productsCount: 20, status: 'active', created: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'CAT-010', name: 'Services', description: 'Professional services', productsCount: 16, status: 'active', created: new Date().toISOString() },
    { id: 'CAT-011', name: 'Sports', description: 'Sports and outdoor equipment', productsCount: 19, status: 'active', created: new Date().toISOString() },
    { id: 'CAT-012', name: 'Pets', description: 'Pet care and supplies', productsCount: 13, status: 'active', created: new Date().toISOString() }
  ];
  
  tbody.innerHTML = categories.map(category => `
    <tr>
      <td>${category.id}</td>
      <td>${category.name}</td>
      <td>${category.description}</td>
      <td><span class="status-badge">${category.productsCount}</span></td>
      <td><span class="status-badge ${category.status}">${category.status}</span></td>
      <td>${new Date(category.created).toLocaleDateString()}</td>
      <td>
        <div class="action-buttons">
          <button class="action-btn-small btn-view" onclick="viewCategory('${category.id}')">
            <i class="fas fa-eye"></i>
          </button>
          <button class="action-btn-small btn-edit" onclick="editCategory('${category.id}')">
            <i class="fas fa-edit"></i>
          </button>
          <button class="action-btn-small btn-delete" onclick="deleteCategory('${category.id}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Load orders data
function loadOrdersData() {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = adminData.orders.map(order => {
    const user = adminData.users.find(u => u.id === order.userId);
    const itemsCount = Math.floor(Math.random() * 5) + 1; // Random items count for demo
    
    return `
      <tr>
        <td>${order.id}</td>
        <td>${user ? user.name : 'Unknown'}</td>
        <td><span class="status-badge">${itemsCount} items</span></td>
        <td>${formatCurrency(order.total)}</td>
        <td><span class="status-badge ${order.status}">${order.status}</span></td>
        <td>${new Date(order.createdAt).toLocaleDateString()}</td>
        <td>
          <div class="action-buttons">
            <button class="action-btn-small btn-view" onclick="viewOrder('${order.id}')">
              <i class="fas fa-eye"></i>
            </button>
            <button class="action-btn-small btn-edit" onclick="updateOrderStatus('${order.id}')">
              <i class="fas fa-edit"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Load analytics data
function loadAnalyticsData() {
  // This would typically load chart data
  console.log('Loading analytics data...');
}

// Search data
function searchData(type, query) {
  if (!query.trim()) {
    loadSectionData(type);
    return;
  }
  
  let filteredData = [];
  
  switch(type) {
    case 'users':
      filteredData = adminData.users.filter(user => 
        user.name.toLowerCase().includes(query.toLowerCase()) ||
        user.email.toLowerCase().includes(query.toLowerCase()) ||
        user.id.toLowerCase().includes(query.toLowerCase())
      );
      break;
    case 'verification':
      const verificationData = adminData.users.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        documentType: 'ID Card',
        status: user.verified ? 'approved' : 'pending',
        submitted: user.joined
      }));
      filteredData = verificationData.filter(verification => 
        verification.name.toLowerCase().includes(query.toLowerCase()) ||
        verification.email.toLowerCase().includes(query.toLowerCase()) ||
        verification.id.toLowerCase().includes(query.toLowerCase())
      );
      break;
    case 'products':
      filteredData = adminData.products.filter(product => 
        product.name.toLowerCase().includes(query.toLowerCase()) ||
        product.category.toLowerCase().includes(query.toLowerCase()) ||
        product.id.toLowerCase().includes(query.toLowerCase())
      );
      break;
    case 'categories':
      const categories = [
        { id: 'CAT-001', name: 'Mobile', description: 'Mobile phones and accessories', productsCount: 15, status: 'active', created: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'CAT-002', name: 'Camera', description: 'Cameras and photography equipment', productsCount: 8, status: 'active', created: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'CAT-003', name: 'Computers', description: 'Laptops, desktops and computer accessories', productsCount: 12, status: 'active', created: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'CAT-004', name: 'Fashion', description: 'Clothing and fashion accessories', productsCount: 25, status: 'active', created: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'CAT-005', name: 'Beauty', description: 'Beauty and cosmetic products', productsCount: 18, status: 'active', created: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'CAT-006', name: 'Books', description: 'Books and educational materials', productsCount: 30, status: 'active', created: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'CAT-007', name: 'Furniture', description: 'Home and office furniture', productsCount: 22, status: 'active', created: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'CAT-008', name: 'Gym', description: 'Fitness and gym equipment', productsCount: 14, status: 'active', created: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'CAT-009', name: 'Home', description: 'Home and garden products', productsCount: 20, status: 'active', created: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'CAT-010', name: 'Services', description: 'Professional services', productsCount: 16, status: 'active', created: new Date().toISOString() },
        { id: 'CAT-011', name: 'Sports', description: 'Sports and outdoor equipment', productsCount: 19, status: 'active', created: new Date().toISOString() },
        { id: 'CAT-012', name: 'Pets', description: 'Pet care and supplies', productsCount: 13, status: 'active', created: new Date().toISOString() }
      ];
      filteredData = categories.filter(category => 
        category.name.toLowerCase().includes(query.toLowerCase()) ||
        category.description.toLowerCase().includes(query.toLowerCase()) ||
        category.id.toLowerCase().includes(query.toLowerCase())
      );
      break;
    case 'orders':
      filteredData = adminData.orders.filter(order => 
        order.id.toLowerCase().includes(query.toLowerCase()) ||
        order.status.toLowerCase().includes(query.toLowerCase())
      );
      break;
    case 'transactions':
      filteredData = adminData.transactions.filter(transaction => 
        transaction.id.toLowerCase().includes(query.toLowerCase()) ||
        transaction.type.toLowerCase().includes(query.toLowerCase())
      );
      break;
    case 'escrow':
      filteredData = adminData.escrows.filter(escrow => 
        escrow.id.toLowerCase().includes(query.toLowerCase()) ||
        escrow.orderId.toLowerCase().includes(query.toLowerCase())
      );
      break;
    case 'disputes':
      filteredData = adminData.disputes.filter(dispute => 
        dispute.id.toLowerCase().includes(query.toLowerCase()) ||
        dispute.issue.toLowerCase().includes(query.toLowerCase()) ||
        dispute.orderId.toLowerCase().includes(query.toLowerCase())
      );
      break;
  }
  
  // Update the table with filtered data
  updateTableWithData(type, filteredData);
}

// Filter data
function filterData(type, filterValue) {
  if (!filterValue) {
    loadSectionData(type);
    return;
  }
  
  let filteredData = [];
  
  switch(type) {
    case 'products':
      filteredData = adminData.products.filter(product => product.category === filterValue);
      break;
    case 'verification':
      const verificationData = adminData.users.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        documentType: 'ID Card',
        status: user.verified ? 'approved' : 'pending',
        submitted: user.joined
      }));
      filteredData = verificationData.filter(verification => verification.status === filterValue);
      break;
    case 'orders':
      filteredData = adminData.orders.filter(order => order.status === filterValue);
      break;
    case 'transactions':
      filteredData = adminData.transactions.filter(transaction => transaction.status === filterValue);
      break;
    case 'escrow':
      filteredData = adminData.escrows.filter(escrow => escrow.status === filterValue);
      break;
    case 'disputes':
      filteredData = adminData.disputes.filter(dispute => dispute.status === filterValue);
      break;
  }
  
  updateTableWithData(type, filteredData);
}

// Update table with filtered data
function updateTableWithData(type, data) {
  // This would update the specific table with the filtered data
  console.log(`Updating ${type} table with ${data.length} items`);
}

// Action functions
function addUser() {
  alert('Add User functionality would be implemented here');
}

function addProduct() {
  alert('Add Product functionality would be implemented here');
}

function viewUser(userId) {
  const user = adminData.users.find(u => u.id === userId);
  if (user) {
    alert(`User Details:\nID: ${user.id}\nName: ${user.name}\nEmail: ${user.email}\nRole: ${user.role}\nStatus: ${user.status}`);
  }
}

function editUser(userId) {
  alert(`Edit User ${userId} functionality would be implemented here`);
}

function deleteUser(userId) {
  if (confirm('Are you sure you want to delete this user?')) {
    adminData.users = adminData.users.filter(u => u.id !== userId);
    localStorage.setItem(USERS_KEY, JSON.stringify(adminData.users));
    loadUsersData();
    updateDashboardStats();
    alert('User deleted successfully');
  }
}

function viewProduct(productId) {
  const product = adminData.products.find(p => p.id === productId);
  if (product) {
    alert(`Product Details:\nID: ${product.id}\nName: ${product.name}\nCategory: ${product.category}\nPrice: ${formatCurrency(product.price)}\nStock: ${product.stock}`);
  }
}

function editProduct(productId) {
  alert(`Edit Product ${productId} functionality would be implemented here`);
}

function deleteProduct(productId) {
  if (confirm('Are you sure you want to delete this product?')) {
    adminData.products = adminData.products.filter(p => p.id !== productId);
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(adminData.products));
    loadProductsData();
    updateDashboardStats();
    alert('Product deleted successfully');
  }
}

function viewTransaction(transactionId) {
  const transaction = adminData.transactions.find(t => t.id === transactionId);
  if (transaction) {
    alert(`Transaction Details:\nID: ${transaction.id}\nAmount: ${formatCurrency(transaction.amount)}\nType: ${transaction.type}\nStatus: ${transaction.status}`);
  }
}

function editTransaction(transactionId) {
  alert(`Edit Transaction ${transactionId} functionality would be implemented here`);
}

function viewEscrow(escrowId) {
  const escrow = adminData.escrows.find(e => e.id === escrowId);
  if (escrow) {
    alert(`Escrow Details:\nID: ${escrow.id}\nOrder: ${escrow.orderId}\nAmount: ${formatCurrency(escrow.amount)}\nStatus: ${escrow.status}`);
  }
}

function releaseEscrow(escrowId) {
  if (confirm('Are you sure you want to release these escrow funds?')) {
    const escrowIndex = adminData.escrows.findIndex(e => e.id === escrowId);
    if (escrowIndex !== -1) {
      adminData.escrows[escrowIndex].status = 'released';
      adminData.escrows[escrowIndex].releasedAt = new Date().toISOString();
      localStorage.setItem(ESCROWS_KEY, JSON.stringify(adminData.escrows));
      loadEscrowData();
      updateDashboardStats();
      alert('Escrow funds released successfully');
    }
  }
}

function viewDispute(disputeId) {
  const dispute = adminData.disputes.find(d => d.id === disputeId);
  if (dispute) {
    alert(`Dispute Details:\nID: ${dispute.id}\nOrder: ${dispute.orderId}\nIssue: ${dispute.issue}\nPriority: ${dispute.priority}\nStatus: ${dispute.status}`);
  }
}

function resolveDispute(disputeId) {
  const resolution = prompt('Enter resolution details:');
  if (resolution) {
    const disputeIndex = adminData.disputes.findIndex(d => d.id === disputeId);
    if (disputeIndex !== -1) {
      adminData.disputes[disputeIndex].status = 'resolved';
      adminData.disputes[disputeIndex].resolution = resolution;
      adminData.disputes[disputeIndex].resolvedAt = new Date().toISOString();
      localStorage.setItem(DISPUTES_KEY, JSON.stringify(adminData.disputes));
      loadDisputesData();
      updateDashboardStats();
      alert('Dispute resolved successfully');
    }
  }
}

function exportTransactions() {
  const csv = convertToCSV(adminData.transactions, ['id', 'userId', 'amount', 'type', 'status', 'createdAt']);
  downloadCSV(csv, 'transactions.csv');
}

function exportEscrow() {
  const csv = convertToCSV(adminData.escrows, ['id', 'orderId', 'amount', 'status', 'createdAt']);
  downloadCSV(csv, 'escrow.csv');
}

function exportDisputes() {
  const csv = convertToCSV(adminData.disputes, ['id', 'orderId', 'issue', 'priority', 'status', 'createdAt']);
  downloadCSV(csv, 'disputes.csv');
}

function generateReport() {
  alert('Report generation functionality would be implemented here');
}

function refreshDashboard() {
  loadAllData();
  updateDashboardStats();
  alert('Dashboard refreshed successfully');
}

// Utility functions
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount || 0);
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

function convertToCSV(data, fields) {
  const headers = fields.join(',');
  const rows = data.map(item => 
    fields.map(field => `"${item[field] || ''}"`).join(',')
  );
  return [headers, ...rows].join('\n');
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Verification action functions
function viewVerification(verificationId) {
  const user = adminData.users.find(u => u.id === verificationId);
  if (user) {
    alert(`Verification Details:\nUser ID: ${user.id}\nName: ${user.name}\nEmail: ${user.email}\nStatus: ${user.verified ? 'Approved' : 'Pending'}\nDocument Type: ID Card`);
  }
}

function approveVerification(verificationId) {
  if (confirm('Are you sure you want to approve this verification?')) {
    const userIndex = adminData.users.findIndex(u => u.id === verificationId);
    if (userIndex !== -1) {
      adminData.users[userIndex].verified = true;
      localStorage.setItem(USERS_KEY, JSON.stringify(adminData.users));
      loadVerificationData();
      updateDashboardStats();
      alert('Verification approved successfully');
    }
  }
}

function rejectVerification(verificationId) {
  if (confirm('Are you sure you want to reject this verification?')) {
    const userIndex = adminData.users.findIndex(u => u.id === verificationId);
    if (userIndex !== -1) {
      adminData.users[userIndex].verified = false;
      localStorage.setItem(USERS_KEY, JSON.stringify(adminData.users));
      loadVerificationData();
      updateDashboardStats();
      alert('Verification rejected');
    }
  }
}

function exportVerifications() {
  const verificationData = adminData.users.map(user => ({
    id: user.id,
    name: user.name,
    email: user.email,
    documentType: 'ID Card',
    status: user.verified ? 'approved' : 'pending',
    submitted: user.joined
  }));
  const csv = convertToCSV(verificationData, ['id', 'name', 'email', 'documentType', 'status', 'submitted']);
  downloadCSV(csv, 'verifications.csv');
}

// Category action functions
function viewCategory(categoryId) {
  const categories = [
    { id: 'CAT-001', name: 'Mobile', description: 'Mobile phones and accessories', productsCount: 15, status: 'active' },
    { id: 'CAT-002', name: 'Camera', description: 'Cameras and photography equipment', productsCount: 8, status: 'active' },
    { id: 'CAT-003', name: 'Computers', description: 'Laptops, desktops and computer accessories', productsCount: 12, status: 'active' },
    { id: 'CAT-004', name: 'Fashion', description: 'Clothing and fashion accessories', productsCount: 25, status: 'active' },
    { id: 'CAT-005', name: 'Beauty', description: 'Beauty and cosmetic products', productsCount: 18, status: 'active' },
    { id: 'CAT-006', name: 'Books', description: 'Books and educational materials', productsCount: 30, status: 'active' },
    { id: 'CAT-007', name: 'Furniture', description: 'Home and office furniture', productsCount: 22, status: 'active' },
    { id: 'CAT-008', name: 'Gym', description: 'Fitness and gym equipment', productsCount: 14, status: 'active' },
    { id: 'CAT-009', name: 'Home', description: 'Home and garden products', productsCount: 20, status: 'active' },
    { id: 'CAT-010', name: 'Services', description: 'Professional services', productsCount: 16, status: 'active' },
    { id: 'CAT-011', name: 'Sports', description: 'Sports and outdoor equipment', productsCount: 19, status: 'active' },
    { id: 'CAT-012', name: 'Pets', description: 'Pet care and supplies', productsCount: 13, status: 'active' }
  ];
  
  const category = categories.find(c => c.id === categoryId);
  if (category) {
    alert(`Category Details:\nID: ${category.id}\nName: ${category.name}\nDescription: ${category.description}\nProducts Count: ${category.productsCount}\nStatus: ${category.status}`);
  }
}

function editCategory(categoryId) {
  alert(`Edit Category ${categoryId} functionality would be implemented here`);
}

function deleteCategory(categoryId) {
  if (confirm('Are you sure you want to delete this category?')) {
    alert('Category deleted successfully');
    loadCategoriesData();
  }
}

function addCategory() {
  alert('Add Category functionality would be implemented here');
}

// Order action functions
function viewOrder(orderId) {
  const order = adminData.orders.find(o => o.id === orderId);
  const user = adminData.users.find(u => u.id === order.userId);
  if (order) {
    alert(`Order Details:\nOrder ID: ${order.id}\nCustomer: ${user ? user.name : 'Unknown'}\nTotal: ${formatCurrency(order.total)}\nStatus: ${order.status}\nDate: ${new Date(order.createdAt).toLocaleDateString()}`);
  }
}

function updateOrderStatus(orderId) {
  const newStatus = prompt('Enter new order status (pending, processing, shipped, delivered, cancelled):');
  if (newStatus && ['pending', 'processing', 'shipped', 'delivered', 'cancelled'].includes(newStatus)) {
    const orderIndex = adminData.orders.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
      adminData.orders[orderIndex].status = newStatus;
      localStorage.setItem(ORDERS_KEY, JSON.stringify(adminData.orders));
      loadOrdersData();
      updateDashboardStats();
      alert('Order status updated successfully');
    }
  }
}

function exportOrders() {
  const csv = convertToCSV(adminData.orders, ['id', 'userId', 'total', 'status', 'createdAt']);
  downloadCSV(csv, 'orders.csv');
}
