// fcm.js

const admin = require('firebase-admin');
const serviceAccount = require('./backend/config/serviceAccountKey.json');  // Updated path

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://safetradehub-def1d-default-rtdb.firebaseio.com",
  storageBucket: "safetradehub-def1d.firebasestorage.app"
});

const db = admin.database();

function sendNotification(fcmToken, title, body) {
  const message = {
    token: fcmToken,
    notification: {
      title,
      body
    }
  };

  admin.messaging().send(message)
    .then(response => {
      console.log('Notification sent successfully');
    })
    .catch(error => {
      console.error('Error sending message:', error);
    });
}

function testSendNotification(userId) {
  const userRef = db.ref('users/' + userId);
  userRef.once('value')
    .then(snapshot => {
      if (snapshot.exists()) {
        const fcmToken = snapshot.val().fcmToken;
        sendNotification(fcmToken, 'Test Notification', 'This is a test push notification.');
      } else {
        console.log('User not found');
      }
    })
    .catch(error => {
      console.error('Error retrieving user:', error);
    });
}

// Uncomment the line below to test notifications (for development only)
// testSendNotification('user-id');

// Export functions for use in other modules
module.exports = {
  sendNotification,
  testSendNotification
};
