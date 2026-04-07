/* ========================================
   STAFF-PROFILE.JS - Native Firebase Edition
   ======================================== */

let currentUser = null;
let staffData = null;

/**
 * Initialize Profile logic once AuthManager is ready
 */
async function initProfile() {
    if (window.AuthManager) {
        await window.AuthManager.waitForInit();
        
        window.AuthManager.onAuthStateChange(async (user, isAuthenticated) => {
            if (!isAuthenticated || !user) {
                window.location.href = 'staff-login.html';
                return;
            }
            currentUser = user;
            await loadStaffData();
        });
    } else {
        console.error('❌ AuthManager not found.');
    }
}

/**
 * Load staff-specific metadata
 */
async function loadStaffData() {
    try {
        const snapshot = await firebase.database().ref('staff_registry/' + currentUser.uid).once('value');
        staffData = snapshot.val();

        if (!staffData) {
            window.NotificationManager.showToast('Access Denied', 'Registry identification failed.', 'error');
            if (window.AuthManager) await window.AuthManager.signOut();
            window.location.href = 'staff-login.html';
            return;
        }

        populateUI(staffData);
    } catch (error) {
        console.error('Error:', error);
        window.NotificationManager.showToast('Data Error', 'Failed to synchronize personnel records.', 'error');
    }
}

/**
 * Update UI elements
 */
function populateUI(data) {
    const name = data.fullName || data.name || data.displayName || 'Authorized Personnel';
    const rawRoles = Array.isArray(data.roles) ? data.roles : (typeof data.roles === 'string' ? data.roles.split(',') : [data.role || 'Staff']);
    const primaryRole = rawRoles[0] || 'Staff';

    // Sidebar & Identity
    document.getElementById('profileNameSide').innerText = name;
    document.getElementById('profileRoleSide').innerText = primaryRole;
    document.getElementById('profileName').innerText = name;
    document.getElementById('profileUsername').innerText = data.username || 'UNAVAILABLE';
    document.getElementById('profileEmail').innerText = data.email || currentUser.email;
    document.getElementById('profileRoles').innerText = rawRoles.join(', ');
    document.getElementById('profileHub').innerText = data.hub || 'Global Command';
    document.getElementById('profileJoined').innerText = data.joinedAt || data.createdAt || 'N/A';
    document.getElementById('profileUID').innerText = currentUser.uid;

    const avatarImg = document.getElementById('profileImgLarge');
    const removeBtn = document.getElementById('removeAvatarBtn');
    
    if (data.profileImage) {
        avatarImg.src = data.profileImage;
        if (removeBtn) removeBtn.style.display = 'block';
    } else {
        avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff&size=200&bold=true`;
        if (removeBtn) removeBtn.style.display = 'none';
    }
}

/**
 * Custom Confirmation Logic
 */
function showConfirmModal(title, message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmTitle').innerText = title;
    document.getElementById('confirmMessage').innerText = message;
    
    const confirmBtn = document.getElementById('confirmActionBtn');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    newConfirmBtn.onclick = () => {
        onConfirm();
        hideConfirmModal();
    };
    
    modal.classList.add('show');
}

function hideConfirmModal() {
    document.getElementById('confirmModal').classList.remove('show');
}

/**
 * Trigger file selection
 */
function triggerImageUpload() {
    document.getElementById('avatarInput').click();
}

/**
 * Atomic Persistence via Backend Proxy (Bypasses rules for safety)
 */
async function persistProfileUpdates(updates) {
    try {
        const response = await fetch('/api/v1/staff/profile/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: currentUser.uid, updates: updates })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        return result;
    } catch (err) {
        throw err;
    }
}

/**
 * Handle Professional Native Firebase Storage Upload
 */
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        window.NotificationManager.showToast('Uploading Profile Photo', 'Initiating secure Firebase upload...', 'info');

        // Target path: staff/avatars/{uid}/{filename}
        const storageRef = firebase.storage().ref();
        const timestamp = Date.now();
        const fileRef = storageRef.child(`staff/avatars/${currentUser.uid}/${timestamp}_${file.name}`);

        // Start Upload
        const uploadTask = fileRef.put(file);

        // Monitor Upload
        uploadTask.on('state_changed', 
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                
            }, 
            (error) => {
                console.error('❌ Storage Error:', error);
                window.NotificationManager.showToast('Upload Failure', error.message, 'error');
            }, 
            async () => {
                // Upload success -> Get Download URL
                const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                
                // Persist URL to Realtime Database via Proxy
                await persistProfileUpdates({ profileImage: downloadURL });
                
                window.NotificationManager.showToast('Success', 'Profile Photo Uploaded Successfully', 'success');
                await loadStaffData();
            }
        );
    } catch (error) {
        window.NotificationManager.showToast('Upload Failure', error.message, 'error');
    } finally {
        event.target.value = '';
    }
}

/**
 * Remove Avatar
 */
function prepareRemoveAvatar() {
    showConfirmModal(
        'Remove Profile Photo',
        'This action will revert your profile picture to the system default initials. Do you wish to proceed?',
        removeAvatar
    );
}

async function removeAvatar() {
    try {
        window.NotificationManager.showToast('Updating', 'Expunging avatar from registry...', 'info');
        await persistProfileUpdates({ profileImage: null });
        window.NotificationManager.showToast('Success', 'Profile Photo Removed', 'success');
        await loadStaffData();
    } catch (error) {
        window.NotificationManager.showToast('Registry Error', 'Failed to expunge asset record.', 'error');
    }
}

/**
 * Password Management
 */
function showPasswordModal() {
    document.getElementById('passwordModal').classList.add('show');
}
function hidePasswordModal() {
    document.getElementById('passwordModal').classList.remove('show');
    document.getElementById('passwordForm').reset();
}

async function handlePasswordChange(event) {
    event.preventDefault();
    const currentPass = document.getElementById('currentPassword').value;
    const newPass = document.getElementById('newPassword').value;
    const confirmPass = document.getElementById('confirmPassword').value;

    if (newPass !== confirmPass) {
        window.NotificationManager.showToast('Hashing Error', 'Passwords must match.', 'error');
        return;
    }

    try {
        window.NotificationManager.showToast('Security', 'Validating current credentials...', 'info');
        const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, currentPass);
        await firebase.auth().currentUser.reauthenticateWithCredential(credential);
        await firebase.auth().currentUser.updatePassword(newPass);
        window.NotificationManager.showToast('Success', 'Password Updated Successfully', 'success');
        hidePasswordModal();
    } catch (error) {
        let msg = (error.code === 'auth/wrong-password') ? 'Current password is incorrect.' : 'Failed to update password.';
        window.NotificationManager.showToast('Security Violation', msg, 'error');
    }
}

// Start
initProfile();
