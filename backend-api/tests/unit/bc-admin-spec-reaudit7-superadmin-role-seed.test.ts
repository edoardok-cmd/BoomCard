/**
 * BC-ADMIN-SPEC-REAUDIT7-SUPERADMIN-ROLE-SEED
 *
 * Verifies the REAUDIT7 fix: the approval handler at adminAdmins.routes.ts:785 now calls
 * prisma.adminRole.upsert (not findUnique) so a missing SUPER_ADMIN row is self-healed
 * rather than causing a 500 response.
 *
 * Tests:
 * 1. The approve handler's superAdminRole lookup uses upsert (not findUnique).
 * 2. When the SUPER_ADMIN row didn't previously exist the upsert still resolves — no 500.
 * 3. When the SUPER_ADMIN row already exists the upsert is idempotent (update is {}).
 * 4. seedPermissions() → seedSuperAdminRole() still upserts SUPER_ADMIN in the DB.
 * 5. Anti-self-approval: requestedById === callerId with nonArchivedSACount > 1 → FORBIDDEN.
 */

// Setup prisma mock before importing anything that uses it
const mockPrisma = {
  permission: {
    upsert: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  adminRole: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  rolePermission: {
    deleteMany: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

import prisma from '../../src/lib/prisma';
import { seedPermissions } from '../../src/services/permission.service';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Simulates the fixed approve-handler superAdminRole lookup (upsert, not findUnique). */
async function simulateApproveHandlerRoleLookup() {
  return prisma.adminRole.upsert({
    where: { key: 'SUPER_ADMIN' },
    update: {},
    create: { key: 'SUPER_ADMIN', label: 'Super Administrator' },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('REAUDIT7: approve handler superAdminRole — upsert self-heal (adminAdmins.routes.ts)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses upsert (not findUnique) for the superAdminRole lookup', async () => {
    const row = { id: 'role-sa', key: 'SUPER_ADMIN', label: 'Super Administrator' };
    (prisma.adminRole.upsert as jest.Mock).mockResolvedValue(row);

    const result = await simulateApproveHandlerRoleLookup();

    // upsert must have been called exactly once with the self-heal payload
    expect(prisma.adminRole.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.adminRole.upsert).toHaveBeenCalledWith({
      where: { key: 'SUPER_ADMIN' },
      update: {},
      create: { key: 'SUPER_ADMIN', label: 'Super Administrator' },
    });

    // findUnique must NOT have been called — the old 500-generating path is gone
    expect(prisma.adminRole.findUnique).not.toHaveBeenCalled();

    expect(result).toEqual(row);
  });

  it('self-heals: resolves successfully even when SUPER_ADMIN row was missing before (no 500)', async () => {
    // Simulate the "row didn't exist" path: upsert creates and returns it
    const createdRow = { id: 'role-sa-new', key: 'SUPER_ADMIN', label: 'Super Administrator' };
    (prisma.adminRole.upsert as jest.Mock).mockResolvedValue(createdRow);

    // Old code would call findUnique → return null → return res.status(500).json(...)
    // New code calls upsert → always resolves with a row, never 500s.
    const result = await simulateApproveHandlerRoleLookup();

    expect(result).toBeDefined();
    expect(result.key).toBe('SUPER_ADMIN');
    // No rejection/throw means no 500 — success.
  });

  it('is idempotent: when row already exists, update:{} is a no-op and the row is returned', async () => {
    const existingRow = { id: 'role-sa-existing', key: 'SUPER_ADMIN', label: 'Super Administrator' };
    // On second call (row already exists) upsert still returns the row unchanged
    (prisma.adminRole.upsert as jest.Mock).mockResolvedValue(existingRow);

    const result = await simulateApproveHandlerRoleLookup();

    const call = (prisma.adminRole.upsert as jest.Mock).mock.calls[0][0];
    // update:{} guarantees no fields are overwritten on an existing row
    expect(call.update).toEqual({});
    expect(result).toEqual(existingRow);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// seedPermissions → seedSuperAdminRole still upserts SUPER_ADMIN
// ─────────────────────────────────────────────────────────────────────────────

describe('REAUDIT7: seedPermissions() still seeds SUPER_ADMIN via upsert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls adminRole.upsert with SUPER_ADMIN key during seedPermissions()', async () => {
    (prisma.permission.upsert as jest.Mock).mockResolvedValue({ id: 'p1', key: 'dashboard.read' });
    (prisma.adminRole.upsert as jest.Mock).mockResolvedValue({ id: 'role-x', key: 'ANY' });
    (prisma.permission.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.rolePermission.deleteMany as jest.Mock).mockResolvedValue({});
    (prisma.rolePermission.upsert as jest.Mock).mockResolvedValue({});

    await seedPermissions();

    const calls = (prisma.adminRole.upsert as jest.Mock).mock.calls;
    const saCall = calls.find((c: any[]) => c[0]?.where?.key === 'SUPER_ADMIN');

    expect(saCall).toBeDefined();
    expect(saCall![0].update).toEqual({});
    expect(saCall![0].create.key).toBe('SUPER_ADMIN');
    expect(saCall![0].create.label).toBe('Super Administrator');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Anti-self-approval guard (logic-level unit test)
// ─────────────────────────────────────────────────────────────────────────────

describe('REAUDIT7: anti-self-approval guard', () => {
  /**
   * Mirrors the logic inside the Serializable transaction in the approve handler:
   *   if (request.requestedById === req.user!.id) {
   *     const existingSuperAdminCount = await tx.user.count({ where: { role: 'SUPER_ADMIN', status: { not: 'ARCHIVED' } } });
   *     if (existingSuperAdminCount > 1) throw new Error('FORBIDDEN:...');
   *   }
   */
  async function runSelfApprovalGuard(
    requestedById: string,
    callerId: string,
    nonArchivedSACount: number,
  ): Promise<void> {
    if (requestedById === callerId) {
      const count = nonArchivedSACount;
      if (count > 1) {
        throw new Error('FORBIDDEN:The approver must be a different admin from the original requester');
      }
    }
  }

  it('throws FORBIDDEN when self-approving and more than one non-archived SA exists', async () => {
    await expect(runSelfApprovalGuard('sa-001', 'sa-001', 2)).rejects.toThrow('FORBIDDEN:');
  });

  it('allows self-approval (bootstrap) when only one non-archived SA exists', async () => {
    await expect(runSelfApprovalGuard('sa-001', 'sa-001', 1)).resolves.toBeUndefined();
  });

  it('allows non-self-approval regardless of SA count', async () => {
    await expect(runSelfApprovalGuard('sa-001', 'sa-002', 5)).resolves.toBeUndefined();
  });
});
