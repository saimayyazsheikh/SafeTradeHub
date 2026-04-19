// --- EMERGENCY STAFF REPAIR MODULE ---
// Re-binds the 'Add Staff' Modal missing functions and re-renders the staff table.

window.addStaff = function() {
    const form = document.getElementById('staffForm');
    if(form) form.reset();
    const idInput = document.getElementById('staffId');
    if(idInput) idInput.value = '';
    
    const title = document.getElementById('staffModalTitle');
    if(title) title.innerText = 'Add New Staff';
    
    document.querySelectorAll('.role-chip').forEach(c => c.classList.remove('selected'));
    
    const modal = document.getElementById('staffModal');
    if(modal) modal.style.display = 'block';
};

window.closeStaffModal = function() {
    const modal = document.getElementById('staffModal');
    if(modal) modal.style.display = 'none';
};

window.toggleRoleChip = function(chip) {
    if(chip) chip.classList.toggle('selected');
};

// Staff Event Listener & Render hook
document.addEventListener('DOMContentLoaded', () => {
    // Re-bind Staff Form Submit
    const staffForm = document.getElementById('staffForm');
    if (staffForm) {
        // Prevent multiple bindings
        staffForm.onsubmit = async function(e) {
            e.preventDefault();
            const btn = staffForm.querySelector('button[type="submit"]');
            const originalText = btn ? btn.innerHTML : 'Save Staff';
            if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; }
            
            try {
                const name = document.getElementById('staffName').value.trim();
                const phone = document.getElementById('staffPhone').value.trim();
                const email = document.getElementById('staffEmail').value.toLowerCase().trim();
                const username = document.getElementById('staffUsername').value.toLowerCase().trim();
                const password = document.getElementById('staffPassword').value;
                const staffId = document.getElementById('staffId').value;
                
                const selectedRoles = Array.from(document.querySelectorAll('.role-chip.selected')).map(c => c.dataset.role);
                
                if (selectedRoles.length === 0) {
                     throw new Error('Please select at least one role/responsibility.');
                }

                if (!staffId && password.length < 6) {
                    throw new Error('Password must be at least 6 characters.');
                }
                
                let uid = staffId;
                
                if (!staffId) {
                    // Create New Staff Member without logging out the Admin
                    // We must use a completely separate Firebase instance to avoid triggering the main auth state listener
                    const tempApp = firebase.initializeApp(firebase.app().options, 'StaffCreator_' + Date.now());
                    const userCredential = await tempApp.auth().createUserWithEmailAndPassword(email, password);
                    uid = userCredential.user.uid;
                    await tempApp.auth().signOut();
                    await tempApp.delete(); // Clean up the temporary instance
                }
                
                const payload = {
                    id: uid,
                    fullName: name,
                    phone: phone,
                    email: email,
                    username: username,
                    roles: selectedRoles,
                    role: selectedRoles.join(', '), 
                    status: 'Active',
                    updatedAt: firebase.database.ServerValue.TIMESTAMP
                };
                
                if (!staffId) payload.createdAt = firebase.database.ServerValue.TIMESTAMP;
                
                await db.ref('staff_registry/' + uid).update(payload);
                
                if(typeof showSuccess === 'function') showSuccess('Staff member saved successfully!');
                closeStaffModal();
                
            } catch (error) {
                console.error('Error saving staff:', error);
                if(typeof showError === 'function') showError(error.message || 'Failed to update staff registry.');
            } finally {
                if(btn) { btn.disabled = false; btn.innerHTML = originalText; }
            }
        };
    }
    
    // Live RTDB listener to automatically push updates to the Staff Table
    try {
        db.ref('staff_registry').on('value', snap => {
            const staffList = [];
            snap.forEach(c => { staffList.push({ id: c.key, ...c.val() }); });
            
            // Assign globally to adminData
            if (typeof adminData !== 'undefined') {
                adminData.staff = staffList.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
                
                // Update specific Stats counter
                const staffLink = document.querySelector('a[data-section="staff"]');
                if(staffLink) {
                    const badge = staffLink.querySelector('.nav-badge');
                    if(badge) badge.innerText = staffList.length;
                }
            }
            
            // Call the shared update function
            window.updateStaffTable();
        });
    } catch (e) {
        console.error("Staff engine listener error:", e);
    }
});

// New searchable render function
window.updateStaffTable = function(searchTerm) {
    const tbody = document.querySelector('#staffTable tbody');
    if (!tbody || typeof adminData === 'undefined') return;

    // Sync state if passed directly
    if (searchTerm !== undefined) adminData.currentSearch.staff = searchTerm;
    const query = (adminData.currentSearch.staff || "").toLowerCase().trim();

    let staffList = adminData.staff || [];

    // Filter based on query
    if (query) {
        staffList = staffList.filter(s => {
            const name = (s.fullName || s.name || "").toLowerCase();
            const user = (s.username || "").toLowerCase();
            const mail = (s.email || "").toLowerCase();
            const roles = Array.isArray(s.roles) ? s.roles.join(' ').toLowerCase() : (s.role || "").toLowerCase();
            const id = (s.id || "").toLowerCase();

            return name.includes(query) || user.includes(query) || mail.includes(query) || roles.includes(query) || id.includes(query);
        });
    }

    if (staffList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center">${query ? 'No matching staff found.' : 'No staff found.'}</td></tr>`;
        return;
    }

    tbody.innerHTML = staffList.map(s => {
        let rolesHtml = '';
        if (Array.isArray(s.roles)) {
            rolesHtml = s.roles.map(r => `<span style="background: #e0e7ff; color: #3730a3; padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; white-space: nowrap;">${r}</span>`).join('');
        } else if (s.role) {
            rolesHtml = `<span style="background: #e0e7ff; color: #3730a3; padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; white-space: nowrap;">${s.role}</span>`;
        } else {
            rolesHtml = `<span style="background: #f3f4f6; color: #4b5563; padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; white-space: nowrap;">General Staff</span>`;
        }
        
        const isActive = s.status === 'Active' || s.status === true;
        return `
            <tr style="border-bottom: 1px solid #f3f4f6; transition: background-color 0.2s;">
            <td style="vertical-align: middle; padding: 16px 12px;"><code style="background: #f3f4f6; padding: 4px 6px; border-radius: 4px; color: #4b5563; font-size: 0.8rem;">${s.id ? s.id.substring(0,8) : 'N/A'}</code></td>
            <td style="vertical-align: middle; padding: 16px 12px; font-weight: 600; color: #111827;">${s.fullName || s.name || 'Unknown'}</td>
            <td style="vertical-align: middle; padding: 16px 12px; color: #6b7280; font-size: 0.9rem;">@${s.username || 'unknown'}</td>
            <td style="vertical-align: middle; padding: 16px 12px; color: #4b5563; font-size: 0.9rem;">${s.email || '-'}</td>
            <td style="vertical-align: middle; padding: 16px 12px;">
                <div style="display: flex; gap: 6px; flex-wrap: wrap; max-width: 250px;">
                    ${rolesHtml}
                </div>
            </td>
            <td style="vertical-align: middle; padding: 16px 12px;">
                <span class="status-badge ${isActive ? 'active' : 'inactive'}" style="padding: 4px 10px; font-size: 0.75rem; border-radius: 20px;">
                    ${isActive ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td style="vertical-align: middle; padding: 16px 12px;">
                <div style="display: flex; gap: 8px; justify-content: flex-start;">
                    <button class="btn btn-sm btn-primary" onclick="editStaff('${s.id}')" style="padding: 6px 12px; display: flex; align-items: center; gap: 5px;"><i class="fas fa-edit"></i> Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteStaff('${s.id}')" style="padding: 6px 10px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-trash"></i></button>
                </div>
            </td>
            </tr>
        `;
    }).join('');
};

window.editStaff = async function(staffId) {
    if(!staffId || typeof adminData === 'undefined') return;
    const staff = adminData.staff.find(s => s.id === staffId);
    if(!staff) return;
    
    document.getElementById('staffId').value = staffId;
    document.getElementById('staffName').value = staff.fullName || staff.name || '';
    document.getElementById('staffPhone').value = staff.phone || '';
    document.getElementById('staffEmail').value = staff.email || '';
    document.getElementById('staffUsername').value = staff.username || '';
    document.getElementById('staffPassword').value = ''; 
    document.getElementById('staffPassword').removeAttribute('required'); // Password optional for edits
    
    document.getElementById('staffModalTitle').innerText = 'Edit Staff Member';
    
    document.querySelectorAll('.role-chip').forEach(c => c.classList.remove('selected'));
    if(staff.roles && Array.isArray(staff.roles)) {
        staff.roles.forEach(r => {
            const chip = document.querySelector(`.role-chip[data-role="${r}"]`);
            if(chip) chip.classList.add('selected');
        });
    } else if (staff.role) {
         const chip = document.querySelector(`.role-chip[data-role="${staff.role}"]`);
         if(chip) chip.classList.add('selected');
    }
    
    document.getElementById('staffModal').style.display = 'block';
};

window.deleteStaff = async function(staffId) {
    if(typeof showConfirmationModal === 'function') {
        const conf = await showConfirmationModal('Delete Staff Member', "Are you sure you want to revoke this staff member's access? This will remove them from the registry.", { confirmText: 'Remove', confirmColor: '#dc2626' });
        if(!conf) return;
    } else {
        if(!confirm('Are you certain you want to revoke staff access?')) return;
    }
    
    try {
        await db.ref('staff_registry/' + staffId).remove();
        if(typeof showSuccess === 'function') showSuccess('Staff removed successfully!');
    } catch(err) {
        if(typeof showError === 'function') showError('Failed to delete staff: ' + err.message);
    }
};
