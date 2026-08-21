/**
 * BC-QA-031-FOLLOWUP-1 task-r2 F14 — `GET /api/cards/:id/statistics` must
 * convert at the route boundary.
 *
 * THE DEFECT
 * ----------
 * `cardService.getCardStatistics` computed `totalCashbackEarned` as a raw BGN
 * magnitude and `cards.routes.ts` did `res.json(stats)` — importing nothing
 * from `utils/currency`. The mobile app renders that field through
 * `formatEurAmount` (`MyCardScreen`'s card banner at :475, `DashboardScreen`'s
 * two hero tiles at :268/:479), which emits `€${amount}`.
 *
 * Measured live on two seeded cashback rows (100 BGN + 50 USD):
 *
 *   GET /api/cards/:id/statistics -> {"totalCashbackEarned":100}
 *   GET /api/wallet/statistics    -> {"totalCashback":51.13,"currency":"EUR"}
 *
 * €100.00 shown where the truth is €51.13 — a 95.6% overstatement on a
 * user-facing banner, and the two endpoints disagreeing about the same rows.
 *
 * The service now returns per-currency subtotals in the storage unit and the
 * ROUTE folds and converts them, which is the pattern `src/utils/currency.ts`
 * documents: services operate in the storage unit, the boundary converts.
 */

const cardFindUniqueMock = jest.fn();
const getCardStatisticsMock = jest.fn();

jest.mock('../../src/lib/prisma', () => {
  const client = {
    card: { findUnique: cardFindUniqueMock, findMany: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn() },
    receipt: { count: jest.fn() },
    stickerScan: { count: jest.fn() },
    walletTransaction: { groupBy: jest.fn() },
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/services/card.service', () => ({
  cardService: { getCardStatistics: getCardStatisticsMock },
}));

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'u-1', role: 'USER' };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/middleware/audit.middleware', () => ({
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
  writeAudit: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import cardsRouter from '../../src/routes/cards.routes';
import { errorHandler } from '../../src/middleware/error.middleware';
import { bgnToEur } from '../../src/utils/currency';

const app = express();
app.use(express.json());
app.use('/api/cards', cardsRouter);
app.use(errorHandler);

/** The service's contract: storage-unit per-currency subtotals. */
function stats(cashbackByCurrency: Array<{ currency: string | null; amount: number; count: number }>) {
  return {
    receiptsScanned: 3,
    stickersScanned: 4,
    cashbackByCurrency,
    cardType: 'BASIC',
    memberSince: new Date('2026-01-01T00:00:00.000Z'),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  cardFindUniqueMock.mockResolvedValue({ userId: 'u-1' });
});

describe('GET /api/cards/:id/statistics — cashback is converted at the boundary', () => {
  it('REGRESSION: 100 BGN of cashback is reported as 51.13 EUR, not 100', async () => {
    getCardStatisticsMock.mockResolvedValue(stats([{ currency: 'BGN', amount: 100, count: 1 }]));

    const res = await request(app).get('/api/cards/c-1/statistics').expect(200);

    expect(res.body.totalCashbackEarned).toBeCloseTo(bgnToEur(100), 2);
    expect(res.body.totalCashbackEarned).toBeCloseTo(51.13, 2);
    // The raw storage magnitude the mobile app used to render as €100.00.
    expect(res.body.totalCashbackEarned).not.toBeCloseTo(100, 2);
    // And the response now says which unit it is in.
    expect(res.body.currency).toBe('EUR');
  });

  it('REGRESSION: an out-of-domain subtotal is excluded and reported, not summed at face value', async () => {
    // The exact live fixture: 100 BGN convertible + 50 USD with no rate.
    getCardStatisticsMock.mockResolvedValue(
      stats([
        { currency: 'BGN', amount: 100, count: 1 },
        { currency: 'USD', amount: 50, count: 1 },
      ]),
    );

    const res = await request(app).get('/api/cards/c-1/statistics').expect(200);

    expect(res.body.totalCashbackEarned).toBeCloseTo(51.13, 2);
    // 150 was the pre-r4 flat cross-currency sum; 100 was the post-r4 raw BGN.
    expect(res.body.totalCashbackEarned).not.toBeCloseTo(150, 2);
    expect(res.body.totalCashbackEarned).not.toBeCloseTo(100, 2);
    expect(res.body.excludedCount).toBe(1);
    expect(res.body.excludedCurrencies).toEqual(['USD']);
  });

  it('agrees with GET /api/wallet/statistics on the same rows', async () => {
    // Both surfaces fold the same per-currency subtotals through the same
    // helper, so the number a user sees on the card banner and the number on
    // the wallet screen cannot diverge — which is what they did live.
    const subtotals = [
      { currency: 'BGN', amount: 100, count: 1 },
      { currency: 'USD', amount: 50, count: 1 },
    ];
    getCardStatisticsMock.mockResolvedValue(stats(subtotals));

    const res = await request(app).get('/api/cards/c-1/statistics').expect(200);

    const { foldMixedCurrencyToEur } = await import('../../src/utils/currency');
    const walletSideFigure = foldMixedCurrencyToEur(subtotals);

    expect(res.body.totalCashbackEarned).toBeCloseTo(walletSideFigure.total, 2);
    expect(res.body.excludedCount).toBe(walletSideFigure.excludedCount);
  });

  it('leaves the non-money fields alone', async () => {
    getCardStatisticsMock.mockResolvedValue(stats([]));

    const res = await request(app).get('/api/cards/c-1/statistics').expect(200);

    expect(res.body.receiptsScanned).toBe(3);
    expect(res.body.stickersScanned).toBe(4);
    expect(res.body.cardType).toBe('BASIC');
    // The storage-unit subtotals must not reach the wire — the wire carries a
    // converted total, and nothing that invites a second conversion.
    expect(res.body).not.toHaveProperty('cashbackByCurrency');
  });

  it('reports zero cashback as 0 EUR with no exclusions', async () => {
    getCardStatisticsMock.mockResolvedValue(stats([]));

    const res = await request(app).get('/api/cards/c-1/statistics').expect(200);

    expect(res.body.totalCashbackEarned).toBe(0);
    expect(res.body.excludedCount).toBe(0);
    expect(res.body.excludedCurrencies).toEqual([]);
  });
});
