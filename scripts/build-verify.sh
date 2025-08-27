#!/bin/bash

# BoomCard Platform Build Verification Script
# Ensures all services can build successfully before deployment

set -e

echo "🏗️  BoomCard Platform Build Verification"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
TOTAL_SERVICES=0
SUCCESSFUL_BUILDS=0
FAILED_BUILDS=0

# Function to build a Node.js service
build_node_service() {
    local service=$1
    echo -e "\n📦 Building $service..."
    
    if [ -d "$service" ] && [ -f "$service/package.json" ]; then
        cd "$service"
        
        # Install dependencies
        echo "  Installing dependencies..."
        npm install --silent 2>&1 || {
            echo -e "${RED}  ❌ Failed to install dependencies for $service${NC}"
            FAILED_BUILDS=$((FAILED_BUILDS + 1))
            cd ..
            return 1
        }
        
        # Run build
        echo "  Building..."
        npm run build 2>&1 || {
            echo -e "${RED}  ❌ Failed to build $service${NC}"
            FAILED_BUILDS=$((FAILED_BUILDS + 1))
            cd ..
            return 1
        }
        
        echo -e "${GREEN}  ✅ Successfully built $service${NC}"
        SUCCESSFUL_BUILDS=$((SUCCESSFUL_BUILDS + 1))
        cd ..
    else
        echo -e "${YELLOW}  ⚠️  Skipping $service (no package.json found)${NC}"
    fi
    
    TOTAL_SERVICES=$((TOTAL_SERVICES + 1))
}

# Function to verify Python service
verify_python_service() {
    local service=$1
    echo -e "\n🐍 Verifying $service..."
    
    if [ -d "$service" ] && [ -f "$service/requirements.txt" ]; then
        cd "$service"
        
        # Check Python syntax
        echo "  Checking Python syntax..."
        python -m py_compile src/*.py 2>&1 || {
            echo -e "${RED}  ❌ Python syntax errors in $service${NC}"
            FAILED_BUILDS=$((FAILED_BUILDS + 1))
            cd ..
            return 1
        }
        
        echo -e "${GREEN}  ✅ Python service $service verified${NC}"
        SUCCESSFUL_BUILDS=$((SUCCESSFUL_BUILDS + 1))
        cd ..
    else
        echo -e "${YELLOW}  ⚠️  Skipping $service (no requirements.txt found)${NC}"
    fi
    
    TOTAL_SERVICES=$((TOTAL_SERVICES + 1))
}

# Run dependency check first
echo "🔍 Running dependency check..."
node scripts/dependency-check.js

# Build all services
echo -e "\n🏗️  Building all services..."

# Backend services
for service in api-gateway auth-service user-service analytics-service event-processor \
               query-service notification-service storage-service scheduler-service \
               monitoring-service reporting-service; do
    build_node_service $service
done

# Frontend applications
for app in partner-dashboard customer-portal admin-panel; do
    build_node_service $app
done

# Python ML service
verify_python_service ml-service

# Generate build report
echo -e "\n📊 Build Verification Report"
echo "============================"
echo "Total Services: $TOTAL_SERVICES"
echo -e "Successful: ${GREEN}$SUCCESSFUL_BUILDS${NC}"
echo -e "Failed: ${RED}$FAILED_BUILDS${NC}"

if [ $FAILED_BUILDS -eq 0 ]; then
    echo -e "\n${GREEN}✅ All builds successful! Platform is ready for deployment.${NC}"
    exit 0
else
    echo -e "\n${RED}❌ Build verification failed. Please fix the errors above.${NC}"
    exit 1
fi