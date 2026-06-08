/**
 * Unit Tests: BC-ADMIN-RBAC-ROLES-019 — per-user permission override resolution.
 *
 * Verifies the precedence ladder enforced by resolveUserPermissions() and the
 * role-vs-override breakdown returned by resolveUserPermissionBreakdown():
 *
 *     user-deny  >  user-allow  >  role-deny  >  role-allow
 *
 * Specifically:
 *   1. A role allow with no override → key is effective.
 *   2. A role deny with no override → key is NOT effective.
 *   3. A user allow=true overrides a role-level deny → key IS effective.
 *   4. A user allow=false removes a role-level allow → key NOT effective.
 *   5. The catalog helpers validate keys and group by category.
 *
 * All Prisma access is mocked — this is a pure resolution-logic test, no DB.
 */

// ─── Prisma mock ──────────────────────────────────────────────────────────────

interface RolePerm { allow: boolean; permission: { key: string } }
interface OverrideRow { allow: boolean; permission: { key: string } }

let mockRolePerms: RolePerm[] = [];
let mockOverrides: OverrideRow[] = [];

jest.mock('../../src/lib/prisma', () => {
  const client: any = {
    userAdminRole: {
      findMany: jest.fn(async () => [
        { role: { rolePermissions: mockRolePerms } },
      ]),
    },
    userPermissionOverride: {
      findMany: jest.fn(async () => mockOverrides),
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

import {
  resolveUserPermissions,
  resolveUserPermissionBreakdown,
  isValidPermissionKey,
  getPermissionCatalogGrouped,
} from '../../src/services/permission.service';

beforeEach(() => {
  mockRolePerms = [];
  mockOverrides = [];
});

describe('resolveUserPermissions precedence', () => {
  it('role allow with no override → effective', async () => {
    mockRolePerms = [{ allow: true, permission: { key: 'subscribers.read' } }];
    const perms = await resolveUserPermissions('u1');
    expect(perms).toContain('subscribers.read');
  });

  it('role deny with no override → not effective', async () => {
    mockRolePerms = [
      { allow: true, permission: { key: 'subscribers.read' } },
      { allow: false, permission: { key: 'subscribers.read' } },
    ];
    const perms = await resolveUserPermissions('u1');
    expect(perms).not.toContain('subscribers.read');
  });

  it('user allow=true overrides a role-level deny (user-allow > role-deny)', async () => {
    mockRolePerms = [{ allow: false, permission: { key: 'impersonate.user' } }];
    mockOverrides = [{ allow: true, permission: { key: 'impersonate.user' } }];
    const perms = await resolveUserPermissions('u1');
    expect(perms).toContain('impersonate.user');
  });

  it('user allow=false removes a role-level allow (user-deny > role-allow)', async () => {
    mockRolePerms = [{ allow: true, permission: { key: 'partners.read' } }];
    mockOverrides = [{ allow: false, permission: { key: 'partners.read' } }];
    const perms = await resolveUserPermissions('u1');
    expect(perms).not.toContain('partners.read');
  });

  it('user allow=true grants an override-only key absent from every role', async () => {
    mockRolePerms = [{ allow: true, permission: { key: 'finance.payouts.read' } }];
    mockOverrides = [{ allow: true, permission: { key: 'impersonate.partner' } }];
    const perms = await resolveUserPermissions('u1');
    expect(perms).toContain('impersonate.partner');
    expect(perms).toContain('finance.payouts.read');
  });
});

describe('resolveUserPermissionBreakdown', () => {
  it('reports role-allowed, role-denied, overrides and the merged effective set', async () => {
    mockRolePerms = [
      { allow: true, permission: { key: 'partners.read' } },
      { allow: true, permission: { key: 'subscribers.read' } },
      { allow: false, permission: { key: 'control.disputes.write' } },
    ];
    mockOverrides = [
      { allow: false, permission: { key: 'partners.read' } }, // user-deny over role-allow
      { allow: true, permission: { key: 'impersonate.user' } }, // override-only grant
    ];

    const b = await resolveUserPermissionBreakdown('u1');

    expect(b.roleAllowed).toEqual(expect.arrayContaining(['subscribers.read']));
    expect(b.roleAllowed).not.toContain('control.disputes.write'); // role-denied removed
    expect(b.roleDenied).toContain('control.disputes.write');
    expect(b.overrides).toEqual(
      expect.arrayContaining([
        { key: 'partners.read', allow: false },
        { key: 'impersonate.user', allow: true },
      ]),
    );

    expect(b.effective).toContain('subscribers.read');
    expect(b.effective).toContain('impersonate.user');
    expect(b.effective).not.toContain('partners.read'); // user-deny wins
    expect(b.effective).not.toContain('control.disputes.write');
  });
});

describe('catalog helpers', () => {
  it('isValidPermissionKey accepts real keys and rejects unknown ones', () => {
    expect(isValidPermissionKey('impersonate.partner')).toBe(true);
    expect(isValidPermissionKey('impersonate.user')).toBe(true);
    expect(isValidPermissionKey('admins.roles.write')).toBe(true);
    expect(isValidPermissionKey('not.a.real.key')).toBe(false);
  });

  it('getPermissionCatalogGrouped groups every catalog key under a category', () => {
    const grouped = getPermissionCatalogGrouped();
    const flatKeys = grouped.flatMap((g) => g.permissions.map((p) => p.key));
    expect(flatKeys).toContain('impersonate.partner');
    expect(flatKeys).toContain('impersonate.user');
    const impersonationGroup = grouped.find((g) => g.category === 'impersonation');
    expect(impersonationGroup).toBeDefined();
    expect(impersonationGroup!.permissions.map((p) => p.key)).toEqual(
      expect.arrayContaining(['impersonate.partner', 'impersonate.user']),
    );
  });
});
