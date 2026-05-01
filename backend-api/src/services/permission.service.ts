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
  { key: 'partners.receipts.read', label: 'View receipt profiles', category: 'partners' },
  { key: 'partners.receipts.write', label: 'Manage receipt profiles', category: 'partners' },

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

  // Help
  // help.read.all is intentionally absent from this catalog: it is a SUPER_ADMIN-only synthetic key.
  // SUPER_ADMIN bypasses requirePermission unconditionally; the nav uses rawRole === 'SUPER_ADMIN'.
  // Keeping it out of the catalog ensures ADMIN role (which inherits every catalog key) never receives it.
  { key: 'help.read', label: 'View own support tickets', category: 'help' },
  { key: 'help.write', label: 'Manage support tickets', category: 'help' },
];

// Default allow-sets per role (deny rows are explicit RolePermission rows with allow=false).
// SUPER_ADMIN is bypassed in requirePermission; no seeding needed for it.
const ROLE_DEFAULT_ALLOWS: Record<string, string[]> = {
  ADMIN: PERMISSION_CATALOG.map((p) => p.key),
  SUPPORT: ['dashboard.read', 'subscribers.read', 'partners.read', 'control.disputes.read', 'control.disputes.write', 'help.read', 'help.write'],
  FINANCE: ['dashboard.read', 'subscribers.read', 'transactions.read', 'transactions.write', 'cashback.read', 'finance.payouts.read', 'finance.payouts.write', 'finance.invoices.read', 'finance.invoices.write', 'finance.periods.read', 'finance.periods.write', 'finance.reports.read'],
  RISK_REVIEW: ['dashboard.read', 'subscribers.read', 'transactions.read', 'control.risk.read', 'control.risk.write', 'control.disputes.read', 'control.disputes.write', 'control.rules.read'],
  PARTNER_MANAGER: ['dashboard.read', 'partners.read', 'partners.write', 'partners.requests.read', 'partners.requests.write', 'partners.onboarding.read', 'partners.onboarding.write', 'partners.locations.read', 'partners.receipts.read'],
};

// Upserts the full permission catalog and default role allow-sets.
// Safe to run multiple times (idempotent).
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
