# SafeTradeHub Code Index

## Project Overview
SafeTradeHub is a secure marketplace platform with an integrated escrow system, built with a Flask backend and a Firebase-powered frontend. The platform features AI-powered image verification, পাকিস্তান-specific logistics tracking, a digital wallet with withdrawal capabilities, and robust admin/staff dashboards.

## Technology Stack

### Backend
- **Python 3.x** (Flask framework)
- **Firebase Admin SDK** (Authentication, Realtime Database, Cloud Messaging)
- **Google Cloud Vision API** (AI image verification)
- **Web Scraping** (BeautifulSoup, Selenium) for price comparison analytics
- **Dependencies**: flask-cors, firebase-admin, google-cloud-vision, requests, beautifulsoup4, selenium, webdriver_manager

### Frontend
- **Vanilla JavaScript** (Firebase SDK v8.10.0)
- **HTML5/CSS3** (Custom design system with Glassmorphism and modern aesthetics)
- **Firebase Services**: Auth, Realtime Database (RTDB), Storage, Messaging
- **Architecture**: Modular custom JS architecture without external frameworks (React/Vue)

### Infrastructure
- **Firebase Hosting** (Static frontend assets)
- **Firebase Realtime Database** (Primary data store for real-time features)
- **Cloud Storage** (Product images and transaction proof slips)

## Project Structure

### Root Files
- `app.py` (~1047 lines) - Core Flask API server
- `package.json` - Node dependencies for local dev/Express proxies
- `requirements.txt` - Python dependencies
- `CODE_INDEX.md` - This documentation
- `SYNC_JS.py` - Utility to synchronize JS modules
- `DIAG_STAFF.PY` - Staff diagnostic utility
- `TEST_WITHDRAWAL_FIX.JS` - Testing suite for the financial engine
- `database.rules.json`, `firestore.rules`, `storage.rules` - Security configurations

### Backend (`/backend/`)
- `app.py` - Main application logic
  - **Auth**: `admin_required`, `staff_required` decorators
  - **Endpoints**: 60+ routes covering Users, Products, Orders, Escrow, Logistics, AI, and Wallets
- `services/ai_service.py` - Image moderation logic
- `services/price_comparison/` - Scrapers and matching algorithms
- `logistics_constants.py` - Hub locations and state-machine definitions

### Frontend Static Files (`/static/`)
#### CSS (`/static/css/`)
- `style.css` (~2876 lines) - Primary design system and global styles
- `dashboard.css`, `admin-dashboard.css`, `messages.css` - Feature-specific styling

#### JavaScript (`/static/js/`)
- **Core**: `firebase-config.js`, `auth-manager.js`, `app-state.js`, `header-manager.js`
- **Dashboards**: `dashboard.js`, `admin-dashboard.js` (3700+ lines), `staff-dashboard.js` (3800+ lines)
- **Engines**: `escrow-management.js`, `disputes-engine.js`, `logistics-hub-engine.js`, `payment-processing.js`
- **Features**: `product-upload.js`, `wallet.js`, `notification-manager.js`, `chatbot.js`, `messages-manager.js`

### Templates (`/templates/`)
- **Main**: `index.html`, `auth.html`, `dashboard.html`
- **Portals**: `admin-dashboard.html`, `staff-dashboard.html`
- **Categories**: 12 specific category templates (e.g., `category-mobile.html`)
- **Detail**: `product-detail.html`, `orderstatus.html`, `wallet.html`

## Key Implementation Patterns

### 1. Hybrid Backend Architecture
The application uses a dual-communication strategy:
- **Direct Firebase Interaction**: Frontend reads/writes directly to Firebase RTDB for real-time states (e.g., notifications, chat messages) using the Client SDK.
- **Flask Proxy API**: Sensitive operations (e.g., wallet balance updates, AI image scanning, logistics state transitions) are routed through Flask using the Firebase Admin SDK to ensure security and prevent client-side manipulation.

### 2. Digital Escrow Flow
1. **Hold**: Buyer pays -> Flask API locks funds in `escrow` node.
2. **Track**: Staff updates logistics -> RTDB reflects real-time status.
3. **Release**: Order delivered -> Staff/Admin triggers release -> Flask moves funds to Seller's `wallet`.
4. **Dispute**: Buyer flags issue -> Dispute Engine freezes escrow -> Staff moderates.

### 3. Logistics Engine
Powered by `logistics_constants.py` and `logistics-hub-engine.js`, implementing a strict state machine:
`Pending -> Shipped -> Hub Processing -> Out for Delivery -> Delivered`.

### 4. Financial Engine (Wallet)
- **Atomic Operations**: Uses Firebase transactions in `app.py` to ensure balance consistency during withdrawals and deposits.
- **Withdrawal Requests**: Seller requests -> Payout pending -> Admin Approves -> Slip Uploaded -> Balance Deducted.

## API Map (Major Endpoints)
- `POST /api/auth/nuke-account` - Atomic data wipe
- `POST /api/verify-image` - AI Image Moderator
- `POST /api/compare-prices` - Daraz/OLX price scraper
- `POST /api/v1/orders/update-tracking` - Logistics update (Staff only)
- `POST /api/v1/wallet/withdraw` - Withdrawal request initiation
- `POST /api/v1/disputes/update-status` - Dispute resolution engine

## Maintenance Scripts
- `patch_html.py`: Bulk updates to template structures.
- `sync_js.py`: Keeps frontend JS modules in sync across different deployments.
- `diag_staff.py`: Debugging tool for RBAC issues.

## Summary
SafeTradeHub is a production-grade, feature-complete marketplace. The codebase is optimized for real-time performance and security, balancing the speed of Firebase with the reliability of a Python/Flask business logic layer.