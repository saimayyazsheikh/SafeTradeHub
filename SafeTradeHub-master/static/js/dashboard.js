// Dashboard Logic

// --- STATUS HELPERS (Synced across ecosystem) ---
function formatOrderStatus(status) {
    const mapping = {
        'pending': 'Order Placed',
        'received_at_seller_hub': 'Received at Origin Hub',
        'sent_to_hub': 'Received at Origin Hub',
        'verified': 'Verified & Sealed',
        'in_transit': 'In Transit',
        'arrived_at_dest_hub': 'At Destination Hub',
        'out_for_delivery': 'Out for Delivery',
        'delivered': 'Delivered',
        'cancelled': 'Cancelled',
        'disputed': 'Disputed'
    };
    return mapping[status] || (status ? status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Pending');
}

document.addEventListener('DOMContentLoaded', async () => {
    // Check Auth
    const auth = firebase.auth();
    const db = firebase.database();

    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = 'auth.html?mode=signin';
            return;
        }

        // Load User Data
        try {
            const snapshot = await db.ref('users/' + user.uid).once('value');
            const userData = snapshot.val();

            if (!userData) {
                console.error('User data not found');
                return;
            }

            // Initialize Dashboard
            updateUserProfile(userData);

            if (userData.role === 'Seller') {
                document.getElementById('navProducts').style.display = 'flex';
                renderSellerDashboard(user.uid, userData);

            } else {
                renderBuyerDashboard(user.uid, userData);
            }

        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    });
});



function updateUserProfile(user) {
    document.getElementById('userName').textContent = user.displayName || user.fullName || 'User';
    document.getElementById('userRole').textContent = user.role || 'Buyer';

    const avatar = document.getElementById('userAvatar');
    if (user.profilePic || user.profile?.avatar) {
        avatar.src = user.profilePic || user.profile?.avatar;
    } else {
        avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'User')}&background=random`;
    }
}

async function renderSellerDashboard(uid, userData) {
    const contentArea = document.getElementById('dashboardContent');
    const db = firebase.database();

    // Fetch Stats
    // Fetch all products and filter client-side to ensure accuracy (avoids indexing issues)
    const productsSnap = await db.ref('products').once('value');
    const products = [];
    productsSnap.forEach(child => {
        const p = child.val();
        if (p.sellerId === uid) {
            products.push(p);
        }
    });

    // Fetch Orders for Seller
    let orders = [];
    try {
        // Try querying by sellerId first (if indexed)
        const ordersSnap = await db.ref('orders').orderByChild('sellerId').equalTo(uid).once('value');
        if (ordersSnap.exists()) {
            ordersSnap.forEach(child => {
                orders.push({ id: child.key, ...child.val() });
            });
        } else {
            // Fallback: Fetch all if query returns nothing (careful with permissions)
            // Note: This fallback might fail if rules deny root access, which is expected.
            // We'll just catch the error and show 0 orders.
        }
    } catch (error) {
        console.warn('Error fetching orders:', error);
        // If query fails, we might try fetching all and filtering, but that requires root read access.
        // For now, we'll assume 0 orders to prevent dashboard from sticking.
    }

    // Calculate Stats
    const totalProducts = products.length;
    const activeProducts = products.filter(p => p.isActive !== false).length;
    const totalSales = orders.length;
    const walletBalance = userData.wallet?.balance || 0;

    contentArea.innerHTML = `
        <!-- Stats Grid -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon blue"><i class="fas fa-box"></i></div>
                <div class="stat-info">
                    <h3 id="totalProducts">${totalProducts}</h3>
                    <p>Total Products</p>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon green"><i class="fas fa-check-circle"></i></div>
                <div class="stat-info">
                    <h3 id="activeListings">${activeProducts}</h3>
                    <p>Active Listings</p>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon purple"><i class="fas fa-shopping-bag"></i></div>
                <div class="stat-info">
                    <h3 id="totalSales">${totalSales}</h3>
                    <p>Total Sales</p>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon orange"><i class="fas fa-wallet"></i></div>
                <div class="stat-info">
                    <h3 id="walletBalance">RS ${walletBalance}</h3>
                    <p>Wallet Balance</p>
                </div>
            </div>
        </div>

        <!-- Content Grid -->
        <div class="content-grid">
            <!-- Recent Products -->
            <div class="dashboard-card">
                <div class="card-header">
                    <h3>Recent Products</h3>
                    <a href="product-management.html" class="btn-link">View All</a>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="dashboard-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Price</th>
                                    <th>Status</th>
                                    <th>Views</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${products.slice(0, 5).map(p => `
                                    <tr>
                                        <td>${p.name || p.title}</td>
                                        <td>RS ${p.price}</td>
                                        <td><span class="status-badge ${p.isActive !== false ? 'completed' : 'pending'}">${p.isActive !== false ? 'Active' : 'Inactive'}</span></td>
                                        <td>${p.views || 0}</td>
                                    </tr>
                                `).join('') || '<tr><td colspan="4">No products found</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Quick Actions -->
            <div class="dashboard-card">
                <div class="card-header">
                    <h3>Quick Actions</h3>
                </div>
                <div class="card-body">
                    <div class="quick-actions-grid">
                        <a href="product-upload.html" class="action-btn">
                            <i class="fas fa-plus-circle"></i>
                            <span>Add Product</span>
                        </a>
                        <a href="orders.html" class="action-btn">
                            <i class="fas fa-box-open"></i>
                            <span>Orders</span>
                        </a>
                        <a href="wallet.html" class="action-btn">
                            <i class="fas fa-money-bill-wave"></i>
                            <span>Withdraw</span>
                        </a>
                        <a href="seller-profile.html?id=${uid}" class="action-btn">
                            <i class="fas fa-store"></i>
                            <span>View Shop</span>
                        </a>
                    </div>
                </div>
            </div>

            <!-- Recent Orders -->
            <div class="dashboard-card">
                <div class="card-header">
                    <h3>Recent Orders</h3>
                    <a href="orders.html" class="btn-link">View All</a>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="dashboard-table">
                            <thead>
                                <tr>
                                    <th>Order ID</th>
                                    <th>Customer</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${orders.slice(0, 5).map(o => `
                                    <tr>
                                        <td>#${o.id.substring(1, 6)}</td>
                                        <td>${o.shippingAddress?.fullName || 'Customer'}</td>
                                        <td>RS ${o.total}</td>
                                        <td><span class="status-badge ${o.status === 'completed' || o.status === 'delivered' ? 'completed' : 'pending'}">${formatOrderStatus(o.status)}</span></td>
                                    </tr>
                                `).join('') || '<tr><td colspan="4">No orders found</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function renderBuyerDashboard(uid, userData) {
    const contentArea = document.getElementById('dashboardContent');
    const db = firebase.database();

    // Fetch Orders
    let orders = [];
    try {
        // Fetch all orders and filter client-side for flexibility
        // (Indices might be missing for direct query)
        const ordersSnap = await db.ref('orders').once('value');
        ordersSnap.forEach(child => {
            const order = { id: child.key, ...child.val() };
            // Check if this order belongs to the buyer
            if (order.buyerId === uid || (order.buyer && order.buyer.id === uid)) {
                orders.push(order);
            }
        });

        // Sort by date desc
        orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
        console.error('Error fetching buyer orders:', error);
    }

    // Calculate Stats
    const walletBalance = userData.wallet?.balance || 0;
    const totalOrders = orders.length;
    
    // Pending includes all logistics states before delivery
    const pendingOrders = orders.filter(o => {
        const s = (o.status || '').toLowerCase();
        return !['delivered', 'completed', 'cancelled', 'disputed'].includes(s);
    }).length;
    // Wishlist not implemented yet, defaulting to 0

    contentArea.innerHTML = `
        <!-- Stats Grid -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon blue"><i class="fas fa-shopping-cart"></i></div>
                <div class="stat-info">
                    <h3 id="totalOrders">${totalOrders}</h3>
                    <p>Total Orders</p>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon orange"><i class="fas fa-clock"></i></div>
                <div class="stat-info">
                    <h3 id="pendingOrders">${pendingOrders}</h3>
                    <p>Pending Orders</p>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon green"><i class="fas fa-wallet"></i></div>
                <div class="stat-info">
                    <h3 id="walletBalance">RS ${walletBalance}</h3>
                    <p>Wallet Balance</p>
                </div>
            </div>
             <div class="stat-card">
                <div class="stat-icon purple"><i class="fas fa-heart"></i></div>
                <div class="stat-info">
                    <h3>0</h3>
                    <p>Wishlist</p>
                </div>
            </div>
        </div>

        <!-- Content Grid -->
        <div class="content-grid">
            <!-- Recent Orders -->
            <div class="dashboard-card">
                <div class="card-header">
                    <h3>Recent Orders</h3>
                    <a href="orders.html" class="btn-link">View All</a>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="dashboard-table">
                            <thead>
                                <tr>
                                    <th>Order ID</th>
                                    <th>Date</th>
                                    <th>Total</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${orders.slice(0, 5).map(o => `
                                    <tr>
                                        <td>#${o.id.substring(1, 6)}</td>
                                        <td>${new Date(o.createdAt).toLocaleDateString()}</td>
                                        <td>RS ${o.total}</td>
                                        <td><span class="status-badge ${o.status === 'completed' || o.status === 'delivered' ? 'completed' : 'pending'}">${formatOrderStatus(o.status)}</span></td>
                                    </tr>
                                `).join('') || '<tr><td colspan="4" style="text-align:center;">No recent orders</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Quick Actions -->
            <div class="dashboard-card">
                <div class="card-header">
                    <h3>Quick Actions</h3>
                </div>
                <div class="card-body">
                    <div class="quick-actions-grid">
                        <a href="index.html" class="action-btn">
                            <i class="fas fa-search"></i>
                            <span>Browse</span>
                        </a>
                        <a href="cart.html" class="action-btn">
                            <i class="fas fa-shopping-cart"></i>
                            <span>Cart</span>
                        </a>
                        <a href="wallet.html" class="action-btn">
                            <i class="fas fa-wallet"></i>
                            <span>Wallet</span>
                        </a>
                        <a href="profile.html" class="action-btn">
                            <i class="fas fa-user-cog"></i>
                            <span>Settings</span>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Logout Function
function logout() {
    firebase.auth().signOut().then(() => {
        window.location.href = 'index.html';
    });
}

/**
 * v2 Isolated Seller Insights
 */
document.addEventListener('DOMContentLoaded', () => {
    const navInsights = document.getElementById('navInsights');
    const mainView = document.getElementById('main-view');
    const insightsView = document.getElementById('insights-view');

    if (navInsights && mainView && insightsView) {
        navInsights.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Toggle visibility
            mainView.style.display = 'none';
            if (document.getElementById('disputes-view')) {
                document.getElementById('disputes-view').style.display = 'none';
            }
            insightsView.style.display = 'block';
            
            // Remove active from any other nav items
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            navInsights.classList.add('active');

            // Initialize Analytics
            const user = firebase.auth().currentUser;
            if (user) {
                initV2Insights(user.uid);
            }
        });
    }

    // --- Dispute View Logic (Seller) ---
    const navDisputes = document.getElementById('navDisputes');
    const disputesView = document.getElementById('disputes-view');

    if (navDisputes && mainView && disputesView) {
        navDisputes.addEventListener('click', (e) => {
            e.preventDefault();
            
            mainView.style.display = 'none';
            if (insightsView) insightsView.style.display = 'none';
            disputesView.style.display = 'block';
            
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            navDisputes.classList.add('active');

            // Load disputes data
            loadSellerDisputes();
        });
    }
});

async function loadSellerDisputes() {
    const tbody = document.getElementById('sellerDisputesTableBody');
    if (!tbody) return;

    const auth = firebase.auth();
    const db = firebase.database();
    
    auth.onAuthStateChanged(async (user) => {
        if (!user) return;

        try {
            db.ref('disputes').orderByChild('sellerId').equalTo(user.uid).on('value', (snap) => {
                const disputes = [];
                snap.forEach(c => {
                    disputes.push({ id: c.key, ...c.val() });
                });

                disputes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

                if (disputes.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 40px; color: #64748b;">No active disputes found.</td></tr>';
                    return;
                }

                tbody.innerHTML = disputes.map(d => `
                    <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.2s;">
                        <td style="padding: 16px 24px; font-weight: 600; color: #4f46e5;">#${d.id.slice(-6).toUpperCase()}</td>
                        <td style="padding: 16px 24px;">#${(d.orderId || '').slice(-6).toUpperCase()}</td>
                        <td style="padding: 16px 24px; color: #1e293b;">
                            <div style="font-weight: 600;">${d.issue || d.reason || 'Product Issue'}</div>
                            <div style="font-size: 0.8rem; color: #64748b; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${d.description || d.comment || ''}</div>
                        </td>
                        <td style="padding: 16px 24px;">
                            <span class="status-badge ${d.status === 'open' ? 'pending' : 'completed'}" style="text-transform: uppercase; font-size: 0.7rem;">${d.status || 'OPEN'}</span>
                        </td>
                        <td style="padding: 16px 24px; color: #64748b; font-size: 0.85rem;">
                            ${d.createdAt ? new Date(d.createdAt).toLocaleDateString() : 'N/A'}
                        </td>
                    </tr>
                `).join('');
            });
        } catch (error) {
            console.error('Error loading seller disputes:', error);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 40px; color: #ef4444;">Failed to load data.</td></tr>';
        }
    });
}
});

async function initV2Insights(uid) {
    console.log('🚀 Loading v2 Seller Insights for:', uid);
    
    if (typeof STHAnalytics === 'undefined') return;

    STHAnalytics.Seller.listenToPerformance(uid, (stats) => {
        // Update Metrics
        document.getElementById('v2-conversionRate').innerText = stats.conversionRate + '%';
        document.getElementById('v2-totalViews').innerText = stats.totalViews.toLocaleString();
        document.getElementById('v2-totalRevenue').innerText = 'RS ' + stats.revenue.toLocaleString();

        // Update Tooltip based on conversion
        const tooltip = document.getElementById('v2-conversionTooltip');
        const tooltipText = document.getElementById('v2-tooltipText');
        
        if (tooltip && tooltipText) {
            tooltip.style.display = 'block';
            if (stats.conversionRate < 2) {
                tooltipText.innerText = 'Low conversion detected. Try optimizing your product images or pricing.';
            } else if (stats.conversionRate > 10) {
                tooltipText.innerText = 'Elite performance! Your listings are highly optimized.';
            } else {
                tooltipText.innerText = 'Stable conversion. Consider running a targeted promotion.';
            }
        }

        // Render Chart
        STHAnalytics.Seller.renderSellerChart('v2-sellerPerformanceChart', stats.dailySales);
    });
}
