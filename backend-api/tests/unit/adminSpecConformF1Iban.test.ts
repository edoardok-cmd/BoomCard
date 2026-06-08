/**
 * BC-ADMIN-SPEC-CONFORM-FIX — F1 regression coverage.
 *
 * The H1 subscriber profile-edit handler audits every mutation via writeAudit.
 * F1: the OLD cleartext IBAN must NEVER be written to the audit log `before`
 * payload (writeAudit persists before/after verbatim with no redaction). This
 * test mounts the router in isolation with a spied writeAudit and asserts that
 * after an IBAN change the captured `before` contains no raw IBAN value — only
 * an `ibanChanged: true` flag — while the new IBAN is still persisted to the DB.
 */

import express from 'express';
import request from 'supertest';

// ── prisma mock ──────────────────────────────────────────────────────────────
const userFindUnique = jest.fn();
const userUpdate = jest.fn();
const walletUpsert = jest.fn();
const txRun = jest.fn(async (cb: any) =>
  cb({
    user: { update: userUpdate, findUniqueOrThrow: userUpdate },
    wallet: { upsert: walletUpsert },
  }),
);
const mockPrisma: any = {
  user: { findUnique: userFindUnique, update: userUpdate, findFirst: jest.fn(async () => null) },
  wallet: { upsert: walletUpsert },
  $transaction: txRun,
};
jest.mock('../../src/lib/prisma', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma }));

// ── auth middleware: pass-through with a fixed admin actor ───────────────────
jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'admin-1', role: 'ADMIN', permissions: ['subscribers.write'] };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  requireActiveAdmin: () => (_req: any, _res: any, next: any) => next(),
}));

// ── audit middleware: capture writeAudit args ────────────────────────────────
const writeAudit = jest.fn((_arg: any) => Promise.resolve());
jest.mock('../../src/middleware/audit.middleware', () => ({
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
  writeAudit: (arg: any) => writeAudit(arg),
}));

// detach runs its task synchronously enough for the spy to capture the call
jest.mock('../../src/utils/detach', () => ({
  detach: (p: any) => { Promise.resolve(p).catch(() => {}); },
}));

import adminSubscribersRouter from '../../src/routes/adminSubscribers.routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/subscribers', adminSubscribersRouter);
  return app;
}

describe('F1 — IBAN never written to audit log in cleartext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userFindUnique.mockResolvedValue({
      id: 'u-1',
      role: 'USER',
      deletedAt: null,
      firstName: 'Ivan',
      lastName: 'Petrov',
      email: 'ivan@example.com',
      phone: null,
      address: null,
      iban: 'BG18RZBB91550123456789', // OLD cleartext IBAN that must NOT leak
      riskScore: 10,
      riskBucket: 'LOW_0_20',
      wallet: { id: 'w-1' },
    });
    userUpdate.mockResolvedValue({
      id: 'u-1', firstName: 'Ivan', lastName: 'Petrov', email: 'ivan@example.com',
      phone: null, address: null, iban: 'BG80BNBG96611020345678',
      riskScore: 10, riskBucket: 'LOW_0_20', emailVerified: true,
    });
    walletUpsert.mockResolvedValue({});
  });

  it('records only ibanChanged in `before`/`after`, never the raw IBAN value', async () => {
    const app = buildApp();
    const newIban = 'BG80BNBG96611020345678';

    const res = await request(app)
      .patch('/api/admin/subscribers/u-1/profile')
      .send({ iban: newIban });

    expect(res.status).toBe(200);
    expect(writeAudit).toHaveBeenCalledTimes(1);

    const auditArg: any = writeAudit.mock.calls[0][0];
    const serialized = JSON.stringify(auditArg);

    // Neither the old nor the new IBAN may appear anywhere in the audit payload.
    expect(serialized).not.toContain('BG18RZBB91550123456789'); // old
    expect(serialized).not.toContain(newIban);                  // new
    expect(serialized).not.toMatch(/BG\d{2}[A-Z0-9]+/);         // any IBAN-shaped token

    // The change is still recorded as a boolean flag (not vacuous).
    expect(auditArg.before).not.toHaveProperty('iban');
    expect(auditArg.before.ibanChanged).toBe(true);
    expect(auditArg.after.ibanChanged).toBe(true);

    // And the new IBAN is still actually persisted (DB write + wallet mirror).
    expect(userUpdate).toHaveBeenCalled();
    expect(walletUpsert).toHaveBeenCalled();
    const updateData = userUpdate.mock.calls[0][0].data;
    expect(updateData.iban).toBe(newIban);
  });
});
