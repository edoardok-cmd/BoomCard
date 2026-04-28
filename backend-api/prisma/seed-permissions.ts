/**
 * seed-permissions.ts
 *
 * Run once (or re-run safely — it's idempotent) after any schema.prisma db push
 * that adds the Phase-0 RBAC tables.
 *
 * Usage:
 *   npx tsx prisma/seed-permissions.ts
 *
 * What it does:
 * 1. Upserts the full Permission catalog.
 * 2. Upserts AdminRole rows for ADMIN, SUPPORT, FINANCE, RISK_REVIEW, PARTNER_MANAGER.
 * 3. Assigns all permissions to ADMIN role (allow=true).
 * 4. Finds every User with role SUPER_ADMIN or ADMIN and assigns them the ADMIN
 *    AdminRole so they retain full access after the RBAC migration.
 */

import { PrismaClient } from '@prisma/client';
import { seedPermissions, resolveUserPermissions } from '../src/services/permission.service';

const prisma = new PrismaClient();

async function main() {
  console.log('⚙️  Seeding permissions catalog and roles…');
  await seedPermissions();
  console.log('✅ Permission catalog and role defaults seeded.');

  // Ensure every existing SUPER_ADMIN/ADMIN user gets the ADMIN AdminRole
  const adminRole = await prisma.adminRole.findUnique({ where: { key: 'ADMIN' } });
  if (!adminRole) {
    console.error('❌ ADMIN AdminRole not found after seeding. Aborting.');
    process.exit(1);
  }

  const adminUsers = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
  });

  for (const u of adminUsers) {
    await prisma.userAdminRole.upsert({
      where: { userId_roleId: { userId: u.id, roleId: adminRole.id } },
      update: {},
      create: { userId: u.id, roleId: adminRole.id },
    });
  }

  console.log(`✅ Assigned ADMIN role to ${adminUsers.length} existing admin user(s).`);

  // Quick sanity check
  if (adminUsers[0]) {
    const perms = await resolveUserPermissions(adminUsers[0].id);
    console.log(`   First admin (${adminUsers[0].email}) has ${perms.length} permissions.`);
  }

  console.log('\n🎉 Permissions seed complete. Run `npx tsx prisma/seed-permissions.ts` again any time to sync new catalog entries.\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding permissions:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
