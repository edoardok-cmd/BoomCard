/**
 * One-off migration: copy the legacy marketingConsent boolean to the new
 * per-channel columns (marketingConsentEmail / marketingConsentPhone).
 *
 * Run AFTER `prisma db push` has applied the new columns, and BEFORE
 * deploying Phase 2 backend code that writes only to the new columns.
 *
 * Usage:
 *   DRY_RUN=true npx ts-node scripts/migrate-marketing-consent.ts
 *   npx ts-node scripts/migrate-marketing-consent.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === 'true';

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);

  const affected = await prisma.user.findMany({
    where: {
      marketingConsent: true,
      OR: [
        { marketingConsentEmail: false },
        { marketingConsentPhone: false },
      ],
    },
    select: {
      id: true,
      email: true,
      marketingConsent: true,
      marketingConsentAt: true,
      marketingConsentEmail: true,
      marketingConsentPhone: true,
    },
  });

  console.log(`Users to migrate: ${affected.length}`);

  if (DRY_RUN) {
    affected.forEach(u =>
      console.log(
        `  [DRY] ${u.id} (${u.email}): email=${u.marketingConsentEmail} phone=${u.marketingConsentPhone} → both=true`
      )
    );
    return;
  }

  let migrated = 0;
  for (const user of affected) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        marketingConsentEmail: user.marketingConsent,
        marketingConsentPhone: user.marketingConsent,
        // Use existing timestamp as best estimate; null if never recorded
        marketingConsentEmailAt: user.marketingConsentAt,
        marketingConsentPhoneAt: user.marketingConsentAt,
      },
    });
    migrated++;
  }

  console.log(`Migrated ${migrated} users.`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
