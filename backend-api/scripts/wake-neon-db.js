const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  log: ['error', 'warn']
});

async function wakeDatabase() {
  console.log('🔄 Attempting to wake up Neon database...');
  console.log('   (This may take 1-5 seconds if database was suspended)\n');

  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      console.log(`Attempt ${attempts}/${maxAttempts}...`);

      // Simple query to wake up the database
      await prisma.$queryRaw`SELECT 1 as wake_up`;

      console.log('\n✅ Database is awake and responding!');

      // Now test actual data
      const offerCount = await prisma.offer.count();
      const partnerCount = await prisma.partner.count();

      console.log(`\n📊 Data check:`);
      console.log(`   Offers: ${offerCount}`);
      console.log(`   Partners: ${partnerCount}`);

      if (offerCount > 0) {
        console.log('\n🎉 SUCCESS! Database is ready with sample data.');
      } else {
        console.log('\n⚠️  Database is connected but has no data. Run seed script.');
      }

      break;
    } catch (error) {
      if (attempts >= maxAttempts) {
        console.error('\n❌ Failed to wake database after', maxAttempts, 'attempts');
        console.error('Error:', error.message);
        console.error('\n💡 Possible solutions:');
        console.error('   1. Check your Neon console - the compute may be stopped');
        console.error('   2. Verify the DATABASE_URL is correct');
        console.error('   3. Check if your Neon project is still active');
      } else {
        console.log(`   Failed, retrying in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  await prisma.$disconnect();
}

wakeDatabase();
