/**
 * Seed: Payout Thresholds
 *
 * Populates payout_thresholds with the initial values that were previously
 * hardcoded in receipt.constants.ts (PAYOUT_THRESHOLD_*_EUR × EUR_TO_BGN_RATE).
 *
 * Run once after adding the PayoutThreshold model:
 *   npx ts-node prisma/seed-payout-thresholds.ts
 *
 * Safe to run again — skips seeding if rows already exist.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

// Source of truth: receipt.constants.ts — PAYOUT_THRESHOLD_*_EUR × EUR_TO_BGN_RATE (1.95583)
const INITIAL_THRESHOLDS = [
  { plan: 'BASIC'   as const, minAmount: 39.12 }, // 20 EUR × 1.95583
  { plan: 'LIGHT'   as const, minAmount: 19.56 }, // 10 EUR × 1.95583
  { plan: 'PREMIUM' as const, minAmount: 29.34 }, // 15 EUR × 1.95583
];

async function seed(): Promise<void> {
  const existing = await prisma.payoutThreshold.count();
  if (existing > 0) {
    console.log(`payout_thresholds already has ${existing} row(s) — skipping seed`);
    return;
  }

  await prisma.payoutThreshold.createMany({
    data: INITIAL_THRESHOLDS.map((t) => ({
      ...t,
      notes: 'Initial seed from receipt.constants.ts hardcoded values',
    })),
  });

  console.log(`✅ Seeded ${INITIAL_THRESHOLDS.length} payout threshold rows`);
  for (const t of INITIAL_THRESHOLDS) {
    console.log(`   ${t.plan}: ${t.minAmount} BGN`);
  }
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
