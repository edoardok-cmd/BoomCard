/**
 * BoomCard Reviews Seed Script
 * Creates sample reviews to achieve a 4.9/5 overall rating
 *
 * Run with: npx ts-node prisma/seed-reviews.ts
 */

import { PrismaClient, ReviewStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Realistic Bulgarian reviews (as per requirements)
const reviewTemplates = [
  // 5-star reviews (majority)
  { rating: 5, comment: 'Спестих около 18 лв. при вечеря за двама. Качих бележката за под минута.' },
  { rating: 5, comment: 'Ползвах го в бар и ресторант. Процесът е ясен и работи както е описано.' },
  { rating: 5, comment: 'Сканирането е бързо, а качването на бележката е супер лесно. Няма излишни стъпки.' },
  { rating: 5, comment: 'Страхотно приложение! Спестих 12 лв. на първата си поръчка.' },
  { rating: 5, comment: 'Много удобно за ежедневни покупки. Кешбекът идва бързо.' },
  { rating: 5, comment: 'Препоръчвам! Вече спестих над 50 лв. за месец.' },
  { rating: 5, comment: 'Лесно за използване, отстъпките са реални.' },
  { rating: 5, comment: 'Перфектно за вечери навън. Спестих 22 лв. миналата седмица.' },
  { rating: 5, comment: 'Качеството на партньорите е отлично. Само добри заведения.' },
  { rating: 5, comment: 'Бързо получих кешбек след качване на бележката.' },
  { rating: 5, comment: 'Най-доброто приложение за отстъпки в България!' },
  { rating: 5, comment: 'Спестих 15 лв. на обяд с колеги. Много практично.' },
  { rating: 5, comment: 'Лесна регистрация и веднага започнах да спестявам.' },
  { rating: 5, comment: 'Отличен избор на ресторанти и барове.' },
  { rating: 5, comment: 'Ползвам го всяка седмица. Супер доволен съм.' },
  { rating: 5, comment: 'Кешбекът дойде за по-малко от 24 часа. Впечатлен съм.' },
  { rating: 5, comment: 'Спестих 8 лв. на кафе и закуска. Работи перфектно.' },
  { rating: 5, comment: 'Приложението е интуитивно и лесно за навигация.' },
  { rating: 5, comment: 'Разнообразие от партньори в София. Много опции.' },
  { rating: 5, comment: 'Препоръчах го на приятели. Всички са доволни.' },

  // 4-star reviews (some)
  { rating: 4, comment: 'Идеята с кешбек е удобна. Плащаш нормално и после получаваш връщане на пари.' },
  { rating: 4, comment: 'Добри отстъпки за СПА уикенд. Спестихме 35 лв. за масажи.' },
  { rating: 4, comment: 'Работи добре, но искам повече партньори в Пловдив.' },
  { rating: 4, comment: 'Спестих 10 лв. на вечеря. Очаквах малко повече отстъпка.' },
  { rating: 4, comment: 'Добро приложение, понякога бележката се качва бавно.' },
  { rating: 4, comment: 'Харесва ми концепцията. Ще продължа да го ползвам.' },
  { rating: 4, comment: 'Удобно е, но искам нотификации за нови оферти.' },
  { rating: 4, comment: 'Спестих пари, но процесът може да е по-бърз.' },

  // 3-star reviews (few for realism)
  { rating: 3, comment: 'Добра идея, но има малко партньори в моя район.' },
  { rating: 3, comment: 'Работи, но кешбекът дойде след 3 дни.' },
];

// Bulgarian first names for reviewers
const firstNames = [
  'Мария', 'Иван', 'Елена', 'Георги', 'Петя', 'Николай', 'Силвия', 'Димитър',
  'Веселина', 'Стоян', 'Красимира', 'Борис', 'Анна', 'Пламен', 'Даниела',
  'Александър', 'Виктория', 'Христо', 'Надежда', 'Тодор', 'Ивана', 'Калоян',
  'Росица', 'Мартин', 'Десислава', 'Васил', 'Антония', 'Радослав', 'Габриела',
  'Станимир', 'Милена', 'Емил', 'Теодора', 'Атанас', 'Йоана', 'Светослав',
  'Цветелина', 'Любомир', 'Ралица', 'Венцислав', 'Полина', 'Кирил', 'Моника',
];

// Bulgarian last name initials
const lastInitials = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К', 'Л', 'М', 'Н', 'О', 'П', 'Р', 'С', 'Т', 'Ф', 'Х', 'Ц', 'Ч', 'Ш'];

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateReviewerName(): { firstName: string; lastName: string; displayName: string } {
  const firstName = getRandomElement(firstNames);
  const lastInitial = getRandomElement(lastInitials);
  return {
    firstName,
    lastName: `${lastInitial}.`,
    displayName: `${firstName} ${lastInitial}.`
  };
}

async function main() {
  console.log('🌱 Starting reviews seed...\n');

  const bcrypt = require('bcryptjs');
  const reviewerPasswordHash = await bcrypt.hash('reviewer123', 10);

  // Get existing partners
  const partners = await prisma.partner.findMany({
    where: { status: 'ACTIVE' },
    take: 10
  });

  if (partners.length === 0) {
    console.log('❌ No partners found. Please run the main seed first.');
    return;
  }

  console.log(`📍 Found ${partners.length} active partners\n`);

  // Calculate distribution for 4.9/5 average with ~127 reviews
  // 117 x 5 = 585, 8 x 4 = 32, 2 x 3 = 6 → Total: 623 / 127 = 4.9
  const reviewsToCreate: Array<{
    rating: number;
    comment: string;
    partnerId: string;
  }> = [];

  // Create review distribution
  const distribution = {
    5: 117,  // 5-star reviews
    4: 8,    // 4-star reviews
    3: 2,    // 3-star reviews
  };

  // Get templates by rating
  const templatesByRating = {
    5: reviewTemplates.filter(r => r.rating === 5),
    4: reviewTemplates.filter(r => r.rating === 4),
    3: reviewTemplates.filter(r => r.rating === 3),
  };

  // Distribute reviews across partners
  for (const [ratingStr, count] of Object.entries(distribution)) {
    const rating = parseInt(ratingStr);
    const templates = templatesByRating[rating as 5 | 4 | 3];

    for (let i = 0; i < count; i++) {
      const template = templates[i % templates.length];
      const partner = partners[i % partners.length];

      reviewsToCreate.push({
        rating: template.rating,
        comment: template.comment,
        partnerId: partner.id,
      });
    }
  }

  console.log(`📝 Creating ${reviewsToCreate.length} reviews...\n`);

  // Create reviewer users and their reviews
  let createdCount = 0;
  const usedEmails = new Set<string>();

  for (const reviewData of reviewsToCreate) {
    try {
      // Generate unique reviewer
      const reviewer = generateReviewerName();
      let email = `reviewer_${reviewer.firstName.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}@boomcard.bg`;

      // Ensure email is unique
      while (usedEmails.has(email)) {
        email = `reviewer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}@boomcard.bg`;
      }
      usedEmails.add(email);

      // Create reviewer user
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: reviewerPasswordHash,
          firstName: reviewer.firstName,
          lastName: reviewer.lastName,
          role: 'USER',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      // Create the review (APPROVED status so it shows up)
      await prisma.review.create({
        data: {
          userId: user.id,
          partnerId: reviewData.partnerId,
          rating: reviewData.rating,
          comment: reviewData.comment,
          status: ReviewStatus.APPROVED,
          isVerified: true,
          createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date in last 30 days
        },
      });

      createdCount++;

      if (createdCount % 20 === 0) {
        console.log(`   Created ${createdCount}/${reviewsToCreate.length} reviews...`);
      }
    } catch (error) {
      console.error(`   Error creating review: ${error}`);
    }
  }

  console.log(`\n✅ Created ${createdCount} reviews\n`);

  // Update partner ratings based on their reviews
  console.log('📊 Updating partner ratings...\n');

  for (const partner of partners) {
    const reviewStats = await prisma.review.aggregate({
      where: {
        partnerId: partner.id,
        status: ReviewStatus.APPROVED,
      },
      _avg: { rating: true },
      _count: { rating: true },
    });

    if (reviewStats._count.rating > 0) {
      await prisma.partner.update({
        where: { id: partner.id },
        data: {
          rating: Math.round((reviewStats._avg.rating || 0) * 10) / 10,
          reviewCount: reviewStats._count.rating,
        },
      });
      console.log(`   ${partner.businessName}: ${reviewStats._avg.rating?.toFixed(1)}/5 (${reviewStats._count.rating} reviews)`);
    }
  }

  // Calculate overall average
  const overallStats = await prisma.review.aggregate({
    where: { status: ReviewStatus.APPROVED },
    _avg: { rating: true },
    _count: { rating: true },
  });

  console.log('\n📊 Overall Statistics:');
  console.log(`   Total Reviews: ${overallStats._count.rating}`);
  console.log(`   Average Rating: ${overallStats._avg.rating?.toFixed(2)}/5`);
  console.log('\n✅ Reviews seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding reviews:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
