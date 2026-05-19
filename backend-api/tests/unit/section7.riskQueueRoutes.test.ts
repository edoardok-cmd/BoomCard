/**
 * §7.1 Risk-Queue route audit — regression tests for the approve/reject/bulk-reject
 * endpoints that were missing from the earlier §7 audit pass.
 *
 * Covered gaps:
 *
 *   Gap A — POST /risk-queue/:id/reject requires a non-empty `reason` (400 without it)
 *            and writes an AuditLog entry with action='risk.reject' on success.
 *
 *   Gap B — POST /risk-queue/bulk-reject:
 *            - requires `scanIds` array (400 when absent or empty)
 *            - requires `reason` (400 when absent)
 *            - enforces per-request cap of 25 scans (400 when >25)
 *            - de-duplicates scanIds before passing to stickerService.bulkReject
 *            - writes one AuditLog entry per unique scan on success
 *
 *   Gap C — Source assertion: `POST /risk-queue/:id/approve` already requires notes
 *            (covered by section10.adminAdminsAudit Gap 1 — this test guards that the
 *            source-level guard is still present).
 *
 * Spec §7.1 v1.1:
 *   "Всяко решение трябва да съдържа: решаващ админ, timestamp, кратка причина
 *    (избор от dropdown + свободен текст) и автоматичен event лог в История на действията."
 */

import express from 'express';
import request from 'supertest';
import * as path from 'path';
import * as fs from 'fs';

// ─── Shared spy state ─────────────────────────────────────────────────────────

const auditCreateCalls: any[] = [];
let scanFindUniqueResult: any = null;
let scanFindManyResult: any[] = [];

// ─── Prisma mock ──────────────────────────────────────────────────────────────

jest.mock('../../src/lib/prisma', () => {
  const client: any = {
    $transaction: jest.fn(async (ops: any) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return ops(client);
    }),
    auditLog: {
      create: jest.fn(async (args: any) => {
        auditCreateCalls.push(args.data);
        return { id: 'al-1', ...args.data };
      }),
    },
    stickerScan: {
      findUnique: jest.fn(async () => scanFindUniqueResult),
      findMany:   jest.fn(async () => scanFindManyResult),
      groupBy:    jest.fn(async () => []),
      count:      jest.fn(async () => 0),
    },
    venue: {
      findMany: jest.fn(async () => []),
    },
    helpTicket: {
      findMany: jest.fn(async () => []),
      count:    jest.fn(async () => 0),
    },
    receipt: {
      findMany: jest.fn(async () => []),
      count:    jest.fn(async () => 0),
    },
    dispute: {
      findMany: jest.fn(async () => []),
      count:    jest.fn(async () => 0),
    },
    venueReceiptTemplate: {
      findMany: jest.fn(async () => []),
      count:    jest.fn(async () => 0),
    },
    user: {
      findUnique: jest.fn(async () => null),
      count:      jest.fn(async () => 0),
      findMany:   jest.fn(async () => []),
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

// ─── Sticker service mock ─────────────────────────────────────────────────────

const mockRejectScan  = jest.fn(async (_scanId: string, _reason: string, _actorId: string | null) =>
  ({ id: _scanId, status: 'REJECTED', fraudScore: 55, fraudReasons: [] })
);
const mockBulkReject  = jest.fn(async (scanIds: string[], _reason: string, _actorId: string | null) =>
  ({ successCount: scanIds.length, errorCount: 0, errors: [] })
);

jest.mock('../../src/services/sticker.service', () => ({
  stickerService: {
    approveScan:  jest.fn(async () => ({ id: 'scan-1', status: 'APPROVED', fraudScore: 20, fraudReasons: [] })),
    rejectScan:   (...args: any[]) => mockRejectScan.apply(null, args),
    bulkReject:   (...args: any[]) => mockBulkReject.apply(null, args),
  },
}));

jest.mock('../../src/services/receipt.service', () => ({
  receiptService: {
    reviewReceipt: jest.fn(async () => ({ id: 'r-1', status: 'APPROVED', fraudWarning: null })),
  },
}));

jest.mock('../../src/services/cashbackLifecycle.service', () => ({}));

// ─── Auth middleware bypass ───────────────────────────────────────────────────

const SUPER_ADMIN_USER = {
  id: 'u-super',
  email: 'super@test.com',
  role: 'SUPER_ADMIN',
  permissions: [],
  imp: false,
};

jest.mock('../../src/middleware/auth.middleware', () => {
  const original = jest.requireActual('../../src/middleware/auth.middleware');
  return {
    ...original,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = SUPER_ADMIN_USER;
      next();
    },
    authorize: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
    requirePermission: (_perm: any) => (_req: any, _res: any, next: any) => next(),
  };
});

jest.mock('../../src/middleware/audit.middleware', () => {
  const actual = jest.requireActual('../../src/middleware/audit.middleware');
  return {
    ...actual,
    auditMiddleware: (_req: any, _res: any, next: any) => next(),
    writeAudit: jest.fn(async (args: any) => {
      auditCreateCalls.push(args);
    }),
  };
});

jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingFloat: jest.fn(async (_key: string, def: number) => def),
  getSystemSettingBool:  jest.fn(async (_key: string, def: boolean) => def),
  getSystemSettingStr:   jest.fn(async (_key: string, def: string) => def),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

// ─── App setup ────────────────────────────────────────────────────────────────

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const { default: controlRoute } = await import('../../src/routes/adminControl.routes');
  app.use('/api/admin/control', controlRoute);
});

beforeEach(() => {
  auditCreateCalls.length = 0;
  scanFindUniqueResult    = null;
  scanFindManyResult      = [];
  jest.clearAllMocks();
  // Restore mock implementations after clearAllMocks.
  mockRejectScan.mockImplementation(async (scanId: string) =>
    ({ id: scanId, status: 'REJECTED', fraudScore: 55, fraudReasons: [] })
  );
  mockBulkReject.mockImplementation(async (scanIds: string[]) =>
    ({ successCount: scanIds.length, errorCount: 0, errors: [] })
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap A — POST /risk-queue/:id/reject
// ─────────────────────────────────────────────────────────────────────────────

describe('Gap A — POST /risk-queue/:id/reject', () => {
  it('A1 — returns 400 when reason is absent', async () => {
    const res = await request(app)
      .post('/api/admin/control/risk-queue/scan-1/reject')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason.*required/i);
  });

  it('A2 — returns 400 when reason is an empty string', async () => {
    const res = await request(app)
      .post('/api/admin/control/risk-queue/scan-1/reject')
      .send({ reason: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason.*required/i);
  });

  it('A3 — returns 400 when reason is whitespace only', async () => {
    const res = await request(app)
      .post('/api/admin/control/risk-queue/scan-1/reject')
      .send({ reason: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason.*required/i);
  });

  it('A4 — returns 200 and calls rejectScan when reason is provided', async () => {
    scanFindUniqueResult = { status: 'MANUAL_REVIEW', fraudScore: 55, fraudReasons: ['DUPLICATE_IMAGE'], billAmount: 20 };

    const res = await request(app)
      .post('/api/admin/control/risk-queue/scan-1/reject')
      .send({ reason: 'Duplicate receipt from same merchant' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockRejectScan).toHaveBeenCalledWith('scan-1', 'Duplicate receipt from same merchant', SUPER_ADMIN_USER.id);
  });

  it('A5 — writes AuditLog entry with action risk.reject on success', async () => {
    scanFindUniqueResult = { status: 'MANUAL_REVIEW', fraudScore: 55, fraudReasons: [], billAmount: 10 };

    await request(app)
      .post('/api/admin/control/risk-queue/scan-1/reject')
      .send({ reason: 'Fraudulent activity detected' });

    const auditEntry = auditCreateCalls.find((c) => c.action === 'risk.reject');
    expect(auditEntry).toBeDefined();
    expect(auditEntry.objectId).toBe('scan-1');
    expect(auditEntry.after.reason).toBe('Fraudulent activity detected');
  });

  it('A6 — AuditLog records the acting admin userId', async () => {
    scanFindUniqueResult = { status: 'MANUAL_REVIEW', fraudScore: 70, fraudReasons: [], billAmount: 50 };

    await request(app)
      .post('/api/admin/control/risk-queue/scan-1/reject')
      .send({ reason: 'Verified fraud' });

    const auditEntry = auditCreateCalls.find((c) => c.action === 'risk.reject');
    expect(auditEntry?.actorUserId).toBe(SUPER_ADMIN_USER.id);
  });

  it('A7 — passes actorUserId to rejectScan so Voided cashback carries voidedByUserId (§7.1)', async () => {
    scanFindUniqueResult = { status: 'MANUAL_REVIEW', fraudScore: 65, fraudReasons: [], billAmount: 30 };

    await request(app)
      .post('/api/admin/control/risk-queue/scan-1/reject')
      .send({ reason: 'Mismatch detected' });

    expect(mockRejectScan).toHaveBeenCalledWith(
      'scan-1',
      'Mismatch detected',
      SUPER_ADMIN_USER.id,  // actorUserId must be threaded through for §7.1 audit trail
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap B — POST /risk-queue/bulk-reject
// ─────────────────────────────────────────────────────────────────────────────

describe('Gap B — POST /risk-queue/bulk-reject', () => {
  it('B1 — returns 400 when scanIds is absent', async () => {
    const res = await request(app)
      .post('/api/admin/control/risk-queue/bulk-reject')
      .send({ reason: 'Bulk reject test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scanIds.*required/i);
  });

  it('B2 — returns 400 when scanIds is an empty array', async () => {
    const res = await request(app)
      .post('/api/admin/control/risk-queue/bulk-reject')
      .send({ scanIds: [], reason: 'Bulk reject test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scanIds.*required/i);
  });

  it('B3 — returns 400 when reason is absent', async () => {
    const res = await request(app)
      .post('/api/admin/control/risk-queue/bulk-reject')
      .send({ scanIds: ['scan-1', 'scan-2'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason.*required/i);
  });

  it('B4 — returns 400 when reason is empty string', async () => {
    const res = await request(app)
      .post('/api/admin/control/risk-queue/bulk-reject')
      .send({ scanIds: ['scan-1'], reason: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason.*required/i);
  });

  it('B5 — returns 400 when scanIds.length > 25 (cap enforcement §7.1)', async () => {
    const scanIds = Array.from({ length: 26 }, (_, i) => `scan-${i + 1}`);
    const res = await request(app)
      .post('/api/admin/control/risk-queue/bulk-reject')
      .send({ scanIds, reason: 'Batch overflow' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/batch limited to 25/i);
  });

  it('B6 — accepts exactly 25 scans (boundary case)', async () => {
    const scanIds = Array.from({ length: 25 }, (_, i) => `scan-${i + 1}`);
    scanFindManyResult = scanIds.map((id) => ({ id, status: 'MANUAL_REVIEW', fraudScore: 50, fraudReasons: [], billAmount: 10 }));

    const res = await request(app)
      .post('/api/admin/control/risk-queue/bulk-reject')
      .send({ scanIds, reason: 'Mass reject at cap' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('B7 — de-duplicates scanIds before calling stickerService.bulkReject', async () => {
    const duplicated = ['scan-1', 'scan-2', 'scan-1', 'scan-2', 'scan-1'];
    scanFindManyResult = [
      { id: 'scan-1', status: 'MANUAL_REVIEW', fraudScore: 50, fraudReasons: [], billAmount: 10 },
      { id: 'scan-2', status: 'MANUAL_REVIEW', fraudScore: 60, fraudReasons: [], billAmount: 20 },
    ];

    await request(app)
      .post('/api/admin/control/risk-queue/bulk-reject')
      .send({ scanIds: duplicated, reason: 'Dedup test' });

    expect(mockBulkReject).toHaveBeenCalledTimes(1);
    const calledIds: string[] = mockBulkReject.mock.calls[0][0];
    expect(calledIds).toHaveLength(2);
    expect(calledIds).toContain('scan-1');
    expect(calledIds).toContain('scan-2');
  });

  it('B8 — writes one AuditLog entry per unique scan with action=risk.reject', async () => {
    scanFindManyResult = [
      { id: 'scan-1', status: 'MANUAL_REVIEW', fraudScore: 50, fraudReasons: [], billAmount: 10 },
      { id: 'scan-2', status: 'MANUAL_REVIEW', fraudScore: 60, fraudReasons: [], billAmount: 20 },
    ];

    await request(app)
      .post('/api/admin/control/risk-queue/bulk-reject')
      .send({ scanIds: ['scan-1', 'scan-2'], reason: 'Bulk: repeated fraud pattern' });

    const rejectAuditEntries = auditCreateCalls.filter((c) => c.action === 'risk.reject');
    expect(rejectAuditEntries).toHaveLength(2);
    const objectIds = rejectAuditEntries.map((e) => e.objectId);
    expect(objectIds).toContain('scan-1');
    expect(objectIds).toContain('scan-2');
  });

  it('B9 — AuditLog entries carry bulk:true flag', async () => {
    scanFindManyResult = [
      { id: 'scan-1', status: 'MANUAL_REVIEW', fraudScore: 40, fraudReasons: [], billAmount: 5 },
    ];

    await request(app)
      .post('/api/admin/control/risk-queue/bulk-reject')
      .send({ scanIds: ['scan-1'], reason: 'Batch sweep' });

    const entry = auditCreateCalls.find((c) => c.action === 'risk.reject');
    expect(entry?.after?.bulk).toBe(true);
  });

  it('B10 — passes actorUserId to bulkReject for the Voided cashback audit trail (§7.1)', async () => {
    scanFindManyResult = [
      { id: 'scan-A', status: 'MANUAL_REVIEW', fraudScore: 45, fraudReasons: [], billAmount: 8 },
    ];

    await request(app)
      .post('/api/admin/control/risk-queue/bulk-reject')
      .send({ scanIds: ['scan-A'], reason: 'Actor thread test' });

    expect(mockBulkReject).toHaveBeenCalledWith(
      ['scan-A'],
      'Actor thread test',
      SUPER_ADMIN_USER.id,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap C — Source-level guard: approve still requires notes
// ─────────────────────────────────────────────────────────────────────────────

describe('Gap C — approve still requires notes (source guard)', () => {
  it('source contains notes guard before stickerService.approveScan call', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/routes/adminControl.routes.ts'),
      'utf8',
    );
    // The guard: if (!notes) return 400 — must precede the approveScan call.
    const notesGuardIdx  = src.indexOf("if (!notes) return res.status(400)");
    const approveScanIdx = src.indexOf('stickerService.approveScan');
    expect(notesGuardIdx).toBeGreaterThan(0);
    expect(approveScanIdx).toBeGreaterThan(0);
    expect(notesGuardIdx).toBeLessThan(approveScanIdx);
  });

  it('source contains reason guard before stickerService.rejectScan call', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/routes/adminControl.routes.ts'),
      'utf8',
    );
    const reasonGuardIdx = src.indexOf("if (!reason)");
    const rejectScanIdx  = src.indexOf('stickerService.rejectScan');
    expect(reasonGuardIdx).toBeGreaterThan(0);
    expect(rejectScanIdx).toBeGreaterThan(0);
    expect(reasonGuardIdx).toBeLessThan(rejectScanIdx);
  });

  it('bulk-reject batch cap is 25 in source', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/routes/adminControl.routes.ts'),
      'utf8',
    );
    expect(src).toMatch(/scanIds\.length\s*>\s*25/);
  });
});
