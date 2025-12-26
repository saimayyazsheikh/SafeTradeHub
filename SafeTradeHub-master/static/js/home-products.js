// ========================================
// HOME-PRODUCTS.JS - Fetch & Display Recommended Products
// ========================================

class HomeProductsManager {
    constructor() {
        this.productsContainer = document.getElementById('recs');
        this.products = [];
    }

    async init() {
        if (!this.productsContainer) return;
        await this.loadRecommendedProducts();
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

                // Convert object to array and reverse to show newest first
                this.products = Object.entries(data).map(([id, product]) => ({
                    id,
                    ...product
                })).reverse();

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

        // Re-attach event listeners for "Add to Cart" buttons if needed
        // Assuming cart.js handles this via delegation or we need to trigger it
    }

    createProductCard(product) {
        // Handle image extraction (support both string URLs and object structure)
        let image = 'images/placeholder.jpg';

        if (product.images && product.images.length > 0) {
            const firstImage = product.images[0];
            if (typeof firstImage === 'string') {
                image = firstImage;
            } else if (firstImage && firstImage.url) {
                image = firstImage.url;
            }
        }

        const isAuction = product.listingType === 'auction';
        const priceLabel = isAuction ? 'Current Bid' : 'PKR';
        const priceValue = isAuction ? (product.currentBid || product.startingBid || 0) : product.price;
        const formattedPrice = this.formatPrice(priceValue);
        const buttonText = isAuction ? 'Place Bid' : 'Add to Cart';
        const buttonClass = isAuction ? 'btn primary auction-btn' : 'btn primary';

        return `
        <article class="card" onclick="window.location.href='product-detail.html?id=${product.id}'">
          <div class="card-img">
            <img src="${image}" alt="${product.name}" loading="lazy" onerror="this.src='images/placeholder.jpg'">
            ${isAuction ? '<span class="card-badge" style="background: #ef4444; color: white;">Auction</span>' : ''}
          </div>
          <div class="card-content">
            <h3 class="card-title">${this.escapeHtml(product.name)}</h3>
            <p class="card-price">${priceLabel} ${formattedPrice}</p>
            <button class="${buttonClass}" 
                data-id="${product.id}"
                onclick="event.stopPropagation(); window.location.href='product-detail.html?id=${product.id}'"
                style="width:100%;">
                ${buttonText}
            </button>
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
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.homeProductsManager = new HomeProductsManager();
    window.homeProductsManager.init();
});
