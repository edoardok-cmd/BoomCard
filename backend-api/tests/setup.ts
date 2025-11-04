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
