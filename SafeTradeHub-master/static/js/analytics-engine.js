/**
 * SafeTradeHub Advanced Analytics Engine v2 (Isolated & Read-Only)
 * -------------------------------------------------------------
 * This engine exclusively uses Firebase 'onValue' listeners to calculate
 * real-time metrics without requiring dedicated backend analytics routes.
 * 
 * Theme: Axiom Soft "Elite" (Indigo/Slate)
 */

window.STHAnalytics = (function() {
    const THEME = {
        primary: '#4f46e5',    // Indigo-600
        secondary: '#818cf8',  // Indigo-400
        accent: '#c7d2fe',     // Indigo-200
        success: '#10b981',    // Emerald-500
        text: '#1e293b',       // Slate-800
        grid: '#f1f5f9'        // Slate-100
    };

    /**
     * Helper to format numbers to RS
     */
    const formatCurrency = (val) => {
        return 'RS ' + new Number(val).toLocaleString(undefined, { minimumFractionDigits: 0 });
    };

    /**
     * Admin Analytics Suite
     */
    /**
     * Admin Analytics Suite - Professional Real-time Monitoring
     */
    const Admin = {
        /**
         * Listens to global nodes for a comprehensive platform snapshot
         */
        listenToGlobalMetrics: (callback) => {
            const db = firebase.database();
            
            // Central state to aggregate results from multiple listeners
            const state = {
                orders: {},
                users: {},
                products: {},
                disputes: {},
                escrows: {},
                reports: {}
            };

            const processAndNotify = () => {
                const results = {
                    counters: {
                        revenue: 0,
                        orders: 0,
                        usersNew24h: 0,
                        activeDisputes: 0,
                        escrowValue: 0,
                        fraudReports: 0,
                        fulfillmentRate: 0
                    },
                    charts: {
                        revenueTrend: {}, // { "YYYY-MM": total }
                        userGrowth: {},    // { "YYYY-MM-DD": cumulativeCount }
                        categories: {},    // { "Name": { volume, value } }
                        security: {        // Active vs Resolved
                            disputes: { active: 0, resolved: 0 },
                            reports: { active: 0, resolved: 0 }
                        },
                        escrowStatus: {}   // { status: count }
                    }
                };

                const now = new Date();
                const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

                // 1. Pre-populate Categories from Products
                Object.values(state.products).forEach(p => {
                    const cat = p.category || 'General';
                    if (!results.charts.categories[cat]) results.charts.categories[cat] = { volume: 0, value: 0 };
                });

                // 2. Process Orders
                let completed = 0;
                Object.values(state.orders).forEach(o => {
                    const amt = parseFloat(o.total || 0);
                    const date = new Date(o.createdAt || o.timestamp);
                    results.counters.orders++;
                    
                    if (o.status === 'completed' || o.status === 'delivered') {
                        results.counters.revenue += amt;
                        completed++;

                        if (!isNaN(date)) {
                            const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                            results.charts.revenueTrend[monthKey] = (results.charts.revenueTrend[monthKey] || 0) + amt;
                        }

                        // Category Performance (Link to product if needed)
                        let cat = o.category;
                        if (!cat && o.productId && state.products[o.productId]) {
                            cat = state.products[o.productId].category;
                        }
                        cat = cat || 'General';

                        if (!results.charts.categories[cat]) results.charts.categories[cat] = { volume: 0, value: 0 };
                        results.charts.categories[cat].value += amt;
                        results.charts.categories[cat].volume++;
                    }
                });
                results.counters.fulfillmentRate = results.counters.orders > 0 ? ((completed / results.counters.orders) * 100).toFixed(1) : 0;

                // 2. Process Users
                const sortedUsers = Object.values(state.users)
                    .map(u => ({ date: new Date(u.createdAt) }))
                    .filter(u => !isNaN(u.date))
                    .sort((a, b) => a.date - b.date);

                let cumulative = 0;
                sortedUsers.forEach(u => {
                    cumulative++;
                    const dayKey = u.date.toISOString().split('T')[0];
                    results.charts.userGrowth[dayKey] = cumulative;

                    if (u.date > oneDayAgo) results.counters.usersNew24h++;
                });

                // 3. Process Products (Category Volume distribution)
                Object.values(state.products).forEach(p => {
                    const cat = p.category || 'General';
                    if (!results.charts.categories[cat]) results.charts.categories[cat] = { volume: 0, value: 0 };
                    // volume here could also mean listing count
                });

                // 4. Process Disputes & Reports
                Object.values(state.disputes).forEach(d => {
                    if (d.status === 'open' || d.status === 'pending') {
                        results.counters.activeDisputes++;
                        results.charts.security.disputes.active++;
                    } else {
                        results.charts.security.disputes.resolved++;
                    }
                });

                Object.values(state.reports).forEach(r => {
                    results.counters.fraudReports++;
                    if (r.status === 'pending') results.charts.security.reports.active++;
                    else results.charts.security.reports.resolved++;
                });

                // 5. Process Escrows
                Object.values(state.escrows).forEach(e => {
                    if (e.status === 'held' || e.status === 'pending') {
                        results.counters.escrowValue += parseFloat(e.amount || 0);
                    }
                    results.charts.escrowStatus[e.status] = (results.charts.escrowStatus[e.status] || 0) + 1;
                });

                callback(results);
            };

            // Setup real-time listeners
            db.ref('orders').on('value', snap => { state.orders = snap.val() || {}; processAndNotify(); });
            db.ref('users').on('value', snap => { state.users = snap.val() || {}; processAndNotify(); });
            db.ref('products').on('value', snap => { state.products = snap.val() || {}; processAndNotify(); });
            db.ref('disputes').on('value', snap => { state.disputes = snap.val() || {}; processAndNotify(); });
            db.ref('escrows').on('value', snap => { state.escrows = snap.val() || {}; processAndNotify(); });
            db.ref('reports').on('value', snap => { state.reports = snap.val() || {}; processAndNotify(); });
        },

        renderRevenueChart: (canvasId, trendData) => {
            const ctx = document.getElementById(canvasId)?.getContext('2d');
            if (!ctx) return null;

            const labels = Object.keys(trendData || {}).sort();
            if (labels.length === 0) return null; // Defensive check
            const data = labels.map(l => trendData[l]);

            return new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Revenue (RS)',
                        data: data,
                        borderColor: THEME.primary,
                        backgroundColor: 'rgba(79, 70, 229, 0.05)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        },

        renderCategoryChart: (canvasId, catData, mode = 'value') => {
            const ctx = document.getElementById(canvasId)?.getContext('2d');
            if (!ctx) return null;

            const labels = Object.keys(catData || {});
            if (labels.length === 0) return null; // Defensive check
            const data = labels.map(l => catData[l][mode]);

            return new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: [THEME.primary, THEME.secondary, THEME.accent, THEME.success, '#f43f5e', '#8b5cf6', '#06b6d4'],
                        borderWidth: 0
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    cutout: '70%',
                    plugins: { 
                        legend: { position: 'bottom' } 
                    } 
                }
            });
        },

        renderGrowthChart: (canvasId, growthData) => {
            const ctx = document.getElementById(canvasId)?.getContext('2d');
            if (!ctx) return null;

            const labels = Object.keys(growthData || {}).sort().slice(-30); 
            if (labels.length === 0) return null; // Defensive check
            const data = labels.map(l => growthData[l]);

            return new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels.map(l => l.split('-').slice(1).join('/')),
                    datasets: [{
                        label: 'Total Users',
                        data: data,
                        borderColor: THEME.success,
                        backgroundColor: 'rgba(16, 185, 129, 0.05)',
                        fill: true,
                        tension: 0
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 } }
                    }
                }
            });
        }
    };

    /**
     * Seller Analytics Suite
     */
    const Seller = {
        /**
         * Listens to orders and products specifically for one UID
         */
        listenToPerformance: (sellerUid, callback) => {
            const db = firebase.database();
            
            // Listen to Orders filtered by sellerId
            db.ref('orders').orderByChild('sellerId').equalTo(sellerUid).on('value', (snap) => {
                const orders = snap.val() || {};
                
                // Fetch products to count views
                db.ref('products').orderByChild('sellerId').equalTo(sellerUid).once('value', (prodSnap) => {
                    const products = prodSnap.val() || {};
                    
                    let totalViews = 0;
                    Object.values(products).forEach(p => {
                        totalViews += parseInt(p.views || 0);
                    });

                    const stats = {
                        revenue: 0,
                        salesCount: 0,
                        totalViews: totalViews,
                        conversionRate: 0,
                        dailySales: {} // Last 7 days
                    };

                    Object.values(orders).forEach(o => {
                        if (o.status === 'completed' || o.status === 'delivered') {
                            const amt = parseFloat(o.total || 0);
                            stats.revenue += amt;
                            stats.salesCount++;

                            // Daily trend
                            const date = new Date(o.createdAt || o.timestamp);
                            if (!isNaN(date)) {
                                const day = date.toISOString().split('T')[0];
                                stats.dailySales[day] = (stats.dailySales[day] || 0) + amt;
                            }
                        }
                    });

                    stats.conversionRate = totalViews > 0 ? ((stats.salesCount / totalViews) * 100).toFixed(1) : 0;
                    callback(stats);
                });
            });
        },

        renderSellerChart: (canvasId, dailySales) => {
            const ctx = document.getElementById(canvasId)?.getContext('2d');
            if (!ctx) return null;

            // Last 7 days labels
            const labels = [];
            const data = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const key = d.toISOString().split('T')[0];
                labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
                data.push(dailySales[key] || 0);
            }

            return new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Daily Sales',
                        data: data,
                        backgroundColor: THEME.primary,
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { 
                            beginAtZero: true,
                            grid: { color: THEME.grid },
                            ticks: { callback: (val) => formatCurrency(val) }
                        },
                        x: { grid: { display: false } }
                    }
                }
            });
        }
    };

    return {
        Admin,
        Seller,
        THEME
    };
})();
