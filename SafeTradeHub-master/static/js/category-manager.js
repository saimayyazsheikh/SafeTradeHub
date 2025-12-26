// ========================================
// CATEGORY-MANAGER.JS - Central script for all category pages
// ========================================

// Global State
let allProducts = [];
let filteredProducts = [];
let currentFilters = {
    search: '',
    category: typeof CURRENT_CATEGORY !== 'undefined' ? CURRENT_CATEGORY : 'all',
    priceRange: 'all',
    condition: 'all',
    brand: 'all',
    sortBy: 'featured'
};

// Cart Functionality (Shared)
const CART_KEY = 'sthub_cart';
function getCart() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || [] } catch { return [] } }
function saveCart(c) { localStorage.setItem(CART_KEY, JSON.stringify(c)); }
function cartCount() { return getCart().reduce((a, i) => a + (i.qty || 1), 0); }
function updateCartCount() { const b = document.getElementById('cartCount'); if (b) b.textContent = cartCount(); }

function addToCart(product, qty = 1) {
    if (!isUserLoggedIn()) {
        showLoginPrompt();
        return false;
    }

    const cart = getCart();
    const i = cart.findIndex(x => x.id === product.id);
    if (i > -1) cart[i].qty += qty;
    else cart.push({ ...product, qty });
    saveCart(cart);
    updateCartCount();

    // Show toast instead of alert
    showToast(`Added to cart: ${product.title}`, 'success');
    return true;
}

// Authentication Helper
function isUserLoggedIn() {
    if (window.AuthManager && window.AuthManager.isAuthenticated()) return true;
    if (firebase.auth().currentUser) return true;
    return !!(localStorage.getItem('authToken') && localStorage.getItem('userData'));
}

function showLoginPrompt() {
    if (confirm('Please sign in to add items to your cart. Go to login?')) {
        window.location.href = 'auth.html?mode=signin';
    }
}

// Toast Notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.cssText = `
    position: fixed; top: 20px; right: 20px; background: white; padding: 12px 24px;
    border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999;
    border-left: 4px solid ${type === 'success' ? '#10B981' : '#3B82F6'};
    animation: slideIn 0.3s ease-out;
  `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🛍️ Category Manager: Initializing...');

    // Update cart count immediately
    updateCartCount();

    // Load products
    await fetchProducts();

    // Setup event listeners
    setupEventListeners();
});

async function fetchProducts() {
    const grid = document.getElementById('grid');
    if (grid) grid.innerHTML = '<div class="loading-spinner">Loading products...</div>';

    try {
        console.log('🔥 Fetching products from Firebase...');
        const snapshot = await firebase.database().ref('products').once('value');
        const data = snapshot.val();

        if (data) {
            // Convert object to array and filter active products
            allProducts = Object.values(data).filter(p => p.isActive && p.status === 'active');

            // Filter by current category if set
            if (currentFilters.category !== 'all') {
                allProducts = allProducts.filter(p => p.category === currentFilters.category);
            }

            console.log(`✅ Loaded ${allProducts.length} products for category: ${currentFilters.category}`);
        } else {
            allProducts = [];
        }

        filteredProducts = [...allProducts];
        render(filteredProducts);
        updateProductStats();

    } catch (error) {
        console.error('❌ Error fetching products:', error);
        if (grid) grid.innerHTML = '<div class="error-message">Failed to load products. Please try again later.</div>';
    }
}

function render(list) {
    const grid = document.getElementById('grid');
    if (!grid) return;

    if (list.length === 0) {
        grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 40px;">
        <i class="fas fa-box-open" style="font-size: 48px; color: #cbd5e1; margin-bottom: 16px;"></i>
        <h3>No products found</h3>
        <p>Try adjusting your filters or check back later.</p>
      </div>
    `;
        return;
    }

    grid.innerHTML = list.map(p => {
        // Handle image array or single image string
        let imgUrl = 'images/placeholder.jpg';
        if (Array.isArray(p.images) && p.images.length > 0) {
            imgUrl = p.images.find(img => img.isMain)?.url || p.images[0].url;
        } else if (typeof p.images === 'string') {
            imgUrl = p.images;
        } else if (p.img) {
            imgUrl = p.img; // Fallback for legacy data
        }

        return `
      <article class="card" data-product-id="${p.id}">
        <div class="card-img">
          <img src="${imgUrl}" alt="${p.name}" loading="lazy" onerror="this.src='images/placeholder.jpg'">
        </div>
        <div class="card-content">
          <h3 class="card-title">${p.name}</h3>
          <p class="card-description">${p.description || p.desc || 'No description available.'}</p>
          <div class="card-price">RS ${parseFloat(p.price).toFixed(2)}</div>
          <div class="card-actions">
            <button class="card-btn card-btn-primary" data-add-to-cart 
              data-id="${p.id}" 
              data-name="${p.name}" 
              data-price="${p.price}" 
              data-shipping-cost="${p.shippingCost || 0}"
              data-img="${imgUrl}" 
              data-desc="${p.description || p.desc}"
              data-seller-id="${p.sellerId || ''}"
              data-seller-name="${p.sellerName || ''}">
              Add to Cart
            </button>
            <button class="card-btn card-btn-secondary" onclick="openDetail('${p.id}')">
              View Details
            </button>
          </div>
        </div>
      </article>
    `;
    }).join('');
}

function applyFilters() {
    let filtered = [...allProducts];

    // Search
    if (currentFilters.search) {
        const term = currentFilters.search.toLowerCase();
        filtered = filtered.filter(p =>
            p.name.toLowerCase().includes(term) ||
            (p.description || '').toLowerCase().includes(term) ||
            (p.brand || '').toLowerCase().includes(term)
        );
    }

    // Price Range
    if (currentFilters.priceRange !== 'all') {
        filtered = filtered.filter(p => {
            const price = parseFloat(p.price);
            switch (currentFilters.priceRange) {
                case 'under-1000': return price < 1000;
                case '1000-5000': return price >= 1000 && price <= 5000;
                case '5000-20000': return price >= 5000 && price <= 20000;
                case '20000-50000': return price >= 20000 && price <= 50000;
                case '50000-100000': return price >= 50000 && price <= 100000;
                case 'over-100000': return price > 100000;
                default: return true;
            }
        });
    }

    // Condition
    if (currentFilters.condition !== 'all') {
        filtered = filtered.filter(p => p.condition === currentFilters.condition);
    }

    // Brand
    if (currentFilters.brand !== 'all') {
        filtered = filtered.filter(p => (p.brand || '').toLowerCase() === currentFilters.brand.toLowerCase());
    }

    // Sort
    switch (currentFilters.sortBy) {
        case 'price-low': filtered.sort((a, b) => a.price - b.price); break;
        case 'price-high': filtered.sort((a, b) => b.price - a.price); break;
        case 'name': filtered.sort((a, b) => a.name.localeCompare(b.name)); break;
        case 'rating': filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
    }

    filteredProducts = filtered;
    render(filteredProducts);
    updateProductStats();
}

function updateProductStats() {
    const count = filteredProducts.length;
    const prices = filteredProducts.map(p => p.price);
    const min = prices.length ? Math.min(...prices) : 0;
    const max = prices.length ? Math.max(...prices) : 0;

    const countEl = document.getElementById('productCount');
    const statsEl = document.querySelector('.category-stats span:nth-child(3)');

    if (countEl) countEl.textContent = `${count} product${count !== 1 ? 's' : ''} available`;
    if (statsEl) statsEl.textContent = `From RS ${min.toFixed(0)} to RS ${max.toFixed(0)}`;
}

function setupEventListeners() {
    // Search
    const searchInput = document.getElementById('searchInput');
    const clearSearch = document.getElementById('clearSearch');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentFilters.search = e.target.value;
            if (clearSearch) clearSearch.style.display = e.target.value ? 'block' : 'none';
            applyFilters();
        });
    }

    if (clearSearch) {
        clearSearch.addEventListener('click', () => {
            searchInput.value = '';
            currentFilters.search = '';
            clearSearch.style.display = 'none';
            applyFilters();
        });
    }

    // Filter Chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            // If chip is "All", reset category to page default, else use chip value
            // Note: This logic might need adjustment if chips are sub-categories
            // For now, let's assume chips are just visual filters for now.
        });
    });

    // Dropdowns
    ['sortBy', 'priceRange', 'condition', 'brand'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', (e) => {
                currentFilters[id] = e.target.value;
                applyFilters();
            });
        }
    });

    // Clear All
    const clearBtn = document.getElementById('clearFilters');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            currentFilters.search = '';
            currentFilters.priceRange = 'all';
            currentFilters.condition = 'all';
            currentFilters.brand = 'all';
            currentFilters.sortBy = 'featured';

            if (searchInput) searchInput.value = '';
            if (clearSearch) clearSearch.style.display = 'none';

            // Reset dropdowns
            ['sortBy', 'priceRange', 'condition', 'brand'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = el.options[0].value;
            });

            applyFilters();
        });
    }

    // Add to Cart Delegation
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-add-to-cart]');
        if (btn) {
            const product = {
                id: btn.dataset.id,
                title: btn.dataset.name,
                price: parseFloat(btn.dataset.price),
                shippingCost: parseFloat(btn.dataset.shippingCost || 0),
                img: btn.dataset.img,
                desc: btn.dataset.desc
            };
            addToCart(product);
        }
    });
}

// Modal Logic
const modal = document.getElementById('productModal');
const modalContent = document.getElementById('modalContent');

if (modal) {
    modal.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop') || e.target.id === 'closeModal') {
            modal.classList.remove('show');
        }
    });
}

window.openDetail = async function (id) {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;

    // Increment View Count in Firebase
    try {
        const productRef = firebase.database().ref('products/' + id);
        productRef.child('views').transaction((currentViews) => {
            return (currentViews || 0) + 1;
        });
    } catch (error) {
        console.error('Error incrementing view count:', error);
    }

    // Handle image
    let imgUrl = 'images/placeholder.jpg';
    if (Array.isArray(p.images) && p.images.length > 0) {
        imgUrl = p.images.find(img => img.isMain)?.url || p.images[0].url;
    } else if (typeof p.images === 'string') {
        imgUrl = p.images;
    } else if (p.img) {
        imgUrl = p.img;
    }

    // Generate stars
    const stars = (n) => '★★★★★☆☆☆☆☆'.slice(5 - Math.round(Math.max(0, Math.min(5, n)))).slice(0, 5).replace(/./g, (c, i) => i < Math.round(n) ? '★' : '☆');

    // Specs HTML
    let specsHtml = '';
    if (p.specifications) {
        specsHtml = '<div class="product-specs"><h3>Specifications</h3><ul>';
        for (const [key, val] of Object.entries(p.specifications)) {
            specsHtml += `<li><strong>${key}:</strong> ${val}</li>`;
        }
        specsHtml += '</ul></div>';
    }

    // Fetch Seller Info
    let sellerHtml = '';
    if (p.sellerId) {
        try {
            const sellerSnap = await firebase.database().ref('users/' + p.sellerId).once('value');
            let sellerName = p.sellerName || 'Unknown Seller'; // Default to product-saved name
            let sellerPic = 'images/avatar-placeholder.png';

            if (sellerSnap.exists()) {
                const seller = sellerSnap.val();
                // Try all possible name fields
                sellerName = seller.name || seller.fullName || seller.displayName || seller.username || sellerName;
                sellerPic = seller.profile?.avatar || seller.profilePic || seller.avatar || sellerPic;
            }

            sellerHtml = `
                <div class="product-seller-info" style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #eee; display: flex; align-items: center; gap: 1rem;">
                    <img src="${sellerPic}" alt="${sellerName}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <div>
                        <div style="font-weight: bold; color: #333; margin-bottom: 2px;">${sellerName}</div>
                        <a href="seller-profile.html?id=${p.sellerId}" class="view-profile-link" style="color: #2563eb; text-decoration: none; font-size: 0.9rem; font-weight: 500;">View Seller Profile &rarr;</a>
                    </div>
                </div>
            `;
        } catch (e) {
            console.error('Error fetching seller', e);
            // Fallback to product-saved name if fetch fails
            if (p.sellerName) {
                sellerHtml = `
                    <div class="product-seller-info" style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #eee; display: flex; align-items: center; gap: 1rem;">
                        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(p.sellerName)}&background=random" alt="${p.sellerName}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <div>
                            <div style="font-weight: bold; color: #333; margin-bottom: 2px;">${p.sellerName}</div>
                            <a href="seller-profile.html?id=${p.sellerId}" class="view-profile-link" style="color: #2563eb; text-decoration: none; font-size: 0.9rem; font-weight: 500;">View Seller Profile &rarr;</a>
                        </div>
                    </div>
                `;
            }
        }
    }

    modalContent.innerHTML = `
    <div class="product-detail-grid">
      <img class="product-image-large" src="${imgUrl}" alt="${p.name}" onerror="this.src='images/placeholder.jpg'">
      <div class="product-info">
        <h2>${p.name}</h2>
        <div class="product-price-large">RS ${parseFloat(p.price).toFixed(2)}</div>
        <p><strong>Category:</strong> ${(p.category || '').toUpperCase()}</p>
        <p><strong>Brand:</strong> ${(p.brand || 'Generic').toUpperCase()}</p>
        <p><strong>Condition:</strong> ${(p.condition || 'New').toUpperCase()}</p>
        <p><strong>Shipping Method:</strong> ${(p.shippingMethod || 'Standard').toUpperCase()}</p>
        <p><strong>Shipping Cost:</strong> ${p.shippingCost > 0 ? 'RS ' + parseFloat(p.shippingCost).toFixed(2) : 'Free Shipping'}</p>
        <p><strong>Rating:</strong> ${p.averageRating || 0}/5 ⭐ (${p.totalReviews || 0} reviews)</p>
        
        <div class="product-description">
          <h3>Description</h3>
          <p>${p.description || p.desc || 'No description available.'}</p>
        </div>

        ${specsHtml}

        ${sellerHtml}

        <div class="product-actions">
          <button class="product-btn product-btn-primary" data-add-to-cart 
            data-id="${p.id}" 
            data-name="${p.name}" 
            data-price="${p.price}" 
            data-shipping-cost="${p.shippingCost || 0}"
            data-img="${imgUrl}" 
            data-desc="${p.description || p.desc}"
            data-seller-id="${p.sellerId || ''}"
            data-seller-name="${p.sellerName || ''}">
            Add to Cart
          </button>
          
          ${p.sellerId ? `
          <button class="product-btn product-btn-chat" onclick="window.SellerChatApp.openChat('${p.sellerId}', '${p.id}', '${p.name.replace(/'/g, "\\'")}')">
            <i class="fas fa-comment-alt"></i> Chat With Seller
          </button>
          ` : ''}

          <button class="product-btn product-btn-secondary" onclick="document.getElementById('productModal').classList.remove('show')">
            Close
          </button>
        </div>
      </div>
    </div>`;

    modal.classList.add('show');
};
