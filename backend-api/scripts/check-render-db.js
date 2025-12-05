const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://boomcard:k82IGrupPqzlIiYb3WKFC2OqmnRNGW4i@dpg-d3mh1uruibrs73dvoub0-a.oregon-postgres.render.com/boomcard'
    }
  }
});

async function checkDatabase() {
  try {
    console.log('🔍 Attempting to connect to Render database...\n');

    // Test connection
    await prisma.$connect();
    console.log('✅ Database connection successful!\n');

    // Check Offers
    const offerCount = await prisma.offer.count();
    console.log(`📊 OFFERS: ${offerCount} total`);

    if (offerCount > 0) {
      const offers = await prisma.offer.findMany({ take: 3 });
      console.log('\n🔍 Sample Offers:');
      offers.forEach((offer, i) => {
        console.log(`\n${i + 1}. ${offer.title}`);
        console.log(`   Type: ${offer.type}`);
        console.log(`   Status: ${offer.status}`);
        console.log(`   Image: ${offer.image || 'No image'}`);
      });
    }

    // Check Partners
    const partnerCount = await prisma.partner.count();
    console.log(`\n🏢 PARTNERS: ${partnerCount} total`);

    if (partnerCount > 0) {
      const partners = await prisma.partner.findMany({ take: 3 });
      console.log('\n🔍 Sample Partners:');
      partners.forEach((partner, i) => {
        console.log(`\n${i + 1}. ${partner.businessName}`);
        console.log(`   Category: ${partner.category}`);
        console.log(`   Status: ${partner.status}`);
      });
    }

    // Check Users
    const userCount = await prisma.user.count();
    console.log(`\n👥 USERS: ${userCount} total`);

    // Check Receipts
    const receiptCount = await prisma.receipt.count();
    console.log(`📄 RECEIPTS: ${receiptCount} total`);

    // Check Venues
    const venueCount = await prisma.venue.count();
    console.log(`📍 VENUES: ${venueCount} total`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Database is accessible and contains data!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Database connection failed:');
    if (error.code === 'P1001') {
      console.error('⚠️  Cannot reach database server');
      console.error('   This usually means the Render PostgreSQL instance is suspended or deleted.');
    } else if (error.code === 'P1017') {
      console.error('⚠️  Server has closed the connection');
      console.error('   The database may be inactive or require payment to reactivate.');
    } else {
      console.error(error.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
