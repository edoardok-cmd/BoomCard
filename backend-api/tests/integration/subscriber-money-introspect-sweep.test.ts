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

// The full deduplicated set of GET routes, built in beforeAll (NO scope filter).
let allGetRoutes: EnumeratedRoute[] = [];

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
  for (const r of all) {
    if (r.method !== 'GET') continue;
    const key = `${r.method} ${r.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    allGetRoutes.push(r);
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
