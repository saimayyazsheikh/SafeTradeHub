// Firebase Configuration
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
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log('🔥 Firebase initialized successfully');
} else {
    console.log('🔥 Firebase already initialized');
}

// Make services available globally if needed
const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();
