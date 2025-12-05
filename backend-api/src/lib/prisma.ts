import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';
import path from 'path';
import { logger } from '../utils/logger';

// Load environment variables BEFORE creating Prisma client
// Load from backend-api/.env regardless of where the process is run from
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Configure WebSocket for serverless environments
neonConfig.webSocketConstructor = ws;

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Create adapter for Neon serverless
const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
const adapter = new PrismaNeon(pool);

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing Prisma Client');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing Prisma Client');
  await prisma.$disconnect();
  process.exit(0);
});

export default prisma;
