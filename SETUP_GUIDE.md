# 🚀 SafeTradeHub Complete Setup Guide

## Step 1: Configure Environment Variables

### 1.1 Create your .env file
```bash
# Copy the example file
copy .env.example .env
```

### 1.2 Get Firebase Credentials

Since you already have Firebase configured in your frontend, you can find these credentials in your `index.js` file:

**From your existing Firebase config:**
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBK-1VZZImDnjmRCXBEzyLAq6AthTZ8yIs",
  authDomain: "safe-trade-hub-a57cb.firebaseapp.com",
  projectId: "safe-trade-hub-a57cb",
  storageBucket: "safe-trade-hub-a57cb.appspot.com",
  messagingSenderId: "509522351934",
  appId: "1:509522351934:web:a9f5624cded8f7a6d93e6f"
};
```

**For the backend, you need to create a Service Account:**

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `safe-trade-hub-a57cb`
3. Go to **Project Settings** (gear icon)
4. Click **Service Accounts** tab
5. Click **Generate new private key**
6. Download the JSON file and save it as `serviceaccount.json` in your project root

### 1.3 Update your .env file

Edit your `.env` file with these values:

```env
# Firebase Configuration (from your existing config)
FIREBASE_PROJECT_ID=safe-trade-hub-a57cb

# JWT Configuration (generate a strong secret)
JWT_SECRET=SafeTradeHub_Super_Secret_Key_2024_Make_This_Very_Long_And_Random_12345
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Application Configuration
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:3000
API_URL=http://localhost:5000

# Admin Configuration (you already have this)
ADMIN_EMAIL=221009@students.au.edu.pk
ADMIN_PASSWORD=Saim@12345

# Basic Settings (these can stay as default for now)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=image/jpeg,image/png,image/webp,application/pdf
ESCROW_HOLD_DURATION_DAYS=7
ESCROW_DISPUTE_DEADLINE_DAYS=14
ESCROW_AUTO_RELEASE_DAYS=21
BCRYPT_SALT_ROUNDS=12
LOG_LEVEL=info

# Optional Services (add these later if needed)
# STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
# CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
# SMTP_USER=your-email@gmail.com
```

## Step 2: Install Dependencies and Start Services

### 2.1 Install Node.js Dependencies
```bash
npm install
```

### 2.2 Install Python Dependencies
```bash
pip install -r requirements.txt
```

### 2.3 Start the Backend Services

**Option A: Start All Services Together**
```bash
npm run dev:all
```

**Option B: Start Services Separately**

Terminal 1 - Backend API:
```bash
npm run backend
```

Terminal 2 - Python Chatbot:
```bash
python app.py
```

Terminal 3 - Original FCM Server (optional):
```bash
npm run dev:frontend
```

## Step 3: Test Your APIs

### 3.1 Check Health Endpoint
Open your browser or use curl:
```bash
curl http://localhost:5000/health
```

You should see:
```json
{
  "status": "OK",
  "message": "SafeTradeHub API is running",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "environment": "development"
}
```

### 3.2 Test User Registration
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123",
    "role": "Buyer"
  }'
```

### 3.3 Test User Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

Save the token from the response for subsequent requests.

### 3.4 Test Protected Endpoint
```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Step 4: Integrate with Your Frontend

### 4.1 Update Frontend API URLs

Your frontend JavaScript files need to point to the new backend. Let's update them:

**Update your frontend to use the new backend APIs:**

1. **Products API**: Replace localStorage with real API calls
2. **Authentication**: Use JWT tokens instead of just Firebase
3. **Orders & Escrow**: Connect to real backend APIs

### 4.2 Example Frontend Integration

Here's how to update your frontend JavaScript to work with the backend:

**For Authentication (update your auth.html JavaScript):**
```javascript
// After successful Firebase login, also login to your backend
const loginToBackend = async (firebaseUser) => {
  try {
    const firebaseToken = await firebaseUser.getIdToken();
    
    const response = await fetch('http://localhost:5000/api/auth/firebase-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        firebaseToken: firebaseToken
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Store the JWT token
      localStorage.setItem('authToken', data.data.token);
      localStorage.setItem('refreshToken', data.data.refreshToken);
      
      // Redirect to main page
      window.location.href = 'index.html';
    }
  } catch (error) {
    console.error('Backend login failed:', error);
  }
};
```

**For API Requests (create a helper function):**
```javascript
// Add this to your app-state.js
const apiRequest = async (endpoint, options = {}) => {
  const token = localStorage.getItem('authToken');
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    }
  };
  
  const response = await fetch(`http://localhost:5000${endpoint}`, {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers
    }
  });
  
  if (response.status === 401) {
    // Token expired, redirect to login
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    window.location.href = 'auth.html';
    return;
  }
  
  return response.json();
};
```

**For Products (update your product loading):**
```javascript
// Replace static product data with API calls
const loadProducts = async (category = null) => {
  try {
    const params = category ? `?category=${category}` : '';
    const data = await apiRequest(`/api/products${params}`);
    
    if (data.success) {
      displayProducts(data.data.products);
    }
  } catch (error) {
    console.error('Failed to load products:', error);
  }
};
```

### 4.3 Update Your HTML Files

Add this script to the bottom of your HTML files to include the API helper:

```html
<script>
// API Helper Function
const API_BASE_URL = 'http://localhost:5000';

window.apiRequest = async (endpoint, options = {}) => {
  const token = localStorage.getItem('authToken');
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    }
  };
  
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers
      }
    });
    
    if (response.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('refreshToken');
      if (!window.location.pathname.includes('auth.html')) {
        window.location.href = 'auth.html';
      }
      return null;
    }
    
    return response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
};

// Check if user is authenticated
window.isAuthenticated = () => {
  return !!localStorage.getItem('authToken');
};
</script>
```

## Step 5: Deploy to Production

### 5.1 Prepare for Production

1. **Update Environment Variables:**
```env
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://your-domain.com
API_URL=https://your-api-domain.com
```

2. **Install PM2 for Process Management:**
```bash
npm install -g pm2
```

3. **Create PM2 Configuration:**
```json
{
  "apps": [
    {
      "name": "safetradehub-backend",
      "script": "backend/app.js",
      "env": {
        "NODE_ENV": "development"
      },
      "env_production": {
        "NODE_ENV": "production"
      }
    },
    {
      "name": "safetradehub-chatbot",
      "script": "app.py",
      "interpreter": "python3"
    }
  ]
}
```

### 5.2 Deploy Options

**Option A: Heroku Deployment**
```bash
# Install Heroku CLI
# Create Heroku app
heroku create your-app-name

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-secret
# ... add all your environment variables

# Deploy
git add .
git commit -m "Deploy SafeTradeHub backend"
git push heroku main
```

**Option B: VPS Deployment**
```bash
# On your server
git clone your-repo
cd SafeTradeHub
npm install
pip install -r requirements.txt

# Start with PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

## 🎯 Quick Test Checklist

- [ ] ✅ Environment variables configured
- [ ] ✅ Dependencies installed
- [ ] ✅ Backend server starts (port 5000)
- [ ] ✅ Health endpoint responds
- [ ] ✅ User registration works
- [ ] ✅ User login works
- [ ] ✅ Protected endpoints work with token
- [ ] ✅ Frontend connects to backend
- [ ] ✅ Real-time features work

## 🆘 Troubleshooting

### Common Issues:

1. **Port 5000 already in use:**
   ```bash
   # Change port in .env
   PORT=5001
   ```

2. **Firebase connection issues:**
   - Ensure `serviceaccount.json` is in project root
   - Check Firebase project settings
   - Verify environment variables

3. **CORS errors:**
   - Update `FRONTEND_URL` in .env
   - Check your frontend URL

4. **Token issues:**
   - Clear localStorage and try again
   - Check JWT_SECRET is set

---

🎉 **You're all set!** Your SafeTradeHub is now fully functional with a complete backend system!