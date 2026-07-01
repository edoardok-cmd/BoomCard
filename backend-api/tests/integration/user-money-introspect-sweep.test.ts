/**
 * User Surface — Route-introspecting money-field sweep
 * (BC-USER-SPEC-REAUDIT coverage machinery)
 *
 * Dynamically discovers ALL user/public GET routes from the live Express router
 * at test-startup time and asserts that NO money-named field is a bare number
 * when the currency transition window is CLOSED.
 *
 * Unlike user-currency-leak-sweep.test.ts (which hard-codes a known endpoint
 * list and tests precise gating semantics per endpoint), this sweep is a
 * breadth-first net: it catches newly-added user/public GET endpoints that
 * were never added to any hard-coded list.
 *
 * The two files are complementary:
 *   - user-currency-leak-sweep.test.ts — pinpoint gating + open/closed assertions
 *   - user-money-introspect-sweep.test.ts — exhaustive route discovery (this file)
 *
 * Runtime: backend on :3025 (NODE_ENV=test, DATABASE_URL=boomcard_test).
 */

import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { invalidateCurrencyDisplayCache } from '../../src/utils/currencyDisplay';
import { enumerateRoutes, EnumeratedRoute } from '../helpers/adminRoutes';
import { classifyScope } from '../helpers/appScopes';
import {
  createTestUser,
  createTestSubscription,
  cleanupTestUser,
  authRequest,
} from '../helpers/test-utils';

// ─── state seeded in beforeAll ───────────────────────────────────────────────
let userId: string;
let token: string;
let seededReceiptId: string;
let seededOfferId: string;
let seededCardId: string;
let seededScanId: string;
let seededPartnerId: string;
let seededVenueId: string;
let seededStickerId: string;
let seededLoyaltyAccountId: string;
// partner-user created to own the Partner/Venue/Sticker chain
let seededPartnerUserId: string;

// The full deduplicated set of user/public GET routes, built in beforeAll.
let userPublicGetRoutes: EnumeratedRoute[] = [];

// ─── helpers ─────────────────────────────────────────────────────────────────

async function setCurrencyWindowOpen(isOpen: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: 'currency_transition_window_open' },
    create: { key: 'currency_transition_window_open', value: isOpen ? 'true' : 'false' },
    update: { value: isOpen ? 'true' : 'false' },
  });
  invalidateCurrencyDisplayCache();
}

/**
 * Detect a bare money scalar: a numeric money field that is neither
 * wrapped in a {bgn, eur} dual-currency display object NOR a correctly-gated
 * EUR-native plain scalar (i.e. the enclosing object has a sibling `currency`
 * field set to 'EUR').  Zero is skipped intentionally — a zero-value scalar
 * is structurally unambiguous (no currency content).
 * Seeds must use non-zero amounts so this guard stays meaningful.
 *
 * ⚠ OBJECT-SCOPE EUR BLIND SPOT: `isEurNative` is computed once per enclosing
 * object, not per field. If a buggy endpoint emits multiple money fields inside
 * a single object that also carries `currency:'EUR'` (e.g. `{ balance: 100,
 * cashbackAmount: 50, currency: 'EUR' }`), ALL fields in that object are
 * suppressed — including any co-mingled un-gated BGN field. This trade-off
 * avoids false positives on the wallet balance endpoint, which legitimately
 * uses the EUR-plain-scalar pattern. Per-endpoint gating correctness for
 * EUR-native objects (wallet/balance etc.) is pinned by the complementary
 * pinpoint suite in `user-currency-leak-sweep.test.ts`.
 */
function findBareMoneyScalar(node: any, path = '$'): string[] {
  const leaks: string[] = [];
  const MONEY_KEYS =
    /^(amount|price|balance|balanceBefore|balanceAfter|currentBalance|availableBalance|pendingBalance|expiringBalance|totalCashback|totalTopups|totalSpent|totalAmount|verifiedAmount|payoutAmount|cashbackAmount|cashbackBalance|cashValue|averageAmount|averageReceiptAmount|discountAmount|minPurchase|maxDiscount|fee|totalFee)$/i;

  function walk(n: any, p: string) {
    if (n == null) return;
    if (Array.isArray(n)) {
      n.forEach((v, i) => walk(v, `${p}[${i}]`));
      return;
    }
    if (typeof n === 'object') {
      // A correctly-gated money value is a {bgn, eur} object — stop recursing.
      if ('eur' in n && 'bgn' in n) return;
      // Detect whether this object is a correctly-gated EUR-native plain scalar
      // (e.g. wallet balance endpoint intentionally returns balance:<EUR number>,
      // currency:'EUR' when the transition window is closed).
      // See the object-scope blind spot caveat in the JSDoc above.
      const currencyField = (Object.keys(n) as string[]).find(
        (fk) => fk.toLowerCase() === 'currency',
      );
      const isEurNative =
        currencyField != null &&
        String((n as any)[currencyField]).toUpperCase() === 'EUR';
      for (const [k, v] of Object.entries(n)) {
        if (MONEY_KEYS.test(k) && typeof v === 'number' && v !== 0 && !isEurNative) {
          leaks.push(`${p}.${k} = ${v} (bare money scalar, not display:{bgn,eur} and not EUR-native)`);
        }
        walk(v, `${p}.${k}`);
      }
    }
  }

  walk(node, path);
  return leaks;
}

/**
 * Replace :param segments in an Express route path using the fixture map.
 * Resolution order for each segment:
 *   1. Exact match: :receiptId → fixtures.receiptId
 *   2. Generic fallback ONLY for params literally named "id" → fixtures.id
 *   3. Any other unrecognised param name (e.g. :city, :category, :token) →
 *      return null (truly skip the route — do not substitute a UUID as a
 *      string param, which would produce spurious empty-array "covered" hits).
 * Returns null if any segment remains unresolved (no fixture for that param).
 */
function substituteFixtures(
  routePath: string,
  fixtures: Record<string, string>,
): string | null {
  const segments = routePath.split('/');
  const resolved: string[] = [];

  for (const seg of segments) {
    if (!seg.startsWith(':')) {
      resolved.push(seg);
      continue;
    }
    const paramName = seg.slice(1); // strip the leading ':'
    if (fixtures[paramName] !== undefined) {
      resolved.push(fixtures[paramName]);
    } else if (paramName === 'id' && fixtures['id'] !== undefined) {
      // Only the generic :id param falls back to the userId fixture.
      resolved.push(fixtures['id']);
    } else {
      return null; // string param (city, category, token, etc.) — no fixture → skip
    }
  }

  return resolved.join('/');
}

// ─── beforeAll ───────────────────────────────────────────────────────────────

beforeAll(async () => {
  // 1. Discover user/public GET routes from the live router.
  const all = enumerateRoutes(app);
  const seen = new Set<string>();
  for (const r of all) {
    if (r.method !== 'GET') continue;
    const scope = classifyScope(r.method, r.path);
    if (scope !== 'user' && scope !== 'public') continue;
    const key = `${r.method} ${r.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    userPublicGetRoutes.push(r);
  }

  // 2. Create test user + subscription.
  const u = await createTestUser();
  userId = u.user.id;
  token = u.accessToken;
  await createTestSubscription(userId, 'BASIC', 'ACTIVE');

  // 3. Seed wallet with non-zero balance.
  await prisma.wallet.upsert({
    where: { userId },
    create: { userId, balance: 1234, availableBalance: 1234, currency: 'BGN' },
    update: { balance: 1234, availableBalance: 1234 },
  });

  // 4. Seed WALLET_TOPUP Transaction (populates /api/payments/history).
  await prisma.transaction.create({
    data: {
      userId,
      type: 'WALLET_TOPUP' as any,
      amount: 55.55,
      currency: 'BGN',
      status: 'COMPLETED' as any,
      paymentMethod: 'BANK_TRANSFER' as any,
      description: 'introspect-sweep-topup',
      metadata: JSON.stringify({ orderId: 'introspect-order-001' }),
    },
  });

  // 5. Seed SUBSCRIPTION Transaction (populates /api/subscriptions/history).
  await prisma.transaction.create({
    data: {
      userId,
      type: 'SUBSCRIPTION' as any,
      amount: 999,
      currency: 'BGN',
      status: 'COMPLETED' as any,
      paymentMethod: 'BANK_TRANSFER' as any,
      description: 'introspect-sweep-subscription',
      metadata: JSON.stringify({ orderId: 'introspect-sub-order-001' }),
    },
  });

  // 6. Seed LoyaltyAccount with non-zero cashbackBalance.
  const loyaltyAccount = await prisma.loyaltyAccount.upsert({
    where: { userId },
    create: {
      userId,
      tier: 'BRONZE',
      points: 0,
      lifetimePoints: 0,
      tierProgress: 0,
      cashbackBalance: 99.99,
      nextTierPoints: 0,
    },
    update: { cashbackBalance: 99.99 },
  });
  seededLoyaltyAccountId = loyaltyAccount.id;

  // 7. Seed Reward + RewardRedemption (populates /api/loyalty/rewards/redemptions).
  await prisma.reward.upsert({
    where: { id: 'introspect-sweep-reward-cashvalue' },
    create: {
      id: 'introspect-sweep-reward-cashvalue',
      title: 'Introspect Sweep Test Reward',
      titleBg: 'Тест',
      description: 'Sweep seed reward for introspect sweep',
      descriptionBg: 'Тест',
      pointsCost: 100,
      cashValue: 5.00,
      category: 'General',
      isActive: true,
      validFrom: new Date('2020-01-01'),
    },
    update: { cashValue: 5.00 },
  });
  await prisma.rewardRedemption.upsert({
    where: { id: 'introspect-sweep-redemption-cashvalue' },
    create: {
      id: 'introspect-sweep-redemption-cashvalue',
      accountId: loyaltyAccount.id,
      rewardId: 'introspect-sweep-reward-cashvalue',
      status: 'PENDING',
      pointsSpent: 100,
    },
    update: {},
  });

  // 8. Seed Receipt + dedicated Transaction (populates /api/receipts and /api/receipts/:id).
  const receiptTx = await prisma.transaction.create({
    data: {
      userId,
      type: 'WALLET_TOPUP' as any,
      amount: 30.00,
      currency: 'BGN',
      status: 'COMPLETED' as any,
      paymentMethod: 'BANK_TRANSFER' as any,
      description: 'introspect-sweep-receipt-tx',
      metadata: JSON.stringify({ orderId: 'introspect-receipt-order-001' }),
    },
  });
  const seededReceipt = await prisma.receipt.create({
    data: {
      userId,
      transactionId: receiptTx.id,
      totalAmount: 30.00,
      cashbackAmount: 3.00,
      status: 'APPROVED' as any,
      merchantName: 'Introspect Sweep Merchant',
    },
  });
  seededReceiptId = seededReceipt.id;

  // 9. Seed ReceiptAnalytics.
  await prisma.receiptAnalytics.upsert({
    where: { userId },
    create: {
      userId,
      totalReceipts: 1,
      approvedReceipts: 1,
      rejectedReceipts: 0,
      pendingReceipts: 0,
      totalCashback: 3.00,
      totalSpent: 30.00,
      averageReceiptAmount: 30.00,
      successRate: 100,
    },
    update: { totalCashback: 3.00, totalSpent: 30.00, averageReceiptAmount: 30.00 },
  });

  // 10. Seed Partner + Venue + StickerLocation + Sticker for venue/* routes.
  const partnerUser = await prisma.user.create({
    data: {
      email: `introspect-sweep-partner-${userId.slice(0, 8)}@test.local`,
      firstName: 'Introspect',
      lastName: 'Partner',
      phone: `+3598800${userId.replace(/-/g, '').slice(0, 7)}`,
      status: 'ACTIVE',
      role: 'PARTNER',
      emailVerified: true,
      passwordHash: 'unused',
    },
  });
  seededPartnerUserId = partnerUser.id;

  const partner = await prisma.partner.create({
    data: {
      userId: partnerUser.id,
      businessName: `IntrospectSweep ${userId.slice(0, 8)}`,
      businessNameBg: 'ИнтроспектТест',
      category: 'Restaurant',
      status: 'ACTIVE',
      city: 'Sofia',
      verifiedAt: new Date(),
      discountRate: 10,
    },
  });
  seededPartnerId = partner.id;

  const venue = await prisma.venue.create({
    data: {
      partnerId: partner.id,
      name: 'IntrospectSweep Venue',
      address: 'Test Street 1',
      city: 'Sofia',
      latitude: 42.6977,
      longitude: 23.3219,
    },
  });
  seededVenueId = venue.id;

  const stickerLoc = await prisma.stickerLocation.create({
    data: {
      venueId: venue.id,
      name: 'IntrospectSweep Loc',
      locationNumber: `IS-${userId.replace(/-/g, '').slice(0, 8)}`,
    },
  });

  const sticker = await prisma.sticker.create({
    data: {
      venueId: venue.id,
      locationId: stickerLoc.id,
      stickerId: `IS-S-${userId.replace(/-/g, '').slice(0, 8)}`,
      qrCode: `IS-QR-${userId.replace(/-/g, '').slice(0, 8)}`,
      status: 'ACTIVE',
    },
  });
  seededStickerId = sticker.id;

  // Venue sticker config required by some venue routes.
  await prisma.venueStickerConfig.create({
    data: {
      venueId: venue.id,
      cashbackPercent: 5.0,
      premiumBonus: 2.0,
      platinumBonus: 5.0,
      minBillAmount: 0,
      autoApproveThreshold: 10,
    },
  });

  // 11. Fetch the auto-created card (registration creates one).
  const card = await prisma.card.findFirst({ where: { userId } });
  if (!card) throw new Error('No card found for test user — registration must auto-create one');
  seededCardId = card.id;

  // 12. Seed StickerScan (populates /api/dashboard/me receipts[] and /api/stickers/* scan routes).
  const scan = await prisma.stickerScan.create({
    data: {
      userId,
      cardId: seededCardId,
      stickerId: sticker.id,
      venueId: venue.id,
      billAmount: 25.00,
      verifiedAmount: 25.00,
      cashbackAmount: 2.50,
      cashbackPercent: 10,
      status: 'APPROVED',
    },
  });
  seededScanId = scan.id;

  // 13. Seed Offer (populates /api/offers/*).
  const offer = await prisma.offer.create({
    data: {
      partnerId: partner.id,
      title: 'IntrospectSweep Offer',
      titleBg: 'ИнтроспектТест Оферта',
      description: 'Sweep test offer for introspect sweep currency leak detection',
      descriptionBg: 'Тест',
      type: 'DISCOUNT',
      status: 'ACTIVE',
      discountAmount: 15.0,
      minPurchase: 20.0,
      maxDiscount: 10.0,
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  seededOfferId = offer.id;
}, 60_000);

afterAll(async () => {
  await setCurrencyWindowOpen(false).catch(() => {});

  // Delete in FK-safe order.
  await prisma.rewardRedemption
    .delete({ where: { id: 'introspect-sweep-redemption-cashvalue' } })
    .catch(() => {});
  await prisma.reward
    .delete({ where: { id: 'introspect-sweep-reward-cashvalue' } })
    .catch(() => {});
  if (seededReceiptId) {
    await prisma.receipt.delete({ where: { id: seededReceiptId } }).catch(() => {});
  }
  if (seededScanId) {
    await prisma.stickerScan.delete({ where: { id: seededScanId } }).catch(() => {});
  }
  if (seededOfferId) {
    await prisma.offer.delete({ where: { id: seededOfferId } }).catch(() => {});
  }
  // Sticker chain
  await prisma.sticker
    .deleteMany({ where: { stickerId: { startsWith: 'IS-S-' } } })
    .catch(() => {});
  await prisma.stickerLocation
    .deleteMany({ where: { locationNumber: { startsWith: 'IS-' } } })
    .catch(() => {});
  await prisma.venueStickerConfig
    .deleteMany({ where: { venueId: seededVenueId } })
    .catch(() => {});
  if (seededVenueId) {
    await prisma.venue.delete({ where: { id: seededVenueId } }).catch(() => {});
  }
  if (seededPartnerId) {
    await prisma.partner.delete({ where: { id: seededPartnerId } }).catch(() => {});
  }
  if (seededPartnerUserId) {
    await prisma.user.delete({ where: { id: seededPartnerUserId } }).catch(() => {});
  }
  if (userId) {
    try {
      await cleanupTestUser(userId);
    } catch {}
  }
  await prisma.$disconnect();
}, 30_000);

// ─── tests ───────────────────────────────────────────────────────────────────

describe('[USER-MONEY-INTROSPECT] all user/public GET routes must not leak bare money scalars (window CLOSED)', () => {
  it('route-introspecting sweep: zero bare money scalars across all user/public GETs', async () => {
    await setCurrencyWindowOpen(false);

    // Build fixture map — keyed by param name (without ":").
    // The substituteFixtures function tries the exact param name first, then falls back to "id".
    const fixtures: Record<string, string> = {
      id: userId, // generic fallback for any unrecognised :id param
      userId,
      receiptId: seededReceiptId,
      offerId: seededOfferId,
      cardId: seededCardId,
      scanId: seededScanId,
      partnerId: seededPartnerId,
      venueId: seededVenueId,
      stickerId: seededStickerId,
      loyaltyAccountId: seededLoyaltyAccountId,
      orderId: 'introspect-order-001',
      // city / category are string params, not UUID-based — skip (routes with these will
      // be skipped if they have a colon-prefixed segment named something else)
    };

    const skipped: string[] = [];
    const allLeaks: Record<string, string[]> = {};

    for (const route of userPublicGetRoutes) {
      const url = substituteFixtures(route.path, fixtures);
      if (!url) {
        skipped.push(route.path);
        continue;
      }

      const res = await authRequest(token).get(url);

      if (res.status >= 200 && res.status < 300) {
        const leaks = findBareMoneyScalar(res.body?.data ?? res.body, url);
        if (leaks.length) allLeaks[url] = leaks;
      }
    }

    if (skipped.length) {
      console.log('[introspect-sweep] skipped (no fixture for param):', skipped);
    }

    expect(
      Object.keys(allLeaks).length === 0
        ? 'no leaks'
        : 'Bare money scalar(s) from user/public GET while window CLOSED:\n' +
            JSON.stringify(allLeaks, null, 2),
    ).toBe('no leaks');
  });

  it('reports the set of discovered user/public GET routes (informational)', () => {
    // This test never fails — it logs the full set of discovered routes so
    // audit rounds can verify coverage without reading the Express stack.
    const fixtures: Record<string, string> = {
      id: userId,
      userId,
      receiptId: seededReceiptId,
      offerId: seededOfferId,
      cardId: seededCardId,
      scanId: seededScanId,
      partnerId: seededPartnerId,
      venueId: seededVenueId,
      stickerId: seededStickerId,
      loyaltyAccountId: seededLoyaltyAccountId,
      orderId: 'introspect-order-001',
    };

    const total = userPublicGetRoutes.length;
    const substitutable = userPublicGetRoutes.filter(
      (r) => substituteFixtures(r.path, fixtures) !== null,
    ).length;

    console.log(
      `[introspect-sweep] discovered ${total} user/public GET routes; ` +
        `${substitutable} exercised, ${total - substitutable} skipped (no fixture)`,
    );
    console.log(
      '[introspect-sweep] full route list:\n' +
        userPublicGetRoutes.map((r) => `  ${r.method} ${r.path}`).join('\n'),
    );

    expect(total).toBeGreaterThan(0);
  });
});
