/**
 * BC-QA-031-FOLLOWUP-1 — "reject at write time", pinned against a real database.
 *
 * `POST /api/payments/create` used to validate the caller-supplied currency
 * against `PayseraService.getSupportedCurrencies()` (Paysera's own, wider
 * library default) and store it verbatim on `Transaction.currency`. Nothing
 * downstream could consume that honestly — `toEur()` converts only BGN and the
 * three read paths that call it labelled the row `'EUR'` — so a 100.00 USD
 * top-up was reported as 100.00 EUR.
 *
 * The accepted domain is now the application's own {BGN, EUR}. These tests use
 * a live database rather than a mocked client specifically so the "no row was
 * created" half of the assertion is a statement about the DATABASE, not about
 * how many times a jest mock was called.
 */

import { prisma, createScratchSchemaClient } from '../../src/lib/prisma';
import {
  createTestUser,
  cleanupTestUser,
  authRequest,
} from '../helpers/test-utils';

// Every currency Paysera accepts that BoomCard does not.
const REJECTED_CURRENCIES = ['USD', 'GBP', 'PLN', 'CZK', 'RON'];

describe('BC-QA-031-FOLLOWUP-1 — POST /api/payments/create rejects out-of-domain currencies', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    const { accessToken, user } = await createTestUser();
    authToken = accessToken;
    userId = user.id;
  });

  afterAll(async () => {
    await cleanupTestUser(userId);
  });

  describe.each(REJECTED_CURRENCIES)('%s', (currency) => {
    it('is refused with 400 and leaves no Transaction row behind', async () => {
      const before = await prisma.transaction.count({ where: { userId } });

      const response = await authRequest(authToken)
        .post('/api/payments/create')
        .send({
          amount: 100.0,
          currency,
          description: `BC-QA-031-FOLLOWUP-1 rejection probe (${currency})`,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      // The message must name the offending code AND the accepted set, so the
      // caller can fix the request without reading the source.
      expect(response.body.message).toContain(currency);
      expect(response.body.message).toContain('BGN');
      expect(response.body.message).toContain('EUR');

      // The load-bearing half: the row must not exist. Before the fix this
      // count went up by one and that row was later relabelled EUR on read.
      const after = await prisma.transaction.count({ where: { userId } });
      expect(after).toBe(before);

      const stray = await prisma.transaction.findFirst({ where: { userId, currency } });
      expect(stray).toBeNull();
    });

    it('is refused in lower case too — case is not a bypass', async () => {
      const before = await prisma.transaction.count({ where: { userId } });

      const response = await authRequest(authToken)
        .post('/api/payments/create')
        .send({
          amount: 100.0,
          currency: currency.toLowerCase(),
          description: `BC-QA-031-FOLLOWUP-1 lower-case rejection probe (${currency})`,
        });

      expect(response.status).toBe(400);
      expect(await prisma.transaction.count({ where: { userId } })).toBe(before);
    });
  });

  it('accepts BGN and stores it verbatim', async () => {
    const response = await authRequest(authToken)
      .post('/api/payments/create')
      .send({
        amount: 50.0,
        currency: 'BGN',
        description: 'BC-QA-031-FOLLOWUP-1 accepted BGN',
      });

    expect(response.status).toBe(201);
    const orderId = response.body.data.orderId;

    const transaction = await prisma.transaction.findFirst({
      where: { userId, metadata: { contains: orderId } },
    });
    expect(transaction).toBeTruthy();
    expect(transaction?.currency).toBe('BGN');
    expect(transaction?.amount).toBe(50.0);
  });

  it('accepts EUR and stores it verbatim', async () => {
    const response = await authRequest(authToken)
      .post('/api/payments/create')
      .send({
        amount: 25.5,
        currency: 'EUR',
        description: 'BC-QA-031-FOLLOWUP-1 accepted EUR',
      });

    expect(response.status).toBe(201);
    const orderId = response.body.data.orderId;

    const transaction = await prisma.transaction.findFirst({
      where: { userId, metadata: { contains: orderId } },
    });
    expect(transaction).toBeTruthy();
    expect(transaction?.currency).toBe('EUR');
    expect(transaction?.amount).toBe(25.5);
  });

  it('canonicalises an accepted lower-case code rather than storing two spellings', async () => {
    const response = await authRequest(authToken)
      .post('/api/payments/create')
      .send({
        amount: 12.0,
        currency: 'eur',
        description: 'BC-QA-031-FOLLOWUP-1 lower-case accepted',
      });

    expect(response.status).toBe(201);
    const orderId = response.body.data.orderId;

    const transaction = await prisma.transaction.findFirst({
      where: { userId, metadata: { contains: orderId } },
    });
    // Stored upper-case: 'eur' and 'EUR' must not become two distinct values in
    // a column that `groupBy(['currency'])` aggregates over.
    expect(transaction?.currency).toBe('EUR');
  });
});

describe('BC-QA-031-FOLLOWUP-1 — the Prisma-level backstop', () => {
  let userId: string;

  beforeAll(async () => {
    const { user } = await createTestUser();
    userId = user.id;
  });

  afterAll(async () => {
    await cleanupTestUser(userId);
  });

  it('refuses a direct prisma.transaction.create carrying an out-of-domain currency', async () => {
    // The per-route checks produce good error messages; this extension is the
    // backstop for the ordinary `prisma.<model>.<op>(...)` shape, so a write
    // site added later that never heard of this task cannot persist a
    // mislabelled row THROUGH THAT SHAPE. It is not a database invariant — see
    // the 'documented limits' block below for the two shapes it cannot reach.
    await expect(
      prisma.transaction.create({
        data: {
          userId,
          type: 'WALLET_TOPUP',
          paymentMethod: 'CARD',
          status: 'PENDING',
          amount: 100,
          currency: 'USD',
          description: 'BC-QA-031-FOLLOWUP-1 direct-write probe',
        },
      }),
    ).rejects.toThrow(/not supported/i);

    expect(await prisma.transaction.count({ where: { userId, currency: 'USD' } })).toBe(0);
  });

  it('refuses an out-of-domain currency on upsert (both payload halves)', async () => {
    await expect(
      prisma.transaction.upsert({
        where: { stripePaymentId: 'bc-qa-031-followup-1-upsert-probe' },
        create: {
          userId,
          type: 'WALLET_TOPUP',
          paymentMethod: 'CARD',
          status: 'COMPLETED',
          amount: 100,
          currency: 'GBP',
          stripePaymentId: 'bc-qa-031-followup-1-upsert-probe',
        },
        update: { status: 'COMPLETED' },
      }),
    ).rejects.toThrow(/not supported/i);

    expect(await prisma.transaction.count({ where: { userId, currency: 'GBP' } })).toBe(0);
  });

  it('refuses an out-of-domain currency written through an interactive $transaction client', async () => {
    // Extensions must reach the `tx` client too, or every write inside a
    // `prisma.$transaction(async (tx) => ...)` block would bypass the guard —
    // and `stripe.service.handleInvoicePaymentSucceeded` writes exactly there.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.transaction.create({
          data: {
            userId,
            type: 'SUBSCRIPTION',
            paymentMethod: 'CARD',
            status: 'COMPLETED',
            amount: 100,
            currency: 'PLN',
            description: 'BC-QA-031-FOLLOWUP-1 interactive-transaction probe',
          },
        });
      }),
    ).rejects.toThrow(/not supported/i);

    expect(await prisma.transaction.count({ where: { userId, currency: 'PLN' } })).toBe(0);
  });

  // impl-r1 F2: `createManyAndReturn` and `updateManyAndReturn` exist on
  // Prisma 7 and were NOT in the guarded-operation list, so the reviewer landed
  // a USD row through the first one. Both are now enumerated.
  it('refuses an out-of-domain currency on createManyAndReturn', async () => {
    expect(typeof (prisma.transaction as any).createManyAndReturn).toBe('function');

    await expect(
      (prisma.transaction as any).createManyAndReturn({
        data: [
          {
            userId,
            type: 'WALLET_TOPUP',
            paymentMethod: 'CARD',
            status: 'PENDING',
            amount: 100,
            currency: 'USD',
            description: 'BC-QA-031-FOLLOWUP-1 createManyAndReturn probe',
          },
        ],
      }),
    ).rejects.toThrow(/not supported/i);

    expect(await prisma.transaction.count({ where: { userId, currency: 'USD' } })).toBe(0);
  });

  it('refuses an out-of-domain currency on updateManyAndReturn', async () => {
    expect(typeof (prisma.transaction as any).updateManyAndReturn).toBe('function');

    const seeded = await prisma.transaction.create({
      data: {
        userId,
        type: 'WALLET_TOPUP',
        paymentMethod: 'CARD',
        status: 'PENDING',
        amount: 10,
        currency: 'BGN',
        description: 'BC-QA-031-FOLLOWUP-1 updateManyAndReturn seed',
      },
    });

    await expect(
      (prisma.transaction as any).updateManyAndReturn({
        where: { id: seeded.id },
        data: { currency: 'RON' },
      }),
    ).rejects.toThrow(/not supported/i);

    const after = await prisma.transaction.findUnique({ where: { id: seeded.id } });
    expect(after?.currency).toBe('BGN');
  });

  /**
   * impl-r7 F2 — the SCRATCH-SCHEMA client carries the guard too.
   *
   * `createScratchSchemaClient` builds a brand-new PrismaClient outside the
   * `globalForPrisma` singleton, so it gets the extensions only because
   * `prisma.ts` wraps it explicitly. That one wrapping was pinned by NOTHING:
   * reverting it left `tsc` at exit 0 and every suite reaching that client
   * green, so had the master merge dropped exactly that hunk, nothing would
   * have said so — while the function's own docblock promises the guard applies
   * "identically to production".
   *
   * The guard throws before any SQL is issued, so this needs no migrated
   * throwaway schema: a client pinned to `public` on the same test database
   * exercises the real code path, and the accepted-currency case below proves
   * the client is genuinely functional rather than broken in a way that would
   * make the refusal meaningless.
   */
  describe('the scratch-schema client carries the same guard (impl-r7 F2)', () => {
    let scratchClient: ReturnType<typeof createScratchSchemaClient>;

    beforeAll(() => {
      scratchClient = createScratchSchemaClient('public');
    });

    afterAll(async () => {
      await scratchClient.$disconnect();
    });

    it('refuses an out-of-domain Transaction.currency through a scratch client', async () => {
      await expect(
        scratchClient.transaction.create({
          data: {
            userId,
            type: 'WALLET_TOPUP',
            paymentMethod: 'CARD',
            status: 'PENDING',
            amount: 100,
            currency: 'USD',
            description: 'BC-QA-031-FOLLOWUP-1 scratch-client probe',
          },
        }),
      ).rejects.toThrow(/not supported/i);

      expect(await prisma.transaction.count({ where: { userId, currency: 'USD' } })).toBe(0);
    });

    it('applies the PER-COLUMN domain too — Wallet.currency refuses EUR', async () => {
      await prisma.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
      try {
        await expect(
          scratchClient.wallet.update({ where: { userId }, data: { currency: 'EUR' } }),
        ).rejects.toThrow(/Supported currencies: BGN\./);
      } finally {
        // Self-cleaning: if the guard is ever ABSENT this update succeeds and
        // leaves a EUR wallet behind, which would cascade into the sibling
        // per-column cases and make one missing hunk look like four defects.
        // Restoring here keeps the RED signal pointing at the real cause.
        await prisma.$executeRawUnsafe(
          `UPDATE wallets SET currency = 'BGN' WHERE "userId" = $1`,
          userId,
        );
      }
    });

    it('still lets an accepted currency through — the client is functional, not inert', async () => {
      const row = await scratchClient.transaction.create({
        data: {
          userId,
          type: 'WALLET_TOPUP',
          paymentMethod: 'CARD',
          status: 'PENDING',
          amount: 10,
          currency: 'BGN',
          description: 'BC-QA-031-FOLLOWUP-1 scratch-client accepted probe',
        },
      });
      expect(row.currency).toBe('BGN');
      await prisma.transaction.delete({ where: { id: row.id } });
    });
  });

  // The two documented limits of the extension, asserted rather than assumed —
  // so that if a future Prisma version starts dispatching extensions for nested
  // writes, this test fails and the docblock at `prisma.ts` gets corrected
  // instead of quietly becoming pessimistic.
  describe('documented limits of the extension (impl-r1 F2)', () => {
    it('does NOT reach nested writes — this is why the docblock does not claim a database invariant', async () => {
      const created = await prisma.user.update({
        where: { id: userId },
        data: {
          transactions: {
            create: {
              type: 'WALLET_TOPUP',
              paymentMethod: 'CARD',
              status: 'PENDING',
              amount: 100,
              currency: 'GBP',
              description: 'BC-QA-031-FOLLOWUP-1 nested-write limit probe',
            },
          },
        },
        select: { id: true },
      });
      expect(created.id).toBe(userId);

      // Prisma query extensions fire on the invoked model operation, not on
      // relations written inside it. The row lands. The per-path gates in the
      // routes/services are what actually prevent this in production; a
      // Postgres CHECK constraint is the only structural fix (db-engineer).
      const nested = await prisma.transaction.findFirst({ where: { userId, currency: 'GBP' } });
      expect(nested).not.toBeNull();

      await prisma.transaction.delete({ where: { id: nested!.id } });
    });

    it('does NOT reach raw SQL — deliberately, since the legacy-row tests depend on it', async () => {
      const id = `bcqa031f1-rawlimit-${Date.now()}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Transaction"
           ("id","userId","type","status","amount","currency","paymentMethod","createdAt","updatedAt")
         VALUES ($1,$2,'WALLET_TOPUP','PENDING',100,'CZK','CARD',NOW(),NOW())`,
        id,
        userId,
      );
      const raw = await prisma.transaction.findUnique({ where: { id } });
      expect(raw?.currency).toBe('CZK');
      await prisma.transaction.delete({ where: { id } });
    });
  });

  /**
   * task-r1 F3 — the accepted domain is PER COLUMN.
   *
   * `Transaction.currency` records what a customer PAID and is {BGN, EUR}. The
   * two wallet columns are the LEDGER's own unit: `walletService.credit()` /
   * `debit()` take no currency and increment the column unconditionally, so a
   * EUR-denominated wallet over-credited a top-up by the peg — a 10.00 EUR
   * payment moved the reported balance by 19.56 EUR, measured live. Admitting a
   * value the arithmetic cannot honour is the hazard; the write domain for
   * those two columns is BGN alone.
   *
   * These cases are also the record of the exact domains, so that
   * BC-QA-031-FOLLOWUP-9's CHECK constraint encodes BGN-only on the wallet
   * columns rather than cementing {BGN, EUR} there.
   */
  describe('per-column write domains (task-r1 F3)', () => {
    it('Transaction.currency accepts EUR', async () => {
      const row = await prisma.transaction.create({
        data: {
          userId,
          type: 'WALLET_TOPUP',
          paymentMethod: 'CARD',
          status: 'PENDING',
          amount: 10,
          currency: 'EUR',
          description: 'BC-QA-031-FOLLOWUP-1 per-column domain probe (tx EUR)',
        },
      });
      expect(row.currency).toBe('EUR');
    });

    it('Wallet.currency REFUSES EUR — the ledger arithmetic is BGN', async () => {
      await prisma.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
      await expect(
        prisma.wallet.update({ where: { userId }, data: { currency: 'EUR' } }),
      ).rejects.toThrow(/not supported/i);

      const wallet = await prisma.wallet.findUnique({ where: { userId } });
      expect(wallet?.currency).toBe('BGN');
    });

    it('WalletTransaction.currency REFUSES EUR for the same reason', async () => {
      const wallet = await prisma.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
      await expect(
        prisma.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'ADJUSTMENT',
            amount: 10,
            balanceBefore: 0,
            balanceAfter: 10,
            currency: 'EUR',
            status: 'COMPLETED',
          },
        }),
      ).rejects.toThrow(/not supported/i);

      expect(await prisma.walletTransaction.count({ where: { walletId: wallet.id, currency: 'EUR' } })).toBe(0);
    });

    it('both wallet columns still accept BGN, and still default to it when omitted', async () => {
      const wallet = await prisma.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
      expect(wallet.currency).toBe('BGN');

      const explicit = await prisma.wallet.update({ where: { userId }, data: { currency: 'BGN' } });
      expect(explicit.currency).toBe('BGN');

      const wtx = await prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'ADJUSTMENT',
          amount: 10,
          balanceBefore: 0,
          balanceAfter: 10,
          status: 'COMPLETED',
        },
      });
      expect(wtx.currency).toBe('BGN');
    });

    it('the refusal message names the column-specific domain, not a global one', async () => {
      await prisma.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
      await expect(
        prisma.wallet.update({ where: { userId }, data: { currency: 'EUR' } }),
      ).rejects.toThrow(/Supported currencies: BGN\./);
    });
  });

  it('still allows BGN and EUR through, and still applies the schema default when omitted', async () => {
    const bgnRow = await prisma.transaction.create({
      data: {
        userId,
        type: 'WALLET_TOPUP',
        paymentMethod: 'CARD',
        status: 'PENDING',
        amount: 10,
        currency: 'BGN',
        description: 'BC-QA-031-FOLLOWUP-1 accepted-write probe (BGN)',
      },
    });
    expect(bgnRow.currency).toBe('BGN');

    const eurRow = await prisma.transaction.create({
      data: {
        userId,
        type: 'WALLET_TOPUP',
        paymentMethod: 'CARD',
        status: 'PENDING',
        amount: 10,
        currency: 'EUR',
        description: 'BC-QA-031-FOLLOWUP-1 accepted-write probe (EUR)',
      },
    });
    expect(eurRow.currency).toBe('EUR');

    // No `currency` key at all — the guard must not disturb the many writers
    // that rely on `@default("BGN")`.
    const defaultedRow = await prisma.transaction.create({
      data: {
        userId,
        type: 'WALLET_TOPUP',
        paymentMethod: 'CARD',
        status: 'PENDING',
        amount: 10,
        description: 'BC-QA-031-FOLLOWUP-1 accepted-write probe (defaulted)',
      },
    });
    expect(defaultedRow.currency).toBe('BGN');
  });
});
