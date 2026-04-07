// ========================================
// PAGE-SETUP.JS - Universal Page Setup for Authentication
// ========================================

/**
 * This script should be included on every page to ensure
 * consistent authentication handling and navigation
 */

(function() {
  'use strict';

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePage);
  } else {
    initializePage();
  }

  async function initializePage() {
    try {
      // Wait for AuthManager to be available
      await waitForAuthManager();
      
      // Initialize cart count if element exists
      updateCartCount();
      
      // Set up page-specific authentication requirements
      handlePageAuth();
      
    } catch (error) {
      console.error('Page initialization error:', error);
    }
  }

  function waitForAuthManager() {
    return new Promise((resolve) => {
      const checkAuth = () => {
        if (window.AuthManager && window.AuthManager.isInitialized) {
          resolve();
        } else {
          setTimeout(checkAuth, 50);
        }
      };
      checkAuth();
    });
  }

  function updateCartCount() {
    const cartCountEl = document.getElementById('cartCount');
    if (cartCountEl) {
      try {
        const cart = JSON.parse(localStorage.getItem('sthub_cart') || '[]');
        const count = cart.reduce((total, item) => total + (item.qty || 1), 0);
        cartCountEl.textContent = count;
      } catch (error) {
        cartCountEl.textContent = '0';
      }
    }
  }

  function handlePageAuth() {
    const currentPath = window.location.pathname;
    const authRequiredPages = [
      '/checkout.html',
      '/wallet.html', 
      '/dashboard.html',
      '/profile.html',
      '/orderstatus.html'
    ];

    // Check if current page requires authentication
    const requiresAuth = authRequiredPages.some(page => 
      currentPath.endsWith(page) || currentPath.includes(page.replace('.html', ''))
    );

    if (requiresAuth && window.AuthManager) {
      window.AuthManager.onAuthStateChange((user, isAuthenticated) => {
        if (!isAuthenticated && !currentPath.includes('auth.html')) {
          // Only redirect if not already on auth page
          const redirectUrl = currentPath !== '/index.html' && currentPath !== '/' 
            ? `auth.html?mode=signin&redirect=${encodeURIComponent(currentPath.replace('/', ''))}`
            : 'auth.html?mode=signin';
          
          window.location.href = redirectUrl;
        }
      });
    }
  }

  // Global helper functions
  window.updateCartCount = updateCartCount;

})();

console.log('📄 Page setup initialized - Professional page management ready');