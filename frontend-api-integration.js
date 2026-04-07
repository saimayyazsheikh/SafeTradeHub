// 🔌 SafeTradeHub Frontend-Backend Integration Helper
// Add this script to your HTML files to connect to the backend

// Configuration
const API_BASE_URL = 'http://localhost:5000';

// Enhanced API helper with error handling
window.SafeTradeAPI = {
  // Base request function
  async request(endpoint, options = {}) {
    const token = localStorage.getItem('authToken');
    
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    };
    
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...defaultOptions,
        ...options,
        headers: {
          ...defaultOptions.headers,
          ...options.headers
        }
      });
      
      if (response.status === 401) {
        // Token expired, redirect to login
        this.logout();
        return null;
      }
      
      return response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  },

  // Authentication methods
  async loginWithBackend(firebaseUser) {
    try {
      const firebaseToken = await firebaseUser.getIdToken();
      
      const response = await this.request('/api/auth/firebase-login', {
        method: 'POST',
        body: JSON.stringify({
          firebaseToken: firebaseToken
        })
      });
      
      if (response && response.success) {
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('refreshToken', response.data.refreshToken);
        localStorage.setItem('userData', JSON.stringify(response.data.user));
        return response.data;
      }
      
      throw new Error(response?.message || 'Login failed');
    } catch (error) {
      console.error('Backend login failed:', error);
      throw error;
    }
  },

  async register(userData) {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  async login(email, password) {
    const response = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    if (response && response.success) {
      localStorage.setItem('authToken', response.data.token);
      localStorage.setItem('refreshToken', response.data.refreshToken);
      localStorage.setItem('userData', JSON.stringify(response.data.user));
    }
    
    return response;
  },

  logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userData');
    
    if (!window.location.pathname.includes('auth.html')) {
      window.location.href = 'auth.html';
    }
  },

  isAuthenticated() {
    return !!localStorage.getItem('authToken');
  },

  getCurrentUser() {
    const userData = localStorage.getItem('userData');
    return userData ? JSON.parse(userData) : null;
  },

  // Product methods
  async getProducts(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = `/api/products${queryString ? '?' + queryString : ''}`;
    return this.request(endpoint);
  },

  async getProduct(productId) {
    return this.request(`/api/products/${productId}`);
  },

  async createProduct(productData) {
    return this.request('/api/products', {
      method: 'POST',
      body: JSON.stringify(productData)
    });
  },

  async updateProduct(productId, productData) {
    return this.request(`/api/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(productData)
    });
  },

  async deleteProduct(productId) {
    return this.request(`/api/products/${productId}`, {
      method: 'DELETE'
    });
  },

  // Order methods
  async createOrder(orderData) {
    return this.request('/api/orders', {
      method: 'POST',
      body: JSON.stringify(orderData)
    });
  },

  async getOrders(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = `/api/orders${queryString ? '?' + queryString : ''}`;
    return this.request(endpoint);
  },

  async getOrder(orderId) {
    return this.request(`/api/orders/${orderId}`);
  },

  async updateOrderStatus(orderId, status) {
    return this.request(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  },

  // Escrow methods
  async createEscrowTransaction(transactionData) {
    return this.request('/api/escrow/transactions', {
      method: 'POST',
      body: JSON.stringify(transactionData)
    });
  },

  async getEscrowTransactions(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = `/api/escrow/transactions${queryString ? '?' + queryString : ''}`;
    return this.request(endpoint);
  },

  async updateEscrowStatus(transactionId, status) {
    return this.request(`/api/escrow/transactions/${transactionId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  },

  // File upload methods
  async uploadFile(file, category = 'general') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);

    const token = localStorage.getItem('authToken');
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: formData
      });
      
      return response.json();
    } catch (error) {
      console.error('File upload failed:', error);
      throw error;
    }
  }
};

// Real-time features with Socket.IO
window.SafeTradeSocket = {
  socket: null,
  
  connect() {
    if (this.socket) return;
    
    // Load Socket.IO if not already loaded
    if (typeof io === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
      script.onload = () => this.initSocket();
      document.head.appendChild(script);
    } else {
      this.initSocket();
    }
  },
  
  initSocket() {
    const token = localStorage.getItem('authToken');
    
    this.socket = io(API_BASE_URL, {
      auth: { token }
    });
    
    this.socket.on('connect', () => {
      console.log('Connected to SafeTradeHub real-time server');
    });
    
    this.socket.on('notification', (data) => {
      this.showNotification(data);
    });
    
    this.socket.on('orderUpdate', (data) => {
      this.handleOrderUpdate(data);
    });
    
    this.socket.on('escrowUpdate', (data) => {
      this.handleEscrowUpdate(data);
    });
  },
  
  showNotification(data) {
    // You can customize this notification system
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(data.title, {
        body: data.message,
        icon: '/favicon.ico'
      });
    }
    
    // Also show in your custom notification area
    console.log('Notification:', data);
  },
  
  handleOrderUpdate(data) {
    // Update order status in your UI
    console.log('Order update:', data);
    
    // Trigger UI update if on orders page
    if (window.location.pathname.includes('orders') || window.location.pathname.includes('dashboard')) {
      // Refresh orders list
      if (typeof refreshOrders === 'function') {
        refreshOrders();
      }
    }
  },
  
  handleEscrowUpdate(data) {
    // Update escrow status in your UI
    console.log('Escrow update:', data);
    
    // Trigger UI update if on escrow page
    if (window.location.pathname.includes('escrow') || window.location.pathname.includes('dashboard')) {
      // Refresh escrow transactions
      if (typeof refreshEscrowTransactions === 'function') {
        refreshEscrowTransactions();
      }
    }
  },
  
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
};

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  // Auto-connect socket if user is authenticated
  if (window.SafeTradeAPI.isAuthenticated()) {
    window.SafeTradeSocket.connect();
  }
  
  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
});

// Example usage patterns for your existing code:

/*
// Replace your product loading:
const loadProducts = async (category = null) => {
  try {
    const params = category ? { category } : {};
    const response = await SafeTradeAPI.getProducts(params);
    
    if (response.success) {
      displayProducts(response.data.products);
    }
  } catch (error) {
    console.error('Failed to load products:', error);
  }
};

// Replace your authentication:
const handleLogin = async (email, password) => {
  try {
    const response = await SafeTradeAPI.login(email, password);
    
    if (response.success) {
      window.location.href = 'index.html';
    } else {
      showError(response.message);
    }
  } catch (error) {
    showError('Login failed. Please try again.');
  }
};

// For Firebase integration:
firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    try {
      await SafeTradeAPI.loginWithBackend(user);
      // User is now authenticated with both Firebase and backend
    } catch (error) {
      console.error('Backend authentication failed:', error);
    }
  }
});
*/

console.log('🔌 SafeTradeHub API Integration loaded successfully!');
console.log('Available: window.SafeTradeAPI and window.SafeTradeSocket');