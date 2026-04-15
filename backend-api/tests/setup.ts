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
