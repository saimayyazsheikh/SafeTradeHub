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
      

      // Load from localStorage first
      await this.loadFromStorage();

      // Initialize Firebase if available
      if (typeof firebase !== 'undefined' && firebase.auth) {
        
        await this.initFirebaseAuth();
      } else {
        console.warn('⚠️ AuthManager: Firebase not available, using localStorage only');
      }

      this.isInitialized = true;
      this.notifyStateChange();

      // Set up periodic token validation
      this.setupTokenValidation();

      
      
      

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
      let isFirstCheck = true;
      firebase.auth().onAuthStateChanged(async (firebaseUser) => {
        if (firebaseUser) {
          
          
          // Resolve initialization immediately on first check so other components can proceed
          if (isFirstCheck) {
            isFirstCheck = false;
            resolve();
          }

          // Fetch profile in background
          try {
            let dbUserData = {};
            if (firebase.database) {
              const snapshot = await firebase.database().ref('users/' + firebaseUser.uid).once('value');
              if (snapshot.exists()) {
                dbUserData = snapshot.val();
              }
            }

            const userData = {
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              name: dbUserData.name || dbUserData.displayName || firebaseUser.displayName || 'User',
              role: dbUserData.role || 'Buyer',
              provider: 'firebase',
              ...dbUserData
            };

            // Update lastLogin tracking
            firebase.database().ref('users/' + firebaseUser.uid).update({
              lastLogin: new Date().toISOString()
            }).catch(e => console.warn('Failed to update lastLogin:', e));

            await this.setAuthData(userData, null);

            // Set up real-time listener if not already done
            firebase.database().ref('users/' + firebaseUser.uid).on('value', (snap) => {
              const updatedData = snap.val() || {};
              this.setAuthData({ ...userData, ...updatedData }, null);
            });
          } catch (error) {
            console.error('❌ AuthManager: Background profile fetch error:', error);
          }
        } else {
          
          if (this.user?.provider === 'firebase') {
            this.clearAuth();
          }
          if (isFirstCheck) {
            isFirstCheck = false;
            resolve();
          }
        }
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
    

    this.user = null;
    this.token = null;

    // Clear localStorage
    localStorage.removeItem('userData');
    localStorage.removeItem('authToken');

    // Clear cart data for security and privacy
    localStorage.removeItem('sthub_cart');
    

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

    
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    // More flexible authentication check
    if (!this.user) {
      
      return false;
    }

    // For Firebase users, provider is enough
    if (this.user.provider === 'firebase') {
      
      return true;
    }

    // For other users, check if we have token OR if user data exists in localStorage
    if (this.token) {
      
      return true;
    }

    // Fallback: if user exists and we have userData in localStorage, consider authenticated
    const storedUserData = localStorage.getItem('userData');
    if (storedUserData) {
      
      return true;
    }

    
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
   * Centralized Permission & Restriction Layer
   * @param {string} action - Action requested (e.g., 'add_to_cart', 'bid', 'review')
   * @param {object} context - Metadata for specific checks
   * @returns {boolean} - true if allowed, false if restricted
   */
  checkPermission(action, context = {}) {
    if (!this.user) return false;
    
    const role = (this.user.role || 'Buyer').toLowerCase();
    
    // Admin and Staff have full capability (except self-review maybe)
    if (role === 'admin' || role === 'staff') return true;

    switch (action) {
      case 'add_to_cart':
      case 'buy_now':
      case 'bid':
        // Sellers are strictly isolated from buying activities
        if (role === 'seller') {
          if (window.NotificationManager) {
            window.NotificationManager.showToast(
              'Action Restricted',
              'To purchase products or place bids, please log in with a Buyer account.',
              'warning'
            );
          }
          return false;
        }
        return true;

      case 'report':
        // Sellers cannot report themselves (handled in UI usually) or have limited report capability
        if (role === 'seller' && context.targetId === this.user.uid) return false;
        return true;

      case 'review':
        // Seller-to-Seller reviews are blocked
        if (role === 'seller' && context.targetRole === 'Seller') return false;
        // Self-review blocked
        if (context.targetId === this.user.uid) return false;
        return true;

      default:
        return true;
    }
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

        // Update lastLogin tracking
        firebase.database().ref('users/' + user.uid).update({
          lastLogin: new Date().toISOString()
        }).catch(e => console.warn('Failed to update lastLogin on signin:', e));

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


