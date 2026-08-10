/**
 * BoomCard Database Seed Script
 * Populates the database with sample offers for development
 */

import dotenv from 'dotenv';

// Load .env early
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { seedPermissions } from '../src/services/permission.service';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL not found in environment.');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Step 1: Seed RBAC permissions and roles (CRITICAL: must run before creating admin users)
  console.log('⚙️  Seeding permissions and admin roles...');
  await seedPermissions();
  console.log('✅ Permissions and roles seeded.\n');

  // Create admin user
  console.log('👤 Creating admin user...');

  // Generate proper bcrypt hash for password "admin123"
  // In production, use a strong password and hash it properly
  const bcrypt = require('bcryptjs');
  const adminPasswordHash = await bcrypt.hash('admin123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email_role: { email: 'admin@boomcard.bg', role: 'SUPER_ADMIN' } },
    update: {},
    create: {
      email: 'admin@boomcard.bg',
      passwordHash: adminPasswordHash,
      firstName: 'Admin',
      lastName: 'User',
      phone: '+359 2 999 9999',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  console.log(`✅ Admin user created: ${adminUser.email}`);
  console.log(`   Role: ${adminUser.role}`);
  console.log(`   Password: admin123 ⚠️  CHANGE THIS IN PRODUCTION!\n`);

  // Create sample users for partners
  console.log('📝 Creating sample partner users...');

  // Generate proper bcrypt hash for password "partner123" (same for all demo partners)
  const partnerPasswordHash = await bcrypt.hash('partner123', 10);

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email_role: { email: 'grandhotel@boomcard.bg', role: 'PARTNER' } },
      update: {},
      create: {
        email: 'grandhotel@boomcard.bg',
        passwordHash: partnerPasswordHash,
        firstName: 'Grand',
        lastName: 'Hotel',
        phone: '+359 2 123 4567',
        role: 'PARTNER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    }),
    prisma.user.upsert({
      where: { email_role: { email: 'winedine@boomcard.bg', role: 'PARTNER' } },
      update: {},
      create: {
        email: 'winedine@boomcard.bg',
        passwordHash: partnerPasswordHash,
        firstName: 'Wine',
        lastName: 'Dine',
        phone: '+359 2 234 5678',
        role: 'PARTNER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    }),
    prisma.user.upsert({
      where: { email_role: { email: 'sparetreat@boomcard.bg', role: 'PARTNER' } },
      update: {},
      create: {
        email: 'sparetreat@boomcard.bg',
        passwordHash: partnerPasswordHash,
        firstName: 'Spa',
        lastName: 'Retreat',
        phone: '+359 749 123456',
        role: 'PARTNER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    }),
    prisma.user.upsert({
      where: { email_role: { email: 'skyadventures@boomcard.bg', role: 'PARTNER' } },
      update: {},
      create: {
        email: 'skyadventures@boomcard.bg',
        passwordHash: partnerPasswordHash,
        firstName: 'Sky',
        lastName: 'Adventures',
        phone: '+359 888 123456',
        role: 'PARTNER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    }),
    prisma.user.upsert({
      where: { email_role: { email: 'beachfront@boomcard.bg', role: 'PARTNER' } },
      update: {},
      create: {
        email: 'beachfront@boomcard.bg',
        passwordHash: partnerPasswordHash,
        firstName: 'Beachfront',
        lastName: 'Hotel',
        phone: '+359 52 123456',
        role: 'PARTNER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    }),
    prisma.user.upsert({
      where: { email_role: { email: 'villamelnik@boomcard.bg', role: 'PARTNER' } },
      update: {},
      create: {
        email: 'villamelnik@boomcard.bg',
        passwordHash: partnerPasswordHash,
        firstName: 'Villa',
        lastName: 'Melnik',
        phone: '+359 743 123456',
        role: 'PARTNER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    }),
  ]);

  console.log(`✅ Created ${users.length} partner users`);
  console.log(`   All partner passwords: partner123 ⚠️  CHANGE THIS IN PRODUCTION!\n`);

  // Create sample partners
  console.log('🏢 Creating sample partners...');

  const partners = await Promise.all([
    prisma.partner.upsert({
      where: { userId: users[0].id },
      update: {},
      create: {
        userId: users[0].id,
        businessName: 'Grand Hotel Sofia',
        businessNameBg: 'Гранд Хотел София',
        category: 'Hotels',
        description: 'Luxury hotel in the heart of Sofia',
        descriptionBg: 'Луксозен хотел в сърцето на София',
        status: 'ACTIVE',
        rating: 4.8,
        reviewCount: 156,
        city: 'Sofia',
        phone: '+359 2 123 4567',
        email: 'contact@grandhotelsofia.bg',
      },
    }),
    prisma.partner.upsert({
      where: { userId: users[1].id },
      update: {},
      create: {
        userId: users[1].id,
        businessName: 'Wine & Dine Restaurant',
        businessNameBg: 'Ресторант Wine & Dine',
        category: 'Restaurants',
        description: 'Fine dining with premium wine selection',
        descriptionBg: 'Изискана кухня с премиум винена селекция',
        status: 'ACTIVE',
        rating: 4.7,
        reviewCount: 234,
        city: 'Sofia',
        phone: '+359 2 234 5678',
        email: 'info@wineanddine.bg',
      },
    }),
    prisma.partner.upsert({
      where: { userId: users[2].id },
      update: {},
      create: {
        userId: users[2].id,
        businessName: 'Spa Retreat Bansko',
        businessNameBg: 'Спа Ритрийт Банско',
        category: 'Spa',
        description: 'Premium spa and wellness center',
        descriptionBg: 'Премиум спа и уелнес център',
        status: 'ACTIVE',
        rating: 4.9,
        reviewCount: 89,
        city: 'Bansko',
        phone: '+359 749 123456',
        email: 'info@sparetreat.bg',
      },
    }),
    prisma.partner.upsert({
      where: { userId: users[3].id },
      update: {},
      create: {
        userId: users[3].id,
        businessName: 'Sky Adventures',
        businessNameBg: 'Скай Адвенчърс',
        category: 'Experiences',
        description: 'Paragliding and extreme sports',
        descriptionBg: 'Парапланеризъм и екстремни спортове',
        status: 'ACTIVE',
        rating: 4.8,
        reviewCount: 167,
        city: 'Rila',
        phone: '+359 888 123456',
        email: 'contact@skyadventures.bg',
      },
    }),
    prisma.partner.upsert({
      where: { userId: users[4].id },
      update: {},
      create: {
        userId: users[4].id,
        businessName: 'Beachfront Hotel Varna',
        businessNameBg: 'Крайбрежен Хотел Варна',
        category: 'Hotels',
        description: 'Luxury beachfront accommodation',
        descriptionBg: 'Луксозно крайбрежно настаняване',
        status: 'ACTIVE',
        rating: 4.6,
        reviewCount: 203,
        city: 'Varna',
        phone: '+359 52 123456',
        email: 'info@beachfrontvarna.bg',
      },
    }),
    prisma.partner.upsert({
      where: { userId: users[5].id },
      update: {},
      create: {
        userId: users[5].id,
        businessName: 'Villa Melnik Winery',
        businessNameBg: 'Вила Мелник Винарна',
        category: 'Wineries',
        description: 'Premium Bulgarian wines and tastings',
        descriptionBg: 'Премиум български вина и дегустации',
        status: 'ACTIVE',
        rating: 4.9,
        reviewCount: 178,
        city: 'Melnik',
        phone: '+359 743 123456',
        email: 'info@villamelnik.bg',
      },
    }),
  ]);

  console.log(`✅ Created ${partners.length} partners\n`);

  // Create sample offers
  console.log('🎁 Creating sample offers...');

  const now = new Date();
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 6);

  const offerSpecs = [
    {
      partnerId: partners[0].id,
      title: 'Luxury Suite with Breakfast',
      titleBg: 'Луксозен Апартамент със Закуска',
      description: 'Experience luxury at its finest with our premium suite including complimentary breakfast for two, spa access, and stunning city views.',
      descriptionBg: 'Изживейте лукс на най-високо ниво с нашия премиум апартамент с включена закуска за двама, достъп до спа и зашеметяваща градска гледка.',
      type: 'DISCOUNT',
      discountPercent: 50,
      minPurchase: 400,
      image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
      status: 'ACTIVE',
      isFeatured: true,
      featuredOrder: 1,
      startDate: now,
      endDate: futureDate,
      usageLimit: 100,
    },
    {
      partnerId: partners[2].id,
      title: 'Full Day Spa Package',
      titleBg: 'Целодневен Спа Пакет',
      description: 'Relax and rejuvenate with our premium spa package including massage, sauna, thermal pools, and aromatherapy.',
      descriptionBg: 'Релаксирайте и се подмладете с нашия премиум спа пакет включващ масаж, сауна, термални басейни и ароматерапия.',
      type: 'DISCOUNT',
      discountPercent: 45,
      minPurchase: 180,
      image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800',
      status: 'ACTIVE',
      isFeatured: true,
      featuredOrder: 2,
      startDate: now,
      endDate: futureDate,
      usageLimit: 50,
    },
    {
      partnerId: partners[5].id,
      title: 'Premium Wine Tasting Experience',
      titleBg: 'Премиум Дегустация на Вино',
      description: 'Sample our finest Bulgarian wines paired with local cheeses and charcuterie in our historic wine cellar.',
      descriptionBg: 'Опитайте нашите най-добри български вина съчетани с местни сирена и деликатеси в нашата историческа винарска изба.',
      type: 'DISCOUNT',
      discountPercent: 40,
      minPurchase: 120,
      image: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800',
      status: 'ACTIVE',
      isFeatured: true,
      featuredOrder: 3,
      startDate: now,
      endDate: futureDate,
      usageLimit: 80,
    },
    {
      partnerId: partners[1].id,
      title: 'Gourmet Dinner for Two',
      titleBg: 'Гурме Вечеря за Двама',
      description: 'Indulge in a 5-course tasting menu expertly paired with premium wines selected by our sommelier.',
      descriptionBg: '5-курсово дегустационно меню майсторски съчетано с премиум вина подбрани от нашия сомелиер.',
      type: 'DISCOUNT',
      discountPercent: 35,
      minPurchase: 250,
      image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
      status: 'ACTIVE',
      isFeatured: true,
      featuredOrder: 4,
      startDate: now,
      endDate: futureDate,
      usageLimit: 60,
    },
    {
      partnerId: partners[3].id,
      title: 'Paragliding Adventure',
      titleBg: 'Парапланерно Приключение',
      description: 'Soar through the skies above the stunning Rila Mountains with our experienced instructors. Includes photos and video.',
      descriptionBg: 'Излетете в небето над зашеметяващите Рилски планини с нашите опитни инструктори. Включва снимки и видео.',
      type: 'DISCOUNT',
      discountPercent: 30,
      minPurchase: 150,
      image: 'https://images.unsplash.com/photo-1534787238916-9ba6764efd4f?w=800',
      status: 'ACTIVE',
      isFeatured: true,
      featuredOrder: 5,
      startDate: now,
      endDate: futureDate,
      usageLimit: 40,
    },
    {
      partnerId: partners[4].id,
      title: 'Romantic Beachfront Suite',
      titleBg: 'Романтичен Апартамент на Плажа',
      description: 'Wake up to spectacular ocean views in our exclusive beachfront suite with private balcony and champagne breakfast.',
      descriptionBg: 'Събудете се с впечатляваща гледка към океана в нашия ексклузивен апартамент на плажа с частен балкон и закуска с шампанско.',
      type: 'DISCOUNT',
      discountPercent: 35,
      minPurchase: 300,
      image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800',
      status: 'ACTIVE',
      isFeatured: true,
      featuredOrder: 6,
      startDate: now,
      endDate: futureDate,
      usageLimit: 30,
    },
    {
      partnerId: partners[0].id,
      title: 'Weekend Getaway Package',
      titleBg: 'Уикенд Пакет',
      description: '2 nights accommodation with breakfast and spa access',
      descriptionBg: '2 нощувки с включена закуска и достъп до спа',
      type: 'BUNDLE',
      discountPercent: 25,
      minPurchase: 500,
      image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
      status: 'ACTIVE',
      startDate: now,
      endDate: futureDate,
    },
    {
      partnerId: partners[1].id,
      title: 'Business Lunch Special',
      titleBg: 'Специална Бизнес Закуска',
      description: '3-course lunch menu with coffee',
      descriptionBg: '3-курсово обедно меню с кафе',
      type: 'DISCOUNT',
      discountPercent: 20,
      minPurchase: 50,
      image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
      status: 'ACTIVE',
      startDate: now,
      endDate: futureDate,
    },
  ];

  // Create offers with idempotency via query-before-create pattern
  // (Offer has no natural unique key for upsert; instead, check existence by partnerId + title composite)
  const offers = [];
  for (const spec of offerSpecs) {
    const existingOffer = await prisma.offer.findFirst({
      where: {
        partnerId: spec.partnerId,
        title: spec.title,
      },
    });
    if (!existingOffer) {
      const offer = await prisma.offer.create({ data: spec });
      offers.push(offer);
    }
  }

  console.log(`✅ Created ${offers.length} offers\n`);

  // Create sample subscription plans
  console.log('📋 Creating subscription plans...');

  const plans = await Promise.all([
    prisma.plan.upsert({
      where: { planCode: 'BASIC' },
      update: {},
      create: {
        planCode: 'BASIC',
        displayName: 'Basic',
        displayNameBg: 'Основен',
        priceMonthlyEur: 0,
        priceYearlyEur: 0,
        cashbackRate: 2.0,
        stickerBonus: 0,
        features: JSON.stringify(['Cashback rewards', 'Receipt verification', 'Basic support']),
        featuresBg: JSON.stringify(['Кешбек награди', 'Верификация на касови бележки', 'Основна поддръжка']),
        cardType: 'silver',
        hasMonthlyOption: true,
        hasYearlyOption: true,
        isActive: true,
        displayOrder: 1,
      },
    }),
    prisma.plan.upsert({
      where: { planCode: 'PREMIUM_MONTHLY' },
      update: {},
      create: {
        planCode: 'PREMIUM_MONTHLY',
        displayName: 'Premium',
        displayNameBg: 'Премиум',
        priceMonthlyEur: 999, // 9.99 EUR in cents
        priceYearlyEur: 9990, // 99.90 EUR in cents (10% discount)
        cashbackRate: 5.0,
        stickerBonus: 1.0,
        features: JSON.stringify(['Enhanced cashback', 'Priority support', 'Exclusive offers', 'Monthly bonus']),
        featuresBg: JSON.stringify(['Подобрен кешбек', 'Приоритетна поддръжка', 'Екскулузивни оферти', 'Месечен бонус']),
        cardType: 'silver',
        isFeatured: true,
        hasMonthlyOption: true,
        hasYearlyOption: true,
        yearlyDiscountPct: 17,
        isActive: true,
        displayOrder: 2,
      },
    }),
    prisma.plan.upsert({
      where: { planCode: 'PREMIUM_WEEKLY' },
      update: {},
      create: {
        planCode: 'PREMIUM_WEEKLY',
        displayName: 'Premium Weekly',
        displayNameBg: 'Премиум Седмичен',
        priceWeeklyEur: 299, // 2.99 EUR in cents
        priceYearlyEur: 15180, // 151.80 EUR annually
        cashbackRate: 5.0,
        stickerBonus: 1.0,
        features: JSON.stringify(['Enhanced cashback', 'Priority support', 'Weekly exclusive deals']),
        featuresBg: JSON.stringify(['Подобрен кешбек', 'Приоритетна поддръжка', 'Седмични екскулузивни оферти']),
        cardType: 'silver',
        hasWeeklyOption: true,
        isActive: true,
        displayOrder: 3,
      },
    }),
  ]);

  console.log(`✅ Created ${plans.length} subscription plans\n`);

  // Verify plan features JSON format
  console.log('✔️  Validating plan features JSON format...');
  for (const plan of plans) {
    try {
      const features = JSON.parse(plan.features || '[]');
      const featuresBg = JSON.parse(plan.featuresBg || '[]');
      if (!Array.isArray(features) || !Array.isArray(featuresBg)) {
        throw new Error(`Plan ${plan.planCode}: features/featuresBg must be JSON arrays`);
      }
      if (features.length === 0) {
        console.warn(`⚠️  Plan ${plan.planCode}: features array is empty`);
      }
    } catch (e) {
      throw new Error(`Plan ${plan.planCode} features validation failed: ${e.message}`);
    }
  }
  console.log('✅ All plan features validated successfully\n');

  // Summary
  console.log('📊 Seed Summary:');
  console.log(`   Admin Users: 1`);
  console.log(`   Partner Users: ${users.length}`);
  console.log(`   Partners: ${partners.length}`);
  console.log(`   Offers: ${offers.length}`);
  console.log(`   Subscription Plans: ${plans.length}`);
  console.log('\n✅ Database seeded successfully!\n');
  console.log('🔐 Admin Login:');
  console.log(`   Email: admin@boomcard.bg`);
  console.log(`   Password: admin123`);
  console.log(`   Role: SUPER_ADMIN\n`);
  console.log('🎉 You can now start the server and see offers on the homepage!');
  console.log('   Run: npm run dev\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
