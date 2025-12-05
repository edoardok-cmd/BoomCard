const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testConnection() {
  try {
    console.log('🔌 Testing database connection...');

    const offerCount = await prisma.offer.count();
    console.log(`✅ Connected! Found ${offerCount} offers in database`);

    const offers = await prisma.offer.findMany({
      take: 3,
      select: {
        title: true,
        cashbackPercentage: true,
        partner: {
          select: {
            name: true
          }
        }
      }
    });

    console.log('\n📋 Sample offers:');
    offers.forEach(offer => {
      console.log(`  - ${offer.title} (${offer.cashbackPercentage}% cashback) from ${offer.partner.name}`);
    });

  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
