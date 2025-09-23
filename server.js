// Backend server.js code (using Express.js)
const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const app = express();
const port = 3000;

// Firebase Admin SDK setup with your Service Account
const serviceAccount = require('./serviceaccount.json');  // Your service account file path

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // Uncomment and set if using Firebase Realtime Database
  // databaseURL: 'https://your-database-name.firebaseio.com'
});

// Middleware to parse incoming JSON requests
app.use(bodyParser.json());

// Endpoint to receive and save the FCM token
app.post('/save-fcm-token', (req, res) => {
  const fcmToken = req.body.fcmToken;

  if (!fcmToken) {
    return res.status(400).json({ error: 'FCM Token is required' });
  }

  // Save the FCM token to Firestore (or another database)
  const db = admin.firestore();  // Initialize Firestore

  const userRef = db.collection('users').doc('user-id');  // Replace 'user-id' with actual user identifier

  // Store or update the token in the database
  userRef.set({
    fcmToken: fcmToken
  }, { merge: true })
  .then(() => {
    res.status(200).json({ message: 'FCM Token saved successfully' });
  })
  .catch((error) => {
    res.status(500).json({ error: 'Error saving token' });
    console.error(error);
  });
});

// Start the Express server
app.listen(port, () => {
  console.log(`Safe Trade Hub FCM Server running on port ${port}`);
});
