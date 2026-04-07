// ========================================
// CATEGORY-MOBILE.JS - JavaScript for category-mobile.html
// ========================================

const CART_KEY='sthub_cart';
function getCart(){ try { return JSON.parse(localStorage.getItem(CART_KEY))||[] } catch { return [] } }
function saveCart(c){ localStorage.setItem(CART_KEY, JSON.stringify(c)); }
function cartCount(){ return getCart().reduce((a,i)=> a + (i.qty||1), 0); }
function updateCartCount(){ const b=document.getElementById('cartCount'); if(b) b.textContent=cartCount(); }
function addToCart(product, qty=1){ 
  // Check if user is authenticated
  if (!isUserLoggedIn()) {
    showLoginPrompt();
    return false;
  }
  
  const cart=getCart(); 
  const i=cart.findIndex(x=>x.id===product.id); 
  if(i>-1) cart[i].qty += qty; 
  else cart.push({...product, qty}); 
  saveCart(cart); 
  updateCartCount(); 
  alert('Added to cart: '+product.title);
  return true;
}

// Authentication helper functions - Updated to use robust authentication
function isUserLoggedIn() {
  // Method 1: Check localStorage directly (most reliable)
  const userData = localStorage.getItem('userData');
  const authToken = localStorage.getItem('authToken');
  
  if (userData) {
    try {
      const parsedUser = JSON.parse(userData);
      if (parsedUser && (parsedUser.id || parsedUser.uid || parsedUser.email)) {
        console.log('✅ Category-Mobile: User authenticated via localStorage:', parsedUser.name || parsedUser.email);
        return true;
      }
    } catch (parseError) {
      console.warn('⚠️ Category-Mobile: Error parsing userData:', parseError);
    }
  }
  
  // Method 2: Check AuthManager if available
  if (window.AuthManager) {
    try {
      const authResult = window.AuthManager.isAuthenticated();
      const currentUser = window.AuthManager.getCurrentUser();
      if (authResult && currentUser) {
        console.log('✅ Category-Mobile: User authenticated via AuthManager:', currentUser.name || currentUser.email);
        return true;
      }
    } catch (authError) {
      console.warn('⚠️ Category-Mobile: AuthManager error:', authError);
    }
  }
  
  // Method 3: Check Firebase directly
  if (typeof firebase !== 'undefined' && firebase.auth) {
    try {
      const firebaseUser = firebase.auth().currentUser;
      if (firebaseUser) {
        console.log('✅ Category-Mobile: User authenticated via Firebase:', firebaseUser.email);
        return true;
      }
    } catch (firebaseError) {
      console.warn('⚠️ Category-Mobile: Firebase error:', firebaseError);
    }
  }
  
  console.log('❌ Category-Mobile: User not authenticated');
  return false;
}

function showLoginPrompt() {
  const shouldRedirect = confirm('Please sign in to add items to your cart. Would you like to go to the login page?');
  if (shouldRedirect) {
    window.location.href = 'auth.html?mode=signin';
  }
}

document.addEventListener('click', async (e)=>{ 
  const btn=e.target.closest('[data-add-to-cart]'); 
  if(!btn) return; 
  
  console.log('🛍️ Category-Mobile: Add to cart clicked');
  
  // Wait for authentication systems to be ready
  if (window.AuthManager) {
    try {
      await window.AuthManager.waitForInit();
    } catch (error) {
      console.warn('⚠️ Category-Mobile: AuthManager wait error:', error);
    }
  }
  
  // Robust authentication check with retries
  let authenticated = false;
  let attempts = 0;
  
  while (!authenticated && attempts < 3) {
    authenticated = isUserLoggedIn();
    if (!authenticated) {
      console.warn(`⚠️ Category-Mobile: Auth check failed, attempt ${attempts + 1}/3`);
      await new Promise(resolve => setTimeout(resolve, 200));
      attempts++;
    }
  }
  
  if (!authenticated) {
    e.preventDefault();
    console.error('❌ Category-Mobile: Not authenticated after multiple attempts');
    showLoginPrompt();
    return;
  }
  
  console.log('✅ Category-Mobile: Authentication confirmed, adding to cart');
  
  const product={ 
    id:btn.dataset.id, 
    title:btn.dataset.name, 
    price:parseFloat(btn.dataset.price||'0'), 
    img:btn.dataset.img, 
    desc:btn.dataset.desc 
  }; 
  addToCart(product,1); 
});

// Enhanced mobile products data using actual mobile images
const allProducts = [
  {id:'mob-iphone12', name:'iPhone 12 Pro Max', price:899.00, img:'images/mobile/iphone12.jpg', desc:'6.7" Super Retina XDR display, A14 Bionic chip, Pro camera system with LiDAR.', category:'iphone', brand:'apple', condition:'new', rating:4.8},
  {id:'mob-iphone13', name:'iPhone 13', price:799.00, img:'images/mobile/iphone13.jpg', desc:'6.1" Super Retina XDR display, A15 Bionic chip, advanced dual-camera system.', category:'iphone', brand:'apple', condition:'new', rating:4.9},
  {id:'mob-iphone16', name:'iPhone 16', price:999.00, img:'images/mobile/iphone16.jfif', desc:'Latest iPhone with A18 Pro chip, enhanced camera system, and titanium design.', category:'iphone', brand:'apple', condition:'new', rating:4.9},
  {id:'mob-iphone17', name:'iPhone 17 Pro', price:1199.00, img:'images/mobile/iphone17.webp', desc:'Premium iPhone with Pro Max features, advanced photography capabilities.', category:'iphone', brand:'apple', condition:'new', rating:4.9},
  {id:'mob-samsung-a05s', name:'Samsung Galaxy A05s', price:199.00, img:'images/mobile/samsunga05s.jpg', desc:'6.7" Infinity-V display, 50MP camera, 5000mAh battery, Android 13.', category:'samsung', brand:'samsung', condition:'new', rating:4.3},
  {id:'mob-samsung-a06', name:'Samsung Galaxy A06', price:179.00, img:'images/mobile/samsunga06.webp', desc:'6.6" HD+ display, 50MP main camera, 5000mAh battery, One UI.', category:'samsung', brand:'samsung', condition:'new', rating:4.2},
  {id:'mob-samsung-a5', name:'Samsung Galaxy A5', price:249.00, img:'images/mobile/samsunga5.avif', desc:'5.2" Super AMOLED display, 16MP camera, fingerprint sensor, premium design.', category:'samsung', brand:'samsung', condition:'new', rating:4.4},
  {id:'mob-samsung-s24', name:'Samsung Galaxy S24', price:799.00, img:'images/mobile/samsungs24.webp', desc:'6.2" Dynamic AMOLED 2X, Snapdragon 8 Gen 3, 50MP camera, AI features.', category:'samsung', brand:'samsung', condition:'new', rating:4.8},
  {id:'mob-poco', name:'POCO X6 Pro', price:299.00, img:'images/mobile/poco.jpg', desc:'6.67" AMOLED display, MediaTek Dimensity 8300-Ultra, 64MP camera, 67W fast charging.', category:'android', brand:'xiaomi', condition:'new', rating:4.5},
  {id:'mob-redmi', name:'Redmi Note 13', price:199.00, img:'images/mobile/redme.jpg', desc:'6.67" AMOLED display, 108MP camera, 5000mAh battery, MIUI 14.', category:'android', brand:'xiaomi', condition:'new', rating:4.4},
  {id:'mob-vivo', name:'Vivo Y100', price:179.00, img:'images/mobile/vivo.png', desc:'6.38" AMOLED display, 50MP camera, 4500mAh battery, Funtouch OS.', category:'android', brand:'vivo', condition:'new', rating:4.2},
  {id:'mob-sparkx', name:'Tecno Spark X', price:149.00, img:'images/mobile/sparkx.webp', desc:'6.6" HD+ display, 16MP camera, 5000mAh battery, HiOS interface.', category:'android', brand:'tecno', condition:'new', rating:4.1},
  {id:'mob-generic1', name:'Android Smartphone', price:129.00, img:'images/mobile/mobile.jpg', desc:'6.1" HD display, dual camera, 4000mAh battery, Android 12.', category:'budget', brand:'generic', condition:'new', rating:4.0},
  {id:'mob-generic2', name:'Budget Mobile', price:99.00, img:'images/mobile/mobile.avif', desc:'5.5" HD display, 13MP camera, 3000mAh battery, essential features.', category:'budget', brand:'generic', condition:'new', rating:3.9}
];

let filteredProducts = [...allProducts];
let currentFilters = {
  search: '',
  category: 'all',
  priceRange: 'all',
  condition: 'all',
  brand: 'all',
  sortBy: 'featured'
};

function render(list){
  const grid = document.getElementById('grid');
  grid.innerHTML = list.map(p=>`
    <article class="card" data-product-id="${p.id}">
      <div class="card-img">
        <img src="${p.img}" alt="${p.name}" loading="lazy">
        ${p.price > 500 ? '<div class="card-badge">Premium</div>' : ''}
      </div>
      <div class="card-content">
        <h3 class="card-title">${p.name}</h3>
        <p class="card-description">${p.desc}</p>
        <div class="card-price">$${p.price.toFixed(2)}</div>
        <div class="card-actions">
          <button class="card-btn card-btn-primary" data-add-to-cart data-id="${p.id}" data-name="${p.name}" data-price="${p.price.toFixed(2)}" data-img="${p.img}" data-desc="${p.desc}">
            Add to Cart
          </button>
          <button class="card-btn card-btn-secondary" onclick="openDetail('${p.id}')">
            View Details
          </button>
        </div>
      </div>
    </article>`).join('');
}

function applyFilters() {
  let filtered = [...allProducts];
  
  // Search filter
  if (currentFilters.search) {
    const searchTerm = currentFilters.search.toLowerCase();
    filtered = filtered.filter(product => 
      product.name.toLowerCase().includes(searchTerm) ||
      product.desc.toLowerCase().includes(searchTerm) ||
      product.category.toLowerCase().includes(searchTerm) ||
      product.brand.toLowerCase().includes(searchTerm)
    );
  }
  
  // Category filter
  if (currentFilters.category !== 'all') {
    filtered = filtered.filter(product => product.category === currentFilters.category);
  }
  
  // Price range filter
  if (currentFilters.priceRange !== 'all') {
    filtered = filtered.filter(product => {
      const price = product.price;
      switch (currentFilters.priceRange) {
        case 'under-200': return price < 200;
        case '200-500': return price >= 200 && price <= 500;
        case '500-800': return price >= 500 && price <= 800;
        case 'over-800': return price > 800;
        default: return true;
      }
    });
  }
  
  // Condition filter
  if (currentFilters.condition !== 'all') {
    filtered = filtered.filter(product => product.condition === currentFilters.condition);
  }
  
  // Brand filter
  if (currentFilters.brand !== 'all') {
    filtered = filtered.filter(product => product.brand === currentFilters.brand);
  }
  
  // Sort
  switch (currentFilters.sortBy) {
    case 'price-low':
      filtered.sort((a, b) => a.price - b.price);
      break;
    case 'price-high':
      filtered.sort((a, b) => b.price - a.price);
      break;
    case 'name':
      filtered.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'rating':
      filtered.sort((a, b) => b.rating - a.rating);
      break;
    default:
      // Keep original order for featured
      break;
  }
  
  filteredProducts = filtered;
  render(filteredProducts);
  updateProductStats();
}

function updateProductStats() {
  const count = filteredProducts.length;
  const minPrice = Math.min(...filteredProducts.map(p => p.price));
  const maxPrice = Math.max(...filteredProducts.map(p => p.price));
  
  document.getElementById('productCount').textContent = `${count} product${count !== 1 ? 's' : ''} available`;
  document.querySelector('.category-stats span:nth-child(3)').textContent = `From $${minPrice.toFixed(0)} to $${maxPrice.toFixed(0)}`;
}

function clearAllFilters() {
  currentFilters = {
    search: '',
    category: 'all',
    priceRange: 'all',
    condition: 'all',
    brand: 'all',
    sortBy: 'featured'
  };
  
  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearch').style.display = 'none';
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.remove('active');
    if (chip.dataset.filter === 'all') chip.classList.add('active');
  });
  document.getElementById('sortBy').value = 'featured';
  document.getElementById('priceRange').value = 'all';
  document.getElementById('condition').value = 'all';
  document.getElementById('brand').value = 'all';
  
  applyFilters();
}

// Event listeners
document.getElementById('searchInput').addEventListener('input', (e) => {
  currentFilters.search = e.target.value;
  document.getElementById('clearSearch').style.display = e.target.value ? 'block' : 'none';
  applyFilters();
});

document.getElementById('clearSearch').addEventListener('click', () => {
  document.getElementById('searchInput').value = '';
  currentFilters.search = '';
  document.getElementById('clearSearch').style.display = 'none';
  applyFilters();
});

document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentFilters.category = chip.dataset.filter;
    applyFilters();
  });
});

document.getElementById('sortBy').addEventListener('change', (e) => {
  currentFilters.sortBy = e.target.value;
  applyFilters();
});

document.getElementById('priceRange').addEventListener('change', (e) => {
  currentFilters.priceRange = e.target.value;
  applyFilters();
});

document.getElementById('condition').addEventListener('change', (e) => {
  currentFilters.condition = e.target.value;
  applyFilters();
});

document.getElementById('brand').addEventListener('change', (e) => {
  currentFilters.brand = e.target.value;
  applyFilters();
});

document.getElementById('clearFilters').addEventListener('click', clearAllFilters);

// Initialize
render(filteredProducts);
updateCartCount();
updateProductStats();

// -------- Details Modal --------
const modal = document.getElementById('productModal');
const modalContent = document.getElementById('modalContent');
const closeModalBtn = document.getElementById('closeModal');
closeModalBtn.addEventListener('click', ()=> modal.classList.remove('show'));
modal.addEventListener('click', (e)=>{ if(e.target.classList.contains('modal-backdrop')) modal.classList.remove('show'); });

function stars(n){ return '★★★★★☆☆☆☆☆'.slice(5 - Math.round(Math.max(0, Math.min(5,n)))) .slice(0,5).replace(/./g,(c,i)=> i < Math.round(n) ? '★' : '☆'); }

function openDetail(id){
  const p = allProducts.find(x=>x.id===id);
  if(!p) return;
  const sampleReviews = [
    {by:'Ayesha', rating:5, text:'Great value and battery life.'},
    {by:'Hamza', rating:4, text:'Camera is solid, display is crisp.'},
    {by:'Zara', rating:4, text:'Good daily driver at this price.'}
  ];
  const escrowHtml = `
    <h3>How Escrow Works</h3>
    <div class="escrow-steps">
      <div class="escrow-step active"><span class="num">1</span><span class="label">Pay & Hold</span></div>
      <div class="escrow-step"><span class="num">2</span><span class="label">Seller Ships to Escrow Location</span></div>
      <div class="escrow-step"><span class="num">3</span><span class="label">Verification at Escrow</span></div>
      <div class="escrow-step"><span class="num">4</span><span class="label">Buyer Confirms Delivery</span></div>
      <div class="escrow-step"><span class="num">5</span><span class="label">Funds Released to Seller</span></div>
    </div>
    <p class="escrow-note">Payments are held securely until delivery confirmation. Disputes can be raised for refunds — admins review and take appropriate action.</p>`;

  modalContent.innerHTML = `
    <div class="product-detail-grid">
      <img class="product-image-large" src="${p.img}" alt="${p.name}">
      <div class="product-info">
        <h2>${p.name}</h2>
        <div class="product-price-large">$${p.price.toFixed(2)}</div>
        <p><strong>Category:</strong> ${p.category.charAt(0).toUpperCase() + p.category.slice(1)}</p>
        <p><strong>Brand:</strong> ${p.brand.charAt(0).toUpperCase() + p.brand.slice(1)}</p>
        <p><strong>Condition:</strong> ${p.condition.charAt(0).toUpperCase() + p.condition.slice(1)}</p>
        <p><strong>Rating:</strong> ${p.rating}/5 ⭐</p>
        <p class="product-description">${p.desc}</p>
        <div class="product-actions">
          <button class="product-btn product-btn-primary" data-add-to-cart data-id="${p.id}" data-name="${p.name}" data-price="${p.price.toFixed(2)}" data-img="${p.img}" data-desc="${p.desc}">
            Add to Cart
          </button>
          <button class="product-btn product-btn-secondary" onclick="modal.classList.remove('show')">
            Close
          </button>
        </div>
        <div class="escrow-section">
          ${escrowHtml}
        </div>
        <div class="product-reviews">
          <h3>Customer Reviews</h3>
          <div class="reviews-grid">
            ${sampleReviews.map(r=>`
              <div class="review-item">
                <div class="review-header">
                  <span class="review-author">${r.by}</span>
                  <div class="review-rating">${stars(r.rating)}</div>
                </div>
                <div class="review-text">${r.text}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>`;
  modal.classList.add('show');
}

document.addEventListener('click', (e)=>{
  const card = e.target.closest('.card');
  if (!card) return;
  if (e.target.closest('[data-add-to-cart]')) return; // let cart button work
  const id = card.getAttribute('data-product-id');
  if (id) openDetail(id);
});
