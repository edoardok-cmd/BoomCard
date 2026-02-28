/**
 * Plan Seed Data
 * Seeds the Plan table with pricing data (SOURCE OF TRUTH)
 *
 * Run with: DATABASE_URL=xxx npx tsx prisma/seed-plans.ts
 */

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Only load .env if DATABASE_URL is not already set
if (!process.env.DATABASE_URL) {
  const envPath = path.join(__dirname, '..', '.env');
  console.log('Loading .env from:', envPath);
  dotenv.config({ path: envPath });
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL not found.');
  process.exit(1);
}

console.log('DATABASE_URL found:', databaseUrl.substring(0, 30) + '...');

// Create neon SQL client
const sql = neon(databaseUrl);

const plans = [
  {
    planCode: 'LIGHT',
    displayName: 'Lite Premium',
    displayNameBg: 'Лайт Премиум',
    priceWeeklyEur: 499,
    priceMonthlyEur: null,
    priceYearlyEur: 5200,
    cashbackRate: 0.20,
    stickerBonus: 0,
    features: JSON.stringify([
      'One week Premium access',
      'Up to 20% discount',
      'Exclusive Premium offers',
      'VIP priority support',
      'Cashback via the app',
    ]),
    featuresBg: JSON.stringify([
      'Едноседмичен Premium достъп',
      'До 20% отстъпка',
      'Ексклузивни Premium оферти',
      'VIP приоритетна поддръжка',
      'Връщане на пари чрез приложението',
    ]),
    cardType: 'light',
    isFeatured: false,
    badgeText: 'Most Bought',
    badgeTextBg: 'Най-купуван',
    displayOrder: 1,
    hasWeeklyOption: true,
    hasMonthlyOption: false,
    hasYearlyOption: true,
    yearlyDiscountPct: 0,
  },
  {
    planCode: 'BASIC',
    displayName: 'Basic',
    displayNameBg: 'Основен',
    priceWeeklyEur: null,
    priceMonthlyEur: 799,
    priceYearlyEur: 8400,
    cashbackRate: 0.10,
    stickerBonus: 0,
    features: JSON.stringify([
      'One month access',
      'Up to 10% discount',
      'Cashback via the app',
      'Access to partner offers',
      'Standard support',
    ]),
    featuresBg: JSON.stringify([
      'Едномесечен достъп',
      'До 10% отстъпка',
      'Връщане на пари чрез приложението',
      'Достъп до партньорски оферти',
      'Стандартна поддръжка',
    ]),
    cardType: 'silver',
    isFeatured: false,
    badgeText: null,
    badgeTextBg: null,
    displayOrder: 2,
    hasWeeklyOption: false,
    hasMonthlyOption: true,
    hasYearlyOption: true,
    yearlyDiscountPct: 20,
  },
  {
    planCode: 'PREMIUM',
    displayName: 'Premium',
    displayNameBg: 'Премиум',
    priceWeeklyEur: null,
    priceMonthlyEur: 1299,
    priceYearlyEur: 13600,
    cashbackRate: 0.20,
    stickerBonus: 0.05,
    features: JSON.stringify([
      'One month Premium access',
      'Up to 20% discount',
      'Exclusive Premium offers',
      'VIP priority support',
      'Cashback via the app',
      'Additional sticker bonus',
    ]),
    featuresBg: JSON.stringify([
      'Едномесечен Premium достъп',
      'До 20% отстъпка',
      'Ексклузивни Premium оферти',
      'VIP приоритетна поддръжка',
      'Връщане на пари чрез приложението',
      'Допълнителен бонус от стикери',
    ]),
    cardType: 'black',
    isFeatured: true,
    badgeText: 'Most Popular',
    badgeTextBg: 'Най-популярен',
    displayOrder: 3,
    hasWeeklyOption: false,
    hasMonthlyOption: true,
    hasYearlyOption: true,
    yearlyDiscountPct: 20,
  },
];

async function seedPlans() {
  console.log('🌱 Seeding plans...');

  for (const plan of plans) {
    // Use ON CONFLICT for upsert
    await sql`
      INSERT INTO plans (
        id,
        "planCode",
        "displayName",
        "displayNameBg",
        "priceWeeklyEur",
        "priceMonthlyEur",
        "priceYearlyEur",
        "cashbackRate",
        "stickerBonus",
        features,
        "featuresBg",
        "cardType",
        "isFeatured",
        "badgeText",
        "badgeTextBg",
        "displayOrder",
        "hasWeeklyOption",
        "hasMonthlyOption",
        "hasYearlyOption",
        "yearlyDiscountPct",
        "isActive",
        "createdAt",
        "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        ${plan.planCode},
        ${plan.displayName},
        ${plan.displayNameBg},
        ${plan.priceWeeklyEur},
        ${plan.priceMonthlyEur},
        ${plan.priceYearlyEur},
        ${plan.cashbackRate},
        ${plan.stickerBonus},
        ${plan.features},
        ${plan.featuresBg},
        ${plan.cardType},
        ${plan.isFeatured},
        ${plan.badgeText},
        ${plan.badgeTextBg},
        ${plan.displayOrder},
        ${plan.hasWeeklyOption},
        ${plan.hasMonthlyOption},
        ${plan.hasYearlyOption},
        ${plan.yearlyDiscountPct},
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT ("planCode") DO UPDATE SET
        "displayName" = EXCLUDED."displayName",
        "displayNameBg" = EXCLUDED."displayNameBg",
        "priceWeeklyEur" = EXCLUDED."priceWeeklyEur",
        "priceMonthlyEur" = EXCLUDED."priceMonthlyEur",
        "priceYearlyEur" = EXCLUDED."priceYearlyEur",
        "cashbackRate" = EXCLUDED."cashbackRate",
        "stickerBonus" = EXCLUDED."stickerBonus",
        features = EXCLUDED.features,
        "featuresBg" = EXCLUDED."featuresBg",
        "cardType" = EXCLUDED."cardType",
        "isFeatured" = EXCLUDED."isFeatured",
        "badgeText" = EXCLUDED."badgeText",
        "badgeTextBg" = EXCLUDED."badgeTextBg",
        "displayOrder" = EXCLUDED."displayOrder",
        "hasWeeklyOption" = EXCLUDED."hasWeeklyOption",
        "hasMonthlyOption" = EXCLUDED."hasMonthlyOption",
        "hasYearlyOption" = EXCLUDED."hasYearlyOption",
        "yearlyDiscountPct" = EXCLUDED."yearlyDiscountPct",
        "updatedAt" = NOW()
    `;

    console.log(`  ✅ ${plan.planCode}: ${plan.displayName} - €${(plan.priceMonthlyEur || plan.priceWeeklyEur || 0) / 100}/period`);
  }

  console.log('✨ Plans seeded successfully!');
}

// Run
seedPlans()
  .catch((error) => {
    console.error('❌ Error seeding plans:', error);
    process.exit(1);
  });

export { seedPlans };
