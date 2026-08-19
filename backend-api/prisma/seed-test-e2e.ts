/**
 * E2E test seeder — creates the fixtures the QR/receipt/cashback Playwright suite relies on.
 *
 * Run with:
 *   DATABASE_URL=<test-db> npx ts-node --transpile-only prisma/seed-test-e2e.ts
 *
 * Idempotent: safe to re-run.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const PASSWORD = 'TestPass1!';
const DISCOUNT_STEPS = [5, 10, 15, 20, 25] as const;

// Sofia, Bulgaria — used for every test venue
const VENUE_LAT = 42.6977;
const VENUE_LNG = 23.3219;

// "Bar" — real venue at ул. 6-ти септември 10А, Sofia. Used by the proximity + time
// spec that exercises real receipt photos from that location.
const BAR_LAT = 42.69340;
const BAR_LNG = 23.32620;
const BAR_DISCOUNT_PCT = 15;
const BAR_STICKER_ID = 'BAR-6SEP-T1';

type PlanCode = 'PREMIUM_WEEKLY' | 'BASIC' | 'PREMIUM_MONTHLY';

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

async function upsertUser(
  email: string,
  firstName: string,
  lastName: string,
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN' = 'USER',
  cardType: 'PREMIUM_WEEKLY' | 'BASIC' | 'PREMIUM' = 'PREMIUM_WEEKLY'
) {
  const passwordHash = await hash(PASSWORD);
  const user = await prisma.user.upsert({
    where: { email },
    update: { role, status: 'ACTIVE', emailVerified: true },
    create: { email, passwordHash, firstName, lastName, role, status: 'ACTIVE', emailVerified: true },
  });
  await prisma.wallet.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
  const existingCard = await prisma.card.findFirst({ where: { userId: user.id } });
  if (existingCard) {
    await prisma.card.update({ where: { id: existingCard.id }, data: { type: cardType as any } });
  } else {
    await prisma.card.create({
      data: {
        userId: user.id,
        cardNumber: `TEST-${user.id.slice(0, 8)}`,
        type: cardType as any,
        status: 'ACTIVE',
        qrCode: `data:image/png;base64,TEST`,
      },
    });
  }
  return user;
}

async function ensureSubscription(userId: string, plan: PlanCode, active = true) {
  const now = new Date();
  const end = new Date(now.getTime() + (active ? 30 : -30) * 24 * 3600 * 1000);
  const planRecord = await prisma.plan.findFirst({ where: { planCode: plan } });
  const existing = await prisma.subscription.findFirst({ where: { userId, plan: plan as any } });
  const status = (active ? 'ACTIVE' : 'CANCELLED') as any;
  if (existing) {
    await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        status,
        currentPeriodStart: now,
        currentPeriodEnd: end,
        planId: planRecord?.id,
      },
    });
  } else {
    await prisma.subscription.create({
      data: {
        userId,
        plan: plan as any,
        status,
        currentPeriodStart: now,
        currentPeriodEnd: end,
        planId: planRecord?.id,
      },
    });
  }
}

async function seedPlans() {
  const plans = [
    { planCode: 'PREMIUM_WEEKLY', displayName: 'Premium Weekly', priceWeeklyEur: 699, cashbackRate: 0.20, hasWeeklyOption: true, hasMonthlyOption: false, hasYearlyOption: false },
    { planCode: 'BASIC', displayName: 'Basic', priceMonthlyEur: 899, cashbackRate: 0.10, hasMonthlyOption: true, hasYearlyOption: true },
    { planCode: 'PREMIUM_MONTHLY', displayName: 'Premium', priceMonthlyEur: 1399, cashbackRate: 0.20, hasMonthlyOption: true, hasYearlyOption: true, stickerBonus: 0.05 },
  ];
  for (const p of plans) {
    await prisma.plan.upsert({
      where: { planCode: p.planCode },
      update: { displayName: p.displayName, cashbackRate: p.cashbackRate },
      create: {
        planCode: p.planCode,
        displayName: p.displayName,
        priceWeeklyEur: (p as any).priceWeeklyEur ?? 0,
        priceMonthlyEur: (p as any).priceMonthlyEur ?? 0,
        priceYearlyEur: 0,
        cashbackRate: p.cashbackRate,
        stickerBonus: (p as any).stickerBonus ?? 0,
        features: '[]',
        cardType: p.planCode.toLowerCase(),
        hasWeeklyOption: (p as any).hasWeeklyOption ?? false,
        hasMonthlyOption: (p as any).hasMonthlyOption ?? false,
        hasYearlyOption: (p as any).hasYearlyOption ?? false,
        yearlyDiscountPct: 20,
        isActive: true,
      },
    });
  }
  console.log('  ✓ plans');
}

async function seedCashbackRates() {
  const count = await prisma.cashbackRate.count();
  if (count >= 5) { console.log('  ✓ cashback rates (existing)'); return; }
  const rates = [
    { discountStep: 5, basic: 5, premium: 5 },
    { discountStep: 10, basic: 5, premium: 8 },
    { discountStep: 15, basic: 8, premium: 12 },
    { discountStep: 20, basic: 10, premium: 16 },
    { discountStep: 25, basic: 10, premium: 20 },
  ];
  await prisma.cashbackRate.createMany({
    data: rates.map(r => ({ ...r, effectiveFrom: new Date('2024-01-01'), notes: 'test-seed' })),
  });
  console.log('  ✓ cashback rates');
}

async function seedPartnerType() {
  return prisma.partnerType.upsert({
    where: { name: 'TEST_OPEN' },
    update: { maxDiscountRate: 25, isActive: true },
    create: { name: 'TEST_OPEN', maxDiscountRate: 25, isActive: true, sortOrder: 0 },
  });
}

async function seedPlanTypeAccess(partnerTypeId: string) {
  const plans: PlanCode[] = ['BASIC', 'PREMIUM_MONTHLY', 'PREMIUM_WEEKLY'];
  // adapter-pg quirk with enum compound-unique upsert: drop + recreate instead
  await prisma.planTypeAccess.deleteMany({ where: { partnerTypeId } });
  await prisma.planTypeAccess.createMany({
    data: plans.map(plan => ({ plan: plan as any, partnerTypeId, canView: true, canRedeem: true })),
  });
}

async function seedVenueForDiscount(step: number, partnerTypeId: string) {
  const email = `partner-${step}pct@test.local`;
  const partnerUser = await upsertUser(email, `Partner${step}`, 'Test');
  const partner = await prisma.partner.upsert({
    where: { userId: partnerUser.id },
    update: { discountRate: step, partnerTypeId, status: 'ACTIVE' },
    create: {
      userId: partnerUser.id,
      businessName: `Test Venue ${step}%`,
      category: 'Restaurant',
      discountRate: step,
      partnerTypeId,
      status: 'ACTIVE',
      city: 'Sofia',
      latitude: VENUE_LAT,
      longitude: VENUE_LNG,
    },
  });
  const venueName = `Test Venue ${step}%`;
  let venue = await prisma.venue.findFirst({ where: { name: venueName, partnerId: partner.id } });
  if (!venue) {
    venue = await prisma.venue.create({
      data: {
        partnerId: partner.id,
        name: venueName,
        address: `${step} Test St`,
        city: 'Sofia',
        latitude: VENUE_LAT,
        longitude: VENUE_LNG,
      },
    });
  }
  await prisma.venueStickerConfig.upsert({
    where: { venueId: venue.id },
    update: {
      cashbackPercent: step,
      gpsRadiusMeters: 500,
      gpsVerificationEnabled: true,
      isActive: true,
      minBillAmount: 0,
      maxCashbackPerScan: null,
    },
    create: {
      venueId: venue.id,
      cashbackPercent: step,
      gpsRadiusMeters: 500,
      gpsVerificationEnabled: true,
      isActive: true,
    },
  });

  // Sticker location + Sticker
  let loc = await prisma.stickerLocation.findFirst({ where: { venueId: venue.id, locationNumber: '1', locationType: 'TABLE' } });
  if (!loc) {
    loc = await prisma.stickerLocation.create({
      data: { venueId: venue.id, name: 'Table 1', locationNumber: '1', locationType: 'TABLE' },
    });
  }
  const stickerIdShort = `V${step}PCT-T1`;
  const qrJson = JSON.stringify({
    type: 'BOOM_STICKER',
    stickerId: stickerIdShort,
    venueId: venue.id,
    locationId: loc.id,
    locationType: 'TABLE',
    version: '1.0',
  });
  const existing = await prisma.sticker.findFirst({ where: { stickerId: stickerIdShort } });
  if (!existing) {
    await prisma.sticker.create({
      data: {
        venueId: venue.id,
        locationId: loc.id,
        stickerId: stickerIdShort,
        qrCode: qrJson,
        locationType: 'TABLE',
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });
  } else {
    await prisma.sticker.update({
      where: { id: existing.id },
      data: { qrCode: qrJson, status: 'ACTIVE' },
    });
  }
  return { venue, stickerId: stickerIdShort, qrPayload: qrJson };
}

/**
 * Seeds the real "Bar" venue used by the proximity + time-limit spec. Uses a deliberately
 * tight 100m GPS radius so the tests can exercise accept/reject bands with meaningful
 * coordinate deltas. Discount is 15% — a middle-of-the-matrix rate — so cashback maths
 * still exercises the per-plan lookup.
 */
async function seedBarVenue(partnerTypeId: string) {
  const email = 'partner-bar@test.local';
  const partnerUser = await upsertUser(email, 'Bar', 'Owner');
  // Give the partner + venue distinctive names so the merchant-verification fuzzy
  // matcher has a meaningful token to compare against (generic names like literal
  // "Bar" are stopwords and disable the MERCHANT_MISMATCH signal entirely).
  const partner = await prisma.partner.upsert({
    where: { userId: partnerUser.id },
    update: { discountRate: BAR_DISCOUNT_PCT, partnerTypeId, status: 'ACTIVE', businessName: 'Shakespeare Hospitality EOOD' },
    create: {
      userId: partnerUser.id,
      businessName: 'Shakespeare Hospitality EOOD',
      category: 'Bar',
      discountRate: BAR_DISCOUNT_PCT,
      partnerTypeId,
      status: 'ACTIVE',
      city: 'Sofia',
      latitude: BAR_LAT,
      longitude: BAR_LNG,
    },
  });
  let venue = await prisma.venue.findFirst({ where: { partnerId: partner.id } });
  if (!venue) {
    venue = await prisma.venue.create({
      data: {
        partnerId: partner.id,
        name: 'Shakespeare Bar',
        address: 'ул. 6-ти септември 10А',
        city: 'Sofia',
        latitude: BAR_LAT,
        longitude: BAR_LNG,
      },
    });
  } else if (venue.name === 'Bar') {
    venue = await prisma.venue.update({ where: { id: venue.id }, data: { name: 'Shakespeare Bar' } });
  }
  await prisma.venueStickerConfig.upsert({
    where: { venueId: venue.id },
    update: {
      cashbackPercent: BAR_DISCOUNT_PCT,
      gpsRadiusMeters: 100, // tight radius for proximity tests
      gpsVerificationEnabled: true,
      isActive: true,
      minBillAmount: 0,
      maxCashbackPerScan: null,
    },
    create: {
      venueId: venue.id,
      cashbackPercent: BAR_DISCOUNT_PCT,
      gpsRadiusMeters: 100,
      gpsVerificationEnabled: true,
      isActive: true,
    },
  });
  let loc = await prisma.stickerLocation.findFirst({
    where: { venueId: venue.id, locationNumber: '1', locationType: 'TABLE' },
  });
  if (!loc) {
    loc = await prisma.stickerLocation.create({
      data: { venueId: venue.id, name: 'Table 1', locationNumber: '1', locationType: 'TABLE' },
    });
  }
  const qrJson = JSON.stringify({
    type: 'BOOM_STICKER',
    stickerId: BAR_STICKER_ID,
    venueId: venue.id,
    locationId: loc.id,
    locationType: 'TABLE',
    version: '1.0',
  });
  const existing = await prisma.sticker.findFirst({ where: { stickerId: BAR_STICKER_ID } });
  if (!existing) {
    await prisma.sticker.create({
      data: {
        venueId: venue.id,
        locationId: loc.id,
        stickerId: BAR_STICKER_ID,
        qrCode: qrJson,
        locationType: 'TABLE',
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });
  } else {
    await prisma.sticker.update({ where: { id: existing.id }, data: { qrCode: qrJson, status: 'ACTIVE' } });
  }
  return { venue, stickerId: BAR_STICKER_ID, qrPayload: qrJson };
}

async function main() {
  console.log('🌱 Seeding test fixtures...');

  await seedPlans();
  await seedCashbackRates();
  const partnerType = await seedPartnerType();
  await seedPlanTypeAccess(partnerType.id);

  // Test users per plan — Card.type must mirror Subscription.plan because the cashback
  // engine keys off Card.type (see sticker.service.ts:438). FREE gets PREMIUM_WEEKLY card by default
  // since the schema requires a type, but FREE users have no active subscription.
  const users = {
    free:    await upsertUser('free@test.local', 'Free', 'User', 'USER', 'PREMIUM_WEEKLY'),
    basic:   await upsertUser('basic@test.local', 'Basic', 'User', 'USER', 'BASIC'),
    premium: await upsertUser('premium@test.local', 'Premium', 'User', 'USER', 'PREMIUM'),
    light:   await upsertUser('light@test.local', 'Light', 'User', 'USER', 'PREMIUM_WEEKLY'),
    expired: await upsertUser('expired@test.local', 'Expired', 'User', 'USER', 'PREMIUM'),
    admin:   await upsertUser('admin@test.local', 'Admin', 'User', 'SUPER_ADMIN', 'PREMIUM_WEEKLY'),
  };
  await ensureSubscription(users.basic.id, 'BASIC', true);
  await ensureSubscription(users.premium.id, 'PREMIUM_MONTHLY', true);
  await ensureSubscription(users.light.id, 'PREMIUM_WEEKLY', true);
  await ensureSubscription(users.expired.id, 'PREMIUM_MONTHLY', false);
  console.log('  ✓ users + subscriptions');

  // Venues per discount tier
  const venues: Record<number, { venueId: string; stickerId: string; qrPayload: string }> = {} as any;
  for (const step of DISCOUNT_STEPS) {
    const v = await seedVenueForDiscount(step, partnerType.id);
    venues[step] = { venueId: v.venue.id, stickerId: v.stickerId, qrPayload: v.qrPayload };
  }
  console.log('  ✓ venues + stickers for steps:', DISCOUNT_STEPS.join(', '));

  const bar = await seedBarVenue(partnerType.id);
  console.log(`  ✓ Bar venue at (${BAR_LAT}, ${BAR_LNG}) with sticker ${BAR_STICKER_ID}`);

  // Dump a fixtures.json so Playwright tests can read IDs
  const fixtures = {
    password: PASSWORD,
    users: Object.fromEntries(
      Object.entries(users).map(([k, u]) => [k, { id: u.id, email: u.email }])
    ),
    venues,
    venueCoords: { lat: VENUE_LAT, lng: VENUE_LNG },
    bar: {
      venueId: bar.venue.id,
      stickerId: bar.stickerId,
      qrPayload: bar.qrPayload,
      lat: BAR_LAT,
      lng: BAR_LNG,
      gpsRadiusMeters: 100,
      address: 'ул. 6-ти септември 10А, София',
    },
  };
  const fs = await import('fs');
  const path = await import('path');
  const out = path.join(__dirname, '..', '..', 'boomcard-mobile', 'e2e', 'fixtures', 'seeded.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(fixtures, null, 2));
  console.log(`  ✓ wrote ${out}`);

  console.log('✨ Test fixtures ready.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
