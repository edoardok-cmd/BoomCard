/**
 * One-time migration: rename SystemSetting key
 *   auto_approve_threshold  →  correction_warning_threshold
 *
 * Run BEFORE or immediately after deploying the code change.
 * The key defaults to 30 when absent, so a brief window with neither key
 * present is safe — the service falls back to DEFAULT_CORRECTION_WARNING_THRESHOLD.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/rename-correction-warning-threshold.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const OLD_KEY = 'auto_approve_threshold';
  const NEW_KEY = 'correction_warning_threshold';

  const existing = await prisma.systemSetting.findUnique({ where: { key: OLD_KEY } });

  if (!existing) {
    console.log(`Nothing to migrate — "${OLD_KEY}" not found in system_settings (already renamed or never set).`);
    return;
  }

  const alreadyNew = await prisma.systemSetting.findUnique({ where: { key: NEW_KEY } });
  if (alreadyNew) {
    console.log(`"${NEW_KEY}" already exists (value: ${alreadyNew.value}). Removing stale "${OLD_KEY}" row.`);
    await prisma.systemSetting.delete({ where: { key: OLD_KEY } });
    console.log('Done.');
    return;
  }

  await prisma.$transaction([
    prisma.systemSetting.create({
      data: {
        key: NEW_KEY,
        value: existing.value,
        updatedBy: existing.updatedBy,
      },
    }),
    prisma.systemSetting.delete({ where: { key: OLD_KEY } }),
  ]);

  console.log(`Migrated "${OLD_KEY}" → "${NEW_KEY}" (value: ${existing.value}).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
