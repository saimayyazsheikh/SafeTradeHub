/* ========================================
   DISPUTE-RESOLUTION.JS - JavaScript for dispute resolution module
   ======================================== */

// Storage keys
const CART_KEY = 'sthub_cart';
const DISPUTES_KEY = 'sthub_disputes';
const ORDERS_KEY = 'sthub_orders';

// Global variables
let disputeData = [];
let filteredDisputes = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  initializeDisputeResolution();
  loadDisputeData();
  updateDisputeStats();
  setupEventListeners();
});

// Initialize dispute resolution
function initializeDisputeResolution() {
  console.log('Initializing Dispute Resolution System');
  
  // Update cart count
  updateCartCount();
  
  // Load data
  loadDisputeData();
  
  // Initialize sample data if needed
  initializeSampleData();
}

// Setup event listeners
function setupEventListeners() {
  // Filter change events
  const statusFilter = document.getElementById('disputeStatusFilter');
  if (statusFilter) {
    statusFilter.addEventListener('change', applyDisputeFilters);
  }
  
  const priorityFilter = document.getElementById('disputePriorityFilter');
  if (priorityFilter) {
    priorityFilter.addEventListener('change', applyDisputeFilters);
  }
  
  const orderIdFilter = document.getElementById('orderIdFilter');
  if (orderIdFilter) {
    orderIdFilter.addEventListener('input', debounce(applyDisputeFilters, 300));
  }
  
  const timelineFilter = document.getElementById('timelineFilter');
  if (timelineFilter) {
    timelineFilter.addEventListener('change', updateTimelineChart);
  }
}

// Load dispute data
function loadDisputeData() {
  try {
    disputeData = JSON.parse(localStorage.getItem(DISPUTES_KEY) || '[]');
    console.log('Loaded dispute data:', disputeData.length, 'disputes');
    filteredDisputes = [...disputeData];
    renderDisputesGrid();
  } catch (error) {
    console.error('Error loading dispute data:', error);
    disputeData = [];
    filteredDisputes = [];
  }
}

// Update dispute statistics
function updateDisputeStats() {
  // Calculate open disputes
  const openDisputes = disputeData.filter(dispute => 
    ['open', 'under_review'].includes(dispute.status)
  ).length;
  
  document.getElementById('openDisputes').textContent = openDisputes;
  
  // Calculate resolved disputes today
  const today = new Date().toDateString();
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
  
  // Calculate resolution rate
  const totalDisputes = disputeData.length;
  const resolvedCount = disputeData.filter(dispute => 
    dispute.status === 'resolved'
  ).length;
  
  const resolutionRate = totalDisputes > 0 ? Math.round((resolvedCount / totalDisputes) * 100) : 0;
  document.getElementById('resolutionRate').textContent = resolutionRate + '%';
}

// Render disputes grid
function renderDisputesGrid() {
  const grid = document.getElementById('disputesGrid');
  if (!grid) return;
  
  if (filteredDisputes.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #6b7280;">
        <i class="fas fa-gavel" style="font-size: 48px; margin-bottom: 16px; display: block;"></i>
        <h3>No disputes found</h3>
        <p>All transactions are proceeding smoothly</p>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = filteredDisputes.map(dispute => {
    const priorityClass = dispute.priority || 'medium';
    const statusClass = dispute.status || 'open';
    const createdDate = new Date(dispute.createdAt).toLocaleDateString();
    const priorityText = priorityClass.charAt(0).toUpperCase() + priorityClass.slice(1);
    const statusText = statusClass.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    return `
      <div class="dispute-card">
        <div class="dispute-header">
          <div class="dispute-id">${dispute.id}</div>
          <div class="dispute-priority ${priorityClass}">${priorityText}</div>
        </div>
        <div class="dispute-status ${statusClass}">${statusText}</div>
        <div class="dispute-details">
          <p><strong>Order:</strong> ${dispute.orderId}</p>
          <p><strong>Issue:</strong> ${dispute.issue || 'Product mismatch'}</p>
          <p><strong>Description:</strong> ${dispute.description || 'No additional details provided'}</p>
          <p><strong>Created:</strong> ${createdDate}</p>
          ${dispute.assignedTo ? `<p><strong>Assigned to:</strong> ${dispute.assignedTo}</p>` : ''}
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
          ${statusClass === 'under_review' ? `
            <button class="btn btn-success" onclick="resolveDispute('${dispute.id}')">
              <i class="fas fa-check"></i>
              Resolve
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Apply dispute filters
function applyDisputeFilters() {
  const statusFilter = document.getElementById('disputeStatusFilter')?.value || 'all';
  const priorityFilter = document.getElementById('disputePriorityFilter')?.value || 'all';
  const dateFrom = document.getElementById('disputeDateFrom')?.value;
  const dateTo = document.getElementById('disputeDateTo')?.value;
  const orderIdFilter = document.getElementById('orderIdFilter')?.value?.toLowerCase() || '';
  
  filteredDisputes = [...disputeData];
  
  // Filter by status
  if (statusFilter !== 'all') {
    filteredDisputes = filteredDisputes.filter(dispute => dispute.status === statusFilter);
  }
  
  // Filter by priority
  if (priorityFilter !== 'all') {
    filteredDisputes = filteredDisputes.filter(dispute => (dispute.priority || 'medium') === priorityFilter);
  }
  
  // Filter by date range
  if (dateFrom) {
    const fromDate = new Date(dateFrom);
    filteredDisputes = filteredDisputes.filter(dispute => 
      new Date(dispute.createdAt) >= fromDate
    );
  }
  
  if (dateTo) {
    const toDate = new Date(dateTo);
    toDate.setHours(23, 59, 59, 999);
    filteredDisputes = filteredDisputes.filter(dispute => 
      new Date(dispute.createdAt) <= toDate
    );
  }
  
  // Filter by order ID
  if (orderIdFilter) {
    filteredDisputes = filteredDisputes.filter(dispute => 
      dispute.orderId.toLowerCase().includes(orderIdFilter)
    );
  }
  
  // Sort by priority and creation date
  filteredDisputes.sort((a, b) => {
    const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
    const aPriority = priorityOrder[a.priority] || 2;
    const bPriority = priorityOrder[b.priority] || 2;
    
    if (aPriority !== bPriority) {
      return bPriority - aPriority; // High priority first
    }
    
    return new Date(b.createdAt) - new Date(a.createdAt); // Newest first
  });
  
  renderDisputesGrid();
}

// Clear all filters
function clearFilters() {
  document.getElementById('disputeStatusFilter').value = 'all';
  document.getElementById('disputePriorityFilter').value = 'all';
  document.getElementById('disputeDateFrom').value = '';
  document.getElementById('disputeDateTo').value = '';
  document.getElementById('orderIdFilter').value = '';
  
  filteredDisputes = [...disputeData];
  renderDisputesGrid();
}

// Action functions
function reviewDispute(disputeId) {
  const dispute = disputeData.find(d => d.id === disputeId);
  if (!dispute) return;
  
  // Create detailed review modal or navigate to review page
  const reviewDetails = `
    Dispute Review Details:
    
    ID: ${dispute.id}
    Order: ${dispute.orderId}
    Issue: ${dispute.issue || 'Product mismatch'}
    Description: ${dispute.description || 'No additional details'}
    Priority: ${dispute.priority || 'medium'}
    Status: ${dispute.status}
    Created: ${new Date(dispute.createdAt).toLocaleString()}
    ${dispute.assignedTo ? `Assigned to: ${dispute.assignedTo}` : 'Unassigned'}
    ${dispute.resolvedAt ? `Resolved: ${new Date(dispute.resolvedAt).toLocaleString()}` : ''}
  `;
  
  alert(reviewDetails);
}

function assignDispute(disputeId) {
  const disputeIndex = disputeData.findIndex(d => d.id === disputeId);
  if (disputeIndex === -1) return;
  
  const assignedTo = prompt('Enter admin name to assign this dispute to:');
  if (!assignedTo) return;
  
  // Update dispute status
  disputeData[disputeIndex].status = 'under_review';
  disputeData[disputeIndex].assignedTo = assignedTo;
  disputeData[disputeIndex].assignedAt = new Date().toISOString();
  
  // Save to localStorage
  localStorage.setItem(DISPUTES_KEY, JSON.stringify(disputeData));
  
  // Refresh display
  loadDisputeData();
  updateDisputeStats();
  
  alert(`Dispute assigned to ${assignedTo}!`);
}

function resolveDispute(disputeId) {
  const disputeIndex = disputeData.findIndex(d => d.id === disputeId);
  if (disputeIndex === -1) return;
  
  const resolution = prompt('Enter resolution details:');
  if (!resolution) return;
  
  const action = prompt('Enter action taken (refund, exchange, partial_refund, no_action):');
  if (!action) return;
  
  // Update dispute status
  disputeData[disputeIndex].status = 'resolved';
  disputeData[disputeIndex].resolvedAt = new Date().toISOString();
  disputeData[disputeIndex].resolution = resolution;
  disputeData[disputeIndex].action = action;
  
  // Save to localStorage
  localStorage.setItem(DISPUTES_KEY, JSON.stringify(disputeData));
  
  // Refresh display
  loadDisputeData();
  updateDisputeStats();
  
  alert('Dispute resolved successfully!');
}

function refreshDisputeData() {
  loadDisputeData();
  updateDisputeStats();
  alert('Dispute data refreshed!');
}

function exportDisputes() {
  const csv = convertToCSV(filteredDisputes, [
    'id', 'orderId', 'issue', 'priority', 'status', 'assignedTo', 'createdAt', 'resolvedAt'
  ]);
  downloadCSV(csv, 'disputes.csv');
}

function updateTimelineChart() {
  const timelineFilter = document.getElementById('timelineFilter')?.value || 'week';
  console.log('Updating timeline chart for:', timelineFilter);
  // Implement chart update logic here
}

// Utility functions
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
  if (disputeData.length === 0) {
    const sampleDisputes = [
      {
        id: 'DISP-001',
        orderId: 'ORD-001',
        issue: 'Product condition does not match description',
        description: 'The product arrived damaged and does not match the photos in the listing.',
        priority: 'high',
        status: 'open',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'DISP-002',
        orderId: 'ORD-002',
        issue: 'Wrong product received',
        description: 'I ordered a blue shirt but received a red one.',
        priority: 'medium',
        status: 'under_review',
        assignedTo: 'Admin User',
        assignedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'DISP-003',
        orderId: 'ORD-003',
        issue: 'Product quality issues',
        description: 'The product quality is much lower than expected.',
        priority: 'low',
        status: 'resolved',
        assignedTo: 'Admin User',
        assignedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        resolvedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        resolution: 'Partial refund issued due to quality concerns',
        action: 'partial_refund',
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];
    
    localStorage.setItem(DISPUTES_KEY, JSON.stringify(sampleDisputes));
    disputeData = sampleDisputes;
    filteredDisputes = [...sampleDisputes];
  }
}

// Initialize sample data on first load
if (localStorage.getItem(DISPUTES_KEY) === null) {
  initializeSampleData();
}
