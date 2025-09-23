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
  apiKey: "AIzaSyBK-1VZZImDnjmRCXBEzyLAq6AthTZ8yIs",
  authDomain: "safe-trade-hub-a57cb.firebaseapp.com",
  projectId: "safe-trade-hub-a57cb",
  storageBucket: "safe-trade-hub-a57cb.appspot.com",   // <-- fix
  messagingSenderId: "509522351934",
  appId: "1:509522351934:web:a9f5624cded8f7a6d93e6f",
  measurementId: "G-060FYYP5DD"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get Firebase Messaging instance
const messaging = firebase.messaging();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js')  // Ensure the path is correct
    .then(function(registration) {
      // Service Worker registered successfully
      messaging.useServiceWorker(registration);
    })
    .catch(function(error) {
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
