/**
 * Seed: Cashback Rate Matrix
 *
 * Populates the cashback_rates table with the initial rate matrix
 * that was previously hardcoded in receipt.constants.ts.
 *
 * Run once after adding the CashbackRate model:
 *   npx tsx prisma/seed-cashback-rates.ts
 *
 * Safe to run again — skips seeding if rows already exist.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

const adapter = new PrismaNeon({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter } as any);

// Source of truth: BOOM_Card_Master_Functionality.docx — Section 2
const INITIAL_RATES = [
  { discountStep: 5,  basic: 5,  premium: 5  },
  { discountStep: 10, basic: 5,  premium: 8  },
  { discountStep: 15, basic: 8,  premium: 12 },
  { discountStep: 20, basic: 10, premium: 16 },
  { discountStep: 25, basic: 10, premium: 20 },
];

async function seed(): Promise<void> {
  const existing = await prisma.cashbackRate.count();
  if (existing > 0) {
    console.log(`cashback_rates already has ${existing} row(s) — skipping seed`);
    return;
  }

  const effectiveFrom = new Date('2024-01-01T00:00:00.000Z'); // back-dated to cover all historical receipts

  await prisma.cashbackRate.createMany({
    data: INITIAL_RATES.map(r => ({
      ...r,
      effectiveFrom,
      notes: 'Initial seed from BOOM_Card_Master_Functionality.docx Section 2',
    })),
  });

  console.log(`Seeded ${INITIAL_RATES.length} cashback rate rows (effectiveFrom: ${effectiveFrom.toISOString()})`);
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
