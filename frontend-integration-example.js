// Frontend Integration Example for SafeTradeHub Backend
// Add this to your existing HTML files to connect with the backend

// API Configuration
const API_BASE_URL = 'http://localhost:5000';

// API Helper Function
window.apiRequest = async (endpoint, options = {}) => {
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
      localStorage.removeItem('authToken');
      localStorage.removeItem('refreshToken');
      if (!window.location.pathname.includes('auth.html')) {
        window.location.href = 'auth.html';
      }
      return null;
    }
    
    return response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
};

// Authentication Helper Functions
window.isAuthenticated = () => {
  return !!localStorage.getItem('authToken');
};

window.getCurrentUser = async () => {
  try {
    const response = await apiRequest('/api/auth/me');
    return response?.success ? response.data.user : null;
  } catch (error) {
    console.error('Failed to get current user:', error);
    return null;
  }
};

// Enhanced Login Function (add this to your auth.html)
window.loginToBackend = async (email, password) => {
  try {
    const response = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    if (response?.success) {
      localStorage.setItem('authToken', response.data.token);
      localStorage.setItem('refreshToken', response.data.refreshToken);
      localStorage.setItem('userData', JSON.stringify(response.data.user));
      return response.data.user;
    } else {
      throw new Error(response?.message || 'Login failed');
    }
  } catch (error) {
    console.error('Backend login failed:', error);
    throw error;
  }
};

// Enhanced Registration Function
window.registerToBackend = async (userData) => {
  try {
    const response = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
    
    if (response?.success) {
      localStorage.setItem('authToken', response.data.token);
      localStorage.setItem('refreshToken', response.data.refreshToken);
      localStorage.setItem('userData', JSON.stringify(response.data.user));
      return response.data.user;
    } else {
      throw new Error(response?.message || 'Registration failed');
    }
  } catch (error) {
    console.error('Backend registration failed:', error);
    throw error;
  }
};

// Firebase Integration (add this to your auth.html after Firebase auth)
window.loginWithFirebase = async (firebaseUser) => {
  try {
    const firebaseToken = await firebaseUser.getIdToken();
    
    const response = await apiRequest('/api/auth/firebase-login', {
      method: 'POST',
      body: JSON.stringify({ firebaseToken })
    });
    
    if (response?.success) {
      localStorage.setItem('authToken', response.data.token);
      localStorage.setItem('refreshToken', response.data.refreshToken);
      localStorage.setItem('userData', JSON.stringify(response.data.user));
      return response.data.user;
    } else {
      throw new Error(response?.message || 'Firebase login failed');
    }
  } catch (error) {
    console.error('Firebase backend login failed:', error);
    throw error;
  }
};

// Product Functions (replace your static product data)
window.loadProducts = async (filters = {}) => {
  try {
    const params = new URLSearchParams(filters).toString();
    const endpoint = `/api/products${params ? '?' + params : ''}`;
    
    const response = await apiRequest(endpoint);
    
    if (response?.success) {
      return response.data.products;
    } else {
      throw new Error('Failed to load products');
    }
  } catch (error) {
    console.error('Failed to load products:', error);
    return [];
  }
};

// Order Functions
window.createOrder = async (orderData) => {
  try {
    const response = await apiRequest('/api/orders', {
      method: 'POST',
      body: JSON.stringify(orderData)
    });
    
    if (response?.success) {
      return response.data.order;
    } else {
      throw new Error(response?.message || 'Failed to create order');
    }
  } catch (error) {
    console.error('Failed to create order:', error);
    throw error;
  }
};

window.getUserOrders = async () => {
  try {
    const response = await apiRequest('/api/orders');
    
    if (response?.success) {
      return response.data.orders;
    } else {
      throw new Error('Failed to load orders');
    }
  } catch (error) {
    console.error('Failed to load orders:', error);
    return [];
  }
};

// Cart Integration (enhance your existing cart.js)
window.addToCartBackend = async (productId, quantity = 1) => {
  try {
    // First get the product details
    const response = await apiRequest(`/api/products/${productId}`);
    
    if (response?.success) {
      const product = response.data.product;
      
      // Add to local cart (keeping your existing cart functionality)
      addToCart({
        id: product.id,
        title: product.name,
        price: product.price,
        img: product.images?.[0] || '',
        stock: product.stock
      }, quantity);
      
      return product;
    } else {
      throw new Error('Product not found');
    }
  } catch (error) {
    console.error('Failed to add product to cart:', error);
    throw error;
  }
};

// User Profile Functions
window.updateProfile = async (profileData) => {
  try {
    const response = await apiRequest('/api/users/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData)
    });
    
    if (response?.success) {
      // Update local storage
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const updatedUser = { ...userData, ...profileData };
      localStorage.setItem('userData', JSON.stringify(updatedUser));
      
      return updatedUser;
    } else {
      throw new Error(response?.message || 'Failed to update profile');
    }
  } catch (error) {
    console.error('Failed to update profile:', error);
    throw error;
  }
};

// Logout Function
window.logout = async () => {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // Clear local storage
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userData');
    
    // Redirect to home
    window.location.href = 'index.html';
  }
};

// Real-time notifications (Socket.IO integration)
window.initializeRealTime = () => {
  if (typeof io !== 'undefined' && isAuthenticated()) {
    const socket = io('http://localhost:5000');
    
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    if (user.id) {
      socket.emit('join', user.id);
    }
    
    // Listen for order updates
    socket.on('order_status_updated', (data) => {
      console.log('Order update:', data);
      showNotification(data.message, 'info');
    });
    
    // Listen for escrow updates
    socket.on('escrow_status_updated', (data) => {
      console.log('Escrow update:', data);
      showNotification(data.message, 'info');
    });
    
    // Listen for new orders (sellers)
    socket.on('new_order', (data) => {
      console.log('New order:', data);
      showNotification(`New order from ${data.buyerName}`, 'success');
    });
    
    return socket;
  }
  return null;
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Check authentication status
  if (isAuthenticated()) {
    console.log('User is authenticated');
    
    // Initialize real-time features
    if (window.io) {
      initializeRealTime();
    }
  }
});

console.log('SafeTradeHub Frontend Integration Loaded ✅');