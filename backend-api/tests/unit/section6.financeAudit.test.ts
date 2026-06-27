/**
 * §6 Finance — audit-pass tests for adminFinance.routes.ts
 *
 * Covered gaps:
 *
 *   §6.2 Invoice mutations:
 *     Gap 1 — POST /invoices/generate blocked on LOCKED/INVOICED period (409)
 *     Gap 2 — POST /invoices/generate PAID invoices are preserved (skippedPaid counter)
 *     Gap 3 — POST /invoices/generate invalid month format → 400
 *     Gap 4 — POST /invoices/generate no approved scans → success with created=0
 *     Gap 5 — POST /invoices/:id/pay double-pay → 400 (already PAID)
 *     Gap 6 — POST /invoices/:id/pay invoice not found → 404
 *     Gap 7 — PATCH /invoices/:id/status blocked on LOCKED period (409)
 *     Gap 8 — PATCH /invoices/:id/status cannot change status of PAID invoice → 400
 *     Gap 9 — PATCH /invoices/:id/status invalid status → 400
 *     Gap 10 — PATCH /invoices/:id/notes works on PAID invoices (notes always editable)
 *
 *   §6.3 Reporting period lifecycle:
 *     Gap 11 — PATCH /reporting-periods/:month/status OPEN→FOR_REVIEW with no invoices → 409
 *     Gap 12 — PATCH /reporting-periods/:month/status OPEN→LOCKED (skip step) → 400
 *     Gap 13 — PATCH /reporting-periods/:month/status INVOICED→OPEN (backward) → 400
 *     Gap 14 — PATCH /reporting-periods/:month/status period not found → 404
 *     Gap 15 — DELETE /reporting-periods/:month LOCKED → 409
 *     Gap 16 — DELETE /reporting-periods/:month INVOICED → 409
 *     Gap 17 — DELETE /reporting-periods/:month when invoices exist → 409
 *     Gap 18 — DELETE /reporting-periods/:month when unbilled scans exist → 409
 *
 *   §6.4 Export:
 *     Gap 19 — GET /export invalid type → 400
 *     Gap 20 — GET /export invalid format → 400
 *
 * Spec §6.3: "Месецът трябва да може да се затваря. След заключване на период
 * данните за фактуриране не се променят свободно."
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../src/utils/currencyDisplay', () => ({
  isCurrencyTransitionWindowOpen: jest.fn(async () => false),
  toDualCurrency: jest.fn((v: any) => v),
  buildDualCurrencyMap: jest.fn(() => ({})),
}));

// ─── Mutable mock state ────────────────────────────────────────────────────────

let reportingPeriodFindUniqueResult: any = null;
let reportingPeriodFindManyResult: any[] = [];
let invoiceFindUniqueResult: any = null;
let invoiceFindManyResult: any[] = [];
let invoiceAggregateResult: any = { _sum: {}, _count: {} };
let invoiceCountResult = 0;
let invoiceUpdateManyResult: any = { count: 1 };
let invoiceUpdateResult: any = null;
let stickerScanFindManyResult: any[] = [];
let stickerScanCountResult = 0;
const reportingPeriodUpdateCalls: any[] = [];
const reportingPeriodDeleteCalls: any[] = [];

// ─── Prisma mock ──────────────────────────────────────────────────────────────

jest.mock('../../src/lib/prisma', () => {
  const client: any = {
    $transaction: jest.fn(async (fn: any, _opts?: any) => {
      if (typeof fn === 'function') return fn(client);
      if (Array.isArray(fn)) return Promise.all(fn);
      return fn;
    }),
    reportingPeriod: {
      findUnique:  jest.fn(async () => reportingPeriodFindUniqueResult),
      findMany:    jest.fn(async () => reportingPeriodFindManyResult),
      upsert:      jest.fn(async (args: any) => ({ id: 'rp-1', month: args.create?.month ?? 'rp', status: 'OPEN', ...args.create })),
      update:      jest.fn(async (args: any) => {
        reportingPeriodUpdateCalls.push(args);
        return { id: 'rp-1', ...args.data };
      }),
      delete:      jest.fn(async (args: any) => {
        reportingPeriodDeleteCalls.push(args);
        return { id: 'rp-1' };
      }),
    },
    partnerCashbackPayment: {
      findUnique:  jest.fn(async () => invoiceFindUniqueResult),
      findMany:    jest.fn(async () => invoiceFindManyResult),
      findFirst:   jest.fn(async () => null),
      aggregate:   jest.fn(async () => invoiceAggregateResult),
      count:       jest.fn(async () => invoiceCountResult),
      updateMany:  jest.fn(async () => invoiceUpdateManyResult),
      update:      jest.fn(async (args: any) => {
        invoiceUpdateResult = args.data;
        return { id: 'inv-1', ...args.data };
      }),
      create:      jest.fn(async (args: any) => ({ id: 'inv-new', ...args.data })),
      groupBy:     jest.fn(async () => []),
    },
    stickerScan: {
      findMany: jest.fn(async () => stickerScanFindManyResult),
      count:    jest.fn(async () => stickerScanCountResult),
      groupBy:  jest.fn(async () => []),
    },
    partner: {
      findMany: jest.fn(async () => []),
    },
    walletTransaction: {
      groupBy: jest.fn(async () => []),
      count:   jest.fn(async () => 0),
    },
    subscription: {
      findMany: jest.fn(async () => []),
    },
    user: {
      findMany: jest.fn(async () => []),
    },
    auditLog: {
      create: jest.fn(async () => ({})),
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

// ─── Auth middleware bypass ───────────────────────────────────────────────────

const ADMIN_USER = {
  id: 'u-admin-1',
  email: 'admin@test.com',
  role: 'SUPER_ADMIN',
  permissions: [],
  imp: false,
};

jest.mock('../../src/middleware/auth.middleware', () => {
  const original = jest.requireActual('../../src/middleware/auth.middleware');
  return {
    ...original,
    authenticate:      (req: any, _res: any, next: any) => { req.user = ADMIN_USER; next(); },
    authorize:         (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
    requirePermission: (_perm: any) => (_req: any, _res: any, next: any) => next(),
  };
});

jest.mock('../../src/middleware/audit.middleware', () => ({
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
  writeAudit: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/adminCashback.service', () => ({
  adminCashbackService: {
    generateMonthlyInvoices: jest.fn(async () => ({ created: 0, updated: 0 })),
  },
}));

jest.mock('../../src/utils/payoutThreshold', () => ({
  getPayoutThresholdBGN: jest.fn(async () => 20),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

// ─── App setup ────────────────────────────────────────────────────────────────

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const { default: financeRoute } = await import('../../src/routes/adminFinance.routes');
  app.use('/api/admin/finance', financeRoute);
});

beforeEach(() => {
  reportingPeriodFindUniqueResult = null;
  reportingPeriodFindManyResult   = [];
  invoiceFindUniqueResult         = null;
  invoiceFindManyResult           = [];
  invoiceCountResult              = 0;
  invoiceUpdateManyResult         = { count: 1 };
  stickerScanFindManyResult       = [];
  stickerScanCountResult          = 0;
  reportingPeriodUpdateCalls.length = 0;
  reportingPeriodDeleteCalls.length = 0;
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// §6.2 Invoice mutations
// ─────────────────────────────────────────────────────────────────────────────

describe('§6.2 — POST /invoices/generate', () => {
  it('Gap 3 — returns 400 for invalid month format', async () => {
    const res = await request(app)
      .post('/api/admin/finance/invoices/generate')
      .send({ month: '2026-5' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM/i);
  });

  it('Gap 3b — returns 400 when month is absent', async () => {
    const res = await request(app)
      .post('/api/admin/finance/invoices/generate')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM/i);
  });

  it('Gap 1 — returns 409 when reporting period is LOCKED', async () => {
    reportingPeriodFindUniqueResult = { month: '2026-05', status: 'LOCKED' };
    const res = await request(app)
      .post('/api/admin/finance/invoices/generate')
      .send({ month: '2026-05' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/locked or invoiced/i);
  });

  it('Gap 1b — returns 409 when reporting period is INVOICED', async () => {
    reportingPeriodFindUniqueResult = { month: '2026-05', status: 'INVOICED' };
    const res = await request(app)
      .post('/api/admin/finance/invoices/generate')
      .send({ month: '2026-05' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/locked or invoiced/i);
  });

  it('Gap 4 — returns success with created=0 when no approved scans', async () => {
    reportingPeriodFindUniqueResult = { month: '2026-05', status: 'OPEN' };
    stickerScanFindManyResult       = [];  // no scans
    const res = await request(app)
      .post('/api/admin/finance/invoices/generate')
      .send({ month: '2026-05' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.created).toBe(0);
    expect(res.body.data.updated).toBe(0);
  });
});

describe('§6.2 — POST /invoices/:id/pay', () => {
  it('Gap 6 — returns 404 when invoice not found', async () => {
    invoiceFindUniqueResult = null;
    const res = await request(app)
      .post('/api/admin/finance/invoices/inv-999/pay')
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('Gap 5 — returns 400 when invoice is already PAID', async () => {
    invoiceFindUniqueResult = { id: 'inv-1', status: 'PAID', month: '2026-05', notes: null };
    // updateMany returns count=0 because the status filter `{ not: 'PAID' }` matches nothing
    invoiceUpdateManyResult = { count: 0 };
    const { prisma } = await import('../../src/lib/prisma');
    (prisma.partnerCashbackPayment.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
    const res = await request(app)
      .post('/api/admin/finance/invoices/inv-1/pay')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already.*paid/i);
  });
});

describe('§6.2 — PATCH /invoices/:id/status', () => {
  it('Gap 9 — returns 400 for invalid status value', async () => {
    const res = await request(app)
      .patch('/api/admin/finance/invoices/inv-1/status')
      .send({ status: 'CANCELLED' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/OVERDUE.*PENDING/i);
  });

  it('Gap 9b — returns 400 when status is absent', async () => {
    const res = await request(app)
      .patch('/api/admin/finance/invoices/inv-1/status')
      .send({});
    expect(res.status).toBe(400);
  });

  it('Gap 8 — returns 400 when invoice is PAID', async () => {
    invoiceFindUniqueResult = { id: 'inv-1', status: 'PAID', month: '2026-05' };
    const res = await request(app)
      .patch('/api/admin/finance/invoices/inv-1/status')
      .send({ status: 'OVERDUE' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/paid/i);
  });

  it('Gap 7 — returns 409 when reporting period is LOCKED', async () => {
    invoiceFindUniqueResult         = { id: 'inv-1', status: 'PENDING', month: '2026-05' };
    reportingPeriodFindUniqueResult = { month: '2026-05', status: 'LOCKED' };
    const res = await request(app)
      .patch('/api/admin/finance/invoices/inv-1/status')
      .send({ status: 'OVERDUE' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/locked or invoiced/i);
  });
});

describe('§6.2 — PATCH /invoices/:id/notes', () => {
  it('Gap 10 — notes can be updated on a PAID invoice (no period lock check)', async () => {
    invoiceFindUniqueResult = { id: 'inv-1', status: 'PAID', month: '2026-05', notes: null };
    const { prisma } = await import('../../src/lib/prisma');
    (prisma.partnerCashbackPayment.update as jest.Mock).mockResolvedValueOnce({
      id: 'inv-1', status: 'PAID', notes: 'receipt on file',
    });
    const res = await request(app)
      .patch('/api/admin/finance/invoices/inv-1/notes')
      .send({ notes: 'receipt on file' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §6.3 Reporting period lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe('§6.3 — PATCH /reporting-periods/:month/status', () => {
  it('Gap 14 — returns 404 when period not found', async () => {
    reportingPeriodFindUniqueResult = null;
    const res = await request(app)
      .patch('/api/admin/finance/reporting-periods/2026-05/status')
      .send({ status: 'FOR_REVIEW' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('Gap 12 — returns 400 when skipping a step (OPEN → LOCKED)', async () => {
    reportingPeriodFindUniqueResult = { month: '2026-05', status: 'OPEN' };
    const res = await request(app)
      .patch('/api/admin/finance/reporting-periods/2026-05/status')
      .send({ status: 'LOCKED' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/FOR_REVIEW/i);
  });

  it('Gap 13 — returns 400 when going backward (INVOICED → OPEN)', async () => {
    reportingPeriodFindUniqueResult = { month: '2026-05', status: 'INVOICED' };
    const res = await request(app)
      .patch('/api/admin/finance/reporting-periods/2026-05/status')
      .send({ status: 'OPEN' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/none/i);
  });

  it('Gap 11 — returns 409 when advancing OPEN → FOR_REVIEW with no invoices', async () => {
    reportingPeriodFindUniqueResult = { month: '2026-05', status: 'OPEN' };
    invoiceCountResult = 0;
    const res = await request(app)
      .patch('/api/admin/finance/reporting-periods/2026-05/status')
      .send({ status: 'FOR_REVIEW' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/no partner invoices/i);
  });

  it('Gap 11b — allows OPEN → FOR_REVIEW when invoices exist', async () => {
    reportingPeriodFindUniqueResult = { month: '2026-05', status: 'OPEN' };
    invoiceCountResult = 3;
    const { prisma } = await import('../../src/lib/prisma');
    (prisma.reportingPeriod.update as jest.Mock).mockResolvedValueOnce({
      month: '2026-05', status: 'FOR_REVIEW', reviewedAt: new Date(), reviewedBy: ADMIN_USER.id,
      openedBy: null, lockedBy: null, invoicedBy: null,
    });
    const res = await request(app)
      .patch('/api/admin/finance/reporting-periods/2026-05/status')
      .send({ status: 'FOR_REVIEW' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('Gap 12b — returns 400 for invalid status value', async () => {
    reportingPeriodFindUniqueResult = { month: '2026-05', status: 'OPEN' };
    const res = await request(app)
      .patch('/api/admin/finance/reporting-periods/2026-05/status')
      .send({ status: 'ARCHIVED' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/OPEN.*FOR_REVIEW.*LOCKED.*INVOICED/i);
  });
});

describe('§6.3 — DELETE /reporting-periods/:month', () => {
  it('Gap 15 — returns 409 when period is LOCKED', async () => {
    reportingPeriodFindUniqueResult = { month: '2026-05', status: 'LOCKED' };
    const res = await request(app)
      .delete('/api/admin/finance/reporting-periods/2026-05');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cannot delete.*LOCKED/i);
  });

  it('Gap 16 — returns 409 when period is INVOICED', async () => {
    reportingPeriodFindUniqueResult = { month: '2026-05', status: 'INVOICED' };
    const res = await request(app)
      .delete('/api/admin/finance/reporting-periods/2026-05');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cannot delete.*INVOICED/i);
  });

  it('Gap 17 — returns 409 when invoices exist for the period', async () => {
    reportingPeriodFindUniqueResult = { month: '2026-05', status: 'OPEN' };
    invoiceCountResult = 2;
    const res = await request(app)
      .delete('/api/admin/finance/reporting-periods/2026-05');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/invoice/i);
  });

  it('Gap 18 — returns 409 when unbilled APPROVED scans exist', async () => {
    reportingPeriodFindUniqueResult = { month: '2026-05', status: 'OPEN' };
    invoiceCountResult    = 0;  // no invoices
    stickerScanCountResult = 5;  // but approved scans exist
    const res = await request(app)
      .delete('/api/admin/finance/reporting-periods/2026-05');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/scan/i);
  });

  it('Gap 18b — deletes successfully when period is OPEN with no invoices or scans', async () => {
    reportingPeriodFindUniqueResult = { month: '2025-01', status: 'OPEN' };
    invoiceCountResult    = 0;
    stickerScanCountResult = 0;
    const { prisma } = await import('../../src/lib/prisma');
    (prisma.reportingPeriod.delete as jest.Mock).mockResolvedValueOnce({ id: 'rp-1' });
    const res = await request(app)
      .delete('/api/admin/finance/reporting-periods/2025-01');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §6.4 Export
// ─────────────────────────────────────────────────────────────────────────────

describe('§6.4 — GET /export', () => {
  it('Gap 19 — returns 400 for unknown export type', async () => {
    const res = await request(app)
      .get('/api/admin/finance/export?type=unknown&format=csv');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/type must be/i);
  });

  it('Gap 20 — returns 400 for unknown format', async () => {
    const res = await request(app)
      .get('/api/admin/finance/export?type=invoices&format=pdf');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/format must be/i);
  });

  it('Gap 20b — invoices csv export succeeds with empty result set', async () => {
    invoiceFindManyResult = [];
    const res = await request(app)
      .get('/api/admin/finance/export?type=invoices&format=csv');
    // Empty CSV is valid; 200 with CSV content-type
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/i);
  });
});
