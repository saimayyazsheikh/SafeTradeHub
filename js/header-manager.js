// ========================================
// HEADER-MANAGER.JS - Universal Header Navigation Management
// ========================================

/**
 * Professional Header Manager
 * Handles navigation state across all pages based on authentication
 */

class HeaderManager {
  constructor() {
    this.isInitialized = false;
    this.init();
  }

  async init() {
    try {
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        await new Promise(resolve => {
          document.addEventListener('DOMContentLoaded', resolve);
        });
      }
      
      // Wait for AuthManager to be ready
      if (window.AuthManager) {
        await window.AuthManager.waitForInit();
      }
      
      // Additional delay to ensure all scripts are loaded
      await new Promise(resolve => setTimeout(resolve, 300));
      
      this.setupHeader();
      this.setupAuthStateListener();
      this.isInitialized = true;
      
      console.log('✅ HeaderManager initialized successfully');
      
    } catch (error) {
      console.error('❌ HeaderManager initialization error:', error);
      this.isInitialized = true; // Mark as initialized even on error
    }
  }

  setupHeader() {
    const headerActions = document.querySelector('.header-actions');
    if (!headerActions) {
      console.warn('⚠️ HeaderManager: .header-actions not found');
      return;
    }

    // Update header based on current auth state
    this.updateHeaderState();
  }

  setupAuthStateListener() {
    if (window.AuthManager) {
      window.AuthManager.onAuthStateChange((user, isAuthenticated) => {
        this.updateHeaderState();
      });
    }
  }

  updateHeaderState() {
    const headerActions = document.querySelector('.header-actions');
    if (!headerActions) return;

    const isAuthenticated = window.AuthManager ? window.AuthManager.isAuthenticated() : false;
    const user = window.AuthManager ? window.AuthManager.getCurrentUser() : null;

    if (isAuthenticated && user) {
      this.renderAuthenticatedHeader(headerActions, user);
    } else {
      this.renderUnauthenticatedHeader(headerActions);
    }
  }

  updateHeaderState() {
    const headerActions = document.querySelector('.header-actions');
    if (!headerActions) {
      console.warn('⚠️ HeaderManager: .header-actions not found in updateHeaderState');
      return;
    }

    // ROBUST authentication check with multiple methods
    let isAuthenticated = false;
    let user = null;
    
    // Method 1: Check AuthManager
    if (window.AuthManager) {
      try {
        isAuthenticated = window.AuthManager.isAuthenticated();
        user = window.AuthManager.getCurrentUser();
        console.log('🔄 HeaderManager: AuthManager check - authenticated:', isAuthenticated, 'user:', user?.name);
      } catch (error) {
        console.warn('⚠️ HeaderManager: AuthManager error:', error);
      }
    }
    
    // Method 2: Fallback to localStorage check
    if (!isAuthenticated) {
      const userData = localStorage.getItem('userData');
      const authToken = localStorage.getItem('authToken');
      if (userData) {
        try {
          user = JSON.parse(userData);
          isAuthenticated = !!(user && (user.id || user.uid || user.email));
          console.log('🔄 HeaderManager: localStorage fallback - authenticated:', isAuthenticated, 'user:', user?.name);
        } catch (error) {
          console.warn('⚠️ HeaderManager: localStorage parse error:', error);
        }
      }
    }

    console.log(`🔄 HeaderManager: Final state - authenticated: ${isAuthenticated}, user:`, user);

    // Remove any existing auth elements (but preserve chat/notification buttons)
    this.removeAuthElements(headerActions);

    if (isAuthenticated && user) {
      this.addAuthenticatedElements(headerActions, user);
    } else {
      this.addUnauthenticatedElements(headerActions);
    }
  }

  removeAuthElements(container) {
    // Remove auth-specific elements without touching chat/notification buttons
    const elementsToRemove = container.querySelectorAll('.auth-element, .user-menu, a[href="auth.html"]');
    elementsToRemove.forEach(el => el.remove());
  }

  addAuthenticatedElements(container, user) {
    // Add cart if it doesn't exist
    if (!container.querySelector('a[href="cart.html"]')) {
      const cartHTML = `
        <a class="icon-btn auth-element" href="cart.html" aria-label="Cart" title="Cart" style="position:relative">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6L5 3H2"/>
            <circle cx="9" cy="20" r="1.75"/><circle cx="18" cy="20" r="1.75"/>
          </svg>
          <span class="cart-count" id="cartCount">0</span>
        </a>
      `;
      container.insertAdjacentHTML('beforeend', cartHTML);
    }
    
    // Add wallet
    const walletHTML = `
      <a class="icon-btn auth-element" href="wallet.html" aria-label="Wallet" title="Wallet">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 4H3C1.89 4 1 4.89 1 6V18C1 19.11 1.89 20 3 20H21C22.11 20 23 19.11 23 18V6C23 4.89 22.11 4 21 4ZM21 18H3V6H21V18ZM7 15H9V13H7V15ZM15 9H17V7H15V9Z"/>
        </svg>
      </a>
    `;
    
    // Add dashboard
    const dashboardHTML = `
      <a class="icon-btn auth-element" href="dashboard.html" aria-label="Dashboard" title="Dashboard">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9,22 9,12 15,12 15,22"/>
        </svg>
      </a>
    `;
    
    // Add user menu
    const userMenuHTML = `
      <div class="user-menu auth-element">
        <button class="user-menu-trigger" onclick="toggleUserMenu()">
          <div class="user-avatar">
            <span>${user.name ? user.name.charAt(0).toUpperCase() : 'U'}</span>
          </div>
          <span class="user-name">${user.name || 'User'}</span>
          <svg class="chevron" viewBox="0 0 24 24" width="16" height="16">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        
        <div class="user-menu-dropdown" id="userMenuDropdown">
          <div class="user-menu-header">
            <div class="user-info">
              <div class="user-name">${user.name || 'User'}</div>
              <div class="user-email">${user.email || ''}</div>
            </div>
          </div>
          <div class="user-menu-items">
            <a href="profile.html" class="menu-item">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              Profile
            </a>
            <a href="orderstatus.html" class="menu-item">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
              </svg>
              My Orders
            </a>
            <a href="wallet.html" class="menu-item">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M21 4H3C1.89 4 1 4.89 1 6V18C1 19.11 1.89 20 3 20H21C22.11 20 23 19.11 23 18V6C23 4.89 22.11 4 21 4Z"/>
              </svg>
              Wallet
            </a>
            ${user.role === 'Admin' ? `
            <a href="admin-dashboard.html" class="menu-item">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              Admin Panel
            </a>
            ` : ''}
            <div class="menu-divider"></div>
            <button class="menu-item" onclick="handleSignOut()">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16,17 21,12 16,7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', walletHTML);
    container.insertAdjacentHTML('beforeend', dashboardHTML);
    container.insertAdjacentHTML('beforeend', userMenuHTML);
    
    // Add styles for user menu
    this.addUserMenuStyles();
    
    // Update cart count
    if (typeof updateCartCount === 'function') {
      updateCartCount();
    }
  }

  addUnauthenticatedElements(container) {
    // Add cart if it doesn't exist
    if (!container.querySelector('a[href="cart.html"]')) {
      const cartHTML = `
        <a class="icon-btn auth-element" href="cart.html" aria-label="Cart" title="Cart" style="position:relative">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6L5 3H2"/>
            <circle cx="9" cy="20" r="1.75"/><circle cx="18" cy="20" r="1.75"/>
          </svg>
          <span class="cart-count" id="cartCount">0</span>
        </a>
      `;
      container.insertAdjacentHTML('beforeend', cartHTML);
    }
    
    // Add auth links
    const authLinksHTML = `
      <a class="link auth-element" href="auth.html?mode=signin">Sign In</a>
      <a class="btn primary auth-element" href="auth.html?mode=join">Join</a>
    `;
    
    container.insertAdjacentHTML('beforeend', authLinksHTML);
    
    // Update cart count
    if (typeof updateCartCount === 'function') {
      updateCartCount();
    }
  }

  addUserMenuStyles() {
    if (document.getElementById('user-menu-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'user-menu-styles';
    styles.textContent = `
      .user-menu {
        position: relative;
        display: inline-block;
      }
      
      .user-menu-trigger {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: none;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        transition: background-color 0.2s ease;
        color: inherit;
      }
      
      .user-menu-trigger:hover {
        background: rgba(0, 0, 0, 0.05);
      }
      
      .user-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #6366f1;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 14px;
      }
      
      .user-name {
        font-weight: 500;
        max-width: 100px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      .chevron {
        transition: transform 0.2s ease;
        opacity: 0.7;
      }
      
      .user-menu.open .chevron {
        transform: rotate(180deg);
      }
      
      .user-menu-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        min-width: 220px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        border: 1px solid #e5e7eb;
        padding: 8px 0;
        z-index: 1000;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-10px);
        transition: all 0.2s ease;
      }
      
      .user-menu.open .user-menu-dropdown {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }
      
      .user-menu-header {
        padding: 12px 16px;
        border-bottom: 1px solid #f3f4f6;
      }
      
      .user-info .user-name {
        font-weight: 600;
        color: #1f2937;
        margin-bottom: 2px;
        max-width: none;
      }
      
      .user-info .user-email {
        font-size: 13px;
        color: #6b7280;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      .user-menu-items {
        padding: 4px 0;
      }
      
      .menu-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 16px;
        color: #374151;
        text-decoration: none;
        transition: background-color 0.2s ease;
        border: none;
        background: none;
        width: 100%;
        text-align: left;
        cursor: pointer;
        font-size: 14px;
      }
      
      .menu-item:hover {
        background: #f9fafb;
        color: #1f2937;
      }
      
      .menu-item svg {
        opacity: 0.7;
        fill: currentColor;
      }
      
      .menu-divider {
        height: 1px;
        background: #f3f4f6;
        margin: 4px 0;
      }
      
      @media (max-width: 768px) {
        .user-name {
          display: none;
        }
        
        .user-menu-dropdown {
          right: -8px;
          min-width: 200px;
        }
      }
    `;
    
    document.head.appendChild(styles);
  }
}

// Global functions for user menu interaction
window.toggleUserMenu = function() {
  const userMenu = document.querySelector('.user-menu');
  if (userMenu) {
    userMenu.classList.toggle('open');
  }
};

window.handleSignOut = async function() {
  if (window.AuthManager) {
    console.log('🚪 HeaderManager: Initiating sign out...');
    
    const result = await window.AuthManager.signOut();
    if (result.success) {
      console.log('✅ HeaderManager: Sign out successful, cart cleared');
      
      // Show feedback to user
      if (typeof showNotification === 'function') {
        showNotification('🚪 Successfully signed out. Your cart has been cleared.', 'info');
      } else {
        alert('✅ Successfully signed out. Your cart has been cleared.');
      }
      
      // Small delay to show the message, then redirect
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1500);
    } else {
      console.error('❌ HeaderManager: Sign out failed:', result.error);
      alert('❌ Sign out failed. Please try again.');
    }
  }
};

// Close user menu when clicking outside
document.addEventListener('click', function(e) {
  const userMenu = document.querySelector('.user-menu');
  if (userMenu && !userMenu.contains(e.target)) {
    userMenu.classList.remove('open');
  }
});

// Initialize header manager when DOM is ready
document.addEventListener('DOMContentLoaded', async function() {
  console.log('🏷️ HeaderManager: DOM ready, starting initialization...');
  
  try {
    // Wait for all critical scripts to be ready
    let attempts = 0;
    while (attempts < 30) {
      if (window.AuthManager) {
        try {
          await window.AuthManager.waitForInit();
          console.log('✅ HeaderManager: AuthManager is ready');
          break;
        } catch (error) {
          console.warn('⚠️ HeaderManager: AuthManager not ready, attempt', attempts, error);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (!window.HeaderManager) {
      console.log('🏷️ HeaderManager: Creating new instance...');
      window.HeaderManager = new HeaderManager();
    }
    
    // Force an immediate header update
    setTimeout(() => {
      if (window.HeaderManager) {
        window.HeaderManager.updateHeaderState();
        console.log('🏷️ HeaderManager: Forced header update completed');
      }
    }, 500);
    
  } catch (error) {
    console.error('❌ HeaderManager: DOM initialization error:', error);
  }
});

console.log('🎯 HeaderManager loaded - Professional navigation system ready');