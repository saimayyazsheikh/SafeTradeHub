// --- DISPUTE MODAL REGISTRY & FIREBASE ENGINE --- //
// Injected by System to replace localStorage and handle atomic backend logic

let currentActiveDisputeId = null;

// OVERRIDE: Admin Dashboard loadDisputesData()
window.loadDisputesData = function() {
  try {
    if(typeof showLoading === 'function') showLoading('disputes');
    const disputesRef = db.ref('disputes');
    
    disputesRef.on('value', (snapshot) => {
      const disputesData = snapshot.val();
      adminData.disputes = [];
      
      if (disputesData) {
        Object.keys(disputesData).forEach(key => {
          adminData.disputes.push({
            id: key,
            ...disputesData[key]
          });
        });
      }
      
      // Sort by creation date descending
      adminData.disputes.sort((a, b) => {
         const timeA = a.createdAt || 0;
         const timeB = b.createdAt || 0;
         return timeB - timeA;
      });
      
      if(typeof updateDisputesTable === 'function') updateDisputesTable();
      if(typeof updateDashboardStats === 'function') updateDashboardStats(); 
      
      const pendingCount = adminData.disputes.filter(d => d.status === 'open' || d.status === 'under_review').length;
      if(typeof updateElementText === 'function') {
         updateElementText('disputesCount', pendingCount);
         updateElementText('pendingDisputes', pendingCount);
      }
      if(typeof updateElementHTML === 'function') {
         updateElementHTML('disputesTrend', pendingCount > 0
            ? `<i class="fas fa-exclamation-circle"></i> ${pendingCount} open`
            : `<i class="fas fa-check-circle"></i> All resolved`);
      }
        
      if(typeof hideLoading === 'function') hideLoading('disputes');
    }, (error) => {
      console.error('Firebase DB Error:', error);
      if(typeof showError === 'function') showError('Failed to sync disputes.');
      if(typeof hideLoading === 'function') hideLoading('disputes');
    });
  } catch (error) {
    if(typeof hideLoading === 'function') hideLoading('disputes');
  }
};

// OVERRIDE: Staff Dashboard loadDisputes()
window.loadDisputes = function() {
  try {
    if(typeof showLoading === 'function') showLoading('disputes');
    db.ref('disputes').on('value', snap => {
      const disputes = [];
      snap.forEach(c => disputes.push({id: c.key, ...c.val()}));
      
      staffData.disputes = disputes.sort((a, b) => {
         const timeA = a.createdAt || 0;
         const timeB = b.createdAt || 0;
         return timeB - timeA;
      });
      
      if(typeof renderDisputes === 'function') renderDisputes();
      if(typeof hideLoading === 'function') hideLoading('disputes');
    }, error => {
      if(typeof showError === 'function') showError('Failed to load disputes');
      if(typeof hideLoading === 'function') hideLoading('disputes');
    });
  } catch (e) {
    if(typeof hideLoading === 'function') hideLoading('disputes');
  }
};

window.viewDispute = function(disputeId) {
    const isStaff = typeof staffData !== 'undefined';
    const dispute = isStaff ? staffData.disputes.find(d => d.id === disputeId) : adminData.disputes.find(d => d.id === disputeId);
    if (!dispute) return;

    document.getElementById('viewDisputeIdTitle').innerText = disputeId.slice(-6);
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

window.closeDisputeViewModal = function() {
    document.getElementById('disputeViewModal').style.display = 'none';
};

// Arbitration Enforcer Modal Globals
window.currentArbitrationDisputeId = null;

window.resolveDispute = function(id) {
    window.currentArbitrationDisputeId = id;
    
    // Inject Dispute ID into Title
    const modalTitle = document.getElementById('arbitrationDisputeIdText');
    if(modalTitle) modalTitle.innerText = id.slice(-6);

    // Reset fields
    const outcomeSelect = document.getElementById('arbitrationOutcome');
    const notesText = document.getElementById('arbitrationNotes');
    if(outcomeSelect) outcomeSelect.value = 'refund_buyer';
    if(notesText) notesText.value = '';

    // Show Modal
    const modal = document.getElementById('arbitrationEnforcerModal');
    if(modal) modal.style.display = 'block';
};

window.closeArbitrationModal = function() {
    window.currentArbitrationDisputeId = null;
    const modal = document.getElementById('arbitrationEnforcerModal');
    if(modal) modal.style.display = 'none';
};

window.enforceArbitrationRuling = function() {
    const id = window.currentArbitrationDisputeId;
    if(!id) return;

    const outcome = document.getElementById('arbitrationOutcome').value;
    const comments = document.getElementById('arbitrationNotes').value.trim();

    if (!comments) {
        if(window.NotificationManager) {
            window.NotificationManager.showToast('Validation Error', 'The Official Justification/Notes field cannot be empty.', 'error');
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

window._executeArbitrationRuling = async function(id, outcome, comments) {
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
        
        // 1. EXECUTE THE FINANCIAL SETTLEMENT
        // In a true financial system, we'd also deduct from 'in_escrow'. 
        // We will increment the valid party's available_balance.
        if (escrowAmount > 0) {
            if (outcome === 'refund_buyer' && buyerId && buyerId !== 'unknown') {
                const buyerWalletRef = db.ref(`wallets/${buyerId}/available_balance`);
                await buyerWalletRef.transaction(currentBal => (currentBal || 0) + escrowAmount);
            } 
            else if (outcome === 'release_seller' && sellerId && sellerId !== 'unknown') {
                const sellerWalletRef = db.ref(`wallets/${sellerId}/available_balance`);
                await sellerWalletRef.transaction(currentBal => (currentBal || 0) + escrowAmount);
            }
            else if (outcome === 'partial_split') {
                const splitAmt = escrowAmount / 2;
                if (buyerId && buyerId !== 'unknown') {
                   await db.ref(`wallets/${buyerId}/available_balance`).transaction(currentBal => (currentBal || 0) + splitAmt);
                }
                if (sellerId && sellerId !== 'unknown') {
                   await db.ref(`wallets/${sellerId}/available_balance`).transaction(currentBal => (currentBal || 0) + splitAmt);
                }
            }
        }

        // 2. FINALIZE ARBITRATION DB RECORD
        await db.ref(`disputes/${id}`).update({
            status: 'resolved',
            outcome: outcome.toLowerCase(),
            resolution: comments,
            resolvedBy: staffId,
            resolvedAt: firebase.database.ServerValue.TIMESTAMP
        });

        // 3. BROADCAST NOTIFICATIONS & UPDATE ORDER STATUS
        const notifTitle = 'Arbitration Ruling: Escrow Executed';
        const notifMsg = `The dispute for order #${(orderId || '').slice(-6)} has been ruled: ${outcome.toUpperCase()}.\nFunds structured: ${escrowAmount} RS.\nReason: ${comments}`;
        const notifData = {
            title: notifTitle,
            message: notifMsg,
            type: 'alert',
            read: false,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        if (buyerId && buyerId !== 'unknown') await db.ref(`users/${buyerId}/notifications`).push(notifData);
        if (sellerId && sellerId !== 'unknown') await db.ref(`users/${sellerId}/notifications`).push(notifData);
        if (orderId) await db.ref(`orders/${orderId}`).update({ status: 'dispute_resolved', disputeOutcome: outcome });

        // Complete UI Flow
        closeArbitrationModal();
        if (window.NotificationManager) {
             window.NotificationManager.showToast('Escrow Executed', 'The ruling has been enforced and the funds distributed.', 'success');
        } else {
             alert('Arbitration ruling successfully enforced.');
        }

    } catch (e) {
        console.error('Arbitration Execute Error:', e);
        if(window.NotificationManager) {
             window.NotificationManager.showToast('Critical Error', 'Error while moving funds. Check console.', 'error');
        } else {
             alert('Critical error while moving funds. Check console.');
        }
    }
};
