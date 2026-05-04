/* ========================================
   STAFF-DASHBOARD.JS - Real-time Staff Dashboard
   ======================================== */

let staffData = {
  profile: null,
  activeSection: null,
  users: [],
  products: [],
  orders: [],
  deposits: [],
  withdrawals: [],
  transactions: [],
  escrows: [],
  currentSearch: {
    users: '',
    products: '',
    orders: '',
    disputes: '',
    verification: '',
    orderStatus: '',
    category: '',
    wallets: '',
    transactions: '',
    escrow: '',
    escrowStatus: '',
    disputeStatus: ''
  },
  disputes: []
};

// --- POLYFILLS FOR ADMIN METHODS ---
function updateElementText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}
function showLoading(section) {
  const el = document.getElementById(section + '-section');
  if (el) {
    let loader = el.querySelector('.loading-spinner');
    if (!loader) {
      loader = document.createElement('div');
      loader.className = 'loading-spinner text-center';
      loader.style.width = '100%';
      loader.innerHTML = '<i class="fas fa-spinner fa-spin fa-2x" style="color:#4f46e5; margin:20px;"></i>';
      const content = el.querySelector('.table-container') || el.querySelector('.content-card');
      if (content) content.prepend(loader);
    }
  }
}
function hideLoading(section) {
  const el = document.getElementById(section + '-section');
  if (el) {
    const loader = el.querySelector('.loading-spinner');
    if (loader) loader.remove();
  }
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
    z-index: 10000;
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
    z-index: 10000;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
  `;
  notification.innerHTML = `
    <i class="fas fa-exclamation-circle"></i>
    <span style="margin-left: 8px;">${message}</span>
  `;

  document.body.appendChild(notification);

  // Also log to console for debugging
  console.error('System Error:', message);

  setTimeout(() => {
    notification.remove();
  }, 4000);
}

// Helper to get staff name safely
function getStaffName() {
  if (!staffData.profile) return 'Staff Member';
  return staffData.profile.name || staffData.profile.fullName || staffData.profile.displayName || staffData.profile.username || 'Staff Member';
}

async function logAudit(action, details = {}) {
  try {
    if (!staffData.profile) return;
    await db.ref('audit_logs').push({
      action: action,
      staffId: staffData.profile.uid,
      staffName: getStaffName(),
      details: details,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      location: 'Staff Hub'
    });
  } catch (error) {
    console.error('Audit log failed:', error);
  }
}

function getFirebaseConsoleLink(node, id) {
  const options = firebase.app().options;
  const projectId = options.projectId;
  const instance = (options.databaseURL ? options.databaseURL.replace('https://', '').replace('.firebaseio.com', '') : projectId);
  return `https://console.firebase.google.com/project/${projectId}/database/${instance}/data/${node}/${id}`;
}
// ------------------------------------

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupAuthState();
  setupNavigation();
  setupEventListeners();
});

// Auth Guard & Role Verification
function setupAuthState() {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = 'staff-login.html';
      return;
    }

    try {
      // Verify role in staff_registry
      const snapshot = await db.ref('staff_registry/' + user.uid).once('value');
      const data = snapshot.val();

      if (!data) {
        showError('Access Denied: Not a registered staff member.');
        await auth.signOut();
        window.location.href = 'staff-login.html';
        return;
      }

      const processedName = data.fullName || data.name || data.displayName || data.username || 'Staff Member';
      staffData.profile = { uid: user.uid, ...data, name: processedName };

      // Notification manager setup removed

      // Update Redesigned Header
      const displayName = data.fullName || data.name || data.displayName || data.username || 'Staff Member';
      const rawRoles = Array.isArray(data.roles) ? data.roles : (typeof data.roles === 'string' ? data.roles.split(',') : [data.role || 'Staff']);
      const primaryRole = rawRoles[0].trim() || 'Authorized Staff';

      const displayNameEl = document.getElementById('staffDisplayName');
      const roleLabelEl = document.getElementById('staffRoleLabel');
      const avatarImg = document.getElementById('staffHeaderAvatar');
      const avatarIcon = document.getElementById('staffHeaderIcon');

      if (displayNameEl) displayNameEl.innerText = displayName;
      if (roleLabelEl) roleLabelEl.innerText = primaryRole;

      if (data.profileImage && avatarImg && avatarIcon) {
        avatarImg.src = data.profileImage;
        avatarImg.style.display = 'block';
        avatarIcon.style.display = 'none';
      } else if (avatarImg && avatarIcon) {
        avatarImg.style.display = 'none';
        avatarIcon.style.display = 'block';
      }

      document.body.style.display = 'block';
      
      // Initialize real-time listeners for badges and background data
      if (typeof window.loadDisputes === 'function') window.loadDisputes();
      
      // Also start verification and other background listeners if they exist
      if (typeof window.loadVerifications === 'function') window.loadVerifications();

    } catch (error) {
      console.error('Staff Auth verification failed:', error);
      window.location.href = 'staff-login.html';
    }
  });
}

// Navigation & RBAC Check
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = item.getAttribute('data-section');
      const requiredRole = item.getAttribute('data-role');

      if (verifyRole(requiredRole)) {
        showSection(section);
        // Highlight active nav
        navItems.forEach(ni => ni.classList.remove('active'));
        item.classList.add('active');
      } else {
        showAccessDenied();
      }
    });
  });
}

function verifyRole(requiredRole) {
  if (!staffData.profile) return false;

  const userRoles = Array.isArray(staffData.profile.roles)
    ? staffData.profile.roles
    : [staffData.profile.role || 'Staff'];

  // System Management has administrative access to all modules

  return userRoles.includes(requiredRole);
}

function showSection(sectionId) {

  staffData.activeSection = sectionId;

  // Hide splash
  const splash = document.querySelector('#staffSectionContent');
  if (splash) splash.style.display = 'none';

  // Hide all sections
  document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');

  // Show target
  const target = document.getElementById(sectionId + '-section');
  if (target) {
    target.style.display = 'block';
    loadModuleData(sectionId);
  }
}

function showAccessDenied() {
  const overlay = document.getElementById('accessDeniedOverlay');
  overlay.style.display = 'flex';
  setTimeout(() => {
    overlay.style.display = 'none';
  }, 3000);
}

function updateElementText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// Module Data Loaders (Mirrored from Admin)
function loadModuleData(moduleId) {
  switch (moduleId) {
    case 'users': loadUsersData(); break;
    case 'verification': loadVerificationData(); break;
    case 'product-verification': loadProductQueue(); break;
    case 'products': loadProductsData(); break;
    case 'orders': loadOrdersData(); break;
    case 'logistics': loadLogistics(); break;
    case 'wallet': loadWallet(); break;
    case 'escrow': loadEscrow(); break;
    case 'disputes': loadDisputes(); break;
    // analytics section removed

  }
}

// Global Search & Filter Engine Logic
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

  // Admin Dropdown Toggle (Refined)
  const adminUserBtn = document.getElementById('adminUserBtn');
  const adminDropdown = document.getElementById('adminDropdown');

  if (adminUserBtn && adminDropdown) {
    adminUserBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      adminDropdown.classList.toggle('show');
    });

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

      if (!requestId) return;

      switch (action) {
        case 'view':
          await window.openWithdrawalView(requestId);
          break;
        case 'approve':
          await window.openWithdrawalApprove(requestId);
          break;
        case 'reject':
          await window.openWithdrawalReject(requestId);
          break;
      }
    }
  });
}

function handleSearch(e) {
  const searchTerm = e.target.value;
  const id = e.target.id;
  const query = searchTerm.toLowerCase().trim();

  // 1. Update Global State
  if (id === 'userSearch') staffData.currentSearch.users = searchTerm;
  else if (id === 'productSearch') staffData.currentSearch.products = searchTerm;
  else if (id === 'orderSearch') staffData.currentSearch.orders = searchTerm;
  else if (id === 'disputeSearch') staffData.currentSearch.disputes = searchTerm;
  else if (id === 'verificationSearch') staffData.currentSearch.verification = searchTerm;
  else if (id === 'walletSearch') staffData.currentSearch.transactions = searchTerm;
  else if (id === 'escrowSearch') staffData.currentSearch.escrow = searchTerm;

  // 2. Specialized Rendering Calls
  if (id === 'userSearch') {
    updateUsersTable(searchTerm);
  } else if (id === 'productSearch') {
    updateProductsTable(searchTerm);
  } else if (id === 'orderSearch') {
    updateOrdersTable(searchTerm);
  } else if (id === 'walletSearch') {
    renderWalletTransactions();
  } else if (id === 'escrowSearch') {
    updateEscrowTable(searchTerm);
  } else if (id === 'disputeSearch') {
    updateDisputesTable(searchTerm);
  } else {
    // Generic Row-Hiding Fallback
    const tableId = id.replace('Search', 'Table');
    const tableMapping = {
      'userTable': 'usersTable',
      'productTable': 'productsTable'
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
    staffData.currentSearch.category = filterValue;
    updateProductsTable();
    return;
  }

  if (id === 'orderStatusFilter') {
    staffData.currentSearch.orderStatus = filterValue;
    updateOrdersTable();
    return;
  }

  if (id === 'escrowStatusFilter') {
    staffData.currentSearch.escrowStatus = filterValue;
    updateEscrowTable();
    return;
  }

  if (id === 'disputeStatusFilter') {
    staffData.currentSearch.disputeStatus = filterValue;
    updateDisputesTable();
    return;
  }

  // Generic Row-Hiding Fallback
  const tableId = id.replace('Filter', 'Table');
  const targetId = {
    'userTable': 'usersTable',
    'productTable': 'productsTable'
  }[tableId] || tableId;

  const table = document.getElementById(targetId);
  if (!table) return;

  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    if (!filterValue || filterValue === 'all') {
      row.style.display = '';
      return;
    }

    const dataStatus = row.getAttribute('data-status');
    const statusCell = row.querySelector('.badge, .status-badge');
    const statusText = dataStatus || (statusCell ? statusCell.textContent.toLowerCase() : '');

    row.style.display = statusText.includes(filterValue) ? '' : 'none';
  });
}

// Logistics Scanning Feature
window.searchTracking = async function () {
  const tid = document.getElementById('trackingIdInput').value.trim();
  if (!tid) return;

  const resultDiv = document.getElementById('trackingResult');
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

  try {
    const snapshot = await db.ref('orders').orderByChild('trackingId').equalTo(tid).once('value');
    if (!snapshot.exists()) {
      resultDiv.innerHTML = '<div class="text-danger">Invalid Tracking ID</div>';
      return;
    }

    let orderId, orderData;
    snapshot.forEach(child => {
      orderId = child.key;
      orderData = child.val();
    });

    renderTrackingUpdateUI(orderId, orderData);
  } catch (e) {
    console.error(e);
    resultDiv.innerHTML = '<div class="text-danger">Search failed</div>';
  }
}

function renderTrackingUpdateUI(orderId, order) {
  const resultDiv = document.getElementById('trackingResult');
  resultDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
                <h3>Order ${orderId}</h3>
                <p>Status: <span class="badge badge-info">${order.status}</span></p>
                <p>Buyer Hub: ${order.buyerHub || 'Not Assigned'}</p>
            </div>
            <div>
                <button class="btn btn-success" onclick="updateOrderStatus('${orderId}', 'Received at Seller Hub')">Received at Seller Hub</button>
                <button class="btn btn-primary" onclick="updateOrderStatus('${orderId}', 'In-Transit')">Dispatch</button>
            </div>
        </div>
        <hr style="margin: 1.5rem 0;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
            <div>
                <h4>Metadata</h4>
                <ul style="list-style: none; padding: 0;">
                    <li><strong>Seller UID:</strong> ${order.sellerId}</li>
                    <li><strong>Buyer UID:</strong> ${order.buyerId}</li>
                    <li><strong>Timestamp:</strong> ${new Date(order.createdAt).toLocaleString()}</li>
                </ul>
            </div>
            <div>
                <h4>Latest Scan Location</h4>
                <p>${order.lastScanLocation || 'Unknown'}</p>
            </div>
        </div>
    `;
}

window.updateOrderStatus = async function (orderId, newStatus) {
  try {
    await db.ref('orders/' + orderId).update({
      status: newStatus,
      lastScanLocation: 'Hub ID: ' + staffData.profile.uid,
      lastUpdatedAt: firebase.database.ServerValue.TIMESTAMP
    });

    // Audit Log
    await db.ref('audit_logs').push({
      staffId: staffData.profile.uid,
      action: 'Status Update: ' + newStatus,
      orderId: orderId,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      location: 'Central Logistics Hub'
    });

    showSuccess('Status updated successfully!');
    searchTracking(); // Refresh result
  } catch (e) {
    alert('Update failed: ' + e.message);
  }
}


window.deleteUser = async function (uid) {
  if (!confirm('PERMANENT DELETION: Are you sure you want to delete this user from AUTH and DB?')) return;

  try {
    const response = await fetch('/api/auth/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: uid })
    });

    if (!response.ok) throw new Error('Deletion failed');

    await logAudit('Permanently Deleted User', { deletedUid: uid });
    showSuccess('User permanently removed.');
    loadUsers();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}


/* --- SYNCED FROM ADMIN --- */
function updateUsersTable() {
  const tableBody = document.querySelector('#usersTable tbody');
  if (!tableBody) return;

  const filteredUsers = staffData.users.filter(user => {
    const roleLower = (user.role || "").toLowerCase();
    // Strictly hide ANY user that is not explicitly a buyer or a seller (e.g. Admin, Staff, System accounts, N/A)
    return roleLower === 'buyer' || roleLower === 'seller';
  });

  if (filteredUsers.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center">No users found</td>
      </tr>
    `;
    return;
  }

  // Sort users by most recent
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  try {
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

      const firebaseLink = getFirebaseConsoleLink('users', user.id);

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
          <button class="btn btn-sm btn-primary" onclick="viewUser('${user.id}')" title="View Intelligence Record">
              <i class="fas fa-eye"></i>
          </button>
        </td>
      </tr>
    `}).join('');
  } catch (err) {
    tableBody.innerHTML = '<tr><td colspan="7" class="text-danger">JavaScript Rendering Error: ' + err.message + '</td></tr>';
  }
}

async function updateOrdersTable(searchTerm) {
  const tableBody = document.querySelector('#ordersTable tbody');
  if (!tableBody) return;

  // Sync state if passed directly
  if (searchTerm !== undefined) staffData.currentSearch.orders = searchTerm;
  const query = (staffData.currentSearch.orders || "").toLowerCase().trim();
  const statusFilter = (staffData.currentSearch.orderStatus || "").toLowerCase().trim();

  let filteredOrders = staffData.orders || [];

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

  // 2. Apply Status Filter (Precise ID match)
  if (statusFilter) {
    filteredOrders = filteredOrders.filter(order => {
      const status = (order.status || "").toLowerCase();
      return status === statusFilter;
    });
  }

  if (filteredOrders.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center">No orders found matching your criteria</td>
      </tr>
    `;
    return;
  }

  // Show loading state in table briefly for feel
  tableBody.innerHTML = '<tr><td colspan="9" class="text-center"><i class="fas fa-spinner fa-spin"></i> Processing...</td></tr>';

  const rows = await Promise.all(filteredOrders.map(async (order) => {
    const date = order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A';
    const itemsCount = Array.isArray(order.items) ? order.items.length : 0;
    const itemsSummary = itemsCount > 0 ? `${itemsCount} item${itemsCount > 1 ? 's' : ''}` : 'No items';
    const total = order.total ? `RS ${parseFloat(order.total).toLocaleString()}` : 'RS 0';

    const buyerName = order.buyer ? order.buyer.name : (order.buyerName || 'Unknown');
    const buyerEmail = order.buyer ? order.buyer.email : (order.buyerEmail || 'N/A');
    const buyerId = order.buyerId || 'N/A';

    let sellerId = order.sellerId;
    let sellerName = order.sellerName;

    // Resolve User Details from cache or fetch if needed
    let sellerUser = staffData.users.find(u => u.id === sellerId);
    if (!sellerUser && sellerId && sellerId !== 'admin' && sellerId !== 'N/A') {
      try {
        const userSnap = await db.ref('users/' + sellerId).once('value');
        if (userSnap.exists()) {
          sellerUser = { id: sellerId, ...userSnap.val() };
          staffData.users.push(sellerUser);
        }
      } catch (e) { /* ignore */ }
    }

    const sellerDisplayName = sellerUser ? (sellerUser.name || sellerUser.displayName || sellerName) : (sellerName || 'Unknown');
    const sellerEmail = sellerUser ? sellerUser.email : 'N/A';
    const sellerDisplayId = sellerId || 'N/A';

    const tracking = order.trackingNumber ? order.trackingNumber : 'Pending';
    const firebaseLink = getFirebaseConsoleLink('orders', order.id);

    return `
    <tr data-status="${(order.status || 'pending').toLowerCase()}">
      <td>
        <a href="${firebaseLink}" target="_blank" title="View in Firebase Console" style="text-decoration: underline; color: #4f46e5; font-weight: bold;">
          ${order.id}
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
          <span class="small text-muted" style="font-size: 0.75rem;">ID: ${sellerDisplayId}</span>
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

function updateProductsTable() {
  const tableBody = document.querySelector('#productsTable tbody');
  if (!tableBody) return;

  if (staffData.products.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center">No products found</td>
      </tr>
    `;
    return;
  }

  try {
    tableBody.innerHTML = staffData.products.map((product, index) => {
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

      const firebaseLink = getFirebaseConsoleLink('products', product.id);

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
  } catch (err) {
    tableBody.innerHTML = '<tr><td colspan="8" class="text-danger">JavaScript Rendering Error: ' + err.message + '</td></tr>';
  }
}

// --- PORTED VERIFICATION LOGIC (ADMIN PARITY) ---
window.viewVerificationDetails = async function (userId) {

  try {
    const user = staffData.pendingVerifications.find(u => u.id === userId);

    // User lookup logic
    let targetUser = user;
    if (!targetUser) {

      targetUser = staffData.users.find(u => u.id === userId);
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
    const user = staffData.pendingVerifications.find(u => u.id === userId);
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
    const auditorUid = firebase.auth().currentUser.uid;
    const auditorName = staffData.profile?.fullName || staffData.profile?.name || 'Staff Member';

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
    await db.ref('global_notifications/admin_alerts').push({
      title: `${typeName} Verification Approved`,
      message: `${typeName} for user ID ${userId} has been approved by ${auditorName}.`,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      userId: userId,
      type: 'verification'
    });

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
    const user = staffData.pendingVerifications.find(u => u.id === userId);
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
    const auditorUid = firebase.auth().currentUser.uid;
    const auditorName = staffData.profile?.fullName || staffData.profile?.name || 'Staff Member';

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

function updateVerificationTable(searchTerm = '') {
  const tbody = document.getElementById('verificationTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  const filteredData = staffData.pendingVerifications.filter(user => {
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

  filteredData.forEach((user, index) => {
    const tr = document.createElement('tr');
    const seqId = (index + 1).toString().padStart(3, '0');
    const firebaseLink = getFirebaseConsoleLink('users', user.id);

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

function getStatusBadgeColor(status) {
  switch (status) {
    case 'approved': return 'success';
    case 'pending': return 'warning';
    case 'rejected': return 'danger';
    default: return 'secondary';
  }
}

function loadUsersData() {
  showLoading('users');
  db.ref('users').off('value');
  db.ref('users').on('value', (snapshot) => {
    try {
      const users = [];
      snapshot.forEach(child => {
        users.push({ id: child.key, ...child.val() });
      });

      staffData.users = users;

      updateUsersTable();
      updateElementText('usersCount', staffData.users.length);

      hideLoading('users');
    } catch (error) {
      console.error('Error in users data processing:', error);
      hideLoading('users');
    }
  }, (error) => {
    console.error('Error loading users data:', error);
    showError('Failed to load users data: ' + error.message);
    hideLoading('users');
  });
}

function loadOrdersData() {
  showLoading('orders');
  db.ref('orders').off('value');
  db.ref('orders').on('value', (snapshot) => {
    try {
      const orders = [];
      snapshot.forEach(child => {
        orders.push({ id: child.key, ...child.val() });
      });

      // Sort by date desc
      orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      staffData.orders = orders;

      // Calculate status counts using logistics-aligned buckets
      const statusCounts = {
        pending: staffData.orders.filter(o => o.status === 'pending').length,
        shipped: staffData.orders.filter(o => ['sent_to_hub', 'verified', 'in_transit', 'arrived_at_dest_hub', 'out_for_delivery'].includes(o.status)).length,
        delivered: staffData.orders.filter(o => o.status === 'delivered').length,
        disputed: staffData.orders.filter(o => o.status === 'disputed').length
      };

      // Update Dashboard Counters
      updateElementText('pendingOrdersCount', statusCounts.pending);
      updateElementText('shippedOrdersCount', statusCounts.shipped);
      updateElementText('deliveredOrdersCount', statusCounts.delivered);
      updateElementText('disputedOrdersCount', statusCounts.disputed);

      // Trigger re-render (Filtered)
      updateOrdersTable();

      hideLoading('orders');
    } catch (error) {
      console.error('Error in orders processing:', error);
      hideLoading('orders');
    }
  }, (error) => {
    console.error('Error loading orders data:', error);
    showError('Failed to load orders data: ' + error.message);
    hideLoading('orders');
  });
}

function loadProductsData() {
  showLoading('products');
  db.ref('products').off('value');
  db.ref('products').on('value', (snapshot) => {
    try {
      const products = [];
      if (snapshot.exists()) {
        snapshot.forEach(child => {
          products.push({ id: child.key, ...child.val() });
        });
      }

      staffData.products = products;

      updateProductsTable();
      updateElementText('productsCount', staffData.products.length);

      const pendingCount = products.filter(p => p.status === 'pending_verification' || p.verified === false).length;
      updateElementText('pendingProductsCount', pendingCount);

      hideLoading('products');
    } catch (error) {
      console.error('Error processing products:', error);
      hideLoading('products');
    }
  }, (error) => {
    console.error('Error loading products data:', error);
    showError('Failed to load products data: ' + error.message);
    hideLoading('products');
  });
}

function loadVerificationData() {
  showLoading('verification');
  db.ref('users').off('value');
  db.ref('users').on('value', (snapshot) => {
    try {
      const users = [];
      snapshot.forEach(child => {
        users.push({ id: child.key, ...child.val() });
      });

      // Filter users with pending verification
      staffData.pendingVerifications = users.filter(user => {
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
        // Shop Verification Section
        if (v.shop && v.shop.submitted && (v.shop.documentUrl || (v.shop.docUrls && v.shop.docUrls.length > 0)) && !v.shop.verified) {
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
      updateElementText('pendingVerificationsCount', staffData.pendingVerifications.length);
      updateElementText('pendingVerifications', staffData.pendingVerifications.length);

      hideLoading('verification');
    } catch (error) {
      console.error('Error processing verification data:', error);
      hideLoading('verification');
    }
  }, (error) => {
    console.error('Error loading verification data:', error);
    showError('Failed to load verification data: ' + error.message);
    hideLoading('verification');
  });
}


/* ========================================
   CRUD OPERATIONS & MODAL HANDLERS
   ======================================== */

// --- USER MANAGEMENT ---
window.viewUser = async function viewUser(userId) {
  try {
    console.log('🔍 Intelligence Record Requested for:', userId);
    let user = staffData.users.find(u => u.id === userId);
    if (!user) {
      try {
        showLoading('users');
        const snap = await db.ref('users/' + userId).once('value');
        if (snap.exists()) {
          user = { id: snap.key, ...snap.val() };
        } else {
          showError('User record not found in system.');
          return;
        }
      } catch (e) {
        console.error('DB Fetch Error:', e);
        return;
      } finally {
        hideLoading('users');
      }
    }

    const modal = document.getElementById('userDetailModal');
    if (!modal) {
      console.error('❌ DOM FAIL: userDetailModal not found');
      alert('Internal Error: Intelligence Modal container is missing from the page.');
      return;
    }

    // Safety populate helper
    const safeSetText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.innerText = text;
      else console.warn(`Missing element: ${id}`);
    };

    // Smart Address Formatter
    const formatAddress = (addr) => {
      if (!addr) return 'No verified address on file.';
      if (typeof addr === 'string') return addr;
      if (typeof addr === 'object') {
        const parts = [addr.street, addr.city, addr.state, addr.country, addr.zip].filter(Boolean);
        return parts.length > 0 ? parts.join(', ') : 'Incomplete Address Object';
      }
      return 'Invalid Address Data';
    };

    const displayName = user.fullName || user.displayName || user.name || 'Unknown User';
    safeSetText('uDetName', displayName);
    safeSetText('uDetEmail', user.email || 'No email provided');
    safeSetText('uDetId', user.id);
    safeSetText('uDetPhone', user.phone || 'N/A');

    const role = user.role || 'User';
    const roleEl = document.getElementById('uDetRole');
    if (roleEl) {
      roleEl.innerText = role;
      roleEl.className = `badge ${role === 'Admin' ? 'badge-danger' : (role === 'Staff' ? 'badge-info' : 'badge-success')}`;
    }

    safeSetText('uDetJoined', user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A');
    safeSetText('uDetAddress', formatAddress(user.address || user.verification?.shop?.address));

    const avatarImg = document.getElementById('uDetAvatar');
    if (avatarImg) {
      const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0D8ABC&color=fff&size=128&bold=true`;
      avatarImg.src = user.profileImage || user.photoURL || fallback;
    }

    // KYC Evidence Logic
    const kycGrid = document.getElementById('uDetKycGrid');
    if (kycGrid) {
      const v = user.verification || {};
      let kycHtml = '';

      if (v.cnic) {
        if (v.cnic.frontUrl) kycHtml += `<div style="background: #f1f5f9; padding:12px; border-radius:12px; text-align:center;"><p style="font-size:10px; font-weight:700; color:#64748b; margin-bottom:8px;">CNIC FRONT</p><a href="${v.cnic.frontUrl}" target="_blank"><img src="${v.cnic.frontUrl}" style="width:100%; height:80px; object-fit:cover; border-radius:8px;"></a></div>`;
        if (v.cnic.backUrl) kycHtml += `<div style="background: #f1f5f9; padding:12px; border-radius:12px; text-align:center;"><p style="font-size:10px; font-weight:700; color:#64748b; margin-bottom:8px;">CNIC BACK</p><a href="${v.cnic.backUrl}" target="_blank"><img src="${v.cnic.backUrl}" style="width:100%; height:80px; object-fit:cover; border-radius:8px;"></a></div>`;
      }
      if (v.selfie?.url) kycHtml += `<div style="background: #f1f5f9; padding:12px; border-radius:12px; text-align:center;"><p style="font-size:10px; font-weight:700; color:#64748b; margin-bottom:8px;">LIVE SELFIE</p><a href="${v.selfie.url}" target="_blank"><img src="${v.selfie.url}" style="width:100%; height:80px; object-fit:cover; border-radius:8px;"></a></div>`;
      if (v.shop?.documentUrl) kycHtml += `<div style="background: #f1f5f9; padding:12px; border-radius:12px; text-align:center;"><p style="font-size:10px; font-weight:700; color:#64748b; margin-bottom:8px;">SHOP DOC</p><a href="${v.shop.documentUrl}" target="_blank"><img src="${v.shop.documentUrl}" style="width:100%; height:80px; object-fit:cover; border-radius:8px;"></a></div>`;

      kycGrid.innerHTML = kycHtml || '<p style="grid-column: 1/-1; color: #94a3b8; font-size: 13px;">No KYC intelligence assets submitted yet.</p>';
    }

    // Pulse Stats
    const pulse = document.getElementById('uDetPulse');
    if (pulse) {
      const v = user.verification || {};
      let statusColor = '#94a3b8';
      let statusText = 'UNVERIFIED';

      if (v.cnic?.verified || v.shop?.verified) {
        statusColor = '#10b981';
        statusText = 'OFFICIALLY VERIFIED';
      } else if (v.cnic?.submitted || v.shop?.submitted) {
        statusColor = '#f59e0b';
        statusText = 'PENDING REVIEW';
      }

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
  } catch (err) {
    console.error('CRITICAL MODAL ERROR:', err);
    alert('Internal UI Error: ' + err.message);
  }
};

window.closeUserDetailModal = function () {
  const modal = document.getElementById('userDetailModal');
  if (modal) modal.style.display = 'none';
};



window.editUser = function (userId) {
  const user = staffData.users.find(u => u.id === userId);
  if (!user) return;

  document.getElementById('editUserId').value = userId;
  document.getElementById('editUserName').value = user.displayName || user.name || user.fullName || user.username || '';
  document.getElementById('editUserEmail').value = user.email || '';
  document.getElementById('editUserRole').value = user.role || 'Buyer';

  document.getElementById('editUserModal').style.display = 'block';
};

window.closeEditUserModal = function () {
  document.getElementById('editUserModal').style.display = 'none';
};

window.deleteUser = async function (userId) {
  if (!userId) return;
  if (!await showConfirmationModal('Delete User', 'WARNING: This will permanently delete the user from AUTH and the DATABASE. This action cannot be undone.', { confirmText: 'Delete Permanently', confirmColor: '#dc3545' })) return;

  try {
    showLoading(true, 'Permanently deleting user...');

    const response = await fetch('/api/auth/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: userId })
    });
    const result = await response.json();

    if (result.success) {
      showSuccess('User permanently removed');
    } else {
      // Fallback: Just remove from database if auth deletion fails/not available
      await db.ref(`users/${userId}`).remove();
      showSuccess('User removed from database (Auth might still exist)');
    }
  } catch (error) {
    showError('Error deleting user: ' + error.message);
  } finally {
    showLoading(false);
  }
};

// --- PRODUCT MANAGEMENT ---

window.viewProduct = function (productId) {
  const product = staffData.products.find(p => p.id === productId);
  if (!product) return;

  const modal = document.getElementById('productViewModal');
  const modalBody = document.getElementById('productViewBody');

  let imagesHtml = '';
  if (Array.isArray(product.images) && product.images.length > 0) {
    imagesHtml = `<div style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 20px; margin-bottom: 20px;">
          ${product.images.map(img => {
      const url = typeof img === 'string' ? img : (img.url || '/static/images/placeholder.jpg');
      return `<img src="${url}" style="height: 150px; border-radius: 8px; border: 1px solid #eee; cursor: pointer;" onclick="window.open('${url}', '_blank')">`;
    }).join('')}
      </div>`;
  } else if (product.img || product.image) {
    const url = product.img || product.image;
    imagesHtml = `<div style="margin-bottom: 20px; text-align: center;"><img src="${url}" style="max-height: 250px; border-radius: 8px; border: 1px solid #eee;"></div>`;
  }

  modalBody.innerHTML = `
      ${imagesHtml}
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <div>
              <h3 style="margin-top: 0; font-size: 1.4rem;">${product.title || product.name || 'N/A'}</h3>
              <p style="color: #666; line-height: 1.5;">${product.description || 'No description available.'}</p>
              <div style="margin-top: 15px;">
                <p><strong>Category:</strong> <span class="badge badge-info">${product.category || 'N/A'}</span></p>
                <p><strong>Brand:</strong> ${product.brand || 'N/A'}</p>
                <p><strong>Condition:</strong> ${product.condition || 'N/A'}</p>
              </div>
          </div>
          <div style="background: #f9fafb; padding: 20px; border-radius: 12px; height: fit-content;">
              <p style="font-size: 1.5rem; font-weight: bold; color: #4f46e5; margin-top: 0;">RS ${parseFloat(product.price || 0).toLocaleString()}</p>
              <p><strong>Stock:</strong> ${product.stock || 0}</p>
              <p><strong>Status:</strong> <span class="status-badge ${product.isActive !== false ? 'active' : 'inactive'}">${product.isActive !== false ? 'Active' : 'Inactive'}</span></p>
              <p><strong>Seller ID:</strong> <code style="font-size: 0.75rem;">${product.sellerId || 'N/A'}</code></p>
              <p><strong>Created:</strong> ${product.createdAt ? new Date(product.createdAt).toLocaleDateString() : 'N/A'}</p>
          </div>
      </div>
  `;

  modal.style.display = 'block';
};

window.closeProductViewModal = function () {
  const modal = document.getElementById('productViewModal');
  if (modal) modal.style.display = 'none';
};

window.editProduct = function (productId) {
  const product = staffData.products.find(p => p.id === productId);
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

window.deleteProduct = async function (productId) {
  if (!productId) return;
  if (!await showConfirmationModal('Delete Product', 'Are you sure you want to permanently delete this product? This action cannot be undone.', { confirmText: 'Delete', confirmColor: '#dc3545' })) return;

  try {
    showLoading(true, 'Deleting product...');
    await db.ref(`products/${productId}`).remove();
    showSuccess('Product deleted successfully');
  } catch (error) {
    showError('Error deleting product: ' + error.message);
  } finally {
    showLoading(false);
  }
};

// --- STATUS HELPERS (Synced with Admin) ---
function formatOrderStatus(status) {
  const mapping = {
    'pending': 'Order Placed',
    'sent_to_hub': 'Received at Origin Hub',
    'verified': 'Verified & Sealed',
    'in_transit': 'In Transit',
    'arrived_at_dest_hub': 'At Destination Hub',
    'out_for_delivery': 'Out for Delivery',
    'delivered': 'Delivered',
    'cancelled': 'Cancelled',
    'disputed': 'UNDER DISPUTE',
    'under_review': 'UNDER DISPUTE',
    'REFUNDED': 'DISPUTED',
    'refunded': 'DISPUTED',
    'refund': 'DISPUTED'
  };
  return mapping[status] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending');
}

function getStatusBadgeColor(status) {
  switch (status?.toLowerCase()) {
    case 'pending': return 'warning';
    case 'sent_to_hub': return 'info';
    case 'verified': return 'primary';
    case 'in_transit': return 'primary';
    case 'arrived_at_dest_hub': return 'info';
    case 'out_for_delivery': return 'success';
    case 'delivered': return 'success';
    case 'cancelled': return 'danger';
    case 'disputed': return 'danger';
    case 'under_review': return 'danger';
    case 'refunded': return 'danger';
    case 'REFUNDED': return 'danger';
    default: return 'secondary';
  }
}

// --- ORDER MANAGEMENT ---

// Order management logic consolidated below at line 3421



// --- UTILITY: CONFIRMATION MODAL ---

function showConfirmationModal(title, message, options = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmationModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const inputContainer = document.getElementById('confirmInputContainer');
    const input = document.getElementById('confirmInput');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const iconContainer = document.getElementById('confirmIconContainer');

    titleEl.textContent = title;
    messageEl.textContent = message;
    input.value = '';
    inputContainer.style.display = options.showInput ? 'block' : 'none';

    if (options.confirmText) okBtn.textContent = options.confirmText;
    else okBtn.textContent = 'Confirm Action';

    if (options.confirmColor) {
        okBtn.style.backgroundColor = options.confirmColor;
        if (iconContainer) {
            iconContainer.style.background = options.confirmColor + '20'; // 12% opacity
            iconContainer.style.color = options.confirmColor;
        }
    } else {
        okBtn.style.backgroundColor = '#4f46e5';
        if (iconContainer) {
            iconContainer.style.background = '#eef2ff';
            iconContainer.style.color = '#4f46e5';
        }
    }

    modal.style.display = 'flex';
    if (options.showInput) {
        setTimeout(() => input.focus(), 100);
    }

    const cleanup = () => {
      modal.style.display = 'none';
      okBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    okBtn.onclick = () => {
      const val = options.showInput ? input.value.trim() : true;
      if (options.showInput && !val) {
        showError('Please provide the required information');
        return;
      }
      cleanup();
      resolve(val);
    };

    cancelBtn.onclick = () => {
      cleanup();
      resolve(null);
    };
  });
}

// --- INITIALIZE FORM LISTENERS ---

function setupCRUDEventListeners() {
  // Edit User Form
  const editUserForm = document.getElementById('editUserForm');
  if (editUserForm) {
    editUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userId = document.getElementById('editUserId').value;
      const name = document.getElementById('editUserName').value;
      const role = document.getElementById('editUserRole').value;

      try {
        showLoading(true, 'Updating user...');
        await db.ref(`users/${userId}`).update({
          displayName: name,
          name: name,
          role: role
        });
        showSuccess('User updated successfully');
        closeEditUserModal();
      } catch (err) {
        showError(err.message);
      } finally {
        showLoading(false);
      }
    });
  }

  // Edit Product Form
  const editProductForm = document.getElementById('editProductForm');
  if (editProductForm) {
    editProductForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const productId = document.getElementById('editProductId').value;
      const name = document.getElementById('editProductName').value;
      const price = parseFloat(document.getElementById('editProductPrice').value);
      const stock = parseInt(document.getElementById('editProductStock').value);
      const category = document.getElementById('editProductCategory').value;
      const isActive = document.getElementById('editProductStatus').value === 'true';

      try {
        showLoading(true, 'Updating product...');
        await db.ref(`products/${productId}`).update({
          title: name,
          name: name,
          price: price,
          stock: stock,
          category: category,
          isActive: isActive
        });
        showSuccess('Product updated successfully');
        closeProductEditModal();
      } catch (err) {
        showError(err.message);
      } finally {
        showLoading(false);
      }
    });
  }

  // Click outside to close modals
  window.addEventListener('click', (event) => {
    const modals = ['editUserModal', 'productViewModal', 'productEditModal', 'orderViewModal', 'verificationModal', 'confirmationModal'];
    modals.forEach(id => {
      const modal = document.getElementById(id);
      if (event.target === modal) {
        modal.style.display = 'none';
      }
    });
  });
}

// Call setup once dashboard is initialized
// In staff-dashboard.js, this should be part of initializeDashboard()
// I will append a call to it in the next step or here if I can see where it's called.
setTimeout(setupCRUDEventListeners, 1000); // Fail-safe init
/* --- PRODUCT VERIFICATION LOGIC --- */

/**
 * Load Product Verification Queue
 */
function loadProductQueue() {
  showLoading('product-verification');
  db.ref('products').off('value');
  db.ref('products').on('value', (snapshot) => {
    try {
      const allProducts = [];
      const pendingProducts = [];
      if (snapshot.exists()) {
        snapshot.forEach(child => {
          const product = { id: child.key, ...child.val() };
          allProducts.push(product);
          if (product.status === 'pending_verification') {
            pendingProducts.push(product);
          }
        });
      }

      staffData.products = allProducts;
      staffData.pendingProducts = pendingProducts;

      updateElementText('pendingProductsCount', pendingProducts.length);
      renderProductVerificationTable();

      hideLoading('product-verification');
    } catch (error) {
      console.error('Error in product queue processing:', error);
      hideLoading('product-verification');
    }
  }, (error) => {
    console.error('Error loading product queue:', error);
    showError('Failed to load product queue: ' + error.message);
    hideLoading('product-verification');
  });
}

function renderProductVerificationTable() {
  const tableBody = document.getElementById('productVerificationTableBody');
  if (!tableBody) return;

  if (!staffData.pendingProducts || staffData.pendingProducts.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="8" class="text-center">No products pending verification</td></tr>';
    return;
  }

  tableBody.innerHTML = staffData.pendingProducts.map(product => {
    const mainImage = product.images && product.images.length > 0
      ? (product.images.find(img => img.isMain)?.url || product.images[0].url)
      : (product.image || '/static/img/placeholder.png');

    const price = parseFloat(product.price || 0).toLocaleString();

    return `
      <tr>
        <td>${product.id}</td>
        <td>
            <div class="product-img-container">
                <img src="${mainImage}" class="product-img-mini" onerror="this.src='/static/img/placeholder.png'">
            </div>
        </td>
        <td class="fw-bold">${product.name}</td>
        <td>${product.sellerName || 'Unknown'}</td>
        <td><span class="badge bg-light text-dark">${product.category}</span></td>
        <td>RS ${price}</td>
        <td><span class="status-badge pending">PENDING</span></td>
        <td>
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-primary" onclick="viewProduct('${product.id}')" title="View Details">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn btn-sm btn-success" onclick="approveProduct('${product.id}')" title="Approve Listing">
              <i class="fas fa-check"></i>
            </button>
            <button class="btn btn-sm btn-danger" onclick="rejectProduct('${product.id}')" title="Reject Listing">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.approveProduct = async function (productId) {
  if (!await showConfirmationModal('Approve Product', 'Are you sure you want to approve this product listing? It will be visible to all users.', { confirmText: 'Approve Listing', confirmColor: '#10b981' })) return;

  try {
    showLoading(true);
    await db.ref('products/' + productId).update({
      verified: true,
      isActive: true,
      status: 'active',
      verifiedBy: staffData.profile?.uid || 'Unknown Staff',
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });

    // Notify Seller with Professional Routing
    const auditorUid = firebase.auth().currentUser.uid;
    const productSnap = await db.ref('products/' + productId).once('value');
    const productData = productSnap.val();

    if (productData && productData.sellerId && productData.sellerId !== auditorUid) {
      await db.ref(`users/${productData.sellerId}/notifications`).push({
        title: 'Product Approved',
        message: `Your listing "${productData.name}" has been approved and is now live!`,
        type: 'shop',
        read: false,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });
    }

    // Global Admin Trail
    const auditorName = staffData.profile?.fullName || staffData.profile?.name || 'Staff Member';
    await db.ref('global_notifications/admin_alerts').push({
      title: 'Product Approved',
      message: `Product "${productData?.name || productId}" was approved by ${auditorName}.`,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      userId: productData?.sellerId,
      type: 'shop'
    });

    showSuccess('Product approved successfully');
    await logAudit('Approved Product', { productId: productId });
  } catch (e) {
    showError('Failed to approve product: ' + e.message);
  } finally {
    showLoading(false);
  }
}

window.rejectProduct = async function (productId) {
  const reason = await showConfirmationModal('Reject Product', 'Please provide a reason for rejecting this product listing:', {
    showInput: true,
    confirmText: 'Reject Listing',
    confirmColor: '#ef4444'
  });
  
  if (!reason) return;

  try {
    showLoading(true);

    // Get product data first for notification
    const productSnap = await db.ref('products/' + productId).once('value');
    const productData = productSnap.val();
    const auditorUid = firebase.auth().currentUser.uid;

    await db.ref('products/' + productId).update({
      verified: false,
      isActive: false,
      status: 'rejected',
      rejectionReason: reason,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });

    // Notify Seller with Professional Routing
    if (productData && productData.sellerId && productData.sellerId !== auditorUid) {
      await db.ref(`users/${productData.sellerId}/notifications`).push({
        title: 'Listing Rejected',
        message: `Your product "${productData.name}" was rejected. Reason: ${reason}`,
        type: 'alert',
        read: false,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });
    }

    // Global Admin Trail
    const auditorName = staffData.profile?.fullName || staffData.profile?.name || 'Staff Member';
    await db.ref('global_notifications/admin_alerts').push({
      title: 'Listing Rejected',
      message: `Product "${productData?.name || productId}" was rejected by ${auditorName}. Reason: ${reason}`,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      userId: productData?.sellerId,
      type: 'alert'
    });

    showSuccess('Product rejected successfully');
    await logAudit('Rejected Product', { productId: productId, reason: reason });
  } catch (e) {
    showError('Failed to reject product: ' + e.message);
  } finally {
    showLoading(false);
  }
}

function exportProductQueue() {
  showSuccess('Exporting product verification queue as CSV...');
}

// Ensure all global functions are attached to window
window.loadProductQueue = loadProductQueue;
window.approveProduct = approveProduct;
window.rejectProduct = rejectProduct;
window.exportProductQueue = exportProductQueue;
window.renderProductVerificationTable = renderProductVerificationTable;

/* --- LOGISTICS HUB LOGIC --- */
function loadLogistics() {
  showLoading('logistics');
  db.ref('orders').on('value', (snapshot) => {
    try {
      const orders = [];
      snapshot.forEach(child => orders.push({ id: child.key, ...child.val() }));

      const logisticsActivity = orders.filter(o => o.status === 'shipped' || o.status === 'delivered')
        .map(o => ({ id: o.id, orderId: o.id, status: o.status, trackingNumber: o.trackingNumber, timestamp: o.createdAt }));

      staffData.logistics = {
        providers: [
          { id: 'tcs', name: 'TCS Express', status: 'active', activeShipments: orders.filter(o => o.status === 'shipped').length },
          { id: 'leopards', name: 'Leopards Courier', status: 'inactive', activeShipments: 0 },
          { id: 'postex', name: 'PostEx', status: 'inactive', activeShipments: 0 }
        ],
        activity: logisticsActivity
      };

      updateLogisticsUI();
      hideLoading('logistics');
    } catch (e) {
      console.error('Logistics error:', e);
      hideLoading('logistics');
    }
  });
}

function updateLogisticsUI() {
  const providersBody = document.getElementById('logisticsProvidersTableBody');
  const activityBody = document.getElementById('logisticsActivityTableBody');
  if (providersBody && staffData.logistics.providers) {
    providersBody.innerHTML = staffData.logistics.providers.map(p => `
            <tr>
                <td class="fw-bold">${p.name}</td>
                <td><span class="status-badge ${p.status === 'active' ? 'active' : 'inactive'}">${p.status.toUpperCase()}</span></td>
                <td>${p.activeShipments}</td>
                <td>${p.status === 'active' ? '98.5%' : '-'}</td>
            </tr>
        `).join('');
  }
  if (activityBody && staffData.logistics.activity) {
    activityBody.innerHTML = staffData.logistics.activity.map(a => `
            <tr>
                <td>${a.orderId}</td>
                <td><span class="badge badge-${getStatusBadgeColor(a.status)}">${a.status.toUpperCase()}</span></td>
                <td><code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${a.trackingNumber || 'PENDING'}</code></td>
                <td>${new Date(a.timestamp).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="viewOrder('${a.orderId}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `).join('');
  }
}

/* --- WALLET & FINANCE LOGIC --- */
// ========================================

async function loadWallet() {
  showLoading('wallet');

  try {
    // 0. Load Users (for ID mapping)
    const userSnapshot = await db.ref('users').once('value');
    const users = [];
    userSnapshot.forEach(child => {
      users.push({ id: child.key, ...child.val() });
    });
    // Sort users by createdAt to ensure consistent ID numbering
    users.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    staffData.users = users; // Save to global data

    // Map for faster lookups
    users.forEach(u => { globalUsersMap[u.id] = u; });

    // 1. Load Deposits
    db.ref('deposits').on('value', (snapshot) => {
      const deposits = [];
      snapshot.forEach(child => {
        deposits.push({ id: child.key, ...child.val() });
      });
      // Sort by date desc
      deposits.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      staffData.deposits = deposits;
      renderDeposits(deposits);
      updateWalletStats();
    });

    // 2. Load Withdrawals (Merging legacy 'withdrawals' and new 'withdrawal_requests')
    const syncWithdrawals = () => {
      const wNode1 = db.ref('withdrawals');
      const wNode2 = db.ref('withdrawal_requests');

      const processSnap = (snap1, snap2) => {
        const merged = new Map();

        const data1 = snap1 && snap1.exists() ? snap1.val() : {};
        const data2 = snap2 && snap2.exists() ? snap2.val() : {};

        Object.entries(data1).forEach(([key, val]) => {
          if (val) merged.set(key, { id: key, ...val });
        });

        Object.entries(data2).forEach(([key, val]) => {
          if (val) merged.set(key, { id: key, ...val });
        });

        const withdrawals = Array.from(merged.values());
        
        // Robust sorting with fallback to timestamp or 0
        withdrawals.sort((a, b) => {
          const timeA = a.createdAt || a.timestamp || 0;
          const timeB = b.createdAt || b.timestamp || 0;
          return timeB - timeA;
        });

        console.log('🏦 Staff Wallet Sync: Processed', withdrawals.length, 'withdrawals');

        staffData.withdrawals = withdrawals;
        renderWithdrawals(withdrawals);

        // Update Header Count for debugging/visibility
        const countHeader = document.querySelector('#withdrawalsTableBody')?.closest('.content-card')?.querySelector('h3');
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
      staffData.transactions = transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      renderWalletTransactions();
    });

  } catch (error) {
    console.error('Error loading wallet data:', error);
    showError('Error loading wallet data');
  } finally {
    hideLoading('wallet');
  }
}

async function updateWalletStats() {
  try {
    const deposits = staffData.deposits || [];
    const withdrawals = staffData.withdrawals || [];

    // 1. Total System Balance (Sum of all user wallets)
    let totalBalance = 0;
    try {
      const usersSnap = await db.ref('users').once('value');
      if (usersSnap.exists()) {
        usersSnap.forEach(snap => {
          const userData = snap.val();
          if (userData && userData.wallet) {
            totalBalance += (userData.wallet.balance || 0);
          }
        });
      }
    } catch (e) { }
    updateElementText('totalSystemBalance', `RS ${totalBalance.toLocaleString()}`);

    // 2. Pending Withdrawals
    const pendingWithdrawals = withdrawals.filter(w => {
      const s = String(w.status || w.Status || w.state || 'pending').toLowerCase().trim();
      return s !== 'completed' && s !== 'rejected' && s !== 'approved' && s !== 'success';
    });
    const totalPendingWithdrawals = pendingWithdrawals.reduce((sum, w) => sum + (parseFloat(w.amount) || 0), 0);
    updateElementText('totalPendingWithdrawals', `RS ${totalPendingWithdrawals.toLocaleString()}`);

    // 3. Pending Deposits
    const pendingDeposits = deposits.filter(d => d.status === 'pending');
    const totalPendingDepositsAmount = pendingDeposits.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    updateElementText('totalPendingDeposits', `RS ${totalPendingDepositsAmount.toLocaleString()}`);

    // 4. Completed Withdrawals
    const completedWithdrawalsCount = withdrawals.filter(w => w.status === 'approved').length;
    updateElementText('completedWithdrawalsCount', completedWithdrawalsCount);

  } catch (error) {
    console.error('Error updating wallet stats:', error);
  }
}

function getUserDisplayId(userId) {
  if (!staffData.users) return 'User #---';
  const index = staffData.users.findIndex(u => u.id === userId);
  if (index === -1) return 'User #---';
  return `User #${String(index + 1).padStart(3, '0')}`;
}

function getStatusBadgeColor(status) {
  const s = (status || '').toLowerCase();
  switch (s) {
    case 'pending': return 'warning';
    case 'approved':
    case 'completed':
    case 'success':
      return 'success';
    case 'rejected':
    case 'failed':
      return 'danger';
    default: return 'info';
  }
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
                        <div class="fw-bold" style="color: #1e293b;">${deposit.userName || 'Unknown'}</div>
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
                <a href="${deposit.screenshotUrl}" target="_blank" class="btn btn-sm btn-outline-info" style="border-radius: 6px; font-weight: 600; padding: 4px 10px;">
                    <i class="fas fa-image" style="margin-right: 4px;"></i> View
                </a>
            </td>
            <td><span class="badge bg-${getStatusBadgeColor(deposit.status)}">${deposit.status}</span></td>
            <td>${new Date(deposit.createdAt).toLocaleDateString()}</td>
            <td>
                <div class="d-flex align-items-center gap-1">
                    <button class="btn btn-sm btn-outline-primary" onclick="openDepositView('${deposit.id}')" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${deposit.status === 'pending' ? `
                    <button class="btn btn-sm btn-success" onclick="approveDeposit('${deposit.id}')" title="Approve">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="rejectDeposit('${deposit.id}')" title="Reject">
                        <i class="fas fa-times"></i>
                    </button>
                    ` : ''}
                </div>
            </td>
        `;
    tbody.appendChild(tr);
  });
}

function renderWithdrawals(withdrawals) {
  const tbody = document.getElementById('withdrawalsTableBody');
  if (!tbody) return;

  const filter = (document.getElementById('withdrawalStatusFilter')?.value || 'pending').toLowerCase();
  
  console.log('🔍 Staff Rendering Withdrawals. Filter:', filter, 'Total Count:', withdrawals.length);

  const filteredWithdrawals = withdrawals.filter(w => {
    const s = String(w.status || w.Status || w.state || 'pending').toLowerCase().trim();
    // console.log(`   -> Item ID: ${w.id}, Resolved Status: "${s}"`);
    
    if (filter === 'all') return true;
    if (filter === 'pending') {
      return s !== 'completed' && s !== 'rejected' && s !== 'approved' && s !== 'success';
    }
    return s === filter;
  });

  console.log('✅ Staff Filtered Count:', filteredWithdrawals.length);

  if (filteredWithdrawals.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">No withdrawal requests found</td></tr>';
    return;
  }

  tbody.innerHTML = filteredWithdrawals.map((w, index) => {
    const requestId = w.id ? w.id : String(index + 1).padStart(3, '0');
    const userDisplayId = getUserDisplayId(w.userId);

    // Use data attributes for event delegation
    const viewBtn = `
      <button class="btn btn-sm btn-outline-primary withdrawal-action-btn" 
              data-action="view" 
              data-id="${w.id}" 
              title="View Details">
        <i class="fas fa-eye"></i>
      </button>`;

    const approveBtn = w.status === 'pending' ? `
      <button class="btn btn-sm btn-success withdrawal-action-btn" 
              data-action="approve" 
              data-id="${w.id}" 
              title="Approve">
        <i class="fas fa-check"></i>
      </button>` : '';

    const rejectBtn = w.status === 'pending' ? `
      <button class="btn btn-sm btn-danger withdrawal-action-btn" 
              data-action="reject" 
              data-id="${w.id}" 
              title="Reject">
        <i class="fas fa-times"></i>
      </button>` : '';

    return `
    <tr>
      <td>#${requestId}</td>
      <td>
        <div class="d-flex align-items-center">
            <div>
                <div class="fw-bold" style="color: #1e293b;">${w.userName || 'Unknown'}</div>
                <div class="text-muted small">
                    <a href="#" class="view-user-link" data-user-id="${w.userId}" style="text-decoration: none; color: #667eea; font-weight: 600;">
                        ${userDisplayId}
                    </a>
                </div>
            </div>
        </div>
      </td>
      <td>RS ${parseFloat(w.amount || 0).toLocaleString()}</td>
      <td>${w.bankDetails?.bankName || 'N/A'}</td>
      <td>${w.bankDetails?.title || '-'}</td>
      <td><span class="badge badge-${w.status === 'approved' ? 'success' : w.status === 'rejected' ? 'danger' : 'warning'}">${w.status || 'pending'}</span></td>
      <td>${w.createdAt ? new Date(w.createdAt).toLocaleDateString() : 'N/A'}</td>
      <td>
        <div class="d-flex align-items-center gap-1">
          ${viewBtn}
          ${approveBtn}
          ${rejectBtn}
        </div>
      </td>
    </tr>
    `;
  }).join('');
}

function getUserName(uid) {
  if (!uid) return 'Unknown User';
  const u = globalUsersMap[uid];
  if (!u) return 'Unknown User';
  return u.fullName || u.displayName || u.name || u.username || 'Unknown User';
}

function renderWalletTransactions() {
  const tbody = document.getElementById('walletTransactionsTableBody');
  if (!tbody) return;

  const query = (staffData.currentSearch.transactions || "").toLowerCase().trim();
  let transactions = staffData.transactions || [];

  if (query) {
    transactions = transactions.filter(t => {
      const id = (t.id || "").toLowerCase();
      const user = (t.userName || t.user || "").toLowerCase();
      const type = (t.type || t.title || "").toLowerCase();
      const status = (t.status || "").toLowerCase();
      return id.includes(query) || user.includes(query) || type.includes(query) || status.includes(query);
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

    const transUser = t.userName || t.user || getUserName(t.userId);
    const userDisplayId = getUserDisplayId(t.userId);
    const dateStr = t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'N/A';

    return `
      <tr>
        <td style="font-family: monospace; font-weight: 600; color: #64748b;">${t.id || 'N/A'}</td>
        <td>
            <div class="d-flex align-items-center">
                <div>
                    <div class="fw-bold" style="color: #1e293b;">${transUser}</div>
                    <div class="text-muted small" style="color: #94a3b8; font-weight: 500;">${userDisplayId}</div>
                </div>
            </div>
        </td>
        <td style="font-weight: 500;">${t.type || t.title || 'Transaction'}</td>
        <td style="font-weight: 700; color: #1e293b;">RS ${(t.amount || 0).toLocaleString()}</td>
        <td><span class="badge badge-${statusClass}" style="padding: 5px 10px; border-radius: 6px;">${status}</span></td>
        <td style="color: #64748b;">${dateStr}</td>
      </tr>
    `;
  }).join('');
}

// Action Handlers
async function approveDeposit(id) {
  if (!await showConfirmationModal('Approve Deposit', 'Are you sure you want to approve this deposit?', { confirmText: 'Approve', confirmColor: '#28a745' })) return;
  try {
    showLoading(true);
    const snapshot = await db.ref(`deposits/${id}`).once('value');
    const deposit = snapshot.val();

    await db.ref(`deposits/${id}`).update({ status: 'approved', processedAt: firebase.database.ServerValue.TIMESTAMP });

    // Update User Wallet
    const userWalletRef = db.ref(`users/${deposit.userId}/wallet`);
    await userWalletRef.transaction(wallet => {
      if (!wallet) wallet = { balance: 0, total_deposited: 0, in_escrow: 0, total_withdrawn: 0 };
      wallet.balance = (wallet.balance || 0) + deposit.amount;
      wallet.total_deposited = (wallet.total_deposited || 0) + deposit.amount;
      return wallet;
    });

    // Notify User
    await db.ref(`users/${deposit.userId}/notifications`).push({
      title: 'Deposit Approved',
      message: `Your deposit of RS ${deposit.amount.toLocaleString()} has been approved.`,
      type: 'payment',
      read: false,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    showSuccess('Deposit approved');
  } catch (e) { showError(e.message); } finally { showLoading(false); }
}

async function rejectDeposit(id) {
  const reason = await showConfirmationModal('Reject Deposit', 'Please provide a reason for rejecting this deposit request:', {
    showInput: true,
    confirmText: 'Reject Deposit',
    confirmColor: '#ef4444'
  });
  
  if (!reason) return;
  try {
    showLoading(true);
    await db.ref(`deposits/${id}`).update({ status: 'rejected', reason: reason });

    const depSnap = await db.ref(`deposits/${id}`).once('value');
    const dep = depSnap.val();

    await db.ref(`users/${dep.userId}/notifications`).push({
      title: 'Deposit Rejected',
      message: `Your deposit request for RS ${dep.amount.toLocaleString()} was declined. Reason: ${reason}`,
      type: 'alert',
      read: false,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    showSuccess('Deposit rejected');
  } catch (e) { showError(e.message); } finally { showLoading(false); }
}

async function releaseEscrow(id) {
  if (!await showConfirmationModal('Release Escrow', 'Are you sure? This will transfer funds to the seller.')) return;
  try {
    showLoading(true);
    await db.ref(`escrows/${id}`).update({ status: 'released', releasedAt: firebase.database.ServerValue.TIMESTAMP });
    showSuccess('Escrow released');
  } catch (e) { showError(e.message); } finally { showLoading(false); }
}

// Global Variables for Modals
let currentWithdrawalId = null;
let currentWithdrawalData = null;
let globalUsersMap = {};

// Modal Controllers
window.openDepositView = async function (depositId) {
  try {
    const snapshot = await db.ref('deposits/' + depositId).once('value');
    const data = snapshot.val();
    if (!data) {
      showError('Deposit not found');
      return;
    }

    document.getElementById('viewDepUserName').textContent = data.userName || 'Unknown';
    document.getElementById('viewDepAmount').textContent = 'RS ' + parseFloat(data.amount || 0).toLocaleString();
    document.getElementById('viewDepRequestId').textContent = '#' + depositId;
    document.getElementById('viewDepMethod').querySelector('span').textContent = data.method || 'Not specified';
    document.getElementById('viewDepRequestDate').textContent = new Date(data.createdAt).toLocaleString();

    const statusEl = document.getElementById('viewDepStatus');
    const status = (data.status || 'pending').toLowerCase();
    statusEl.textContent = status.toUpperCase();
    if (status === 'approved' || status === 'completed' || status === 'success') {
      statusEl.style.background = '#dcfce7';
      statusEl.style.color = '#166534';
    } else if (status === 'rejected' || status === 'failed') {
      statusEl.style.background = '#fee2e2';
      statusEl.style.color = '#991b1b';
    } else {
      statusEl.style.background = '#fef3c7';
      statusEl.style.color = '#92400e';
    }

    const imgEl = document.getElementById('viewDepScreenshot');
    const placeholderEl = document.getElementById('viewDepScreenshotPlaceholder');
    const linkEl = document.getElementById('viewDepScreenshotLink');

    if (data.screenshotUrl) {
      imgEl.src = data.screenshotUrl;
      imgEl.style.display = 'block';
      placeholderEl.style.display = 'none';
      linkEl.href = data.screenshotUrl;
      linkEl.style.display = 'inline-block';
    } else {
      imgEl.style.display = 'none';
      placeholderEl.style.display = 'block';
      linkEl.style.display = 'none';
    }

    document.getElementById('depositViewModal').style.display = 'block';
  } catch (error) {
    showError('Failed to load deposit details');
  }
};

window.closeDepositViewModal = () => document.getElementById('depositViewModal').style.display = 'none';

async function openWithdrawalView(requestId) {
  try {
    const snapshot = await db.ref('withdrawal_requests/' + requestId).once('value');
    let data = snapshot.val();
    if (!data) {
      const legacySnap = await db.ref('withdrawals/' + requestId).once('value');
      data = legacySnap.val();
    }
    if (!data) {
      showError('Withdrawal not found');
      return;
    }

    let balance = 'RS 0';
    if (data.userId) {
      const walletSnap = await db.ref(`users/${data.userId}/wallet`).once('value');
      const wallet = walletSnap.val();
      balance = wallet ? 'RS ' + (wallet.balance || 0).toLocaleString() : 'RS 0';
    }

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
    document.getElementById('withdrawalViewModal').style.display = 'block';
  } catch (error) {
    showError('Failed to load withdrawal details');
  }
}

// Redundant processing functions removed (using window.* equivalents below)

window.closeWithdrawalViewModal = () => document.getElementById('withdrawalViewModal').style.display = 'none';
window.closeWithdrawalApproveModal = () => document.getElementById('withdrawalApproveModal').style.display = 'none';
window.closeWithdrawalRejectModal = () => document.getElementById('withdrawalRejectModal').style.display = 'none';

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

    const headers = ['ID', 'User Name', 'User ID', 'Amount', 'Method', 'Details', 'Status', 'Date'];
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

    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
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

/* --- ESCROW MANAGEMENT ENGINE --- */
// ========================================

async function loadEscrow() {
  showLoading('escrow');
  try {
    // 1. Setup Real-time Listener
    db.ref('escrows').on('value', (snapshot) => {
      const escrows = [];
      snapshot.forEach(child => {
        escrows.push({ id: child.key, ...child.val() });
      });

      // Sort by date desc
      escrows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      staffData.escrows = escrows;

      updateEscrowTable();
      updateEscrowStats();
      hideLoading('escrow');
    });
  } catch (error) {
    console.error('Error in loadEscrow:', error);
    showError('Failed to initialize Escrow listener');
    hideLoading('escrow');
  }
}

function updateEscrowStats() {
  const escrows = staffData.escrows || [];
  const now = Date.now();
  const last24h = now - (24 * 60 * 60 * 1000);

  let totalHeld = 0;
  let activeHolds = 0;
  let released24h = 0;

  escrows.forEach(e => {
    const amount = parseFloat(e.amount || 0);
    const status = (e.status || "").toLowerCase();

    if (status === 'held' || status === 'holding') {
      totalHeld += amount;
      activeHolds++;
    } else if (status === 'released' && e.releasedAt >= last24h) {
      released24h += amount;
    }
  });

  updateElementText('staffEscrowValue', 'RS ' + totalHeld.toLocaleString());
  updateElementText('staffActiveHoldsCount', activeHolds.toLocaleString());
  updateElementText('staffReleased24h', 'RS ' + released24h.toLocaleString());
}

function updateEscrowTable(searchTerm) {
  const tbody = document.getElementById('escrowTableBody');
  if (!tbody) return;

  if (searchTerm !== undefined) staffData.currentSearch.escrow = searchTerm;
  const query = (staffData.currentSearch.escrow || "").toLowerCase().trim();
  const statusFilter = (staffData.currentSearch.escrowStatus || "").toLowerCase();

  let escrows = staffData.escrows || [];

  // Apply status filter
  if (statusFilter) {
    escrows = escrows.filter(e => {
      const s = (e.status || "").toLowerCase();
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
      return id.includes(query) || orderId.includes(query) || status.includes(query);
    });
  }

  if (escrows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">${query ? 'No matching escrows' : 'No active escrows'}</td></tr>`;
    return;
  }

  tbody.innerHTML = escrows.map(escrow => {
    const amount = parseFloat(escrow.amount || 0).toLocaleString();
    const status = (escrow.status || 'pending').toLowerCase();

    let statusClass = 'pending';
    if (status === 'released') statusClass = 'delivered';
    else if (status === 'disputed' || status === 'refunded') statusClass = 'cancelled';
    else if (status === 'holding' || status === 'held') statusClass = 'pending';

    const date = escrow.createdAt ? new Date(escrow.createdAt).toLocaleDateString() : 'N/A';
    const displayStatus = escrow.orderStatus ? formatOrderStatus(escrow.orderStatus) : (status.charAt(0).toUpperCase() + status.slice(1));
    const canRelease = status === 'holding' || status === 'held';

    return `
      <tr>
        <td>${escrow.id}</td>
        <td><a href="#" onclick="viewOrder('${escrow.orderId}'); return false;">${escrow.orderId}</a></td>
        <td>RS ${amount}</td>
        <td><span class="status-badge ${statusClass}">${displayStatus}</span></td>
        <td>${date}</td>
        <td>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-sm ${canRelease ? 'btn-success' : 'btn-secondary'}" 
                    ${!canRelease ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} 
                    onclick="releaseEscrow('${escrow.id}')" title="Release Funds">
              <i class="fas fa-check"></i>
            </button>
            <button class="btn btn-sm btn-primary" onclick="viewOrder('${escrow.orderId}')" title="View Details">
              <i class="fas fa-eye"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function releaseEscrow(escrowId) {
  try {
    showLoading(true, 'Verifying order status...');
    const escrowRef = db.ref(`escrows/${escrowId}`);
    const snapshot = await escrowRef.once('value');
    const escrow = snapshot.val();

    if (!escrow) throw new Error('Escrow record not found');
    if (escrow.status === 'released') throw new Error('Funds already released');
    if (escrow.status === 'releasing') throw new Error('Release already in progress. Please wait.');

    // ATOMIC LOCK: Claim the escrow before touching any wallets.
    // This transaction prevents two simultaneous calls from both passing
    // the status check, which would cause the seller to be credited twice.
    let lockAcquired = false;
    await escrowRef.transaction(current => {
      if (!current) return; // abort if null
      if (current.status === 'released' || current.status === 'releasing') {
        return; // abort — already claimed by another call
      }
      lockAcquired = true;
      current.status = 'releasing'; // atomic claim
      return current;
    });

    if (!lockAcquired) {
      showLoading(false);
      showError('This escrow is already being processed or was already released.');
      return;
    }


    // 1. Resolve Order & Seller
    const orderSnap = await db.ref(`orders/${escrow.orderId}`).once('value');
    const order = orderSnap.val();
    if (!order) throw new Error('Order not found');

    if ((order.status || '').toLowerCase() !== 'delivered' && (order.status || '').toLowerCase() !== 'completed') {
      throw new Error('Cannot release funds. Order status must be Delivered.');
    }

    showLoading(false);
    
    if (!await showConfirmationModal('Release Funds', 'Are you sure you want to release these funds to the seller? This action is permanent.', { confirmText: 'Release Now', confirmColor: '#10b981' })) {
      throw new Error('Release cancelled by user.');
    }

    showLoading(true, 'Processing fund transfer...');

    let sellerId = order.sellerId || escrow.sellerId;

    // Robust seller resolution (Mirrored from viewOrder logic)
    if ((!sellerId || sellerId === 'admin') && order.items && order.items.length > 0) {
      // 1. Check first item's metadata
      if (order.items[0].sellerId && order.items[0].sellerId !== 'admin') {
        sellerId = order.items[0].sellerId;
      } 
      // 2. Deep lookup from products node if still unresolved
      else if (order.items[0].id) {
        try {
          const productSnap = await db.ref('products/' + order.items[0].id).once('value');
          if (productSnap.exists()) {
            const pData = productSnap.val();
            sellerId = pData.sellerId || pData.uid || sellerId;
          }
        } catch (e) {
          console.warn('Deep seller lookup failed for escrow release:', e);
        }
      }
    }

    if (!sellerId || sellerId === 'admin') throw new Error('Invalid seller ID: The system could not resolve the actual merchant for this order.');

    // 2. Calculate Payout (Seller receives Product Price only)
    let payoutAmount = 0;
    const subtotal = parseFloat(order.subtotal);
    
    if (!isNaN(subtotal) && subtotal > 0) {
        payoutAmount = subtotal;
    } else if (order.items && order.items.length > 0) {
        // Fallback: Sum items
        payoutAmount = order.items.reduce((sum, item) => sum + (parseFloat(item.price) * (parseInt(item.qty) || 1)), 0);
    }

    // Safety check: Payout cannot exceed (Total - Fee)
    const maxPayout = totalAmount - escrowFee;
    if (payoutAmount > maxPayout || payoutAmount <= 0) {
        payoutAmount = maxPayout;
    }

    // For audit/logging only — use real data from order
    const escrowFee = parseFloat(order.escrowFee) || 0;
    const shippingFee = parseFloat(order.shippingTotal) || 0;

    const updates = {};
    updates[`escrows/${escrowId}/status`] = 'released';
    updates[`escrows/${escrowId}/releasedAt`] = firebase.database.ServerValue.TIMESTAMP;
    updates[`orders/${escrow.orderId}/status`] = 'completed';
    updates[`orders/${escrow.orderId}/paymentStatus`] = 'paid';

    // 3. Atomically Update Wallets
    const buyerId = order.buyerId || escrow.buyerId;
    
    // Credit Seller
    const walletRef = db.ref(`users/${sellerId}/wallet`);
    await walletRef.transaction(wallet => {
      if (!wallet) wallet = { balance: 0, totalEarned: 0 };
      wallet.balance = (wallet.balance || 0) + payoutAmount;
      wallet.totalEarned = (wallet.totalEarned || 0) + payoutAmount;
      return wallet;
    });

    // Deduct from Buyer's Escrow Hold
    if (buyerId) {
      const buyerWalletRef = db.ref(`users/${buyerId}/wallet`);
      await buyerWalletRef.transaction(wallet => {
        if (wallet) {
          wallet.in_escrow = Math.max(0, (wallet.in_escrow || 0) - totalAmount);
        }
        return wallet;
      });
    }

    // 4. Record Transaction
    const txnId = db.ref('walletTransactions').push().key;
    updates[`walletTransactions/${txnId}`] = {
      userId: sellerId,
      type: 'credit',
      amount: payoutAmount,
      fee: escrowFee,
      description: `Payment for Order #${escrow.orderId} (Net of Fee)`,
      referenceId: escrow.orderId,
      status: 'completed',
      createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    // 5. Notify Seller
    const notifId = db.ref(`users/${sellerId}/notifications`).push().key;
    updates[`users/${sellerId}/notifications/${notifId}`] = {
      title: 'Payment Received',
      message: `RS ${payoutAmount.toLocaleString()} has been credited for Order #${escrow.orderId}.`,
      type: 'payment',
      read: false,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };

    await db.ref().update(updates);
    showSuccess('Escrow funds released successfully');
  } catch (error) {
    console.error('Error releasing escrow:', error);
    showError(error.message);
    // If we claimed the lock but failed mid-way, reset so staff can retry
    try {
      const checkSnap = await db.ref(`escrows/${escrowId}/status`).once('value');
      if (checkSnap.val() === 'releasing') {
        await db.ref(`escrows/${escrowId}/status`).set('holding');
      }
    } catch (resetErr) {
      console.warn('Could not reset escrow lock:', resetErr);
    }
  } finally {
    showLoading(false);
  }
}

window.exportEscrow = async function () {
  const escrows = staffData.escrows || [];
  if (escrows.length === 0) {
    showError('No escrow data to export');
    return;
  }

  const headers = ['Escrow ID', 'Order ID', 'Amount', 'Status', 'Created'];
  const rows = escrows.map(e => [
    e.id,
    e.orderId,
    e.amount,
    e.status,
    new Date(e.createdAt).toLocaleString()
  ]);

  const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `escrow_report_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};

// Global exports
// Dispute Resolution Management

function updateDisputesTable(searchTerm) {
  const tableBody = document.querySelector('#disputesTable tbody');
  if (!tableBody) return;

  // Sync state if passed directly (from engine or search event)
  if (searchTerm !== undefined) staffData.currentSearch.disputes = searchTerm;
  const query = (staffData.currentSearch.disputes || "").toLowerCase().trim();
  const statusFilter = (staffData.currentSearch.disputeStatus || "").toLowerCase().trim();

  let disputes = staffData.disputes || [];

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
      <td>${dispute.id}</td>
      <td><a href="#" onclick="viewOrder('${dispute.orderId}'); return false;">${dispute.orderId || 'N/A'}</a></td>
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

// Global exports (Restructured to avoid ReferenceErrors)
window.loadLogistics = loadLogistics;
window.loadWallet = loadWallet;
window.loadEscrow = loadEscrow;
// analytics export removed
window.approveDeposit = approveDeposit;
window.rejectDeposit = rejectDeposit;
window.releaseEscrow = releaseEscrow;
window.filterDeposits = () => renderDeposits(staffData.deposits);
window.filterWithdrawals = () => renderWithdrawals(staffData.withdrawals);
// Withdrawal processing assigned as window functions below

// Redundant global delegation listener removed (moved to setupEventListeners)

/* --- DETAILED VIEW HANDLERS (LOGISTICS & DISPUTES) --- */

window.viewOrder = async function (orderId) {
  if (!orderId || orderId === 'undefined' || orderId === 'null') {
    showError('Invalid Order ID');
    return;
  }

  let order = staffData.orders.find(o => o.id === orderId);

  // Fetch if not in cache
  if (!order) {
    try {
      showLoading(true, 'Fetching order details...');
      const snapshot = await db.ref(`orders/${orderId}`).once('value');
      if (snapshot.exists()) {
        order = { id: snapshot.key, ...snapshot.val() };
        staffData.orders.push(order);
      } else {
        showError('Order Details not found.');
        return;
      }
    } catch (e) {
      showError('Error fetching order details: ' + e.message);
      return;
    } finally {
      showLoading(false);
    }
  }

  const modal = document.getElementById('orderViewModal');
  const modalBody = document.getElementById('orderViewBody');

  const formatCurrency = (amount) => `RS ${parseFloat(amount || 0).toLocaleString()}`;

  // Buyer Details
  const buyerName = order.buyer ? order.buyer.name : (order.buyerName || 'Unknown');
  const buyerEmail = order.buyer ? order.buyer.email : (order.buyerEmail || 'N/A');
  const buyerPhone = order.buyer ? order.buyer.phone : (order.buyerPhone || 'N/A');
  const buyerAddress = order.buyer ? order.buyer.address : (order.shippingAddress || 'N/A');

  // Seller Details Logic (Robust Fallback for "Actual Seller")
  let sellerId = order.sellerId;
  let sellerName = order.sellerName || 'Unknown';

  // 1. If seller is generic admin, try first item's internal sellerId
  if ((!sellerId || sellerId === 'admin') && order.items && order.items.length > 0) {
    if (order.items[0].sellerId && order.items[0].sellerId !== 'admin') {
      sellerId = order.items[0].sellerId;
    }
  }

  // 2. Database Deep lookup (if still admin) - Check actual product owner
  if ((!sellerId || sellerId === 'admin') && order.items && order.items.length > 0 && order.items[0].id) {
    try {
      const productSnap = await db.ref('products/' + order.items[0].id).once('value');
      if (productSnap.exists()) {
        const pData = productSnap.val();
        if (pData.sellerId && pData.sellerId !== 'admin') {
          sellerId = pData.sellerId;
        } else if (pData.uid && pData.uid !== 'admin') {
          sellerId = pData.uid;
        }
      }
    } catch (e) {
      console.error('Deep seller lookup failed:', e);
    }
  }

  // 3. Resolve User Profile
  let sellerUser = staffData.users.find(u => u.id === sellerId);

  if (!sellerUser && sellerId && sellerId !== 'admin') {
    try {
      const userSnap = await db.ref('users/' + sellerId).once('value');
      if (userSnap.exists()) {
        sellerUser = { id: sellerId, ...userSnap.val() };
        staffData.users.push(sellerUser);
      }
    } catch (e) { console.error('Seller fetch error:', e); }
  }

  const sellerDisplayName = sellerUser ? (sellerUser.name || sellerUser.displayName || sellerName) : sellerName;
  const sellerEmail = sellerUser ? sellerUser.email : 'N/A';

  const itemsHtml = (order.items || []).map(item => `
    <div style="display: flex; gap: 15px; margin-bottom: 12px; padding: 10px; background: white; border-radius: 8px; border: 1px solid #f1f5f9;">
      <img src="${item.image || item.img || '/static/images/placeholder.jpg'}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px;" onerror="this.src='/static/images/placeholder.jpg'">
      <div style="flex: 1;">
        <div style="font-weight: 600;">${item.title || item.name}</div>
        <div style="color: #6b7280; font-size: 0.85rem;">${formatCurrency(item.price)} x ${item.quantity || 1}</div>
      </div>
      <div style="font-weight: 600; color: #111827;">${formatCurrency((item.price || 0) * (item.quantity || 1))}</div>
    </div>
  `).join('');

  modalBody.innerHTML = `
    <!-- High-Fidelity Multi-Section Modal (Admin Standard) -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
      
      <!-- Left Column: Details & Information -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        
        <!-- Order Info Table -->
        <div style="background: #f9fafb; padding: 16px; border-radius: 12px; border: 1px solid #e5e7eb;">
          <h4 style="margin: 0 0 12px 0; color: #374151; font-size: 1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">Order Info</h4>
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 0.9rem;">
            <span style="color: #6b7280;">Order ID:</span> <span style="font-weight: 500;">#${order.id}</span>
            <span style="color: #6b7280;">Date:</span> <span style="font-weight: 500;">${new Date(order.createdAt).toLocaleString()}</span>
            <span style="color: #6b7280;">Status:</span> <span><span class="badge badge-${getStatusBadgeColor(order.status)}">${formatOrderStatus(order.status)}</span></span>
            <span style="color: #6b7280;">Total:</span> <span style="font-weight: 600; color: #059669;">${formatCurrency(order.total)}</span>
          </div>
        </div>

        <!-- Customer Details -->
        <div style="background: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0;">
          <h4 style="margin: 0 0 12px 0; color: #374151; font-size: 1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">Customer Details</h4>
          <div style="font-size: 0.9rem; line-height: 1.6;">
            <p style="margin: 4px 0;"><strong>Name:</strong> ${buyerName}</p>
            <p style="margin: 4px 0;"><strong>Email:</strong> ${buyerEmail}</p>
            <p style="margin: 4px 0;"><strong>Phone:</strong> ${buyerPhone}</p>
            <p style="margin: 4px 0;"><strong>Address:</strong> ${buyerAddress}</p>
            <p style="margin: 4px 0; font-size: 0.8rem; color: #64748b;">Buyer ID: ${order.buyerId}</p>
          </div>
        </div>

        <!-- Seller Details -->
        <div style="background: #fdf2f2; padding: 16px; border-radius: 12px; border: 1px solid #fee2e2;">
          <h4 style="margin: 0 0 12px 0; color: #991b1b; font-size: 1rem; border-bottom: 1px solid #fecaca; padding-bottom: 8px;">Seller Details</h4>
          <div style="font-size: 0.9rem;">
            <p style="margin: 4px 0;"><strong>Name:</strong> ${sellerDisplayName}</p>
            <p style="margin: 4px 0;"><strong>Email:</strong> ${sellerEmail}</p>
            <p style="margin: 4px 0; font-size: 0.8rem; color: #991b1b;">Seller ID: ${sellerId}</p>
          </div>
        </div>

      </div>

      <!-- Right Column: items & Financials -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        
        <!-- Order Items -->
        <div style="background: white; border: 1px solid #e5e7eb; padding: 16px; border-radius: 12px;">
          <h4 style="margin: 0 0 12px 0; color: #374151; font-size: 1rem;">Order Items</h4>
          <div style="max-height: 280px; overflow-y: auto; padding-right: 5px;">
            ${itemsHtml}
          </div>
          
          <!-- Financial Summary -->
          <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #f1f5f9;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 0.9rem;">
              <span style="color: #64748b;">Subtotal:</span>
              <span>${formatCurrency(order.subtotal || (parseFloat(order.total) - parseFloat(order.shippingTotal || 0)))}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 0.9rem;">
              <span style="color: #64748b;">Shipping:</span>
              <span>${formatCurrency(order.shippingTotal)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 0.9rem;">
              <span style="color: #64748b;">Escrow Fee:</span>
              <span>${formatCurrency(order.escrowFee || 0)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 1.15rem; margin-top: 10px; color: #111827; border-top: 2px solid #f1f5f9; padding-top: 8px;">
              <span>Total Amount:</span>
              <span>${formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        <!-- High-Fidelity 6-Stage Tracking Stepper -->
        <div style="background: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0;">
          <h4 style="margin: 0 0 15px 0; color: #374151; font-size: 1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">Shipment Tracking</h4>
          
          <div style="margin: 25px 0;">
            ${(() => {
      const currentStatus = (order.status || 'pending').toLowerCase();

      // Define status-to-index mapping (6 stages)
      let currentIndex = 0;
      if (currentStatus === 'delivered' || currentStatus === 'completed') currentIndex = 5;
      else if (currentStatus === 'out_for_delivery') currentIndex = 4;
      else if (currentStatus === 'at_destination_hub') currentIndex = 3;
      else if (currentStatus === 'in_transit' || currentStatus === 'shipped') currentIndex = 2;
      else if (currentStatus === 'received_at_hub' || currentStatus === 'verified' || currentStatus === 'picked_up') currentIndex = 1;
      else currentIndex = 0;

      const stageLabels = ['Ordered', 'Processing', 'In Transit', 'At Hub', 'Delivery', 'Delivered'];
      const stageIcons = ['fa-clock', 'fa-box-open', 'fa-route', 'fa-warehouse', 'fa-truck-fast', 'fa-check-double'];

      return `
          <div style="display: flex; justify-content: space-between; position: relative; margin-bottom: 10px; padding: 0 10px;">
              <!-- Line Background -->
              <div style="position: absolute; top: 15px; left: 10px; right: 10px; height: 3px; background: #e5e7eb; z-index: 0;"></div>
              <!-- Active Line -->
              <div style="position: absolute; top: 15px; left: 10px; width: calc(${currentIndex / 5 * 100}% - 20px); height: 3px; background: #10b981; z-index: 0; transition: width 0.5s ease; min-width: 0;"></div>

              ${stageLabels.map((label, idx) => `
                <div style="position: relative; z-index: 1; text-align: center; flex: 1;">
                    <div style="width: 30px; height: 30px; background: ${currentIndex >= idx ? '#10b981' : '#f3f4f6'}; color: ${currentIndex >= idx ? 'white' : '#9ca3af'}; border: 2px solid ${currentIndex >= idx ? '#10b981' : '#e5e7eb'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto; box-shadow: ${currentIndex === idx ? '0 0 0 4px rgba(16, 185, 129, 0.2)' : 'none'}; transition: all 0.3s ease;">
                        <i class="fas ${currentIndex > idx ? 'fa-check' : stageIcons[idx]}" style="font-size: 0.8rem;"></i>
                    </div>
                    <div style="font-size: 0.65rem; margin-top: 8px; color: ${currentIndex >= idx ? '#111827' : '#9ca3af'}; font-weight: ${currentIndex >= idx ? '700' : '500'}; white-space: nowrap;">${label}</div>
                </div>
              `).join('')}
          </div>
        `;
    })()}
          </div>
          
          <div style="font-size: 0.85rem; background: white; padding: 12px; border-radius: 8px; border: 1px solid #e5e7eb;">
            <p style="margin: 4px 0;"><strong>Tracking ID:</strong> <code>${order.trackingNumber || 'PENDING'}</code></p>
            <p style="margin: 4px 0;"><strong>Courier:</strong> ${order.courier || 'TCS Express'}</p>
            <p style="margin: 4px 0;"><strong>Location:</strong> ${order.escrowLocation || 'F-8 Islamabad'}</p>
          </div>
        </div>
      </div>
    </div>
  `;

  // Set current status in select
  const select = document.getElementById('updateStatusSelect');
  if (select) select.value = (order.status || 'pending').toLowerCase();

  modal.style.display = 'block';
};

window.closeOrderViewModal = function () {
  const modal = document.getElementById('orderViewModal');
  if (modal) modal.style.display = 'none';
};

window.pushStatusUpdate = async function (orderId) {
  const newStatus = document.getElementById('updateStatusSelect').value;
  if (!await showConfirmationModal('Push Logistics Update', `Are you sure you want to change order status to ${newStatus}? This will notify both buyer and seller.`)) return;

  try {
    showLoading(true, 'Pushing update to network...');
    await db.ref(`orders/${orderId}`).update({
      status: newStatus,
      lastScanLocation: 'Staff ID: ' + getStaffName() + ' - Hub Portal',
      lastUpdatedAt: firebase.database.ServerValue.TIMESTAMP
    });

    await logAudit('Logistics Status Push', { orderId: orderId, newStatus: newStatus });
 
    // Push to Tracking History (Consistent with Backend)
    const friendlyStatus = formatOrderStatus(newStatus);
    const location = 'Staff ID: ' + getStaffName() + ' - Hub Portal';
    
    await db.ref(`tracking_history/${orderId}`).push({
      status: newStatus,
      displayStatus: friendlyStatus,
      desc: `Logistics status updated by Hub Operator.`,
      location: location,
      staffId: getStaffName(),
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    // Notify Buyer and Seller
    const orderSnap = await db.ref(`orders/${orderId}`).once('value');
    const order = orderSnap.val();
    if (order) {
      const notif = {
        title: 'Shipment Update',
        message: `Order ${orderId} is now: ${friendlyStatus}`,
        type: 'order',
        read: false,
        link: order.buyerId ? `orders.html#${orderId}` : '',
        timestamp: firebase.database.ServerValue.TIMESTAMP
      };
      if (order.buyerId) await db.ref(`users/${order.buyerId}/notifications`).push(notif);
      if (order.sellerId) {
        const sellerNotif = { ...notif, link: `orders.html#${orderId}` };
        await db.ref(`users/${order.sellerId}/notifications`).push(sellerNotif);
      }
    }

    showSuccess('Logistics status updated successfully');

    // Refresh detail view
    viewOrder(orderId);
  } catch (e) {
    showError(e.message);
  } finally {
    showLoading(false);
  }
};

window.editTracking = async function (orderId) {
  const newTracking = await showConfirmationModal('Update Tracking', 'Enter the new tracking number for this order:', {
    showInput: true,
    confirmText: 'Update Tracking',
    confirmColor: '#4f46e5'
  });
  
  if (newTracking === null) return;

  try {
    showLoading(true);
    await db.ref(`orders/${orderId}`).update({ trackingNumber: newTracking });

    // Notify parties
    const orderSnap = await db.ref(`orders/${orderId}`).once('value');
    const order = orderSnap.val();
    if (order) {
      const notif = {
        title: 'Tracking Updated',
        message: `Tracking number for order ${orderId} has been updated to: ${newTracking}`,
        type: 'order',
        read: false,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      };
      await db.ref(`users/${order.buyerId}/notifications`).push(notif);
      await db.ref(`users/${order.sellerId}/notifications`).push(notif);
    }

    showSuccess('Tracking updated');
    viewOrder(orderId);
  } catch (e) { showError(e.message); } finally { showLoading(false); }
};

// Dispute actions are now centralized in static/js/disputes-engine.js 
// shared between Admin and Staff dashboards for operational parity.
window.pushStatusUpdate = pushStatusUpdate;
window.editTracking = editTracking;

/* --- FINAL MANAGEMENT ACTIONS (USERS & WITHDRAWALS) --- */

window.deleteUser = async function (userId) {
  if (!userId) return;
  if (!await showConfirmationModal('Delete User', 'WARNING: This will permanently delete the user from AUTH and the DATABASE. This action cannot be undone.', { confirmText: 'Delete Permanently', confirmColor: '#dc3545' })) return;

  try {
    showLoading('users');
    const response = await fetch('/api/auth/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: userId })
    });

    await db.ref(`users/${userId}`).remove();
    await logAudit('Permanently Deleted User', { deletedUid: userId });
    showSuccess('User successfully removed from system.');
  } catch (error) {
    showError('Error deleting user: ' + error.message);
  } finally {
    hideLoading('users');
  }
};

// Helper function to get withdrawal data from either collection (for staff dashboard)
async function getStaffWithdrawalData(requestId) {
  try {
    if (!requestId) {
      console.error('getStaffWithdrawalData: requestId is empty');
      return null;
    }

    // Try withdrawal_requests first
    let snapshot = await db.ref(`withdrawal_requests/${requestId}`).once('value');
    if (snapshot.exists()) {
      const data = snapshot.val();
      if (!data) {
        console.error('getStaffWithdrawalData: snapshot.val() returned null/undefined for withdrawal_requests');
        return null;
      }
      // Ensure the ID is included in the returned object
      return { ...data, id: requestId };
    }

    // Fall back to withdrawals collection
    snapshot = await db.ref(`withdrawals/${requestId}`).once('value');
    if (snapshot.exists()) {
      const data = snapshot.val();
      if (!data) {
        console.error('getStaffWithdrawalData: snapshot.val() returned null/undefined for withdrawals');
        return null;
      }
      // Migrate to withdrawal_requests for compatibility with new API
      try {
        await db.ref(`withdrawal_requests/${requestId}`).set(data);
      } catch (migrationError) {
        console.warn('Failed to migrate withdrawal to new collection:', migrationError);
      }
      // Ensure the ID is included in the returned object
      return { ...data, id: requestId };
    }

    console.warn(`getStaffWithdrawalData: No withdrawal found with ID ${requestId}`);
    return null;
  } catch (error) {
    console.error('Error in getStaffWithdrawalData:', error);
    return null;
  }
}

// Three-action withdrawal management functions
window.openWithdrawalView = async function (requestId) {
  try {
    const request = await getStaffWithdrawalData(requestId);

    if (!request) {
      showError('Withdrawal request not found');
      return;
    }

    // Check if userId exists
    if (!request.userId) {
      console.error('Withdrawal request missing userId:', request);
      showError('Withdrawal data is incomplete (missing user ID)');
      return;
    }

    // Get user's current balance
    let currentBalance = 0;
    try {
      const userRef = db.ref(`users/${request.userId}/wallet`);
      const userSnap = await userRef.once('value');
      const wallet = userSnap.val() || {};
      currentBalance = wallet.balance || 0;
    } catch (balanceError) {
      console.warn('Could not fetch user balance:', balanceError);
      currentBalance = 0;
    }

    // Safely parse amount
    const amount = parseFloat(request.amount || 0);
    if (isNaN(amount)) {
      console.warn('Invalid amount in withdrawal request:', request.amount);
    }

    // Safely handle bankDetails
    const bankDetails = request.bankDetails || {};
    const bankTitle = typeof bankDetails.title === 'string' ? bankDetails.title : 'N/A';
    const bankName = typeof bankDetails.bankName === 'string' ? bankDetails.bankName : 'N/A';
    const accountNumber = typeof bankDetails.accountNumber === 'string' ? bankDetails.accountNumber : 'N/A';

    // Safely parse date
    let requestDate = 'N/A';
    try {
      requestDate = new Date(request.createdAt || Date.now()).toLocaleString();
    } catch (dateError) {
      console.warn('Invalid date in withdrawal request:', request.createdAt);
      requestDate = new Date().toLocaleString();
    }

    document.getElementById('viewRequestId').textContent = requestId;
    document.getElementById('viewUserName').textContent = request.userName || 'Unknown';
    document.getElementById('viewAmount').textContent = `RS ${amount.toLocaleString()}`;
    document.getElementById('viewCurrentBalance').textContent = `RS ${currentBalance.toLocaleString()}`;
    document.getElementById('viewAccountTitle').textContent = bankTitle;
    document.getElementById('viewBankName').textContent = bankName;
    document.getElementById('viewAccountNumber').textContent = accountNumber;
    document.getElementById('viewRequestDate').textContent = requestDate;
    document.getElementById('viewStatus').textContent = request.status || 'pending';

    document.getElementById('withdrawalViewModal').style.display = 'block';
  } catch (error) {
    console.error('Error opening withdrawal view:', error);
    showError('Failed to load withdrawal details: ' + error.message);
  }
};

window.openWithdrawalApprove = async function (requestId) {
  try {
    const request = await getStaffWithdrawalData(requestId);

    if (!request) {
      showError('Withdrawal request not found');
      return;
    }

    // Check if userId exists
    if (!request.userId) {
      console.error('Withdrawal request missing userId:', request);
      showError('Withdrawal data is incomplete (missing user ID)');
      return;
    }

    // Case-insensitive status check — allow any non-finalized status
    const status = String(request.status || '').toLowerCase().trim();
    if (status === 'completed' || status === 'rejected' || status === 'approved' || status === 'success') {
      showError('This withdrawal has already been processed');
      return;
    }

    // Safely parse amount
    const amount = parseFloat(request.amount || 0);
    
    // Safely handle bankDetails
    const bankDetails = request.bankDetails || {};
    const bankName = typeof bankDetails.bankName === 'string' ? bankDetails.bankName : 'N/A';
    const accountNumber = typeof bankDetails.accountNumber === 'string' ? bankDetails.accountNumber : 'N/A';

    currentWithdrawalId = requestId;
    currentWithdrawalData = request;

    document.getElementById('approveRequestId').value = requestId;
    document.getElementById('approveUserName').textContent = request.userName || 'Unknown';
    document.getElementById('approveAmount').textContent = `RS ${amount.toLocaleString()}`;
    document.getElementById('approveBankDetails').textContent = `${bankName} - ${accountNumber}`;

    // Get user's current balance
    let currentBalance = 0;
    try {
      const userRef = db.ref(`users/${request.userId}/wallet`);
      const userSnap = await userRef.once('value');
      const wallet = userSnap.val() || {};
      currentBalance = wallet.balance || 0;
    } catch (balanceError) {
      console.warn('Could not fetch user balance:', balanceError);
    }
    document.getElementById('approveCurrentBalance').textContent = `RS ${currentBalance.toLocaleString()}`;

    // Reset UI elements
    const proofUpload = document.getElementById('proofUpload');
    if (proofUpload) proofUpload.value = '';
    const staffPreview = document.getElementById('staffUploadPreview');
    if (staffPreview) staffPreview.classList.remove('visible');
    const adminNote = document.getElementById('adminNote');
    if (adminNote) adminNote.value = '';

    document.getElementById('withdrawalApproveModal').style.display = 'block';
  } catch (error) {
    console.error('Error opening approval modal:', error);
    showError('Failed to load withdrawal details: ' + error.message);
  }
};

window.openWithdrawalReject = async function (requestId) {
  try {
    const request = await getStaffWithdrawalData(requestId);

    if (!request) {
      showError('Withdrawal request not found');
      return;
    }

    // Case-insensitive status check
    const status = String(request.status || '').toLowerCase().trim();
    if (status === 'completed' || status === 'rejected' || status === 'approved' || status === 'success') {
      showError('This withdrawal has already been processed');
      return;
    }

    // Check if userId exists (needed for backend API)
    if (!request.userId) {
      console.error('Withdrawal request missing userId:', request);
      showError('Withdrawal data is incomplete (missing user ID)');
      return;
    }

    // Safely parse amount
    const amount = parseFloat(request.amount || 0);

    currentWithdrawalId = requestId;
    currentWithdrawalData = request;

    document.getElementById('rejectRequestId').value = requestId;
    document.getElementById('rejectUserName').textContent = request.userName || 'Unknown';
    document.getElementById('rejectAmount').textContent = `RS ${amount.toLocaleString()}`;

    // Reset reason input
    const rejectReason = document.getElementById('rejectReason');
    if (rejectReason) rejectReason.value = '';

    document.getElementById('withdrawalRejectModal').style.display = 'block';
  } catch (error) {
    console.error('Error opening rejection modal:', error);
    showError('Failed to load withdrawal details: ' + error.message);
  }
};

window.closeWithdrawalViewModal = function () {
  document.getElementById('withdrawalViewModal').style.display = 'none';
};

window.closeWithdrawalApproveModal = function () {
  document.getElementById('withdrawalApproveModal').style.display = 'none';
};

window.closeWithdrawalRejectModal = function () {
  document.getElementById('withdrawalRejectModal').style.display = 'none';
};

// File preview for staff upload zone
window.handleStaffFileSelect = function(input) {
  const preview = document.getElementById('staffUploadPreview');
  const filename = document.getElementById('staffUploadFilename');
  if (input.files && input.files[0]) {
    if (preview) { preview.classList.add('visible'); }
    if (filename) { filename.textContent = input.files[0].name; }
  }
};

window.processWithdrawalApproval = async function () {
  const requestId = document.getElementById('approveRequestId').value;
  const proofFile = document.getElementById('proofUpload').files[0];
  const adminNote = document.getElementById('adminNote').value;

  if (!proofFile) {
    showError('Please upload payment proof screenshot');
    return;
  }

  try {
    showLoading('wallet');

    // Upload proof to Firebase Storage (use 'withdrawals' path for compatibility with storage rules)
    const timestamp = Date.now();
    const filename = `withdrawals/${requestId}/${timestamp}_${proofFile.name}`;
    const storageRef = firebase.storage().ref(filename);
    const uploadTask = await storageRef.put(proofFile);
    const proofUrl = await uploadTask.ref.getDownloadURL();

    // Call backend API to approve payout
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
        adminNote: adminNote || '',
        staffId: firebase.auth().currentUser?.uid || 'Staff'
      })
    });

    const result = await response.json();
    if (result.success) {
      showSuccess('Withdrawal approved and payout completed');
      closeWithdrawalApproveModal();
      loadWallet(); // Refresh wallet data
    } else {
      showError(result.error || 'Failed to approve withdrawal');
    }
  } catch (error) {
    console.error('Error processing withdrawal approval:', error);
    showError('Failed to process approval: ' + error.message);
  } finally {
    showLoading(false);
  }
};

window.processWithdrawalRejection = async function () {
  const requestId = document.getElementById('rejectRequestId').value;
  const reason = document.getElementById('rejectReason').value;

  if (!reason.trim()) {
    showError('Please provide a reason for rejection');
    return;
  }

  try {
    showLoading('wallet');

    // Call backend API to reject withdrawal
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
        staffId: firebase.auth().currentUser?.uid || 'Staff'
      })
    });

    const result = await response.json();
    if (result.success) {
      showSuccess('Withdrawal rejected and funds returned to seller');
      closeWithdrawalRejectModal();
      loadWallet(); // Refresh wallet data
    } else {
      showError(result.error || 'Failed to reject withdrawal');
    }
  } catch (error) {
    console.error('Error processing withdrawal rejection:', error);
    showError('Failed to process rejection: ' + error.message);
  } finally {
    showLoading(false);
  }
};

// Preview proof image before upload
window.previewProofImage = function (input) {
  const preview = document.getElementById('approveProofPreview');
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function (e) {
      preview.innerHTML = `
                <div style="margin-top: 10px;">
                    <img src="${e.target.result}" style="max-width: 200px; max-height: 200px; border: 1px solid #ddd; border-radius: 4px;">
                    <div style="font-size: 12px; color: #666; margin-top: 5px;">Preview of selected file</div>
                </div>
            `;
    };
    reader.readAsDataURL(input.files[0]);
  } else {
    preview.innerHTML = '';
  }
};

// Override old approveWithdrawal function to use new modal
window.approveWithdrawal = async function (id) {
  openWithdrawalApprove(id);
};



window.saveUserEdit = async function () {
  const uid = document.getElementById('editUserId').value;
  const name = document.getElementById('editUserName').value;
  const role = document.getElementById('editUserRole').value;

  try {
    showLoading(true, 'Saving...');
    await db.ref(`users/${uid}`).update({
      displayName: name,
      name: name,
      role: role
    });
    showSuccess('User updated successfully');
    document.getElementById('editUserModal').style.display = 'none';
  } catch (e) { showError(e.message); } finally { showLoading(false); }
};

window.deleteUser = deleteUser;
window.approveWithdrawal = approveWithdrawal;
window.saveUserEdit = saveUserEdit;

// --- Logout Logic ---
window.logout = async function () {
  try {
    await auth.signOut();
    window.location.href = 'staff-login.html';
  } catch (error) {
    console.error('Logout failed:', error);
  }
};

// Initialize Verification Search
document.addEventListener('input', (e) => {
  if (e.target.id === 'verificationSearch') {
    updateVerificationTable(e.target.value);
  }
});

// loadAnalyticsData function removed as per user request

