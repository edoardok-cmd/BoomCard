/**
 * BC-QA-045-FOLLOWUP-2 (items 2/3) — coverage sweep.
 *
 * Bug: buildStateWhere's legacy (cashbackStatus IS NULL) arms used to be a
 * hand-maintained `status: { notIn: [...] }` exclusion list per branch,
 * independent of deriveCashbackEntryStatus's own precedence chain. That
 * produced two mislabelings:
 *
 *   1. Expired/Paid/Cleared's exclusion lists omitted 'TRIAL_PENDING', so a
 *      legacy TRIAL_PENDING row past its cashbackExpiresAt was returned by
 *      the Expired filter while rendering as "TrialPending".
 *   2. Voided had no legacy arm at all (only `{ cashbackStatus: 'VOIDED' }`),
 *      while Locked's legacy arm wrongly admitted 'ANNULLED' — so a legacy
 *      ANNULLED row rendered as "Voided" but was returned by the Locked
 *      filter and never by the Voided filter.
 *
 * Fix: buildStateWhere's legacy arms are now generated from
 * legacyPrecedenceSteps(), an ordered mirror of deriveCashbackEntryStatus's
 * own if/else-if chain, instead of a separately hand-maintained list.
 *
 * This test seeds one legacy-shape WalletTransaction fixture for EVERY
 * distinct precedence-chain route deriveCashbackEntryStatus can take (more
 * fine-grained than just "one per CashbackEntryStatus value", since several
 * states have more than one legacy route — e.g. Locked via CANCELLED+not-
 * expired vs. via FAILED), and asserts, for every (fixture, candidate
 * filter) pair, that the fixture is returned by getAllCashbackEntries(...,
 * candidate filter) if and only if candidate === the label
 * deriveCashbackEntryStatus assigns that fixture. That is the exact
 * "filter and label agree" property the bug violated.
 */

import { prisma } from '../../src/lib/prisma';
import {
  getAllCashbackEntries,
  deriveCashbackEntryStatus,
  CashbackEntryStatus,
} from '../../src/services/adminCashback.service';
import { genTestPhone } from '../helpers/test-utils';

const ALL_STATES: CashbackEntryStatus[] = [
  'Pending',
  'Cleared',
  'Locked',
  'Paid',
  'Expired',
  'Voided',
  'TrialPending',
];

const DAY_MS = 24 * 60 * 60 * 1000;

describe('BC-QA-045-FOLLOWUP-2 items 2/3 — buildStateWhere legacy-route coverage sweep', () => {
  let userId: string;
  let walletId: string;
  const txIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const userEmail = `bcqa045f2-legacy-sweep-${suffix}@boomcard.bg`;

  // Fixed reference instant shared by fixture construction and the expected-
  // label computation below, so a few ms of wall-clock drift between here and
  // the live `new Date()` buildStateWhere calls internally can never cross a
  // day-granularity expiry boundary.
  const now = new Date();
  const past = new Date(now.getTime() - 30 * DAY_MS);
  const future = new Date(now.getTime() + 30 * DAY_MS);

  type Fixture = {
    label: string;
    id: string;
    expected: CashbackEntryStatus;
  };
  const fixtures: Fixture[] = [];

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: userEmail,
        passwordHash: 'hashed_password',
        firstName: 'LegacySweep',
        lastName: 'Fixture',
        phone: genTestPhone(),
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
    userId = user.id;

    const wallet = await prisma.wallet.create({ data: { userId: user.id, balance: 0 } });
    walletId = wallet.id;

    // Completed withdrawal anchor for the Paid-via-withdrawal-timing / Cleared
    // (fell-through-the-chain) fixtures below — deriveCashbackEntryStatus's
    // final two outcomes both depend on it.
    const withdrawal = await prisma.walletTransaction.create({
      data: {
        walletId,
        type: 'WITHDRAWAL',
        status: 'COMPLETED',
        amount: 100,
        balanceBefore: 100,
        balanceAfter: 0,
        createdAt: now,
      },
    });
    txIds.push(withdrawal.id);

    // One legacy-shape (cashbackStatus: null) fixture per distinct route
    // through deriveCashbackEntryStatus's precedence chain.
    const rows: {
      label: string;
      status: string;
      cashbackPaidAt: Date | null;
      cashbackExpiresAt: Date | null;
      createdAt: Date;
    }[] = [
      { label: 'Paid (cashbackPaidAt set)', status: 'COMPLETED', cashbackPaidAt: now, cashbackExpiresAt: null, createdAt: past },
      { label: 'TrialPending', status: 'TRIAL_PENDING', cashbackPaidAt: null, cashbackExpiresAt: future, createdAt: past },
      { label: 'Pending', status: 'PENDING', cashbackPaidAt: null, cashbackExpiresAt: future, createdAt: past },
      { label: 'Locked (CANCELLED, not expired)', status: 'CANCELLED', cashbackPaidAt: null, cashbackExpiresAt: future, createdAt: past },
      { label: 'Expired (CANCELLED, expired)', status: 'CANCELLED', cashbackPaidAt: null, cashbackExpiresAt: past, createdAt: past },
      { label: 'Voided (ANNULLED)', status: 'ANNULLED', cashbackPaidAt: null, cashbackExpiresAt: future, createdAt: past },
      { label: 'Locked (FAILED)', status: 'FAILED', cashbackPaidAt: null, cashbackExpiresAt: future, createdAt: past },
      // The bug-1 shape: legacy TRIAL_PENDING-adjacent status combined with a
      // PAST cashbackExpiresAt, but reached via the GENERIC expiry rule, not
      // the CANCELLED branch — the previously-omitted case.
      { label: 'Expired (generic expiry, non-CANCELLED)', status: 'COMPLETED', cashbackPaidAt: null, cashbackExpiresAt: past, createdAt: past },
      // Paid via withdrawal timing: predates the wallet's most recent
      // completed withdrawal.
      { label: 'Paid (via withdrawal timing)', status: 'COMPLETED', cashbackPaidAt: null, cashbackExpiresAt: null, createdAt: new Date(now.getTime() - DAY_MS) },
      // Cleared: postdates the withdrawal, not expired, no earlier rule fires.
      { label: 'Cleared (fell through the chain)', status: 'COMPLETED', cashbackPaidAt: null, cashbackExpiresAt: null, createdAt: new Date(now.getTime() + DAY_MS) },
    ];

    for (const row of rows) {
      const created = await prisma.walletTransaction.create({
        data: {
          walletId,
          type: 'CASHBACK_CREDIT',
          amount: 10,
          balanceBefore: 0,
          balanceAfter: 10,
          status: row.status as any,
          cashbackStatus: null,
          cashbackPaidAt: row.cashbackPaidAt,
          cashbackExpiresAt: row.cashbackExpiresAt,
          createdAt: row.createdAt,
        },
      });
      txIds.push(created.id);

      const expected = deriveCashbackEntryStatus(
        {
          status: row.status,
          cashbackExpiresAt: row.cashbackExpiresAt,
          createdAt: row.createdAt,
          cashbackPaidAt: row.cashbackPaidAt,
          cashbackStatus: null,
        },
        withdrawal.createdAt,
        now,
      );
      fixtures.push({ label: row.label, id: created.id, expected });
    }
  });

  afterAll(async () => {
    if (txIds.length) {
      await prisma.walletTransaction.deleteMany({ where: { id: { in: txIds } } });
    }
    if (walletId) {
      await prisma.wallet.deleteMany({ where: { id: walletId } });
    }
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it('every fixture is returned by the filter matching its own derived label, and only that filter', async () => {
    // Sanity: fixtures must actually cover all 7 CashbackEntryStatus values,
    // otherwise this sweep silently proves less than it claims to.
    const coveredStates = new Set(fixtures.map((f) => f.expected));
    for (const state of ALL_STATES) {
      expect(coveredStates.has(state)).toBe(true);
    }

    for (const state of ALL_STATES) {
      const result = await getAllCashbackEntries(1, 100, state, userEmail);
      const returnedIds = new Set(result.data.map((e) => e.id));

      for (const fixture of fixtures) {
        const shouldBeReturned = fixture.expected === state;
        expect({
          filter: state,
          fixture: fixture.label,
          expectedLabel: fixture.expected,
          returned: returnedIds.has(fixture.id),
        }).toEqual({
          filter: state,
          fixture: fixture.label,
          expectedLabel: fixture.expected,
          returned: shouldBeReturned,
        });
      }
    }
  });
});
