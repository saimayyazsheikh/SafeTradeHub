// Dashboard Logic
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
                                        <td><span class="status-badge ${o.status === 'completed' ? 'completed' : 'pending'}">${o.status}</span></td>
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
    const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'processing').length;
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
                                        <td><span class="status-badge ${o.status === 'completed' ? 'completed' : 'pending'}">${o.status}</span></td>
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
