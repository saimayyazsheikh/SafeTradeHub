// ========================================
// CATEGORY-MANAGER.JS - Central script for all category pages
// AUCTION RECONSTRUCTION - Elite Visual Architecture
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

// ========================================
// GLOBAL TIMER ENGINE
// Single setInterval for ALL countdown timers on the page.
// ========================================
let _auctionTimerInterval = null;

function startGlobalTimerEngine() {
    if (_auctionTimerInterval) clearInterval(_auctionTimerInterval);
    _auctionTimerInterval = setInterval(() => {
        document.querySelectorAll('[data-auction-end]').forEach(el => {
            const endTime = parseInt(el.dataset.auctionEnd);
            const now = Date.now();
            const diff = endTime - now;

            if (diff <= 0) {
                el.innerHTML = '<i class="fas fa-flag-checkered"></i> AUCTION ENDED';
                el.classList.add('timer-ended');
                el.classList.remove('timer-urgent');
                // Also update the card visually
                const card = el.closest('.card');
                if (card) {
                    card.classList.add('auction-ended-card');
                    const ribbon = card.querySelector('.auction-ribbon');
                    if (ribbon) {
                        ribbon.classList.add('auction-ended-ribbon');
                        ribbon.textContent = 'ENDED';
                    }
                    const bidBtn = card.querySelector('.auction-btn');
                    if (bidBtn) {
                        bidBtn.disabled = true;
                        bidBtn.textContent = 'Ended';
                        bidBtn.style.opacity = '0.5';
                    }
                }
                return;
            }

            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);

            let timeStr = '';
            if (hours > 24) {
                const days = Math.floor(hours / 24);
                const remainHours = hours % 24;
                timeStr = `${days}d ${remainHours}h ${minutes}m`;
            } else {
                timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }

            el.innerHTML = `<i class="fas fa-clock"></i> Ends in: ${timeStr}`;

            // 1 hour warning = urgent
            if (diff < 3600000) {
                el.classList.add('timer-urgent');
            } else {
                el.classList.remove('timer-urgent');
            }
        });
    }, 1000);
}

// ========================================
// PRODUCT RENDERING
// ========================================

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    

    // Update cart count immediately
    updateCartCount();

    // Load products
    await fetchProducts();

    // Setup event listeners
    setupEventListeners();

    // Start the global timer engine
    startGlobalTimerEngine();
});

async function fetchProducts() {
    const grid = document.getElementById('grid');
    if (grid) grid.innerHTML = '<div class="loading-spinner">Loading products...</div>';

    try {
        
        const snapshot = await firebase.database().ref('products').once('value');
        const data = snapshot.val();

        if (data) {
            // Convert object to array and filter active products
            allProducts = Object.values(data).filter(p => p.isActive && p.status === 'active');

            // Filter by current category if set
            if (currentFilters.category !== 'all') {
                allProducts = allProducts.filter(p => p.category === currentFilters.category);
            }

            
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

// ========================================
// CONDITIONAL CARD RENDERER
// Auction items get the Indigo theme, fixed items keep the Blue theme.
// ========================================
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
            imgUrl = p.img;
        }

        // ─── AUCTION DETECTION ───
        const auction = p.auction || {};
        const isAuction = auction.enabled === true;

        if (isAuction) {
            return renderAuctionCard(p, imgUrl, auction);
        } else {
            return renderFixedCard(p, imgUrl);
        }
    }).join('');
}

/**
 * FIXED PRICE CARD — Standard Blue Theme (unchanged logic)
 */
function renderFixedCard(p, imgUrl) {
    return `
      <article class="card card-fixed" data-product-id="${p.id}">
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
}

/**
 * AUCTION CARD — Indigo Elite Theme with LIVE ribbon & countdown
 */
function renderAuctionCard(p, imgUrl, auction) {
    const currentBid = auction.currentHighestBid || auction.startingPrice || p.price || 0;
    const bidCount = auction.bidCount || 0;

    // Calculate auction end time
    // auction.updatedAt is when the auction was configured. Duration is in days.
    const auctionStartStr = auction.updatedAt || p.updatedAt || p.createdAt;
    const auctionStart = auctionStartStr ? new Date(auctionStartStr).getTime() : Date.now();
    const durationMs = (auction.duration || 7) * 24 * 60 * 60 * 1000;
    const auctionEndTime = auctionStart + durationMs;
    const isEnded = Date.now() >= auctionEndTime;

    const ribbonClass = isEnded ? 'auction-ribbon auction-ended-ribbon' : 'auction-ribbon';
    const ribbonText = isEnded ? 'ENDED' : '🔥 LIVE';

    return `
      <article class="card card-auction ${isEnded ? 'auction-ended-card' : ''}" data-product-id="${p.id}">
        <div class="card-img">
          <img src="${imgUrl}" alt="${p.name}" loading="lazy" onerror="this.src='images/placeholder.jpg'">
          
          <!-- Diagonal LIVE Ribbon -->
          <div class="auction-ribbon-wrapper">
            <div class="${ribbonClass}">${ribbonText}</div>
          </div>

          <!-- Countdown Bar -->
          <div class="countdown-bar" data-auction-end="${auctionEndTime}">
            <i class="fas fa-clock"></i> ${isEnded ? 'AUCTION ENDED' : 'Calculating...'}
          </div>
        </div>
        <div class="card-content">
          <h3 class="card-title">${p.name}</h3>
          <p class="card-description">${p.description || p.desc || 'No description available.'}</p>
          <div class="card-price auction-price-label">
            <span style="font-size:0.75rem; color:#64748b; text-transform:uppercase; display:block; font-weight:700; margin-bottom:2px;">Current Bid</span>
            RS ${parseFloat(currentBid).toLocaleString('en-PK')}
            <span style="font-size:0.75rem; color:#94a3b8; margin-left:8px;">(${bidCount} bid${bidCount !== 1 ? 's' : ''})</span>
          </div>
          <div class="card-actions">
            <button class="card-btn auction-btn btn-pulse" 
              onclick="event.stopPropagation(); openDetail('${p.id}')"
              ${isEnded ? 'disabled style="opacity:0.5"' : ''}>
              <i class="fas fa-gavel"></i> ${isEnded ? 'Ended' : 'Place Bid'}
            </button>
            <button class="card-btn card-btn-secondary" onclick="openDetail('${p.id}')">
              Details
            </button>
          </div>
        </div>
      </article>
    `;
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

// ========================================
// MODAL LOGIC — THE "BIDDING HUB"
// Conditionally renders Fixed-Price or Auction modals
// ========================================
const modal = document.getElementById('productModal');
const modalContent = document.getElementById('modalContent');

if (modal) {
    modal.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop') || e.target.id === 'closeModal') {
            modal.classList.remove('show');
            // Detach any live listeners for this modal
            if (window._modalBidListener) {
                window._modalBidListener();
                window._modalBidListener = null;
            }
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
            let sellerName = p.sellerName || 'Unknown Seller';
            let sellerPic = 'images/avatar-placeholder.png';

            if (sellerSnap.exists()) {
                const seller = sellerSnap.val();
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

    // ─── AUCTION DETECTION FOR MODAL ───
    const auction = p.auction || {};
    const isAuction = auction.enabled === true;

    if (isAuction) {
        renderAuctionModal(p, imgUrl, auction, specsHtml, sellerHtml);
    } else {
        renderFixedModal(p, imgUrl, specsHtml, sellerHtml);
    }

    modal.classList.add('show');
};

/**
 * FIXED PRICE MODAL — Standard (no changes from original)
 */
function renderFixedModal(p, imgUrl, specsHtml, sellerHtml) {
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
}

/**
 * AUCTION MODAL — THE "BIDDING HUB"
 * Real-time bid updates via Firebase .on('value')
 */
function renderAuctionModal(p, imgUrl, auction, specsHtml, sellerHtml) {
    const currentBid = auction.currentHighestBid || auction.startingPrice || p.price || 0;
    const minIncrement = auction.minIncrement || 100;
    const bidCount = auction.bidCount || 0;
    const minNextBid = parseFloat(currentBid) + parseFloat(minIncrement);

    // Calculate end time
    const auctionStartStr = auction.updatedAt || p.updatedAt || p.createdAt;
    const auctionStart = auctionStartStr ? new Date(auctionStartStr).getTime() : Date.now();
    const durationMs = (auction.duration || 7) * 24 * 60 * 60 * 1000;
    const auctionEndTime = auctionStart + durationMs;
    const isEnded = Date.now() >= auctionEndTime;

    modalContent.innerHTML = `
    <div class="product-detail-grid">
      <div style="position: relative;">
        <img class="product-image-large" src="${imgUrl}" alt="${p.name}" onerror="this.src='images/placeholder.jpg'">
        ${!isEnded ? `<div class="countdown-bar" data-auction-end="${auctionEndTime}" style="border-radius:0 0 12px 12px;"><i class="fas fa-clock"></i> Calculating...</div>` : ''}
      </div>
      <div class="product-info">
        <h2>${p.name}</h2>

        <!-- Auction Meta Boxes -->
        <div class="modal-auction-meta">
          <div class="auction-meta-box">
            <span class="label">Current Bid</span>
            <span class="val" id="modalCurrentBid">RS ${parseFloat(currentBid).toLocaleString('en-PK')}</span>
          </div>
          <div class="auction-meta-box timer">
            <span class="label">Time Left</span>
            <span class="val" id="modalTimeLeft" data-auction-end="${auctionEndTime}">${isEnded ? 'ENDED' : '...'}</span>
          </div>
          <div class="auction-meta-box">
            <span class="label">Total Bids</span>
            <span class="val" id="modalBidCount">${bidCount}</span>
          </div>
        </div>

        <p><strong>Category:</strong> ${(p.category || '').toUpperCase()}</p>
        <p><strong>Condition:</strong> ${(p.condition || 'New').toUpperCase()}</p>
        <p><strong>Shipping:</strong> ${p.shippingCost > 0 ? 'RS ' + parseFloat(p.shippingCost).toFixed(2) : 'Free'}</p>

        <div class="product-description">
          <h3>Description</h3>
          <p>${p.description || p.desc || 'No description available.'}</p>
        </div>

        ${specsHtml}

        ${sellerHtml}

        <!-- BIDDING WIDGET -->
        ${!isEnded ? `
        <div class="bidding-widget">
          <h3 style="margin:0 0 4px; font-size:1rem; font-weight:800; color:#1e293b;"><i class="fas fa-gavel" style="color:#4F46E5; margin-right:6px;"></i> Place Your Bid</h3>
          <div class="bid-hint" id="bidMinHint">
            <i class="fas fa-info-circle" style="color:#4F46E5;"></i> 
            Minimum next bid: <strong>RS <span id="bidMinVal">${parseFloat(minNextBid).toLocaleString('en-PK')}</span></strong>
          </div>
          <div class="bid-input-group">
            <input type="number" id="bidAmountInput" placeholder="Enter your bid (RS)" 
              min="${minNextBid}" value="${minNextBid}" step="${minIncrement}">
            <button class="product-btn auction-btn btn-pulse" id="placeBidBtn" disabled 
              style="white-space:nowrap; min-width:140px;">
              <i class="fas fa-gavel"></i> Place Bid
            </button>
          </div>
          <div id="bidFeedback" style="margin-top:10px; font-size:0.85rem; font-weight:600;"></div>
        </div>
        ` : `
        <div class="bidding-widget" style="text-align:center; background:#f1f5f9;">
          <i class="fas fa-flag-checkered" style="font-size:2rem; color:#64748b; margin-bottom:8px;"></i>
          <h3 style="color:#64748b; margin:0;">Auction Has Ended</h3>
          <p style="color:#94a3b8; margin-top:4px;">This auction is no longer accepting bids.</p>
        </div>
        `}

        <!-- Recent Bids -->
        <div class="recent-bidders" id="recentBiddersSection">
          <h4>Recent Bids</h4>
          <div id="recentBidsList"><em style="color:#94a3b8; font-size:0.85rem;">Loading bid history...</em></div>
        </div>

        <div class="product-actions" style="margin-top:16px;">
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

    // ─── LIVE SYNC: Firebase .on('value') for real-time bid updates ───
    setupLiveBidSync(p.id, minIncrement);

    // ─── BID INPUT VALIDATION ───
    if (!isEnded) {
        setupBidInput(p.id, minNextBid);
    }

    // ─── LOAD BID HISTORY ───
    loadBidHistory(p.id);
}

/**
 * LIVE SYNC: Watches product auction data in real-time
 */
function setupLiveBidSync(productId, minIncrement) {
    // Detach any previous listener
    if (window._modalBidListener) {
        window._modalBidListener();
        window._modalBidListener = null;
    }

    const ref = firebase.database().ref(`products/${productId}/auction`);
    const listener = ref.on('value', (snap) => {
        const data = snap.val();
        if (!data) return;

        const currentBid = data.currentHighestBid || data.startingPrice || 0;
        const bidCount = data.bidCount || 0;
        const minNext = parseFloat(currentBid) + parseFloat(minIncrement);

        // Update UI elements
        const bidEl = document.getElementById('modalCurrentBid');
        const countEl = document.getElementById('modalBidCount');
        const minValEl = document.getElementById('bidMinVal');
        const bidInput = document.getElementById('bidAmountInput');

        if (bidEl) bidEl.textContent = `RS ${parseFloat(currentBid).toLocaleString('en-PK')}`;
        if (countEl) countEl.textContent = bidCount;
        if (minValEl) minValEl.textContent = parseFloat(minNext).toLocaleString('en-PK');
        if (bidInput) {
            bidInput.min = minNext;
            if (parseFloat(bidInput.value) < minNext) {
                bidInput.value = minNext;
            }
        }
    });

    // Store off function to detach later
    window._modalBidListener = () => ref.off('value', listener);
}

/**
 * BID INPUT: Validation & submission
 */
function setupBidInput(productId, initialMinBid) {
    const input = document.getElementById('bidAmountInput');
    const btn = document.getElementById('placeBidBtn');
    const feedback = document.getElementById('bidFeedback');
    if (!input || !btn) return;

    // Validate on input
    input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        const currentMin = parseFloat(input.min);
        if (val >= currentMin) {
            btn.disabled = false;
            feedback.innerHTML = `<span style="color:#10B981;"><i class="fas fa-check-circle"></i> Valid bid amount</span>`;
        } else {
            btn.disabled = true;
            feedback.innerHTML = `<span style="color:#ef4444;"><i class="fas fa-times-circle"></i> Bid must be at least RS ${currentMin.toLocaleString('en-PK')}</span>`;
        }
    });

    // Trigger initial validation
    input.dispatchEvent(new Event('input'));

    // Handle submission
    btn.addEventListener('click', async () => {
        const bidAmount = parseFloat(input.value);
        const currentMin = parseFloat(input.min);

        if (bidAmount < currentMin) {
            feedback.innerHTML = `<span style="color:#ef4444;">Bid too low!</span>`;
            return;
        }

        if (!isUserLoggedIn()) {
            showLoginPrompt();
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Placing...';

        try {
            const token = await firebase.auth().currentUser.getIdToken();
            const response = await fetch('/api/v1/bids/place', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    productId: productId,
                    bidAmount: bidAmount,
                    maxBid: bidAmount
                })
            });

            const result = await response.json();

            if (result.success) {
                if (result.outbid) {
                    feedback.innerHTML = `<span style="color:#f59e0b;"><i class="fas fa-exclamation-triangle"></i> ${result.message}</span>`;
                } else {
                    feedback.innerHTML = `<span style="color:#10B981;"><i class="fas fa-check-circle"></i> ${result.message}</span>`;
                }
                showToast(result.message, 'success');
                // Reload bid history
                loadBidHistory(productId);
            } else {
                feedback.innerHTML = `<span style="color:#ef4444;"><i class="fas fa-times-circle"></i> ${result.error}</span>`;
                showToast(result.error, 'error');
            }
        } catch (error) {
            console.error('Bid Error:', error);
            feedback.innerHTML = `<span style="color:#ef4444;">Network error. Please try again.</span>`;
        }

        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-gavel"></i> Place Bid';
    });
}

/**
 * LOAD BID HISTORY: Displays recent bids for a product
 */
async function loadBidHistory(productId) {
    const container = document.getElementById('recentBidsList');
    if (!container) return;

    try {
        const snap = await firebase.database().ref(`bids/${productId}`).orderByChild('timestamp').limitToLast(5).once('value');
        const data = snap.val();

        if (!data) {
            container.innerHTML = '<em style="color:#94a3b8; font-size:0.85rem;">No bids yet. Be the first!</em>';
            return;
        }

        const bids = Object.values(data).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        container.innerHTML = bids.map((bid, i) => {
            const maskedId = (bid.bidderId || 'unknown').slice(0, 4) + '****';
            const isTop = i === 0;
            return `<div class="bidder-row ${isTop ? 'winner' : ''}">
                <span>${isTop ? '👑' : '•'} Bidder ${maskedId}</span>
                <span style="font-weight:700;">RS ${parseFloat(bid.amount).toLocaleString('en-PK')}</span>
            </div>`;
        }).join('');
    } catch (e) {
        container.innerHTML = '<em style="color:#94a3b8; font-size:0.85rem;">Could not load bid history.</em>';
    }
}
