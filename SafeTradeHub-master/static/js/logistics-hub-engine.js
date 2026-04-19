// --- SAFE SHIP ELITE HUB ENGINE ---

const PAKISTAN_HUBS = [
    "Karachi Central Hub",
    "Lahore Regional Hub",
    "Islamabad Federal Hub",
    "Faisalabad Textiles Hub",
    "Sialkot Industrial Hub",
    "Peshawar Frontier Hub",
    "Quetta Western Hub",
    "Multan Southern Hub"
];

// Target statuses and their corresponding action buttons
const LOGISTICS_ACTIONS = [
    { targetStatus: 'received_at_seller_hub', label: 'Received at Origin Hub', btn: 'Receive at Hub', icon: 'fa-warehouse' },
    { targetStatus: 'verified', label: 'Verified & Sealed', btn: 'Verify & Seal', icon: 'fa-shield-alt' },
    { targetStatus: 'in_transit', label: 'In Transit', btn: 'Dispatch to Transit', icon: 'fa-truck' },
    { targetStatus: 'arrived_at_dest_hub', label: 'At Destination Hub', btn: 'Mark as Arrived', icon: 'fa-map-marker-alt' },
    { targetStatus: 'out_for_delivery', label: 'Out for Delivery', btn: 'Assign for Delivery', icon: 'fa-motorcycle' },
    { targetStatus: 'delivered', label: 'Delivered', btn: 'Confirm Delivery', icon: 'fa-box-open' }
];

const STATUS_ORDER = ['pending', 'received_at_seller_hub', 'verified', 'in_transit', 'arrived_at_dest_hub', 'out_for_delivery', 'delivered'];

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

document.addEventListener('DOMContentLoaded', () => {
    initLogisticsHub();
});

function initLogisticsHub() {
    const hubSelect = document.getElementById('staffHubLocation');
    if (hubSelect) {
        hubSelect.innerHTML = PAKISTAN_HUBS.map(h => `<option value="${h}">${h}</option>`).join('');
        const savedHub = localStorage.getItem('selectedStaffHub');
        if (savedHub) hubSelect.value = savedHub;
        
        hubSelect.addEventListener('change', (e) => {
            localStorage.setItem('selectedStaffHub', e.target.value);
            showSuccess(`Station location set to: ${e.target.value}`);
        });
    }

    initActivePipeline();

    if (typeof db !== 'undefined') {
        db.ref('audit_logs').orderByChild('timestamp').limitToLast(20).on('value', snap => {
            const logs = [];
            snap.forEach(child => {
                const log = child.val();
                if (log.action === 'logistics_update') logs.unshift(log);
            });
            renderHubActivity(logs);
        });
    }
}

function initActivePipeline() {
    const tableBody = document.getElementById('logisticsPipelineTableBody');
    const statsIndicator = document.getElementById('pipelineStats');
    if (!tableBody) return;

    db.ref('orders').on('value', (snapshot) => {
        const orders = snapshot.val();
        if (!orders) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No active shipments.</td></tr>';
            return;
        }

        const activeOrders = Object.entries(orders)
            .map(([id, data]) => ({ id, ...data }))
            .filter(o => o.status !== 'delivered' && o.status !== 'cancelled' && o.status !== 'completed')
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        if (statsIndicator) statsIndicator.innerText = `${activeOrders.length} Active Shipments`;

        if (activeOrders.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #94a3b8;">Main pipeline is clear.</td></tr>';
            return;
        }

        tableBody.innerHTML = activeOrders.map(o => {
            const items = o.items ? Object.values(o.items) : [];
            const firstItem = items[0] || {};
            const productImg = firstItem.img || '/static/images/placeholder.jpg';
            const productName = firstItem.title || 'Unknown Product';
            const amount = o.total || 0;

            return `
                <tr>
                    <td><strong style="color: #1e293b;">#${o.id.substring(0, 8)}</strong></td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <img src="${productImg}" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover; border: 1px solid #e2e8f0;">
                            <div style="font-size: 0.85rem; font-weight: 600; color: #1e293b;">${productName}</div>
                        </div>
                    </td>
                    <td>
                        <div style="font-size: 0.75rem;">
                            <div style="color: #64748b;">S: <span style="color: #1e293b;">${o.sellerName || 'N/A'}</span></div>
                            <div style="color: #64748b;">B: <span style="color: #1e293b;">${o.buyerName || 'N/A'}</span></div>
                        </div>
                    </td>
                    <td><strong style="color: #059669;">RS ${amount.toFixed(0)}</strong></td>
                    <td>
                        <span class="status-badge" style="background: #eff6ff; color: #2563eb; border: 1px solid #dbeafe; font-size: 0.7rem;">
                            ${formatOrderStatus(o.status)}
                        </span>
                    </td>
                    <td style="text-align: right;">
                        <button class="btn btn-sm btn-outline" onclick="quickScan('${o.id}')" style="padding: 5px 12px; font-size: 0.75rem;">
                            <i class="fas fa-satellite-dish"></i> Manage
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    });
}

function quickScan(orderId) {
    document.getElementById('logisticsScanId').value = orderId;
    scanShipment();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

let currentScanListenerRef = null;

async function scanShipment() {
    let orderId = document.getElementById('logisticsScanId').value.trim();
    if (!orderId) {
        showError('Please enter Order ID');
        return;
    }

    if (orderId.startsWith('#')) orderId = orderId.substring(1);

    const resultCard = document.getElementById('activeScanResult');
    resultCard.innerHTML = `<div style="text-align:center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading Order Identity...</div>`;
    resultCard.style.display = 'block';

    try {
        let snap = await db.ref(`orders/${orderId}`).once('value');
        let order = snap.val();

        if (!order && !orderId.startsWith('-')) {
            const altId = '-' + orderId;
            snap = await db.ref(`orders/${altId}`).once('value');
            order = snap.val();
            if (order) orderId = altId;
        }

        if (!order) {
            resultCard.innerHTML = `<div class="alert alert-danger" style="margin:0; padding: 20px; border-radius: 12px; background: #fee2e2; border: 1px solid #fecaca; color: #991b1b;">
                <i class="fas fa-exclamation-triangle"></i> <strong>Network Error:</strong> ID #${orderId} not found.
            </div>`;
            return;
        }

        // Clean up previous real-time listeners
        if (currentScanListenerRef) {
            currentScanListenerRef.off('value');
        }

        // Attach persistent real-time listener to the active order
        currentScanListenerRef = db.ref(`orders/${orderId}`);
        currentScanListenerRef.on('value', (snapshot) => {
            const liveOrder = snapshot.val();
            if (liveOrder) {
                renderScanResult(liveOrder);
            }
        });

    } catch (err) {
        console.error('Scan error:', err);
        showError('Failed to synchronize');
    }
}

function renderScanResult(order) {
    const resultCard = document.getElementById('activeScanResult');
    const hub = document.getElementById('staffHubLocation').value;
    const currentStatus = order.status || 'pending';
    
    // Lowercase matching for rank to handle uppercase Firebase data
    const currentRank = STATUS_ORDER.indexOf(currentStatus.toLowerCase());

    const items = order.items ? Object.values(order.items) : [];
    const firstItem = items[0] || {};
    const productImg = firstItem.img || '/static/images/placeholder.jpg';
    const productName = firstItem.title || 'Global Shipment';

    resultCard.innerHTML = `
        <div class="content-card" style="border-top: 5px solid #2563eb; overflow: hidden; animation: slideDown 0.3s ease-out;">
            <div style="background: #f8fafc; padding: 15px 25px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="background: #2563eb; color: white; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-satellite-dish"></i>
                    </div>
                    <div>
                        <h3 style="margin: 0; font-size: 1rem; color: #1e293b;">Order Management: #${order.id}</h3>
                        <p style="margin: 0; font-size: 0.8rem; color: #64748b;">Processing Hub: <strong>${hub}</strong></p>
                    </div>
                </div>
            </div>

            <div style="padding: 25px;">
                <div style="display: grid; grid-template-columns: 320px 1fr; gap: 30px;">
                    <!-- Left: Profile -->
                    <div style="background: #f8fafc; border-radius: 12px; padding: 20px; border: 1px solid #f1f5f9;">
                        <div style="display: flex; gap: 15px; margin-bottom: 20px;">
                            <img src="${productImg}" style="width: 70px; height: 70px; border-radius: 8px; object-fit: cover; border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                            <div>
                                <h4 style="margin: 0; font-size: 0.9rem; color: #1e293b;">${productName}</h4>
                                <small style="color: #64748b;">VALUE: RS ${order.total.toFixed(0)}</small>
                            </div>
                        </div>
                        <div style="font-size: 0.8rem; color: #475569;">
                            <div style="margin-bottom: 8px;"><strong>Seller:</strong> ${order.sellerName || 'N/A'}</div>
                            <div><strong>Buyer:</strong> ${order.buyerName || 'N/A'}</div>
                        </div>
                    </div>

                    <!-- Right: Actions -->
                    <div>
                        <h4 style="margin-top: 0; margin-bottom: 20px; font-size: 0.85rem; color: #1e293b; text-transform: uppercase; letter-spacing: 1px;">Logistics Protocol Actions</h4>
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                            ${LOGISTICS_ACTIONS.map((action, idx) => {
                                // Important: STATUS_ORDER starts with pending. 
                                // LOGISTICS_ACTIONS[0] targets index 1 (received_at_seller_hub)
                                const targetRank = STATUS_ORDER.indexOf(action.targetStatus);
                                const isPast = targetRank <= currentRank;
                                const isNext = targetRank === currentRank + 1;
                                
                                let btnClass = isNext ? 'btn-primary' : 'btn-outline';
                                
                                return `
                                    <button class="btn ${btnClass}" 
                                            style="font-size: 0.75rem; text-align: left; padding: 12px; height: auto;"
                                            ${!isNext ? 'disabled' : ''}
                                            onclick="processLogisticsUpdate('${order.id}', '${action.targetStatus}', '${hub}', this)">
                                        <div style="display: flex; align-items: center; gap: 10px;">
                                            <i class="fas ${isPast ? 'fa-check-circle' : action.icon}" style="${isPast ? 'color: #22c55e;' : ''}"></i>
                                            <div>
                                                <div style="font-weight: 700;">${action.btn}</div>
                                                <div style="font-size: 0.65rem; opacity: 0.8;">Target: ${action.label}</div>
                                            </div>
                                        </div>
                                    </button>
                                `;
                            }).join('')}
                        </div>
                        
                        <div style="margin-top: 25px; padding: 15px; background: #fffbe6; border-radius: 8px; border: 1px solid #ffe58f; display: flex; gap: 12px; align-items: center;">
                            <i class="fas fa-info-circle" style="color: #faad14;"></i>
                            <div style="font-size: 0.8rem; color: #856404;">
                                <strong>System Status:</strong> Currently at <span style="font-weight: 700;">${formatOrderStatus(currentStatus)}</span>.
                                <br>Follow the sequence to maintain logistics audit integrity.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function processLogisticsUpdate(orderId, nextStatus, location, btn) {
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SYNCING...';

    const userDataStr = localStorage.getItem('userData');
    const staffName = userDataStr ? JSON.parse(userDataStr).name : 'Hub-Operator';

    try {
        const token = await auth.currentUser.getIdToken();
        const response = await fetch('/api/v1/orders/update-tracking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                orderId: orderId,
                status: nextStatus,
                location: location,
                staffId: staffName,
                note: `Shipment processed at ${location}`
            })
        });

        const result = await response.json();
        if (result.success) {
            showSuccess(`Operation Successful: Shipment moved to ${formatOrderStatus(nextStatus)}`);
            // The active '.on' listener for this order will automatically catch the state change and re-render the UI
        } else {
            throw new Error(result.error || 'Protocol Rejection');
        }
    } catch (err) {
        console.error('Sync error:', err);
        showError(`${err.message}`);
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

function renderHubActivity(logs) {
    const tbody = document.querySelector('#hubActivityTable tbody');
    if (!tbody) return;
    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #94a3b8;">No activity logs found.</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map(log => {
        const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `
            <tr>
                <td><span style="color: #64748b; font-size: 0.8rem;">${time}</span></td>
                <td><strong style="color: #2563eb;">#${(log.entityId || '').substring(0, 8)}</strong></td>
                <td><span style="font-weight: 500;">Network Update</span></td>
                <td><span class="status-badge" style="font-size: 0.75rem; background: #f8fafc; border: 1px solid #e2e8f0;">${log.newValues ? formatOrderStatus(log.newValues.status) : 'Update'}</span></td>
                <td><small style="color: #64748b;">${(log.newValues && log.newValues.location) || 'Central Station'}</small></td>
            </tr>
        `;
    }).join('');
}
