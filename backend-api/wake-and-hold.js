const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('FATAL: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

async function wakeAndHold() {
  const client = new Client({ connectionString });

  try {
    console.log('🔌 Connecting to Neon and keeping connection alive...');

    await client.connect();
    console.log('✅ Connected! Compute is now ACTIVE');
    console.log('\n⏰ Keeping connection open for 60 seconds to prevent auto-suspend...');
    console.log('📝 You can now run other commands that need the database\n');

    // Keep connection alive with periodic queries
    let countdown = 60;
    const interval = setInterval(async () => {
      try {
        await client.query('SELECT 1');
        countdown -= 5;
        if (countdown > 0) {
          console.log(`⏳ Connection alive... ${countdown}s remaining`);
        }
      } catch (error) {
        console.error('❌ Keep-alive query failed:', error.message);
      }
    }, 5000);

    // Wait 60 seconds
    await new Promise(resolve => setTimeout(resolve, 60000));

    clearInterval(interval);
    await client.end();
    console.log('\n✅ Connection closed after 60 seconds');

  } catch (error) {
    console.error('\n❌ Connection failed:', error.message);
    if (client._connected) {
      await client.end();
    }
    process.exit(1);
  }
}

wakeAndHold();
