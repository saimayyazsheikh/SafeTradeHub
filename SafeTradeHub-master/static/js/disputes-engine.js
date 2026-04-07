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
    document.getElementById('vDispRaiser').innerText = dispute.reportedBy || 'Unknown';
    document.getElementById('vDispReason').innerText = dispute.reason || dispute.complainantName || 'No detailed reason.';
    document.getElementById('vDispDate').innerText = dispute.createdAt ? new Date(dispute.createdAt).toLocaleString() : 'N/A';

    const notesArea = document.getElementById('vDispNotesArea');
    if (dispute.investigationNotes) {
        let notesHtml = '';
        const notesObj = dispute.investigationNotes;
        Object.keys(notesObj).forEach(k => {
            const n = notesObj[k];
            const t = n.timestamp ? new Date(n.timestamp).toLocaleString() : 'N/A';
            const sName = n.staffId === 'Admin' ? 'Admin' : n.staffId.slice(-6);
            notesHtml += `<div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #e5e7eb;"><strong style="color: #4b5563;">${sName} [${t}]:</strong> <span style="color: #1f2937;">${n.text}</span></div>`;
        });
        notesArea.innerHTML = notesHtml || '<p>No investigation notes yet.</p>';
    } else {
        notesArea.innerHTML = '<p>No investigation notes yet.</p>';
    }

    document.getElementById('disputeViewModal').style.display = 'block';
};

window.closeDisputeViewModal = function() {
    document.getElementById('disputeViewModal').style.display = 'none';
};

window.resolveDispute = function(disputeId) {
    currentActiveDisputeId = disputeId;
    document.getElementById('actionDisputeIdTitle').innerText = disputeId.slice(-6);
    document.getElementById('resolutionJustification').value = '';
    document.getElementById('newDisputeNote').value = '';
    
    // Check if staff has correct permissions
    const isStaff = typeof staffData !== 'undefined';
    const isAdmin = typeof adminData !== 'undefined';
    
    // DOM elements
    const assignSec = document.getElementById('adminAssignSection');
    const resSec = document.getElementById('adminResolutionSection');
    
    if (isAdmin) {
       if(assignSec) assignSec.style.display = 'block';
       if(resSec) resSec.style.display = 'block';
       
       // Populate staff assignment
       if(adminData && adminData.staff) {
          const sDropdown = document.getElementById('assignStaffDropdown');
          if(sDropdown) {
              sDropdown.innerHTML = '<option value="">-- Select Staff --</option>';
              adminData.staff.forEach(s => {
                 sDropdown.innerHTML += `<option value="${s.id}">${s.fullName || s.name || s.id} (${s.role})</option>`;
              });
          }
       }
    } else {
       if(assignSec) assignSec.style.display = 'none'; 
       // For this prototype we allow staff to do resolution if they have the module. In production, check role.
       if(resSec) resSec.style.display = 'block';
    }
    
    document.getElementById('disputeActionModal').style.display = 'block';
};

window.closeDisputeActionModal = function() {
    document.getElementById('disputeActionModal').style.display = 'none';
    currentActiveDisputeId = null;
};

window.addDisputeNote = async function() {
    if(!currentActiveDisputeId) return;
    const noteText = document.getElementById('newDisputeNote').value;
    if(!noteText) return showError("Note cannot be empty.");
    
    let staffId = "Admin";
    if (typeof auth !== 'undefined' && auth.currentUser) staffId = auth.currentUser.uid;

    try {
        const btn = event.target;
        btn.disabled = true;
        btn.innerText = "Adding...";
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/v1/disputes/add-investigation-note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ disputeId: currentActiveDisputeId, noteText: noteText, staffId: staffId })
        });
        const data = await res.json();
        if(data.success) {
            showSuccess("Note added successfully.");
            document.getElementById('newDisputeNote').value = '';
            // Don't close modal, just added a note
        } else {
            showError("Failed: " + data.error);
        }
    } catch(e) {
        showError("Network Error.");
    } finally {
        if(event && event.target) {
            event.target.disabled = false;
            event.target.innerText = "Add Note";
        }
    }
};

window.assignDispute = async function() {
    if(!currentActiveDisputeId) return;
    const assigneeId = document.getElementById('assignStaffDropdown').value;
    if(!assigneeId) return showError("Please select a staff member.");
    
    let staffId = "Admin";
    if (typeof auth !== 'undefined' && auth.currentUser) staffId = auth.currentUser.uid;

    try {
        const btn = event.target;
        btn.disabled = true;
        btn.innerText = "Assigning...";
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/v1/disputes/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ disputeId: currentActiveDisputeId, assigneeId: assigneeId, staffId: staffId })
        });
        const data = await res.json();
        if(data.success) {
            showSuccess("Assigned successfully.");
            closeDisputeActionModal();
        } else showError("Failed: " + data.error);
    } catch(e) {
        showError("Network Error.");
    } finally {
        if(event && event.target) {
            event.target.disabled = false;
            event.target.innerText = "Assign";
        }
    }
};

window.executeDisputeResolution = async function(resolutionType) {
    if(!currentActiveDisputeId) return;
    const justification = document.getElementById('resolutionJustification').value;
    if(!justification) return showError("Justification is strictly required for audit logs!");
    
    // If Admin dashboard, use its custom modal if possible, otherwise use standard confirm
    if(typeof showConfirmationModal === 'function') {
        const conf = await showConfirmationModal('Execute Resolution', `Are you absolutely sure you want to ${resolutionType}? This is an atomic financial transaction.`, { confirmText: 'Execute', confirmColor: '#b91c1c' });
        if(!conf) return;
    } else {
        if(!confirm(`Are you absolutely sure you want to ${resolutionType}? This is an atomic financial transaction.`)) return;
    }

    let staffId = "Admin";
    if (typeof auth !== 'undefined' && auth.currentUser) staffId = auth.currentUser.uid;
    
    let finalStatus = resolutionType === 'Dismiss Dispute' ? 'closed' : 'resolved';
    
    try {
        const buttons = [document.getElementById('btnRefundBuyer'), document.getElementById('btnReleaseSeller'), document.getElementById('btnDismiss')];
        buttons.forEach(b => { if(b) b.disabled = true; });

        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/v1/disputes/update-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ disputeId: currentActiveDisputeId, newStatus: finalStatus, resolutionType: resolutionType, staffId: staffId, justification: justification })
        });
        
        const data = await res.json();
        if(data.success) {
            showSuccess(data.message);
            closeDisputeActionModal();
        } else {
            showError("Transaction error: " + data.error);
        }
    } catch(e) {
        showError("API Execution Error.");
    } finally {
        const buttons = [document.getElementById('btnRefundBuyer'), document.getElementById('btnReleaseSeller'), document.getElementById('btnDismiss')];
        buttons.forEach(b => { if(b) b.disabled = false; });
    }
};
