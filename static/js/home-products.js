class HomeProductsManager {
    constructor() {
        this.productsContainer = document.getElementById('recs');
        this.products = [];
        this.allProducts = []; // Store original fetched products for filtering
    }

    async init() {
        if (!this.productsContainer) return;
        await this.loadRecommendedProducts();
        this.startTimerEngine();
        this.setupEventListeners();
    }

    setupEventListeners() {
        const applyBtn = document.getElementById('applyFilters');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.applyFilters());
        }

        // Also allow search on enter for location
        document.getElementById('locationFilter')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.applyFilters();
        });
    }

    async applyFilters() {
        const category = document.getElementById('categoryFilter').value;
        const location = document.getElementById('locationFilter').value.trim();
        const sort = document.getElementById('sortFilter').value;

        // Show loading state
        this.productsContainer.innerHTML = '<div class="loading-state" style="grid-column: 1/-1; text-align: center; padding: 40px;"><i class="fas fa-circle-notch fa-spin"></i> Applying filters...</div>';

        await this.loadRecommendedProducts({ category, location, sort });
    }

    async loadRecommendedProducts(filters = null) {
        try {
            const db = firebase.database();

            // Wait for AuthManager to initialize to ensure we have correct user state
            if (window.AuthManager && !window.AuthManager.isInitialized) {
                await window.AuthManager.waitForInit();
            }

            const currentUser = window.AuthManager ? window.AuthManager.getCurrentUser() : null;
            
            // 1. Fetch Platform Trends from AI Backend (only if not already filtered)
            let trends = { keywords: [], categories: [] };
            if (!filters) {
                try {
                    const trendRes = await fetch('/api/v1/analytics/trends');
                    const trendData = await trendRes.json();
                    if (trendData.success) trends = trendData.trends;
                } catch (e) { console.warn('AI trends unavailable', e); }
            }

            // 2. Fetch User Personal History (if logged in)
            let userHistory = [];
            if (currentUser && currentUser.uid) {
                const historySnap = await db.ref(`search_history/${currentUser.uid}`).limitToLast(10).once('value');
                const historyData = historySnap.val();
                if (historyData) userHistory = Object.values(historyData);
            }

            // 3. Fetch Products (if not already cached or if refreshing)
            if (this.allProducts.length === 0) {
                const productsRef = db.ref('products').orderByChild('isActive').equalTo(true);
                const snapshot = await productsRef.once('value');
                const data = snapshot.val();

                if (!data) {
                    this.renderEmptyState();
                    return;
                }
                this.allProducts = Object.entries(data).map(([id, p]) => ({ id, ...p }));
            }

            // 4. Filtering Engine
            let processed = this.allProducts.filter(p => p.isActive && p.status === 'active');

            if (filters) {
                if (filters.category) {
                    const catFilter = filters.category.toLowerCase();
                    processed = processed.filter(p => (p.category || '').toLowerCase() === catFilter);
                }
                if (filters.location) {
                    const loc = filters.location.toLowerCase();
                    processed = processed.filter(p => 
                        (p.location || '').toLowerCase().includes(loc) || 
                        (p.city || '').toLowerCase().includes(loc) ||
                        (p.sellerAddress || '').toLowerCase().includes(loc)
                    );
                }
            }

            // 5. Scoring Engine (AI Personalization)
            const scoredProducts = processed.map(p => {
                let score = 0;
                const pName = (p.name || '').toLowerCase();
                const pDesc = (p.description || '').toLowerCase();
                const pCat = p.category || '';

                // A. Personal History Match (High weight)
                userHistory.forEach(h => {
                    if (h.category && h.category === pCat) score += 50;
                    if (h.query && (pName.includes(h.query) || pDesc.includes(h.query))) score += 30;
                });

                // B. AI Platform Trends Match (Medium weight)
                trends.keywords.forEach(tk => {
                    if (pName.includes(tk.keyword) || pDesc.includes(tk.keyword)) score += 20;
                });
                trends.categories.forEach(tc => {
                    if (tc.category === pCat) score += 15;
                });

                // C. Organic Popularity
                const views = parseInt(p.views) || 0;
                score += views * 0.1;

                // D. Recency
                const createdTime = parseInt(p.createdAt) || 0;
                const ageInDays = createdTime > 0 ? (Date.now() - createdTime) / (1000 * 60 * 60 * 24) : 99;
                score += Math.max(0, 10 - ageInDays);

                return { ...p, _score: score };
            });

            // 6. Sorting Engine
            if (filters && filters.sort) {
                if (filters.sort === 'price-low') {
                    scoredProducts.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
                } else if (filters.sort === 'price-high') {
                    scoredProducts.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
                } else if (filters.sort === 'recent') {
                    scoredProducts.sort((a, b) => (parseInt(b.createdAt) || 0) - (parseInt(a.createdAt) || 0));
                } else if (filters.sort === 'rating') {
                    scoredProducts.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
                } else {
                    scoredProducts.sort((a, b) => b._score - a._score);
                }
            } else {
                scoredProducts.sort((a, b) => b._score - a._score);
            }

            this.products = scoredProducts.slice(0, 12); // Top 12 results
            this.renderProducts();

        } catch (error) {
            console.error('Error loading products:', error);
            this.productsContainer.innerHTML = '<p class="error-state">Failed to load smart recommendations.</p>';
        }
    }

    renderProducts() {
        if (this.products.length === 0) {
            this.renderEmptyState();
            return;
        }

        this.productsContainer.innerHTML = this.products.map(product => this.createProductCard(product)).join('');
    }

    createProductCard(product) {
        // Handle image extraction
        let image = '/static/images/mobile.jpg';
        if (product.images && product.images.length > 0) {
            const firstImage = product.images[0];
            if (typeof firstImage === 'string') {
                image = firstImage;
            } else if (firstImage && firstImage.url) {
                image = firstImage.url;
            }
        }

        // ─── AUCTION DETECTION ───
        const auction = product.auction || {};
        const isAuction = auction.enabled === true;

        if (isAuction) {
            return this.createAuctionCard(product, image, auction);
        } else {
            return this.createFixedCard(product, image);
        }
    }

    /**
     * FIXED PRICE CARD — Standard Blue Theme
     */
    createFixedCard(product, image) {
        const currentUser = window.AuthManager ? window.AuthManager.getCurrentUser() : null;
        const isSeller = currentUser && (currentUser.role || '').toLowerCase() === 'seller';
        const formattedPrice = this.formatPrice(product.price);
        
        return `
        <article class="card card-fixed" onclick="window.location.href='product-detail.html?id=${product.id}'">
          <div class="card-img">
            <img src="${image}" alt="${product.name}" loading="lazy" onerror="this.src='images/placeholder.jpg'">
          </div>
          <div class="card-content">
            <h3 class="card-title">${this.escapeHtml(product.name)}</h3>
            <p class="card-price">PKR ${formattedPrice}</p>
            ${!isSeller ? `
            <button class="btn primary" 
                data-id="${product.id}"
                onclick="event.stopPropagation(); window.location.href='product-detail.html?id=${product.id}'"
                style="width:100%;">
                Add to Cart
            </button>` : `
            <button class="btn secondary" 
                onclick="event.stopPropagation(); window.location.href='product-detail.html?id=${product.id}'"
                style="width:100%;">
                <i class="fas fa-eye"></i> View Details
            </button>`}
          </div>
        </article>
        `;
    }

    /**
     * AUCTION CARD — Indigo Elite Theme with LIVE badge & countdown
     */
    createAuctionCard(product, image, auction) {
        const currentUser = window.AuthManager ? window.AuthManager.getCurrentUser() : null;
        const isSeller = currentUser && (currentUser.role || '').toLowerCase() === 'seller';
        
        const currentBid = auction.currentHighestBid || auction.startingPrice || product.price || 0;
        const formattedBid = this.formatPrice(currentBid);

        // Calculate end time
        const auctionStartStr = auction.updatedAt || product.updatedAt || product.createdAt;
        const auctionStart = auctionStartStr ? new Date(auctionStartStr).getTime() : Date.now();
        const durationMs = (auction.duration || 7) * 24 * 60 * 60 * 1000;
        const auctionEndTime = auctionStart + durationMs;
        const isEnded = Date.now() >= auctionEndTime;

        return `
        <article class="card card-auction ${isEnded ? 'auction-ended-card' : ''}" onclick="window.location.href='product-detail.html?id=${product.id}'">
          <div class="card-img">
            <img src="${image}" alt="${product.name}" loading="lazy" onerror="this.src='images/placeholder.jpg'">
            <!-- LIVE Ribbon -->
            <div class="auction-ribbon-wrapper">
              <div class="auction-ribbon ${isEnded ? 'auction-ended-ribbon' : ''}">${isEnded ? 'ENDED' : '🔥 LIVE'}</div>
            </div>
            <!-- Countdown -->
            <div class="countdown-bar" data-auction-end="${auctionEndTime}">
              <i class="fas fa-clock"></i> ${isEnded ? 'AUCTION ENDED' : '...'}
            </div>
          </div>
          <div class="card-content">
            <h3 class="card-title">${this.escapeHtml(product.name)}</h3>
            <p class="card-price auction-price-label" style="display:flex; flex-direction:column; gap:0;">
              <span style="font-size:0.65rem; color:#64748b; text-transform:uppercase; font-weight:700;">Current Bid</span>
              PKR ${formattedBid}
            </p>
            ${!isSeller ? `
            <button class="btn primary auction-btn btn-pulse" 
                data-id="${product.id}"
                onclick="event.stopPropagation(); window.location.href='product-detail.html?id=${product.id}'"
                style="width:100%;"
                ${isEnded ? 'disabled style="width:100%; opacity:0.5;"' : ''}>
                <i class="fas fa-gavel"></i> ${isEnded ? 'Ended' : 'Place Bid'}
            </button>` : `
            <button class="btn secondary" 
                onclick="event.stopPropagation(); window.location.href='product-detail.html?id=${product.id}'"
                style="width:100%;">
                <i class="fas fa-eye"></i> View Details
            </button>`}
          </div>
        </article>
        `;
    }

    renderEmptyState() {
        this.productsContainer.innerHTML = `
            <div class="no-results" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                <i class="fas fa-search-minus" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 15px; display: block;"></i>
                <p style="color: #64748b; font-weight: 500;">No products match your filters. Try adjusting your selection.</p>
                <button class="btn secondary" onclick="location.reload()" style="margin-top: 15px;">Clear All Filters</button>
            </div>
        `;
    }

    escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    formatPrice(price) {
        return new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
    }

    /**
     * GLOBAL TIMER ENGINE for homepage cards
     */
    startTimerEngine() {
        setInterval(() => {
            document.querySelectorAll('[data-auction-end]').forEach(el => {
                const endTime = parseInt(el.dataset.auctionEnd);
                const diff = endTime - Date.now();

                if (diff <= 0) {
                    el.innerHTML = '<i class="fas fa-flag-checkered"></i> AUCTION ENDED';
                    el.classList.add('timer-ended');
                    return;
                }

                const hours = Math.floor(diff / 3600000);
                const minutes = Math.floor((diff % 3600000) / 60000);
                const seconds = Math.floor((diff % 60000) / 1000);

                let timeStr;
                if (hours > 24) {
                    const days = Math.floor(hours / 24);
                    timeStr = `${days}d ${hours % 24}h ${minutes}m`;
                } else {
                    timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                }

                el.innerHTML = `<i class="fas fa-clock"></i> ${timeStr}`;

                if (diff < 3600000) {
                    el.classList.add('timer-urgent');
                }
            });
        }, 1000);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.homeProductsManager = new HomeProductsManager();
    window.homeProductsManager.init();
});
