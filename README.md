# 🛡️ Safe Trade Hub

**A secure e-commerce marketplace platform with integrated escrow system**

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white)](https://python.org/)

## 🌟 Features

### 🛍️ **E-Commerce Platform**
- **12 Product Categories** with modern, responsive design
- **Advanced Search & Filtering** system
- **Product Detail Modals** with reviews and specifications
- **Shopping Cart** with localStorage persistence
- **Responsive Grid Layouts** for all screen sizes

### 🔐 **User Management**
- **Firebase Authentication** (Email/Password + Google Sign-In)
- **User Registration & Login** with validation
- **Profile Management** with address and contact info
- **KYC Verification System** with document upload
- **Admin Panel** for user management and moderation

### 🛡️ **Escrow System**
- **Secure Payment Processing** with fund holding
- **5-Step Escrow Workflow**:
  1. Pay & Hold funds
  2. Seller ships to escrow location
  3. Verification at escrow facility
  4. Buyer confirms delivery
  5. Funds released to seller
- **Dispute Resolution** system
- **Order Tracking** and status updates

### 🔔 **Notification System**
- **Firebase Cloud Messaging** integration
- **Push Notifications** for order updates
- **Service Worker** for background notifications
- **User Permission Management**

### 🤖 **AI Chatbot**
- **Flask-based Chatbot API** with FAQ system
- **Contextual Responses** for common queries
- **Embedded Chat Interface** on homepage
- **CORS-enabled** for cross-origin requests

## 🛠️ Technology Stack

### **Frontend**
- **HTML5** - Semantic markup with accessibility features
- **CSS3** - Modern styling with CSS variables and responsive design
- **JavaScript (ES6+)** - Client-side functionality and interactions
- **Firebase SDK v8** - Authentication, Firestore, Cloud Messaging

### **Backend**
- **Node.js + Express.js** - FCM token management server
- **Python + Flask** - Chatbot API server
- **Firebase Admin SDK** - Server-side Firebase operations
- **Gunicorn** - WSGI server for production

### **External Services**
- **Firebase Authentication** - User management
- **Firebase Firestore** - Database
- **Firebase Cloud Messaging** - Push notifications
- **Cloudinary** - Image upload and management
- **Heroku** - Deployment platform

## 🚀 Quick Start

### **Prerequisites**
- Node.js (v14 or higher)
- Python (v3.8 or higher)
- Firebase project setup
- Git

### **Installation**

1. **Clone the repository**
   ```bash
   git clone https://github.com/saimayyazsheikh/SafeTradeHub.git
   cd SafeTradeHub
   ```

2. **Install Node.js dependencies**
   ```bash
   npm install
   ```

3. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure Firebase**
   - Create a Firebase project
   - Add your `serviceaccount.json` file
   - Update Firebase configuration in your HTML files

5. **Start the servers**
   ```bash
   # Start FCM server (Node.js)
   npm start
   
   # Start Chatbot server (Python)
   python app.py
   ```

6. **Open your browser**
   - Navigate to `index.html` or deploy to your preferred hosting platform

## 📁 Project Structure

```
SafeTradeHub/
├── 🏠 Frontend Pages
│   ├── index.html              # Homepage with search & categories
│   ├── auth.html               # Authentication (login/signup)
│   ├── dashboard.html          # User dashboard
│   ├── profile.html            # User profile management
│   ├── verify.html             # KYC verification system
│   ├── admin.html              # Admin panel
│   ├── cart.html               # Shopping cart
│   ├── checkout.html           # Escrow checkout process
│   ├── orderstatus.html        # Order tracking
│   └── search-results.html     # Global search results
│
├── 🛍️ Category Pages (12 categories)
│   ├── category-mobile.html    # Mobile phones & accessories
│   ├── category-camera.html    # Cameras & photography
│   ├── category-computers.html # Computers & laptops
│   ├── category-fashion.html   # Fashion & clothing
│   ├── category-beauty.html    # Beauty & cosmetics
│   ├── category-books.html     # Books & education
│   ├── category-furniture.html  # Furniture & home decor
│   ├── category-gym.html       # Gym & fitness equipment
│   ├── category-home.html      # Home & garden
│   ├── category-services.html  # Professional services
│   ├── category-sports.html    # Sports & outdoor equipment
│   └── category-pets.html      # Pet care products
│
├── 🔧 Backend Services
│   ├── server.js               # Express.js FCM server
│   ├── app.py                  # Flask chatbot server
│   ├── fcm.js                  # Firebase Cloud Messaging utilities
│   └── firebase-messaging-sw.js # Service worker for notifications
│
├── 🎨 Styling & Assets
│   ├── style.css               # Main stylesheet
│   ├── images/                 # Product & UI images
│   └── static/chatbot.html     # Embedded chatbot interface
│
└── ⚙️ Configuration
    ├── package.json            # Node.js dependencies
    ├── requirements.txt        # Python dependencies
    ├── Procfile               # Heroku deployment config
    └── serviceaccount.json    # Firebase service account
```

## 🌐 Live Demo

- **Homepage**: [Safe Trade Hub](https://safetradehub-d797d24354d2.herokuapp.com/)
- **Chatbot**: [AI Assistant](https://safetradehub-d797d24354d2.herokuapp.com/chatbot)

## 📊 Project Statistics

- **Total Files**: 27 core files + 28 images
- **Total Lines of Code**: ~385,230 lines
- **Functions/Classes**: 2,706+ code blocks
- **Firebase Integration**: 112+ references
- **Escrow System**: 274+ implementations

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Saim Ayaz Sheikh**
- GitHub: [@saimayyazsheikh](https://github.com/saimayyazsheikh)
- Project Link: [https://github.com/saimayyazsheikh/SafeTradeHub](https://github.com/saimayyazsheikh/SafeTradeHub)

## 🙏 Acknowledgments

- Firebase for authentication and database services
- Heroku for deployment platform
- All contributors and testers

---

⭐ **Star this repository if you found it helpful!**
