/**
 * Product Search Manager
 * Handles product search, filtering, and sorting functionality
 */

class ProductSearchManager {
    constructor() {
        this.allProducts = [];
        this.filteredProducts = [];
        this.isSearchActive = false;
        this.originalSectionTitle = 'Recommended Products & Services';

        this.init();
    }

    /**
     * Initialize the search manager
     */
    async init() {
        console.log('🔍 ProductSearchManager: Initializing...');

        // Wait for Firebase to be ready
        await this.waitForFirebase();

        // Fetch all products from Firebase
        await this.fetchAllProducts();

        // Set up event listeners
        this.setupEventListeners();

        console.log('✅ ProductSearchManager: Ready');
    }

    /**
     * Wait for Firebase to be initialized
     */
    async waitForFirebase() {
        let attempts = 0;
        while (!window.firebase && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (!window.firebase) {
            console.error('❌ Firebase not available');
            throw new Error('Firebase not initialized');
        }
    }

    /**
     * Fetch all products from Firebase Realtime Database
     */
    async fetchAllProducts() {
        try {
            const database = firebase.database();
            const productsRef = database.ref('products');

            const snapshot = await productsRef.once('value');
            const productsData = snapshot.val();

            if (productsData) {
                this.allProducts = Object.keys(productsData).map(key => ({
                    id: key,
                    ...productsData[key]
                }));

                console.log(`📦 Loaded ${this.allProducts.length} products from Firebase`);
            } else {
                console.log('📦 No products found in Firebase');
                this.allProducts = [];
            }
        } catch (error) {
            console.error('❌ Error fetching products:', error);
            this.allProducts = [];
        }
    }

    /**
     * Set up event listeners for search and filter controls
     */
    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        const applyFiltersBtn = document.getElementById('applyFilters');
        const categoryFilter = document.getElementById('categoryFilter');
        const locationFilter = document.getElementById('locationFilter');
        const sortFilter = document.getElementById('sortFilter');

        // Search button click
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.performSearch());
        }

        // Apply filters button click
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', () => this.performSearch());
        }

        // Enter key in search input
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.performSearch();
                }
            });
        }

        // Enter key in location filter
        if (locationFilter) {
            locationFilter.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.performSearch();
                }
            });
        }

        // Change events for filters
        if (categoryFilter) {
            categoryFilter.addEventListener('change', () => this.performSearch());
        }

        if (sortFilter) {
            sortFilter.addEventListener('change', () => {
                if (this.isSearchActive) {
                    this.performSearch();
                }
            });
        }
    }

    /**
     * Perform search with current filter values
     */
    async performSearch() {
        const searchQuery = document.getElementById('searchInput')?.value.trim().toLowerCase() || '';
        const category = document.getElementById('categoryFilter')?.value || '';
        const location = document.getElementById('locationFilter')?.value.trim().toLowerCase() || '';
        const sortBy = document.getElementById('sortFilter')?.value || 'recent';

        console.log('🔍 Searching with:', { searchQuery, category, location, sortBy });

        // Start with all products
        let results = [...this.allProducts];

        // Apply keyword search
        if (searchQuery) {
            results = results.filter(product => {
                const name = (product.name || '').toLowerCase();
                const description = (product.description || '').toLowerCase();
                const productCategory = (product.category || '').toLowerCase();

                return name.includes(searchQuery) ||
                    description.includes(searchQuery) ||
                    productCategory.includes(searchQuery);
            });
        }

        // Apply category filter
        if (category) {
            results = results.filter(product => {
                const productCategory = product.category || '';
                return productCategory === category;
            });
        }

        // Apply location filter
        if (location) {
            results = results.filter(product => {
                const productLocation = (product.location || '').toLowerCase();
                return productLocation.includes(location);
            });
        }

        // Apply sorting
        results = this.sortProducts(results, sortBy);

        // Store filtered results
        this.filteredProducts = results;
        this.isSearchActive = true;

        // Display results
        this.displayResults(results, { searchQuery, category, location, sortBy });
    }

    /**
     * Sort products based on selected criteria
     */
    sortProducts(products, sortBy) {
        const sorted = [...products];

        switch (sortBy) {
            case 'price-low':
                sorted.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
                break;

            case 'price-high':
                sorted.sort((a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0));
                break;

            case 'rating':
                sorted.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
                break;

            case 'recent':
            default:
                sorted.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                break;
        }

        return sorted;
    }

    /**
     * Display search results
     */
    displayResults(products, filters) {
        const recsContainer = document.getElementById('recs');
        const recsHeader = document.querySelector('.recs-header h2');

        if (!recsContainer) {
            console.error('❌ Results container not found');
            return;
        }

        // Update section title
        if (recsHeader) {
            const count = products.length;
            recsHeader.innerHTML = `Search Results <span class="results-count">(${count} ${count === 1 ? 'item' : 'items'} found)</span>`;

            // Add clear filters button if not exists
            if (!document.querySelector('.clear-filters-btn')) {
                const clearBtn = document.createElement('button');
                clearBtn.className = 'clear-filters-btn';
                clearBtn.textContent = 'Clear Filters';
                clearBtn.onclick = () => this.clearFilters();
                recsHeader.parentElement.appendChild(clearBtn);
            }
        }

        // Clear existing content
        recsContainer.innerHTML = '';

        // Display results or no results message
        if (products.length === 0) {
            this.showNoResults(recsContainer);
        } else {
            products.forEach(product => {
                const card = this.createProductCard(product);
                recsContainer.appendChild(card);
            });
        }

        // Scroll to results
        recsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /**
     * Create a product card element
     */
    createProductCard(product) {
        const article = document.createElement('article');
        article.className = 'card';

        // Get main image with proper Firebase structure handling
        let imageUrl = 'images/placeholder.jpg';
        if (product.images && product.images.length > 0) {
            // Images are stored as objects with {url, isMain} properties
            const mainImg = product.images.find(img => img.isMain) || product.images[0];
            imageUrl = mainImg.url || mainImg; // Handle both object and string formats
        }

        const isAuction = product.listingType === 'auction';
        const priceLabel = isAuction ? 'Current Bid' : 'Rs';
        const priceValue = isAuction ? (product.currentBid || product.startingBid || 0) : product.price;
        const priceDisplay = `${priceLabel} ${parseFloat(priceValue).toLocaleString()}`;

        const rating = product.rating ? `⭐ ${product.rating}` : '';
        const location = product.location ? `📍 ${product.location}` : '';

        const actionBtn = isAuction
            ? `<button class="card-btn card-btn-primary" onclick="window.location.href='product-detail.html?id=${product.id}'" style="width: 100%;">Place Bid</button>`
            : `<button class="card-btn card-btn-secondary" data-add-to-cart data-id="${product.id}" data-name="${product.name}" data-price="${product.price}" data-img="${imageUrl}">Add to Cart</button>`;

        article.innerHTML = `
      <div class="card-img">
        <img src="${imageUrl}" alt="${product.name || 'Product'}" loading="lazy" onerror="this.src='images/placeholder.jpg'">
        ${isAuction ? '<span class="card-badge" style="background: #ef4444; color: white;">Auction</span>' : ''}
      </div>
      <div class="card-content">
        <h3 class="card-title">${product.name || 'Untitled Product'}</h3>
        ${product.description ? `<p class="card-description">${product.description}</p>` : ''}
        <p class="card-price">${priceDisplay}</p>
        ${rating || location ? `<p style="font-size: 0.85rem; color: var(--muted); margin: 0 0 12px;">${rating} ${location}</p>` : ''}
        <div class="card-actions">
          <button class="card-btn card-btn-primary" onclick="window.location.href='product-detail.html?id=${product.id}'">
            View Details
          </button>
          ${actionBtn}
        </div>
      </div>
    `;

        // Add cart functionality (only for fixed price items with data-add-to-cart)
        const addToCartBtn = article.querySelector('[data-add-to-cart]');
        if (addToCartBtn && typeof window.addToCart === 'function') {
            addToCartBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.addToCart(product.id, product.name, product.price, imageUrl);
            });
        }

        return article;
    }

    /**
     * Show no results message
     */
    showNoResults(container) {
        container.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <h3>No Products Found</h3>
        <p>Try adjusting your search or filters to find what you're looking for.</p>
      </div>
    `;
    }

    /**
     * Clear all filters and show all products
     */
    clearFilters() {
        // Reset form inputs
        const searchInput = document.getElementById('searchInput');
        const categoryFilter = document.getElementById('categoryFilter');
        const locationFilter = document.getElementById('locationFilter');
        const sortFilter = document.getElementById('sortFilter');

        if (searchInput) searchInput.value = '';
        if (categoryFilter) categoryFilter.value = '';
        if (locationFilter) locationFilter.value = '';
        if (sortFilter) sortFilter.value = 'recent';

        // Reset state
        this.isSearchActive = false;

        // Restore original section title
        const recsHeader = document.querySelector('.recs-header h2');
        if (recsHeader) {
            recsHeader.textContent = this.originalSectionTitle;
        }

        // Remove clear filters button
        const clearBtn = document.querySelector('.clear-filters-btn');
        if (clearBtn) {
            clearBtn.remove();
        }

        // Reload original products (you might want to restore the original content instead)
        // For now, we'll just show all products
        this.displayResults(this.allProducts, {});
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for other scripts to load
    setTimeout(() => {
        window.ProductSearchManager = new ProductSearchManager();
    }, 500);
});
