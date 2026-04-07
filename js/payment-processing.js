/* ========================================
   PAYMENT-PROCESSING.JS - JavaScript for payment processing module
   ======================================== */

// Storage keys
const CART_KEY = 'sthub_cart';
const ORDERS_KEY = 'sthub_orders';
const ESCROWS_KEY = 'sthub_escrows';
const PAYMENTS_KEY = 'sthub_payments';

// Global variables
let paymentData = [];
let escrowData = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  initializePaymentProcessing();
  loadPaymentData();
  updateAnalytics();
  setupEventListeners();
});

// Initialize payment processing
function initializePaymentProcessing() {
  console.log('Initializing Payment Processing System');
  
  // Update cart count
  updateCartCount();
  
  // Load data
  loadPaymentData();
  loadEscrowData();
  
  // Initialize sample data if needed
  initializeSampleData();
}

// Setup event listeners
function setupEventListeners() {
  // Filter change events
  const statusFilter = document.getElementById('transactionStatusFilter');
  if (statusFilter) {
    statusFilter.addEventListener('change', applyTransactionFilters);
  }
  
  const methodFilter = document.getElementById('paymentMethodFilter');
  if (methodFilter) {
    methodFilter.addEventListener('change', applyTransactionFilters);
  }
  
  const volumeFilter = document.getElementById('volumeTimeFilter');
  if (volumeFilter) {
    volumeFilter.addEventListener('change', updateVolumeChart);
  }
}

// Load payment data
function loadPaymentData() {
  try {
    paymentData = JSON.parse(localStorage.getItem(PAYMENTS_KEY) || '[]');
    console.log('Loaded payment data:', paymentData.length, 'payments');
    renderTransactionsTable();
  } catch (error) {
    console.error('Error loading payment data:', error);
    paymentData = [];
  }
}

// Load escrow data
function loadEscrowData() {
  try {
    escrowData = JSON.parse(localStorage.getItem(ESCROWS_KEY) || '[]');
    console.log('Loaded escrow data:', escrowData.length, 'escrow transactions');
    updatePaymentStats();
  } catch (error) {
    console.error('Error loading escrow data:', error);
    escrowData = [];
  }
}

// Update payment statistics
function updatePaymentStats() {
  // Calculate escrow transaction count
  const escrowCount = escrowData.length;
  document.getElementById('escrowTransactions').textContent = escrowCount;
  
  // Calculate total escrow amount
  const escrowAmount = escrowData.reduce((sum, escrow) => sum + (escrow.amount || 0), 0);
  document.getElementById('escrowAmount').textContent = formatCurrency(escrowAmount);
}

// Update analytics
function updateAnalytics() {
  // Calculate success rate
  const totalTransactions = paymentData.length + escrowData.length;
  const successfulTransactions = paymentData.filter(payment => 
    payment.status === 'completed'
  ).length + escrowData.filter(escrow => 
    escrow.status === 'released'
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

// Render transactions table
function renderTransactionsTable() {
  const tbody = document.getElementById('transactionsTableBody');
  if (!tbody) return;
  
  // Combine payment and escrow data
  const allTransactions = [
    ...paymentData.map(p => ({ ...p, type: 'payment' })),
    ...escrowData.map(e => ({ ...e, type: 'escrow' }))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  if (allTransactions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 40px; color: #6b7280;">
          <i class="fas fa-credit-card" style="font-size: 24px; margin-bottom: 12px; display: block;"></i>
          No transactions found
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = allTransactions.slice(0, 10).map(transaction => {
    const statusClass = getTransactionStatusClass(transaction.status);
    const statusText = getTransactionStatusText(transaction.status);
    const createdDate = new Date(transaction.createdAt).toLocaleDateString();
    const method = transaction.type === 'escrow' ? 'Escrow' : 'Direct';
    
    return `
      <tr>
        <td><strong>${transaction.id}</strong></td>
        <td>${transaction.orderId || 'N/A'}</td>
        <td>${formatCurrency(transaction.amount)}</td>
        <td><span class="method-badge ${transaction.type}">${method}</span></td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>${createdDate}</td>
        <td>
          <div class="transaction-actions">
            <button class="btn btn-secondary" onclick="viewTransactionDetails('${transaction.id}', '${transaction.type}')">
              <i class="fas fa-eye"></i>
            </button>
            ${transaction.status === 'pending' ? `
              <button class="btn btn-primary" onclick="processTransaction('${transaction.id}', '${transaction.type}')">
                <i class="fas fa-play"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Apply transaction filters
function applyTransactionFilters() {
  const statusFilter = document.getElementById('transactionStatusFilter')?.value || 'all';
  const methodFilter = document.getElementById('paymentMethodFilter')?.value || 'all';
  const dateFrom = document.getElementById('transactionDateFrom')?.value;
  const dateTo = document.getElementById('transactionDateTo')?.value;
  
  // Combine payment and escrow data
  let allTransactions = [
    ...paymentData.map(p => ({ ...p, type: 'payment' })),
    ...escrowData.map(e => ({ ...e, type: 'escrow' }))
  ];
  
  // Apply filters
  let filteredTransactions = allTransactions;
  
  // Filter by status
  if (statusFilter !== 'all') {
    filteredTransactions = filteredTransactions.filter(transaction => {
      if (statusFilter === 'completed') {
        return transaction.status === 'completed' || transaction.status === 'released';
      }
      return transaction.status === statusFilter;
    });
  }
  
  // Filter by method
  if (methodFilter !== 'all') {
    filteredTransactions = filteredTransactions.filter(transaction => {
      if (methodFilter === 'escrow') {
        return transaction.type === 'escrow';
      }
      return transaction.type === 'payment';
    });
  }
  
  // Filter by date range
  if (dateFrom) {
    const fromDate = new Date(dateFrom);
    filteredTransactions = filteredTransactions.filter(transaction => 
      new Date(transaction.createdAt) >= fromDate
    );
  }
  
  if (dateTo) {
    const toDate = new Date(dateTo);
    toDate.setHours(23, 59, 59, 999);
    filteredTransactions = filteredTransactions.filter(transaction => 
      new Date(transaction.createdAt) <= toDate
    );
  }
  
  // Sort by date (newest first)
  filteredTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  // Render filtered table
  renderFilteredTransactionsTable(filteredTransactions);
}

// Render filtered transactions table
function renderFilteredTransactionsTable(filteredTransactions) {
  const tbody = document.getElementById('transactionsTableBody');
  if (!tbody) return;
  
  if (filteredTransactions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 40px; color: #6b7280;">
          <i class="fas fa-search" style="font-size: 24px; margin-bottom: 12px; display: block;"></i>
          No transactions match the current filters
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = filteredTransactions.map(transaction => {
    const statusClass = getTransactionStatusClass(transaction.status);
    const statusText = getTransactionStatusText(transaction.status);
    const createdDate = new Date(transaction.createdAt).toLocaleDateString();
    const method = transaction.type === 'escrow' ? 'Escrow' : 'Direct';
    
    return `
      <tr>
        <td><strong>${transaction.id}</strong></td>
        <td>${transaction.orderId || 'N/A'}</td>
        <td>${formatCurrency(transaction.amount)}</td>
        <td><span class="method-badge ${transaction.type}">${method}</span></td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>${createdDate}</td>
        <td>
          <div class="transaction-actions">
            <button class="btn btn-secondary" onclick="viewTransactionDetails('${transaction.id}', '${transaction.type}')">
              <i class="fas fa-eye"></i>
            </button>
            ${transaction.status === 'pending' ? `
              <button class="btn btn-primary" onclick="processTransaction('${transaction.id}', '${transaction.type}')">
                <i class="fas fa-play"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Action functions
function viewTransactionDetails(transactionId, type) {
  let transaction;
  if (type === 'escrow') {
    transaction = escrowData.find(e => e.id === transactionId);
  } else {
    transaction = paymentData.find(p => p.id === transactionId);
  }
  
  if (!transaction) return;
  
  const details = `
    Transaction Details:
    ID: ${transaction.id}
    Type: ${type === 'escrow' ? 'Escrow' : 'Direct Payment'}
    Amount: ${formatCurrency(transaction.amount)}
    Status: ${transaction.status}
    Created: ${new Date(transaction.createdAt).toLocaleString()}
    ${transaction.orderId ? `Order: ${transaction.orderId}` : ''}
  `;
  
  alert(details);
}

function processTransaction(transactionId, type) {
  if (!confirm('Are you sure you want to process this transaction?')) {
    return;
  }
  
  if (type === 'escrow') {
    const escrowIndex = escrowData.findIndex(e => e.id === transactionId);
    if (escrowIndex !== -1) {
      escrowData[escrowIndex].status = 'processing';
      escrowData[escrowIndex].processedAt = new Date().toISOString();
      localStorage.setItem(ESCROWS_KEY, JSON.stringify(escrowData));
    }
  } else {
    const paymentIndex = paymentData.findIndex(p => p.id === transactionId);
    if (paymentIndex !== -1) {
      paymentData[paymentIndex].status = 'processing';
      paymentData[paymentIndex].processedAt = new Date().toISOString();
      localStorage.setItem(PAYMENTS_KEY, JSON.stringify(paymentData));
    }
  }
  
  // Refresh display
  renderTransactionsTable();
  updateAnalytics();
  
  alert('Transaction processing started!');
}

function refreshPaymentData() {
  loadPaymentData();
  loadEscrowData();
  updateAnalytics();
  alert('Payment data refreshed!');
}

function exportTransactions() {
  const allTransactions = [
    ...paymentData.map(p => ({ ...p, type: 'payment' })),
    ...escrowData.map(e => ({ ...e, type: 'escrow' }))
  ];
  
  const csv = convertToCSV(allTransactions, ['id', 'orderId', 'amount', 'status', 'type', 'createdAt']);
  downloadCSV(csv, 'payment-transactions.csv');
}

function viewAllTransactions() {
  // Navigate to full transactions page or show modal
  alert('Viewing all transactions...');
}

function updateVolumeChart() {
  const timeFilter = document.getElementById('volumeTimeFilter')?.value || 'today';
  console.log('Updating volume chart for:', timeFilter);
  // Implement chart update logic here
}

// Utility functions
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount || 0);
}

function getTransactionStatusClass(status) {
  const statusClasses = {
    'pending': 'warning',
    'processing': 'info',
    'completed': 'success',
    'released': 'success',
    'failed': 'danger',
    'cancelled': 'danger',
    'held': 'info',
    'shipped_to_escrow': 'warning',
    'at_escrow': 'info',
    'awaiting_confirmation': 'warning',
    'refunded': 'danger'
  };
  return statusClasses[status] || 'secondary';
}

function getTransactionStatusText(status) {
  const statusTexts = {
    'pending': 'Pending',
    'processing': 'Processing',
    'completed': 'Completed',
    'released': 'Released',
    'failed': 'Failed',
    'cancelled': 'Cancelled',
    'held': 'Funds Held',
    'shipped_to_escrow': 'Shipped to Escrow',
    'at_escrow': 'At Escrow Location',
    'awaiting_confirmation': 'Awaiting Confirmation',
    'refunded': 'Refunded'
  };
  return statusTexts[status] || status;
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
  if (paymentData.length === 0) {
    const samplePayments = [
      {
        id: 'PAY-001',
        orderId: 'ORD-001',
        amount: 299.99,
        status: 'completed',
        method: 'credit_card',
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'PAY-002',
        orderId: 'ORD-002',
        amount: 599.99,
        status: 'pending',
        method: 'bank_transfer',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      }
    ];
    
    localStorage.setItem(PAYMENTS_KEY, JSON.stringify(samplePayments));
    paymentData = samplePayments;
  }
  
  if (escrowData.length === 0) {
    const sampleEscrows = [
      {
        id: 'ESC-001',
        orderId: 'ORD-003',
        amount: 199.99,
        status: 'held',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'ESC-002',
        orderId: 'ORD-004',
        amount: 799.99,
        status: 'released',
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        releasedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];
    
    localStorage.setItem(ESCROWS_KEY, JSON.stringify(sampleEscrows));
    escrowData = sampleEscrows;
  }
}

// Initialize sample data on first load
if (localStorage.getItem(PAYMENTS_KEY) === null || localStorage.getItem(ESCROWS_KEY) === null) {
  initializeSampleData();
}
