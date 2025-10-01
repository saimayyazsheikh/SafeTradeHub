#!/usr/bin/env node

// Simple API test script for SafeTradeHub
const API_BASE = 'http://localhost:5000';

async function testAPI() {
  console.log('🧪 SafeTradeHub API Test Suite');
  console.log('================================\n');

  try {
    // Test 1: Health Check
    console.log('1. Testing Health Endpoint...');
    const healthResponse = await fetch(`${API_BASE}/health`);
    const healthData = await healthResponse.json();
    
    if (healthData.status === 'OK') {
      console.log('✅ Health check passed');
      console.log(`   Server running on: ${API_BASE}`);
      console.log(`   Environment: ${healthData.environment}\n`);
    } else {
      console.log('❌ Health check failed\n');
      return;
    }

    // Test 2: User Registration
    console.log('2. Testing User Registration...');
    const testUser = {
      name: 'Test User',
      email: `test${Date.now()}@example.com`,
      password: 'password123',
      role: 'Buyer'
    };

    const registerResponse = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testUser)
    });

    const registerData = await registerResponse.json();
    
    if (registerData.success) {
      console.log('✅ User registration successful');
      console.log(`   User ID: ${registerData.data.user.id}`);
      console.log(`   Email: ${registerData.data.user.email}\n`);

      // Test 3: User Login
      console.log('3. Testing User Login...');
      const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: testUser.email,
          password: testUser.password
        })
      });

      const loginData = await loginResponse.json();
      
      if (loginData.success) {
        console.log('✅ User login successful');
        console.log(`   Token received: ${loginData.data.token.substring(0, 20)}...\n`);

        // Test 4: Protected Endpoint
        console.log('4. Testing Protected Endpoint...');
        const meResponse = await fetch(`${API_BASE}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${loginData.data.token}`
          }
        });

        const meData = await meResponse.json();
        
        if (meData.success) {
          console.log('✅ Protected endpoint access successful');
          console.log(`   User: ${meData.data.user.name}\n`);
        } else {
          console.log('❌ Protected endpoint failed\n');
        }

        // Test 5: Products Endpoint
        console.log('5. Testing Products Endpoint...');
        const productsResponse = await fetch(`${API_BASE}/api/products`);
        const productsData = await productsResponse.json();
        
        if (productsData.success) {
          console.log('✅ Products endpoint successful');
          console.log(`   Products found: ${productsData.data.products.length}\n`);
        } else {
          console.log('❌ Products endpoint failed\n');
        }

      } else {
        console.log('❌ User login failed');
        console.log(`   Error: ${registerData.message}\n`);
      }

    } else {
      console.log('❌ User registration failed');
      console.log(`   Error: ${registerData.message}\n`);
    }

    console.log('🎉 API Test Complete!');
    console.log('\n📋 Next Steps:');
    console.log('1. Configure your Firebase service account');
    console.log('2. Update your frontend to use these APIs');
    console.log('3. Test with your actual frontend');
    console.log('4. Deploy to production');

  } catch (error) {
    console.log('❌ API test failed with error:');
    console.log(`   ${error.message}`);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure your backend server is running (npm run backend)');
    console.log('2. Check that port 5000 is available');
    console.log('3. Verify your .env configuration');
  }
}

// Run the test
testAPI();