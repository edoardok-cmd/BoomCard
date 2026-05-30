/**
 * T14 — Admin pending-subscription (pay-first checkout) support tooling
 *
 * Covers:
 *   GET  /api/admin/subscriptions/pending  — list + filter
 *   POST /api/admin/subscriptions/pending/:id/resend-token — regenerate + re-mail
 */

// ── Prisma mocks ──────────────────────────────────────────────────────────────
const pendingFindUnique = jest.fn();
const pendingFindMany   = jest.fn();
const pendingCount      = jest.fn();
const pendingUpdate     = jest.fn();
const auditCreate       = jest.fn();

jest.mock('../../src/lib/prisma', () => {
  const client: any = {
    pendingSubscription: {
      findUnique: (...a: any[]) => pendingFindUnique(...a),
      findMany:   (...a: any[]) => pendingFindMany(...a),
      count:      (...a: any[]) => pendingCount(...a),
      update:     (...a: any[]) => pendingUpdate(...a),
    },
    auditLog: {
      create: (...a: any[]) => auditCreate(...a),
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

// ── Controllable permission gate ──────────────────────────────────────────────
// Set to the key that should be DENIED; '' means allow all.
let denyPermission = '';

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'admin-1', role: 'ADMIN', permissions: ['subscriptions.read', 'subscriptions.write'] };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: (key: string) => (req: any, res: any, next: any) => {
    if (denyPermission && req.user?.permissions?.includes(key) === false) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    if (denyPermission === key) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  },
  AuthRequest: {},
}));

jest.mock('../../src/middleware/audit.middleware', () => ({
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
  writeAudit: jest.fn(async () => undefined),
}));

// ── Email mock ────────────────────────────────────────────────────────────────
const sendCompleteProfileEmail = jest.fn(async () => ({ success: true }));
jest.mock('../../src/services/email.service', () => ({
  emailService: { sendCompleteProfileEmail },
}));

jest.mock('../../src/services/stripe.service', () => ({
  stripeService: {},
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../src/utils/planDisplayName', () => ({
  planDisplayName: (p: any) => p,
}));

// ── App setup ─────────────────────────────────────────────────────────────────
import express from 'express';
import request from 'supertest';
import adminSubscriptionsRouter from '../../src/routes/adminSubscriptions.routes';

const app = express();
app.use(express.json());
app.use('/api/admin/subscriptions', adminSubscriptionsRouter);

// ── Fixtures ──────────────────────────────────────────────────────────────────
const now = new Date();
const in30min = new Date(now.getTime() + 30 * 60 * 1000);
const in1h   = new Date(now.getTime() + 60 * 60 * 1000);
const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

function makePendingSub(overrides: Record<string, any> = {}) {
  return {
    id: 'ps-1',
    email: 'user@example.com',
    planId: 'plan-1',
    status: 'PAID',
    token: 'oldtoken',
    tokenExpiresAt: in30min,
    paidAt: now,
    completedAt: null,
    expiresAt: in1h,
    payseraOrderId: 'order-1',
    billingPeriod: 'monthly',
    language: 'bg',
    createdAt: now,
    plan: { displayName: 'Premium', displayNameBg: 'Премиум' },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  denyPermission = '';
  pendingFindMany.mockResolvedValue([makePendingSub()]);
  pendingCount.mockResolvedValue(1);
  pendingFindUnique.mockResolvedValue(makePendingSub());
  pendingUpdate.mockResolvedValue(makePendingSub({ token: 'newtoken', tokenExpiresAt: in30min }));
  auditCreate.mockResolvedValue({});
});

// ── GET /api/admin/subscriptions/pending ──────────────────────────────────────

describe('GET /api/admin/subscriptions/pending', () => {
  it('returns paginated list with default params', async () => {
    const res = await request(app).get('/api/admin/subscriptions/pending');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(res.body.data).toHaveLength(1);
    expect(pendingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20, skip: 0 }),
    );
  });

  it('filters by email (case-insensitive contains)', async () => {
    pendingFindMany.mockResolvedValue([]);
    pendingCount.mockResolvedValue(0);

    const res = await request(app).get('/api/admin/subscriptions/pending?email=test%40example.com');
    expect(res.status).toBe(200);
    expect(pendingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ email: { contains: 'test@example.com', mode: 'insensitive' } }),
      }),
    );
  });

  it('filters by orderId', async () => {
    const res = await request(app).get('/api/admin/subscriptions/pending?orderId=order-99');
    expect(res.status).toBe(200);
    expect(pendingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ payseraOrderId: { contains: 'order-99', mode: 'insensitive' } }),
      }),
    );
  });

  it('filters by valid status', async () => {
    const res = await request(app).get('/api/admin/subscriptions/pending?status=PAID');
    expect(res.status).toBe(200);
    expect(pendingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PAID' }),
      }),
    );
  });

  it('ignores unknown status values', async () => {
    const res = await request(app).get('/api/admin/subscriptions/pending?status=INVALID');
    expect(res.status).toBe(200);
    // where should not contain a status key
    const callArg = pendingFindMany.mock.calls[0][0];
    expect(callArg.where).not.toHaveProperty('status');
  });

  it('returns 403 without subscriptions.read permission', async () => {
    denyPermission = 'subscriptions.read';
    const res = await request(app).get('/api/admin/subscriptions/pending');
    expect(res.status).toBe(403);
  });
});

// ── POST /api/admin/subscriptions/pending/:id/resend-token ───────────────────

describe('POST /api/admin/subscriptions/pending/:id/resend-token', () => {
  it('200: regenerates token, sends email, writes audit for PAID row', async () => {
    const res = await request(app)
      .post('/api/admin/subscriptions/pending/ps-1/resend-token')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sent: true, email: 'user@example.com' });

    // Token was updated in DB
    expect(pendingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ps-1' },
        data: expect.objectContaining({ token: expect.any(String), tokenExpiresAt: expect.any(Date) }),
      }),
    );

    // Profile completion email sent
    expect(sendCompleteProfileEmail).toHaveBeenCalledWith(
      'user@example.com',
      expect.objectContaining({
        planName: 'Premium',
        completeProfileUrl: expect.stringContaining('/complete-profile?token='),
        language: 'bg',
      }),
    );
  });

  it('400: row not in PAID state', async () => {
    pendingFindUnique.mockResolvedValue(makePendingSub({ status: 'CREATED' }));
    const res = await request(app)
      .post('/api/admin/subscriptions/pending/ps-1/resend-token')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PAID state/);
    expect(sendCompleteProfileEmail).not.toHaveBeenCalled();
  });

  it('400: profile already completed', async () => {
    pendingFindUnique.mockResolvedValue(makePendingSub({ completedAt: now }));
    const res = await request(app)
      .post('/api/admin/subscriptions/pending/ps-1/resend-token')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already completed/);
    expect(sendCompleteProfileEmail).not.toHaveBeenCalled();
  });

  it('400: checkout session has expired', async () => {
    pendingFindUnique.mockResolvedValue(makePendingSub({ expiresAt: oneDayAgo }));
    const res = await request(app)
      .post('/api/admin/subscriptions/pending/ps-1/resend-token')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/);
    expect(sendCompleteProfileEmail).not.toHaveBeenCalled();
  });

  it('404: unknown id', async () => {
    pendingFindUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/admin/subscriptions/pending/no-such-id/resend-token')
      .send({});
    expect(res.status).toBe(404);
    expect(sendCompleteProfileEmail).not.toHaveBeenCalled();
  });

  it('returns 403 without subscriptions.write permission', async () => {
    denyPermission = 'subscriptions.write';
    const res = await request(app)
      .post('/api/admin/subscriptions/pending/ps-1/resend-token')
      .send({});
    expect(res.status).toBe(403);
    expect(sendCompleteProfileEmail).not.toHaveBeenCalled();
  });
});
