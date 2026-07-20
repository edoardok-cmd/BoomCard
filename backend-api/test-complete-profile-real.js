const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const crypto = require('crypto');

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  let pending;
  try {
    // Get or create a test plan
    let plan = await prisma.plan.findFirst({
      where: { planCode: 'BASIC' },
    });

    if (!plan) {
      console.log('Creating test plan...');
      plan = await prisma.plan.create({
        data: {
          planCode: 'BASIC-TEST-' + Date.now(),
          displayName: 'Basic Test Plan',
          priceYearlyEur: 100,
          cashbackRate: 0.01,
        },
      });
    }

    console.log('Using plan:', plan.planCode);

    // Create a test PendingSubscription
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const inFuture = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const testEmail = `test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@example.com`;

    console.log('Creating test PendingSubscription...');
    pending = await prisma.pendingSubscription.create({
      data: {
        email: testEmail,
        planId: plan.id,
        status: 'PAID',
        token,
        tokenExpiresAt: inFuture,
        paidAt: now,
        expiresAt: inFuture,
        billingPeriod: 'monthly',
        language: 'en',
      },
    });

    console.log('Created test PendingSubscription');
    console.log('Email:', testEmail);
    console.log('Token:', token);

    // Now call the complete-profile endpoint
    console.log('\nCalling complete-profile endpoint...');
    try {
      const response = await fetch('http://localhost:3025/api/auth/complete-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password: 'TestPassword123!',
          firstName: 'Test',
          lastName: 'User',
          phone: '+359888123456',
          marketingConsentEmail: false,
          marketingConsentPhone: false,
          lang: 'en',
        }),
      });

      const data = await response.json();
      console.log('Response status:', response.status);
      console.log('Response body:', JSON.stringify(data, null, 2));

      if (response.status === 201) {
        console.log('\n✓ Success! Account created.');
        console.log('User ID:', data.data.user.id);
      } else {
        console.log('\n✗ Failed with status', response.status);
      }
    } catch (fetchError) {
      console.error('\nError calling complete-profile endpoint:', fetchError.message);
    }
  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    // Cleanup - always delete the pending subscription we created,
    // regardless of whether the fetch above succeeded, threw, or the
    // server wasn't reachable at all. Guarded on `pending` in case the
    // script failed before the row was even created.
    if (pending) {
      try {
        await prisma.pendingSubscription.delete({ where: { id: pending.id } });
        console.log('\nCleaned up test data.');
      } catch (e) {
        console.log('\nNote: Test data may have been consumed by the endpoint (expected for success).');
      }
    }
    await prisma.$disconnect();
  }
}

main();
