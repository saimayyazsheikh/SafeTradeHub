// ========================================
// CART.JS - Cart functionality for index.html
// ========================================

/* ---- Cart (home page) ---- */
const CART_KEY = 'sthub_cart';

function getCart() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } }
function saveCart(c) { localStorage.setItem(CART_KEY, JSON.stringify(c)); }
function cartCount() { return getCart().reduce((a, i) => a + (i.qty || 1), 0); }
function updateCartCount() { const b = document.getElementById('cartCount'); if (b) b.textContent = cartCount(); }

function addToCart(product, qty = 1) {
  // Enhanced authentication check with logging
  console.log('🛍️ Cart: Attempting to add product to cart:', product.title);

  if (!isUserAuthenticated()) {
    console.warn('❌ Cart: User not authenticated, showing login prompt');
    showLoginPrompt();
    return false;
  }

  console.log('✅ Cart: User authenticated, adding to cart');
  const cart = getCart();
  const i = cart.findIndex(x => x.id === product.id);
  if (i > -1) cart[i].qty += qty; else cart.push({ ...product, qty });
  saveCart(cart);
  updateCartCount();
  alert('✅ Added to cart: ' + product.title);
  return true;
}

/* Authentication helper functions - Ultimate robust authentication check */
function isUserAuthenticated() {
  console.log('🔎 Cart: Starting comprehensive authentication check...');

  try {
    // Method 1: Check localStorage directly first (most reliable)
    const userData = localStorage.getItem('userData');
    const authToken = localStorage.getItem('authToken');

    if (userData) {
      try {
        const parsedUser = JSON.parse(userData);
        if (parsedUser && (parsedUser.id || parsedUser.uid || parsedUser.email)) {
          console.log('✅ Cart: User authenticated via localStorage:', parsedUser.name || parsedUser.email);
          return true;
        }
      } catch (parseError) {
        console.warn('⚠️ Cart: Error parsing userData:', parseError);
      }
    }

    // Method 2: Check AuthManager if available
    if (window.AuthManager) {
      try {
        const authResult = window.AuthManager.isAuthenticated();
        const currentUser = window.AuthManager.getCurrentUser();
        console.log('🔐 Cart: AuthManager check - authenticated:', authResult, 'user:', currentUser);
        if (authResult && currentUser) {
          return true;
        }
      } catch (authError) {
        console.warn('⚠️ Cart: AuthManager error:', authError);
      }
    }

    // Method 3: Check Firebase directly
    if (typeof firebase !== 'undefined' && firebase.auth) {
      try {
        const firebaseUser = firebase.auth().currentUser;
        if (firebaseUser) {
          console.log('✅ Cart: User authenticated via Firebase:', firebaseUser.email);
          return true;
        }
      } catch (firebaseError) {
        console.warn('⚠️ Cart: Firebase error:', firebaseError);
      }
    }

    console.log('❌ Cart: User not authenticated by any method');
    return false;

  } catch (error) {
    console.error('❌ Cart: Authentication check error:', error);
    return false;
  }
}

function isUserLoggedIn() {
  return isUserAuthenticated();
}

function showLoginPrompt() {
  const shouldRedirect = confirm('Please sign in to add items to your cart. Would you like to go to the login page?');
  if (shouldRedirect) {
    window.location.href = 'auth.html?mode=signin';
  }
}

/* Event delegation so it works for any future cards, too */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-add-to-cart]');
  if (!btn) return;

  console.log('🔘 Cart: Add to cart button clicked');

  // WAIT for authentication to be properly initialized
  if (window.AuthManager) {
    try {
      await window.AuthManager.waitForInit();
      console.log('✅ Cart: AuthManager initialization confirmed');
    } catch (error) {
      console.warn('⚠️ Cart: AuthManager wait error:', error);
    }
  }

  // Check authentication with MULTIPLE attempts
  let authenticated = false;
  let attempts = 0;

  while (!authenticated && attempts < 3) {
    authenticated = isUserAuthenticated();
    if (!authenticated) {
      console.warn(`⚠️ Cart: Auth check failed, attempt ${attempts + 1}/3`);
      await new Promise(resolve => setTimeout(resolve, 200)); // Wait 200ms
      attempts++;
    } else {
      console.log('✅ Cart: Authentication confirmed on attempt', attempts + 1);
      break;
    }
  }

  if (!authenticated) {
    e.preventDefault();
    console.error('❌ Cart: Not authenticated after multiple attempts');
    showLoginPrompt();
    return;
  }

  console.log('✅ Cart: Authentication passed, processing add to cart');

  const product = {
    id: btn.dataset.id,
    title: btn.dataset.name,
    price: parseFloat(btn.dataset.price || '0'),
    shippingCost: parseFloat(btn.dataset.shippingCost || '0'),
    img: btn.dataset.img,
    sellerId: btn.dataset.sellerId || 'admin',
    sellerName: btn.dataset.sellerName || 'SafeTradeHub'
  };

  console.log('📦 Cart: Product data:', product);
  addToCart(product, 1);
});

/* init badge on load */
updateCartCount();

/* Global cart clearing function for logout scenarios */
window.clearCartOnLogout = function () {
  console.log('🛒 Cart: Clearing cart due to logout');
  localStorage.removeItem(CART_KEY);
  updateCartCount();

  // If on cart page, refresh the display
  if (typeof renderCart === 'function') {
    renderCart();
  }

  console.log('✅ Cart: Cart cleared successfully');
};
