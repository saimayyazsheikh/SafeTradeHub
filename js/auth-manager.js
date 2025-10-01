// ========================================
// AUTH-MANAGER.JS - Global Authentication Management
// ========================================

/**
 * Professional Authentication Manager
 * Handles persistent login state across all pages
 * Provides consistent authentication API for entire application
 */

class AuthManager {
  constructor() {
    this.user = null;
    this.token = null;
    this.isInitialized = false;
    this.authStateListeners = [];
    this.init();
  }

  /**
   * Initialize authentication manager
   */
  async init() {
    try {
      console.log('🔐 AuthManager: Starting initialization...');
      
      // Load from localStorage first
      await this.loadFromStorage();
      
      // Initialize Firebase if available
      if (typeof firebase !== 'undefined' && firebase.auth) {
        console.log('🔥 AuthManager: Initializing Firebase auth...');
        await this.initFirebaseAuth();
      } else {
        console.warn('⚠️ AuthManager: Firebase not available, using localStorage only');
      }
      
      this.isInitialized = true;
      this.notifyStateChange();
      
      // Set up periodic token validation
      this.setupTokenValidation();
      
      console.log('✅ AuthManager: Initialization complete');
      console.log('👤 AuthManager: Current user:', this.user);
      console.log('🔑 AuthManager: Is authenticated:', this.isAuthenticated());
      
    } catch (error) {
      console.error('❌ AuthManager initialization error:', error);
      this.isInitialized = true; // Mark as initialized even on error to prevent hanging
    }
  }

  /**
   * Load authentication data from localStorage
   */
  async loadFromStorage() {
    try {
      const token = localStorage.getItem('authToken');
      const userData = localStorage.getItem('userData');
      
      if (userData) {
        this.user = JSON.parse(userData);
        this.token = token; // Token can be null for Firebase users
        
        console.log('🔄 AuthManager: Loaded from storage - user:', this.user, 'token:', !!this.token);
        
        // Only validate token if we have one and it's not a Firebase user
        if (token && this.user.provider !== 'firebase') {
          // Try to validate but don't clear auth if it fails (backend might be down)
          const isValid = await this.validateTokenWithBackend();
          if (!isValid) {
            console.warn('⚠️ AuthManager: Token validation failed, but keeping auth for offline use');
          }
        }
      }
    } catch (error) {
      console.error('❌ AuthManager: Error loading auth from storage:', error);
      // Don't clear auth on parse errors, just log them
    }
  }

  /**
   * Initialize Firebase authentication
   */
  async initFirebaseAuth() {
    return new Promise((resolve) => {
      firebase.auth().onAuthStateChanged(async (firebaseUser) => {
        if (firebaseUser && !this.user) {
          // Firebase user exists but no local user data
          try {
            const userData = {
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              name: firebaseUser.displayName || 'User',
              provider: 'firebase'
            };
            
            await this.setAuthData(userData, null);
          } catch (error) {
            console.error('Error setting Firebase auth data:', error);
          }
        } else if (!firebaseUser && this.user?.provider === 'firebase') {
          // Firebase user signed out
          this.clearAuth();
        }
        resolve();
      });
    });
  }

  /**
   * Validate token with backend
   */
  async validateTokenWithBackend() {
    if (!this.token) return false;
    
    try {
      const response = await fetch('/api/auth/validate', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user) {
          this.user = { ...this.user, ...data.user };
          this.saveToStorage();
          return true;
        }
      }
      
      // Token is invalid, but don't clear auth - just return false
      console.warn('⚠️ AuthManager: Token validation failed - backend may be unavailable');
      return false;
      
    } catch (error) {
      console.error('❌ AuthManager: Token validation error (backend probably down):', error);
      // Don't clear auth on network errors, backend might be down
      return false;
    }
  }

  /**
   * Set authentication data
   */
  async setAuthData(user, token) {
    this.user = user;
    this.token = token;
    this.saveToStorage();
    this.notifyStateChange();
  }

  /**
   * Save authentication data to localStorage
   */
  saveToStorage() {
    try {
      if (this.user) {
        localStorage.setItem('userData', JSON.stringify(this.user));
      }
      if (this.token) {
        localStorage.setItem('authToken', this.token);
      }
    } catch (error) {
      console.error('Error saving auth to storage:', error);
    }
  }

  /**
   * Clear authentication data
   */
  clearAuth() {
    console.log('🔐 AuthManager: Clearing authentication data and cart...');
    
    this.user = null;
    this.token = null;
    
    // Clear localStorage
    localStorage.removeItem('userData');
    localStorage.removeItem('authToken');
    
    // Clear cart data for security and privacy
    localStorage.removeItem('sthub_cart');
    console.log('🛒 AuthManager: Cart cleared on logout');
    
    // Update cart count display if available
    const cartCountEl = document.getElementById('cartCount');
    if (cartCountEl) {
      cartCountEl.textContent = '0';
    }
    
    // Sign out from Firebase if available
    if (typeof firebase !== 'undefined' && firebase.auth) {
      firebase.auth().signOut().catch(console.error);
    }
    
    this.notifyStateChange();
    
    console.log('✅ AuthManager: Authentication and cart data cleared successfully');
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    // More flexible authentication check
    if (!this.user) {
      console.log('🔐 AuthManager: No user data available');
      return false;
    }
    
    // For Firebase users, provider is enough
    if (this.user.provider === 'firebase') {
      console.log('🔐 AuthManager: Firebase user authenticated');
      return true;
    }
    
    // For other users, check if we have token OR if user data exists in localStorage
    if (this.token) {
      console.log('🔐 AuthManager: Token-based user authenticated');
      return true;
    }
    
    // Fallback: if user exists and we have userData in localStorage, consider authenticated
    const storedUserData = localStorage.getItem('userData');
    if (storedUserData) {
      console.log('🔐 AuthManager: localStorage-based user authenticated');
      return true;
    }
    
    console.log('🔐 AuthManager: User not authenticated');
    return false;
  }

  /**
   * Get current user
   */
  getCurrentUser() {
    return this.user;
  }

  /**
   * Get auth token
   */
  getToken() {
    return this.token;
  }

  /**
   * Wait for authentication to be initialized
   */
  async waitForInit() {
    if (this.isInitialized) return;
    
    return new Promise((resolve) => {
      const checkInit = () => {
        if (this.isInitialized) {
          resolve();
        } else {
          setTimeout(checkInit, 50);
        }
      };
      checkInit();
    });
  }

  /**
   * Add authentication state listener
   */
  onAuthStateChange(callback) {
    this.authStateListeners.push(callback);
    
    // Call immediately with current state if initialized
    if (this.isInitialized) {
      callback(this.user, this.isAuthenticated());
    }
    
    // Return unsubscribe function
    return () => {
      const index = this.authStateListeners.indexOf(callback);
      if (index > -1) {
        this.authStateListeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of auth state change
   */
  notifyStateChange() {
    this.authStateListeners.forEach(callback => {
      try {
        callback(this.user, this.isAuthenticated());
      } catch (error) {
        console.error('Auth state listener error:', error);
      }
    });
  }

  /**
   * Setup periodic token validation
   */
  setupTokenValidation() {
    // Validate token every 5 minutes
    setInterval(() => {
      if (this.token) {
        this.validateTokenWithBackend();
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Sign in with email and password
   */
  async signIn(email, password) {
    try {
      // Try backend authentication first
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          await this.setAuthData(data.data.user, data.data.token);
          return { success: true, user: data.data.user };
        }
      }
      
      // Fallback to Firebase if backend fails
      if (typeof firebase !== 'undefined' && firebase.auth) {
        const credential = await firebase.auth().signInWithEmailAndPassword(email, password);
        const user = {
          id: credential.user.uid,
          uid: credential.user.uid,
          email: credential.user.email,
          name: credential.user.displayName || 'User',
          provider: 'firebase'
        };
        
        await this.setAuthData(user, null);
        return { success: true, user };
      }
      
      throw new Error('Authentication failed');
      
    } catch (error) {
      console.error('Sign in error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sign out
   */
  async signOut() {
    try {
      // Try backend logout
      if (this.token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          }
        }).catch(console.error);
      }
      
      this.clearAuth();
      return { success: true };
      
    } catch (error) {
      console.error('Sign out error:', error);
      this.clearAuth(); // Clear anyway
      return { success: false, error: error.message };
    }
  }

  /**
   * Require authentication - redirect if not authenticated
   */
  requireAuth(redirectUrl = null) {
    if (!this.isAuthenticated()) {
      const currentUrl = redirectUrl || window.location.pathname + window.location.search;
      const loginUrl = currentUrl !== '/index.html' && currentUrl !== '/' 
        ? `auth.html?mode=signin&redirect=${encodeURIComponent(currentUrl.replace('/', ''))}`
        : 'auth.html?mode=signin';
      
      window.location.href = loginUrl;
      return false;
    }
    return true;
  }

  /**
   * Update user profile
   */
  async updateProfile(updates) {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }
    
    try {
      if (this.token) {
        const response = await fetch('/api/users/profile', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updates)
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            // Update local user data
            this.user = { ...this.user, ...updates };
            this.saveToStorage();
            this.notifyStateChange();
            return { success: true };
          }
        }
      }
      
      // Fallback: update locally
      this.user = { ...this.user, ...updates };
      this.saveToStorage();
      this.notifyStateChange();
      return { success: true };
      
    } catch (error) {
      console.error('Profile update error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Create global instance
window.AuthManager = new AuthManager();

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthManager;
}

// Global helper functions for backward compatibility
window.isUserLoggedIn = () => window.AuthManager.isAuthenticated();
window.getCurrentUser = () => window.AuthManager.getCurrentUser();
window.getAuthToken = () => window.AuthManager.getToken();
window.requireAuth = (redirectUrl) => window.AuthManager.requireAuth(redirectUrl);

console.log('🔐 AuthManager initialized - Professional authentication system ready');