document.addEventListener('DOMContentLoaded', () => {
    const auth = firebase.auth();
    const db = firebase.database();

    // Check Auth State
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = 'auth.html?mode=signin';
            return;
        }

        // Setup Event Listeners
        setupSecurityForm(user);
        setupNotificationSettings(user.uid);
        setupAvatarSync(user.uid);
    });

    // 1. SECURITY: Password Update Logic
    function setupSecurityForm(user) {
        const form = document.getElementById('securityForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (newPassword !== confirmPassword) {
                showToast('Error', 'New passwords do not match.', 'error');
                return;
            }

            if (newPassword.length < 6) {
                showToast('Error', 'Password must be at least 6 characters.', 'error');
                return;
            }

            try {
                toggleButtonState('securityForm', true, 'Updating...');
                await user.updatePassword(newPassword);
                
                // Update timestamp in RTDB
                await db.ref(`users/${user.uid}/settings/lastPasswordChange`).set(firebase.database.ServerValue.TIMESTAMP);

                // Push security notification
                await db.ref(`users/${user.uid}/notifications`).push({
                    title: 'Security Alert 🛡️',
                    message: 'Your account password has been updated. If this wasn\'t you, secure your account immediately.',
                    type: 'alert',
                    read: false,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });

                showToast('Success', 'Password updated successfully!', 'success');
                form.reset();
            } catch (error) {
                console.error('Password Update Error:', error);
                if (error.code === 'auth/requires-recent-login') {
                    // Trigger Re-authentication Modal
                    handleReauthentication(user, 'password', newPassword);
                } else {
                    showToast('Error', error.message, 'error');
                }
            } finally {
                toggleButtonState('securityForm', false, 'Update Password');
            }
        });
    }

    // 2. NOTIFICATIONS: Real-time Sync & Toggles
    function setupNotificationSettings(uid) {
        const settingsRef = db.ref(`users/${uid}/settings/notifications`);
        const saveBtn = document.getElementById('saveNotifBtn');

        // Real-time listener for UI state
        settingsRef.on('value', (snapshot) => {
            const data = snapshot.val() || {};
            document.getElementById('emailNotif').checked = data.email !== false;
            document.getElementById('pushNotif').checked = data.push !== false;
            document.getElementById('marketingNotif').checked = data.marketing === true;
        });

        saveBtn.addEventListener('click', async () => {
            try {
                toggleButtonState('saveNotifBtn', true, 'Saving...');
                const settings = {
                    email: document.getElementById('emailNotif').checked,
                    push: document.getElementById('pushNotif').checked,
                    marketing: document.getElementById('marketingNotif').checked,
                    lastUpdated: firebase.database.ServerValue.TIMESTAMP
                };

                await settingsRef.set(settings);
                showToast('Success', 'Preferences saved and synced.', 'success');
            } catch (error) {
                showToast('Error', 'Failed to save settings: ' + error.message, 'error');
            } finally {
                toggleButtonState('saveNotifBtn', false, 'Save Preferences');
            }
        });
    }

    // 3. RE-AUTHENTICATION FLOW
    window.handleReauthentication = function(user, action, data) {
        const modal = document.getElementById('reauthModal');
        const confirmBtn = document.getElementById('confirmReauthBtn');
        const passwordInput = document.getElementById('reauthPassword');

        modal.style.display = 'block';

        const performAction = async () => {
            const password = passwordInput.value;
            if (!password) return;

            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Verifying...';

            try {
                const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
                await user.reauthenticateWithCredential(credential);
                
                closeReauthModal();
                showToast('Identity Verified', 'Finishing your request...', 'info');

                // Retry original action
                if (action === 'password') {
                    await user.updatePassword(data);
                    
                    // Update timestamp
                    await db.ref(`users/${user.uid}/settings/lastPasswordChange`).set(firebase.database.ServerValue.TIMESTAMP);
                    
                    // Push notification (Crucial fix: added to re-auth flow)
                    await db.ref(`users/${user.uid}/notifications`).push({
                        title: 'Security Alert 🛡️',
                        message: 'Your account password has been updated. If this wasn\'t you, secure your account immediately.',
                        type: 'alert',
                        read: false,
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    });

                    showToast('Success', 'Password updated successfully!', 'success');
                    document.getElementById('securityForm').reset();
                } else if (action === 'delete') {
                    await startDeletionProcess();
                }
            } catch (error) {
                showToast('Error', 'Verification failed: ' + error.message, 'error');
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Verify & Continue';
            }
        };

        confirmBtn.onclick = performAction;
    };

    window.closeReauthModal = function() {
        document.getElementById('reauthModal').style.display = 'none';
        document.getElementById('reauthPassword').value = '';
    };

    // 4. THE NUKE: Permanent Account Deletion
    window.confirmDeleteAccount = async function() {
        const confirmed = await window.NotificationManager.showConfirm('⚠️ Permanent Deletion?', 'This action is IRREVERSIBLE. Are you sure you want to permanently delete your account and all associated data?');
        if (confirmed) {
            const user = firebase.auth().currentUser;
            if (!user) return;

            try {
                // Check if re-auth is needed for deletion too
                // Usually user.delete() requires recent login
                await startDeletionProcess();
            } catch (error) {
                if (error.code === 'auth/requires-recent-login') {
                    handleReauthentication(user, 'delete');
                } else {
                    showToast('Critical Error', error.message, 'error');
                }
            }
        }
    };

    async function startDeletionProcess() {
        showToast('System Notice', 'Initiating atomic nuke operations...', 'warning');
        const user = firebase.auth().currentUser;
        const idToken = await user.getIdToken();

        try {
            const response = await fetch('/api/auth/nuke-account', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                }
            });

            const result = await response.json();

            if (result.success) {
                showToast('Success', 'Account nuked. Goodbye, friend.', 'success');
                // Wait for toast then logout & redirect
                setTimeout(async () => {
                    await firebase.auth().signOut();
                    window.location.href = 'index.html';
                }, 2000);
            } else {
                showToast('Error', 'Deletion failed: ' + result.error, 'error');
            }
        } catch (error) {
            showToast('Error', 'Nuke API unreachable: ' + error.message, 'error');
        }
    }

    // UTILITIES
    function toggleButtonState(id, isLoading, text) {
        let btn = document.getElementById(id);
        if (btn && btn.tagName === 'FORM') {
            btn = btn.querySelector('button[type="submit"]');
        }
        if (!btn) return;
        btn.disabled = isLoading;
        btn.textContent = text;
    }

    function showToast(title, msg, type = 'info') {
        if (window.NotificationManager) {
            window.NotificationManager.showToast(title, msg, type);
        } else {
            alert(title + ": " + msg);
        }
    }

    function setupAvatarSync(uid) {
        // Basic sidebar sync if needed beyond the flicker fix
        db.ref(`users/${uid}`).on('value', (snapshot) => {
            const user = snapshot.val();
            if (user) {
                const nameEl = document.getElementById('userName');
                const roleEl = document.getElementById('userRole');
                if (nameEl) nameEl.textContent = user.name || 'User';
                if (roleEl) roleEl.textContent = user.role || 'Buyer';
            }
        });
    }
});
