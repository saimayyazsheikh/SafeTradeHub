// ========================================
// CART.JS - Cart functionality for index.html
// ========================================

/* ---- Cart (home page) ---- */
const CART_KEY = 'sthub_cart';

function getCart(){ try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } }
function saveCart(c){ localStorage.setItem(CART_KEY, JSON.stringify(c)); }
function cartCount(){ return getCart().reduce((a,i)=> a + (i.qty||1), 0); }
function updateCartCount(){ const b = document.getElementById('cartCount'); if (b) b.textContent = cartCount(); }

function addToCart(product, qty=1){
  const cart = getCart();
  const i = cart.findIndex(x => x.id === product.id);
  if (i > -1) cart[i].qty += qty; else cart.push({...product, qty});
  saveCart(cart);
  updateCartCount();
  alert('Added to cart: ' + product.title);
}

/* Event delegation so it works for any future cards, too */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-add-to-cart]');
  if (!btn) return;
  const product = {
    id: btn.dataset.id,
    title: btn.dataset.name,                // you used data-name in HTML
    price: parseFloat(btn.dataset.price || '0'),
    img: btn.dataset.img
  };
  addToCart(product, 1);
});

/* init badge on load */
updateCartCount();
