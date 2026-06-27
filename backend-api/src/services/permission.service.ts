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
  // U3 (spec §2.1 / Clash 5.4): bounded fraud-rule write. Holders may create/edit
  // fraud rules but only within the engineering FRAUD_RULE_BOUNDS; values outside
  // the bounds are rejected (422). Distinct from `control.rules.write` (full,
  // may exceed bounds). Granted to RISK_REVIEW so risk reviewers can tune limits
  // within safe ranges without being able to disable protections.
  { key: 'control.rules.write.bounded', label: 'Edit fraud rules within bounds', category: 'control' },
  { key: 'control.receipts.read', label: 'View receipt review queue', category: 'control' },
  { key: 'control.receipts.write', label: 'Approve/reject receipts', category: 'control' },

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

  // Impersonation (BC-ADMIN-RBAC-ROLES-019) — OVERRIDE-ONLY keys. These are deliberately
  // NOT part of any ROLE_DEFAULT_ALLOWS entry; they are granted exclusively via
  // UserPermissionOverride (per-admin toggles). SUPER_ADMIN bypasses all permission checks.
  // BG labels live in the frontend.
  { key: 'impersonate.partner', label: 'Impersonate a partner', category: 'impersonation' },
  { key: 'impersonate.user', label: 'Impersonate an end-user', category: 'impersonation' },
];

// BC-ADMIN-RBAC-ROLES-019 — keys stripped from the repurposed ADMIN ("Normal Administrator")
// template. After this change only SUPER_ADMIN can manage admins / roles / audit.
const ADMIN_MANAGEMENT_KEYS = ['admins.read', 'admins.write', 'admins.audit.read', 'admins.roles.write', 'admins.actions.read'];

// Override-only keys that must never be granted by a role template (only via UserPermissionOverride).
const OVERRIDE_ONLY_KEYS = ['impersonate.partner', 'impersonate.user'];

// Default allow-sets per role (deny rows are explicit RolePermission rows with allow=false).
// SUPER_ADMIN is bypassed in requirePermission; however, the AdminRole row MUST exist because
// it is queried at runtime by the approval handler (adminAdmins.routes.ts:785).
// Exported for unit-testing the permission matrix.
export const ROLE_DEFAULT_ALLOWS: Record<string, string[]> = {
  // BC-ADMIN-RBAC-ROLES-019: ADMIN is now the "Normal Administrator" template. It receives
  // every catalog key EXCEPT the five admins.* admin/role-management keys (reserved for
  // SUPER_ADMIN, which is bypassed in requirePermission and is never seeded) AND except the
  // two override-only impersonate.* keys (granted per-admin via UserPermissionOverride only).
  // seedPermissions() is bidirectional — re-running it after this change deletes the now-removed
  // admins.* RolePermission rows from the ADMIN role automatically (see deleteMany below); it
  // never touches SUPER_ADMIN since that role is not in this map.
  ADMIN: PERMISSION_CATALOG.map((p) => p.key).filter(
    (k) => !ADMIN_MANAGEMENT_KEYS.includes(k) && !OVERRIDE_ONLY_KEYS.includes(k),
  ),
  // control.disputes.write is intentionally excluded: approving a dispute triggers wallet credit
  // (a financial action). Support can view disputes but only RISK_REVIEW may approve/reject.
  // subscriptions.read / transactions.read / cashback.read are included so Support can see a
  // complete subscriber profile (plan, status, transaction history, cashback) without write access.
  SUPPORT: ['dashboard.read', 'subscribers.read', 'subscriptions.read', 'transactions.read', 'cashback.read', 'partners.read', 'control.disputes.read', 'help.read', 'help.read.all', 'help.write'],
  // transactions.write (balance adjustments) is intentionally excluded: Finance can read and process
  // payouts/invoices but must not create arbitrary wallet adjustments — that stays with ADMIN.
  // subscriptions.read is required so Finance can verify subscription plan/status when processing
  // payouts and resolving invoice disputes (GET /admin/subscriptions/user/:id/history).
  FINANCE: ['dashboard.read', 'subscribers.read', 'subscriptions.read', 'transactions.read', 'cashback.read', 'finance.payouts.read', 'finance.payouts.write', 'finance.invoices.read', 'finance.invoices.write', 'finance.periods.read', 'finance.periods.write', 'finance.reports.read'],
  // control.rules.read gives read-only visibility into fraud rules (GET /admin/settings/fraud-rules).
  // control.rules.write.bounded (U3, spec §2.1 / Clash 5.4) lets RISK_REVIEW create/edit fraud rules
  // within the engineering bounds only — out-of-bounds values are rejected (422); exceeding bounds
  // stays a SUPER_ADMIN / full control.rules.write privilege. RISK_REVIEW deliberately does NOT get the
  // unbounded control.rules.write key.
  // cashback.read is required to see cashback entry state (PENDING/LOCKED/EXPIRED) when investigating
  // a flagged scan — without it the risk reviewer cannot correlate the transaction with its cashback entry.
  RISK_REVIEW: ['dashboard.read', 'subscribers.read', 'transactions.read', 'cashback.read', 'control.risk.read', 'control.risk.write', 'control.disputes.read', 'control.disputes.write', 'control.rules.read', 'control.rules.write.bounded', 'control.receipts.read', 'control.receipts.write'],
  // partners.write (live-partner status changes) is intentionally excluded: PARTNER_MANAGER works the
  // application pipeline and onboarding only; suspending/archiving live partners requires ADMIN.
  // admins.actions.read grants read access to GET /admin/admins/critical-actions so
  // PARTNER_MANAGER can monitor pending DISCOUNT_RATE_CHANGE requests they submitted,
  // without exposing the full admin user listing (admins.read).
  // Discount-rate change proposals are submitted via POST /admin/partners/:id/propose-discount-rate
  // (requires partners.requests.write) and are executed only on SUPER_ADMIN approval.
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

  // Seed the SUPER_ADMIN role. SUPER_ADMIN is bypassed in requirePermission and requires
  // no RolePermission grants. The approval handler at adminAdmins.routes.ts:785 self-heals
  // via adminRole.upsert (idempotent); this call provides early warm-up so the row exists
  // before the first approval attempt.
  await seedSuperAdminRole();
}

// Seeds the SUPER_ADMIN role row. SUPER_ADMIN is bypassed in requirePermission and requires
// no RolePermission grants. The approval handler at adminAdmins.routes.ts:785 self-heals
// via adminRole.upsert, so this function is a warm-up rather than a hard dependency.
async function seedSuperAdminRole() {
  await prisma.adminRole.upsert({
    where: { key: 'SUPER_ADMIN' },
    update: {},
    create: { key: 'SUPER_ADMIN', label: 'Super Administrator' },
  });
}

// Returns the effective permission key set for a given userId.
//
// BC-ADMIN-RBAC-ROLES-019 — precedence (strongest wins):
//   user-deny  >  user-allow  >  role-deny  >  role-allow
//
// First the role union is computed (allow rows grant, deny rows revoke — role-level
// deny beats role-level allow). Then per-user UserPermissionOverride rows are folded
// in on top: a user allow=true GRANTS the key even if a role denied it (user-allow
// beats role-deny), and a user allow=false REVOKES the key even if a role (or a user
// allow on the same key — impossible given the @@unique, but defensively) granted it.
// Because a single user override row is unique per (userId, permissionId), a key cannot
// be both user-allowed and user-denied at once; the override's `allow` value is final.
//
// Expired role assignments (expiresAt <= now) are excluded — they do not contribute
// permissions. User overrides have no expiry and always apply.
export async function resolveUserPermissions(userId: string): Promise<string[]> {
  const now = new Date();
  const [userRoles, overrides] = await Promise.all([
    prisma.userAdminRole.findMany({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    }),
    prisma.userPermissionOverride.findMany({
      where: { userId },
      include: { permission: true },
    }),
  ]);

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

  // Role-level deny beats role-level allow.
  for (const key of denied) {
    allowed.delete(key);
  }

  // Fold in per-user overrides. These are the strongest signal: a user-allow grants
  // the key even when a role denied it; a user-deny revokes it regardless of role.
  for (const ov of overrides) {
    const key = ov.permission.key;
    if (ov.allow) {
      allowed.add(key);
    } else {
      allowed.delete(key);
    }
  }

  return [...allowed];
}

// Set of all valid permission keys — used to validate override writes against the
// real catalog so unknown keys are rejected before hitting the DB.
const CATALOG_KEYS = new Set(PERMISSION_CATALOG.map((p) => p.key));

/** True when `key` is a real permission in PERMISSION_CATALOG. */
export function isValidPermissionKey(key: string): boolean {
  return CATALOG_KEYS.has(key);
}

// Returns the permission catalog grouped by category for FE rendering.
// Pure transform over PERMISSION_CATALOG — no DB hit.
export function getPermissionCatalogGrouped(): Array<{
  category: string;
  permissions: Array<{ key: string; label: string }>;
}> {
  const byCategory = new Map<string, Array<{ key: string; label: string }>>();
  for (const p of PERMISSION_CATALOG) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, []);
    byCategory.get(p.category)!.push({ key: p.key, label: p.label });
  }
  return [...byCategory.entries()].map(([category, permissions]) => ({ category, permissions }));
}

// Returns the effective-permission breakdown for an admin: which keys come from role
// templates, which are overridden (allow/deny), and the final effective set. Used by
// GET /admin/admins/:id/permissions so the FE can render template-inherited vs toggled.
export async function resolveUserPermissionBreakdown(userId: string): Promise<{
  effective: string[];
  roleAllowed: string[];
  roleDenied: string[];
  overrides: Array<{ key: string; allow: boolean }>;
}> {
  const now = new Date();
  const [userRoles, overrideRows] = await Promise.all([
    prisma.userAdminRole.findMany({
      where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
      },
    }),
    prisma.userPermissionOverride.findMany({
      where: { userId },
      include: { permission: true },
    }),
  ]);

  const roleAllowed = new Set<string>();
  const roleDenied = new Set<string>();
  for (const ur of userRoles) {
    for (const rp of ur.role.rolePermissions) {
      if (rp.allow) roleAllowed.add(rp.permission.key);
      else roleDenied.add(rp.permission.key);
    }
  }
  for (const key of roleDenied) roleAllowed.delete(key);

  const effective = new Set<string>(roleAllowed);
  const overrides = overrideRows.map((ov) => ({ key: ov.permission.key, allow: ov.allow }));
  for (const ov of overrides) {
    if (ov.allow) effective.add(ov.key);
    else effective.delete(ov.key);
  }

  return {
    effective: [...effective],
    roleAllowed: [...roleAllowed],
    roleDenied: [...roleDenied],
    overrides,
  };
}
