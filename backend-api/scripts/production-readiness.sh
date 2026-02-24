#!/bin/bash
#
# BoomCard Production Readiness Validation Script
#
# Run before deploying to production to verify all critical systems are operational.
#
# Usage:
#   bash scripts/production-readiness.sh                    # Against default (localhost:3001)
#   BASE_URL=https://api.boomcard.bg bash scripts/production-readiness.sh  # Against production
#
# Exit codes:
#   0 = All checks passed
#   1 = One or more critical checks failed
#

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
PASS=0
FAIL=0
WARN=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

check_pass() {
  echo -e "  ${GREEN}✓${NC} $1"
  PASS=$((PASS + 1))
}

check_fail() {
  echo -e "  ${RED}✗${NC} $1"
  FAIL=$((FAIL + 1))
}

check_warn() {
  echo -e "  ${YELLOW}⚠${NC} $1"
  WARN=$((WARN + 1))
}

section() {
  echo ""
  echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

# ═══════════════════════════════════════════════════════════════
# 1. HEALTH & CONNECTIVITY
# ═══════════════════════════════════════════════════════════════

section "1. Health & Connectivity"

# Basic health
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/health" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
  check_pass "Health endpoint reachable (${BASE_URL}/health)"
else
  check_fail "Health endpoint unreachable (status: ${HTTP_STATUS})"
fi

# Database connectivity (readiness probe)
READY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/ready" 2>/dev/null || echo "000")
if [ "$READY_STATUS" = "200" ]; then
  READY_BODY=$(curl -s "${BASE_URL}/ready" 2>/dev/null)
  DB_STATUS=$(echo "$READY_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('database','unknown'))" 2>/dev/null || echo "unknown")
  if [ "$DB_STATUS" = "connected" ]; then
    check_pass "Database connected"
  else
    check_fail "Database not connected (status: ${DB_STATUS})"
  fi
else
  check_fail "Readiness endpoint failed (status: ${READY_STATUS})"
fi

# Detailed health
DETAILED_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/health/detailed" 2>/dev/null || echo "000")
if [ "$DETAILED_STATUS" = "200" ]; then
  check_pass "Detailed health check passed"
else
  check_warn "Detailed health check returned ${DETAILED_STATUS}"
fi

# ═══════════════════════════════════════════════════════════════
# 2. API ROUTES
# ═══════════════════════════════════════════════════════════════

section "2. API Routes"

# Plans endpoint (public)
PLANS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/plans" 2>/dev/null || echo "000")
if [ "$PLANS_STATUS" = "200" ]; then
  check_pass "Plans endpoint accessible (/api/plans)"
else
  check_fail "Plans endpoint failed (status: ${PLANS_STATUS})"
fi

# Auth register validation (should return 400, not 500)
AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null || echo "000")
if [ "$AUTH_STATUS" = "400" ]; then
  check_pass "Auth validation works (empty body → 400)"
elif [ "$AUTH_STATUS" = "500" ]; then
  check_fail "Auth route returns 500 for invalid input"
else
  check_warn "Auth route returned unexpected status: ${AUTH_STATUS}"
fi

# Protected endpoint without auth (should return 401)
ME_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/auth/me" 2>/dev/null || echo "000")
if [ "$ME_STATUS" = "401" ]; then
  check_pass "Auth middleware works (no token → 401)"
else
  check_fail "Auth middleware not working (expected 401, got ${ME_STATUS})"
fi

# 404 handler
NOT_FOUND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/nonexistent" 2>/dev/null || echo "000")
if [ "$NOT_FOUND_STATUS" = "404" ]; then
  check_pass "404 handler works"
else
  check_fail "404 handler not working (expected 404, got ${NOT_FOUND_STATUS})"
fi

# Webhooks health
WH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/webhooks/health" 2>/dev/null || echo "000")
if [ "$WH_STATUS" = "200" ]; then
  check_pass "Webhooks endpoint accessible"
else
  check_warn "Webhooks endpoint returned ${WH_STATUS}"
fi

# ═══════════════════════════════════════════════════════════════
# 3. ENVIRONMENT VARIABLES
# ═══════════════════════════════════════════════════════════════

section "3. Environment Variables"

check_env_var() {
  local var_name=$1
  local required=${2:-true}

  if [ -f ".env" ]; then
    if grep -q "^${var_name}=" .env 2>/dev/null; then
      local value=$(grep "^${var_name}=" .env | cut -d'=' -f2-)
      if [ -n "$value" ] && [ "$value" != "" ] && [ "$value" != "''" ] && [ "$value" != '""' ]; then
        check_pass "${var_name} is set"
        return
      fi
    fi
  fi

  if [ "$required" = "true" ]; then
    check_fail "${var_name} is NOT set (required)"
  else
    check_warn "${var_name} is not set (recommended)"
  fi
}

# Critical vars
check_env_var "DATABASE_URL"
check_env_var "JWT_SECRET"
check_env_var "JWT_REFRESH_SECRET"
check_env_var "PAYSERA_PROJECT_ID"
check_env_var "PAYSERA_SIGN_PASSWORD"
check_env_var "CORS_ORIGIN"

# Recommended vars
check_env_var "RESEND_API_KEY" "false"
check_env_var "SENTRY_DSN" "false"
check_env_var "AWS_ACCESS_KEY_ID" "false"
check_env_var "AWS_SECRET_ACCESS_KEY" "false"
check_env_var "AWS_S3_BUCKET" "false"
check_env_var "STRIPE_SECRET_KEY" "false"
check_env_var "STRIPE_WEBHOOK_SECRET" "false"

# ═══════════════════════════════════════════════════════════════
# 4. SECURITY
# ═══════════════════════════════════════════════════════════════

section "4. Security Headers"

HEADERS=$(curl -s -I "${BASE_URL}/health" 2>/dev/null)

# Check Helmet.js security headers
if echo "$HEADERS" | grep -qi "x-content-type-options"; then
  check_pass "X-Content-Type-Options header present"
else
  check_warn "X-Content-Type-Options header missing (Helmet.js)"
fi

if echo "$HEADERS" | grep -qi "x-frame-options"; then
  check_pass "X-Frame-Options header present"
else
  check_warn "X-Frame-Options header missing"
fi

if echo "$HEADERS" | grep -qi "strict-transport-security"; then
  check_pass "Strict-Transport-Security header present"
else
  check_warn "HSTS header missing (expected in production behind HTTPS)"
fi

# Check CORS
CORS_HEADERS=$(curl -s -I -X OPTIONS "${BASE_URL}/api/auth/login" \
  -H "Origin: https://boomcard.bg" \
  -H "Access-Control-Request-Method: POST" 2>/dev/null)

if echo "$CORS_HEADERS" | grep -qi "access-control-allow-origin"; then
  check_pass "CORS configured"
else
  check_warn "CORS headers not found in OPTIONS response"
fi

# ═══════════════════════════════════════════════════════════════
# 5. PERFORMANCE
# ═══════════════════════════════════════════════════════════════

section "5. Performance"

# Health endpoint response time
HEALTH_TIME=$(curl -s -o /dev/null -w "%{time_total}" "${BASE_URL}/health" 2>/dev/null || echo "99")
HEALTH_MS=$(echo "$HEALTH_TIME * 1000" | bc 2>/dev/null || echo "9999")
HEALTH_INT=${HEALTH_MS%.*}
if [ "$HEALTH_INT" -lt 200 ]; then
  check_pass "Health endpoint latency: ${HEALTH_INT}ms (<200ms)"
elif [ "$HEALTH_INT" -lt 500 ]; then
  check_warn "Health endpoint latency: ${HEALTH_INT}ms (200-500ms)"
else
  check_fail "Health endpoint latency: ${HEALTH_INT}ms (>500ms)"
fi

# Plans endpoint response time
PLANS_TIME=$(curl -s -o /dev/null -w "%{time_total}" "${BASE_URL}/api/plans" 2>/dev/null || echo "99")
PLANS_MS=$(echo "$PLANS_TIME * 1000" | bc 2>/dev/null || echo "9999")
PLANS_INT=${PLANS_MS%.*}
if [ "$PLANS_INT" -lt 800 ]; then
  check_pass "Plans endpoint latency: ${PLANS_INT}ms (<800ms)"
elif [ "$PLANS_INT" -lt 1500 ]; then
  check_warn "Plans endpoint latency: ${PLANS_INT}ms (800-1500ms)"
else
  check_fail "Plans endpoint latency: ${PLANS_INT}ms (>1500ms)"
fi

# ═══════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════

echo ""
echo -e "${BLUE}═══ PRODUCTION READINESS SUMMARY ═══${NC}"
echo ""
echo -e "  ${GREEN}Passed:${NC}   ${PASS}"
echo -e "  ${RED}Failed:${NC}   ${FAIL}"
echo -e "  ${YELLOW}Warnings:${NC} ${WARN}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}❌ NOT READY FOR PRODUCTION — ${FAIL} critical check(s) failed${NC}"
  exit 1
elif [ "$WARN" -gt 3 ]; then
  echo -e "${YELLOW}⚠️  CONDITIONALLY READY — ${WARN} warning(s) should be addressed${NC}"
  exit 0
else
  echo -e "${GREEN}✅ READY FOR PRODUCTION${NC}"
  exit 0
fi
