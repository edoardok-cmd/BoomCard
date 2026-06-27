/**
 * Unit tests for POST /api/admin/transactions/adjust
 *
 * BC-ADMIN-SPEC-REAUDIT7-TXN-ADJUST-SERIAL-1
 *
 * Pins:
 *   - Normal single negative adjustment returns 201 with ADJUSTMENT transaction shape.
 *   - A P2034 serialization failure from prisma.$transaction maps to 409
 *     with reason CONCURRENT_TRANSITION (not a 500).
 *   - The negative-balance guard still fires: a would-be overdraft returns 400.
 *   - Positive adjustment path returns 201.
 *   - Missing/invalid inputs return 400.
 *   - Unknown userId returns 404.
 */

// ── Mocks (must be before any imports) ───────────────────────────────────────

const walletFindUniqueMock = jest.fn();
const walletUpdateMock     = jest.fn();
const txCreateMock         = jest.fn();
const prismaTransactionMock = jest.fn();

jest.mock('../../src/lib/prisma', () => {
  const client = {
    wallet: {
      findUnique: walletFindUniqueMock,
      update:     walletUpdateMock,
    },
    walletTransaction: {
      create: txCreateMock,
    },
    $transaction: prismaTransactionMock,
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'admin-1', role: 'ADMIN', permissions: ['transactions.write'] };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/middleware/audit.middleware', () => ({
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/utils/currencyDisplay', () => ({
  isCurrencyTransitionWindowOpen: jest.fn(async () => false),
  toDualCurrency: jest.fn((amount: number, _windowOpen: boolean) => ({
    windowOpen: false,
    bgn: null,
    eur: +(amount / 1.95583).toFixed(2),
  })),
}));

jest.mock('../../src/services/adminCashback.service', () => ({
  deriveCashbackEntryStatus: jest.fn(),
}));

jest.mock('../../src/utils/pagination', () => ({
  parsePagination: jest.fn(() => ({ skip: 0, take: 20, page: 1, limit: 20 })),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import express from 'express';
import request from 'supertest';
import adminTransactionsRouter from '../../src/routes/adminTransactions.routes';

// ── App setup ─────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use('/api/admin/transactions', adminTransactionsRouter);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WALLET = {
  id: 'wallet-1',
  balance: 200,
  availableBalance: 200,
  currency: 'BGN',
};

const TX_ROW = {
  id: 'tx-1',
  type: 'ADJUSTMENT',
  amount: 50,
  balanceBefore: 200,
  balanceAfter: 150,
  currency: 'BGN',
  status: 'COMPLETED',
  description: 'test reason',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

/**
 * Wire prismaTransactionMock to simulate the real $transaction callback execution:
 * the callback receives a tx proxy that delegates to our mocked wallet / walletTransaction.
 */
function wireSuccessfulTransaction(walletOverride?: Partial<typeof WALLET>, txRowOverride?: Partial<typeof TX_ROW>) {
  const wallet = { ...WALLET, ...(walletOverride ?? {}) };
  const txRow  = { ...TX_ROW,  ...(txRowOverride ?? {}) };

  prismaTransactionMock.mockImplementation(async (callback: (tx: any) => Promise<any>, _opts?: any) => {
    const tx = {
      wallet: {
        findUnique: jest.fn(async () => wallet),
        update:     jest.fn(async () => ({})),
      },
      walletTransaction: {
        create: jest.fn(async () => txRow),
      },
    };
    return callback(tx);
  });
}

// ── Reset ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  walletFindUniqueMock.mockReset();
  walletUpdateMock.mockReset();
  txCreateMock.mockReset();
  prismaTransactionMock.mockReset();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/admin/transactions/adjust', () => {

  describe('normal single adjustment', () => {
    it('returns 201 with ADJUSTMENT transaction shape for a valid negative adjustment', async () => {
      // Existence pre-check
      walletFindUniqueMock.mockResolvedValueOnce({ id: 'wallet-1' });
      wireSuccessfulTransaction(
        { balance: 200, availableBalance: 200 },
        { amount: 50, balanceBefore: 200, balanceAfter: 150, type: 'ADJUSTMENT' },
      );

      const res = await request(app)
        .post('/api/admin/transactions/adjust')
        .send({ userId: 'user-1', amount: -50, reason: 'manual deduction' });

      expect(res.status).toBe(201);
      expect(res.body.type).toBe('ADJUSTMENT');
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.id).toBe('tx-1');
      // display block must always be present
      expect(res.body.display).toBeDefined();
      expect(res.body.display.amount).toBeDefined();
      expect(prismaTransactionMock).toHaveBeenCalledTimes(1);
    });

    it('returns 201 for a positive (credit) adjustment', async () => {
      walletFindUniqueMock.mockResolvedValueOnce({ id: 'wallet-1' });
      wireSuccessfulTransaction(
        { balance: 100, availableBalance: 100 },
        { amount: 30, balanceBefore: 100, balanceAfter: 130, type: 'ADJUSTMENT' },
      );

      const res = await request(app)
        .post('/api/admin/transactions/adjust')
        .send({ userId: 'user-2', amount: 30, reason: 'top-up credit' });

      expect(res.status).toBe(201);
      expect(res.body.type).toBe('ADJUSTMENT');
    });

    it('passes isolationLevel Serializable as the second argument to $transaction', async () => {
      walletFindUniqueMock.mockResolvedValueOnce({ id: 'wallet-1' });
      wireSuccessfulTransaction();

      await request(app)
        .post('/api/admin/transactions/adjust')
        .send({ userId: 'user-1', amount: -10, reason: 'test isolation' });

      expect(prismaTransactionMock).toHaveBeenCalledTimes(1);
      const [, opts] = prismaTransactionMock.mock.calls[0];
      expect(opts).toEqual({ isolationLevel: 'Serializable' });
    });
  });

  describe('P2034 serialization failure → 409 CONCURRENT_TRANSITION', () => {
    it('maps a P2034 error from $transaction to HTTP 409 with reason CONCURRENT_TRANSITION', async () => {
      walletFindUniqueMock.mockResolvedValueOnce({ id: 'wallet-1' });

      const p2034Err: any = new Error('Transaction failed due to a write conflict or a deadlock.');
      p2034Err.code = 'P2034';
      prismaTransactionMock.mockRejectedValueOnce(p2034Err);

      const res = await request(app)
        .post('/api/admin/transactions/adjust')
        .send({ userId: 'user-1', amount: -50, reason: 'concurrent test' });

      expect(res.status).toBe(409);
      expect(res.body.reason).toBe('CONCURRENT_TRANSITION');
      expect(res.body.message).toMatch(/concurrent modification/i);
    });

    it('does NOT call next(error) for a P2034 (does not propagate to 500 handler)', async () => {
      walletFindUniqueMock.mockResolvedValueOnce({ id: 'wallet-1' });

      const p2034Err: any = new Error('Serialization failure');
      p2034Err.code = 'P2034';
      prismaTransactionMock.mockRejectedValueOnce(p2034Err);

      // A propagated error would hit the default Express error handler which
      // sends a 500. So asserting status=409 also confirms no re-throw.
      const res = await request(app)
        .post('/api/admin/transactions/adjust')
        .send({ userId: 'user-1', amount: -50, reason: 'concurrent test 2' });

      expect(res.status).toBe(409);
      expect(res.status).not.toBe(500);
    });
  });

  describe('negative-balance guard', () => {
    it('returns 400 when the adjustment would overdraw the wallet', async () => {
      walletFindUniqueMock.mockResolvedValueOnce({ id: 'wallet-1' });

      // Wire the transaction callback to execute with a low-balance wallet
      prismaTransactionMock.mockImplementation(async (callback: (tx: any) => Promise<any>, _opts?: any) => {
        const tx = {
          wallet: {
            findUnique: jest.fn(async () => ({
              ...WALLET,
              balance: 30,
              availableBalance: 30,
            })),
            update: jest.fn(),
          },
          walletTransaction: {
            create: jest.fn(),
          },
        };
        // The callback throws when the guard fires
        return callback(tx);
      });

      const res = await request(app)
        .post('/api/admin/transactions/adjust')
        .send({ userId: 'user-1', amount: -100, reason: 'overdraft attempt' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/negative balance/i);
    });
  });

  describe('input validation', () => {
    it('returns 400 when userId is missing', async () => {
      const res = await request(app)
        .post('/api/admin/transactions/adjust')
        .send({ amount: -10, reason: 'test' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when amount is zero', async () => {
      const res = await request(app)
        .post('/api/admin/transactions/adjust')
        .send({ userId: 'user-1', amount: 0, reason: 'test' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when amount is not a number', async () => {
      const res = await request(app)
        .post('/api/admin/transactions/adjust')
        .send({ userId: 'user-1', amount: 'not-a-number', reason: 'test' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when reason is blank', async () => {
      const res = await request(app)
        .post('/api/admin/transactions/adjust')
        .send({ userId: 'user-1', amount: -10, reason: '   ' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when amount is Infinity', async () => {
      const res = await request(app)
        .post('/api/admin/transactions/adjust')
        .send({ userId: 'user-1', amount: Infinity, reason: 'inf test' });
      expect(res.status).toBe(400);
    });
  });

  describe('wallet existence pre-check', () => {
    it('returns 404 when no wallet exists for the given userId', async () => {
      walletFindUniqueMock.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/admin/transactions/adjust')
        .send({ userId: 'no-such-user', amount: -10, reason: 'test' });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/wallet not found/i);
    });
  });
});
