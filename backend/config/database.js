const admin = require('firebase-admin');
const redis = require('redis');
const mongoose = require('mongoose');
const { logger } = require('./logger');

// Firebase Admin SDK Configuration
const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  clientId: process.env.FIREBASE_CLIENT_ID,
  authUri: process.env.FIREBASE_AUTH_URI,
  tokenUri: process.env.FIREBASE_TOKEN_URI,
  authProviderX509CertUrl: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  clientX509CertUrl: process.env.FIREBASE_CLIENT_X509_CERT_URL,
};

// Initialize Firebase Admin
if (!admin.apps.length) {
  // Check if Firebase credentials are available
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(firebaseConfig),
        storageBucket: `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
      });
      logger.info('✅ Firebase Admin initialized successfully');
    } catch (error) {
      logger.error('❌ Firebase Admin initialization failed:', error.message);
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
    }
  } else {
    logger.warn('⚠️ Firebase credentials not found. Running without Firebase in development mode.');
  }
}

// Initialize Redis Client
let redisClient;
const initRedis = async () => {
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL,
      password: process.env.REDIS_PASSWORD,
    });

    redisClient.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('✅ Redis connected successfully');
    });

    await redisClient.connect();
  } catch (error) {
    logger.error('❌ Redis connection failed:', error);
    // Continue without Redis in development
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
  }
};

// MongoDB Connection
const connectMongoDB = async () => {
  try {
    const mongoURI = process.env.NODE_ENV === 'production' 
      ? process.env.MONGODB_URI_PROD 
      : process.env.MONGODB_URI;
      
    if (!mongoURI) {
      logger.warn('MongoDB URI not provided, using Firebase only');
      return;
    }

    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    logger.info('✅ MongoDB connected successfully');
  } catch (error) {
    logger.error('❌ MongoDB connection failed:', error);
    // Continue without MongoDB, use Firebase only
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
  }
};

// Database Collections
let db = null;
let collections = {};

if (admin.apps.length > 0) {
  db = admin.firestore();
  collections = {
    users: db.collection('users'),
    products: db.collection('products'),
    categories: db.collection('categories'),
    orders: db.collection('orders'),
    escrows: db.collection('escrows'),
    disputes: db.collection('disputes'),
    messages: db.collection('messages'),
    notifications: db.collection('notifications'),
    adminLogs: db.collection('admin_logs'),
    payments: db.collection('payments'),
    chatThreads: db.collection('chat_threads'),
    reviews: db.collection('reviews'),
    reports: db.collection('reports'),
  };
} else {
  logger.warn('⚠️ Firebase not initialized. Collections will be null.');
}

// Database Helper Functions
const dbHelpers = {
  // Generic CRUD operations
  async create(collection, data, id = null) {
    if (!collection) {
      throw new Error('Firebase not initialized. Cannot create document.');
    }
    try {
      const docRef = id ? collection.doc(id) : collection.doc();
      const docId = docRef.id;
      
      const docData = {
        ...data,
        id: docId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await docRef.set(docData);
      return { id: docId, ...docData };
    } catch (error) {
      throw new Error(`Failed to create document: ${error.message}`);
    }
  },

  async getById(collection, id) {
    if (!collection) {
      throw new Error('Firebase not initialized. Cannot get document.');
    }
    try {
      const doc = await collection.doc(id).get();
      if (!doc.exists) {
        throw new Error('Document not found');
      }
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Failed to get document: ${error.message}`);
    }
  },

  async update(collection, id, data) {
    if (!collection) {
      throw new Error('Firebase not initialized. Cannot update document.');
    }
    try {
      const docRef = collection.doc(id);
      const updateData = {
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      await docRef.update(updateData);
      return { id, ...updateData };
    } catch (error) {
      throw new Error(`Failed to update document: ${error.message}`);
    }
  },

  async delete(collection, id) {
    if (!collection) {
      throw new Error('Firebase not initialized. Cannot delete document.');
    }
    try {
      await collection.doc(id).delete();
      return { id, deleted: true };
    } catch (error) {
      throw new Error(`Failed to delete document: ${error.message}`);
    }
  },

  async query(collection, conditions = [], orderBy = null, limit = null) {
    if (!collection) {
      throw new Error('Firebase not initialized. Cannot query documents.');
    }
    try {
      let query = collection;
      
      // Apply conditions
      conditions.forEach(condition => {
        const { field, operator, value } = condition;
        query = query.where(field, operator, value);
      });
      
      // Apply ordering
      if (orderBy) {
        query = query.orderBy(orderBy.field, orderBy.direction || 'asc');
      }
      
      // Apply limit
      if (limit) {
        query = query.limit(limit);
      }
      
      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      throw new Error(`Failed to query documents: ${error.message}`);
    }
  },

  // Batch operations
  async batchCreate(collection, dataArray) {
    if (!collection || !db) {
      throw new Error('Firebase not initialized. Cannot batch create documents.');
    }
    try {
      const batch = db.batch();
      const results = [];
      
      dataArray.forEach((data, index) => {
        const docRef = collection.doc();
        const docId = docRef.id;
        const docData = {
          ...data,
          id: docId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        
        batch.set(docRef, docData);
        results.push({ id: docId, ...docData });
      });
      
      await batch.commit();
      return results;
    } catch (error) {
      throw new Error(`Failed to batch create documents: ${error.message}`);
    }
  },

  // Transaction support
  async runTransaction(updateFunction) {
    if (!db) {
      throw new Error('Firebase not initialized. Cannot run transaction.');
    }
    try {
      return await db.runTransaction(updateFunction);
    } catch (error) {
      throw new Error(`Transaction failed: ${error.message}`);
    }
  }
};

// Cache Helper Functions
const cacheHelpers = {
  async get(key) {
    if (!redisClient) return null;
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  },

  async set(key, value, ttl = 3600) {
    if (!redisClient) return false;
    try {
      await redisClient.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  },

  async del(key) {
    if (!redisClient) return false;
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  },

  async exists(key) {
    if (!redisClient) return false;
    try {
      const result = await redisClient.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }
};

module.exports = {
  admin,
  db,
  mongoose,
  collections,
  dbHelpers,
  cacheHelpers,
  initRedis,
  connectMongoDB,
  redisClient: () => redisClient,
};
