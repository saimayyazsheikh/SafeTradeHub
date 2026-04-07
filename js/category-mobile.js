// ========================================
// CATEGORY-MOBILE.JS - JavaScript for category-mobile.html
// ========================================

const CART_KEY='sthub_cart';
function getCart(){ try { return JSON.parse(localStorage.getItem(CART_KEY))||[] } catch { return [] } }
function saveCart(c){ localStorage.setItem(CART_KEY, JSON.stringify(c)); }
function cartCount(){ return getCart().reduce((a,i)=> a + (i.qty||1), 0); }
function updateCartCount(){ const b=document.getElementById('cartCount'); if(b) b.textContent=cartCount(); }
function addToCart(product, qty=1){ const cart=getCart(); const i=cart.findIndex(x=>x.id===product.id); if(i>-1) cart[i].qty += qty; else cart.push({...product, qty}); saveCart(cart); updateCartCount(); alert('Added to cart: '+product.title); }
document.addEventListener('click', (e)=>{ const btn=e.target.closest('[data-add-to-cart]'); if(!btn) return; const product={ id:btn.dataset.id, title:btn.dataset.name, price:parseFloat(btn.dataset.price||'0'), img:btn.dataset.img, desc:btn.dataset.desc }; addToCart(product,1); });

// Enhanced mobile products data
const allProducts = [
  {id:'mob-iphone12', name:'iPhone 12 Pro Max', price:899.00, img:'images/iphone12.jpg', desc:'6.7" display, A14 Bionic, triple camera.', category:'iphone', brand:'apple', condition:'new', rating:4.8},
  {id:'mob-prime-x', name:'Android Prime X', price:399.00, img:'images/mobile.jpg', desc:'Smooth performance with long battery life.', category:'android', brand:'generic', condition:'new', rating:4.6},
  {id:'mob-a2', name:'Budget A2', price:149.00, img:'images/mobile.avif', desc:'Affordable phone for everyday use.', category:'budget', brand:'generic', condition:'new', rating:4.2},
  {id:'mob-lite', name:'Android Lite', price:199.00, img:'images/mobile.jpg', desc:'Compact design with essential features.', category:'android', brand:'generic', condition:'new', rating:4.4},
  {id:'mob-ultra', name:'Android Ultra', price:699.00, img:'images/mobile.avif', desc:'Flagship camera and OLED display.', category:'android', brand:'samsung', condition:'new', rating:4.7},
  {id:'mob-note10', name:'Samsung Note 10', price:329.00, img:'images/mobile.jpg', desc:'Large screen and stylus support.', category:'samsung', brand:'samsung', condition:'new', rating:4.5},
  {id:'mob-mini', name:'iPhone Mini S', price:249.00, img:'images/mobile.jpg', desc:'Pocket size with solid battery.', category:'iphone', brand:'apple', condition:'new', rating:4.3},
  {id:'mob-max', name:'Max Plus', price:549.00, img:'images/mobile.avif', desc:'Big screen entertainment phone.', category:'android', brand:'generic', condition:'new', rating:4.4},
  {id:'mob-pro', name:'Pro ZX', price:629.00, img:'images/mobile.jpg', desc:'Pro camera features for creators.', category:'android', brand:'generic', condition:'new', rating:4.6},
  {id:'mob-core', name:'Core 5', price:179.00, img:'images/mobile.avif', desc:'Great value starter smartphone.', category:'budget', brand:'generic', condition:'new', rating:4.1},
  {id:'mob-air', name:'Air 7', price:289.00, img:'images/mobile.jpg', desc:'Slim, light and fast charging.', category:'android', brand:'generic', condition:'new', rating:4.3},
  {id:'mob-edge', name:'Edge Curve', price:459.00, img:'images/mobile.avif', desc:'Curved display with 5G.', category:'android', brand:'samsung', condition:'new', rating:4.5},
  {id:'mob-xr', name:'XR Neo', price:379.00, img:'images/mobile.jpg', desc:'Balanced specs for daily tasks.', category:'android', brand:'generic', condition:'new', rating:4.4},
  {id:'mob-iphone13', name:'iPhone 13', price:799.00, img:'images/iphone12.jpg', desc:'Latest iPhone with advanced features.', category:'iphone', brand:'apple', condition:'new', rating:4.9}
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
