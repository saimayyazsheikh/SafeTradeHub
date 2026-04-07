// ========================================
// APP-STATE.JS - Central state management for SafeTradeHub
// ========================================

// Constants - Using same keys as existing cart.js
const STORAGE_KEYS = {
    CART: 'sthub_cart',
    ORDERS: 'sthub_orders',
    ESCROWS: 'sthub_escrows',
    DISPUTES: 'sthub_disputes',
    USER_PREFS: 'sthub_user_prefs',
    NOTIFICATIONS: 'sthub_notifications'
};

// Global State Management
window.SafeTradeHub = {
    // Initialize application
    init: function () {
        this.updateCartCount();
        this.initializeNotifications();
        this.loadUserPreferences();

        // Debug info
        console.log('SafeTradeHub initialized');
        console.log('Cart items:', this.cart.get().length);
        console.log('Storage keys:', STORAGE_KEYS);
    },

    // Cart Management
    cart: {
        get: function () {
            try {
                const arr = JSON.parse(localStorage.getItem(STORAGE_KEYS.CART) || '[]');
                if (!Array.isArray(arr)) return [];

                // Normalize cart items to ensure consistent format (same as cart.html)
                return arr.map(i => ({
                    id: i.id,
                    title: i.title || i.name || 'Item',
                    name: i.title || i.name || 'Item', // Keep both for compatibility
                    price: Number(i.price) || 0,
                    shippingCost: Number(i.shippingCost) || 0,
                    img: i.img || '',
                    qty: Number(i.qty) || 1,
                    desc: i.desc || i.description || ''
                }));
            } catch (error) {
                console.error('Error reading cart:', error);
                return [];
            }
        },

        set: function (cartItems) {
            try {
                localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cartItems));
                window.SafeTradeHub.updateCartCount();
                return true;
            } catch (error) {
                console.error('Error saving cart:', error);
                return false;
            }
        },

        add: function (product) {
            // Check if user is authenticated before adding to cart
            if (!this.isUserLoggedIn()) {
                this.showLoginPrompt();
                return false;
            }

            const cart = this.get();
            const existingItemIndex = cart.findIndex(item => item.id === product.id);

            if (existingItemIndex > -1) {
                cart[existingItemIndex].qty = (cart[existingItemIndex].qty || 1) + 1;
                window.SafeTradeHub.showNotification(`Updated ${product.title || product.name} quantity in cart!`, 'info');
            } else {
                const cartItem = {
                    id: product.id,
                    title: product.title || product.name,
                    name: product.title || product.name, // Fallback
                    price: Number(product.price) || 0,
                    shippingCost: Number(product.shippingCost) || 0,
                    img: product.img || product.image || '',
                    qty: 1,
                    desc: product.desc || product.description || '',
                    addedAt: new Date().toISOString()
                };
                cart.push(cartItem);
                window.SafeTradeHub.showNotification(`${cartItem.title} added to cart!`, 'success');
            }

            return this.set(cart);
        },

        remove: function (productId) {
            const cart = this.get();
            const filteredCart = cart.filter(item => item.id !== productId);
            return this.set(filteredCart);
        },

        updateQuantity: function (productId, quantity) {
            const cart = this.get();
            const itemIndex = cart.findIndex(item => item.id === productId);

            if (itemIndex > -1) {
                if (quantity <= 0) {
                    return this.remove(productId);
                } else {
                    cart[itemIndex].qty = quantity;
                    return this.set(cart);
                }
            }
            return false;
        },

        clear: function () {
            return this.set([]);
        },

        getTotal: function () {
            const cart = this.get();
            return cart.reduce((total, item) => total + (item.price * item.qty), 0);
        },

        getItemCount: function () {
            const cart = this.get();
            return cart.reduce((count, item) => count + item.qty, 0);
        }
    },

    // Order Management
    orders: {
        get: function () {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS) || '[]');
            } catch (error) {
                console.error('Error reading orders:', error);
                return [];
            }
        },

        create: function (orderData) {
            const orders = this.get();
            const newOrder = {
                id: 'ORD-' + Date.now(),
                ...orderData,
                status: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            orders.push(newOrder);
            localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));

            // Clear cart after order creation
            window.SafeTradeHub.cart.clear();

            return newOrder;
        },

        updateStatus: function (orderId, newStatus) {
            const orders = this.get();
            const orderIndex = orders.findIndex(order => order.id === orderId);

            if (orderIndex > -1) {
                orders[orderIndex].status = newStatus;
                orders[orderIndex].updatedAt = new Date().toISOString();
                localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));

                window.SafeTradeHub.showNotification(`Order ${orderId} updated to ${newStatus}`, 'info');
                return orders[orderIndex];
            }
            return null;
        }
    },

    // Escrow Management
    escrows: {
        get: function () {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEYS.ESCROWS) || '[]');
            } catch (error) {
                console.error('Error reading escrows:', error);
                return [];
            }
        },

        create: function (orderId, amount) {
            const escrows = this.get();
            const newEscrow = {
                id: 'ESC-' + Date.now(),
                orderId: orderId,
                amount: amount,
                status: 'holding',
                timeline: [
                    {
                        event: 'Escrow Created',
                        timestamp: new Date().toISOString(),
                        description: 'Funds secured in escrow'
                    }
                ],
                createdAt: new Date().toISOString()
            };

            escrows.push(newEscrow);
            localStorage.setItem(STORAGE_KEYS.ESCROWS, JSON.stringify(escrows));

            return newEscrow;
        },

        updateStatus: function (escrowId, newStatus, description) {
            const escrows = this.get();
            const escrowIndex = escrows.findIndex(escrow => escrow.id === escrowId);

            if (escrowIndex > -1) {
                escrows[escrowIndex].status = newStatus;
                escrows[escrowIndex].timeline.push({
                    event: newStatus.charAt(0).toUpperCase() + newStatus.slice(1),
                    timestamp: new Date().toISOString(),
                    description: description || `Escrow status changed to ${newStatus}`
                });

                localStorage.setItem(STORAGE_KEYS.ESCROWS, JSON.stringify(escrows));
                return escrows[escrowIndex];
            }
            return null;
        }
    },

    // Notification System
    showNotification: function (message, type = 'info') {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => notification.remove());

        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;

        // Add to page
        document.body.appendChild(notification);

        // Show notification
        setTimeout(() => notification.classList.add('show'), 100);

        // Auto-hide after 5 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 5000);

        // Store notification for history
        this.storeNotification(message, type);
    },

    storeNotification: function (message, type) {
        try {
            const notifications = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS) || '[]');
            notifications.unshift({
                id: Date.now(),
                message: message,
                type: type,
                timestamp: new Date().toISOString(),
                read: false
            });

            // Keep only last 50 notifications
            if (notifications.length > 50) {
                notifications.splice(50);
            }

            localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
        } catch (error) {
            console.error('Error storing notification:', error);
        }
    },

    initializeNotifications: function () {
        // Show welcome notification for new users
        if (!localStorage.getItem('welcomeShown')) {
            setTimeout(() => {
                this.showNotification('Welcome to SafeTradeHub! 🎉 Your secure marketplace with escrow protection.', 'success');
                localStorage.setItem('welcomeShown', 'true');
            }, 2000);
        }
    },

    // Authentication helper functions
    isUserLoggedIn: function () {
        // Check Firebase auth state first
        if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
            return true;
        }

        // Check localStorage for auth token as fallback
        const authToken = localStorage.getItem('authToken');
        const userData = localStorage.getItem('userData');

        return !!(authToken && userData);
    },

    showLoginPrompt: function () {
        const shouldRedirect = confirm('Please sign in to add items to your cart. Would you like to go to the login page?');
        if (shouldRedirect) {
            window.location.href = 'auth.html?mode=signin';
        }
    },

    // Update cart count in UI
    updateCartCount: function () {
        const cartCount = this.cart.getItemCount();
        const cartElements = document.querySelectorAll('#cartCount, .cart-count');
        cartElements.forEach(element => {
            element.textContent = cartCount;
            element.style.display = cartCount > 0 ? 'block' : 'none';
        });
    },

    // Search functionality removed
    search: function (query) {
        console.warn('Search functionality has been disabled.');
    },

    // User preferences
    loadUserPreferences: function () {
        try {
            const prefs = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER_PREFS) || '{}');
            this.userPrefs = {
                theme: prefs.theme || 'light',
                notifications: prefs.notifications !== false,
                language: prefs.language || 'en',
                currency: prefs.currency || 'USD'
            };
        } catch (error) {
            console.error('Error loading user preferences:', error);
            this.userPrefs = {
                theme: 'light',
                notifications: true,
                language: 'en',
                currency: 'USD'
            };
        }
    },

    saveUserPreferences: function () {
        try {
            localStorage.setItem(STORAGE_KEYS.USER_PREFS, JSON.stringify(this.userPrefs));
        } catch (error) {
            console.error('Error saving user preferences:', error);
        }
    },

    // Utility functions
    formatPrice: function (price) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: this.userPrefs?.currency || 'USD'
        }).format(price);
    },

    formatDate: function (dateString) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // Debug functions
    clearAllData: function () {
        Object.values(STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
        localStorage.removeItem('welcomeShown');
        localStorage.removeItem('searchQuery');
        this.showNotification('All data cleared!', 'info');
        location.reload();
    },

    exportData: function () {
        const data = {};
        Object.entries(STORAGE_KEYS).forEach(([key, storageKey]) => {
            data[key] = localStorage.getItem(storageKey);
        });
        console.log('SafeTradeHub Data Export:', data);
        return data;
    }
};

// Legacy compatibility functions
function addToCart(id, name, price, image, description) {
    return window.SafeTradeHub.cart.add({
        id: id,
        title: name,
        name: name,
        price: price,
        img: image,
        description: description
    });
}

function showNotification(message, type) {
    return window.SafeTradeHub.showNotification(message, type);
}

function performSearch(query) {
    console.warn('Search is disabled');
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.SafeTradeHub.init());
} else {
    window.SafeTradeHub.init();
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.SafeTradeHub;
}
