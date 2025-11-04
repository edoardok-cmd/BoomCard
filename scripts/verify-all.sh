#!/bin/bash

###############################################################################
# BoomCard Platform - Complete Deployment Verification
#
# This master script runs all verification checks:
# 1. Backend API verification
# 2. Frontend verification
# 3. Database connectivity
# 4. External services
# 5. End-to-end smoke test
#
# Usage:
#   ./scripts/verify-all.sh [environment]
#
# Environment: production, staging, or development (default: production)
###############################################################################

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Environment
ENV=${1:-production}

echo -e "${BOLD}${BLUE}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║           BoomCard Platform - Full Verification                ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo -e "Environment: ${YELLOW}${BOLD}$ENV${NC}"
echo -e "Timestamp: ${YELLOW}$(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo ""

# Track overall status
BACKEND_PASSED=0
FRONTEND_PASSED=0
OVERALL_FAILURES=0

###############################################################################
# 1. Backend Verification
###############################################################################
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}1. Backend API Verification${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -f "./backend-api/scripts/verify-deployment.sh" ]; then
    if ./backend-api/scripts/verify-deployment.sh "$ENV"; then
        BACKEND_PASSED=1
        echo ""
        echo -e "${GREEN}${BOLD}✓ Backend verification: PASSED${NC}"
    else
        OVERALL_FAILURES=$((OVERALL_FAILURES + 1))
        echo ""
        echo -e "${RED}${BOLD}✗ Backend verification: FAILED${NC}"
    fi
else
    echo -e "${RED}Backend verification script not found!${NC}"
    OVERALL_FAILURES=$((OVERALL_FAILURES + 1))
fi

echo ""
echo -e "${BLUE}Press Enter to continue to frontend verification...${NC}"
read -r

###############################################################################
# 2. Frontend Verification
###############################################################################
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}2. Frontend Verification${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -f "./scripts/verify-frontend.sh" ]; then
    if ./scripts/verify-frontend.sh "$ENV"; then
        FRONTEND_PASSED=1
        echo ""
        echo -e "${GREEN}${BOLD}✓ Frontend verification: PASSED${NC}"
    else
        OVERALL_FAILURES=$((OVERALL_FAILURES + 1))
        echo ""
        echo -e "${RED}${BOLD}✗ Frontend verification: FAILED${NC}"
    fi
else
    echo -e "${RED}Frontend verification script not found!${NC}"
    OVERALL_FAILURES=$((OVERALL_FAILURES + 1))
fi

echo ""
echo -e "${BLUE}Press Enter to continue to integration tests...${NC}"
read -r

###############################################################################
# 3. Integration Tests
###############################################################################
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}3. Integration Tests${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Set URLs based on environment
if [ "$ENV" = "production" ]; then
    API_URL="https://api.boomcard.bg"
    FRONTEND_URL="https://dashboard.boomcard.bg"
elif [ "$ENV" = "staging" ]; then
    API_URL="https://api-staging.boomcard.bg"
    FRONTEND_URL="https://dashboard-staging.boomcard.bg"
else
    API_URL="http://localhost:3001"
    FRONTEND_URL="http://localhost:5175"
fi

INTEGRATION_FAILURES=0

# Test 1: Frontend can reach Backend
echo -n "Frontend → Backend connectivity... "
if curl -s "$API_URL/api/health" > /dev/null; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC}"
    INTEGRATION_FAILURES=$((INTEGRATION_FAILURES + 1))
fi

# Test 2: CORS Headers
echo -n "CORS configuration... "
cors_header=$(curl -s -I "$API_URL/api/health" | grep -i "Access-Control-Allow-Origin")
if [ -n "$cors_header" ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}WARNING${NC} (CORS headers not found)"
fi

# Test 3: Database through API
echo -n "Database connectivity (via API)... "
db_check=$(curl -s "$API_URL/api/health/detailed" | grep -o '"status":"ok"' || echo "")
if [ -n "$db_check" ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC}"
    INTEGRATION_FAILURES=$((INTEGRATION_FAILURES + 1))
fi

# Test 4: Response time end-to-end
echo -n "End-to-end response time... "
start_time=$(date +%s%N)
curl -s "$FRONTEND_URL/" > /dev/null
curl -s "$API_URL/api/health" > /dev/null
end_time=$(date +%s%N)
e2e_time=$(( (end_time - start_time) / 1000000 ))

if [ "$e2e_time" -lt 2000 ]; then
    echo -e "${GREEN}OK${NC} (${e2e_time}ms)"
elif [ "$e2e_time" -lt 5000 ]; then
    echo -e "${YELLOW}ACCEPTABLE${NC} (${e2e_time}ms)"
else
    echo -e "${RED}SLOW${NC} (${e2e_time}ms)"
    INTEGRATION_FAILURES=$((INTEGRATION_FAILURES + 1))
fi

if [ $INTEGRATION_FAILURES -gt 0 ]; then
    OVERALL_FAILURES=$((OVERALL_FAILURES + 1))
    echo ""
    echo -e "${RED}${BOLD}✗ Integration tests: FAILED${NC}"
else
    echo ""
    echo -e "${GREEN}${BOLD}✓ Integration tests: PASSED${NC}"
fi

echo ""

###############################################################################
# 4. Critical Path Smoke Test
###############################################################################
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}4. Critical Path Smoke Test${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

SMOKE_FAILURES=0

# Test critical endpoints
critical_endpoints=(
    "/api/health|Health Check"
    "/api/auth/health|Auth API"
    "/api/venues|Venues API"
    "/api/payments/health|Payments API"
    "/api/receipts/health|Receipts API"
    "/api/stickers/health|Stickers API"
)

for endpoint_info in "${critical_endpoints[@]}"; do
    IFS='|' read -r endpoint name <<< "$endpoint_info"
    echo -n "Testing $name... "

    status=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL$endpoint")

    if [ "$status" = "200" ]; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FAILED${NC} (HTTP $status)"
        SMOKE_FAILURES=$((SMOKE_FAILURES + 1))
    fi
done

if [ $SMOKE_FAILURES -gt 0 ]; then
    OVERALL_FAILURES=$((OVERALL_FAILURES + 1))
    echo ""
    echo -e "${RED}${BOLD}✗ Smoke tests: FAILED${NC}"
else
    echo ""
    echo -e "${GREEN}${BOLD}✓ Smoke tests: PASSED${NC}"
fi

echo ""

###############################################################################
# Final Summary
###############################################################################
echo -e "${BOLD}${BLUE}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║                      Final Summary                             ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# Display component status
echo -e "${BOLD}Component Status:${NC}"
echo -e "  Backend API:      $([ $BACKEND_PASSED -eq 1 ] && echo -e "${GREEN}PASSED${NC}" || echo -e "${RED}FAILED${NC}")"
echo -e "  Frontend:         $([ $FRONTEND_PASSED -eq 1 ] && echo -e "${GREEN}PASSED${NC}" || echo -e "${RED}FAILED${NC}")"
echo -e "  Integration:      $([ $INTEGRATION_FAILURES -eq 0 ] && echo -e "${GREEN}PASSED${NC}" || echo -e "${RED}FAILED${NC}")"
echo -e "  Smoke Tests:      $([ $SMOKE_FAILURES -eq 0 ] && echo -e "${GREEN}PASSED${NC}" || echo -e "${RED}FAILED${NC}")"
echo ""

# Overall verdict
if [ $OVERALL_FAILURES -eq 0 ]; then
    echo -e "${GREEN}${BOLD}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                                                                ║"
    echo "║                   ✓ ALL CHECKS PASSED ✓                       ║"
    echo "║                                                                ║"
    echo "║              Deployment Verified Successfully!                 ║"
    echo "║                                                                ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo -e "The ${BOLD}$ENV${NC} environment is ${GREEN}${BOLD}READY${NC} for use! 🚀"
    echo ""

    # Success recommendations
    echo -e "${BLUE}${BOLD}Next Steps:${NC}"
    if [ "$ENV" = "production" ]; then
        echo "  1. Verify monitoring dashboards are receiving data"
        echo "  2. Run manual smoke tests on critical features"
        echo "  3. Inform stakeholders that deployment was successful"
        echo "  4. Monitor error rates and performance for next 1 hour"
    else
        echo "  1. Run manual testing on key features"
        echo "  2. Test integration with external services"
        echo "  3. Prepare for production deployment"
    fi

    exit 0
else
    echo -e "${RED}${BOLD}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                                                                ║"
    echo "║                   ✗ VERIFICATION FAILED ✗                     ║"
    echo "║                                                                ║"
    echo "║                $OVERALL_FAILURES Component(s) Failed                          ║"
    echo "║                                                                ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo -e "The ${BOLD}$ENV${NC} environment has ${RED}${BOLD}CRITICAL ISSUES${NC}."
    echo ""

    # Failure recommendations
    echo -e "${YELLOW}${BOLD}Action Required:${NC}"
    echo "  1. Review the failure details above"
    echo "  2. Check application logs for errors"
    echo "  3. Verify environment variables are set correctly"
    echo "  4. Consider rolling back if in production"
    echo "  5. Contact DevOps team if issues persist"
    echo ""

    exit 1
fi
