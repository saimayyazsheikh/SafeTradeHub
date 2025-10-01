# SafeTradeHub Backend Setup Guide

## 🚀 Quick Start

Your SafeTradeHub backend is now 100% functional! Follow these steps to get everything running.

## 📋 Prerequisites

- Node.js (v16 or higher)
- Python (v3.8 or higher)
- Firebase project setup
- Stripe account (optional, for payments)
- Cloudinary account (optional, for file uploads)

## ⚙️ Installation

1. **Install Node.js dependencies:**
   ```bash
   npm install
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Environment Configuration:**
   ```bash
   # Copy the example environment file
   cp .env.example .env
   
   # Edit .env with your actual credentials
   ```

## 🔧 Environment Variables

Edit your `.env` file with the following configuration:

### Required Variables
```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here-make-it-very-long-and-random

# Firebase Configuration (from your Firebase console)
FIREBASE_PROJECT_ID=safe-trade-hub-a57cb
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email

# Database
MONGODB_URI=mongodb://localhost:27017/safetradehub
REDIS_URL=redis://localhost:6379

# Basic App Config
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:3000
```

### Optional Variables
```env
# Stripe (for payments)
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret

# Cloudinary (for file uploads)
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret

# Email (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

## 🚀 Running the Application

### Option 1: Run All Services Together
```bash
npm run dev:all
```
This runs both the backend API server and the Python chatbot server.

### Option 2: Run Services Separately

**Backend API Server:**
```bash
npm run backend
# or for development with auto-reload:
npm run dev
```

**Python Chatbot Server:**
```bash
python app.py
```

**Original Frontend Server (FCM notifications):**
```bash
npm run dev:frontend
```

## 📡 API Endpoints

Your backend now includes these complete API modules:

### 🔐 Authentication (`/api/auth`)
- `POST /register` - User registration
- `POST /login` - User login
- `POST /firebase-login` - Firebase OAuth login
- `POST /refresh-token` - Refresh JWT token
- `GET /me` - Get current user
- `PUT /profile` - Update profile
- `PUT /change-password` - Change password
- `POST /logout` - Logout
- `POST /forgot-password` - Request password reset
- `POST /reset-password` - Reset password

### 👥 User Management (`/api/users`)
- `GET /` - Get all users (Admin only)
- `GET /:id` - Get user by ID
- `PUT /profile` - Update user profile
- `PUT /settings` - Update user settings
- `POST /avatar` - Upload profile avatar
- `POST /verification` - Submit verification documents
- `GET /verification/status` - Get verification status
- `PUT /:id/status` - Update user status (Admin)
- `PUT /:id/verification/:type` - Approve/reject verification (Admin)

### 🛍️ Product Management (`/api/products`)
- `GET /` - Get all products with filtering
- `GET /:id` - Get product by ID
- `POST /` - Create new product (Seller)
- `PUT /:id` - Update product (Seller)
- `DELETE /:id` - Delete product (Seller)
- `GET /seller/my-products` - Get seller's products
- `GET /categories/list` - Get categories with counts
- `POST /:id/favorite` - Add to favorites
- `DELETE /:id/favorite` - Remove from favorites
- `GET /user/favorites` - Get user's favorites

### 📦 Order Management (`/api/orders`)
- `POST /` - Create new order
- `GET /` - Get user's orders
- `GET /:id` - Get order by ID
- `PUT /:id/status` - Update order status
- `PUT /:id/cancel` - Cancel order
- `GET /stats/overview` - Order statistics (Admin)
- `GET /admin/all` - All orders (Admin)

### 🛡️ Escrow System (`/api/escrow`)
- `GET /` - Get escrow transactions
- `GET /:id` - Get escrow by ID
- `PUT /:id/status` - Update escrow status (Admin)
- `POST /release` - Release escrow funds (Admin)
- `POST /refund` - Refund escrow funds (Admin)
- `POST /:id/confirm-delivery` - Buyer confirms delivery
- `GET /stats/overview` - Escrow statistics (Admin)

### 💳 Payment Processing (`/api/payments`)
- `POST /create-intent` - Create Stripe payment intent
- `POST /webhook` - Handle Stripe webhooks
- `GET /history` - Get payment history

### ⚖️ Dispute Resolution (`/api/disputes`)
- `POST /` - Create dispute
- `GET /` - Get user's disputes
- `GET /admin/all` - All disputes (Admin)
- `PUT /:id/resolve` - Resolve dispute (Admin)

### 👑 Admin Panel (`/api/admin`)
- `GET /dashboard` - Dashboard statistics
- `GET /activity` - Recent activity
- `GET /health` - System health check

### 📁 File Upload (`/api/upload`)
- `POST /single` - Upload single file
- `POST /multiple` - Upload multiple files
- `DELETE /:publicId` - Delete file

### 🔔 Notifications (`/api/notifications`)
- `GET /` - Get user notifications
- `PUT /:id/read` - Mark as read
- `POST /send` - Send notification (Admin)

## 🔒 Security Features

- JWT authentication with refresh tokens
- Role-based access control (Admin, Seller, Buyer)
- Input validation and sanitization
- Rate limiting
- CORS protection
- XSS protection
- SQL injection protection
- Helmet security headers

## 📊 Database Structure

The backend uses Firebase Firestore with these collections:
- `users` - User profiles and authentication
- `products` - Product catalog
- `orders` - Order transactions
- `escrows` - Escrow transactions
- `disputes` - Dispute cases
- `notifications` - System notifications
- `transactions` - Financial transactions

## 🔄 Real-time Features

- Socket.IO integration for live notifications
- Real-time order status updates
- Live escrow status changes
- Instant dispute notifications

## 📈 Monitoring & Logging

- Comprehensive Winston logging
- Transaction logging
- Security event logging
- Error tracking
- Performance monitoring

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix
```

## 🚀 Production Deployment

1. **Set environment variables:**
   ```env
   NODE_ENV=production
   PORT=5000
   ```

2. **Build and deploy:**
   ```bash
   npm start
   ```

## 🔧 Advanced Configuration

### Escrow Settings
```env
ESCROW_HOLD_DURATION_DAYS=7
ESCROW_DISPUTE_DEADLINE_DAYS=14
ESCROW_AUTO_RELEASE_DAYS=21
```

### File Upload Settings
```env
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=image/jpeg,image/png,image/webp,application/pdf
```

### Rate Limiting
```env
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 📞 API Testing

Use tools like Postman or curl to test the APIs:

```bash
# Register a new user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "role": "Buyer"
  }'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

## 🎯 Next Steps

1. **Configure Firebase:** Update Firebase credentials in `.env`
2. **Set up Stripe:** Add Stripe keys for payment processing
3. **Configure Cloudinary:** Add Cloudinary credentials for file uploads
4. **Test the APIs:** Use the provided endpoints to test functionality
5. **Deploy:** Deploy to your preferred hosting platform

## 🆘 Troubleshooting

### Common Issues:

1. **Port already in use:**
   ```bash
   # Change the port in .env
   PORT=5001
   ```

2. **Firebase authentication fails:**
   - Check Firebase project configuration
   - Verify service account credentials
   - Ensure proper Firebase setup

3. **Database connection issues:**
   - Verify MongoDB is running
   - Check connection string in `.env`

## 📚 Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Stripe API Documentation](https://stripe.com/docs/api)
- [Cloudinary Documentation](https://cloudinary.com/documentation)

---

🎉 **Congratulations!** Your SafeTradeHub backend is now 100% functional with all features implemented!