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
  if (!isUserAuthenticated()) {
    showLoginPrompt();
    return false;
  }

  // Global Seller Restriction
  const userData = localStorage.getItem('userData');
  if (userData) {
    try {
      const user = JSON.parse(userData);
      if ((user.role || '').toLowerCase() === 'seller') {
        if (window.NotificationManager) {
          window.NotificationManager.showToast('Action Restricted', 'Sellers are not permitted to purchase products. Please use a Buyer account.', 'warning');
        } else {
          alert('⚠️ Action Restricted: Sellers cannot purchase products.');
        }
        return false;
      }
    } catch (e) {}
  }

  const cart = getCart();
  const i = cart.findIndex(x => x.id === product.id);
  
  // Ensure we have seller info
  const cartItem = {
    ...product,
    qty: (i > -1) ? (cart[i].qty + qty) : qty,
    sellerId: product.sellerId || product.seller_id || 'admin',
    sellerName: product.sellerName || 'SafeTradeHub'
  };

  if (i > -1) {
    cart[i] = cartItem;
  } else {
    cart.push(cartItem);
  }

  saveCart(cart);
  updateCartCount();
  
  if (window.NotificationManager) {
    window.NotificationManager.showToast('Cart Updated', `Added ${product.title || product.name} to cart!`, 'success');
  } else {
    alert('✅ Added to cart: ' + (product.title || product.name));
  }
  return true;
}

/* Authentication helper functions - Ultimate robust authentication check */
function isUserAuthenticated() {
  

  try {
    // Method 1: Check localStorage directly first (most reliable)
    const userData = localStorage.getItem('userData');
    const authToken = localStorage.getItem('authToken');

    if (userData) {
      try {
        const parsedUser = JSON.parse(userData);
        if (parsedUser && (parsedUser.id || parsedUser.uid || parsedUser.email)) {
          
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
          
          return true;
        }
      } catch (firebaseError) {
        console.warn('⚠️ Cart: Firebase error:', firebaseError);
      }
    }

    
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

/* Event delegation for cart buttons */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-add-to-cart]');
  if (!btn) return;

  if (window.AuthManager) {
    await window.AuthManager.waitForInit();
  }

  if (!isUserAuthenticated()) {
    e.preventDefault();
    showLoginPrompt();
    return;
  }

  const product = {
    id: btn.dataset.id,
    title: btn.dataset.name || btn.dataset.title,
    name: btn.dataset.name || btn.dataset.title,
    price: parseFloat(btn.dataset.price || '0'),
    shippingCost: parseFloat(btn.dataset.shippingCost || '0'),
    img: btn.dataset.img,
    sellerId: btn.dataset.sellerId || 'admin',
    sellerName: btn.dataset.sellerName || 'SafeTradeHub'
  };

  addToCart(product, 1);
});

/* init badge on load */
updateCartCount();

/* Global cart clearing function for logout scenarios */
window.clearCartOnLogout = function () {
  
  localStorage.removeItem(CART_KEY);
  updateCartCount();

  // If on cart page, refresh the display
  if (typeof renderCart === 'function') {
    renderCart();
  }

  
};
