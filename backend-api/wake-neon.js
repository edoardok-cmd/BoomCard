const { Client } = require('pg');

const connectionString = "postgresql://neondb_owner:npg_3f1FtdpRDOTH@ep-old-salad-agie89z3-pooler.c-2.eu-central-1.aws.neon.tech/boomcard?sslmode=require";

async function wakeNeon() {
  const client = new Client({ connectionString });

  try {
    console.log('🔌 Attempting to connect and wake Neon compute...');
    console.log('⏳ This may take a few seconds if compute is suspended...\n');

    await client.connect();
    console.log('✅ Connected successfully!');

    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('\n📊 Database info:');
    console.log('   Current time:', result.rows[0].current_time);
    console.log('   PostgreSQL:', result.rows[0].pg_version.split(' ')[0], result.rows[0].pg_version.split(' ')[1]);

    // Test if tables exist
    const tableCheck = await client.query(`
      SELECT COUNT(*) as count FROM "Offer"
    `);
    console.log('\n✅ Found', tableCheck.rows[0].count, 'offers in database');

    await client.end();
    console.log('\n🎉 Neon compute is now ACTIVE!');

  } catch (error) {
    console.error('\n❌ Connection failed:', error.message);
    if (client._connected) {
      await client.end();
    }
    process.exit(1);
  }
}

wakeNeon();
