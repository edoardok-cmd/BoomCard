/**
 * BoomCard Database Seed Script
 * Populates the database with sample offers for development
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Create admin user
  console.log('👤 Creating admin user...');

  // Generate proper bcrypt hash for password "admin123"
  // In production, use a strong password and hash it properly
  const bcrypt = require('bcryptjs');
  const adminPasswordHash = await bcrypt.hash('admin123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@boomcard.bg' },
    update: {},
    create: {
      email: 'admin@boomcard.bg',
      passwordHash: adminPasswordHash,
      firstName: 'Admin',
      lastName: 'User',
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

  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: 'grandhotel@boomcard.bg',
        passwordHash: '$2b$10$dummyhashfordevonlynotforproduction',
        firstName: 'Grand',
        lastName: 'Hotel',
        role: 'PARTNER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'winedine@boomcard.bg',
        passwordHash: '$2b$10$dummyhashfordevonlynotforproduction',
        firstName: 'Wine',
        lastName: 'Dine',
        role: 'PARTNER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'sparetreat@boomcard.bg',
        passwordHash: '$2b$10$dummyhashfordevonlynotforproduction',
        firstName: 'Spa',
        lastName: 'Retreat',
        role: 'PARTNER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'skyadventures@boomcard.bg',
        passwordHash: '$2b$10$dummyhashfordevonlynotforproduction',
        firstName: 'Sky',
        lastName: 'Adventures',
        role: 'PARTNER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'beachfront@boomcard.bg',
        passwordHash: '$2b$10$dummyhashfordevonlynotforproduction',
        firstName: 'Beachfront',
        lastName: 'Hotel',
        role: 'PARTNER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'villamelnik@boomcard.bg',
        passwordHash: '$2b$10$dummyhashfordevonlynotforproduction',
        firstName: 'Villa',
        lastName: 'Melnik',
        role: 'PARTNER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    }),
  ]);

  console.log(`✅ Created ${users.length} users\n`);

  // Create sample partners
  console.log('🏢 Creating sample partners...');

  const partners = await Promise.all([
    prisma.partner.create({
      data: {
        userId: users[0].id,
        businessName: 'Grand Hotel Sofia',
        businessNameBg: 'Гранд Хотел София',
        category: 'Hotels',
        description: 'Luxury hotel in the heart of Sofia',
        descriptionBg: 'Луксозен хотел в сърцето на София',
        tier: 'PREMIUM',
        status: 'ACTIVE',
        rating: 4.8,
        reviewCount: 156,
        city: 'Sofia',
        phone: '+359 2 123 4567',
        email: 'contact@grandhotelsofia.bg',
      },
    }),
    prisma.partner.create({
      data: {
        userId: users[1].id,
        businessName: 'Wine & Dine Restaurant',
        businessNameBg: 'Ресторант Wine & Dine',
        category: 'Restaurants',
        description: 'Fine dining with premium wine selection',
        descriptionBg: 'Изискана кухня с премиум винена селекция',
        tier: 'PREMIUM',
        status: 'ACTIVE',
        rating: 4.7,
        reviewCount: 234,
        city: 'Sofia',
        phone: '+359 2 234 5678',
        email: 'info@wineanddine.bg',
      },
    }),
    prisma.partner.create({
      data: {
        userId: users[2].id,
        businessName: 'Spa Retreat Bansko',
        businessNameBg: 'Спа Ритрийт Банско',
        category: 'Spa',
        description: 'Premium spa and wellness center',
        descriptionBg: 'Премиум спа и уелнес център',
        tier: 'STANDARD',
        status: 'ACTIVE',
        rating: 4.9,
        reviewCount: 89,
        city: 'Bansko',
        phone: '+359 749 123456',
        email: 'info@sparetreat.bg',
      },
    }),
    prisma.partner.create({
      data: {
        userId: users[3].id,
        businessName: 'Sky Adventures',
        businessNameBg: 'Скай Адвенчърс',
        category: 'Experiences',
        description: 'Paragliding and extreme sports',
        descriptionBg: 'Парапланеризъм и екстремни спортове',
        tier: 'STANDARD',
        status: 'ACTIVE',
        rating: 4.8,
        reviewCount: 167,
        city: 'Rila',
        phone: '+359 888 123456',
        email: 'contact@skyadventures.bg',
      },
    }),
    prisma.partner.create({
      data: {
        userId: users[4].id,
        businessName: 'Beachfront Hotel Varna',
        businessNameBg: 'Крайбрежен Хотел Варна',
        category: 'Hotels',
        description: 'Luxury beachfront accommodation',
        descriptionBg: 'Луксозно крайбрежно настаняване',
        tier: 'PREMIUM',
        status: 'ACTIVE',
        rating: 4.6,
        reviewCount: 203,
        city: 'Varna',
        phone: '+359 52 123456',
        email: 'info@beachfrontvarna.bg',
      },
    }),
    prisma.partner.create({
      data: {
        userId: users[5].id,
        businessName: 'Villa Melnik Winery',
        businessNameBg: 'Вила Мелник Винарна',
        category: 'Wineries',
        description: 'Premium Bulgarian wines and tastings',
        descriptionBg: 'Премиум български вина и дегустации',
        tier: 'PREMIUM',
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

  const offers = await Promise.all([
    // Offer 1: Luxury Hotel Suite (50% discount)
    prisma.offer.create({
      data: {
        partnerId: partners[0].id,
        title: 'Luxury Suite with Breakfast',
        titleBg: 'Луксозен Апартамент със Закуска',
        description: 'Experience luxury at its finest with our premium suite including complimentary breakfast for two, spa access, and stunning city views.',
        descriptionBg: 'Изживейте лукс на най-високо ниво с нашия премиум апартамент с включена закуска за двама, достъп до спа и зашеметяваща градска гледка.',
        type: 'DISCOUNT',
        discountPercent: 50,
        image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
        status: 'ACTIVE',
        startDate: now,
        endDate: futureDate,
        usageLimit: 100,
      },
    }),

    // Offer 2: Spa Package (45% discount)
    prisma.offer.create({
      data: {
        partnerId: partners[2].id,
        title: 'Full Day Spa Package',
        titleBg: 'Целодневен Спа Пакет',
        description: 'Relax and rejuvenate with our premium spa package including massage, sauna, thermal pools, and aromatherapy.',
        descriptionBg: 'Релаксирайте и се подмладете с нашия премиум спа пакет включващ масаж, сауна, термални басейни и ароматерапия.',
        type: 'DISCOUNT',
        discountPercent: 45,
        image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800',
        status: 'ACTIVE',
        startDate: now,
        endDate: futureDate,
        usageLimit: 50,
      },
    }),

    // Offer 3: Wine Tasting (40% discount)
    prisma.offer.create({
      data: {
        partnerId: partners[5].id,
        title: 'Premium Wine Tasting Experience',
        titleBg: 'Премиум Дегустация на Вино',
        description: 'Sample our finest Bulgarian wines paired with local cheeses and charcuterie in our historic wine cellar.',
        descriptionBg: 'Опитайте нашите най-добри български вина съчетани с местни сирена и деликатеси в нашата историческа винарска изба.',
        type: 'DISCOUNT',
        discountPercent: 40,
        image: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800',
        status: 'ACTIVE',
        startDate: now,
        endDate: futureDate,
        usageLimit: 80,
      },
    }),

    // Offer 4: Fine Dining (35% discount)
    prisma.offer.create({
      data: {
        partnerId: partners[1].id,
        title: 'Gourmet Dinner for Two',
        titleBg: 'Гурме Вечеря за Двама',
        description: 'Indulge in a 5-course tasting menu expertly paired with premium wines selected by our sommelier.',
        descriptionBg: '5-курсово дегустационно меню майсторски съчетано с премиум вина подбрани от нашия сомелиер.',
        type: 'DISCOUNT',
        discountPercent: 35,
        image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
        status: 'ACTIVE',
        startDate: now,
        endDate: futureDate,
        usageLimit: 60,
      },
    }),

    // Offer 5: Paragliding (30% discount)
    prisma.offer.create({
      data: {
        partnerId: partners[3].id,
        title: 'Paragliding Adventure',
        titleBg: 'Парапланерно Приключение',
        description: 'Soar through the skies above the stunning Rila Mountains with our experienced instructors. Includes photos and video.',
        descriptionBg: 'Излетете в небето над зашеметяващите Рилски планини с нашите опитни инструктори. Включва снимки и видео.',
        type: 'DISCOUNT',
        discountPercent: 30,
        image: 'https://images.unsplash.com/photo-1534787238916-9ba6764efd4f?w=800',
        status: 'ACTIVE',
        startDate: now,
        endDate: futureDate,
        usageLimit: 40,
      },
    }),

    // Offer 6: Beachfront Suite (35% discount)
    prisma.offer.create({
      data: {
        partnerId: partners[4].id,
        title: 'Romantic Beachfront Suite',
        titleBg: 'Романтичен Апартамент на Плажа',
        description: 'Wake up to spectacular ocean views in our exclusive beachfront suite with private balcony and champagne breakfast.',
        descriptionBg: 'Събудете се с впечатляваща гледка към океана в нашия ексклузивен апартамент на плажа с частен балкон и закуска с шампанско.',
        type: 'DISCOUNT',
        discountPercent: 35,
        image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800',
        status: 'ACTIVE',
        startDate: now,
        endDate: futureDate,
        usageLimit: 30,
      },
    }),

    // Additional diverse offers
    prisma.offer.create({
      data: {
        partnerId: partners[0].id,
        title: 'Weekend Getaway Package',
        titleBg: 'Уикенд Пакет',
        description: '2 nights accommodation with breakfast and spa access',
        descriptionBg: '2 нощувки с включена закуска и достъп до спа',
        type: 'BUNDLE',
        discountPercent: 25,
        image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
        status: 'ACTIVE',
        startDate: now,
        endDate: futureDate,
      },
    }),

    prisma.offer.create({
      data: {
        partnerId: partners[1].id,
        title: 'Business Lunch Special',
        titleBg: 'Специална Бизнес Закуска',
        description: '3-course lunch menu with coffee',
        descriptionBg: '3-курсово обедно меню с кафе',
        type: 'DISCOUNT',
        discountPercent: 20,
        image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
        status: 'ACTIVE',
        startDate: now,
        endDate: futureDate,
      },
    }),
  ]);

  console.log(`✅ Created ${offers.length} offers\n`);

  // Summary
  console.log('📊 Seed Summary:');
  console.log(`   Admin Users: 1`);
  console.log(`   Partner Users: ${users.length}`);
  console.log(`   Partners: ${partners.length}`);
  console.log(`   Offers: ${offers.length}`);
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
