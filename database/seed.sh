#!/bin/bash

# BoomCard Database Seed Script
# This script populates the database with sample offers

echo "🌱 BoomCard Database Seeding Script"
echo "===================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  DATABASE_URL environment variable is not set"
    echo ""
    echo "Please set it first:"
    echo "  export DATABASE_URL=postgresql://user:password@localhost:5432/boomcard"
    echo ""
    echo "Or run with connection string:"
    echo "  DATABASE_URL=postgresql://user:password@localhost:5432/boomcard ./seed.sh"
    echo ""
    exit 1
fi

echo "📊 Database: $DATABASE_URL"
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "❌ Error: psql is not installed"
    echo "Please install PostgreSQL client first"
    exit 1
fi

echo "🔄 Running seed script..."
echo ""

# Run the SQL script
psql "$DATABASE_URL" -f seed-sample-offers.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Success! Database seeded with sample offers"
    echo ""
    echo "📋 Next steps:"
    echo "  1. Start your API server: npm run dev"
    echo "  2. Start the frontend: cd partner-dashboard && npm run dev"
    echo "  3. Open http://localhost:5173"
    echo ""
    echo "🎉 The homepage should now display 6 featured offers!"
else
    echo ""
    echo "❌ Error: Failed to seed database"
    echo "Check the error message above for details"
    exit 1
fi
