/* ========================================
   STAFF-DASHBOARD.JS - Real-time Staff Dashboard
   ======================================== */

let staffData = {
  profile: null,
  activeSection: null
};

// --- POLYFILLS FOR ADMIN METHODS ---
function updateElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}
function showLoading(section) {
    const el = document.getElementById(section+'-section');
    if(el) {
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
    const el = document.getElementById(section+'-section');
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
        window.NotificationManager.showToast('Access Denied: Not a registered staff member.', 'error');
        await auth.signOut();
        window.location.href = 'staff-login.html';
        return;
      }

      staffData.profile = { uid: user.uid, ...data };
      
      // Set user role for notification manager
      if (window.NotificationManager) {
        window.NotificationManager.userRole = 'Staff';
      }

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

  // System Management has access to all for analytics, but others are restricted
  if (userRoles.includes('System Management')) return true;
  
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

// Module Data Loaders (Mirrored from Admin)
function loadModuleData(moduleId) {
  switch(moduleId) {
    case 'users': loadUsersData(); break;
    case 'verification': loadVerificationData(); break;
    case 'product-verification': loadProductQueue(); break;
    case 'products': loadProductsData(); break;
    case 'orders': loadOrdersData(); break;
    case 'logistics': loadLogistics(); break;
    case 'wallet': loadWallet(); break;
    case 'escrow': loadEscrow(); break;
    case 'disputes': loadDisputes(); break;
    case 'analytics': loadAnalytics(); break;
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
  });
}

function handleSearch(e) {
  const searchTerm = e.target.value.toLowerCase();
  const searchId = e.target.id;
  
  // Robust table lookup (handles userSearch -> userTable or usersTable)
  let tableId = searchId.replace('Search', 'Table');
  let table = document.getElementById(tableId);
  
  if (!table) {
    tableId = searchId.replace('Search', 'sTable');
    table = document.getElementById(tableId);
  }

  if (!table) {
    console.warn('Search: Table not found for ID:', searchId);
    return;
  }

  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(searchTerm) ? '' : 'none';
  });
}

function handleFilter(e) {
  const filterValue = e.target.value.toLowerCase();
  const filterId = e.target.id;
  
  let tableId = filterId.replace('StatusFilter', 'Table').replace('Filter', 'Table').replace('CategoryTable', 'ProductsTable');
  
  // Specific mappings for filters
  const filterMappings = {
    'verificationStatusFilter': 'verificationTable',
    'categoryFilter': 'productsTable',
    'orderStatusFilter': 'ordersTable',
    'depositStatusFilter': 'depositRequestsTable',
    'withdrawalStatusFilter': 'withdrawalsTable',
    'escrowStatusFilter': 'escrowTable',
    'disputeStatusFilter': 'disputesTable'
  };

  if (filterMappings[filterId]) {
    tableId = filterMappings[filterId];
  }

  const table = document.getElementById(tableId);
  if (!table) {
    console.warn('Filter: Table not found for ID:', filterId, 'Mapped to:', tableId);
    return;
  }

  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    if (!filterValue || filterValue === 'all') {
      row.style.display = '';
      return;
    }

    // Look for status badges or specific cells
    const statusBadge = row.querySelector('.badge, .status-badge');
    if (statusBadge) {
      const statusText = statusBadge.textContent.toLowerCase();
      row.style.display = statusText.includes(filterValue) ? '' : 'none';
    } else {
      // Fallback: search entire row text for filter value
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(filterValue) ? '' : 'none';
    }
  });
}

// Logistics Scanning Feature
window.searchTracking = async function() {
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
                <h3>Order #${orderId.substring(0,8)}</h3>
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

window.updateOrderStatus = async function(orderId, newStatus) {
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

        window.NotificationManager.showToast('Status updated successfully!', 'success');
        searchTracking(); // Refresh result
    } catch (e) {
        alert('Update failed: ' + e.message);
    }
}

// Log Audit Action
async function logAudit(action, details = {}) {
  try {
    await db.ref('audit_logs').push({
      staffId: staffData.profile.uid,
      staffName: staffData.profile.name,
      action: action,
      details: details,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      location: 'Staff Hub'
    });
  } catch (error) {
    console.error('Audit log failed:', error);
  }
}

window.deleteUser = async function(uid) {
    if (!confirm('PERMANENT DELETION: Are you sure you want to delete this user from AUTH and DB?')) return;
    
    try {
        const response = await fetch('/api/auth/delete-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: uid })
        });

        if (!response.ok) throw new Error('Deletion failed');

        await logAudit('Permanently Deleted User', { deletedUid: uid });
        window.NotificationManager.showToast('User permanently removed.', 'success');
        loadUsers();
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

// Product Verification (Pending Queue)
function loadProductQueue() {
    const section = document.getElementById('product-verification-section');
    section.innerHTML = `
        <div class="section-header"><h2>Product Verification Queue</h2></div>
        <div class="content-card">
            <div class="table-container">
                <table class="admin-table">
                    <thead><tr><th>Product</th><th>Seller</th><th>Category</th><th>Price</th><th>AI Status</th><th>Actions</th></tr></thead>
                    <tbody id="productQueueBody"><tr><td colspan="6" class="text-center">Loading...</td></tr></tbody>
                </table>
            </div>
        </div>
    `;

    db.ref('products').orderByChild('verified').equalTo(false).on('value', (snapshot) => {
        const products = [];
        snapshot.forEach(child => products.push({id: child.key, ...child.val()}));
        
        const tbody = document.getElementById('productQueueBody');
        if (!tbody) return;

        if (products.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Queue is empty</td></tr>';
            return;
        }

        tbody.innerHTML = products.map(p => `
            <tr>
                <td><strong>${p.name}</strong><br><small>#${p.id.substring(0,8)}</small></td>
                <td>${p.sellerName || 'Unknown'}</td>
                <td>${p.category}</td>
                <td>${p.price} PKR</td>
                <td><span class="badge ${p.status === 'pending_verification' ? 'badge-warning' : 'badge-info'}">Pending Review</span></td>
                <td>
                    <button class="btn btn-sm btn-success" onclick="approveProduct('${p.id}')">Approve</button>
                    <button class="btn btn-sm btn-danger" onclick="rejectProduct('${p.id}')">Reject</button>
                </td>
            </tr>
        `).join('');
    });
}

// Product Verification logic moved to dedicated module below (Consolidated)


// User Verification (KYC)
// System Analytics
function loadAnalytics() {
    const section = document.getElementById('analytics-section');
    section.innerHTML = `
        <div class="section-header"><h2>System Management & Analytics</h2></div>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
                <div class="stat-content"><h3 id="statTrades">0</h3><p>Total Trades</p></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: var(--emerald);"><i class="fas fa-shield-alt"></i></div>
                <div class="stat-content"><h3 id="statEscrow">0</h3><p>Escrow Volume</p></div>
            </div>
        </div>
        <div class="dashboard-grid">
            <div class="content-card">
                <div class="card-header"><h3>Volume of Trades</h3></div>
                <div class="card-content"><canvas id="tradeChart"></canvas></div>
            </div>
            <div class="content-card">
                <div class="card-header"><h3>Recent Audit Logs</h3></div>
                <div class="card-content" id="recentAuditLogs" style="font-size: 0.8rem; height: 300px; overflow-y: auto;">
                    Loading logs...
                </div>
            </div>
        </div>
    `;

    renderTradeChart();
    loadAuditLogs();
}

async function renderTradeChart() {
    const ctx = document.getElementById('tradeChart')?.getContext('2d');
    if (!ctx) return;

    // Fetch trades volume over time (mock data simulation for high fidelity)
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
            datasets: [{
                label: 'Trade Volume (PKR)',
                data: [12000, 19000, 3000, 5000, 2000, 30000, 25000],
                borderColor: '#2563eb',
                tension: 0.4,
                fill: true,
                backgroundColor: 'rgba(37, 99, 235, 0.1)'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function loadAuditLogs() {
    db.ref('audit_logs').limitToLast(10).on('value', (snapshot) => {
        const logs = [];
        snapshot.forEach(child => logs.push(child.val()));
        logs.reverse();

        document.getElementById('recentAuditLogs').innerHTML = logs.map(l => `
            <div style="padding: 8px; border-bottom: 1px solid #f1f5f9;">
                <strong>${l.staffName || 'Admin'}</strong>: ${l.action} <br>
                <small class="text-secondary">${new Date(l.timestamp).toLocaleString()}</small>
            </div>
        `).join('');
    });
}

// Utility: Logout
window.logout = async function() {
  await auth.signOut();
  window.location.href = 'staff-login.html';
};


/* --- SYNCED FROM ADMIN --- */
function updateUsersTable() {
  const tableBody = document.querySelector('#usersTable tbody');
  if (!tableBody) return;

  if (staffData.users.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center">No users found</td>
      </tr>
    `;
    return;
  }

  // Sort users: Admins first
  const sortedUsers = [...staffData.users].sort((a, b) => {
    const roleA = (a.role || '').toLowerCase();
    const roleB = (b.role || '').toLowerCase();
    if (roleA === 'admin' && roleB !== 'admin') return -1;
    if (roleA !== 'admin' && roleB === 'admin') return 1;
    return 0;
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

async function updateOrdersTable() {
  const tableBody = document.querySelector('#ordersTable tbody');
  if (!tableBody) return;

  if (!staffData.orders || staffData.orders.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center">No orders found</td>
      </tr>
    `;
    return;
  }

  // Show loading state in table
  tableBody.innerHTML = '<tr><td colspan="9" class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading order details...</td></tr>';

  const rows = await Promise.all(staffData.orders.map(async (order) => {
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
    let sellerUser = staffData.users.find(u => u.id === sellerId);

    // If user not found in cache, strict fetch
    if (!sellerUser && sellerId && sellerId !== 'admin' && sellerId !== 'N/A') {
      try {
        const userSnap = await db.ref('users/' + sellerId).once('value');
        if (userSnap.exists()) {
          sellerUser = { id: sellerId, ...userSnap.val() };
          // Optionally add to cache
          staffData.users.push(sellerUser);
        }
      } catch (e) { /* ignore */ }
    }

    const sellerDisplayName = sellerUser ? (sellerUser.name || sellerUser.displayName || sellerName) : (sellerName || 'Unknown');
    const sellerEmail = sellerUser ? sellerUser.email : 'N/A';
    const sellerDisplayId = sellerId || 'N/A';

    // Tracking
    const tracking = order.trackingNumber ? order.trackingNumber : 'Pending';

    const firebaseLink = getFirebaseConsoleLink('orders', order.id);

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
        message: `${typeName} for user ID ${userId.substring(0,6)}... has been approved by ${auditorName}.`,
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
        message: `${typeName} rejection for user ID ${userId.substring(0,6)}... by ${auditorName}. Reason: ${reason}`,
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

      // Calculate status counts from real data
      const statusCounts = {
        pending: staffData.orders.filter(o => o.status === 'pending').length,
        shipped: staffData.orders.filter(o => o.status === 'shipped' || o.status === 'shipped_to_escrow').length,
        delivered: staffData.orders.filter(o => o.status === 'delivered' || o.status === 'completed').length,
        disputed: staffData.orders.filter(o => o.status === 'disputed').length
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
window.viewUser = async function(userId) {
  let user = staffData.users.find(u => u.id === userId);
  if (!user) {
    // If not in cache, fetch directly from DB
    try {
      showLoading('users');
      const snap = await db.ref('users/' + userId).once('value');
      if (snap.exists()) {
        user = { id: snap.key, ...snap.val() };
      } else {
        window.NotificationManager.showToast('User record not found in system.', 'error');
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
  
  // Populate Fields
  document.getElementById('uDetName').innerText = user.fullName || user.displayName || user.name || 'Unknown User';
  document.getElementById('uDetEmail').innerText = user.email || 'No email provided';
  document.getElementById('uDetId').innerText = user.id;
  document.getElementById('uDetPhone').innerText = user.phone || 'N/A';
  
  const role = user.role || 'User';
  const roleEl = document.getElementById('uDetRole');
  roleEl.innerText = role;
  roleEl.className = `badge ${role === 'Admin' ? 'badge-danger' : (role === 'Staff' ? 'badge-info' : 'badge-success')}`;
  
  document.getElementById('uDetJoined').innerText = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A';
  document.getElementById('uDetAddress').innerText = user.address || (user.verification?.shop?.address) || 'No verified address on file.';
  
  // Avatar Handle
  const avatarImg = document.getElementById('uDetAvatar');
  avatarImg.src = user.profileImage || (user.photoURL) || '/static/images/avatar-placeholder.png';

  // KYC Evidence Logic
  const kycGrid = document.getElementById('uDetKycGrid');
  const v = user.verification || {};
  let kycHtml = '';

  if (v.cnic) {
    if (v.cnic.frontUrl) kycHtml += `
      <div style="background: #f1f5f9; padding: 12px; border-radius: 12px; text-align: center;">
        <p style="font-size: 10px; font-weight: 700; color: #64748b; margin-bottom: 8px;">CNIC FRONT</p>
        <a href="${v.cnic.frontUrl}" target="_blank">
          <img src="${v.cnic.frontUrl}" style="width: 100%; height: 80px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0;">
        </a>
      </div>`;
    if (v.cnic.backUrl) kycHtml += `
      <div style="background: #f1f5f9; padding: 12px; border-radius: 12px; text-align: center;">
        <p style="font-size: 10px; font-weight: 700; color: #64748b; margin-bottom: 8px;">CNIC BACK</p>
        <a href="${v.cnic.backUrl}" target="_blank">
          <img src="${v.cnic.backUrl}" style="width: 100%; height: 80px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0;">
        </a>
      </div>`;
  }

  if (v.selfie?.url) kycHtml += `
      <div style="background: #f1f5f9; padding: 12px; border-radius: 12px; text-align: center;">
        <p style="font-size: 10px; font-weight: 700; color: #64748b; margin-bottom: 8px;">LIVE SELFIE</p>
        <a href="${v.selfie.url}" target="_blank">
          <img src="${v.selfie.url}" style="width: 100%; height: 80px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0;">
        </a>
      </div>`;

  if (v.shop?.documentUrl) kycHtml += `
      <div style="background: #f1f5f9; padding: 12px; border-radius: 12px; text-align: center;">
        <p style="font-size: 10px; font-weight: 700; color: #64748b; margin-bottom: 8px;">SHOP DOC</p>
        <a href="${v.shop.documentUrl}" target="_blank">
          <img src="${v.shop.documentUrl}" style="width: 100%; height: 80px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0;">
        </a>
      </div>`;

  kycGrid.innerHTML = kycHtml || '<p style="grid-column: 1/-1; color: #94a3b8; font-size: 13px;">No KYC intelligence assets submitted yet.</p>';

  // Pulse Stats
  const pulse = document.getElementById('uDetPulse');
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

  modal.style.display = 'block';
};

window.closeUserDetailModal = function() {
  document.getElementById('userDetailModal').style.display = 'none';
};


window.editUser = function(userId) {
  const user = staffData.users.find(u => u.id === userId);
  if (!user) return;

  document.getElementById('editUserId').value = userId;
  document.getElementById('editUserName').value = user.displayName || user.name || user.fullName || user.username || '';
  document.getElementById('editUserEmail').value = user.email || '';
  document.getElementById('editUserRole').value = user.role || 'Buyer';

  document.getElementById('editUserModal').style.display = 'block';
};

window.closeEditUserModal = function() {
  document.getElementById('editUserModal').style.display = 'none';
};

window.deleteUser = async function(userId) {
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

window.viewProduct = function(productId) {
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

window.editProduct = function(productId) {
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

window.closeProductEditModal = function() {
  document.getElementById('productEditModal').style.display = 'none';
};

window.deleteProduct = async function(productId) {
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

// --- ORDER MANAGEMENT ---

window.viewOrder = async function(orderId) {
  if (!orderId) return;
  
  let order = staffData.orders.find(o => o.id === orderId);
  if (!order) {
    try {
      showLoading(true, 'Fetching order details...');
      const snapshot = await db.ref(`orders/${orderId}`).once('value');
      if (snapshot.exists()) {
        order = { id: snapshot.key, ...snapshot.val() };
      } else {
        showError('Order not found');
        return;
      }
    } catch (e) {
      showError('Error: ' + e.message);
      return;
    } finally {
      showLoading(false);
    }
  }

  const modal = document.getElementById('orderViewModal');
  const modalBody = document.getElementById('orderViewBody');

  const formatCurrency = (amount) => `RS ${parseFloat(amount || 0).toLocaleString()}`;

  const buyerName = order.buyer ? order.buyer.name : (order.buyerName || 'Unknown');
  const itemsHtml = (order.items || []).map(item => `
    <div style="display: flex; gap: 15px; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
      <div style="flex: 1;">
        <div style="font-weight: 600;">${item.title || item.name}</div>
        <div style="color: #6b7280; font-size: 0.9rem;">${formatCurrency(item.price)} x ${item.quantity || 1}</div>
      </div>
      <div style="font-weight: 600;">${formatCurrency((item.price || 0) * (item.quantity || 1))}</div>
    </div>
  `).join('');

  modalBody.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
      <div>
        <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 15px;">
          <h4 style="margin: 0 0 10px 0;">Order Status</h4>
          <span class="badge badge-${getStatusBadgeColor(order.status)}">${order.status || 'Pending'}</span>
          <p style="margin: 10px 0 0 0; font-size: 0.9rem;"><strong>Placed:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <div style="background: #f9fafb; padding: 16px; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0;">Customer</h4>
          <p style="margin: 5px 0;"><strong>Name:</strong> ${buyerName}</p>
          <p style="margin: 5px 0;"><strong>Address:</strong> ${order.shippingAddress || 'N/A'}</p>
        </div>
      </div>
      <div>
        <div style="border: 1px solid #eee; padding: 16px; border-radius: 8px;">
          <h4 style="margin: 0 0 15px 0;">Items</h4>
          ${itemsHtml}
          <div style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #eee; font-weight: bold; display: flex; justify-content: space-between;">
            <span>Total Amount:</span>
            <span>${formatCurrency(order.total)}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'block';
};

window.closeOrderViewModal = function() {
  document.getElementById('orderViewModal').style.display = 'none';
};

// --- VERIFICATION HANDLERS ---
window.viewVerificationDetails = function(userId) {
  const user = staffData.pendingVerifications.find(u => u.id === userId);
  if (!user) return;

  const modal = document.getElementById('verificationModal');
  const bodyEl = document.getElementById('modalBody');
  const titleEl = document.getElementById('modalTitle');
  const approveBtn = document.getElementById('modalApproveBtn');
  const rejectBtn = document.getElementById('modalRejectBtn');

  titleEl.innerText = `Verify ${user.name}`;
  // Hide global buttons since we now have per-section buttons
  approveBtn.style.display = 'none';
  rejectBtn.style.display = 'none';

  const v = user.verification || {};
  
  let hasContent = false;
  let content = `
    <div style="display: grid; grid-template-columns: 1fr; gap: 24px; padding: 10px;">
      <!-- User Info Section -->
      <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
        <h4 style="margin: 0 0 15px 0; color: #1e293b; font-size: 1.1rem; border-bottom: 2px solid #cbd5e1; padding-bottom: 8px;">User Identity Record</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
           <div>
             <p style="margin: 5px 0; color: #64748b; font-size: 0.85rem;">Full Name</p>
             <p style="margin: 0; font-weight: 700; color: #1e293b;">${user.name || 'N/A'}</p>
           </div>
           <div>
             <p style="margin: 5px 0; color: #64748b; font-size: 0.85rem;">Email Handle</p>
             <p style="margin: 0; font-weight: 700; color: #1e293b;">${user.email || 'N/A'}</p>
           </div>
           <div>
             <p style="margin: 5px 0; color: #64748b; font-size: 0.85rem;">Submission Type</p>
             <p style="margin: 0; font-weight: 700; color: #6366f1;">${user.type || 'N/A'}</p>
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
  if (v.cnic) {
    hasContent = true;
    content += `
      <div class="verification-section">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h4 style="margin:0; color: #1e293b; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;">
             <i class="fas fa-id-card" style="color: #6366f1;"></i> Identity Verification (CNIC)
          </h4>
          <div class="admin-actions">
            ${v.cnic.verified ? 
              '<span class="badge" style="background: #f0fdf4; color: #166534; padding: 6px 12px; border-radius: 20px; font-size: 0.75rem; border: 1px solid #bbf7d0;">Verified ✅</span>' : 
              v.cnic.status === 'rejected' ? 
              '<span class="badge" style="background: #fef2f2; color: #991b1b; padding: 6px 12px; border-radius: 20px; font-size: 0.75rem; border: 1px solid #fecaca;">Rejected ❌</span>' : 
              `
              <button class="btn btn-sm btn-success" onclick="approveVerification('${userId}', 'cnic')" style="margin-right:8px; background-color: #22c55e; color: white; border: none; padding: 5px 12px; border-radius: 4px; font-weight: 600; cursor: pointer;">Approve Identity</button>
              <button class="btn btn-sm btn-danger" onclick="rejectVerification('${userId}', 'cnic')" style="background-color: #ef4444; color: white; border: none; padding: 5px 12px; border-radius: 4px; font-weight: 600; cursor: pointer;">Reject Identity</button>
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
  if (v.shop && (v.shop.documentUrl || (v.shop.docUrls && v.shop.docUrls.length > 0))) {
    hasContent = true;
    content += `
      <div class="verification-section" style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #f1f5f9;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
          <h4 style="margin:0; color: #1e293b; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;">
             <i class="fas fa-store" style="color: #10b981;"></i> Business Presence Verification
          </h4>
          <div class="admin-actions">
            ${v.shop.verified ? 
              '<span class="badge" style="background: #f0fdf4; color: #166534; padding: 6px 12px; border-radius: 20px; font-size: 0.75rem; border: 1px solid #bbf7d0;">Verified ✅</span>' : 
              v.shop.status === 'rejected' ? 
              '<span class="badge" style="background: #fef2f2; color: #991b1b; padding: 6px 12px; border-radius: 20px; font-size: 0.75rem; border: 1px solid #fecaca;">Rejected ❌</span>' : 
              `
              <button class="btn btn-sm btn-success" onclick="approveVerification('${userId}', 'shop')" style="margin-right:8px; background-color: #22c55e; color: white; border: none; padding: 5px 12px; border-radius: 4px; font-weight: 600; cursor: pointer;">Approve Shop</button>
              <button class="btn btn-sm btn-danger" onclick="rejectVerification('${userId}', 'shop')" style="background-color: #ef4444; color: white; border: none; padding: 5px 12px; border-radius: 4px; font-weight: 600; cursor: pointer;">Reject Shop</button>
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
  bodyEl.innerHTML = content;
  modal.style.display = 'block';
};

window.closeVerificationModal = function() {
  document.getElementById('verificationModal').style.display = 'none';
};

window.approveVerification = async function(userId, type) {
  const confirmMsg = type ? 
    `Are you sure you want to approve this ${type === 'shop' ? 'business' : 'identity'} document?` : 
    'Are you sure you want to approve this user? This will mark them as verified and grant Seller access if applicable.';

  if (!await showConfirmationModal('Approve Verification', confirmMsg)) return;

  try {
    showLoading(true, 'Approving...');
    const user = staffData.pendingVerifications.find(u => u.id === userId);
    const updates = {};
    
    if (!type || type === 'cnic') {
      if (user.verification?.cnic) {
        updates['verification/cnic/verified'] = true;
        updates['verification/cnic/status'] = 'approved';
      }
    }
    
    if (!type || type === 'shop') {
      if (user.verification?.shop) {
        updates['verification/shop/verified'] = true;
        updates['verification/shop/status'] = 'approved';
        updates['role'] = 'Seller';
      }
    }

    await db.ref(`users/${userId}`).update(updates);
    showSuccess(`${type ? type.charAt(0).toUpperCase() + type.slice(1) : 'User'} approved successfully`);
    
    viewVerificationDetails(userId);
  } catch (e) {
    showError(e.message);
  } finally {
    showLoading(false);
  }
};

window.rejectVerification = async function(userId, type) {
  const reason = await showConfirmationModal('Reject KYC', `Please provide a reason for rejecting this ${type || 'user'}:`, { showInput: true, confirmText: 'Reject', confirmColor: '#dc3545' });
  if (!reason) return;

  try {
    showLoading(true, 'Rejecting...');
    const user = staffData.pendingVerifications.find(u => u.id === userId);
    const updates = {};
    
    if (!type || type === 'cnic') {
      if (user.verification?.cnic) {
        updates['verification/cnic/status'] = 'rejected';
        updates['verification/cnic/rejectionReason'] = reason;
      }
    }
    
    if (!type || type === 'shop') {
      if (user.verification?.shop) {
        updates['verification/shop/status'] = 'rejected';
        updates['verification/shop/rejectionReason'] = reason;
      }
    }

    await db.ref(`users/${userId}`).update(updates);
    showSuccess(`${type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Verification'} rejected`);
    
    viewVerificationDetails(userId);
  } catch (e) {
    showError(e.message);
  } finally {
    showLoading(false);
  }
};

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

    titleEl.textContent = title;
    messageEl.textContent = message;
    input.value = '';
    inputContainer.style.display = options.showInput ? 'block' : 'none';

    if (options.confirmText) okBtn.textContent = options.confirmText;
    if (options.confirmColor) okBtn.style.backgroundColor = options.confirmColor;
    else okBtn.style.backgroundColor = '#2563eb';

    modal.style.display = 'block';
    if (options.showInput) input.focus();

    const cleanup = () => {
      modal.style.display = 'none';
      okBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    okBtn.onclick = () => {
      const val = options.showInput ? input.value : true;
      if (options.showInput && !val) {
        showError('Reason is required');
        return;
      }
      cleanup();
      resolve(val);
    };

    cancelBtn.onclick = () => {
      cleanup();
      resolve(null);
    };
    
    // Global listener for clicking outside (will be added in setupEvents)
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
          if (product.status === 'pending_verification' || product.verified === false) {
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
        <td>#${product.id.slice(-6)}</td>
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

window.approveProduct = async function(productId) {
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

window.rejectProduct = async function(productId) {
  const reason = prompt('Please provide a reason for rejection:');
  if (reason === null) return;

  if (!await showConfirmationModal('Reject Product', 'Are you sure you want to reject this product listing?', { confirmText: 'Reject Listing', confirmColor: '#ef4444' })) return;

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
    window.NotificationManager.showToast('Exporting product verification queue as CSV...', 'info');
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
                <td>#${a.orderId.slice(-6)}</td>
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
function loadWallet() {
  showLoading('wallet');
  
  // Listen to Deposits
  db.ref('deposits').on('value', snap => {
    const deposits = [];
    snap.forEach(c => deposits.push({id: c.key, ...c.val()}));
    staffData.deposits = deposits;
    renderDeposits();
  });

  // Listen to Withdrawals (Merging legacy 'withdrawals' and new 'withdrawal_requests')
  const syncWithdrawals = () => {
    const wNode1 = db.ref('withdrawals');
    const wNode2 = db.ref('withdrawal_requests');
    
    const processSnap = async (snap1, snap2) => {
      const merged = new Map();
      
      if (snap1 && snap1.exists()) {
        snap1.forEach(child => merged.set(child.key, { id: child.key, ...child.val() }));
      }
      if (snap2 && snap2.exists()) {
        snap2.forEach(child => merged.set(child.key, { id: child.key, ...child.val() }));
      }
      
      const withdrawals = Array.from(merged.values());
      withdrawals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      // Fetch current balances for each user in requests
      const enhanced = await Promise.all(withdrawals.map(async w => {
          if (!w.userId) {
              console.warn('Withdrawal missing userId:', w.id);
              return { ...w, availableBalance: 0 };
          }
          try {
              const balSnap = await db.ref(`wallets/${w.userId}/available_balance`).once('value');
              return { ...w, availableBalance: balSnap.val() || 0 };
          } catch (error) {
              console.error('Error fetching balance for user', w.userId, error);
              return { ...w, availableBalance: 0 };
          }
      }));

      staffData.withdrawals = enhanced;
      renderWithdrawals();
      
      // Update Header Count for debugging/visibility
      const countHeader = document.querySelector('#withdrawalsTableBody')?.closest('.content-card')?.querySelector('h3');
      if (countHeader && countHeader.textContent.includes('Withdrawal Requests')) {
         countHeader.innerHTML = `Withdrawal Requests <span class="badge badge-info" style="font-size: 0.8rem; margin-left: 8px;">${withdrawals.length} Total</span>`;
      }
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

  hideLoading('wallet');
}

function renderDeposits() {
    const tbody = document.getElementById('depositRequestsTableBody');
    if (!tbody || !staffData.deposits) return;
    
    tbody.innerHTML = staffData.deposits.map(d => `
        <tr>
            <td>#${d.id.slice(-6)}</td>
            <td>
                <div class="user-info">
                    <span class="fw-bold">${d.userName || 'Unknown'}</span>
                </div>
            </td>
            <td class="text-success fw-bold">RS ${parseFloat(d.amount).toLocaleString()}</td>
            <td><span class="badge bg-light text-dark text-uppercase">${d.method}</span></td>
            <td>
                <a href="${d.screenshotUrl}" target="_blank" class="btn btn-xs btn-outline-primary">
                    <i class="fas fa-image"></i> View
                </a>
            </td>
            <td><span class="status-badge ${d.status}">${d.status.toUpperCase()}</span></td>
            <td>${new Date(d.createdAt).toLocaleDateString()}</td>
            <td>
                ${d.status === 'pending' ? `
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-success" onclick="approveDeposit('${d.id}')" title="Approve">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="rejectDeposit('${d.id}')" title="Reject">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                ` : '-'}
            </td>
        </tr>
    `).join('');
}

function renderWithdrawals() {
    const tbody = document.getElementById('withdrawalsTableBody');
    if (!tbody || !staffData.withdrawals) return;
    
    tbody.innerHTML = staffData.withdrawals.map(w => {
        const requested = parseFloat(w.amount || 0);
        const available = parseFloat(w.availableBalance || 0);
        const isInvalid = requested > available;
        const status = w.status || 'pending';
        
        // Create action buttons with data attributes for event delegation
        const viewBtn = `<button class="btn btn-sm btn-outline-info withdrawal-action-btn"
                              data-action="view"
                              data-id="${w.id}"
                              data-uid="${w.userId}"
                              title="View Details">
                            <i class="fas fa-eye"></i>
                         </button>`;
        
        const approveBtn = `<button class="btn btn-sm btn-success withdrawal-action-btn"
                                data-action="approve"
                                data-id="${w.id}"
                                data-uid="${w.userId}"
                                ${isInvalid ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}
                                title="Approve & Payout">
                              <i class="fas fa-check"></i>
                           </button>`;
        
        const rejectBtn = `<button class="btn btn-sm btn-outline-danger withdrawal-action-btn"
                               data-action="reject"
                               data-id="${w.id}"
                               data-uid="${w.userId}"
                               title="Reject">
                             <i class="fas fa-times"></i>
                          </button>`;
        
        const actionButtons = status === 'pending' ? `
            <div class="d-flex gap-1">
                ${viewBtn}
                ${approveBtn}
                ${rejectBtn}
            </div>
        ` : (w.proof_url ? `<button class="btn btn-sm btn-outline-primary" onclick="window.open('${w.proof_url}', '_blank')"><i class="fas fa-file-invoice"></i> Proof</button>` : '-');
        
        return `
            <tr class="${isInvalid && status === 'pending' ? 'bg-error-light' : ''}">
                <td>#${w.id.slice(-6)}</td>
                <td>
                    <div style="display:flex; flex-direction:column;">
                        <span class="fw-bold">${w.userName || 'Unknown'}</span>
                        <small class="text-muted">${w.userEmail || ''}</small>
                    </div>
                </td>
                <td class="fw-bold text-danger">RS ${requested.toLocaleString()}</td>
                <td>
                    <span class="${isInvalid ? 'text-danger fw-bold' : 'text-success'}">
                        RS ${available.toLocaleString()}
                        ${isInvalid && status === 'pending' ? ' <i class="fas fa-exclamation-triangle" title="Insufficient Balance"></i>' : ''}
                    </span>
                </td>
                <td><span class="badge bg-light text-dark text-uppercase">${w.bankDetails?.bankName || 'Bank'}</span></td>
                <td>
                    <div style="font-size:0.8rem; line-height:1.2;">
                        <strong>${w.bankDetails?.title || 'N/A'}</strong><br>
                        ${w.bankDetails?.accountNumber || 'N/A'}
                    </div>
                </td>
                <td><span class="status-badge ${status}">${status.toUpperCase()}</span></td>
                <td>${actionButtons}</td>
            </tr>
        `;
    }).join('');
}

window.approveWithdrawal = function(requestId) {
    const input = document.getElementById('slipUploadInput');
    if (!input) return;

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!confirm(`Are you sure you want to COMPLETE this withdrawal? RS balance will be deducted from the seller's wallet permanently upon upload.`)) return;

        try {
            showLoading('wallet');
            
            // 1. Upload Slip to Storage
            const timestamp = Date.now();
            const filename = `withdrawals/${requestId}/${timestamp}_${file.name}`;
            const storageRef = firebase.storage().ref(filename);
            const uploadTask = await storageRef.put(file);
            const slipUrl = await uploadTask.ref.getDownloadURL();

            // 2. Call Flask API to Deduct Balance & Complete
            const idToken = await firebase.auth().currentUser.getIdToken();
            const response = await fetch('/api/v1/wallet/complete-withdrawal', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    requestId: requestId,
                    slipUrl: slipUrl,
                    staffId: staffData.profile?.uid || 'Staff'
                })
            });

            const result = await response.json();
            if (result.success) {
                showSuccess('Withdrawal finalized and balance deducted.');
                loadWallet(); // Refresh
            } else {
                showError(result.error || 'Failed to complete withdrawal');
            }
        } catch (err) {
            console.error('Clearance Error:', err);
            showError('Clearance failed: ' + err.message);
        } finally {
            showLoading(false);
            input.value = ''; // Reset input
        }
    };

    input.click(); // Trigger file selection
};

// Override old rejectWithdrawal function to use new modal
window.rejectWithdrawal = async function(requestId) {
    openWithdrawalReject(requestId);
};

/* --- ESCROW & DISPUTES --- */
function loadEscrow() {
    showLoading('escrow');
    db.ref('escrows').on('value', snap => {
        const escrows = [];
        snap.forEach(c => escrows.push({id: c.key, ...c.val()}));
        staffData.escrows = escrows;
        renderEscrows();
        hideLoading('escrow');
    });
}

function renderEscrows() {
    const tbody = document.getElementById('escrowTableBody');
    if (!tbody || !staffData.escrows) return;
    
    tbody.innerHTML = staffData.escrows.map(e => `
        <tr>
            <td>#${e.id.slice(-6)}</td>
            <td><code class="small">${e.buyerId.slice(0, 8)}...</code></td>
            <td><code class="small">${e.sellerId.slice(0, 8)}...</code></td>
            <td class="fw-bold">RS ${parseFloat(e.amount).toLocaleString()}</td>
            <td><span class="status-badge ${e.status}">${e.status.toUpperCase()}</span></td>
            <td>
                ${e.status === 'held' ? `
                    <button class="btn btn-sm btn-primary" onclick="releaseEscrow('${e.id}')">
                        <i class="fas fa-unlock"></i> Release
                    </button>
                ` : '-'}
            </td>
        </tr>
    `).join('');
}

function loadDisputes() {
    showLoading('disputes');
    db.ref('disputes').on('value', snap => {
        const disputes = [];
        snap.forEach(c => disputes.push({id: c.key, ...c.val()}));
        staffData.disputes = disputes;
        renderDisputes();
        hideLoading('disputes');
    });
}

function renderDisputes() {
    const tbody = document.getElementById('disputesTableBody');
    if (!tbody || !staffData.disputes) return;
    
    tbody.innerHTML = staffData.disputes.map(d => `
        <tr>
            <td>#${d.id.slice(-6)}</td>
            <td>#${(d.orderId || '').slice(-6)}</td>
            <td>${d.userName || 'Unknown'}</td>
            <td><span class="badge bg-warning text-dark">${d.type || 'General'}</span></td>
            <td><span class="status-badge ${d.status}">${(d.status || 'open').toUpperCase()}</span></td>
            <td>${new Date(d.createdAt).toLocaleDateString()}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="viewDispute('${d.id}')">
                    <i class="fas fa-eye"></i> View
                </button>
            </td>
        </tr>
    `).join('');
}

function loadAnalytics() {
    showLoading('analytics');
    
    // Staff analytics is usually a subset of admin analytics
    setTimeout(() => hideLoading('analytics'), 1000);
}

/* --- ACTION STUBS (Mirroring Admin logic) --- */
async function approveDeposit(id) {
    if (!await showConfirmationModal('Approve Deposit', 'Confirm receipt of payment?')) return;
    try {
        showLoading(true);
        const depRef = db.ref(`deposits/${id}`);
        const snap = await depRef.once('value');
        const dep = snap.val();
        
        await depRef.update({ status: 'approved', processedAt: firebase.database.ServerValue.TIMESTAMP });
        
        // Update user wallet
        await db.ref(`wallets/${dep.userId}`).transaction(w => {
            if (!w) w = { available_balance: 0 };
            w.available_balance = (parseFloat(w.available_balance) || 0) + dep.amount;
            return w;
        });

        // Notify User
        await db.ref(`users/${dep.userId}/notifications`).push({
            title: 'Deposit Approved',
            message: `Your deposit of RS ${dep.amount.toLocaleString()} has been added to your wallet.`,
            type: 'payment',
            read: false,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        
        showSuccess('Deposit approved');
    } catch (e) { showError(e.message); } finally { showLoading(false); }
}

async function rejectDeposit(id) {
    const reason = prompt('Reason for rejection?');
    if (!reason) return;
    try {
        showLoading(true);
        await db.ref(`deposits/${id}`).update({ status: 'rejected', reason: reason });

        const depSnap = await db.ref(`deposits/${id}`).once('value');
        const dep = depSnap.val();
        
        // Notify User
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

// Global exports
window.loadLogistics = loadLogistics;
window.loadWallet = loadWallet;
window.loadEscrow = loadEscrow;
window.loadDisputes = loadDisputes;
window.loadAnalytics = loadAnalytics;
window.approveDeposit = approveDeposit;
window.rejectDeposit = rejectDeposit;
window.releaseEscrow = releaseEscrow;

/* --- DETAILED VIEW HANDLERS (LOGISTICS & DISPUTES) --- */

window.viewOrder = async function(orderId) {
  if (!orderId) return;
  
  let order = staffData.orders?.find(o => o.id === orderId);
  if (!order) {
    try {
      showLoading(true, 'Fetching order details...');
      const snapshot = await db.ref(`orders/${orderId}`).once('value');
      if (snapshot.exists()) {
        order = { id: snapshot.key, ...snapshot.val() };
      } else {
        showError('Order not found');
        return;
      }
    } catch (e) {
      showError('Error: ' + e.message);
      return;
    } finally {
      showLoading(false);
    }
  }

  const modal = document.getElementById('orderViewModal');
  const modalBody = document.getElementById('orderViewBody');

  const formatCurrency = (amount) => `RS ${parseFloat(amount || 0).toLocaleString()}`;
  const buyerName = order.buyer ? order.buyer.name : (order.buyerName || 'Unknown');
  const sellerName = order.sellerName || 'Unknown';

  // Tracking Stepper Data
  const statuses = ['pending', 'shipped', 'picked_up', 'in_transit', 'delivered', 'completed'];
  const currentStatusIndex = statuses.indexOf(order.status || 'pending');

  const stepperHtml = `
    <div class="tracking-stepper" style="display: flex; justify-content: space-between; margin-bottom: 30px; position: relative; padding: 0 20px;">
        ${statuses.map((s, i) => {
            const isActive = i <= currentStatusIndex;
            const icon = s === 'pending' ? 'fa-clock' : (s === 'shipped' ? 'fa-box' : (s === 'delivered' ? 'fa-check' : 'fa-truck'));
            return `
                <div class="step-item" style="text-align: center; z-index: 2; position: relative; flex: 1;">
                    <div class="step-icon" style="width: 40px; height: 40px; border-radius: 50%; background: ${isActive ? '#4f46e5' : '#e5e7eb'}; color: white; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; transition: all 0.3s ease;">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="step-label" style="font-size: 0.75rem; font-weight: 500; color: ${isActive ? '#111827' : '#9ca3af'};">${s.replace('_', ' ').toUpperCase()}</div>
                </div>
            `;
        }).join('')}
        <div class="step-connector" style="position: absolute; top: 20px; left: 60px; right: 60px; height: 2px; background: #e5e7eb; z-index: 1;">
            <div style="width: ${(currentStatusIndex / (statuses.length - 1)) * 100}%; height: 100%; background: #4f46e5; transition: width 0.5s ease;"></div>
        </div>
    </div>
  `;

  const itemsHtml = (order.items || []).map(item => `
    <div style="display: flex; gap: 15px; margin-bottom: 12px; padding: 10px; background: white; border-radius: 8px;">
      <div style="flex: 1;">
        <div style="font-weight: 600;">${item.title || item.name}</div>
        <div style="color: #6b7280; font-size: 0.85rem;">Price: ${formatCurrency(item.price)} | Qty: ${item.quantity || 1}</div>
      </div>
      <div style="font-weight: 600; color: #111827;">${formatCurrency((item.price || 0) * (item.quantity || 1))}</div>
    </div>
  `).join('');

  modalBody.innerHTML = `
    <div style="margin-bottom: 25px;">
        ${stepperHtml}
    </div>
    
    <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 24px;">
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <div class="content-card" style="padding: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h4 style="margin: 0; display: flex; align-items: center; gap: 8px;"><i class="fas fa-truck text-primary"></i> Logistics Management</h4>
                <div style="display: flex; gap: 8px;">
                    <select id="updateStatusSelect" class="form-select btn-sm" style="font-size: 0.8rem; padding: 4px 8px; border-radius: 6px;">
                        <option value="pending">Set Pending</option>
                        <option value="shipped">Mark as Shipped</option>
                        <option value="picked_up">Picked Up</option>
                        <option value="in_transit">In Transit</option>
                        <option value="delivered">Set Delivered</option>
                        <option value="completed">Complete Order</option>
                    </select>
                    <button class="btn btn-sm btn-primary" onclick="pushStatusUpdate('${orderId}')">Push Update</button>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div>
                    <label style="font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase;">Tracking Number</label>
                    <div id="trackingDisplay" style="font-family: monospace; background: white; padding: 8px; border-radius: 6px; border: 1px dashed #cbd5e1; margin-top: 5px;">
                        ${order.trackingNumber || 'PENDING'} 
                        <i class="fas fa-edit cursor-pointer text-primary float-end" onclick="editTracking('${orderId}')"></i>
                    </div>
                </div>
                <div>
                    <label style="font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase;">Last Scan Hub</label>
                    <div style="background: white; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0; margin-top: 5px; font-size: 0.85rem;">
                        ${order.lastScanLocation || 'Central Logistics Hub'}
                    </div>
                </div>
            </div>
        </div>

        <div class="content-card" style="padding: 20px; border: 1px solid #f1f5f9; border-radius: 12px;">
          <h4 style="margin: 0 0 15px 0;">Order Items</h4>
          ${itemsHtml}
          <div style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #f1f5f9; font-weight: 800; display: flex; justify-content: space-between; font-size: 1.1rem; color: #111827;">
            <span>Grand Total:</span>
            <span>${formatCurrency(order.total)}</span>
          </div>
        </div>
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <div class="content-card" style="padding: 20px; background: white; border: 1px solid #f1f5f9; border-radius: 12px;">
          <h4 style="margin: 0 0 15px 0;">Customer Information</h4>
          <p style="margin: 8px 0; font-size: 0.95rem;"><strong>Name:</strong> ${buyerName}</p>
          <p style="margin: 8px 0; font-size: 0.95rem;"><strong>Email:</strong> ${order.buyerEmail || 'N/A'}</p>
          <hr style="margin: 15px 0; border: 0; border-top: 1px solid #f1f5f9;">
          <h4 style="margin: 0 0 10px 0; font-size: 0.9rem; color: #64748b; text-transform: uppercase;">Shipping Address</h4>
          <p style="margin: 5px 0; font-size: 0.9rem; line-height: 1.6; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #f1f5f9;">
            ${order.shippingAddress || 'No address provided.'}
          </p>
        </div>

        <div class="content-card" style="padding: 20px; background: #fffbe6; border: 1px solid #ffe58f; border-radius: 12px;">
          <h4 style="margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px; color: #856404;"><i class="fas fa-store"></i> Seller Info</h4>
          <p style="margin: 5px 0;"><strong>Name:</strong> ${sellerName}</p>
          <p style="margin: 5px 0; font-size: 0.8rem; color: #856404;"><strong>Seller ID:</strong> ${order.sellerId?.substring(0,12)}...</p>
        </div>
      </div>
    </div>
  `;

  // Set current status in select
  const select = document.getElementById('updateStatusSelect');
  if (select) select.value = order.status || 'pending';

  modal.style.display = 'block';
};

window.pushStatusUpdate = async function(orderId) {
    const newStatus = document.getElementById('updateStatusSelect').value;
    if (!await showConfirmationModal('Push Logistics Update', `Are you sure you want to change order status to ${newStatus}? This will notify both buyer and seller.`)) return;

    try {
        showLoading(true, 'Pushing update to network...');
        await db.ref(`orders/${orderId}`).update({
            status: newStatus,
            lastScanLocation: 'Staff ID: ' + staffData.profile.name + ' - Hub Portal',
            lastUpdatedAt: firebase.database.ServerValue.TIMESTAMP
        });

        await logAudit('Logistics Status Push', { orderId: orderId, newStatus: newStatus });
        
        // Notify Buyer and Seller
        const orderSnap = await db.ref(`orders/${orderId}`).once('value');
        const order = orderSnap.val();
        if (order) {
            const notif = {
                title: 'Order Update',
                message: `Order #${orderId.slice(-6)} status changed to ${newStatus.toUpperCase()}.`,
                type: 'order',
                read: false,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };
            await db.ref(`users/${order.buyerId}/notifications`).push(notif);
            await db.ref(`users/${order.sellerId}/notifications`).push(notif);
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

window.editTracking = async function(orderId) {
    const newTracking = prompt('Enter new tracking number:');
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
                message: `Tracking number for order #${orderId.slice(-6)} has been updated to: ${newTracking}`,
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

window.viewDispute = function(disputeId) {
    const dispute = staffData.disputes?.find(d => d.id === disputeId);
    if (!dispute) return;

    const modal = document.getElementById('verificationModal');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    const approveBtn = document.getElementById('modalApproveBtn');
    const rejectBtn = document.getElementById('modalRejectBtn');

    titleEl.innerText = 'Dispute Case: #' + disputeId.slice(-6);
    approveBtn.innerText = 'Resolve Dispute';
    rejectBtn.innerText = 'Dismiss Case';
    approveBtn.style.display = 'inline-block';
    rejectBtn.style.display = 'inline-block';

    approveBtn.onclick = () => resolveDispute(disputeId, 'resolved');
    rejectBtn.onclick = () => resolveDispute(disputeId, 'dismissed');

    bodyEl.innerHTML = `
        <div style="background: #fffafa; border: 1px solid #ffe8e8; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                <div>
                    <h3 style="margin: 0; color: #c53030;">${dispute.type || 'Refund Request'}</h3>
                    <p style="color: #666; font-size: 0.9rem;">Filed on: ${new Date(dispute.createdAt).toLocaleString()}</p>
                </div>
                <div>
                    <span class="status-badge ${dispute.status || 'open'}">${(dispute.status || 'open').toUpperCase()}</span>
                </div>
            </div>
            <div style="background: white; padding: 15px; border-radius: 8px; border: 1px dashed #feb2b2;">
                <strong>Complainant Statement:</strong>
                <p style="margin: 10px 0; line-height: 1.6;">${dispute.reason || 'No specific reason provided.'}</p>
            </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div class="content-card" style="padding: 15px; background: #f8fafc;">
                <h4>Associated Order</h4>
                <p><strong>Order ID:</strong> <a href="#" onclick="viewOrder('${dispute.orderId}')">#${dispute.orderId?.slice(-6)}</a></p>
                <p><strong>Total Amount:</strong> RS ${parseFloat(dispute.amount || 0).toLocaleString()}</p>
            </div>
            <div class="content-card" style="padding: 15px; background: #f8fafc;">
                <h4>User Involvement</h4>
                <p><strong>Reported By:</strong> ${dispute.userName || 'Unknown'}</p>
                <p><strong>User UID:</strong> <code style="font-size: 0.7rem;">${dispute.reportedBy}</code></p>
            </div>
        </div>
    `;

    modal.style.display = 'block';
};

async function resolveDispute(id, outcome) {
    const comments = prompt('Enter resolution summary:');
    if (comments === null) return;

    try {
        showLoading(true);
        await db.ref(`disputes/${id}`).update({
            status: outcome,
            resolution: comments,
            resolvedBy: staffData.profile.name,
            resolvedAt: firebase.database.ServerValue.TIMESTAMP
        });

        // Notify User
        const dispSnap = await db.ref(`disputes/${id}`).once('value');
        const disp = dispSnap.val();
        if (disp) {
            await db.ref(`users/${disp.reportedBy}/notifications`).push({
                title: 'Dispute Resolved',
                message: `Your dispute for order #${(disp.orderId || '').slice(-6)} has been marked as ${outcome.toUpperCase()}. Resolution: ${comments}`,
                type: 'dispute',
                read: false,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        }

        await logAudit('Dispute Resolved', { disputeId: id, outcome: outcome });
        showSuccess('Dispute marks as ' + outcome);
        closeVerificationModal();
    } catch (e) { showError(e.message); } finally { showLoading(false); }
}

window.viewDispute = viewDispute;
window.resolveDispute = resolveDispute;
window.pushStatusUpdate = pushStatusUpdate;
window.editTracking = editTracking;

/* --- FINAL MANAGEMENT ACTIONS (USERS & WITHDRAWALS) --- */

window.deleteUser = async function(userId) {
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
window.openWithdrawalView = async function(requestId) {
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
            const userRef = db.ref(`wallets/${request.userId}`);
            const userSnap = await userRef.once('value');
            const wallet = userSnap.val() || {};
            currentBalance = wallet.available_balance || 0;
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

window.openWithdrawalApprove = async function(requestId) {
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
        
        // Safely parse amount
        const amount = parseFloat(request.amount || 0);
        if (isNaN(amount)) {
            console.warn('Invalid amount in withdrawal request:', request.amount);
        }
        
        // Safely handle bankDetails
        const bankDetails = request.bankDetails || {};
        const bankName = typeof bankDetails.bankName === 'string' ? bankDetails.bankName : 'N/A';
        const accountNumber = typeof bankDetails.accountNumber === 'string' ? bankDetails.accountNumber : 'N/A';
        
        document.getElementById('approveRequestId').value = requestId;
        document.getElementById('approveUserName').textContent = request.userName || 'Unknown';
        document.getElementById('approveAmount').textContent = `RS ${amount.toLocaleString()}`;
        document.getElementById('approveBankDetails').textContent = `${bankName} - ${accountNumber}`;
        
        // Get user's current balance
        let currentBalance = 0;
        try {
            const userRef = db.ref(`wallets/${request.userId}`);
            const userSnap = await userRef.once('value');
            const wallet = userSnap.val() || {};
            currentBalance = wallet.available_balance || 0;
        } catch (balanceError) {
            console.warn('Could not fetch user balance:', balanceError);
            currentBalance = 0;
        }
        document.getElementById('approveCurrentBalance').textContent = `RS ${currentBalance.toLocaleString()}`;
        
        // Reset file input (HTML uses proofUpload, not approveProofFile)
        document.getElementById('proofUpload').value = '';
        // Clear any preview if it exists
        const preview = document.getElementById('approveProofPreview');
        if (preview) preview.innerHTML = '';
        
        document.getElementById('withdrawalApproveModal').style.display = 'block';
    } catch (error) {
        console.error('Error opening approval modal:', error);
        showError('Failed to load withdrawal details: ' + error.message);
    }
};

window.openWithdrawalReject = async function(requestId) {
    try {
        const request = await getStaffWithdrawalData(requestId);
        
        if (!request) {
            showError('Withdrawal request not found');
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
        if (isNaN(amount)) {
            console.warn('Invalid amount in withdrawal request:', request.amount);
        }
        
        document.getElementById('rejectRequestId').value = requestId;
        document.getElementById('rejectUserName').textContent = request.userName || 'Unknown';
        document.getElementById('rejectAmount').textContent = `RS ${amount.toLocaleString()}`;
        
        // Reset reason input
        document.getElementById('rejectReason').value = '';
        
        document.getElementById('withdrawalRejectModal').style.display = 'block';
    } catch (error) {
        console.error('Error opening rejection modal:', error);
        showError('Failed to load withdrawal details: ' + error.message);
    }
};

window.closeWithdrawalViewModal = function() {
    document.getElementById('withdrawalViewModal').style.display = 'none';
};

window.closeWithdrawalApproveModal = function() {
    document.getElementById('withdrawalApproveModal').style.display = 'none';
};

window.closeWithdrawalRejectModal = function() {
    document.getElementById('withdrawalRejectModal').style.display = 'none';
};

window.processWithdrawalApproval = async function() {
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

window.processWithdrawalRejection = async function() {
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
window.previewProofImage = function(input) {
    const preview = document.getElementById('approveProofPreview');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
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
window.approveWithdrawal = async function(id) {
    openWithdrawalApprove(id);
};

window.viewUser = function(userId) {
  const user = staffData.users?.find(u => u.id === userId);
  if (!user) {
    showError('User not found in local cache');
    return;
  }
  
  const modal = document.getElementById('verificationModal');
  const titleEl = document.getElementById('modalTitle');
  const bodyEl = document.getElementById('modalBody');
  const approveBtn = document.getElementById('modalApproveBtn');
  const rejectBtn = document.getElementById('modalRejectBtn');

  titleEl.innerText = 'User Profile Detail';
  approveBtn.style.display = 'none';
  rejectBtn.style.display = 'none';

  const joinedDate = user.createdAt ? new Date(user.createdAt).toLocaleString() : 'N/A';
  const lastLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'N/A';

  bodyEl.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <div class="content-card" style="padding: 15px;">
        <h4 style="margin-top: 0;">Basic Info</h4>
        <p><strong>Name:</strong> ${user.displayName || user.name || 'N/A'}</p>
        <p><strong>Email:</strong> ${user.email || 'N/A'}</p>
        <p><strong>Phone:</strong> ${user.phone || 'N/A'}</p>
        <p><strong>UID:</strong> <code style="font-size: 0.7rem;">${user.id}</code></p>
      </div>
      <div class="content-card" style="padding: 15px;">
        <h4 style="margin-top: 0;">System Info</h4>
        <p><strong>Role:</strong> <span class="badge ${user.role === 'admin' ? 'badge-danger' : 'badge-info'}">${(user.role || 'Buyer').toUpperCase()}</span></p>
        <p><strong>Status:</strong> <span class="status-badge ${user.isActive !== false ? 'active' : 'inactive'}">${user.isActive !== false ? 'Active' : 'Inactive'}</span></p>
        <p><strong>Joined:</strong> ${joinedDate}</p>
        <p><strong>Last Login:</strong> ${lastLogin}</p>
      </div>
    </div>
  `;

  modal.style.display = 'block';
};

window.saveUserEdit = async function() {
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
window.viewUser = viewUser;
window.saveUserEdit = saveUserEdit;

// --- Logout Logic ---
window.logout = async function() {
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

