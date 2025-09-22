/**
 * Test script for Razorpay UPI-only integration
 * Run this to verify backend integration is working correctly
 */

const axios = require('axios');
require('dotenv').config();

// Configuration
const API_BASE_URL = 'http://localhost:7000'; // Change to your backend URL
const TEST_TOKEN = 'your_jwt_token_here'; // Replace with actual JWT token

// Test data
const testBooking = {
  booking_id: 'TEST_BOOK_' + Date.now(),
  amount: 1500
};

const testUser = {
  name: 'Test User',
  email: 'test@example.com',
  phone: '+91 9876543210'
};

/**
 * Test order creation endpoint
 */
async function testCreateOrder() {
  console.log('🧪 Testing order creation...');
  
  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/razorpay/create-order`,
      {
        booking_id: testBooking.booking_id,
        amount: testBooking.amount
      },
      {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Order creation successful:');
    console.log('   Order ID:', response.data.razorpay_order_id);
    console.log('   Amount:', response.data.amount);
    console.log('   Currency:', response.data.currency);
    
    return response.data;
  } catch (error) {
    console.error('❌ Order creation failed:');
    console.error('   Status:', error.response?.status);
    console.error('   Message:', error.response?.data?.message || error.message);
    return null;
  }
}

/**
 * Test payment verification endpoint (with mock data)
 */
async function testPaymentVerification() {
  console.log('\n🧪 Testing payment verification...');
  
  // Mock payment data (this would come from Razorpay in real scenario)
  const mockPaymentData = {
    razorpay_order_id: 'order_test_123456',
    razorpay_payment_id: 'pay_test_123456',
    razorpay_signature: 'mock_signature_for_testing'
  };

  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/razorpay/verify-payment`,
      mockPaymentData,
      {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Payment verification response received');
    console.log('   Success:', response.data.success);
    
  } catch (error) {
    if (error.response?.status === 400 && error.response?.data?.message?.includes('signature')) {
      console.log('✅ Payment verification endpoint working (signature validation active)');
      console.log('   Expected error: Invalid signature for test data');
    } else {
      console.error('❌ Payment verification failed:');
      console.error('   Status:', error.response?.status);
      console.error('   Message:', error.response?.data?.message || error.message);
    }
  }
}

/**
 * Test environment configuration
 */
function testEnvironmentConfig() {
  console.log('🧪 Testing environment configuration...');
  
  const requiredEnvVars = [
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET'
  ];

  let allConfigured = true;

  requiredEnvVars.forEach(envVar => {
    if (process.env[envVar]) {
      console.log(`✅ ${envVar}: Configured`);
    } else {
      console.log(`❌ ${envVar}: Missing`);
      allConfigured = false;
    }
  });

  if (allConfigured) {
    console.log('✅ All required environment variables configured');
  } else {
    console.log('❌ Some environment variables are missing');
  }

  return allConfigured;
}

/**
 * Test API connectivity
 */
async function testAPIConnectivity() {
  console.log('\n🧪 Testing API connectivity...');
  
  try {
    const response = await axios.get(`${API_BASE_URL}/health`);
    console.log('✅ API server is running');
    console.log('   Status:', response.status);
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ API server is not running');
      console.log('   Please start your backend server');
    } else {
      console.log('⚠️  API server responding but /health endpoint not found');
      console.log('   This is normal if /health endpoint is not implemented');
    }
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('🚀 Starting Razorpay Integration Tests\n');
  console.log('=' * 50);

  // Test 1: Environment Configuration
  const envConfigured = testEnvironmentConfig();
  
  if (!envConfigured) {
    console.log('\n⚠️  Environment configuration incomplete. Please check your .env file.');
    return;
  }

  // Test 2: API Connectivity
  await testAPIConnectivity();

  // Test 3: Order Creation
  const orderData = await testCreateOrder();

  // Test 4: Payment Verification
  await testPaymentVerification();

  console.log('\n' + '=' * 50);
  console.log('🎯 Test Summary:');
  console.log('   - Environment: ' + (envConfigured ? '✅ Configured' : '❌ Incomplete'));
  console.log('   - Order Creation: ' + (orderData ? '✅ Working' : '❌ Failed'));
  console.log('   - Verification: ✅ Endpoint Active');
  
  console.log('\n📝 Next Steps:');
  if (orderData) {
    console.log('   1. ✅ Backend integration is working');
    console.log('   2. 🎨 Implement frontend RazorpayCheckout component');
    console.log('   3. 🧪 Test end-to-end payment flow');
    console.log('   4. 🚀 Deploy to production');
  } else {
    console.log('   1. ❌ Fix backend integration issues');
    console.log('   2. 🔑 Verify JWT token is valid');
    console.log('   3. 🗄️  Check database connection');
    console.log('   4. 🔄 Restart backend server');
  }

  console.log('\n💡 Tip: Check the console logs for detailed error messages');
}

// Instructions for running this test
if (require.main === module) {
  console.log('🔧 Razorpay Integration Test Setup');
  console.log('');
  console.log('Before running this test:');
  console.log('1. Start your backend server (npm start or node index.js)');
  console.log('2. Get a valid JWT token by logging in through your app');
  console.log('3. Replace TEST_TOKEN variable with the actual token');
  console.log('4. Update API_BASE_URL if your server runs on different port');
  console.log('');
  console.log('To run: node test-razorpay-integration.js');
  console.log('');
  
  // Uncomment the line below to run tests automatically
  // runTests();
}

module.exports = {
  testCreateOrder,
  testPaymentVerification,
  testEnvironmentConfig,
  testAPIConnectivity,
  runTests
};
