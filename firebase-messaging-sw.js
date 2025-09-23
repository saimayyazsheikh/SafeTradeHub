// firebase-messaging-sw.js

// Use Firebase SDK (v8) for service worker
importScripts('https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.0/firebase-messaging.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
  messagingSenderId: '128361296099'  // Your Firebase Sender ID (from the Firebase Console)
});

// Get Firebase Messaging instance
const messaging = firebase.messaging();

// Background notification handler
messaging.onBackgroundMessage(function(payload) {
  // Received background message

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/firebase-logo.png',
  };

  // Show notification
  self.registration.showNotification(notificationTitle, notificationOptions);
});
