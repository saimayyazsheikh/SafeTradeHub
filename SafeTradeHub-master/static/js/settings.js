document.addEventListener('DOMContentLoaded', () => {
    const auth = firebase.auth();
    const db = firebase.database();

    // Check Auth State
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = 'auth.html?mode=signin';
            return;
        }

        // Load User Data
        loadUserData(user.uid);

        // Setup Event Listeners

        setupSecurityForm(user);
        setupNotificationSettings(user.uid);
    });

    // Load User Data
    async function loadUserData(uid) {
        try {
            const snapshot = await db.ref('users/' + uid).once('value');
            const userData = snapshot.val();

            if (userData) {


                // Populate Notification Settings
                if (userData.settings && userData.settings.notifications) {
                    document.getElementById('emailNotif').checked = userData.settings.notifications.email !== false;
                    document.getElementById('pushNotif').checked = userData.settings.notifications.push !== false;
                    document.getElementById('marketingNotif').checked = userData.settings.notifications.marketing === true;
                }
            }
        } catch (error) {
            console.error('Error loading user settings:', error);
            alert('Failed to load settings. Please try again.');
        }
    }



    // Security Form Handler
    function setupSecurityForm(user) {
        const form = document.getElementById('securityForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const btn = form.querySelector('button');

            if (newPassword !== confirmPassword) {
                alert('New passwords do not match.');
                return;
            }

            if (newPassword.length < 6) {
                alert('Password must be at least 6 characters long.');
                return;
            }

            const originalText = btn.textContent;
            btn.textContent = 'Updating...';
            btn.disabled = true;

            try {
                await user.updatePassword(newPassword);
                alert('Password updated successfully!');
                form.reset();
            } catch (error) {
                console.error('Error updating password:', error);
                if (error.code === 'auth/requires-recent-login') {
                    alert('For security, please sign out and sign in again to change your password.');
                } else {
                    alert('Failed to update password: ' + error.message);
                }
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    }

    // Notification Settings Handler
    function setupNotificationSettings(uid) {
        const btn = document.getElementById('saveNotifBtn');
        btn.addEventListener('click', async () => {
            const originalText = btn.textContent;
            btn.textContent = 'Saving...';
            btn.disabled = true;

            const settings = {
                email: document.getElementById('emailNotif').checked,
                push: document.getElementById('pushNotif').checked,
                marketing: document.getElementById('marketingNotif').checked
            };

            try {
                await db.ref('users/' + uid + '/settings/notifications').set(settings);
                alert('Notification preferences saved!');
            } catch (error) {
                console.error('Error saving notifications:', error);
                alert('Failed to save preferences: ' + error.message);
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    }
});

// Account Deletion
async function confirmDeleteAccount() {
    if (confirm('Are you ABSOLUTELY sure? This action cannot be undone. All your data will be permanently deleted.')) {
        const user = firebase.auth().currentUser;
        if (user) {
            try {
                // Delete user data from RTDB first
                await firebase.database().ref('users/' + user.uid).remove();

                // Delete user authentication
                await user.delete();

                alert('Your account has been deleted.');
                window.location.href = 'index.html';
            } catch (error) {
                console.error('Error deleting account:', error);
                if (error.code === 'auth/requires-recent-login') {
                    alert('For security, please sign out and sign in again to delete your account.');
                } else {
                    alert('Failed to delete account: ' + error.message);
                }
            }
        }
    }
}
