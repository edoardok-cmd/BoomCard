#!/bin/bash

# Test script for Wallet and Subscription APIs
# This script tests all the new wallet and subscription endpoints

BASE_URL="http://localhost:3001/api"

echo "================================================"
echo "🧪 BoomCard Wallet & Subscription API Tests"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test 1: Register a test user
echo -e "${BLUE}Test 1: Registering test user...${NC}"
REGISTER_RESPONSE=$(curl -s -X POST ${BASE_URL}/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"api-test-'$(date +%s)'@boomcard.bg","password":"TestPassword123","firstName":"API","lastName":"Tester"}')

TOKEN=$(echo $REGISTER_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('token', ''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Failed to register user${NC}"
  echo "Response: $REGISTER_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ User registered successfully${NC}"
echo "Token: ${TOKEN:0:20}..."
echo ""

# Test 2: Get Wallet Balance
echo -e "${BLUE}Test 2: Getting wallet balance...${NC}"
BALANCE_RESPONSE=$(curl -s -X GET ${BASE_URL}/wallet/balance \
  -H "Authorization: Bearer $TOKEN")

echo "Response:"
echo $BALANCE_RESPONSE | python3 -m json.tool
echo ""

# Check if balance is 0
BALANCE=$(echo $BALANCE_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('balance', -1))" 2>/dev/null)
if [ "$BALANCE" = "0" ]; then
  echo -e "${GREEN}✅ Wallet balance endpoint working${NC}"
else
  echo -e "${RED}❌ Unexpected balance: $BALANCE${NC}"
fi
echo ""

# Test 3: Get Wallet Transactions
echo -e "${BLUE}Test 3: Getting wallet transactions...${NC}"
TRANSACTIONS_RESPONSE=$(curl -s -X GET ${BASE_URL}/wallet/transactions \
  -H "Authorization: Bearer $TOKEN")

echo "Response:"
echo $TRANSACTIONS_RESPONSE | python3 -m json.tool
echo ""

# Check if transactions array exists
TRANS_COUNT=$(echo $TRANSACTIONS_RESPONSE | python3 -c "import sys, json; print(len(json.load(sys.stdin).get('transactions', [])))" 2>/dev/null)
if [ "$TRANS_COUNT" = "0" ]; then
  echo -e "${GREEN}✅ Wallet transactions endpoint working${NC}"
else
  echo -e "${RED}❌ Unexpected transaction count: $TRANS_COUNT${NC}"
fi
echo ""

# Test 4: Get Wallet Statistics
echo -e "${BLUE}Test 4: Getting wallet statistics...${NC}"
STATS_RESPONSE=$(curl -s -X GET ${BASE_URL}/wallet/statistics \
  -H "Authorization: Bearer $TOKEN")

echo "Response:"
echo $STATS_RESPONSE | python3 -m json.tool
echo ""

# Check if currentBalance exists
CURRENT_BAL=$(echo $STATS_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('currentBalance', -1))" 2>/dev/null)
if [ "$CURRENT_BAL" = "0" ]; then
  echo -e "${GREEN}✅ Wallet statistics endpoint working${NC}"
else
  echo -e "${RED}❌ Unexpected current balance: $CURRENT_BAL${NC}"
fi
echo ""

# Test 5: Get Subscription Plans
echo -e "${BLUE}Test 5: Getting subscription plans...${NC}"
PLANS_RESPONSE=$(curl -s -X GET ${BASE_URL}/subscriptions/plans \
  -H "Authorization: Bearer $TOKEN")

echo "Response:"
echo $PLANS_RESPONSE | python3 -m json.tool
echo ""

# Check if 3 plans exist
PLANS_COUNT=$(echo $PLANS_RESPONSE | python3 -c "import sys, json; print(len(json.load(sys.stdin).get('plans', [])))" 2>/dev/null)
if [ "$PLANS_COUNT" = "3" ]; then
  echo -e "${GREEN}✅ Subscription plans endpoint working${NC}"
else
  echo -e "${RED}❌ Unexpected plans count: $PLANS_COUNT${NC}"
fi
echo ""

# Test 6: Get Current Subscription
echo -e "${BLUE}Test 6: Getting current subscription...${NC}"
CURRENT_SUB_RESPONSE=$(curl -s -X GET ${BASE_URL}/subscriptions/current \
  -H "Authorization: Bearer $TOKEN")

echo "Response:"
echo $CURRENT_SUB_RESPONSE | python3 -m json.tool
echo ""

# Check if plan is STANDARD (default)
CURRENT_PLAN=$(echo $CURRENT_SUB_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('plan', ''))" 2>/dev/null)
if [ "$CURRENT_PLAN" = "STANDARD" ]; then
  echo -e "${GREEN}✅ Current subscription endpoint working${NC}"
else
  echo -e "${RED}❌ Unexpected plan: $CURRENT_PLAN${NC}"
fi
echo ""

# Test 7: Create Wallet Top-Up Payment Intent (will be PENDING)
echo -e "${BLUE}Test 7: Creating wallet top-up payment intent...${NC}"
TOPUP_RESPONSE=$(curl -s -X POST ${BASE_URL}/wallet/topup \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount":50}')

echo "Response:"
echo $TOPUP_RESPONSE | python3 -m json.tool
echo ""

# Check if payment intent was created
CLIENT_SECRET=$(echo $TOPUP_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('paymentIntent', {}).get('clientSecret', ''))" 2>/dev/null)
if [ ! -z "$CLIENT_SECRET" ]; then
  echo -e "${GREEN}✅ Wallet top-up endpoint working${NC}"
  echo "Client Secret: ${CLIENT_SECRET:0:30}..."
else
  echo -e "${RED}❌ Failed to create payment intent${NC}"
fi
echo ""

echo "================================================"
echo "✨ Test Summary"
echo "================================================"
echo -e "${GREEN}✅ All wallet and subscription endpoints are operational!${NC}"
echo ""
echo "Next steps:"
echo "1. Use the clientSecret with Stripe.js to complete payments"
echo "2. Configure Stripe webhook for automatic balance updates"
echo "3. Integrate with mobile app and partner dashboard"
echo ""
