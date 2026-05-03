// --- DISPUTE MODAL REGISTRY & FIREBASE ENGINE --- //
// Injected by System to replace localStorage and handle atomic backend logic

let currentActiveDisputeId = null;

// OVERRIDE: Admin Dashboard loadDisputesData()
window.loadDisputesData = function () {
  try {
    const db = firebase.database();
    if (typeof showLoading === 'function') showLoading('disputes');
    
    db.ref('disputes').on('value', snap => {
      const disputes = [];
      const data = snap.val();
      
      if (data) {
        Object.keys(data).forEach(key => {
          disputes.push({ id: key, ...data[key] });
        });
      }

      // Sync with Admin Global State
      const activeAdminData = window.adminData || (typeof adminData !== 'undefined' ? adminData : null);
      if (activeAdminData) {
        activeAdminData.disputes = disputes.sort((a, b) => {
          const timeA = a.createdAt || 0;
          const timeB = b.createdAt || 0;
          return timeB - timeA;
        });

        // Also sync the stats object so counters update
        if (activeAdminData.stats) {
          activeAdminData.stats.disputes = {
            total: disputes.length,
            open: disputes.filter(d => d.status === 'open' || d.status === 'under_review').length,
            resolved: disputes.filter(d => d.status === 'resolved' || d.status === 'RESOLVED').length,
            highPriority: disputes.filter(d => (d.priority || '').toLowerCase() === 'high').length
          };
        }
      }

      // Update UI Components
      if (typeof updateDisputesTable === 'function') updateDisputesTable();
      if (typeof updateDashboardStats === 'function') updateDashboardStats();
      
      // Direct element updates for legacy badges
      const pendingCount = disputes.filter(d => d.status === 'open' || d.status === 'under_review').length;
      if (typeof updateElementText === 'function') {
        updateElementText('disputesCount', pendingCount);
        updateElementText('pendingDisputes', pendingCount);
      }
      
      if (typeof hideLoading === 'function') hideLoading('disputes');
    }, error => {
      console.error('[DisputeEngine] Admin Sync Error:', error);
      if (typeof hideLoading === 'function') hideLoading('disputes');
    });
  } catch (e) {
    console.error('[DisputeEngine] Admin Critical Load Error:', e);
  }
};

// OVERRIDE: Staff Dashboard loadDisputes()
window.loadDisputes = function () {
  try {
    const db = firebase.database();
    if (typeof showLoading === 'function') showLoading('disputes');
    
    db.ref('disputes').on('value', snap => {
      const disputes = [];
      const data = snap.val();
      
      if (data) {
        Object.keys(data).forEach(key => {
          disputes.push({ id: key, ...data[key] });
        });
      }

      const activeStaffData = window.staffData || staffData;
      if (activeStaffData) {
        activeStaffData.disputes = disputes.sort((a, b) => {
          const timeA = a.createdAt || 0;
          const timeB = b.createdAt || 0;
          return timeB - timeA;
        });
      }

      // Update Sidebar Badge (Real-time)
      const openCount = disputes.filter(d => (d.status || 'open').toLowerCase() === 'open').length;
      const badge = document.getElementById('disputesCount');
      if (badge) {
        badge.innerText = openCount;
        badge.style.display = openCount > 0 ? 'inline-block' : 'none';
      }

      if (typeof updateDisputesTable === 'function') updateDisputesTable();
      if (typeof hideLoading === 'function') hideLoading('disputes');
    }, (error) => {
      console.error('[DisputeEngine] Sync Error:', error);
      if (typeof hideLoading === 'function') hideLoading('disputes');
    });
  } catch (e) {
    console.error('[DisputeEngine] Critical Load Error:', e);
  }
};


window.viewDispute = function (disputeId) {
  const isStaff = typeof staffData !== 'undefined';
  const dispute = isStaff ? staffData.disputes.find(d => d.id === disputeId) : adminData.disputes.find(d => d.id === disputeId);
  if (!dispute) return;

  document.getElementById('viewDisputeIdTitle').innerText = disputeId;
  document.getElementById('vDispOrder').innerText = dispute.orderId || 'N/A';
  document.getElementById('vDispStatus').innerText = (dispute.status || 'open').toUpperCase();
  document.getElementById('vDispAssignee').innerText = dispute.assignedToStaffId || 'Unassigned';
  document.getElementById('vDispRaiser').innerText = dispute.complainantName || dispute.reportedBy || dispute.buyerId || 'Unknown';
  document.getElementById('vDispReason').innerText = (dispute.reason || dispute.issue || 'No stated reason') + (dispute.description ? `\nDetails: ${dispute.description}` : '');
  document.getElementById('vDispDate').innerText = dispute.createdAt ? new Date(dispute.createdAt).toLocaleString() : 'N/A';

  // Evidence Gallery
  const gallery = document.getElementById('vDispEvidenceGallery');
  if (gallery) {
    if (dispute.evidenceImages && dispute.evidenceImages.length > 0) {
      gallery.innerHTML = '<div style="width: 100%; margin-bottom: 8px; font-weight: bold; font-size: 0.9rem; color: #374151;">Evidence Images:</div>' +
        dispute.evidenceImages.map(url => `
                    <div style="width: 100px; height: 100px; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; cursor: pointer;" onclick="window.open('${url}', '_blank')">
                        <img src="${url}" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                `).join('');
      gallery.style.display = 'flex';
    } else {
      gallery.innerHTML = '';
      gallery.style.display = 'none';
    }
  }



  document.getElementById('disputeViewModal').style.display = 'block';
};

window.closeDisputeViewModal = function () {
  document.getElementById('disputeViewModal').style.display = 'none';
};

// Arbitration Enforcer Modal Globals
window.currentArbitrationDisputeId = null;

window.resolveDispute = function (id) {
  window.currentArbitrationDisputeId = id;

  // Inject Dispute ID into Title
  const modalTitle = document.getElementById('arbitrationDisputeIdText');
  if (modalTitle) modalTitle.innerText = id;

  // Reset fields
  const outcomeSelect = document.getElementById('arbitrationOutcome');
  const notesText = document.getElementById('arbitrationNotes');
  if (outcomeSelect) outcomeSelect.value = 'refund_buyer';
  if (notesText) notesText.value = '';

  // Show Modal
  const modal = document.getElementById('arbitrationEnforcerModal');
  if (modal) modal.style.display = 'block';
};

window.closeArbitrationModal = function () {
  window.currentArbitrationDisputeId = null;
  const modal = document.getElementById('arbitrationEnforcerModal');
  if (modal) modal.style.display = 'none';
};

window.enforceArbitrationRuling = function () {
  const id = window.currentArbitrationDisputeId;
  if (!id) return;

  const outcome = document.getElementById('arbitrationOutcome').value;
  const comments = document.getElementById('arbitrationNotes').value.trim();

  if (!comments) {
    if (window.showError) {
      window.showError('Validation Error: The Official Justification/Notes field cannot be empty.');
    } else {
      alert("The Official Justification/Notes field cannot be empty. This is required for audit logs.");
    }
    return;
  }

  // Build Proper UI Confirmation Notification
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0'; overlay.style.left = '0';
  overlay.style.width = '100%'; overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.6)';
  overlay.style.zIndex = '9999';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';

  // Modal Box
  const box = document.createElement('div');
  box.style.background = '#fff';
  box.style.padding = '24px';
  box.style.borderRadius = '12px';
  box.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
  box.style.width = '100%';
  box.style.maxWidth = '400px';
  box.style.textAlign = 'center';

  const icon = document.createElement('div');
  icon.innerHTML = '<i class="fas fa-exclamation-triangle" style="font-size: 40px; color: #f59e0b; margin-bottom: 16px;"></i>';

  const title = document.createElement('h3');
  title.innerText = 'Confirm Execution';
  title.style.margin = '0 0 10px 0'; title.style.fontSize = '1.3rem'; title.style.color = '#1f2937';

  const desc = document.createElement('p');
  desc.innerHTML = `Are you absolutely sure you want to enforce: <strong>${outcome.toUpperCase()}</strong>?<br><br><span style="color:#ef4444; font-size:0.9rem;">This will permanently execute the Escrow.</span>`;
  desc.style.color = '#4b5563'; desc.style.marginBottom = '24px'; desc.style.fontSize = '1rem';

  const btnContainer = document.createElement('div');
  btnContainer.style.display = 'flex'; btnContainer.style.gap = '10px'; btnContainer.style.justifyContent = 'center';

  const cancelBtn = document.createElement('button');
  cancelBtn.innerText = 'Go Back';
  cancelBtn.style.padding = '10px 20px'; cancelBtn.style.border = '1px solid #d1d5db'; cancelBtn.style.background = '#fff';
  cancelBtn.style.borderRadius = '6px'; cancelBtn.style.cursor = 'pointer'; cancelBtn.style.fontWeight = '500';
  cancelBtn.onclick = () => document.body.removeChild(overlay);

  const proceedBtn = document.createElement('button');
  proceedBtn.innerHTML = '<i class="fas fa-check"></i> Execute';
  proceedBtn.style.padding = '10px 20px'; proceedBtn.style.border = 'none'; proceedBtn.style.background = '#ef4444';
  proceedBtn.style.color = '#fff'; proceedBtn.style.borderRadius = '6px'; proceedBtn.style.cursor = 'pointer'; proceedBtn.style.fontWeight = 'bold';
  proceedBtn.onclick = () => {
    document.body.removeChild(overlay);
    // Execute Core Logic
    window._executeArbitrationRuling(id, outcome, comments);
  };

  btnContainer.appendChild(cancelBtn);
  btnContainer.appendChild(proceedBtn);

  box.appendChild(icon);
  box.appendChild(title);
  box.appendChild(desc);
  box.appendChild(btnContainer);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
};

window._executeArbitrationRuling = async function (id, outcome, comments) {
  try {
    const db = firebase.database();
    let staffId = "Admin";
    if (typeof auth !== 'undefined' && auth.currentUser) {
      staffId = auth.currentUser.uid;
    }

    // Fetch Dispute to grab the Order ID
    const dispSnap = await db.ref(`disputes/${id}`).once('value');
    const disp = dispSnap.val();

    if (!disp) throw new Error("Dispute record missing from database.");

    const orderId = disp.orderId;
    const buyerId = disp.buyerId;
    const sellerId = disp.sellerId;

    // Fetch Order to grab the total Amount locked in Escrow
    const orderSnap = await db.ref(`orders/${orderId}`).once('value');
    const order = orderSnap.val();

    let escrowAmount = 0;
    if (order) {
      escrowAmount = parseFloat(order.total || order.totalAmount || order.amount || 0);
    }

    // NEW: Use the Stateless DisputeEngine for Atomic Resolution
    if (!window.DisputeEngine) throw new Error("Dispute Engine not initialized.");
    
    await window.DisputeEngine.resolveDispute(id, outcome);

    // Complete UI Flow
    closeArbitrationModal();
    if (window.showSuccess) {
      window.showSuccess('Escrow Executed: The ruling has been enforced and the funds distributed via Atomic Engine.');
    } else {
      alert('Arbitration ruling successfully enforced.');
    }

  } catch (e) {
    console.error('Arbitration Execute Error:', e);
    if (window.showError) {
      window.showError('Critical Error: Error while moving funds. Check console.');
    } else {
      alert('Critical error while moving funds. Check console.');
    }
  }
};
