#!/bin/bash

###############################################################################
# BoomCard Backend - Deployment Verification Script
#
# This script verifies that a backend deployment was successful by:
# 1. Checking all health endpoints
# 2. Verifying database connectivity
# 3. Testing critical API endpoints
# 4. Validating environment configuration
# 5. Checking external service connections
#
# Usage:
#   ./scripts/verify-deployment.sh [environment]
#
# Environment: production, staging, or development (default: production)
###############################################################################

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Environment
ENV=${1:-production}

# API URLs
if [ "$ENV" = "production" ]; then
    API_URL="https://api.boomcard.bg"
elif [ "$ENV" = "staging" ]; then
    API_URL="https://api-staging.boomcard.bg"
else
    API_URL="http://localhost:3001"
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}BoomCard Backend Deployment Verification${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Environment: ${YELLOW}$ENV${NC}"
echo -e "API URL: ${YELLOW}$API_URL${NC}"
echo ""

# Track failures
FAILURES=0

###############################################################################
# Function: Check endpoint
###############################################################################
check_endpoint() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    local expected_keyword=$4

    echo -n "Checking $name... "

    # Make request and capture status code
    response=$(curl -s -w "\n%{http_code}" "$url")
    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    # Check status code
    if [ "$status_code" != "$expected_status" ]; then
        echo -e "${RED}FAILED${NC} (HTTP $status_code, expected $expected_status)"
        FAILURES=$((FAILURES + 1))
        return 1
    fi

    # Check keyword if provided
    if [ -n "$expected_keyword" ]; then
        if echo "$body" | grep -q "$expected_keyword"; then
            echo -e "${GREEN}OK${NC}"
        else
            echo -e "${RED}FAILED${NC} (keyword '$expected_keyword' not found)"
            FAILURES=$((FAILURES + 1))
            return 1
        fi
    else
        echo -e "${GREEN}OK${NC}"
    fi

    return 0
}

###############################################################################
# Function: Check JSON field
###############################################################################
check_json_field() {
    local name=$1
    local url=$2
    local field=$3
    local expected_value=$4

    echo -n "Checking $name... "

    response=$(curl -s "$url")

    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}SKIPPED${NC} (jq not installed)"
        return 0
    fi

    actual_value=$(echo "$response" | jq -r "$field")

    if [ "$actual_value" = "$expected_value" ]; then
        echo -e "${GREEN}OK${NC} ($actual_value)"
    else
        echo -e "${RED}FAILED${NC} (expected: $expected_value, got: $actual_value)"
        FAILURES=$((FAILURES + 1))
        return 1
    fi

    return 0
}

###############################################################################
# 1. Health Checks
###############################################################################
echo -e "${BLUE}=== Health Checks ===${NC}"
check_endpoint "Basic Health" "$API_URL/api/health" 200 "ok"
check_endpoint "Detailed Health" "$API_URL/api/health/detailed" 200 "status"
check_endpoint "Readiness Probe" "$API_URL/api/health/ready" 200 "ready"
check_endpoint "Liveness Probe" "$API_URL/api/health/live" 200 "alive"
check_endpoint "Metrics Endpoint" "$API_URL/api/health/metrics" 200 "uptime"
check_endpoint "Ping Endpoint" "$API_URL/api/health/ping" 200 "pong"
echo ""

###############################################################################
# 2. Database Health
###############################################################################
echo -e "${BLUE}=== Database Health ===${NC}"
check_json_field "Database Status" "$API_URL/api/health/detailed" ".checks.database.status" "ok"
check_json_field "Database Response Time < 100ms" "$API_URL/api/health/detailed" ".checks.database.responseTime < 100" "true"
echo ""

###############################################################################
# 3. External Service Configuration
###############################################################################
echo -e "${BLUE}=== External Services ===${NC}"
check_json_field "S3 Configuration" "$API_URL/api/health/detailed" ".checks.s3.status" "configured"
check_json_field "Paysera Configuration" "$API_URL/api/health/detailed" ".checks.paysera.status" "configured"
echo ""

###############################################################################
# 4. API Endpoints
###############################################################################
echo -e "${BLUE}=== API Endpoints ===${NC}"
check_endpoint "Auth Routes" "$API_URL/api/auth/health" 200
check_endpoint "Venues Routes" "$API_URL/api/venues" 200
check_endpoint "Payments Routes" "$API_URL/api/payments/health" 200
check_endpoint "Receipts Routes" "$API_URL/api/receipts/health" 200
check_endpoint "Stickers Routes" "$API_URL/api/stickers/health" 200
echo ""

###############################################################################
# 5. System Metrics
###############################################################################
echo -e "${BLUE}=== System Metrics ===${NC}"

if command -v jq &> /dev/null; then
    metrics=$(curl -s "$API_URL/api/health/metrics")

    echo -n "Server Uptime... "
    uptime=$(echo "$metrics" | jq -r '.uptime')
    if [ "$uptime" != "null" ] && [ "$uptime" != "" ]; then
        echo -e "${GREEN}OK${NC} ($(echo "$uptime" | awk '{print int($1/60)" minutes"}'))"
    else
        echo -e "${RED}FAILED${NC}"
        FAILURES=$((FAILURES + 1))
    fi

    echo -n "Memory Usage... "
    heap_used=$(echo "$metrics" | jq -r '.memory.heapUsed')
    heap_total=$(echo "$metrics" | jq -r '.memory.heapTotal')
    if [ "$heap_used" != "null" ] && [ "$heap_total" != "null" ]; then
        usage_pct=$(echo "scale=0; $heap_used * 100 / $heap_total" | bc)
        if [ "$usage_pct" -lt 90 ]; then
            echo -e "${GREEN}OK${NC} (${usage_pct}% used)"
        else
            echo -e "${YELLOW}WARNING${NC} (${usage_pct}% used - high memory)"
        fi
    else
        echo -e "${RED}FAILED${NC}"
        FAILURES=$((FAILURES + 1))
    fi

    echo -n "Database Record Count... "
    users=$(echo "$metrics" | jq -r '.database.users')
    venues=$(echo "$metrics" | jq -r '.database.venues')
    if [ "$users" != "null" ] && [ "$venues" != "null" ]; then
        echo -e "${GREEN}OK${NC} (Users: $users, Venues: $venues)"
    else
        echo -e "${RED}FAILED${NC}"
        FAILURES=$((FAILURES + 1))
    fi
else
    echo -e "${YELLOW}SKIPPED${NC} (jq not installed)"
fi
echo ""

###############################################################################
# 6. Response Time Test
###############################################################################
echo -e "${BLUE}=== Performance ===${NC}"
echo -n "API Response Time... "

start_time=$(date +%s%N)
curl -s "$API_URL/api/health" > /dev/null
end_time=$(date +%s%N)
response_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds

if [ "$response_time" -lt 500 ]; then
    echo -e "${GREEN}OK${NC} (${response_time}ms)"
elif [ "$response_time" -lt 1000 ]; then
    echo -e "${YELLOW}WARNING${NC} (${response_time}ms - slower than expected)"
else
    echo -e "${RED}FAILED${NC} (${response_time}ms - too slow)"
    FAILURES=$((FAILURES + 1))
fi
echo ""

###############################################################################
# 7. Security Headers
###############################################################################
echo -e "${BLUE}=== Security Headers ===${NC}"

headers=$(curl -s -I "$API_URL/api/health")

echo -n "CORS Headers... "
if echo "$headers" | grep -q "Access-Control-Allow-Origin"; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}WARNING${NC} (CORS headers not found)"
fi

echo -n "Content-Type... "
if echo "$headers" | grep -q "Content-Type: application/json"; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}WARNING${NC} (Content-Type not set correctly)"
fi

echo ""

###############################################################################
# Summary
###############################################################################
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Verification Summary${NC}"
echo -e "${BLUE}========================================${NC}"

if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo -e "${GREEN}✓ Deployment verified successfully${NC}"
    echo ""
    echo -e "The $ENV environment is ${GREEN}READY${NC} for use."
    exit 0
else
    echo -e "${RED}✗ $FAILURES check(s) failed${NC}"
    echo -e "${RED}✗ Deployment verification failed${NC}"
    echo ""
    echo -e "The $ENV environment has ${RED}ISSUES${NC} that need attention."
    echo "Please review the failures above and investigate."
    exit 1
fi
