// Load .env.test BEFORE importing prisma. prisma.ts calls dotenv.config('.env')
// at import time, but dotenv won't override already-set env vars — so loading
// .env.test here pins DATABASE_URL to the local test DB. Without this, tests
// silently run against whatever DATABASE_URL is in .env (historically: Neon prod).
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env.test') });

// Hard guard: if .env.test is missing in CI/fresh clones, dotenv silently
// falls back to .env (Neon prod). Refuse to run unless DATABASE_URL clearly
// points at a local/test database.
if (process.env.NODE_ENV === 'test') {
  const url = process.env.DATABASE_URL || '';
  const looksLikeTestDb = /localhost|127\.0\.0\.1|::1|_test(\b|\?)/i.test(url);
  if (!looksLikeTestDb) {
    throw new Error(
      `tests/setup.ts: refusing to run with DATABASE_URL=${url || '(unset)'}. ` +
        `Expected localhost or a *_test database — did .env.test fail to load? ` +
        `Create backend-api/.env.test from the example before running tests.`,
    );
  }
}

// Safety: prevent tests from accidentally calling real external services
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'test';
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'test';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || '';

import { prisma } from '../src/lib/prisma';

// Increase test timeout for integration tests
jest.setTimeout(30000);

// Global test setup
beforeAll(async () => {
  // Ensure database connection is ready
  await prisma.$connect();
});

// Global test teardown
afterAll(async () => {
  // Cleanup and disconnect
  await prisma.$disconnect();
});
