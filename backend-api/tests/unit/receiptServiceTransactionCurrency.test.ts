/**
 * BC-QA-031 round 4 — receipt.service.formatReceipt nested Transaction currency.
 *
 * A receipt response embeds the linked Transaction row. `Receipt.totalAmount` and
 * `Receipt.cashbackAmount` are BGN-denominated (the Receipt model has no currency
 * column) so they convert unconditionally — but the nested Transaction does NOT:
 * `Transaction.currency` is genuinely mixed (schema default BGN;
 * POST /api/payments/create defaults to EUR; Stripe writes EUR rows), so a
 * blanket bgnToEur() halved every already-EUR linked transaction.
 *
 * Also pins that the `currency` column selected purely to drive that decision is
 * stripped before the wire, so the pre-existing response shape is unchanged.
 */

const receiptFindUniqueMock = jest.fn();

jest.mock('../../src/lib/prisma', () => {
  const client = {
    receipt: { findUnique: receiptFindUniqueMock },
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/services/notification.service', () => ({ notificationService: {} }));
jest.mock('../../src/services/email.service', () => ({ emailService: {} }));

import { receiptService } from '../../src/services/receipt.service';
import { bgnToEur } from '../../src/utils/currency';

function receiptWithTransaction(txOver: Record<string, any>) {
  return {
    id: 'r-1',
    userId: 'u1',
    totalAmount: 19.5583, // BGN — Receipt has no currency column
    cashbackAmount: 1.95583, // BGN
    status: 'APPROVED',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    transaction: {
      id: 'tx-1',
      amount: 25.0,
      currency: 'EUR',
      status: 'COMPLETED',
      cashbackAmount: null,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      ...txOver,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('receipt.service — nested Transaction currency (BC-QA-031)', () => {
  it('leaves an EUR-native linked transaction unconverted', async () => {
    receiptFindUniqueMock.mockResolvedValue(
      receiptWithTransaction({ amount: 25.0, currency: 'EUR' }),
    );

    const res: any = await receiptService.getReceiptById('r-1');

    // 25.00 EUR must survive; a blanket bgnToEur() would report 12.78.
    expect(res.data.transaction.amount).toBe(25.0);
    expect(res.data.transaction.amount).not.toBeCloseTo(bgnToEur(25), 2);
  });

  it('converts a BGN-denominated linked transaction', async () => {
    receiptFindUniqueMock.mockResolvedValue(
      receiptWithTransaction({ amount: 19.5583, currency: 'BGN' }),
    );

    const res: any = await receiptService.getReceiptById('r-1');
    expect(res.data.transaction.amount).toBeCloseTo(10, 2);
  });

  it('converts the nested transaction cashbackAmount by the same row currency', async () => {
    receiptFindUniqueMock.mockResolvedValue(
      receiptWithTransaction({ amount: 25.0, currency: 'EUR', cashbackAmount: 2.5 }),
    );

    const res: any = await receiptService.getReceiptById('r-1');
    expect(res.data.transaction.cashbackAmount).toBe(2.5);
  });

  it('treats a null transaction currency as BGN, matching the schema default', async () => {
    receiptFindUniqueMock.mockResolvedValue(
      receiptWithTransaction({ amount: 19.5583, currency: null }),
    );

    const res: any = await receiptService.getReceiptById('r-1');
    expect(res.data.transaction.amount).toBeCloseTo(10, 2);
  });

  it('strips the transaction currency column from the wire (shape unchanged)', async () => {
    receiptFindUniqueMock.mockResolvedValue(
      receiptWithTransaction({ amount: 25.0, currency: 'EUR' }),
    );

    const res: any = await receiptService.getReceiptById('r-1');

    // `currency` is selected only to drive toEur(); it must not appear in the
    // response, which never carried it before this fix.
    expect(res.data.transaction).not.toHaveProperty('currency');
  });

  it('still converts the Receipt-level amounts unconditionally (Receipt is BGN-only)', async () => {
    receiptFindUniqueMock.mockResolvedValue(
      receiptWithTransaction({ amount: 25.0, currency: 'EUR' }),
    );

    const res: any = await receiptService.getReceiptById('r-1');

    expect(res.data.totalAmount).toBeCloseTo(10, 2);
    expect(res.data.cashbackAmount).toBeCloseTo(1, 2);
  });
});
