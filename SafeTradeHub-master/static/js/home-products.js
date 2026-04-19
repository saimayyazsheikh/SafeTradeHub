// ========================================
// HOME-PRODUCTS.JS - Fetch & Display Recommended Products
// AUCTION RECONSTRUCTION - Elite Visual Architecture
// ========================================

class HomeProductsManager {
    constructor() {
        this.productsContainer = document.getElementById('recs');
        this.products = [];
    }

    async init() {
        if (!this.productsContainer) return;
        await this.loadRecommendedProducts();
        this.startTimerEngine();
    }

    async loadRecommendedProducts() {
        try {
            const db = firebase.database();
            const productsRef = db.ref('products').orderByChild('createdAt').limitToLast(12);

            productsRef.once('value', (snapshot) => {
                const data = snapshot.val();
                if (!data) {
                    this.renderEmptyState();
                    return;
                }

                // Convert object to array, filter for active products, and reverse to show newest first
                this.products = Object.entries(data)
                    .map(([id, product]) => ({ id, ...product }))
                    .filter(p => p.isActive && p.status === 'active')
                    .reverse();

                this.renderProducts();
            });

        } catch (error) {
            console.error('Error loading products:', error);
            this.productsContainer.innerHTML = '<p class="error-state">Failed to load products. Please try again later.</p>';
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
                View Details
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
                View Details
            </button>`}
          </div>
        </article>
        `;
    }

    renderEmptyState() {
        this.productsContainer.innerHTML = `
            <div class="no-results" style="grid-column: 1 / -1;">
                <p>No products found.</p>
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
        return new Intl.NumberFormat('en-PK').format(price);
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
