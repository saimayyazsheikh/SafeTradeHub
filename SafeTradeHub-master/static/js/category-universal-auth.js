// ========================================
// CATEGORY-UNIVERSAL-AUTH.JS - Universal authentication for all category pages
// ========================================



// Universal robust authentication function for all category pages
function isUserLoggedIn() {
  
  
  // Method 1: Check localStorage directly (most reliable)
  const userData = localStorage.getItem('userData');
  const authToken = localStorage.getItem('authToken');
  
  if (userData) {
    try {
      const parsedUser = JSON.parse(userData);
      if (parsedUser && (parsedUser.id || parsedUser.uid || parsedUser.email)) {
        
        return true;
      }
    } catch (parseError) {
      console.warn('⚠️ Category Auth: Error parsing userData:', parseError);
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
      console.warn('⚠️ Category Auth: AuthManager error:', authError);
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
      console.warn('⚠️ Category Auth: Firebase error:', firebaseError);
    }
  }
  
  
  return false;
}

// Universal login prompt
function showLoginPrompt() {
  const shouldRedirect = confirm('Please sign in to add items to your cart. Would you like to go to the login page?');
  if (shouldRedirect) {
    window.location.href = 'auth.html?mode=signin&redirect=' + encodeURIComponent(window.location.pathname.split('/').pop());
  }
}

// Universal add to cart function
function addToCartUniversal(product, qty = 1) {
  
  
  if (!isUserLoggedIn()) {
    showLoginPrompt();
    return false;
  }
  
  const CART_KEY = 'sthub_cart';
  function getCart() { 
    try { 
      return JSON.parse(localStorage.getItem(CART_KEY)) || [] 
    } catch { 
      return [] 
    } 
  }
  function saveCart(c) { 
    localStorage.setItem(CART_KEY, JSON.stringify(c)); 
  }
  
  const cart = getCart();
  const i = cart.findIndex(x => x.id === product.id);
  if (i > -1) cart[i].qty += qty;
  else cart.push({ ...product, qty });
  saveCart(cart);
  
  // Update cart count if function exists
  if (typeof updateCartCount === 'function') {
    updateCartCount();
  }
  
  alert('✅ Added to cart: ' + product.title);
  return true;
}

// Universal click handler for add to cart buttons
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-add-to-cart]');
  if (!btn) return;
  
  
  
  // Wait for authentication systems to be ready
  if (window.AuthManager) {
    try {
      await window.AuthManager.waitForInit();
    } catch (error) {
      console.warn('⚠️ Category Auth: AuthManager wait error:', error);
    }
  }
  
  // Robust authentication check with retries
  let authenticated = false;
  let attempts = 0;
  
  while (!authenticated && attempts < 3) {
    authenticated = isUserLoggedIn();
    if (!authenticated) {
      console.warn(`⚠️ Category Auth: Auth check failed, attempt ${attempts + 1}/3`);
      await new Promise(resolve => setTimeout(resolve, 200));
      attempts++;
    }
  }
  
  if (!authenticated) {
    e.preventDefault();
    console.error('❌ Category Auth: Not authenticated after multiple attempts');
    showLoginPrompt();
    return;
  }
  
  
  
  const product = {
    id: btn.dataset.id,
    title: btn.dataset.name,
    price: parseFloat(btn.dataset.price || '0'),
    img: btn.dataset.img,
    desc: btn.dataset.desc
  };
  
  addToCartUniversal(product, 1);
});

// Universal cart count update
function updateCartCount() {
  const cartCountEl = document.getElementById('cartCount');
  if (cartCountEl) {
    try {
      const cart = JSON.parse(localStorage.getItem('sthub_cart') || '[]');
      const count = cart.reduce((total, item) => total + (item.qty || 1), 0);
      cartCountEl.textContent = count;
      
    } catch (error) {
      cartCountEl.textContent = '0';
      console.warn('⚠️ Category Auth: Error updating cart count:', error);
    }
  }
}

// Clear cart function (useful for logout scenarios)
function clearCart() {
  const CART_KEY = 'sthub_cart';
  localStorage.removeItem(CART_KEY);
  updateCartCount();
  
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
  
  
  // Wait for AuthManager to be ready
  if (window.AuthManager) {
    try {
      await window.AuthManager.waitForInit();
      
    } catch (error) {
      console.warn('⚠️ Category Auth: AuthManager initialization error:', error);
    }
  }
  
  // Update cart count
  updateCartCount();
  
  
});


