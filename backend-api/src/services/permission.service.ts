import prisma from '../lib/prisma';

// Full permission catalog — every key that can appear in a RolePermission row.
// Adding a new permission is a code change here + a DB re-seed; no migration needed.
export const PERMISSION_CATALOG: Array<{ key: string; label: string; category: string }> = [
  // Dashboard
  { key: 'dashboard.read', label: 'View dashboard', category: 'dashboard' },

  // Subscribers
  { key: 'subscribers.read', label: 'View subscribers', category: 'subscribers' },
  { key: 'subscribers.write', label: 'Edit subscribers', category: 'subscribers' },
  { key: 'subscribers.delete', label: 'Soft-delete subscribers', category: 'subscribers' },
  { key: 'subscribers.restore', label: 'Restore soft-deleted subscribers', category: 'subscribers' },
  { key: 'subscriptions.read', label: 'View subscriptions', category: 'subscribers' },
  { key: 'subscriptions.write', label: 'Edit subscriptions', category: 'subscribers' },
  { key: 'transactions.read', label: 'View transactions', category: 'subscribers' },
  { key: 'transactions.write', label: 'Create balance adjustments', category: 'subscribers' },
  { key: 'cashback.read', label: 'View cashback entries', category: 'subscribers' },
  { key: 'cashback.write', label: 'Manage cashback state', category: 'subscribers' },

  // Partners
  { key: 'partners.read', label: 'View partners', category: 'partners' },
  { key: 'partners.write', label: 'Edit partners', category: 'partners' },
  { key: 'partners.requests.read', label: 'View partner requests', category: 'partners' },
  { key: 'partners.requests.write', label: 'Manage partner requests', category: 'partners' },
  { key: 'partners.onboarding.read', label: 'View onboarding pipeline', category: 'partners' },
  { key: 'partners.onboarding.write', label: 'Manage onboarding pipeline', category: 'partners' },
  { key: 'partners.locations.read', label: 'View locations & QR', category: 'partners' },
  { key: 'partners.locations.write', label: 'Replace QR codes', category: 'partners' },
  // Finance
  { key: 'finance.payouts.read', label: 'View subscriber payouts', category: 'finance' },
  { key: 'finance.payouts.write', label: 'Process payouts', category: 'finance' },
  { key: 'finance.invoices.read', label: 'View partner invoices', category: 'finance' },
  { key: 'finance.invoices.write', label: 'Manage invoices', category: 'finance' },
  { key: 'finance.periods.read', label: 'View reporting periods', category: 'finance' },
  { key: 'finance.periods.write', label: 'Lock/unlock periods', category: 'finance' },
  { key: 'finance.reports.read', label: 'Export financial reports', category: 'finance' },

  // Control
  { key: 'control.risk.read', label: 'View risk queue', category: 'control' },
  { key: 'control.risk.write', label: 'Approve/reject risk items', category: 'control' },
  { key: 'control.disputes.read', label: 'View disputes', category: 'control' },
  { key: 'control.disputes.write', label: 'Manage disputes', category: 'control' },
  { key: 'control.rules.read', label: 'View fraud rules', category: 'control' },
  { key: 'control.rules.write', label: 'Edit fraud rules & limits', category: 'control' },

  // Marketing
  { key: 'marketing.read', label: 'View marketing', category: 'marketing' },
  { key: 'marketing.write', label: 'Manage campaigns', category: 'marketing' },

  // Settings
  { key: 'settings.read', label: 'View system settings', category: 'settings' },
  { key: 'settings.write', label: 'Edit system settings', category: 'settings' },

  // Admins
  { key: 'admins.read', label: 'View admin accounts', category: 'admins' },
  { key: 'admins.write', label: 'Create/edit admin accounts', category: 'admins' },
  { key: 'admins.audit.read', label: 'View audit log', category: 'admins' },
  { key: 'admins.roles.write', label: 'Assign roles & permissions', category: 'admins' },
  { key: 'admins.actions.read', label: 'View pending critical-action requests', category: 'admins' },

  // Help
  { key: 'help.read', label: 'View own support tickets', category: 'help' },
  { key: 'help.read.all', label: 'View all support tickets', category: 'help' },
  { key: 'help.write', label: 'Manage support tickets', category: 'help' },
];

// Default allow-sets per role (deny rows are explicit RolePermission rows with allow=false).
// SUPER_ADMIN is bypassed in requirePermission; no seeding needed for it.
// Exported for unit-testing the permission matrix.
export const ROLE_DEFAULT_ALLOWS: Record<string, string[]> = {
  ADMIN: PERMISSION_CATALOG.map((p) => p.key),
  // control.disputes.write is intentionally excluded: approving a dispute triggers wallet credit
  // (a financial action). Support can view disputes but only RISK_REVIEW may approve/reject.
  SUPPORT: ['dashboard.read', 'subscribers.read', 'partners.read', 'control.disputes.read', 'help.read', 'help.read.all', 'help.write'],
  // transactions.write (balance adjustments) is intentionally excluded: Finance can read and process
  // payouts/invoices but must not create arbitrary wallet adjustments — that stays with ADMIN.
  FINANCE: ['dashboard.read', 'subscribers.read', 'transactions.read', 'cashback.read', 'finance.payouts.read', 'finance.payouts.write', 'finance.invoices.read', 'finance.invoices.write', 'finance.periods.read', 'finance.periods.write', 'finance.reports.read'],
  // control.rules.read gives read-only visibility into fraud rules (GET /admin/settings/fraud-rules).
  RISK_REVIEW: ['dashboard.read', 'subscribers.read', 'transactions.read', 'control.risk.read', 'control.risk.write', 'control.disputes.read', 'control.disputes.write', 'control.rules.read'],
  // partners.write (live-partner status changes) is intentionally excluded: PARTNER_MANAGER works the
  // application pipeline and onboarding only; suspending/archiving live partners requires ADMIN.
  // admins.actions.read grants access to the critical-action approval queue (pending discount-rate
  // changes, etc.) without exposing the full admin user listing (admins.read).
  PARTNER_MANAGER: ['dashboard.read', 'partners.read', 'partners.requests.read', 'partners.requests.write', 'partners.onboarding.read', 'partners.onboarding.write', 'partners.locations.read', 'partners.locations.write', 'admins.actions.read'],
};

// Upserts the full permission catalog and default role allow-sets.
// Bidirectional: grants permissions added to the allow-set AND revokes any that were
// removed from it. Safe to run multiple times (fully idempotent).
export async function seedPermissions() {
  for (const perm of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { label: perm.label, category: perm.category },
      create: perm,
    });
  }

  const roleKeys = Object.keys(ROLE_DEFAULT_ALLOWS) as Array<keyof typeof ROLE_DEFAULT_ALLOWS>;
  for (const roleKey of roleKeys) {
    const role = await prisma.adminRole.upsert({
      where: { key: roleKey as any },
      update: {},
      create: { key: roleKey as any, label: roleKey.replace(/_/g, ' ') },
    });

    // Resolve the Permission IDs for the current allow-set so we can delete stale grants.
    const allowedPerms = await prisma.permission.findMany({
      where: { key: { in: ROLE_DEFAULT_ALLOWS[roleKey] } },
      select: { id: true },
    });
    const allowedPermIds = allowedPerms.map((p) => p.id);

    // Remove any RolePermission rows for this role that are no longer in the allow-set.
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: allowedPermIds } },
    });

    // Grant every permission in the current allow-set.
    for (const permKey of ROLE_DEFAULT_ALLOWS[roleKey]) {
      const perm = await prisma.permission.findUnique({ where: { key: permKey } });
      if (!perm) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: { allow: true },
        create: { roleId: role.id, permissionId: perm.id, allow: true },
      });
    }
  }
}

// Returns the effective permission key set for a given userId.
// allow=true rows grant; allow=false rows explicitly deny (deny wins).
export async function resolveUserPermissions(userId: string): Promise<string[]> {
  const userRoles = await prisma.userAdminRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      },
    },
  });

  const allowed = new Set<string>();
  const denied = new Set<string>();

  for (const ur of userRoles) {
    for (const rp of ur.role.rolePermissions) {
      if (rp.allow) {
        allowed.add(rp.permission.key);
      } else {
        denied.add(rp.permission.key);
      }
    }
  }

  // Explicit deny beats allow
  for (const key of denied) {
    allowed.delete(key);
  }

  return [...allowed];
}
