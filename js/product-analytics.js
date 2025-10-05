// ========================================
// PRODUCT-ANALYTICS.JS - JavaScript for product analytics functionality
// ========================================

// Global variables
let currentProduct = null;
let currentUser = null;
let analyticsData = null;
let viewsChart = null;
let ordersChart = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  initializeProductAnalytics();
});

async function initializeProductAnalytics() {
  try {
    console.log('📊 Product Analytics: Starting initialization...');
    
    // Wait for AuthManager
    if (window.AuthManager) {
      await window.AuthManager.waitForInit();
      currentUser = window.AuthManager.getCurrentUser();
      
      if (!currentUser) {
        console.error('❌ Product Analytics: User not authenticated');
        window.location.href = 'auth.html?mode=signin&redirect=' + encodeURIComponent('product-analytics.html');
        return;
      }
      
      console.log('✅ Product Analytics: User authenticated:', currentUser.name);
    }
    
    // Get product ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    
    if (!productId) {
      console.error('❌ Product Analytics: No product ID provided');
      showToast('No product selected for analytics', 'error');
      setTimeout(() => {
        window.location.href = 'product-management.html';
      }, 2000);
      return;
    }
    
    console.log('📦 Loading analytics for product:', productId);
    
    // Load product and analytics data
    await loadProductData(productId);
    await loadAnalyticsData(productId);
    
    // Setup page
    populatePage();
    setupCharts();
    setupEventListeners();
    
    console.log('✅ Product Analytics: Initialization complete');
    
  } catch (error) {
    console.error('❌ Product Analytics: Initialization error:', error);
    showToast('Failed to initialize analytics', 'error');
  }
}

async function loadProductData(productId) {
  try {
    console.log('📥 Loading product data for:', productId);
    
    // TEMPORARY: Load from localStorage for testing
    const testProducts = JSON.parse(localStorage.getItem('testProducts') || '[]');
    currentProduct = testProducts.find(p => p.id === productId);
    
    if (!currentProduct) {
      throw new Error('Product not found');
    }
    
    console.log('✅ Product loaded:', currentProduct);
    
  } catch (error) {
    console.error('❌ Product Analytics: Load product error:', error);
    showToast('Failed to load product data', 'error');
    throw error;
  }
}

async function loadAnalyticsData(productId) {
  try {
    console.log('📈 Loading analytics data for:', productId);
    
    // TEMPORARY: Generate simulated analytics data
    analyticsData = generateSimulatedAnalytics(currentProduct);
    
    console.log('✅ Analytics data generated:', analyticsData);
    
    /* ORIGINAL API CODE - COMMENTED OUT FOR TESTING
    const token = localStorage.getItem('authToken');
    const response = await fetch(`/api/products/${productId}/analytics`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to load analytics');
    }
    
    const result = await response.json();
    
    if (result.success) {
      analyticsData = result.data.analytics;
    } else {
      throw new Error(result.message || 'Failed to load analytics');
    }
    */
    
  } catch (error) {
    console.error('❌ Product Analytics: Load analytics error:', error);
    showToast('Failed to load analytics data', 'error');
    throw error;
  }
}

function generateSimulatedAnalytics(product) {
  // Use actual product data instead of generating random numbers
  const baseViews = product.views || 0;
  const baseFavorites = product.favorites || 0;
  const baseOrders = Math.floor(baseViews * 0.05); // 5% conversion rate
  const baseRevenue = baseOrders * (product.price || 0);
  
  console.log('📊 Generating analytics from real product data:', {
    views: baseViews,
    favorites: baseFavorites,
    price: product.price,
    calculatedOrders: baseOrders,
    calculatedRevenue: baseRevenue
  });
  
  return {
    totalViews: baseViews,
    totalFavorites: baseFavorites,
    totalOrders: baseOrders,
    completedOrders: Math.floor(baseOrders * 0.8),
    pendingOrders: Math.floor(baseOrders * 0.2),
    totalRevenue: baseRevenue,
    averageRating: product.averageRating || 0,
    totalReviews: product.totalReviews || 0,
    conversionRate: baseViews > 0 ? ((baseOrders / baseViews) * 100).toFixed(2) : '0.00',
    ordersByStatus: {
      pending: Math.floor(baseOrders * 0.1),
      confirmed: Math.floor(baseOrders * 0.1),
      shipped: Math.floor(baseOrders * 0.2),
      completed: Math.floor(baseOrders * 0.6),
      cancelled: Math.floor(baseOrders * 0.1)
    },
    viewsOverTime: generateViewsOverTime(baseViews),
    recentActivity: generateRecentActivity(product)
  };
}

function generateViewsOverTime(totalViews) {
  const days = 30;
  const data = [];
  
  // If no views, return empty data
  if (totalViews === 0) {
    for (let i = days; i >= 0; i--) {
      data.push({
        date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        views: 0
      });
    }
    return data;
  }
  
  // Distribute views more realistically over time
  let remainingViews = totalViews;
  
  for (let i = days; i >= 0; i--) {
    // More views on recent days, fewer on older days
    const dayWeight = Math.max(0.1, (days - i + 1) / days);
    const maxViewsForDay = Math.ceil(remainingViews * dayWeight * 0.3);
    const views = Math.min(maxViewsForDay, Math.floor(Math.random() * maxViewsForDay));
    
    data.push({
      date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      views: views
    });
    
    remainingViews -= views;
    if (remainingViews <= 0) break;
  }
  
  // Ensure we don't exceed total views
  const totalDistributed = data.reduce((sum, day) => sum + day.views, 0);
  if (totalDistributed > totalViews) {
    const excess = totalDistributed - totalViews;
    // Remove excess from oldest days
    for (let i = data.length - 1; i >= 0 && excess > 0; i--) {
      const remove = Math.min(excess, data[i].views);
      data[i].views -= remove;
      excess -= remove;
    }
  }
  
  return data;
}

function generateRecentActivity(product) {
  const activities = [];
  
  // If no views/favorites, return empty activity
  if ((product.views || 0) === 0 && (product.favorites || 0) === 0) {
    return activities;
  }
  
  const totalViews = product.views || 0;
  const totalFavorites = product.favorites || 0;
  const totalOrders = Math.floor(totalViews * 0.05); // 5% conversion rate
  
  // Generate realistic activity based on actual data
  const activityTypes = [];
  
  // Add view activities
  for (let i = 0; i < Math.min(totalViews, 5); i++) {
    activityTypes.push('views');
  }
  
  // Add favorite activities
  for (let i = 0; i < Math.min(totalFavorites, 3); i++) {
    activityTypes.push('favorites');
  }
  
  // Add order activities
  for (let i = 0; i < Math.min(totalOrders, 2); i++) {
    activityTypes.push('orders');
  }
  
  // Generate activities with realistic timestamps
  activityTypes.forEach((type, index) => {
    const timeAgo = Math.floor(Math.random() * 7 * 24 * 60) + (index * 30); // Spread out over time
    
    activities.push({
      type: type,
      title: getActivityTitle(type),
      description: getActivityDescription(type, product),
      time: new Date(Date.now() - timeAgo * 60 * 1000),
      count: 1
    });
  });
  
  return activities.sort((a, b) => b.time - a.time).slice(0, 10); // Limit to 10 most recent
}

function getActivityTitle(type) {
  const titles = {
    views: 'Product viewed',
    favorites: 'Added to favorites',
    orders: 'Order placed'
  };
  return titles[type] || 'Activity';
}

function getActivityDescription(type, product) {
  const descriptions = {
    views: `${product.name} was viewed by potential customers`,
    favorites: `${product.name} was added to someone's favorites`,
    orders: `New order received for ${product.name}`
  };
  return descriptions[type] || 'Activity occurred';
}

function populatePage() {
  if (!currentProduct || !analyticsData) return;
  
  console.log('📝 Populating page with data');
  
  // Update header
  document.getElementById('productName').textContent = currentProduct.name;
  document.getElementById('productDescription').textContent = currentProduct.description;
  
  // Update metrics
  document.getElementById('totalViews').textContent = analyticsData.totalViews.toLocaleString();
  document.getElementById('totalFavorites').textContent = analyticsData.totalFavorites.toLocaleString();
  document.getElementById('totalOrders').textContent = analyticsData.totalOrders.toLocaleString();
  document.getElementById('totalRevenue').textContent = `$${analyticsData.totalRevenue.toFixed(2)}`;
  
  // Update performance metrics
  document.getElementById('conversionRate').textContent = `${analyticsData.conversionRate}%`;
  document.getElementById('averageRating').textContent = `${analyticsData.averageRating}/5`;
  document.getElementById('totalReviews').textContent = analyticsData.totalReviews;
  document.getElementById('revenuePerView').textContent = `$${(analyticsData.totalRevenue / analyticsData.totalViews).toFixed(2)}`;
  
  // Update funnel
  updateFunnelChart();
  
  // Update activity list
  updateActivityList();
  
  console.log('✅ Page populated successfully');
}

function updateFunnelChart() {
  const maxValue = Math.max(analyticsData.totalViews, analyticsData.totalFavorites, analyticsData.totalOrders, analyticsData.completedOrders);
  
  document.getElementById('funnelViews').textContent = analyticsData.totalViews.toLocaleString();
  document.getElementById('funnelFavorites').textContent = analyticsData.totalFavorites.toLocaleString();
  document.getElementById('funnelOrders').textContent = analyticsData.totalOrders.toLocaleString();
  document.getElementById('funnelCompleted').textContent = analyticsData.completedOrders.toLocaleString();
  
  // Animate funnel bars
  setTimeout(() => {
    document.getElementById('funnelViews').style.width = `${(analyticsData.totalViews / maxValue) * 100}%`;
    document.getElementById('funnelFavorites').style.width = `${(analyticsData.totalFavorites / maxValue) * 100}%`;
    document.getElementById('funnelOrders').style.width = `${(analyticsData.totalOrders / maxValue) * 100}%`;
    document.getElementById('funnelCompleted').style.width = `${(analyticsData.completedOrders / maxValue) * 100}%`;
  }, 100);
}

function updateActivityList() {
  const container = document.getElementById('activityList');
  if (!container) return;
  
  container.innerHTML = analyticsData.recentActivity.map(activity => `
    <div class="activity-item">
      <div class="activity-icon ${activity.type}">
        <svg viewBox="0 0 24 24">
          ${getActivityIcon(activity.type)}
        </svg>
      </div>
      <div class="activity-content">
        <div class="activity-title">${activity.title}</div>
        <div class="activity-description">${activity.description}</div>
      </div>
      <div class="activity-time">${formatTimeAgo(activity.time)}</div>
    </div>
  `).join('');
}

function getActivityIcon(type) {
  const icons = {
    views: '<path d="M1,12C1,12 5,4 12,4C19,4 23,12 23,12C23,12 19,20 12,20C5,20 1,12 1,12Z"/><circle cx="12" cy="12" r="3"/>',
    favorites: '<path d="M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z"/>',
    orders: '<path d="M7,4V2A1,1 0 0,1 8,1H16A1,1 0 0,1 17,2V4H20A1,1 0 0,1 21,5V9A1,1 0 0,1 20,10H19V19A2,2 0 0,1 17,21H7A2,2 0 0,1 5,19V10H4A1,1 0 0,1 3,9V5A1,1 0 0,1 4,4H7M9,3V4H15V3H9M7,6V19H17V6H7Z"/>'
  };
  return icons[type] || '<circle cx="12" cy="12" r="3"/>';
}

function formatTimeAgo(date) {
  const now = new Date();
  const diffInMinutes = Math.floor((now - date) / (1000 * 60));
  
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  } else if (diffInMinutes < 1440) {
    return `${Math.floor(diffInMinutes / 60)}h ago`;
  } else {
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  }
}

function setupCharts() {
  console.log('📊 Setting up charts');
  
  // Views Over Time Chart
  setupViewsChart();
  
  // Orders Status Chart
  setupOrdersChart();
  
  console.log('✅ Charts setup complete');
}

function setupViewsChart() {
  const ctx = document.getElementById('viewsChart');
  if (!ctx) return;
  
  const labels = analyticsData.viewsOverTime.map(item => {
    const date = new Date(item.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  
  const data = analyticsData.viewsOverTime.map(item => item.views);
  
  viewsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Views',
        data: data,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: '#f3f4f6'
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      }
    }
  });
}

function setupOrdersChart() {
  const ctx = document.getElementById('ordersChart');
  if (!ctx) return;
  
  const statusData = analyticsData.ordersByStatus;
  
  ordersChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Completed', 'Shipped', 'Confirmed', 'Pending', 'Cancelled'],
      datasets: [{
        data: [
          statusData.completed,
          statusData.shipped,
          statusData.confirmed,
          statusData.pending,
          statusData.cancelled
        ],
        backgroundColor: [
          '#10b981',
          '#3b82f6',
          '#f59e0b',
          '#6b7280',
          '#ef4444'
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 20,
            usePointStyle: true
          }
        }
      }
    }
  });
}

function setupEventListeners() {
  // Time range selector
  const timeRangeSelect = document.getElementById('viewsTimeRange');
  if (timeRangeSelect) {
    timeRangeSelect.addEventListener('change', handleTimeRangeChange);
  }
  
  // Activity filter
  const activityFilter = document.getElementById('activityFilter');
  if (activityFilter) {
    activityFilter.addEventListener('change', handleActivityFilter);
  }
}

function handleTimeRangeChange(e) {
  const days = parseInt(e.target.value);
  console.log('📅 Time range changed to:', days, 'days');
  
  // Regenerate views data for the selected time range
  const newViewsData = generateViewsOverTime(analyticsData.totalViews).slice(-days);
  
  if (viewsChart) {
    const labels = newViewsData.map(item => {
      const date = new Date(item.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const data = newViewsData.map(item => item.views);
    
    viewsChart.data.labels = labels;
    viewsChart.data.datasets[0].data = data;
    viewsChart.update();
  }
}

function handleActivityFilter(e) {
  const filter = e.target.value;
  console.log('🔍 Activity filter changed to:', filter);
  
  const container = document.getElementById('activityList');
  if (!container) return;
  
  let filteredActivities = analyticsData.recentActivity;
  
  if (filter !== 'all') {
    filteredActivities = analyticsData.recentActivity.filter(activity => activity.type === filter);
  }
  
  container.innerHTML = filteredActivities.map(activity => `
    <div class="activity-item">
      <div class="activity-icon ${activity.type}">
        <svg viewBox="0 0 24 24">
          ${getActivityIcon(activity.type)}
        </svg>
      </div>
      <div class="activity-content">
        <div class="activity-title">${activity.title}</div>
        <div class="activity-description">${activity.description}</div>
      </div>
      <div class="activity-time">${formatTimeAgo(activity.time)}</div>
    </div>
  `).join('');
}

function showToast(message, type = 'info') {
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span>${message}</span>
      <button style="background: none; border: none; cursor: pointer; margin-left: 12px;" onclick="this.parentElement.parentElement.remove()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
        </svg>
      </button>
    </div>
  `;
  
  // Add to page
  document.body.appendChild(toast);
  
  // Show toast
  setTimeout(() => toast.classList.add('show'), 100);
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializeProductAnalytics,
    loadProductData,
    loadAnalyticsData,
    generateSimulatedAnalytics
  };
}
