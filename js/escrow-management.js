/* ========================================
   ESCROW-MANAGEMENT.JS - JavaScript for escrow management module
   ======================================== */

// Storage keys
const CART_KEY = 'sthub_cart';
const ORDERS_KEY = 'sthub_orders';
const ESCROWS_KEY = 'sthub_escrows';
const DISPUTES_KEY = 'sthub_disputes';

// Global variables
let currentTab = 'payments';
let escrowData = [];
let disputeData = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  initializeEscrowManagement();
  loadEscrowData();
  loadDisputeData();
  updateStats();
  setupEventListeners();
});

// Initialize escrow management
function initializeEscrowManagement() {
  console.log('Initializing Escrow Management System');
  
  // Update cart count
  updateCartCount();
  
  // Set up tab switching
  setupTabSwitching();
  
  // Load initial data
  loadEscrowData();
  loadDisputeData();
}

// Setup event listeners
function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const tabId = this.dataset.tab;
      switchTab(tabId);
    });
  });
  
  // Filter buttons
  const escrowFilterBtn = document.getElementById('escrowStatusFilter');
  if (escrowFilterBtn) {
    escrowFilterBtn.addEventListener('change', applyEscrowFilters);
  }
  
  const disputeFilterBtn = document.getElementById('disputeStatusFilter');
  if (disputeFilterBtn) {
    disputeFilterBtn.addEventListener('change', applyDisputeFilters);
  }
}

// Tab switching functionality
function setupTabSwitching() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const tabId = this.dataset.tab;
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  // Update active tab button
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
  
  // Update active tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`${tabId}-tab`).classList.add('active');
  
  currentTab = tabId;
  
  // Load data for specific tab
  switch(tabId) {
    case 'escrow':
      loadEscrowData();
      break;
    case 'disputes':
      loadDisputeData();
      break;
    case 'reports':
      loadReportsData();
      break;
  }
}

// Load escrow data
function loadEscrowData() {
  try {
    escrowData = JSON.parse(localStorage.getItem(ESCROWS_KEY) || '[]');
    console.log('Loaded escrow data:', escrowData.length, 'transactions');
    renderEscrowTable();
  } catch (error) {
    console.error('Error loading escrow data:', error);
    escrowData = [];
  }
}

// Load dispute data
function loadDisputeData() {
  try {
    disputeData = JSON.parse(localStorage.getItem(DISPUTES_KEY) || '[]');
    console.log('Loaded dispute data:', disputeData.length, 'disputes');
    renderDisputesGrid();
  } catch (error) {
    console.error('Error loading dispute data:', error);
    disputeData = [];
  }
}

// Load reports data
function loadReportsData() {
  // Calculate success rate
  const totalTransactions = escrowData.length;
  const successfulTransactions = escrowData.filter(escrow => 
    escrow.status === 'released' || escrow.status === 'completed'
  ).length;
  const successRate = totalTransactions > 0 ? (successfulTransactions / totalTransactions * 100).toFixed(1) : 0;
  
  document.getElementById('successRate').textContent = successRate + '%';
  
  // Calculate average processing time
  const completedEscrows = escrowData.filter(escrow => 
    escrow.status === 'released' && escrow.completedAt
  );
  
  if (completedEscrows.length > 0) {
    const totalDays = completedEscrows.reduce((sum, escrow) => {
      const created = new Date(escrow.createdAt);
      const completed = new Date(escrow.completedAt);
      const days = (completed - created) / (1000 * 60 * 60 * 24);
      return sum + days;
    }, 0);
    
    const avgDays = (totalDays / completedEscrows.length).toFixed(1);
    document.getElementById('avgProcessingTime').textContent = avgDays;
  }
}

// Update statistics
function updateStats() {
  // Calculate total escrow amount
  const totalAmount = escrowData.reduce((sum, escrow) => {
    return sum + (escrow.amount || 0);
  }, 0);
  
  document.getElementById('totalEscrowAmount').textContent = formatCurrency(totalAmount);
  
  // Calculate pending transactions
  const pendingCount = escrowData.filter(escrow => 
    ['held', 'shipped_to_escrow', 'at_escrow', 'awaiting_confirmation'].includes(escrow.status)
  ).length;
  
  document.getElementById('pendingTransactions').textContent = pendingCount;
  
  // Calculate completed transactions today
  const today = new Date().toDateString();
  const completedToday = escrowData.filter(escrow => {
    if (!escrow.completedAt) return false;
    return new Date(escrow.completedAt).toDateString() === today;
  }).length;
  
  document.getElementById('completedTransactions').textContent = completedToday;
  
  // Calculate active disputes
  const activeDisputes = disputeData.filter(dispute => 
    ['open', 'under_review'].includes(dispute.status)
  ).length;
  
  document.getElementById('disputesCount').textContent = activeDisputes;
  
  // Update dispute stats
  document.getElementById('openDisputes').textContent = activeDisputes;
  
  const resolvedToday = disputeData.filter(dispute => {
    if (dispute.status !== 'resolved' || !dispute.resolvedAt) return false;
    return new Date(dispute.resolvedAt).toDateString() === today;
  }).length;
  
  document.getElementById('resolvedDisputes').textContent = resolvedToday;
  
  // Calculate average resolution time
  const resolvedDisputes = disputeData.filter(dispute => 
    dispute.status === 'resolved' && dispute.resolvedAt && dispute.createdAt
  );
  
  if (resolvedDisputes.length > 0) {
    const totalHours = resolvedDisputes.reduce((sum, dispute) => {
      const created = new Date(dispute.createdAt);
      const resolved = new Date(dispute.resolvedAt);
      const hours = (resolved - created) / (1000 * 60 * 60);
      return sum + hours;
    }, 0);
    
    const avgHours = Math.round(totalHours / resolvedDisputes.length);
    document.getElementById('avgResolutionTime').textContent = avgHours + 'h';
  }
}

// Render escrow table
function renderEscrowTable() {
  const tbody = document.getElementById('escrowTableBody');
  if (!tbody) return;
  
  if (escrowData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px; color: #6b7280;">
          <i class="fas fa-inbox" style="font-size: 24px; margin-bottom: 12px; display: block;"></i>
          No escrow transactions found
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = escrowData.map(escrow => {
    const statusClass = getStatusClass(escrow.status);
    const statusText = getStatusText(escrow.status);
    const createdDate = new Date(escrow.createdAt).toLocaleDateString();
    
    return `
      <tr>
        <td><strong>${escrow.id}</strong></td>
        <td>${escrow.orderId}</td>
        <td>${formatCurrency(escrow.amount)}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>${createdDate}</td>
        <td>
          <div class="transaction-actions">
            <button class="btn btn-secondary" onclick="viewEscrowDetails('${escrow.id}')">
              <i class="fas fa-eye"></i>
            </button>
            ${escrow.status === 'held' ? `
              <button class="btn btn-primary" onclick="releaseEscrowFunds('${escrow.id}')">
                <i class="fas fa-unlock"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Render disputes grid
function renderDisputesGrid() {
  const grid = document.getElementById('disputesGrid');
  if (!grid) return;
  
  if (disputeData.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #6b7280;">
        <i class="fas fa-gavel" style="font-size: 48px; margin-bottom: 16px; display: block;"></i>
        <h3>No disputes found</h3>
        <p>All transactions are proceeding smoothly</p>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = disputeData.map(dispute => {
    const priorityClass = dispute.priority || 'medium';
    const statusClass = dispute.status || 'open';
    const createdDate = new Date(dispute.createdAt).toLocaleDateString();
    
    return `
      <div class="dispute-card">
        <div class="dispute-header">
          <div class="dispute-id">${dispute.id}</div>
          <div class="dispute-priority ${priorityClass}">${priorityClass}</div>
        </div>
        <div class="dispute-details">
          <p><strong>Order:</strong> ${dispute.orderId}</p>
          <p><strong>Issue:</strong> ${dispute.issue || 'Product mismatch'}</p>
          <p><strong>Status:</strong> ${statusClass.replace('_', ' ')}</p>
          <p><strong>Created:</strong> ${createdDate}</p>
        </div>
        <div class="dispute-actions">
          <button class="btn btn-primary" onclick="reviewDispute('${dispute.id}')">
            <i class="fas fa-eye"></i>
            Review
          </button>
          ${statusClass === 'open' ? `
            <button class="btn btn-secondary" onclick="assignDispute('${dispute.id}')">
              <i class="fas fa-user"></i>
              Assign
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Apply escrow filters
function applyEscrowFilters() {
  const statusFilter = document.getElementById('escrowStatusFilter')?.value || 'all';
  const dateFrom = document.getElementById('escrowDateFrom')?.value;
  const dateTo = document.getElementById('escrowDateTo')?.value;
  const amountMin = parseFloat(document.getElementById('escrowAmountMin')?.value) || 0;
  const amountMax = parseFloat(document.getElementById('escrowAmountMax')?.value) || Infinity;
  
  let filteredData = [...escrowData];
  
  // Filter by status
  if (statusFilter !== 'all') {
    filteredData = filteredData.filter(escrow => escrow.status === statusFilter);
  }
  
  // Filter by date range
  if (dateFrom) {
    const fromDate = new Date(dateFrom);
    filteredData = filteredData.filter(escrow => new Date(escrow.createdAt) >= fromDate);
  }
  
  if (dateTo) {
    const toDate = new Date(dateTo);
    toDate.setHours(23, 59, 59, 999); // End of day
    filteredData = filteredData.filter(escrow => new Date(escrow.createdAt) <= toDate);
  }
  
  // Filter by amount range
  filteredData = filteredData.filter(escrow => 
    escrow.amount >= amountMin && escrow.amount <= amountMax
  );
  
  // Re-render table with filtered data
  renderFilteredEscrowTable(filteredData);
}

// Apply dispute filters
function applyDisputeFilters() {
  const statusFilter = document.getElementById('disputeStatusFilter')?.value || 'all';
  const priorityFilter = document.getElementById('disputePriorityFilter')?.value || 'all';
  
  let filteredData = [...disputeData];
  
  // Filter by status
  if (statusFilter !== 'all') {
    filteredData = filteredData.filter(dispute => dispute.status === statusFilter);
  }
  
  // Filter by priority
  if (priorityFilter !== 'all') {
    filteredData = filteredData.filter(dispute => (dispute.priority || 'medium') === priorityFilter);
  }
  
  // Re-render grid with filtered data
  renderFilteredDisputesGrid(filteredData);
}

// Render filtered escrow table
function renderFilteredEscrowTable(filteredData) {
  const tbody = document.getElementById('escrowTableBody');
  if (!tbody) return;
  
  if (filteredData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px; color: #6b7280;">
          <i class="fas fa-search" style="font-size: 24px; margin-bottom: 12px; display: block;"></i>
          No transactions match the current filters
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = filteredData.map(escrow => {
    const statusClass = getStatusClass(escrow.status);
    const statusText = getStatusText(escrow.status);
    const createdDate = new Date(escrow.createdAt).toLocaleDateString();
    
    return `
      <tr>
        <td><strong>${escrow.id}</strong></td>
        <td>${escrow.orderId}</td>
        <td>${formatCurrency(escrow.amount)}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>${createdDate}</td>
        <td>
          <div class="transaction-actions">
            <button class="btn btn-secondary" onclick="viewEscrowDetails('${escrow.id}')">
              <i class="fas fa-eye"></i>
            </button>
            ${escrow.status === 'held' ? `
              <button class="btn btn-primary" onclick="releaseEscrowFunds('${escrow.id}')">
                <i class="fas fa-unlock"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Render filtered disputes grid
function renderFilteredDisputesGrid(filteredData) {
  const grid = document.getElementById('disputesGrid');
  if (!grid) return;
  
  if (filteredData.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #6b7280;">
        <i class="fas fa-search" style="font-size: 48px; margin-bottom: 16px; display: block;"></i>
        <h3>No disputes match the current filters</h3>
        <p>Try adjusting your filter criteria</p>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = filteredData.map(dispute => {
    const priorityClass = dispute.priority || 'medium';
    const statusClass = dispute.status || 'open';
    const createdDate = new Date(dispute.createdAt).toLocaleDateString();
    
    return `
      <div class="dispute-card">
        <div class="dispute-header">
          <div class="dispute-id">${dispute.id}</div>
          <div class="dispute-priority ${priorityClass}">${priorityClass}</div>
        </div>
        <div class="dispute-details">
          <p><strong>Order:</strong> ${dispute.orderId}</p>
          <p><strong>Issue:</strong> ${dispute.issue || 'Product mismatch'}</p>
          <p><strong>Status:</strong> ${statusClass.replace('_', ' ')}</p>
          <p><strong>Created:</strong> ${createdDate}</p>
        </div>
        <div class="dispute-actions">
          <button class="btn btn-primary" onclick="reviewDispute('${dispute.id}')">
            <i class="fas fa-eye"></i>
            Review
          </button>
          ${statusClass === 'open' ? `
            <button class="btn btn-secondary" onclick="assignDispute('${dispute.id}')">
              <i class="fas fa-user"></i>
              Assign
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Action functions
function viewEscrowDetails(escrowId) {
  const escrow = escrowData.find(e => e.id === escrowId);
  if (!escrow) return;
  
  // Create modal or navigate to details page
  alert(`Escrow Details:\nID: ${escrow.id}\nOrder: ${escrow.orderId}\nAmount: ${formatCurrency(escrow.amount)}\nStatus: ${escrow.status}`);
}

function releaseEscrowFunds(escrowId) {
  if (!confirm('Are you sure you want to release funds for this escrow transaction?')) {
    return;
  }
  
  const escrowIndex = escrowData.findIndex(e => e.id === escrowId);
  if (escrowIndex === -1) return;
  
  // Update escrow status
  escrowData[escrowIndex].status = 'released';
  escrowData[escrowIndex].releasedAt = new Date().toISOString();
  escrowData[escrowIndex].completedAt = new Date().toISOString();
  
  // Save to localStorage
  localStorage.setItem(ESCROWS_KEY, JSON.stringify(escrowData));
  
  // Update corresponding order status
  updateOrderStatus(escrowData[escrowIndex].orderId, 'released');
  
  // Refresh display
  renderEscrowTable();
  updateStats();
  
  alert('Funds released successfully!');
}

function reviewDispute(disputeId) {
  const dispute = disputeData.find(d => d.id === disputeId);
  if (!dispute) return;
  
  // Create modal or navigate to dispute details
  alert(`Dispute Review:\nID: ${dispute.id}\nOrder: ${dispute.orderId}\nIssue: ${dispute.issue || 'Product mismatch'}\nStatus: ${dispute.status}`);
}

function assignDispute(disputeId) {
  const disputeIndex = disputeData.findIndex(d => d.id === disputeId);
  if (disputeIndex === -1) return;
  
  // Update dispute status
  disputeData[disputeIndex].status = 'under_review';
  disputeData[disputeIndex].assignedAt = new Date().toISOString();
  
  // Save to localStorage
  localStorage.setItem(DISPUTES_KEY, JSON.stringify(disputeData));
  
  // Refresh display
  renderDisputesGrid();
  updateStats();
  
  alert('Dispute assigned for review!');
}

// Utility functions
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount || 0);
}

function getStatusClass(status) {
  const statusClasses = {
    'held': 'active',
    'shipped_to_escrow': 'warning',
    'at_escrow': 'info',
    'awaiting_confirmation': 'warning',
    'released': 'success',
    'refunded': 'danger',
    'cancelled': 'danger'
  };
  return statusClasses[status] || 'secondary';
}

function getStatusText(status) {
  const statusTexts = {
    'held': 'Funds Held',
    'shipped_to_escrow': 'Shipped to Escrow',
    'at_escrow': 'At Escrow Location',
    'awaiting_confirmation': 'Awaiting Confirmation',
    'released': 'Funds Released',
    'refunded': 'Refunded',
    'cancelled': 'Cancelled'
  };
  return statusTexts[status] || status;
}

function updateOrderStatus(orderId, newStatus) {
  try {
    const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
      orders[orderIndex].status = newStatus;
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    }
  } catch (error) {
    console.error('Error updating order status:', error);
  }
}

// Refresh functions
function refreshEscrowData() {
  loadEscrowData();
  updateStats();
  alert('Escrow data refreshed!');
}

function refreshDisputeData() {
  loadDisputeData();
  updateStats();
  alert('Dispute data refreshed!');
}

// Export functions
function exportEscrowData() {
  const csv = convertToCSV(escrowData, ['id', 'orderId', 'amount', 'status', 'createdAt']);
  downloadCSV(csv, 'escrow-transactions.csv');
}

function exportAllReports() {
  const reports = {
    escrow: escrowData,
    disputes: disputeData,
    stats: {
      totalAmount: escrowData.reduce((sum, e) => sum + (e.amount || 0), 0),
      pendingCount: escrowData.filter(e => ['held', 'shipped_to_escrow', 'at_escrow', 'awaiting_confirmation'].includes(e.status)).length,
      activeDisputes: disputeData.filter(d => ['open', 'under_review'].includes(d.status)).length
    }
  };
  
  const json = JSON.stringify(reports, null, 2);
  downloadJSON(json, 'escrow-reports.json');
}

// Report generation
function generateReport(type) {
  const reportData = {
    type: type,
    generatedAt: new Date().toISOString(),
    escrowData: escrowData,
    disputeData: disputeData,
    stats: {
      totalAmount: escrowData.reduce((sum, e) => sum + (e.amount || 0), 0),
      pendingCount: escrowData.filter(e => ['held', 'shipped_to_escrow', 'at_escrow', 'awaiting_confirmation'].includes(e.status)).length,
      activeDisputes: disputeData.filter(d => ['open', 'under_review'].includes(d.status)).length
    }
  };
  
  const json = JSON.stringify(reportData, null, 2);
  downloadJSON(json, `${type}-report.json`);
  alert(`${type.charAt(0).toUpperCase() + type.slice(1)} report generated!`);
}

// Utility functions for data export
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

function downloadJSON(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Cart count update
function updateCartCount() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    const count = cart.reduce((sum, item) => sum + (item.qty || 1), 0);
    const cartCountEl = document.getElementById('cartCount');
    if (cartCountEl) {
      cartCountEl.textContent = count;
    }
  } catch (error) {
    console.error('Error updating cart count:', error);
  }
}

// Initialize sample data if none exists
function initializeSampleData() {
  if (escrowData.length === 0) {
    const sampleEscrows = [
      {
        id: 'ESC-001',
        orderId: 'ORD-001',
        amount: 299.99,
        currency: 'USD',
        status: 'held',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        releases: [],
        refunds: []
      },
      {
        id: 'ESC-002',
        orderId: 'ORD-002',
        amount: 599.99,
        currency: 'USD',
        status: 'released',
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        releasedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        releases: [],
        refunds: []
      }
    ];
    
    localStorage.setItem(ESCROWS_KEY, JSON.stringify(sampleEscrows));
    escrowData = sampleEscrows;
  }
  
  if (disputeData.length === 0) {
    const sampleDisputes = [
      {
        id: 'DISP-001',
        orderId: 'ORD-003',
        issue: 'Product condition does not match description',
        status: 'open',
        priority: 'high',
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];
    
    localStorage.setItem(DISPUTES_KEY, JSON.stringify(sampleDisputes));
    disputeData = sampleDisputes;
  }
}

// Initialize sample data on first load
if (localStorage.getItem(ESCROWS_KEY) === null || localStorage.getItem(DISPUTES_KEY) === null) {
  initializeSampleData();
}
