// firebase-messaging-sw.js

// Use Firebase SDK (v8) for service worker
importScripts('https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.0/firebase-messaging.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyB0RraIZr7Z3rjKIYw6dE2g_9Waqll5JvI",
  authDomain: "safetradehub-def1d.firebaseapp.com",
  databaseURL: "https://safetradehub-def1d-default-rtdb.firebaseio.com",
  projectId: "safetradehub-def1d",
  storageBucket: "safetradehub-def1d.firebasestorage.app",
  messagingSenderId: "633146502278",
  appId: "1:633146502278:web:6c82d4a0768daebdd7b507",
  measurementId: "G-1857Q7JPKZ"
});

// Get Firebase Messaging instance
const messaging = firebase.messaging();

// Background notification handler
messaging.onBackgroundMessage(function (payload) {
  // Received background message

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/firebase-logo.png',
  };

  // Show notification
  self.registration.showNotification(notificationTitle, notificationOptions);
});
