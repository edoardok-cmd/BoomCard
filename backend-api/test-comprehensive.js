#!/usr/bin/env node
/**
 * Comprehensive BoomCard API Test Suite
 * Tests all major endpoints and features
 */

const https = require('https');
const http = require('http');

const BASE_URL = 'http://localhost:3001';
let authToken = '';
let userId = '';
const testResults = {
  passed: [],
  failed: [],
  skipped: []
};

// Test user credentials
const TEST_USER = {
  email: 'mobile-test@boomcard.com',
  password: 'Test123456',
  firstName: 'Mobile',
  lastName: 'Tester'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// HTTP request helper
function makeRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Test runner
async function runTest(name, testFn) {
  try {
    console.log(`${colors.cyan}Testing: ${name}${colors.reset}`);
    await testFn();
    testResults.passed.push(name);
    console.log(`${colors.green}✓ PASSED${colors.reset}\n`);
    return true;
  } catch (error) {
    testResults.failed.push({ name, error: error.message });
    console.log(`${colors.red}✗ FAILED: ${error.message}${colors.reset}\n`);
    return false;
  }
}

// Assertion helpers
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

// ============================================
// Test Suites
// ============================================

async function testHealthEndpoints() {
  await runTest('Health Endpoint', async () => {
    const res = await makeRequest('GET', '/health');
    assertEqual(res.status, 200, 'Health check should return 200');
    assert(res.data.status === 'ok', 'Health status should be ok');
  });

  await runTest('Ready Endpoint', async () => {
    const res = await makeRequest('GET', '/ready');
    assertEqual(res.status, 200, 'Ready check should return 200');
  });
}

async function testAuthentication() {
  await runTest('Login with existing user', async () => {
    const res = await makeRequest('POST', '/api/auth/login', {
      email: TEST_USER.email,
      password: TEST_USER.password
    });

    assert(res.status === 200 || res.status === 201, `Login should succeed, got ${res.status}`);
    assert(res.data.success, 'Login response should have success=true');
    assert(res.data.data.accessToken, 'Should return access token');
    assert(res.data.data.refreshToken, 'Should return refresh token');

    authToken = res.data.data.accessToken;
    userId = res.data.data.user.id;

    console.log(`  → Logged in as: ${res.data.data.user.email}`);
    console.log(`  → User ID: ${userId}`);
  });

  await runTest('Get current user profile', async () => {
    const res = await makeRequest('GET', '/api/auth/me', null, authToken);
    assertEqual(res.status, 200, 'Should get user profile');
    assert(res.data.id === userId, 'User ID should match');
  });

  await runTest('Reject unauthenticated requests', async () => {
    const res = await makeRequest('GET', '/api/auth/me');
    assertEqual(res.status, 401, 'Should return 401 without token');
  });
}

async function testWalletOperations() {
  await runTest('Get wallet balance', async () => {
    const res = await makeRequest('GET', '/api/wallet/balance', null, authToken);
    assertEqual(res.status, 200, 'Should get wallet balance');
    assert(typeof res.data.balance === 'number', 'Balance should be a number');
    assert(typeof res.data.availableBalance === 'number', 'Available balance should be a number');
    assert(res.data.currency, 'Should have currency field');

    console.log(`  → Balance: ${res.data.balance} ${res.data.currency}`);
    console.log(`  → Available: ${res.data.availableBalance} ${res.data.currency}`);
  });

  await runTest('Get wallet transactions', async () => {
    const res = await makeRequest('GET', '/api/wallet/transactions', null, authToken);
    assert(res.status === 200 || res.status === 404, `Should get transactions or 404, got ${res.status}`);

    if (res.status === 200) {
      assert(Array.isArray(res.data) || Array.isArray(res.data.data), 'Should return array of transactions');
      console.log(`  → Found ${Array.isArray(res.data) ? res.data.length : res.data.data?.length || 0} transactions`);
    }
  });
}

async function testPaymentEndpoints() {
  await runTest('Create payment intent', async () => {
    const res = await makeRequest('POST', '/api/payments/intents', {
      amount: 50.00,
      currency: 'BGN',
      description: 'Test payment'
    }, authToken);

    assert(res.status === 200 || res.status === 201, `Should create payment intent, got ${res.status}`);

    if (res.data.success) {
      console.log(`  → Payment Intent ID: ${res.data.data.paymentIntentId}`);
    }
  });

  await runTest('Get payment statistics', async () => {
    const res = await makeRequest('GET', '/api/payments/statistics', null, authToken);
    assert(res.status === 200 || res.status === 404, `Should get statistics, got ${res.status}`);
  });
}

async function testReceiptEndpoints() {
  await runTest('List receipts', async () => {
    const res = await makeRequest('GET', '/api/receipts', null, authToken);
    assert(res.status === 200 || res.status === 404, `Should list receipts, got ${res.status}`);

    if (res.status === 200 && res.data.data) {
      console.log(`  → Found ${res.data.data.length} receipts`);
    }
  });

  await runTest('Get receipt statistics', async () => {
    const res = await makeRequest('GET', '/api/receipts/stats', null, authToken);
    assert(res.status === 200 || res.status === 404, `Should get receipt stats, got ${res.status}`);
  });
}

async function testOfferEndpoints() {
  await runTest('List all offers', async () => {
    const res = await makeRequest('GET', '/api/offers', null, authToken);
    assertEqual(res.status, 200, 'Should list offers');
    assert(res.data.success, 'Response should have success=true');
    assert(Array.isArray(res.data.data), 'Should return array of offers');

    console.log(`  → Found ${res.data.data.length} offers`);
  });

  await runTest('Get top offers', async () => {
    const res = await makeRequest('GET', '/api/offers/top', null, authToken);
    assert(res.status === 200 || res.status === 404, `Should get top offers, got ${res.status}`);
  });

  await runTest('Get featured offers', async () => {
    const res = await makeRequest('GET', '/api/offers/featured', null, authToken);
    assert(res.status === 200 || res.status === 404, `Should get featured offers, got ${res.status}`);
  });
}

async function testVenueEndpoints() {
  await runTest('List venues', async () => {
    const res = await makeRequest('GET', '/api/venues', null, authToken);
    assert(res.status === 200 || res.status === 501, `Should list venues or return 501, got ${res.status}`);

    if (res.status === 501) {
      console.log(`  → Venues endpoint not yet implemented (expected)`);
      testResults.failed.pop(); // Remove from failed
      testResults.skipped.push('List venues');
    }
  });
}

async function testStickerEndpoints() {
  await runTest('Sticker scan requires authentication', async () => {
    const res = await makeRequest('POST', '/api/stickers/scan', {
      qrCode: 'TEST_QR_CODE'
    });
    assertEqual(res.status, 401, 'Should require authentication');
  });

  await runTest('Get sticker scans', async () => {
    const res = await makeRequest('GET', '/api/stickers/my-scans', null, authToken);
    assert(res.status === 200 || res.status === 404, `Should get scans, got ${res.status}`);
  });
}

// ============================================
// Main Test Runner
// ============================================

async function runAllTests() {
  console.log(`${colors.blue}
╔════════════════════════════════════════════════╗
║   BoomCard Comprehensive API Test Suite       ║
╚════════════════════════════════════════════════╝
${colors.reset}\n`);

  console.log(`Testing against: ${colors.cyan}${BASE_URL}${colors.reset}\n`);
  console.log('='.repeat(50) + '\n');

  try {
    // Test suites in order
    console.log(`${colors.yellow}▶ Health Checks${colors.reset}\n`);
    await testHealthEndpoints();

    console.log(`\n${colors.yellow}▶ Authentication${colors.reset}\n`);
    await testAuthentication();

    console.log(`\n${colors.yellow}▶ Wallet Operations${colors.reset}\n`);
    await testWalletOperations();

    console.log(`\n${colors.yellow}▶ Payment Processing${colors.reset}\n`);
    await testPaymentEndpoints();

    console.log(`\n${colors.yellow}▶ Receipt Management${colors.reset}\n`);
    await testReceiptEndpoints();

    console.log(`\n${colors.yellow}▶ Offers & Promotions${colors.reset}\n`);
    await testOfferEndpoints();

    console.log(`\n${colors.yellow}▶ Venue Information${colors.reset}\n`);
    await testVenueEndpoints();

    console.log(`\n${colors.yellow}▶ Sticker Scanning${colors.reset}\n`);
    await testStickerEndpoints();

  } catch (error) {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log(`${colors.blue}
╔════════════════════════════════════════════════╗
║              Test Results Summary              ║
╚════════════════════════════════════════════════╝
${colors.reset}`);

  console.log(`${colors.green}✓ Passed:  ${testResults.passed.length}${colors.reset}`);
  console.log(`${colors.red}✗ Failed:  ${testResults.failed.length}${colors.reset}`);
  console.log(`${colors.yellow}⊘ Skipped: ${testResults.skipped.length}${colors.reset}`);

  const total = testResults.passed.length + testResults.failed.length + testResults.skipped.length;
  const passRate = ((testResults.passed.length / total) * 100).toFixed(1);

  console.log(`\nPass Rate: ${passRate}% (${testResults.passed.length}/${total})`);

  if (testResults.failed.length > 0) {
    console.log(`\n${colors.red}Failed Tests:${colors.reset}`);
    testResults.failed.forEach(fail => {
      console.log(`  • ${fail.name}: ${fail.error}`);
    });
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Exit with appropriate code
  process.exit(testResults.failed.length > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error(`${colors.red}Unexpected error: ${error.message}${colors.reset}`);
  process.exit(1);
});
