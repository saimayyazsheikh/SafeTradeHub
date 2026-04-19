/**
 * SafeTradeHub Advanced Analytics Engine v99 (Isolated & Read-Only)
 * -------------------------------------------------------------
 * Theme: Axiom Soft "Elite" (Indigo/Slate)
 */

window.STHAnalytics = (function() {
    console.log('✅ STHAnalytics Engine v99 Loaded');
    
    const THEME = {
        primary: '#4f46e5',    // Indigo-600
        secondary: '#818cf8',  // Indigo-400
        accent: '#c7d2fe',     // Indigo-200
        success: '#10b981',    // Emerald-500
        text: '#1e293b',       // Slate-800
        grid: '#f1f5f9'        // Slate-100
    };

    const formatCurrency = (val) => {
        return 'RS ' + new Number(val).toLocaleString(undefined, { minimumFractionDigits: 0 });
    };

    /**
     * Admin Suite
     */
    const Admin = {
        listenToGlobalMetrics: (callback) => {
            const db = firebase.database();
            const state = { orders: {}, users: {}, products: {}, disputes: {}, escrows: {}, reports: {} };

            const processAndNotify = () => {
                const results = {
                    counters: { 
                        revenue: 0, 
                        gmv: 0,
                        shippingRevenue: 0, 
                        escrowRevenue: 0,
                        orders: 0, 
                        usersNew24h: 0, 
                        activeDisputes: 0, 
                        escrowValue: 0, 
                        fraudReports: 0, 
                        fulfillmentRate: 0 
                    },
                    charts: { revenueTrend: {}, userGrowth: {}, categories: {}, security: { disputes: { active: 0, resolved: 0 }, reports: { active: 0, resolved: 0 } }, escrowStatus: {} }
                };

                const now = new Date();
                const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

                // Orders
                let completed = 0;
                Object.values(state.orders).forEach(o => {
                    if (!o) return;
                    const amt = parseFloat(o.total || o.totalAmount || 0);
                    const shippingAmt = parseFloat(o.shippingTotal || 0);
                    const escrowAmt = parseFloat(o.escrowFee || 0);
                    
                    const date = new Date(o.createdAt || o.timestamp);
                    results.counters.orders++;
                    
                    if (o.status === 'completed' || o.status === 'delivered') {
                        results.counters.gmv = (results.counters.gmv || 0) + amt;
                        results.counters.revenue += (escrowAmt + shippingAmt);
                        results.counters.shippingRevenue += shippingAmt;
                        results.counters.escrowRevenue += escrowAmt;
                        
                        completed++;
                        if (!isNaN(date)) {
                            const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                            results.charts.revenueTrend[monthKey] = (results.charts.revenueTrend[monthKey] || 0) + amt;
                        }
                    }
                });
                results.counters.fulfillmentRate = results.counters.orders > 0 ? ((completed / results.counters.orders) * 100).toFixed(1) : 0;

                // Categories (from products)
                Object.values(state.products).forEach(p => {
                    if (!p) return;
                    const cat = p.category || 'General';
                    const price = parseFloat(p.price || 0);
                    if (!results.charts.categories[cat]) results.charts.categories[cat] = { volume: 0, value: 0 };
                    results.charts.categories[cat].volume++;
                    results.charts.categories[cat].value += price;
                });

                // User Growth
                const sortedUsers = Object.values(state.users).filter(u => u && u.createdAt).map(u => ({ date: new Date(u.createdAt) })).filter(u => !isNaN(u.date)).sort((a, b) => a.date - b.date);
                let cumulative = 0;
                sortedUsers.forEach(u => {
                    cumulative++;
                    const dayKey = u.date.toISOString().split('T')[0];
                    results.charts.userGrowth[dayKey] = cumulative;
                    if (u.date > oneDayAgo) results.counters.usersNew24h++;
                });

                callback(results);
            };

            const nodes = ['orders', 'users', 'products', 'disputes', 'escrows', 'reports'];
            nodes.forEach(node => {
                db.ref(node).on('value', snap => {
                    state[node] = snap.val() || {};
                    processAndNotify();
                });
            });
        },

        renderRevenueChart: (canvasId, trendData) => {
            const canvas = document.getElementById(canvasId);
            const ctx = canvas?.getContext('2d');
            if (!ctx) return null;
            if (canvas._chartInstance) canvas._chartInstance.destroy();
            const labels = Object.keys(trendData || {}).sort();
            if (labels.length === 0) return null;
            const data = labels.map(l => trendData[l]);
            canvas._chartInstance = new Chart(ctx, {
                type: 'line',
                data: { labels: labels, datasets: [{ label: 'Revenue (RS)', data: data, borderColor: THEME.primary, backgroundColor: 'rgba(79, 70, 229, 0.05)', fill: true, tension: 0.4 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
            return canvas._chartInstance;
        },

        renderCategoryChart: (canvasId, categories, mode = 'volume') => {
            const canvas = document.getElementById(canvasId);
            const ctx = canvas?.getContext('2d');
            if (!ctx) return null;
            if (canvas._chartInstance) canvas._chartInstance.destroy();

            const labels = Object.keys(categories || {}).sort((a, b) => categories[b][mode] - categories[a][mode]);
            const data = labels.map(cat => categories[cat][mode]);

            canvas._chartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: mode === 'volume' ? 'Product Count' : 'Market Value (RS)',
                        data: data,
                        backgroundColor: mode === 'volume' ? THEME.secondary : THEME.primary,
                        borderRadius: 4,
                        indexAxis: 'y' // Horizontal bar
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { beginAtZero: true, grid: { display: false } },
                        y: { grid: { display: false } }
                    }
                }
            });
            return canvas._chartInstance;
        },

        renderGrowthChart: (canvasId, growthData) => {
            const canvas = document.getElementById(canvasId);
            const ctx = canvas?.getContext('2d');
            if (!ctx) return null;
            if (canvas._chartInstance) canvas._chartInstance.destroy();

            const labels = Object.keys(growthData || {}).sort();
            const data = labels.map(l => growthData[l]);

            canvas._chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Total Users',
                        data: data,
                        borderColor: THEME.success,
                        backgroundColor: 'rgba(16, 185, 129, 0.05)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } }
                }
            });
            return canvas._chartInstance;
        }
    };

    /**
     * Seller Suite
     */
    const Seller = {
        /**
         * Listens to orders and products specifically for one UID
         * Optimized with redundant matching for data structure variations.
         */
        listenToPerformance: (sellerUid, callback) => {
            console.log('[Analytics v99] Monitoring UID:', sellerUid);
            const db = firebase.database();
            const state = { orders: {}, products: {} };

            const processAndNotify = () => {
                const stats = {
                    revenue: 0,
                    salesCount: 0,
                    totalViews: 0,
                    conversionRate: 0,
                    dailySales: {}
                };

                // Process Products for Views
                Object.values(state.products).forEach(p => {
                    if (!p) return;
                    // Robust check: Direct sellerId or nested seller.id
                    if (p.sellerId === sellerUid || (p.seller && p.seller.id === sellerUid)) {
                        stats.totalViews += parseInt(p.views || 0);
                    }
                });

                // Process Orders for Revenue and Sales
                Object.values(state.orders).forEach(o => {
                    if (!o) return;
                    // Robust check: match sellerId or seller.id or items[0].sellerId
                    const sid = o.sellerId || (o.seller && o.seller.id) || (o.items && o.items[0] && o.items[0].sellerId);
                    
                    if (sid === sellerUid) {
                        stats.salesCount++;
                        
                        // Use subtotal (base price) for seller revenue, not the total which includes platform shipping/escrow
                        const amt = parseFloat(o.subtotal || o.price || o.amount || 0);
                        if (o.status === 'completed' || o.status === 'delivered') {
                            stats.revenue += amt;
                        }

                        const date = new Date(o.createdAt || o.timestamp);
                        if (!isNaN(date)) {
                            const day = date.toISOString().split('T')[0];
                            stats.dailySales[day] = (stats.dailySales[day] || 0) + amt;
                        }
                    }
                });

                stats.conversionRate = stats.totalViews > 0 ? ((stats.salesCount / stats.totalViews) * 100).toFixed(1) : 0;
                
                console.log('[Analytics v99] UI Data Packet:', stats);
                callback(stats);
            };

            // Enhanced data fetching with fallback and root observation if needed
            const ordersRef = db.ref('orders').orderByChild('sellerId').equalTo(sellerUid);
            const productsRef = db.ref('products').orderByChild('sellerId').equalTo(sellerUid);

            ordersRef.on('value', snap => {
                const data = snap.val() || {};
                console.log('[Analytics v99] Orders received:', Object.keys(data).length);
                state.orders = data;
                processAndNotify();
            }, err => {
                console.warn('[Analytics v99] Orders query fallback triggered');
                db.ref('orders').on('value', snap => {
                    state.orders = snap.val() || {};
                    processAndNotify();
                });
            });

            productsRef.on('value', snap => {
                const data = snap.val() || {};
                console.log('[Analytics v99] Products received:', Object.keys(data).length);
                state.products = data;
                processAndNotify();
            }, err => {
                console.warn('[Analytics v99] Products query fallback triggered');
                db.ref('products').on('value', snap => {
                    state.products = snap.val() || {};
                    processAndNotify();
                });
            });
        },

        renderSellerChart: (canvasId, dailySales) => {
            const canvas = document.getElementById(canvasId);
            const ctx = canvas?.getContext('2d');
            if (!ctx) return null;
            if (canvas._chartInstance) canvas._chartInstance.destroy();

            const labels = [];
            const data = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const key = d.toISOString().split('T')[0];
                labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
                data.push(dailySales[key] || 0);
            }

            canvas._chartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{ label: 'Daily Sales', data: data, backgroundColor: THEME.primary, borderRadius: 6 }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { callback: (val) => 'RS ' + val.toLocaleString() } },
                        x: { grid: { display: false } }
                    }
                }
            });
            return canvas._chartInstance;
        },

        renderMiniChart: (canvasId, dailySales) => {
            const canvas = document.getElementById(canvasId);
            const ctx = canvas?.getContext('2d');
            if (!ctx) return null;
            if (canvas._chartInstance) canvas._chartInstance.destroy();

            const labels = [];
            const data = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const key = d.toISOString().split('T')[0];
                labels.push('');
                data.push(dailySales[key] || 0);
            }

            canvas._chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        borderColor: '#4f46e5',
                        borderWidth: 3,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: true,
                        backgroundColor: 'rgba(79, 70, 229, 0.1)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                    scales: {
                        y: { display: false, beginAtZero: true },
                        x: { display: false }
                    }
                }
            });
            return canvas._chartInstance;
        }
    };

    return { Admin, Seller, THEME };
})();
