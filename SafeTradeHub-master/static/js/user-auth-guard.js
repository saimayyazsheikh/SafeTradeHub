/**
 * USER-AUTH-GUARD.JS
 * Strict isolation for Buyer/Seller portal.
 * Sign out and redirect if user is Admin or Staff.
 */

(function() {
    

    const authCheck = () => {
        const auth = firebase.auth();
        const db = firebase.database();

        auth.onAuthStateChanged(async (user) => {
            if (!user) {
                // Not logged in is fine for index.html, handled by page logic
                return;
            }

            try {
                // 1. Check if user is Staff
                const staffSnap = await db.ref('staff_registry/' + user.uid).once('value');
                if (staffSnap.exists()) {
                    console.warn('Staff user detected in Buyer portal. Redirecting...');
                    window.location.href = 'staff-dashboard.html';
                    return;
                }

                // 2. Check if user is Admin
                const userSnap = await db.ref('users/' + user.uid).once('value');
                const userData = userSnap.val();

                if (userData && userData.role === 'Admin') {
                    console.warn('Admin user detected in Buyer portal. Redirecting...');
                    window.location.href = 'admin-dashboard.html';
                    return;
                }

                if (!userData || (userData.role !== 'Buyer' && userData.role !== 'Seller')) {
                    console.error('Unauthorized role or missing data:', userData?.role);
                    // Optionally force signOut if they have no valid role
                    // await auth.signOut();
                    // window.location.href = 'auth.html';
                }

            } catch (error) {
                console.error('Guard Error:', error);
            }
        });
    };

    // Run when Firebase is ready
    if (window.firebase) {
        authCheck();
    } else {
        document.addEventListener('DOMContentLoaded', authCheck);
    }
})();
