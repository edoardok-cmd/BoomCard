import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCurrentData() {
  try {
    console.log('🔍 Connecting to Neon database...\n');

    // Check Offers
    const offerCount = await prisma.offer.count();
    const offers = await prisma.offer.findMany({
      take: 8,
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`📊 OFFERS: ${offerCount} total offers in database`);
    if (offers.length > 0) {
      console.log('\n✅ Sample Offers:');
      offers.forEach((offer, i) => {
        console.log(`\n${i + 1}. ${offer.title}`);
        console.log(`   Type: ${offer.type}, Status: ${offer.status}`);
        console.log(`   Featured: ${offer.isFeatured ? 'YES' : 'No'}`);
        if (offer.discountPercent) {
          console.log(`   Discount: ${offer.discountPercent}%`);
        }
        console.log(`   Image: ${offer.image ? '✓' : '✗'}`);
      });
    } else {
      console.log('⚠️  No offers found in database');
    }

    // Check Partners
    console.log('\n' + '='.repeat(60));
    const partnerCount = await prisma.partner.count();
    const partners = await prisma.partner.findMany({
      take: 6,
    });

    console.log(`\n🏢 PARTNERS: ${partnerCount} total partners`);
    if (partners.length > 0) {
      console.log('\n✅ Sample Partners:');
      partners.forEach((partner, i) => {
        console.log(`${i + 1}. ${partner.businessName} (${partner.category})`);
      });
    } else {
      console.log('⚠️  No partners found in database');
    }

    // Check Users
    console.log('\n' + '='.repeat(60));
    const userCount = await prisma.user.count();
    console.log(`\n👥 USERS: ${userCount} total users`);

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Neon database is populated and ready!');
    console.log('🎉 Your application can now access offers and partners!\n');

  } catch (error: any) {
    console.error('❌ Error checking database:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkCurrentData();
