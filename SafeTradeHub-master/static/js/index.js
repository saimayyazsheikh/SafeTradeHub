// ========================================
// INDEX.JS - Main JavaScript for index.html
// ========================================

// Chat functionality
function toggleChat() {
  const chatbotContainer = document.getElementById('chatbot-container');
  chatbotContainer.classList.toggle('show');
}

// Minimal JS for the "view more" arrow
(function () {
  const scroller = document.getElementById('recs');
  const next = document.getElementById('recsNext');
  if (scroller && next) {
    next.addEventListener('click', () => {
      scroller.scrollBy({ left: scroller.clientWidth * 0.8, behavior: 'smooth' });
    });
  }
})();

// Firebase Configuration (replace with your Firebase project's config)
const firebaseConfig = {
  apiKey: "AIzaSyB0RraIZr7Z3rjKIYw6dE2g_9Waqll5JvI",
  authDomain: "safetradehub-def1d.firebaseapp.com",
  databaseURL: "https://safetradehub-def1d-default-rtdb.firebaseio.com",
  projectId: "safetradehub-def1d",
  storageBucket: "safetradehub-def1d.firebasestorage.app",
  messagingSenderId: "633146502278",
  appId: "1:633146502278:web:6c82d4a0768daebdd7b507",
  measurementId: "G-1857Q7JPKZ"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get Firebase instances
const auth = firebase.auth();
const db = firebase.database();
const messaging = firebase.messaging();

// Global authentication helper functions
window.isUserLoggedIn = function () {
  // Check Firebase auth state
  if (firebase.auth().currentUser) {
    return true;
  }

  // Check localStorage for auth token as fallback
  const authToken = localStorage.getItem('authToken');
  const userData = localStorage.getItem('userData');

  return !!(authToken && userData);
};

window.showLoginPrompt = function () {
  const shouldRedirect = confirm('Please sign in to add items to your cart. Would you like to go to the login page?');
  if (shouldRedirect) {
    window.location.href = 'auth.html?mode=signin';
  }
};

// Authentication state management
auth.onAuthStateChanged((user) => {
  updateUIForAuthState(user);
});

function updateUIForAuthState(user) {
  const signInLink = document.getElementById('signInLink');
  const joinBtn = document.getElementById('joinBtn');
  const dashboardLink = document.getElementById('dashboardLink');
  const signOutBtn = document.getElementById('signOutBtn');

  if (user) {
    // User is signed in
    if (signInLink) signInLink.style.display = 'none';
    if (joinBtn) joinBtn.style.display = 'none';
    if (dashboardLink) dashboardLink.style.display = 'inline';
    if (signOutBtn) signOutBtn.style.display = 'inline';
  } else {
    // User is signed out
    if (signInLink) signInLink.style.display = 'inline';
    if (joinBtn) joinBtn.style.display = 'inline';
    if (dashboardLink) dashboardLink.style.display = 'none';
    if (signOutBtn) signOutBtn.style.display = 'none';
  }
}

// Sign out function
window.signOut = function () {
  auth.signOut().then(() => {
    // Clear local storage
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userData');

    // Show success message
    if (typeof showNotification === 'function') {
      showNotification('You have been signed out successfully.', 'info');
    }

    // Refresh page to update UI
    window.location.reload();
  }).catch((error) => {
    console.error('Sign out error:', error);
  });
};

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js')  // Ensure the path is correct
    .then(function (registration) {
      // Service Worker registered successfully
      messaging.useServiceWorker(registration);
    })
    .catch(function (error) {
      console.error('Service Worker registration failed:', error);
    });
}

// Request notification permission & get FCM token
async function requestNotificationPermission() {
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await messaging.getToken({
        vapidKey: 'BJ13KKFRdr9XHWWFTGBZc1wSE5gRJaBLtUDH9QJxeCKDG2YolMlbnSrBIkEc_Aein7dq6M1-t9GQtJmUDQVice0' // Replace this with your actual VAPID key from Firebase Console
      });
      // FCM Token obtained successfully
      sendTokenToServer(token);
      alert('Notifications enabled! You\'ll receive updates about your orders and important announcements.');
    } else {
      alert('Notifications are disabled. You can enable them later by clicking the bell icon.');
    }
  } catch (error) {
    console.error('Error getting FCM token:', error);
    alert('Unable to set up notifications. Please try again later.');
  }
}

// Send FCM token to backend
function sendTokenToServer(token) {
  fetch('/save-fcm-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fcmToken: token })
  })
    .then(response => response.json())
    .then(data => {
      // Token saved successfully
    })
    .catch(error => console.error('Error saving token:', error));
}

// Initialize cart count on page load
updateCartCount();
