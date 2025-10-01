// Example configuration file
// Copy this to .env file and fill in your actual values

module.exports = {
  // Environment Configuration
  NODE_ENV: 'development',
  PORT: 5000,
  
  // Frontend URL
  FRONTEND_URL: 'http://localhost:3000',
  
  // Firebase Configuration
  // You need to replace these with your actual Firebase project credentials
  FIREBASE_PROJECT_ID: 'your-firebase-project-id',
  FIREBASE_PRIVATE_KEY_ID: 'your-private-key-id',
  FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nyour-private-key-here\n-----END PRIVATE KEY-----\n',
  FIREBASE_CLIENT_EMAIL: 'your-service-account@your-project.iam.gserviceaccount.com',
  FIREBASE_CLIENT_ID: 'your-client-id',
  FIREBASE_AUTH_URI: 'https://accounts.google.com/o/oauth2/auth',
  FIREBASE_TOKEN_URI: 'https://oauth2.googleapis.com/token',
  FIREBASE_AUTH_PROVIDER_X509_CERT_URL: 'https://www.googleapis.com/oauth2/v1/certs',
  FIREBASE_CLIENT_X509_CERT_URL: 'https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project.iam.gserviceaccount.com',
  
  // MongoDB Configuration
  MONGODB_URI: 'mongodb://localhost:27017/safetradehub',
  MONGODB_URI_PROD: 'your-production-mongodb-uri',
  
  // Redis Configuration (Optional for development)
  REDIS_URL: 'redis://localhost:6379',
  REDIS_PASSWORD: '',
  
  // JWT Secret
  JWT_SECRET: 'your-super-secret-jwt-key-here',
  
  // Other Configuration
  BCRYPT_ROUNDS: 12
};
