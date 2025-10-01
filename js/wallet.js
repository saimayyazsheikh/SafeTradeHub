// ========================================
// WALLET.JS - Wallet functionality
// ========================================

// API Configuration
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';
const API_ENDPOINTS = {
  wallet: `${API_BASE}/api/wallet`,
  depositTokens: `${API_BASE}/api/payments/deposit-tokens`,
  completeStripeDeposit: `${API_BASE}/api/payments/complete-stripe-deposit`
};

// Global state
let currentUser = null;
let walletData = null;
let transactions = [];
let currentPage = 1;
const itemsPerPage = 10;

// Initialize wallet page
document.addEventListener('DOMContentLoaded', function() {
  initializeWallet();
});

async function initializeWallet() {
  try {
    console.log('💼 Wallet: Starting initialization...');
    
    // Wait for AuthManager with multiple attempts
    if (window.AuthManager) {
      let authReady = false;
      let attempts = 0;
      while (!authReady && attempts < 20) {
        try {
          await window.AuthManager.waitForInit();
          authReady = true;
          console.log('✅ Wallet: AuthManager ready after', attempts, 'attempts');
        } catch (error) {
          console.warn('⚠️ Wallet: AuthManager not ready, attempt', attempts, error);
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
      }
    }
    
    // ROBUST authentication check with multiple methods
    let authenticated = false;
    let attempts = 0;
    
    while (!authenticated && attempts < 5) {
      currentUser = getCurrentUser();
      authenticated = !!currentUser;
      
      if (!authenticated) {
        console.warn(`⚠️ Wallet: Auth check failed, attempt ${attempts + 1}/5`);
        await new Promise(resolve => setTimeout(resolve, 200));
        attempts++;
      } else {
        console.log('✅ Wallet: Authentication confirmed on attempt', attempts + 1, 'user:', currentUser.name);
        break;
      }
    }
    
    if (!authenticated) {
      console.error('❌ Wallet: User not authenticated after multiple attempts, redirecting to login');
      window.location.href = 'auth.html?mode=signin&redirect=' + encodeURIComponent('wallet.html');
      return;
    }
    
    console.log('✅ Wallet: User authenticated, proceeding with wallet initialization');

    // Update cart count
    if (window.SafeTradeHub) {
      window.SafeTradeHub.updateCartCount();
    }

    // Load wallet data
    await loadWalletData();
    
    // Check for Stripe session completion
    checkStripeSession();
    
    // Set up event listeners
    setupEventListeners();
    
    console.log('✅ Wallet: Initialization complete');
    
  } catch (error) {
    console.error('❌ Wallet: Failed to initialize wallet:', error);
    showToast('Failed to load wallet data', 'error');
  }
}

function getCurrentUser() {
  try {
    // First check global AuthManager
    if (window.AuthManager && window.AuthManager.isAuthenticated()) {
      const user = window.AuthManager.getCurrentUser();
      console.log('👤 Wallet: AuthManager user:', user);
      return user;
    }
    
    // Fallback: check localStorage directly
    const userData = localStorage.getItem('userData');
    const authToken = localStorage.getItem('authToken');
    
    if (userData && authToken) {
      const user = JSON.parse(userData);
      console.log('👤 Wallet: localStorage user:', user);
      return user;
    }
    
    // Last fallback: check Firebase auth
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
      const firebaseUser = firebase.auth().currentUser;
      console.log('👤 Wallet: Firebase user:', firebaseUser);
      return {
        id: firebaseUser.uid,
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        name: firebaseUser.displayName || 'User',
        provider: 'firebase'
      };
    }
    
    console.warn('⚠️ Wallet: No user found in any auth system');
    return null;
  } catch (error) {
    console.error('❌ Wallet: Error getting current user:', error);
    return null;
  }
}

async function loadWalletData() {
  try {
    showLoading(true);
    
    const token = localStorage.getItem('authToken');
    const response = await fetch(API_ENDPOINTS.wallet, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load wallet data');
    }

    const data = await response.json();
    
    if (data.success) {
      walletData = data.data.wallet;
      transactions = data.data.transactions || [];
      
      updateWalletDisplay();
      updateTransactionsList();
      updatePagination(data.data.pagination);
    } else {
      throw new Error(data.message || 'Failed to load wallet data');
    }
  } catch (error) {
    console.error('Error loading wallet data:', error);
    showToast('Failed to load wallet data', 'error');
    
    // Show fallback data
    showFallbackWalletData();
  } finally {
    showLoading(false);
  }
}

function updateWalletDisplay() {
  // Update balance display
  const balanceEl = document.getElementById('walletBalance');
  if (balanceEl && walletData) {
    balanceEl.textContent = formatCurrency(walletData.balance || 0);
  }

  // Update stats
  const totalDepositedEl = document.getElementById('totalDeposited');
  if (totalDepositedEl && walletData) {
    totalDepositedEl.textContent = formatCurrency(walletData.totalDeposited || 0);
  }

  const totalSpentEl = document.getElementById('totalSpent');
  if (totalSpentEl && walletData) {
    totalSpentEl.textContent = formatCurrency(walletData.totalSpent || 0);
  }

  // Calculate escrow held amount from transactions
  const escrowHeld = transactions
    .filter(t => t.type === 'escrow_hold' && t.status === 'completed')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  const escrowHeldEl = document.getElementById('escrowHeld');
  if (escrowHeldEl) {
    escrowHeldEl.textContent = formatCurrency(escrowHeld);
  }
}

function updateTransactionsList() {
  const transactionsList = document.getElementById('transactionsList');
  if (!transactionsList) return;

  if (!transactions || transactions.length === 0) {
    transactionsList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-receipt"></i>
        <h4>No transactions yet</h4>
        <p>Your transaction history will appear here</p>
      </div>
    `;
    return;
  }

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTransactions = transactions.slice(startIndex, endIndex);

  transactionsList.innerHTML = paginatedTransactions.map(transaction => {
    const isPositive = transaction.amount > 0;
    const icon = getTransactionIcon(transaction.type);
    const title = getTransactionTitle(transaction.type);
    
    return `
      <div class="transaction-item">
        <div class="transaction-icon ${transaction.type}">
          <i class="${icon}"></i>
        </div>
        <div class="transaction-details">
          <div class="transaction-title">${title}</div>
          <div class="transaction-description">${transaction.description || ''}</div>
          ${transaction.orderId ? `<div class="transaction-description">Order: ${transaction.orderId}</div>` : ''}
        </div>
        <div class="transaction-meta">
          <div class="transaction-amount ${isPositive ? 'positive' : 'negative'}">
            ${isPositive ? '+' : ''}${formatCurrency(transaction.amount)}
          </div>
          <div class="transaction-date">${formatDate(transaction.createdAt)}</div>
          <div class="transaction-status ${transaction.status}">${transaction.status}</div>
        </div>
      </div>
    `;
  }).join('');
}

function getTransactionIcon(type) {
  const icons = {
    'deposit': 'fas fa-arrow-down',
    'escrow_hold': 'fas fa-shield-alt',
    'escrow_release': 'fas fa-check-circle',
    'refund': 'fas fa-undo',
    'transfer_in': 'fas fa-arrow-left',
    'transfer_out': 'fas fa-arrow-right'
  };
  return icons[type] || 'fas fa-exchange-alt';
}

function getTransactionTitle(type) {
  const titles = {
    'deposit': 'Token Deposit',
    'escrow_hold': 'Escrow Hold',
    'escrow_release': 'Escrow Release',
    'refund': 'Refund',
    'transfer_in': 'Transfer Received',
    'transfer_out': 'Transfer Sent'
  };
  return titles[type] || 'Transaction';
}

function updatePagination(pagination) {
  const paginationEl = document.getElementById('transactionPagination');
  if (!paginationEl || !pagination) return;

  const { current, pages, total } = pagination;
  
  if (pages <= 1) {
    paginationEl.innerHTML = '';
    return;
  }

  let paginationHTML = '';
  
  // Previous button
  paginationHTML += `
    <button ${current <= 1 ? 'disabled' : ''} onclick="changePage(${current - 1})">
      <i class="fas fa-chevron-left"></i>
    </button>
  `;
  
  // Page numbers
  for (let i = 1; i <= pages; i++) {
    if (i === current) {
      paginationHTML += `<button class="active">${i}</button>`;
    } else if (i === 1 || i === pages || (i >= current - 1 && i <= current + 1)) {
      paginationHTML += `<button onclick="changePage(${i})">${i}</button>`;
    } else if (i === current - 2 || i === current + 2) {
      paginationHTML += `<span>...</span>`;
    }
  }
  
  // Next button
  paginationHTML += `
    <button ${current >= pages ? 'disabled' : ''} onclick="changePage(${current + 1})">
      <i class="fas fa-chevron-right"></i>
    </button>
  `;
  
  paginationEl.innerHTML = paginationHTML;
}

function setupEventListeners() {
  // Filter form
  const typeFilter = document.getElementById('transactionTypeFilter');
  const dateFrom = document.getElementById('dateFrom');
  const dateTo = document.getElementById('dateTo');
  
  if (typeFilter) typeFilter.addEventListener('change', applyFilters);
  if (dateFrom) dateFrom.addEventListener('change', applyFilters);
  if (dateTo) dateTo.addEventListener('change', applyFilters);
}

function showFallbackWalletData() {
  // Show default wallet data when API is unavailable
  walletData = {
    balance: 0,
    totalDeposited: 0,
    totalSpent: 0
  };
  transactions = [];
  updateWalletDisplay();
  updateTransactionsList();
}

// Modal Functions
function openDepositModal() {
  const modal = document.getElementById('depositModal');
  if (modal) {
    modal.classList.add('show');
    document.getElementById('depositAmount').focus();
  }
}

function closeDepositModal() {
  const modal = document.getElementById('depositModal');
  if (modal) {
    modal.classList.remove('show');
    document.getElementById('depositForm').reset();
  }
}

function setAmount(amount) {
  const amountInput = document.getElementById('depositAmount');
  if (amountInput) {
    amountInput.value = amount;
  }
}

async function processDeposit() {
  try {
    const form = document.getElementById('depositForm');
    const formData = new FormData(form);
    
    const amount = parseFloat(formData.get('depositAmount') || document.getElementById('depositAmount').value);
    const paymentMethod = formData.get('paymentMethod');
    const agreeTerms = document.getElementById('agreeTerms').checked;
    
    // Validation
    if (!amount || amount < 1) {
      showToast('Please enter a valid amount (minimum $1)', 'error');
      return;
    }
    
    if (!paymentMethod) {
      showToast('Please select a payment method', 'error');
      return;
    }
    
    if (!agreeTerms) {
      showToast('Please agree to the terms of service', 'error');
      return;
    }
    
    showLoading(true);
    
    const token = localStorage.getItem('authToken');
    const response = await fetch(API_ENDPOINTS.depositTokens, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount,
        paymentMethod,
        returnUrl: window.location.origin + '/wallet.html'
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      handleDepositResponse(data.data, paymentMethod);
    } else {
      throw new Error(data.message || 'Deposit failed');
    }
    
  } catch (error) {
    console.error('Deposit error:', error);
    showToast(error.message || 'Failed to process deposit', 'error');
  } finally {
    showLoading(false);
  }
}

function handleDepositResponse(data, paymentMethod) {
  closeDepositModal();
  
  switch (paymentMethod) {
    case 'stripe':
      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        showToast('Failed to initialize payment', 'error');
      }
      break;
      
    case 'bank_transfer':
      showBankTransferInstructions(data);
      break;
      
    case 'crypto':
      showCryptoInstructions(data);
      break;
      
    default:
      showToast('Payment method not supported yet', 'warning');
  }
}

function showBankTransferInstructions(data) {
  const modal = document.createElement('div');
  modal.className = 'modal show';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>Bank Transfer Instructions</h3>
        <button class="modal-close" onclick="this.closest('.modal').remove()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body">
        <p>Please transfer the funds to the following bank account:</p>
        <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p><strong>Account Name:</strong> ${data.bankDetails.accountName}</p>
          <p><strong>Account Number:</strong> ${data.bankDetails.accountNumber}</p>
          <p><strong>Routing Number:</strong> ${data.bankDetails.routingNumber}</p>
          <p><strong>Reference:</strong> ${data.bankDetails.reference}</p>
        </div>
        <p><strong>Important:</strong> Please include the reference number in your transfer to ensure proper crediting.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="this.closest('.modal').remove()">
          I understand
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function showCryptoInstructions(data) {
  const modal = document.createElement('div');
  modal.className = 'modal show';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>Cryptocurrency Payment</h3>
        <button class="modal-close" onclick="this.closest('.modal').remove()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body">
        <p>Send exactly <strong>$${data.amount}</strong> worth of cryptocurrency to:</p>
        <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0; word-break: break-all;">
          <p><strong>Wallet Address:</strong></p>
          <p style="font-family: monospace; font-size: 14px;">${data.walletAddress}</p>
        </div>
        <p><strong>Reference:</strong> ${data.reference}</p>
        <p><em>Note: Processing may take 10-60 minutes depending on network confirmation.</em></p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="this.closest('.modal').remove()">
          I understand
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function checkStripeSession() {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session_id');
  const status = urlParams.get('status');
  
  if (sessionId && status === 'success') {
    completeStripeDeposit(sessionId);
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (status === 'cancelled') {
    showToast('Payment was cancelled', 'warning');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

async function completeStripeDeposit(sessionId) {
  try {
    showLoading(true);
    
    const token = localStorage.getItem('authToken');
    const response = await fetch(API_ENDPOINTS.completeStripeDeposit, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sessionId })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast(`Successfully added ${formatCurrency(data.data.amount)} to your wallet!`, 'success');
      await loadWalletData(); // Refresh wallet data
    } else {
      throw new Error(data.message || 'Failed to complete deposit');
    }
    
  } catch (error) {
    console.error('Stripe completion error:', error);
    showToast('Failed to complete deposit. Please contact support.', 'error');
  } finally {
    showLoading(false);
  }
}

// Filter and pagination functions
async function applyFilters() {
  const typeFilter = document.getElementById('transactionTypeFilter').value;
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;
  
  let filteredTransactions = [...transactions];
  
  // Filter by type
  if (typeFilter && typeFilter !== 'all') {
    filteredTransactions = filteredTransactions.filter(t => t.type === typeFilter);
  }
  
  // Filter by date range
  if (dateFrom) {
    const fromDate = new Date(dateFrom);
    filteredTransactions = filteredTransactions.filter(t => {
      const transactionDate = new Date(t.createdAt);
      return transactionDate >= fromDate;
    });
  }
  
  if (dateTo) {
    const toDate = new Date(dateTo);
    toDate.setHours(23, 59, 59, 999); // End of day
    filteredTransactions = filteredTransactions.filter(t => {
      const transactionDate = new Date(t.createdAt);
      return transactionDate <= toDate;
    });
  }
  
  transactions = filteredTransactions;
  currentPage = 1;
  updateTransactionsList();
  updatePagination({
    current: 1,
    pages: Math.ceil(transactions.length / itemsPerPage),
    total: transactions.length
  });
}

function changePage(page) {
  currentPage = page;
  updateTransactionsList();
  updatePagination({
    current: page,
    pages: Math.ceil(transactions.length / itemsPerPage),
    total: transactions.length
  });
}

async function refreshWallet() {
  await loadWalletData();
  showToast('Wallet data refreshed', 'success');
}

function viewEscrowTransactions() {
  const typeFilter = document.getElementById('transactionTypeFilter');
  if (typeFilter) {
    typeFilter.value = 'escrow_hold';
    applyFilters();
  }
  showToast('Showing escrow transactions', 'success');
}

function downloadStatement() {
  try {
    const csv = generateCSV(transactions);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SafeTradeHub_Statement_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showToast('Statement downloaded successfully', 'success');
  } catch (error) {
    console.error('Download error:', error);
    showToast('Failed to download statement', 'error');
  }
}

function generateCSV(transactions) {
  const headers = ['Date', 'Type', 'Description', 'Amount', 'Status', 'Order ID'];
  const rows = transactions.map(t => [
    new Date(t.createdAt).toLocaleDateString(),
    getTransactionTitle(t.type),
    t.description || '',
    t.amount,
    t.status,
    t.orderId || ''
  ]);
  
  return [headers, ...rows]
    .map(row => row.map(field => `"${field}"`).join(','))
    .join('\n');
}

// Utility functions
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  } catch (error) {
    return 'Invalid date';
  }
}

function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.toggle('show', show);
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span>${message}</span>
      <button style="background: none; border: none; cursor: pointer; margin-left: 12px;" onclick="this.parentElement.parentElement.remove()">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;
  
  container.appendChild(toast);
  
  // Show toast
  setTimeout(() => toast.classList.add('show'), 100);
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// Close modal when clicking outside
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal')) {
    e.target.classList.remove('show');
  }
});

// Export functions for global access
window.openDepositModal = openDepositModal;
window.closeDepositModal = closeDepositModal;
window.setAmount = setAmount;
window.processDeposit = processDeposit;
window.applyFilters = applyFilters;
window.changePage = changePage;
window.refreshWallet = refreshWallet;
window.viewEscrowTransactions = viewEscrowTransactions;
window.downloadStatement = downloadStatement;