#!/bin/bash

# BoomCard Backend API - Authentication Test Script

BASE_URL="http://localhost:3000/api"

echo "=================================="
echo "BoomCard Authentication API Tests"
echo "=================================="
echo ""

# Test 1: User Registration
echo "Test 1: Register New User"
echo "--------------------------"
REGISTER_RESPONSE=$(curl -s -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "partner@boom card.bg",
    "password": "Partner123",
    "firstName": "Partner",
    "lastName": "Business"
  }')

echo "$REGISTER_RESPONSE" | python3 -m json.tool | head -20
echo ""

# Test 2: User Login
echo "Test 2: Login User"
echo "--------------------------"
LOGIN_RESPONSE=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@boomcard.bg",
    "password": "Test1234"
  }')

ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data['data']['accessToken'])" 2>/dev/null)
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data['data']['refreshToken'])" 2>/dev/null)

echo "$LOGIN_RESPONSE" | python3 -m json.tool | head -15
echo ""

# Test 3: Get Current User Profile
echo "Test 3: Get User Profile (Protected Route)"
echo "-------------------------------------------"
curl -s $BASE_URL/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool | head -20
echo ""

# Test 4: Update Profile
echo "Test 4: Update Profile"
echo "----------------------"
curl -s -X PUT $BASE_URL/auth/profile \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Updated",
    "lastName": "Name",
    "phone": "+359888123456"
  }' | python3 -m json.tool
echo ""

# Test 5: Refresh Token
echo "Test 5: Refresh Access Token"
echo "-----------------------------"
curl -s -X POST $BASE_URL/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}" | python3 -m json.tool | head -10
echo ""

# Test 6: Logout
echo "Test 6: Logout"
echo "--------------"
curl -s -X POST $BASE_URL/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}" | python3 -m json.tool
echo ""

echo "=================================="
echo "Authentication Tests Completed!"
echo "=================================="
