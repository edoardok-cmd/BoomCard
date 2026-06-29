/**
 * Unit tests for /api/loyalty routes — BC-DEMOCK-003
 *
 * Pins the four correctness-critical paths in loyalty.routes.ts:
 *   1. POST /redeem: insufficient points → 400
 *   2. POST /redeem: last-unit stock race (updateMany count=0) → 400
 *   3. POST /redeem: non-existent reward → 404
 *   4. POST /redeem: inactive/expired reward → 400
 *
 * Plus happy-path and auth-gate coverage:
 *   5. GET /accounts/me: auto-creates BRONZE account and returns cashbackRate
 *   6. GET /transactions: returns paginated empty response when no account
 *   7. Non-USER role → 403 from router-level authorize('USER')
 *   8. Unauthenticated → 401
 */

// ── Mocks (must be before any imports) ────────────────────────────────────────

const prismaTransactionMock = jest.fn();
const loyaltyAccountUpsertMock = jest.fn();
const loyaltyAccountFindUniqueMock = jest.fn();
const loyaltyTransactionFindManyMock = jest.fn();
const loyaltyTransactionCountMock = jest.fn();
const rewardFindUniqueMock = jest.fn();

jest.mock('../../src/lib/prisma', () => {
  const client = {
    loyaltyAccount: {
      upsert: loyaltyAccountUpsertMock,
      findUnique: loyaltyAccountFindUniqueMock,
    },
    loyaltyTransaction: {
      findMany: loyaltyTransactionFindManyMock,
      count: loyaltyTransactionCountMock,
    },
    reward: {
      findMany: jest.fn(async () => []),
    },
    rewardRedemption: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    userBadge: {
      findMany: jest.fn(async () => []),
    },
    $transaction: prismaTransactionMock,
  };
  return { __esModule: true, default: client, prisma: client };
});

// Auth middleware: authenticate injects req.user; authorize checks role.
// requireActiveSubscription is stubbed to pass for USER, block for non-USER.
jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (!token) {
      return _res.status(401).json({ error: 'No token provided' });
    }
    // Decode fake "token" — format: "role:userId"
    const [role, id] = token.split(':');
    req.user = { id: id || 'user-1', role: role || 'USER' };
    next();
  },
  authorize: (...roles: string[]) => (req: any, res: any, next: any) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    next();
  },
  requireActiveSubscription: (req: any, res: any, next: any) => {
    // Pass for USER; block others
    if (req.user?.role !== 'USER') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    next();
  },
}));

jest.mock('../../src/middleware/security.middleware', () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import express from 'express';
import request from 'supertest';
import loyaltyRouter from '../../src/routes/loyalty.routes';

// ── App setup ─────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use('/api/loyalty', loyaltyRouter);

// Also wire the global error middleware so AppError responses look like prod
import { errorHandler } from '../../src/middleware/error.middleware';
app.use(errorHandler);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_TOKEN    = 'USER:user-1';
const PARTNER_TOKEN = 'PARTNER:partner-1';

const ACCOUNT = {
  id: 'acct-1',
  userId: 'user-1',
  tier: 'BRONZE',
  points: 100,
  lifetimePoints: 500,
  tierProgress: 0.1,
  cashbackBalance: 5,
  nextTierPoints: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const REWARD_ACTIVE = {
  id: 'reward-1',
  title: 'Free Coffee',
  titleBg: 'Безплатно кафе',
  isActive: true,
  pointsCost: 50,
  stockQuantity: 5,
  validFrom: new Date('2020-01-01T00:00:00Z'),
  validUntil: null,
};

const REDEMPTION = {
  id: 'redemption-1',
  accountId: 'acct-1',
  rewardId: 'reward-1',
  status: 'PENDING',
  pointsSpent: 50,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * Wire prismaTransactionMock to simulate a successful interactive transaction.
 * The callback receives a tx proxy with all loyalty model operations.
 */
function wireSuccessfulRedemption(
  rewardOverride?: Partial<typeof REWARD_ACTIVE>,
  accountOverride?: Partial<typeof ACCOUNT>,
  pointsUpdateCount = 1,
  stockUpdateCount = 1,
) {
  const reward  = { ...REWARD_ACTIVE, ...(rewardOverride ?? {}) };
  const account = { ...ACCOUNT,       ...(accountOverride ?? {}) };

  prismaTransactionMock.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
    const tx = {
      reward: {
        findUnique: jest.fn(async () => reward),
        update:     jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: stockUpdateCount })),
      },
      loyaltyAccount: {
        upsert:     jest.fn(async () => account),
        updateMany: jest.fn(async () => ({ count: pointsUpdateCount })),
      },
      rewardRedemption: {
        create: jest.fn(async () => REDEMPTION),
      },
      loyaltyTransaction: {
        create: jest.fn(async () => ({})),
      },
    };
    return callback(tx);
  });
}

// ── Reset ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  loyaltyAccountUpsertMock.mockReset();
  loyaltyAccountFindUniqueMock.mockReset();
  loyaltyTransactionFindManyMock.mockReset();
  loyaltyTransactionCountMock.mockReset();
  prismaTransactionMock.mockReset();
});

// ── Tests: auth gates ─────────────────────────────────────────────────────────

describe('Auth gates', () => {
  it('returns 401 for unauthenticated requests', async () => {
    const res = await request(app).get('/api/loyalty/accounts/me');
    expect(res.status).toBe(401);
  });

  it('returns 403 for PARTNER role on GET /accounts/me', async () => {
    const res = await request(app)
      .get('/api/loyalty/accounts/me')
      .set('Authorization', `Bearer ${PARTNER_TOKEN}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 for PARTNER role on POST /rewards/:id/redeem', async () => {
    const res = await request(app)
      .post('/api/loyalty/rewards/any-id/redeem')
      .set('Authorization', `Bearer ${PARTNER_TOKEN}`);
    expect(res.status).toBe(403);
  });
});

// ── Tests: GET /accounts/me ───────────────────────────────────────────────────

describe('GET /api/loyalty/accounts/me', () => {
  it('returns 200 with loyalty account and cashbackRate', async () => {
    loyaltyAccountUpsertMock.mockResolvedValueOnce(ACCOUNT);

    const res = await request(app)
      .get('/api/loyalty/accounts/me')
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tier).toBe('BRONZE');
    expect(res.body.data.cashbackRate).toBe(0.02); // BRONZE tier
  });

  it('auto-creates a BRONZE account with 0 points on first visit', async () => {
    const newAccount = { ...ACCOUNT, points: 0, lifetimePoints: 0 };
    loyaltyAccountUpsertMock.mockResolvedValueOnce(newAccount);

    const res = await request(app)
      .get('/api/loyalty/accounts/me')
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.points).toBe(0);
    // Verify upsert was called with create defaults
    expect(loyaltyAccountUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ tier: 'BRONZE', points: 0, lifetimePoints: 0 }),
      }),
    );
  });
});

// ── Tests: GET /transactions ──────────────────────────────────────────────────

describe('GET /api/loyalty/transactions', () => {
  it('returns empty list gracefully when user has no loyalty account', async () => {
    loyaltyAccountFindUniqueMock.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/loyalty/transactions')
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: [], total: 0, page: 1, limit: 20 });
  });

  it('returns paginated transactions for an existing account', async () => {
    loyaltyAccountFindUniqueMock.mockResolvedValueOnce({ id: 'acct-1' });
    const txRow = { id: 'tx-1', type: 'EARNED', points: 100, createdAt: new Date() };
    prismaTransactionMock.mockResolvedValueOnce([[txRow], 1]);

    const res = await request(app)
      .get('/api/loyalty/transactions?page=1&limit=10')
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data).toHaveLength(1);
  });
});

// ── Tests: POST /rewards/:rewardId/redeem ─────────────────────────────────────

describe('POST /api/loyalty/rewards/:rewardId/redeem', () => {

  it('returns 201 with redemption record on successful redemption', async () => {
    wireSuccessfulRedemption();

    const res = await request(app)
      .post('/api/loyalty/rewards/reward-1/redeem')
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PENDING');
  });

  it('returns 404 when reward does not exist', async () => {
    prismaTransactionMock.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
      const tx = {
        reward: { findUnique: jest.fn(async () => null) },
        loyaltyAccount: {},
        rewardRedemption: {},
        loyaltyTransaction: {},
      };
      return callback(tx);
    });

    const res = await request(app)
      .post('/api/loyalty/rewards/nonexistent/redeem')
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 400 when reward is inactive', async () => {
    prismaTransactionMock.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
      const tx = {
        reward: { findUnique: jest.fn(async () => ({ ...REWARD_ACTIVE, isActive: false })) },
        loyaltyAccount: {},
        rewardRedemption: {},
        loyaltyTransaction: {},
      };
      return callback(tx);
    });

    const res = await request(app)
      .post('/api/loyalty/rewards/reward-1/redeem')
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not available/i);
  });

  it('returns 400 when reward validUntil is in the past', async () => {
    prismaTransactionMock.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
      const expiredReward = { ...REWARD_ACTIVE, validUntil: new Date('2000-01-01T00:00:00Z') };
      const tx = {
        reward: { findUnique: jest.fn(async () => expiredReward) },
        loyaltyAccount: {},
        rewardRedemption: {},
        loyaltyTransaction: {},
      };
      return callback(tx);
    });

    const res = await request(app)
      .post('/api/loyalty/rewards/reward-1/redeem')
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not available/i);
  });

  it('returns 400 when reward validFrom is in the future', async () => {
    prismaTransactionMock.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
      const futureReward = { ...REWARD_ACTIVE, validFrom: new Date('2099-01-01T00:00:00Z') };
      const tx = {
        reward: { findUnique: jest.fn(async () => futureReward) },
        loyaltyAccount: {},
        rewardRedemption: {},
        loyaltyTransaction: {},
      };
      return callback(tx);
    });

    const res = await request(app)
      .post('/api/loyalty/rewards/reward-1/redeem')
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not available/i);
  });

  it('returns 400 when user has insufficient points (atomic guard fires: updateMany count=0)', async () => {
    // points guard: updateMany returns count=0 (user had 0 < pointsCost)
    wireSuccessfulRedemption(undefined, undefined, 0 /* pointsUpdateCount=0 */);

    const res = await request(app)
      .post('/api/loyalty/rewards/reward-1/redeem')
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/insufficient points/i);
  });

  it('returns 400 when last stock unit is taken by a concurrent request (stock guard fires: updateMany count=0)', async () => {
    // stock guard: points updateMany succeeds (count=1) but stock updateMany returns count=0
    wireSuccessfulRedemption(undefined, undefined, 1 /* pointsUpdateCount=1 */, 0 /* stockUpdateCount=0 */);

    const res = await request(app)
      .post('/api/loyalty/rewards/reward-1/redeem')
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/out of stock/i);
  });

  it('succeeds for unlimited-stock reward (stockQuantity null) without stock guard', async () => {
    wireSuccessfulRedemption({ stockQuantity: null });

    const res = await request(app)
      .post('/api/loyalty/rewards/reward-1/redeem')
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});
