/**
 * Subscriber Surface — CROSS-SCOPE route-introspecting money-field sweep
 * (BC-USER-SPEC-REAUDIT ↔ BC-REDEMPTION-SPEC-REAUDIT shared convergence machinery)
 *
 * WHY THIS EXISTS (the seam it closes):
 *   The per-scope `user-money-introspect-sweep.test.ts` walks ONLY routes that
 *   `classifyScope` labels `user`/`public`. But a mobile subscriber's token also
 *   reaches every `redemption`-scoped route (/api/stickers, /api/venues,
 *   /api/bookings, /api/messaging, /api/dashboard). The currency-leak class
 *   escaped through that user↔redemption seam: `GET /api/stickers/my-scans`
 *   returned raw BGN money for 16 audit rounds because the user sweep filtered it
 *   out (redemption-owned) and the redemption scope had no currency invariant at
 *   all. This sweep removes the scope filter entirely: it walks EVERY discovered
 *   GET route with a single authenticated subscriber token. Routes the subscriber
 *   cannot reach simply 401/403/404 and are naturally not money-checked here
 *   (partner/admin routes keep their own dedicated currency sweeps). What remains
 *   — everything a subscriber can actually see — must not leak a bare money scalar.
 *
 * This is the exhaustive breadth-first net for the subscriber surface; the
 * pinpoint per-endpoint gating semantics live in user-currency-leak-sweep.test.ts.
 *
 * Runtime: backend on :3025 (NODE_ENV=test, DATABASE_URL=boomcard_test).
 */

import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { invalidateCurrencyDisplayCache } from '../../src/utils/currencyDisplay';
import { enumerateRoutes, EnumeratedRoute } from '../helpers/adminRoutes';
import {
  createTestUser,
  createTestSubscription,
  cleanupTestUser,
  authRequest,
} from '../helpers/test-utils';
import { createSignedCallback } from '../helpers/payseraTestHelper';

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
let seededPartnerUserId: string;
let seededBookingId: string;

// Dedicated subscriptions for the NON-GET mutation walk. Kept separate from the
// GET fixtures so the mutation walk fully controls lifecycle state (cancel →
// reactivate ordering) and never leaves cross-test residue. `payseraOrderId` is
// set so findForbiddenInternalKeys has real teeth: a regression that returns the
// raw Subscription row WOULD expose payseraOrderId.
let mutationSubId: string; // walked by cancel/reactivate/update-plan/auto-renewal
let refundSubId: string; // walked by trial-refund (needs eligibility window)

// The full deduplicated set of GET routes, built in beforeAll (NO scope filter).
let allGetRoutes: EnumeratedRoute[] = [];

// The full deduplicated set of non-GET (POST/PUT/PATCH) routes; DELETE excluded
// from the walk (destructive) but counted in the coverage report.
let allNonGetRoutes: EnumeratedRoute[] = [];
let deleteRouteCount = 0;

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
 * Detect a bare money scalar: a numeric money field that is neither wrapped in a
 * {bgn, eur} dual-currency object NOR a correctly-gated EUR-native plain scalar
 * (enclosing object has a sibling `currency:'EUR'`). Zero is skipped (structurally
 * unambiguous). Seeds must use non-zero amounts so this guard stays meaningful.
 *
 * NOTE vs the user sweep's MONEY_KEYS: `billAmount` is added here — it is a
 * subscriber-visible BGN scalar on StickerScan (GET /api/stickers/my-scans) that
 * the user sweep's regex omitted, part of why the stickers leak went undetected.
 *
 * ⚠ Object-scope EUR blind spot (same trade-off as the user sweep): `isEurNative`
 * is computed per enclosing object, not per field.
 */
function findBareMoneyScalar(node: any, path = '$'): string[] {
  const leaks: string[] = [];
  const MONEY_KEYS =
    /^(amount|price|balance|balanceBefore|balanceAfter|currentBalance|availableBalance|pendingBalance|expiringBalance|totalCashback|totalTopups|totalSpent|totalAmount|billAmount|verifiedAmount|payoutAmount|cashbackAmount|cashbackBalance|cashValue|averageAmount|averageReceiptAmount|discountAmount|minPurchase|maxDiscount|fee|totalFee)$/i;

  function walk(n: any, p: string) {
    if (n == null) return;
    if (Array.isArray(n)) {
      n.forEach((v, i) => walk(v, `${p}[${i}]`));
      return;
    }
    if (typeof n === 'object') {
      if ('eur' in n && 'bgn' in n) return; // correctly-gated display object
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
 * Detect a forbidden internal/billing key anywhere in a subscriber-facing body.
 *
 * WHY THIS EXISTS (the non-GET seam it closes): the money-scalar detector above
 * only catches money-NAMED numeric fields. The r19 class was different — 6
 * subscription-mutation POST/PATCH endpoints returned the RAW Prisma Subscription
 * row, leaking internal Stripe/Paysera identifiers, raw metadata JSON and dunning
 * counters that carry no money key. Those escaped every GET-only sweep AND the
 * money detector. This detector walks the whole body and flags any key that a
 * subscriber must NEVER see. Each entry is tied to its "never expose to user"
 * invariant; the denylist is deliberately conservative — only fields with a
 * documented never-expose status are here, so an ambiguous-but-legit key (e.g.
 * `currentPeriodEnd`, `autoRenewal`) is not a false positive.
 */
function findForbiddenInternalKeys(node: any, path = '$'): string[] {
  const leaks: string[] = [];
  // Denylist — each key documented against the invariant that forbids it.
  const FORBIDDEN_KEYS =
    /^(stripeSubscriptionId|stripePriceId|stripeCustomerId|payseraOrderId|retryAttempt|failedPaymentAt|failedPaymentClearedAt|renewalRemindersSent|lastRenewalReminderSentAt|trialRefundEligibleUntil|trialRefundUsed|passwordHash|qrCode)$/;
  // ── SUB-011 (r19): raw Subscription row internal/billing fields ────────────
  //   stripeSubscriptionId / stripePriceId / stripeCustomerId
  //     — Stripe billing identifiers on model Subscription (INV-USER-SUB-011).
  //     NB: there is NO `stripeCurrentPeriodEnd` column; the real period-end
  //     field is `currentPeriodEnd`, which is subscriber-SAFE (in SUB_USER_FIELDS),
  //     so it is deliberately NOT on this denylist.
  //   payseraOrderId — Paysera order reference (INV-USER-SUB-011)
  //   retryAttempt / failedPaymentAt / failedPaymentClearedAt /
  //   renewalRemindersSent / lastRenewalReminderSentAt — dunning/reminder
  //     counters, internal billing state (INV-USER-SUB-011)
  //   trialRefundEligibleUntil / trialRefundUsed — trial-refund internal
  //     eligibility bookkeeping (INV-USER-SUB-011)
  // ── cross-class internal-field siblings ────────────────────────────────────
  //   passwordHash — credential hash, never user-facing (INV-USER-AUTH / general PII)
  //   qrCode — sticker QR secret, redemption-internal (INV-USER-QR-007)

  function walk(n: any, p: string) {
    if (n == null) return;
    if (Array.isArray(n)) {
      n.forEach((v, i) => walk(v, `${p}[${i}]`));
      return;
    }
    if (typeof n === 'object') {
      for (const [k, v] of Object.entries(n)) {
        if (FORBIDDEN_KEYS.test(k)) {
          leaks.push(`${p}.${k} (forbidden internal key — must never reach a subscriber)`);
        }
        // Raw `metadata`: the Subscription/Transaction `metadata` column is a
        // JSON blob of internal state. A non-null object OR non-empty string
        // value means the raw column was serialized straight through (SUB-011);
        // a projected view never carries it. (null / '' is not a leak.)
        if (
          k === 'metadata' &&
          v != null &&
          ((typeof v === 'object') || (typeof v === 'string' && v.length > 0))
        ) {
          leaks.push(`${p}.metadata (raw metadata JSON exposed — must never reach a subscriber)`);
        }
        walk(v, `${p}.${k}`);
      }
    }
  }

  walk(node, path);
  return leaks;
}

/**
 * Replace :param segments using the fixture map. Returns null if any :param has
 * no fixture (route is skipped rather than probed with a bogus value).
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
    const paramName = seg.slice(1);
    if (fixtures[paramName] !== undefined) {
      resolved.push(fixtures[paramName]);
    } else if (paramName === 'id' && fixtures['id'] !== undefined) {
      resolved.push(fixtures['id']);
    } else {
      return null;
    }
  }
  return resolved.join('/');
}

// ─── beforeAll ───────────────────────────────────────────────────────────────

beforeAll(async () => {
  // 1. Discover ALL GET routes from the live router — NO scope filter.
  //    (The subscriber token self-selects reachable routes at request time.)
  const all = enumerateRoutes(app);
  const seen = new Set<string>();
  const seenNonGet = new Set<string>();
  for (const r of all) {
    const key = `${r.method} ${r.path}`;
    if (r.method === 'GET') {
      if (seen.has(key)) continue;
      seen.add(key);
      allGetRoutes.push(r);
    } else if (r.method === 'POST' || r.method === 'PUT' || r.method === 'PATCH') {
      if (seenNonGet.has(key)) continue;
      seenNonGet.add(key);
      allNonGetRoutes.push(r);
    } else if (r.method === 'DELETE') {
      // Counted for the coverage report, but NOT walked (destructive — would
      // tear down seeded fixtures mid-run).
      deleteRouteCount++;
    }
  }

  // 2. Create test user + subscription.
  const u = await createTestUser();
  userId = u.user.id;
  token = u.accessToken;
  await createTestSubscription(userId, 'BASIC', 'ACTIVE');

  // 3. Wallet.
  await prisma.wallet.upsert({
    where: { userId },
    create: { userId, balance: 1234, availableBalance: 1234, currency: 'BGN' },
    update: { balance: 1234, availableBalance: 1234 },
  });

  // 4. WALLET_TOPUP Transaction (payments/history).
  await prisma.transaction.create({
    data: {
      userId, type: 'WALLET_TOPUP' as any, amount: 55.55, currency: 'BGN',
      status: 'COMPLETED' as any, paymentMethod: 'BANK_TRANSFER' as any,
      description: 'subscriber-introspect-topup',
      metadata: JSON.stringify({ orderId: 'sub-introspect-order-001' }),
    },
  });

  // 5. SUBSCRIPTION Transaction (subscriptions/history).
  await prisma.transaction.create({
    data: {
      userId, type: 'SUBSCRIPTION' as any, amount: 999, currency: 'BGN',
      status: 'COMPLETED' as any, paymentMethod: 'BANK_TRANSFER' as any,
      description: 'subscriber-introspect-subscription',
      metadata: JSON.stringify({ orderId: 'sub-introspect-sub-order-001' }),
    },
  });

  // 6. LoyaltyAccount.
  const loyaltyAccount = await prisma.loyaltyAccount.upsert({
    where: { userId },
    create: {
      userId, tier: 'BRONZE', points: 0, lifetimePoints: 0, tierProgress: 0,
      cashbackBalance: 99.99, nextTierPoints: 0,
    },
    update: { cashbackBalance: 99.99 },
  });
  seededLoyaltyAccountId = loyaltyAccount.id;

  // 7. Reward + RewardRedemption (loyalty/rewards/redemptions).
  await prisma.reward.upsert({
    where: { id: 'sub-introspect-reward-cashvalue' },
    create: {
      id: 'sub-introspect-reward-cashvalue', title: 'Subscriber Introspect Reward',
      titleBg: 'Тест', description: 'seed', descriptionBg: 'Тест',
      pointsCost: 100, cashValue: 5.0, category: 'General', isActive: true,
      validFrom: new Date('2020-01-01'),
    },
    update: { cashValue: 5.0 },
  });
  await prisma.rewardRedemption.upsert({
    where: { id: 'sub-introspect-redemption-cashvalue' },
    create: {
      id: 'sub-introspect-redemption-cashvalue', accountId: loyaltyAccount.id,
      rewardId: 'sub-introspect-reward-cashvalue', status: 'PENDING', pointsSpent: 100,
    },
    update: {},
  });

  // 8. Receipt + Transaction (receipts, receipts/:id).
  const receiptTx = await prisma.transaction.create({
    data: {
      userId, type: 'WALLET_TOPUP' as any, amount: 30.0, currency: 'BGN',
      status: 'COMPLETED' as any, paymentMethod: 'BANK_TRANSFER' as any,
      description: 'subscriber-introspect-receipt-tx',
      metadata: JSON.stringify({ orderId: 'sub-introspect-receipt-order-001' }),
    },
  });
  const seededReceipt = await prisma.receipt.create({
    data: {
      userId, transactionId: receiptTx.id, totalAmount: 30.0, cashbackAmount: 3.0,
      status: 'APPROVED' as any, merchantName: 'Subscriber Introspect Merchant',
    },
  });
  seededReceiptId = seededReceipt.id;

  // 9. ReceiptAnalytics.
  await prisma.receiptAnalytics.upsert({
    where: { userId },
    create: {
      userId, totalReceipts: 1, approvedReceipts: 1, rejectedReceipts: 0,
      pendingReceipts: 0, totalCashback: 3.0, totalSpent: 30.0,
      averageReceiptAmount: 30.0, successRate: 100,
    },
    update: { totalCashback: 3.0, totalSpent: 30.0, averageReceiptAmount: 30.0 },
  });

  // 10. Partner + Venue + StickerLocation + Sticker.
  const partnerUser = await prisma.user.create({
    data: {
      email: `sub-introspect-partner-${userId.slice(0, 8)}@test.local`,
      firstName: 'Introspect', lastName: 'Partner',
      phone: `+3598801${userId.replace(/-/g, '').slice(0, 7)}`,
      status: 'ACTIVE', role: 'PARTNER', emailVerified: true, passwordHash: 'unused',
    },
  });
  seededPartnerUserId = partnerUser.id;

  const partner = await prisma.partner.create({
    data: {
      userId: partnerUser.id, businessName: `SubIntrospect ${userId.slice(0, 8)}`,
      businessNameBg: 'ИнтроспектТест', category: 'Restaurant', status: 'ACTIVE',
      city: 'Sofia', verifiedAt: new Date(), discountRate: 10,
    },
  });
  seededPartnerId = partner.id;

  const venue = await prisma.venue.create({
    data: {
      partnerId: partner.id, name: 'SubIntrospect Venue', address: 'Test Street 1',
      city: 'Sofia', latitude: 42.6977, longitude: 23.3219,
    },
  });
  seededVenueId = venue.id;

  const stickerLoc = await prisma.stickerLocation.create({
    data: {
      venueId: venue.id, name: 'SubIntrospect Loc',
      locationNumber: `SI-${userId.replace(/-/g, '').slice(0, 8)}`,
    },
  });

  const sticker = await prisma.sticker.create({
    data: {
      venueId: venue.id, locationId: stickerLoc.id,
      stickerId: `SI-S-${userId.replace(/-/g, '').slice(0, 8)}`,
      qrCode: `SI-QR-${userId.replace(/-/g, '').slice(0, 8)}`, status: 'ACTIVE',
    },
  });
  seededStickerId = sticker.id;

  await prisma.venueStickerConfig.create({
    data: {
      venueId: venue.id, cashbackPercent: 5.0, premiumBonus: 2.0, platinumBonus: 5.0,
      minBillAmount: 0, autoApproveThreshold: 10,
    },
  });

  // 11. Card (auto-created at registration).
  const card = await prisma.card.findFirst({ where: { userId } });
  if (!card) throw new Error('No card found for test user — registration must auto-create one');
  seededCardId = card.id;

  // 12. StickerScan — NON-ZERO money (billAmount/verifiedAmount/cashbackAmount).
  //     This is the teeth for GET /api/stickers/my-scans.
  const scan = await prisma.stickerScan.create({
    data: {
      userId, cardId: seededCardId, stickerId: sticker.id, venueId: venue.id,
      billAmount: 25.0, verifiedAmount: 25.0, cashbackAmount: 2.5,
      cashbackPercent: 10, status: 'APPROVED',
    },
  });
  seededScanId = scan.id;

  // 13. Offer (offers/*).
  const offer = await prisma.offer.create({
    data: {
      partnerId: partner.id, title: 'SubIntrospect Offer', titleBg: 'Оферта',
      description: 'seed', descriptionBg: 'Тест', type: 'DISCOUNT', status: 'ACTIVE',
      discountAmount: 15.0, minPurchase: 20.0, maxDiscount: 10.0,
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  seededOfferId = offer.id;

  // 14b. Dedicated subscriptions for the NON-GET mutation walk (SUB-011 pattern,
  //      mirrors user-currency-leak-sweep.test.ts @75264ba). PREMIUM_WEEKLY so
  //      update-plan (PREMIUM_WEEKLY → BASIC) is the Paysera DB-only path (no
  //      Stripe/wallet dependency). payseraOrderId set → detector (b) has teeth.
  let weeklyPlan = await prisma.plan.findFirst({ where: { planCode: 'PREMIUM_WEEKLY' } });
  if (!weeklyPlan) {
    weeklyPlan = await prisma.plan.create({
      data: {
        planCode: 'PREMIUM_WEEKLY', displayName: 'Premium Weekly',
        displayNameBg: 'Премиум Седмичен', priceMonthlyEur: 0, priceYearlyEur: 0,
        priceWeeklyEur: 599, cashbackRate: 20, isActive: true,
      },
    });
  }
  const mutationSub = await prisma.subscription.create({
    data: {
      userId, plan: 'PREMIUM_WEEKLY', planId: weeklyPlan.id,
      payseraOrderId: `SI-MUT-${userId.slice(0, 8)}`,
      status: 'ACTIVE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false, autoRenewal: true,
      metadata: JSON.stringify({ source: 'introspect-mutation-seed' }),
    },
  });
  mutationSubId = mutationSub.id;

  const refundSub = await prisma.subscription.create({
    data: {
      userId, plan: 'PREMIUM_WEEKLY', planId: weeklyPlan.id,
      payseraOrderId: `SI-REF-${userId.slice(0, 8)}`,
      status: 'ACTIVE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false, autoRenewal: true,
      trialRefundEligibleUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      trialRefundUsed: false,
      metadata: JSON.stringify({ source: 'introspect-refund-seed' }),
    },
  });
  refundSubId = refundSub.id;

  // 14. Booking (bookings/*) — best-effort; skip silently if model shape differs.
  try {
    const booking = await prisma.booking.create({
      data: {
        userId, venueId: venue.id, status: 'CONFIRMED' as any,
        bookingDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        partySize: 2,
      } as any,
    });
    seededBookingId = booking.id;
  } catch {
    /* booking model optional for this sweep */
  }
}, 60_000);

afterAll(async () => {
  await setCurrencyWindowOpen(false).catch(() => {});
  if (seededBookingId) await prisma.booking.delete({ where: { id: seededBookingId } }).catch(() => {});
  await prisma.rewardRedemption.delete({ where: { id: 'sub-introspect-redemption-cashvalue' } }).catch(() => {});
  await prisma.reward.delete({ where: { id: 'sub-introspect-reward-cashvalue' } }).catch(() => {});
  if (seededReceiptId) await prisma.receipt.delete({ where: { id: seededReceiptId } }).catch(() => {});
  if (seededScanId) await prisma.stickerScan.delete({ where: { id: seededScanId } }).catch(() => {});
  if (seededOfferId) await prisma.offer.delete({ where: { id: seededOfferId } }).catch(() => {});
  await prisma.sticker.deleteMany({ where: { stickerId: { startsWith: 'SI-S-' } } }).catch(() => {});
  await prisma.stickerLocation.deleteMany({ where: { locationNumber: { startsWith: 'SI-' } } }).catch(() => {});
  await prisma.venueStickerConfig.deleteMany({ where: { venueId: seededVenueId } }).catch(() => {});
  if (seededVenueId) await prisma.venue.delete({ where: { id: seededVenueId } }).catch(() => {});
  if (seededPartnerId) await prisma.partner.delete({ where: { id: seededPartnerId } }).catch(() => {});
  if (seededPartnerUserId) await prisma.user.delete({ where: { id: seededPartnerUserId } }).catch(() => {});
  // Dedicated mutation-walk subscriptions (also swept by cleanupTestUser's
  // subscription.deleteMany, but delete explicitly for clarity/order-safety).
  if (mutationSubId) await prisma.subscription.delete({ where: { id: mutationSubId } }).catch(() => {});
  if (refundSubId) await prisma.subscription.delete({ where: { id: refundSubId } }).catch(() => {});
  if (userId) { try { await cleanupTestUser(userId); } catch {} }
  await prisma.$disconnect();
}, 30_000);

// ─── tests ───────────────────────────────────────────────────────────────────

describe('[SUBSCRIBER-MONEY-INTROSPECT] no bare money scalar on ANY subscriber-reachable GET (window CLOSED)', () => {
  function fixtureMap(): Record<string, string> {
    return {
      id: userId, userId, receiptId: seededReceiptId, offerId: seededOfferId,
      cardId: seededCardId, scanId: seededScanId, partnerId: seededPartnerId,
      venueId: seededVenueId, stickerId: seededStickerId,
      loyaltyAccountId: seededLoyaltyAccountId, orderId: 'sub-introspect-order-001',
      bookingId: seededBookingId || userId,
    };
  }

  it('cross-scope sweep: zero bare money scalars across ALL subscriber-reachable GETs', async () => {
    await setCurrencyWindowOpen(false);
    const fixtures = fixtureMap();
    const skipped: string[] = [];
    const allLeaks: Record<string, string[]> = {};

    for (const route of allGetRoutes) {
      const url = substituteFixtures(route.path, fixtures);
      if (!url) { skipped.push(route.path); continue; }
      const res = await authRequest(token).get(url);
      // Only money-check routes the subscriber can actually reach (2xx).
      if (res.status >= 200 && res.status < 300) {
        const leaks = findBareMoneyScalar(res.body?.data ?? res.body, url);
        if (leaks.length) allLeaks[url] = leaks;
      }
    }

    if (skipped.length) {
      console.log('[subscriber-introspect] skipped (no fixture for param):', skipped);
    }

    expect(
      Object.keys(allLeaks).length === 0
        ? 'no leaks'
        : 'Bare money scalar(s) on subscriber-reachable GET while window CLOSED:\n' +
            JSON.stringify(allLeaks, null, 2),
    ).toBe('no leaks');
  });

  // ─── TEETH ───────────────────────────────────────────────────────────────
  // Proves the detector actually catches the sticker-scan money class (the seam
  // the user sweep missed). billAmount is the key the user sweep's MONEY_KEYS
  // regex omitted — assert it is caught here. Also proves the gated display
  // shape the fix produces is NOT a false positive.
  it('[teeth] flags RAW sticker-scan money (billAmount/verifiedAmount/cashbackAmount)', () => {
    const rawScanResponse = {
      data: [{ id: 'x', billAmount: 25, verifiedAmount: 25, cashbackAmount: 2.5 }],
    };
    const leaks = findBareMoneyScalar(rawScanResponse.data, '$');
    expect(leaks.some((l) => l.includes('billAmount'))).toBe(true);
    expect(leaks.some((l) => l.includes('verifiedAmount'))).toBe(true);
    expect(leaks.some((l) => l.includes('cashbackAmount'))).toBe(true);
  });

  it('[teeth] does NOT flag the gated display:{bgn,eur} shape (no false positive)', () => {
    const gatedScanResponse = {
      data: [{
        id: 'x',
        display: {
          billAmount: { bgn: null, eur: 12.78 },
          verifiedAmount: { bgn: null, eur: 12.78 },
          cashbackAmount: { bgn: null, eur: 1.28 },
        },
      }],
    };
    const leaks = findBareMoneyScalar(gatedScanResponse.data, '$');
    expect(leaks).toEqual([]);
  });

  it('reports discovered vs subscriber-reachable route coverage (informational)', async () => {
    const fixtures = fixtureMap();
    let reachable = 0;
    let skipped = 0;
    for (const route of allGetRoutes) {
      const url = substituteFixtures(route.path, fixtures);
      if (!url) { skipped++; continue; }
      const res = await authRequest(token).get(url);
      if (res.status >= 200 && res.status < 300) reachable++;
    }
    console.log(
      `[subscriber-introspect] discovered ${allGetRoutes.length} GET routes; ` +
        `${reachable} subscriber-reachable (2xx, money-checked), ${skipped} skipped (no fixture)`,
    );
    expect(allGetRoutes.length).toBeGreaterThan(0);
  }, 60_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// NON-GET breadth-first net (POST / PUT / PATCH)
//
// WHY THIS EXISTS: two leak classes escaped the GET-only sweeps round after
// round and had to be found by hand:
//   • r18 — money-scalar leak on a POST (verify-redirect returned a raw BGN
//     `amount`). Caught by findBareMoneyScalar (detector a).
//   • r19 — internal-field leak on 6 subscription-mutation POST/PATCH endpoints
//     that returned the raw Prisma Subscription row (stripe*/paysera* ids, raw
//     metadata, dunning counters). Caught by findForbiddenInternalKeys
//     (detector b).
// This block walks every discovered POST/PUT/PATCH route (DELETE excluded —
// destructive), fires it with a registered or generic body, and runs BOTH
// detectors over every 2xx body — so a FUTURE non-GET money/field leak is
// auto-caught here instead of found by hand.
// ─────────────────────────────────────────────────────────────────────────────
describe('[SUBSCRIBER-NONGET-INTROSPECT] no bare money scalar / internal-field leak on ANY subscriber-reachable POST|PUT|PATCH (window CLOSED)', () => {
  /**
   * Minimal valid request bodies for money/field-bearing subscriber-reachable
   * endpoints, keyed by "<METHOD> <raw-route-path>" (params NOT substituted).
   * Any route not listed is fired with {} — if that doesn't yield 2xx it lands
   * in the printed skip-list for a human to add a body (the durable mechanism).
   *
   * NOTE: the r18/r19 subscription-mutation endpoints are NOT driven from this
   * generic map — they need dedicated subscriptions and strict lifecycle
   * ordering (cancel before reactivate), so they are exercised explicitly in
   * `runSubscriptionMutationWalk()` below. They are intentionally absent here so
   * the generic walk does not fire them against the wrong sub / out of order.
   */
  function bodyRegistry(): Record<string, any> {
    return {
      // r18 money-scalar POST — real signed Paysera payload built per test.
      // (Body injected in the walk; see forgeVerifyRedirectBody.)
    };
  }

  // Endpoints handled explicitly (dedicated sub + ordering) — excluded from the
  // generic breadth-first walk so we don't double-fire or fire out of order.
  const EXPLICITLY_HANDLED = new Set<string>([
    'PATCH /api/subscriptions/:id/auto-renewal',
    'POST /api/subscriptions/:id/cancel',
    'POST /api/subscriptions/:id/reactivate',
    'POST /api/subscriptions/:id/update-plan',
    'POST /api/subscriptions/:id/trial-refund',
    'POST /api/payments/verify-redirect',
  ]);

  function fixtureMap(): Record<string, string> {
    return {
      id: userId, userId, receiptId: seededReceiptId, offerId: seededOfferId,
      cardId: seededCardId, scanId: seededScanId, partnerId: seededPartnerId,
      venueId: seededVenueId, stickerId: seededStickerId,
      loyaltyAccountId: seededLoyaltyAccountId, orderId: 'sub-introspect-order-001',
      bookingId: seededBookingId || userId,
    };
  }

  function detect(body: any, url: string): string[] {
    const payload = body?.data ?? body;
    return [
      ...findBareMoneyScalar(payload, url),
      ...findForbiddenInternalKeys(payload, url),
    ];
  }

  /**
   * Forge a REAL signed Paysera verify-redirect body carrying a BGN amount.
   * Uses the same createSignedCallback helper the passing CUR-003 sweep uses —
   * this exercises the REAL paysera.service.handleCallback (no mock/stub). With
   * the window CLOSED the fixed handler gates the BGN amount via toDualCurrency,
   * so a clean product yields NO bare scalar. A regression that stops gating
   * would surface as a bare `amount` number → detector (a) fires.
   */
  function forgeVerifyRedirectBody(): { data: string; ss1: string } {
    const signed = createSignedCallback({
      orderId: 'subscriber-nonget-verify-redirect-001',
      amount: '5000', // 50.00 BGN in cents (non-zero so the money guard is live)
      currency: 'BGN',
      status: '1', // success → 2xx with an amount in the body
    });
    return { data: signed.data, ss1: signed.ss1 };
  }

  // Records populated by the walk, asserted by the coverage/leak tests.
  const exercised: string[] = []; // "<METHOD> <url>" that returned 2xx and was checked
  const skipped: string[] = []; // "<METHOD> <path> (reason)"
  const allLeaks: Record<string, string[]> = {};

  async function fire(method: string, url: string, body: any) {
    const req = authRequest(token) as any;
    const verb = method.toLowerCase() as 'post' | 'put' | 'patch';
    return req[verb](url).send(body ?? {});
  }

  /**
   * Explicit, ordered walk of the r18/r19 endpoints against dedicated seeded
   * subscriptions. Order matters: cancel (schedules cancellation) BEFORE
   * reactivate (clears it); trial-refund uses its own eligible sub; update-plan
   * last (mutates plan to BASIC). All operate on OUR seeded subs — no residue.
   */
  async function runSubscriptionMutationWalk() {
    const check = async (key: string, method: string, url: string, body: any) => {
      const res = await fire(method, url, body);
      if (res.status >= 200 && res.status < 300) {
        exercised.push(`${key} → ${url}`);
        const leaks = detect(res.body, `${key} ${url}`);
        if (leaks.length) allLeaks[`${key} ${url}`] = leaks;
      } else {
        skipped.push(`${key} (status ${res.status}: ${res.body?.message ?? 'no body'})`);
      }
    };

    // 1. verify-redirect (r18 money-scalar POST) — real signed payload.
    await check(
      'POST /api/payments/verify-redirect',
      'POST',
      '/api/payments/verify-redirect',
      forgeVerifyRedirectBody(),
    );

    // 2. auto-renewal off (r19 field-leak PATCH), then restore.
    await check(
      'PATCH /api/subscriptions/:id/auto-renewal',
      'PATCH',
      `/api/subscriptions/${mutationSubId}/auto-renewal`,
      { autoRenewal: false },
    );
    await fire('PATCH', `/api/subscriptions/${mutationSubId}/auto-renewal`, { autoRenewal: true });

    // 3. trial-refund on the dedicated eligible sub (r19 field-leak POST).
    await check(
      'POST /api/subscriptions/:id/trial-refund',
      'POST',
      `/api/subscriptions/${refundSubId}/trial-refund`,
      {},
    );

    // 4. cancel (schedules cancellation) — must precede reactivate.
    await check(
      'POST /api/subscriptions/:id/cancel',
      'POST',
      `/api/subscriptions/${mutationSubId}/cancel`,
      { cancelAtPeriodEnd: true },
    );

    // 5. reactivate (clears the scheduled cancellation).
    await check(
      'POST /api/subscriptions/:id/reactivate',
      'POST',
      `/api/subscriptions/${mutationSubId}/reactivate`,
      {},
    );

    // 6. update-plan PREMIUM_WEEKLY → BASIC (Paysera DB-only path) — last.
    await check(
      'POST /api/subscriptions/:id/update-plan',
      'POST',
      `/api/subscriptions/${mutationSubId}/update-plan`,
      { plan: 'BASIC' },
    );
  }

  /**
   * Generic breadth-first walk of every OTHER discovered non-GET route. Fires
   * the registered body if present else {}; money+field-checks ONLY 2xx bodies.
   * A route whose :param has no fixture, or that doesn't reach 2xx with the
   * generic body, is recorded in the skip-list (surfaced in the report).
   */
  async function runGenericNonGetWalk() {
    const fixtures = fixtureMap();
    const registry = bodyRegistry();
    for (const route of allNonGetRoutes) {
      const key = `${route.method} ${route.path}`;
      if (EXPLICITLY_HANDLED.has(key)) continue; // handled by the ordered walk
      const url = substituteFixtures(route.path, fixtures);
      if (!url) { skipped.push(`${key} (no fixture for a :param)`); continue; }
      const body = registry[key] ?? {};
      const res = await fire(route.method, url, body);
      if (res.status >= 200 && res.status < 300) {
        exercised.push(`${key} → ${url}`);
        const leaks = detect(res.body, `${key} ${url}`);
        if (leaks.length) allLeaks[`${key} ${url}`] = leaks;
      } else {
        skipped.push(`${key} (status ${res.status})`);
      }
    }
  }

  // The walk runs ONCE, before the assertions, so both the leak test and the
  // coverage test read the same populated records without double-firing
  // side-effecting mutations.
  beforeAll(async () => {
    await setCurrencyWindowOpen(false);
    await runSubscriptionMutationWalk();
    await runGenericNonGetWalk();
  }, 120_000);

  it('non-GET walk: zero bare money scalars AND zero internal-field leaks across all subscriber-reachable POST|PUT|PATCH', () => {
    expect(
      Object.keys(allLeaks).length === 0
        ? 'no leaks'
        : 'Leak(s) on subscriber-reachable non-GET while window CLOSED:\n' +
            JSON.stringify(allLeaks, null, 2),
    ).toBe('no leaks');
  });

  it('exercises the r18/r19 teeth endpoints (2xx, checked — NOT skipped)', () => {
    // These are the exact classes this net exists to catch — they must be in the
    // exercised set, otherwise the walk has no real teeth.
    const teeth = [
      'POST /api/subscriptions/:id/update-plan',
      'POST /api/subscriptions/:id/cancel',
      'POST /api/subscriptions/:id/reactivate',
      'POST /api/subscriptions/:id/trial-refund',
      'PATCH /api/subscriptions/:id/auto-renewal',
    ];
    const exercisedKeys = exercised.map((e) => e.split(' → ')[0]);
    const missing = teeth.filter((t) => !exercisedKeys.includes(t));
    expect(
      missing.length === 0
        ? 'all teeth exercised'
        : `teeth endpoints NOT exercised (2xx) — walk has no teeth: ${missing.join(', ')}\n` +
            `skip-list: ${JSON.stringify(skipped, null, 2)}`,
    ).toBe('all teeth exercised');
  });

  it('exercises the r18 verify-redirect money-scalar endpoint (2xx, real signed payload — NOT skipped)', () => {
    // verify-redirect is the exact endpoint the original money-scalar leak was
    // found on. It must be genuinely exercised (2xx) so its money detector runs;
    // if it silently regresses to non-2xx (Paysera env/sign drift, rate-limiter,
    // handler refactor) it drops into the skip bucket, its detector never fires,
    // and the suite stays green — the precise false-confidence this net prevents.
    // Symmetric with the r18/r19 teeth assertion above.
    const verifyRedirectExercised = exercised.some((e) =>
      e.startsWith('POST /api/payments/verify-redirect'),
    );
    expect(
      verifyRedirectExercised
        ? 'verify-redirect exercised'
        : 'verify-redirect NOT exercised (2xx) — money detector never ran, net has no teeth on the r18 leak endpoint\n' +
            `skip-list: ${JSON.stringify(skipped, null, 2)}`,
    ).toBe('verify-redirect exercised');
  });

  it('[teeth] verify-redirect BGN amount is toDualCurrency-gated {bgn,eur} when window OPEN (shape-precise, heuristic-independent)', async () => {
    // WHY: the walk's window-CLOSED money check relies on findBareMoneyScalar,
    // whose isEurNative heuristic is OBJECT-scoped. When CLOSED the handler emits
    // `amount:<number>` next to `currency:'EUR'`, so a bare scalar there reads as
    // EUR-native and is NOT flagged. A *narrow partial* r18 regression — dropping
    // the toDualCurrency wrap but keeping the currency:'EUR' relabel — would leave
    // a raw BGN scalar mislabeled EUR and slip past the walk silently.
    // This assertion pins the toDualCurrency gating DIRECTLY and does not depend
    // on the heuristic: with the window OPEN the fixed handler MUST return a
    // dual-currency {bgn,eur} object (both numeric) for a BGN amount, never a
    // bare number. A partial revert (raw scalar) fails `not.toBe('number')`.
    await setCurrencyWindowOpen(true); // invalidates the currency-display cache
    try {
      const body = forgeVerifyRedirectBody(); // genuinely-signed BGN payload
      const res = await authRequest(token).post('/api/payments/verify-redirect').send(body);
      expect(res.status).toBe(200);
      expect(res.body?.success).toBe(true);
      const amount = res.body?.data?.amount;
      expect(typeof amount).not.toBe('number'); // must NOT be a bare scalar
      expect(amount).toEqual(
        expect.objectContaining({ bgn: expect.any(Number), eur: expect.any(Number) }),
      );
    } finally {
      // Restore CLOSED so the rest of the suite + afterAll are unaffected.
      await setCurrencyWindowOpen(false);
    }
  });

  it('reports discovered vs exercised non-GET route coverage (informational)', () => {
    const verifyRedirectExercised = exercised.some((e) =>
      e.startsWith('POST /api/payments/verify-redirect'),
    );
    console.log(
      `[subscriber-nonget-introspect] discovered ${allNonGetRoutes.length} non-GET routes ` +
        `(excl ${deleteRouteCount} DELETE, not exercised — destructive, excluded); ` +
        `${exercised.length} exercised (2xx, both detectors run); ` +
        `${skipped.length} skipped (status ≥300 / no body / no fixture)`,
    );
    console.log(
      `[subscriber-nonget-introspect] verify-redirect: ${verifyRedirectExercised ? 'EXERCISED (2xx, real signed payload)' : 'NOT exercised — see skip-list'}`,
    );
    console.log('[subscriber-nonget-introspect] skip-list:', JSON.stringify(skipped, null, 2));
    expect(allNonGetRoutes.length).toBeGreaterThan(0);
  });

  // ─── TEETH (unit-style, no HTTP) ───────────────────────────────────────────
  it('[teeth] findForbiddenInternalKeys FLAGS a raw subscription row shape', () => {
    const rawRow = {
      id: 'x', plan: 'BASIC',
      stripeSubscriptionId: 'sub_x', payseraOrderId: 'ord_x',
      metadata: { foo: 1 }, retryAttempt: 2,
    };
    const leaks = findForbiddenInternalKeys(rawRow, '$');
    expect(leaks.some((l) => l.includes('stripeSubscriptionId'))).toBe(true);
    expect(leaks.some((l) => l.includes('payseraOrderId'))).toBe(true);
    expect(leaks.some((l) => l.includes('metadata'))).toBe(true);
    expect(leaks.some((l) => l.includes('retryAttempt'))).toBe(true);
  });

  it('[teeth] findForbiddenInternalKeys does NOT flag the projected safe shape (no false positive)', () => {
    const safe = {
      id: 'x', plan: 'BASIC', status: 'ACTIVE',
      currentPeriodEnd: new Date().toISOString(), autoRenewal: true,
    };
    const leaks = findForbiddenInternalKeys(safe, '$');
    expect(leaks).toEqual([]);
  });

  it('[teeth] findForbiddenInternalKeys does NOT flag null/empty metadata (no false positive)', () => {
    expect(findForbiddenInternalKeys({ id: 'x', metadata: null }, '$')).toEqual([]);
    expect(findForbiddenInternalKeys({ id: 'x', metadata: '' }, '$')).toEqual([]);
  });
});
