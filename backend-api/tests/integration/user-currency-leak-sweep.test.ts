/**
 * User Surface — CUR (currency dual-display) + ACL-003 (admin identity leak) sweep
 * (BC-USER-SPEC-REAUDIT)
 *
 * Covers INV-USER-CUR-001/002/003 (spec §17 / §19 rule 11):
 *   - Window CLOSED → BGN hidden, EUR only: NO raw BGN monetary scalar may leave
 *     any user-facing money endpoint. The gated shape is `display:{bgn:null,eur:N}`.
 *   - Window OPEN → both BGN and EUR shown.
 *   - Applies to ALL user money amounts (wallet balance, wallet transactions,
 *     payment history).
 *
 * Covers INV-USER-ACL-003 (spec §13.3):
 *   - voidedByUserId (responsible admin identity) must NEVER appear in GET
 *     /api/wallet/transactions.
 *   - voidedReason must be limited to a canonical VOID_REASON_CATEGORIES token
 *     (e.g. "FRAUD", "DUPLICATE") — never the full internal note.
 *
 * The danger: an endpoint that serializes raw `amount` / `balanceBefore` /
 * `balanceAfter` / `currency:"BGN"` without routing through the dual-currency
 * formatter. getBalance gates correctly; the transactions list was flagged by
 * the r1 static pass (INV-USER-ACL-003 / INV-USER-CUR) as un-gated — this sweep
 * is the mechanical guard that closes the class and keeps it closed.
 *
 * Runtime: backend on :3025 (NODE_ENV=test, DATABASE_URL=boomcard_test).
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { invalidateCurrencyDisplayCache } from '../../src/utils/currencyDisplay';
import { VOID_REASON_CATEGORIES } from '../../src/services/cashbackLifecycle.service';
import {
  createTestUser,
  createTestSubscription,
  cleanupTestUser,
  authRequest,
} from '../helpers/test-utils';

let userId: string;
let token: string;

async function setCurrencyWindowOpen(isOpen: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: 'currency_transition_window_open' },
    create: { key: 'currency_transition_window_open', value: isOpen ? 'true' : 'false' },
    update: { value: isOpen ? 'true' : 'false' },
  });
  invalidateCurrencyDisplayCache();
}

beforeAll(async () => {
  const u = await createTestUser();
  userId = u.user.id;
  token = u.accessToken;
  await createTestSubscription(userId, 'BASIC', 'ACTIVE');

  // Seed a wallet + transactions so the money endpoints return data.
  const wallet = await prisma.wallet.upsert({
    where: { userId },
    create: { userId, balance: 1234, availableBalance: 1234, currency: 'BGN' },
    update: {},
  });
  await prisma.walletTransaction.createMany({
    data: [
      {
        walletId: wallet.id,
        type: 'CASHBACK_CREDIT' as any,
        amount: 1234,
        balanceBefore: 0,
        balanceAfter: 1234,
        currency: 'BGN',
        status: 'COMPLETED' as any,
        cashbackStatus: 'CLEARED' as any,
        description: 'seed-cleared',
      },
      // VOIDED row with admin identity — ACL-003 assertions rely on this.
      {
        walletId: wallet.id,
        type: 'CASHBACK_CREDIT' as any,
        amount: 10,
        balanceBefore: 1234,
        balanceAfter: 1234,
        currency: 'BGN',
        cashbackStatus: 'VOIDED' as any,
        voidedAt: new Date(),
        voidedReason: 'FRAUD: receipt was duplicated by the admin',
        voidedByUserId: userId, // FK-valid; only absence from API response matters for ACL test
        description: 'seed-voided',
      },
    ],
    skipDuplicates: true,
  });

  // Seed a WALLET_TOPUP Transaction so /api/payments/history returns non-zero amount
  await prisma.transaction.create({
    data: {
      userId,
      type: 'WALLET_TOPUP' as any,
      amount: 55.55,
      currency: 'BGN',
      status: 'COMPLETED' as any,
      paymentMethod: 'BANK_TRANSFER' as any,
      description: 'seed-topup',
      metadata: JSON.stringify({ orderId: 'seed-order-001' }),
    },
  });
}, 60_000);

afterAll(async () => {
  await setCurrencyWindowOpen(false).catch(() => {});
  if (userId) { try { await cleanupTestUser(userId); } catch {} }
}, 30_000);

// Endpoints that route money fields through the dual-currency formatter.
const MONEY_ENDPOINTS = [
  '/api/wallet/balance',
  '/api/wallet/transactions',
  '/api/wallet/statistics',
  '/api/payments/history',
];

// Detect a raw BGN scalar: a `currency:"BGN"` paired with a raw numeric amount,
// or a numeric money field NOT wrapped in a `display:{bgn,eur}` object.
function findRawBgnLeak(node: any, path = '$'): string[] {
  const leaks: string[] = [];
  // Genuine money fields only. Bare `total`/`count`/`page` are pagination
  // scalars, not currency — excluded to avoid false positives.
  const MONEY_KEYS = /^(amount|balance|balanceBefore|balanceAfter|currentBalance|availableBalance|pendingBalance|expiringBalance|totalCashback|totalTopups|totalSpent|totalAmount|verifiedAmount|payoutAmount|cashbackAmount)$/i;
  function walk(n: any, p: string) {
    if (n == null) return;
    if (Array.isArray(n)) { n.forEach((v, i) => walk(v, `${p}[${i}]`)); return; }
    if (typeof n === 'object') {
      // A correctly-gated money value is a {bgn, eur} object — never recurse into
      // it as a leak (bgn:null is the closed-window shape).
      if ('eur' in n && 'bgn' in n) return;
      for (const [k, v] of Object.entries(n)) {
        if (MONEY_KEYS.test(k) && typeof v === 'number' && v !== 0) {
          leaks.push(`${p}.${k} = ${v} (raw numeric money scalar, not display:{bgn,eur})`);
        }
        walk(v, `${p}.${k}`);
      }
    }
  }
  walk(node, path);
  return leaks;
}

describe('INV-USER-CUR — user money endpoints respect the currency transition window', () => {
  it('[CUR] window CLOSED → no raw BGN scalar leaks from any user money endpoint', async () => {
    await setCurrencyWindowOpen(false);
    const allLeaks: Record<string, string[]> = {};
    for (const ep of MONEY_ENDPOINTS) {
      const res = await authRequest(token).get(ep);
      if (res.status >= 200 && res.status < 300) {
        const leaks = findRawBgnLeak(res.body?.data ?? res.body, ep);
        if (leaks.length) allLeaks[ep] = leaks;
      }
    }
    expect(
      Object.keys(allLeaks).length === 0
        ? 'no leaks'
        : 'Raw BGN scalar(s) leaked while window CLOSED:\n' + JSON.stringify(allLeaks, null, 2),
    ).toBe('no leaks');
  });

  it('[CUR] window OPEN → balance exposes both bgn and eur', async () => {
    await setCurrencyWindowOpen(true);
    const res = await authRequest(token).get('/api/wallet/balance');
    expect(res.status).toBe(200);
    const s = JSON.stringify(res.body);
    // Open window must surface EUR alongside BGN (dual display present).
    expect(/eur/i.test(s)).toBe(true);
  });
});

describe('INV-USER-ACL-003 — GET /api/wallet/transactions must not leak admin identity or internal void notes', () => {
  it('[ACL-003] voidedByUserId is absent from every transaction in the response', async () => {
    const res = await authRequest(token).get('/api/wallet/transactions');
    expect(res.status).toBe(200);
    const txns: any[] = res.body?.transactions ?? [];
    const leaks = txns
      .filter((tx: any) => 'voidedByUserId' in tx)
      .map((_: any, i: number) => `transactions[${i}].voidedByUserId present`);
    expect(leaks).toEqual([]);
  });

  it('[ACL-003] voidedReason on VOIDED rows is limited to a canonical category token', async () => {
    const res = await authRequest(token).get('/api/wallet/transactions');
    expect(res.status).toBe(200);
    const txns: any[] = res.body?.transactions ?? [];
    const voided = txns.filter((tx: any) => tx.cashbackStatus === 'VOIDED' && tx.voidedReason != null);
    expect(voided.length).toBeGreaterThan(0); // ensure the seeded VOIDED row is present
    const invalid = voided
      .filter((tx: any) => !(VOID_REASON_CATEGORIES as readonly string[]).includes(tx.voidedReason))
      .map((tx: any, i: number) => `voided[${i}].voidedReason = "${tx.voidedReason}" (not canonical)`);
    expect(invalid).toEqual([]);
  });
});

describe('INV-USER-PAY-007 / INV-USER-ACL-003 / INV-USER-NOTIF-005 — WITHDRAWAL escalation fields must not reach user', () => {
  /**
   * Seeds a WITHDRAWAL in RISK_HOLD status with the exact description and metadata
   * that executePayoutTransfer writes on a second-failure escalation (spec §3.7).
   * The row is cleaned up after the block — wallet/user cleanup in afterAll handles
   * any residual rows if the explicit delete fails.
   */
  let escalatedTxId: string | null = null;

  beforeAll(async () => {
    const wallet = await prisma.wallet.upsert({
      where: { userId },
      create: { userId, balance: 5000, availableBalance: 5000, currency: 'BGN' },
      update: {},
    });
    const tx = await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'WITHDRAWAL' as any,
        status: 'RISK_HOLD' as any,
        amount: 5000,
        balanceBefore: 10000,
        balanceAfter: 5000,
        currency: 'BGN',
        description: 'Ескалирано за ръчен преглед след повторен неуспех: test-gateway-error',
        metadata: JSON.stringify({
          escalatedSecondFailure: true,
          escalatedAt: new Date().toISOString(),
          internalNote: 'admin note should not be visible',
        }),
      },
    });
    escalatedTxId = tx.id;
  }, 30_000);

  afterAll(async () => {
    if (escalatedTxId) {
      await prisma.walletTransaction.delete({ where: { id: escalatedTxId } }).catch(() => {});
      escalatedTxId = null;
    }
  }, 30_000);

  it('[PAY-007] WITHDRAWAL rows must not expose description containing escalation text, and escalated row status must be masked to PROCESSING', async () => {
    const res = await authRequest(token).get('/api/wallet/transactions');
    expect(res.status).toBe(200);
    const txns: any[] = res.body?.transactions ?? [];
    const withdrawals = txns.filter((tx: any) => tx.type === 'WITHDRAWAL');
    // The seeded escalated row must appear (sanity — confirms the seed landed)
    expect(withdrawals.length).toBeGreaterThan(0);
    const leaking = withdrawals.filter(
      (tx: any) =>
        tx.description != null &&
        typeof tx.description === 'string' &&
        tx.description.includes('Ескалирано'),
    );
    expect(
      leaking.length === 0
        ? 'no leaks'
        : `${leaking.length} WITHDRAWAL row(s) expose escalation description: ` +
            leaking.map((tx: any) => JSON.stringify(tx.description)).join(', '),
    ).toBe('no leaks');
    // Verify that maskUserFacingPayoutStatus correctly masks the RISK_HOLD
    // status of the seeded escalated row to PROCESSING (spec §3.7).
    // A regression in maskUserFacingPayoutStatus would leave the raw RISK_HOLD
    // status visible to the user, which this assertion catches.
    const escalatedTx = withdrawals.find((tx: any) => tx.id === escalatedTxId);
    expect(escalatedTx).toBeDefined();
    expect(escalatedTx?.status).toBe('PROCESSING');
  });

  it('[ACL-003/NOTIF-005] WITHDRAWAL rows must not expose metadata with escalation keys', async () => {
    const res = await authRequest(token).get('/api/wallet/transactions');
    expect(res.status).toBe(200);
    const txns: any[] = res.body?.transactions ?? [];
    const withdrawals = txns.filter((tx: any) => tx.type === 'WITHDRAWAL');
    expect(withdrawals.length).toBeGreaterThan(0);
    const leaking = withdrawals.filter((tx: any) => {
      if (tx.metadata == null) return false;
      let parsed: any;
      try {
        parsed = typeof tx.metadata === 'string' ? JSON.parse(tx.metadata) : tx.metadata;
      } catch {
        // raw string metadata that isn't JSON also leaks if present
        return true;
      }
      return (
        parsed.escalatedSecondFailure !== undefined ||
        parsed.escalatedAt !== undefined ||
        parsed.internalNote !== undefined
      );
    });
    expect(
      leaking.length === 0
        ? 'no leaks'
        : `${leaking.length} WITHDRAWAL row(s) expose escalation metadata keys: ` +
            leaking.map((tx: any) => JSON.stringify(tx.metadata)).join(', '),
    ).toBe('no leaks');
  });
});
