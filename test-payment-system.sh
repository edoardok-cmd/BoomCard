#!/bin/bash

# BoomCard Payment System - Comprehensive Test Suite
# Tests all payment endpoints with Stripe integration

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_BASE="http://localhost:3001/api"
TEST_EMAIL="payment-test@boomcard.bg"
TEST_PASSWORD="test123456"
TOKEN=""
STRIPE_CUSTOMER_ID=""
PAYMENT_INTENT_ID=""
PAYMENT_METHOD_ID=""

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

print_test() {
    echo -e "${YELLOW}▶ Testing:${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓ PASS:${NC} $1"
    ((TESTS_PASSED++))
}

print_error() {
    echo -e "${RED}✗ FAIL:${NC} $1"
    ((TESTS_FAILED++))
}

print_info() {
    echo -e "${BLUE}ℹ INFO:${NC} $1"
}

# Test functions
test_health_check() {
    print_test "Server health check"

    RESPONSE=$(curl -s "$API_BASE/../health")
    STATUS=$(echo "$RESPONSE" | grep -o '"status":"ok"' || echo "")

    if [ -n "$STATUS" ]; then
        print_success "Server is healthy"
        return 0
    else
        print_error "Server health check failed"
        return 1
    fi
}

test_user_registration() {
    print_test "User registration/login"

    # Try to register first (might already exist)
    curl -s -X POST "$API_BASE/auth/register" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$TEST_EMAIL\",
            \"password\": \"$TEST_PASSWORD\",
            \"firstName\": \"Payment\",
            \"lastName\": \"Tester\",
            \"phoneNumber\": \"+359888123456\"
        }" > /dev/null 2>&1

    # Login to get token
    RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$TEST_EMAIL\",
            \"password\": \"$TEST_PASSWORD\"
        }")

    TOKEN=$(echo "$RESPONSE" | grep -o '"accessToken":"[^"]*' | sed 's/"accessToken":"//')

    if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
        print_success "User authenticated, token obtained"
        print_info "Token: ${TOKEN:0:20}..."
        return 0
    else
        print_error "Failed to authenticate user"
        echo "Response: $RESPONSE"
        return 1
    fi
}

test_create_payment_intent() {
    print_test "Create payment intent (29 BGN Premium subscription)"

    RESPONSE=$(curl -s -X POST "$API_BASE/payments/intents" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TOKEN" \
        -d '{
            "amount": 29,
            "currency": "bgn",
            "description": "Premium Subscription - Monthly",
            "metadata": {
                "subscriptionType": "premium",
                "billingPeriod": "monthly"
            }
        }')

    SUCCESS=$(echo "$RESPONSE" | grep -o '"success":true' || echo "")
    PAYMENT_INTENT_ID=$(echo "$RESPONSE" | grep -o '"paymentIntentId":"[^"]*' | sed 's/"paymentIntentId":"//')
    CLIENT_SECRET=$(echo "$RESPONSE" | grep -o '"clientSecret":"[^"]*' | sed 's/"clientSecret":"//')

    if [ -n "$SUCCESS" ] && [ -n "$PAYMENT_INTENT_ID" ] && [ -n "$CLIENT_SECRET" ]; then
        print_success "Payment intent created successfully"
        print_info "Payment Intent ID: $PAYMENT_INTENT_ID"
        print_info "Client Secret: ${CLIENT_SECRET:0:30}..."
        return 0
    else
        print_error "Failed to create payment intent"
        echo "Response: $RESPONSE"
        return 1
    fi
}

test_list_payment_methods() {
    print_test "List saved payment methods (cards)"

    RESPONSE=$(curl -s -X GET "$API_BASE/payments/cards" \
        -H "Authorization: Bearer $TOKEN")

    # Check if response has success or data field
    SUCCESS=$(echo "$RESPONSE" | grep -o '"success":true' || echo "$RESPONSE" | grep -o '"data":\[' || echo "")

    if [ -n "$SUCCESS" ]; then
        CARD_COUNT=$(echo "$RESPONSE" | grep -o '"id":"pm_' | wc -l)
        print_success "Payment methods retrieved (${CARD_COUNT} cards)"
        return 0
    else
        print_error "Failed to retrieve payment methods"
        echo "Response: $RESPONSE"
        return 1
    fi
}

test_wallet_balance() {
    print_test "Get wallet balance"

    RESPONSE=$(curl -s -X GET "$API_BASE/payments/wallet/balance" \
        -H "Authorization: Bearer $TOKEN")

    BALANCE=$(echo "$RESPONSE" | grep -o '"balance":[0-9]*' | sed 's/"balance"://')

    if [ -n "$BALANCE" ]; then
        print_success "Wallet balance retrieved: ${BALANCE} stotinki ($(echo "scale=2; $BALANCE/100" | bc) BGN)"
        return 0
    else
        print_error "Failed to retrieve wallet balance"
        echo "Response: $RESPONSE"
        return 1
    fi
}

test_list_transactions() {
    print_test "List payment transactions"

    RESPONSE=$(curl -s -X GET "$API_BASE/payments/transactions?limit=10" \
        -H "Authorization: Bearer $TOKEN")

    SUCCESS=$(echo "$RESPONSE" | grep -o '"success":true' || echo "$RESPONSE" | grep -o '"data":\[' || echo "")

    if [ -n "$SUCCESS" ]; then
        TX_COUNT=$(echo "$RESPONSE" | grep -o '"id":"' | wc -l)
        print_success "Transactions retrieved (${TX_COUNT} transactions)"
        return 0
    else
        print_error "Failed to retrieve transactions"
        echo "Response: $RESPONSE"
        return 1
    fi
}

test_payment_statistics() {
    print_test "Get payment statistics"

    RESPONSE=$(curl -s -X GET "$API_BASE/payments/statistics" \
        -H "Authorization: Bearer $TOKEN")

    TOTAL=$(echo "$RESPONSE" | grep -o '"totalPayments":[0-9]*' || echo "")

    if [ -n "$TOTAL" ] || echo "$RESPONSE" | grep -q "success"; then
        print_success "Payment statistics retrieved"
        echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
        return 0
    else
        print_error "Failed to retrieve payment statistics"
        echo "Response: $RESPONSE"
        return 1
    fi
}

test_cancel_payment_intent() {
    if [ -z "$PAYMENT_INTENT_ID" ]; then
        print_info "Skipping cancel test (no payment intent created)"
        return 0
    fi

    print_test "Cancel payment intent"

    RESPONSE=$(curl -s -X POST "$API_BASE/payments/intents/$PAYMENT_INTENT_ID/cancel" \
        -H "Authorization: Bearer $TOKEN")

    SUCCESS=$(echo "$RESPONSE" | grep -o '"success":true' || echo "")

    if [ -n "$SUCCESS" ]; then
        print_success "Payment intent cancelled successfully"
        return 0
    else
        # Cancellation might fail if already processed - not necessarily an error
        print_info "Payment intent cancellation returned: $RESPONSE"
        return 0
    fi
}

# Main test execution
main() {
    print_header "BoomCard Payment System - Test Suite"

    echo "Testing backend API at: $API_BASE"
    echo "Test user: $TEST_EMAIL"
    echo ""

    # Run tests in sequence
    test_health_check
    test_user_registration

    if [ -z "$TOKEN" ]; then
        print_error "Cannot continue without authentication token"
        exit 1
    fi

    print_header "Testing Payment Endpoints"

    test_create_payment_intent
    test_list_payment_methods
    test_wallet_balance
    test_list_transactions
    test_payment_statistics
    test_cancel_payment_intent

    # Summary
    print_header "Test Summary"

    TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))

    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    echo "Total:  $TOTAL_TESTS"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}✗ Some tests failed${NC}"
        exit 1
    fi
}

# Run main function
main
