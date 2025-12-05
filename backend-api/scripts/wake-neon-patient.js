const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  log: ['error']
});

async function wakeDatabase() {
  console.log('🔄 Waking up Neon database from suspension...');
  console.log('   (Suspended computes can take 10-20 seconds to activate)\n');

  let attempts = 0;
  const maxAttempts = 15; // More attempts
  const retryDelay = 3000; // 3 seconds between attempts

  while (attempts < maxAttempts) {
    attempts++;
    const elapsed = (attempts - 1) * (retryDelay / 1000);

    try {
      console.log(`[${elapsed}s] Attempt ${attempts}/${maxAttempts}...`);

      // Simple wake-up query
      await prisma.$queryRaw`SELECT 1 as wake`;

      console.log('\n✅ DATABASE IS AWAKE AND CONNECTED!');

      // Verify data
      const [offerCount, partnerCount, userCount] = await Promise.all([
        prisma.offer.count(),
        prisma.partner.count(),
        prisma.user.count()
      ]);

      console.log(`\n📊 Database Status:`);
      console.log(`   ✓ Offers: ${offerCount}`);
      console.log(`   ✓ Partners: ${partnerCount}`);
      console.log(`   ✓ Users: ${userCount}`);

      if (offerCount > 0 && partnerCount > 0) {
        console.log('\n🎉 SUCCESS! Database is ready with sample data.');
        console.log('\n💡 You can now start the backend API server with:');
        console.log('   npm run dev');
      } else {
        console.log('\n⚠️  Database connected but empty. Run: npx prisma db seed');
      }

      await prisma.$disconnect();
      process.exit(0);

    } catch (error) {
      if (attempts >= maxAttempts) {
        console.error('\n❌ Failed to wake database after', maxAttempts, 'attempts');
        console.error('Error:', error.message);
        console.error('\n💡 Possible issues:');
        console.error('   1. The Neon compute may be fully stopped (not just suspended)');
        console.error('   2. Check your Neon console for compute status');
        console.error('   3. You may need to manually resume the compute');
        console.error('   4. Verify DATABASE_URL is correct');
        await prisma.$disconnect();
        process.exit(1);
      } else {
        console.log(`   Connection failed, retrying in ${retryDelay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
}

wakeDatabase();
