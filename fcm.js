// fcm.js

const admin = require('firebase-admin');
const serviceAccount = require('./serviceaccount.json');  // Your service account file path

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // Uncomment and set if using realtime database
  // databaseURL: 'https://your-database-name.firebaseio.com'
});

const db = admin.firestore();

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
  const userRef = db.collection('users').doc(userId);
  userRef.get()
    .then(doc => {
      if (doc.exists) {
        const fcmToken = doc.data().fcmToken;
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
