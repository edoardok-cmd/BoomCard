const { execSync } = require('child_process');
const { Client } = require('pg');

async function resetDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Drop all tables by dropping and recreating the public schema
    console.log('Dropping public schema...');
    await client.query('DROP SCHEMA public CASCADE;');

    console.log('Recreating public schema...');
    await client.query('CREATE SCHEMA public;');
    await client.query('GRANT ALL ON SCHEMA public TO postgres;');
    await client.query('GRANT ALL ON SCHEMA public TO public;');

    console.log('Database reset complete!');
  } catch (error) {
    console.error('Error resetting database:', error);
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  console.log('=== Starting database reset and deployment ===');

  // Reset the database
  await resetDatabase();

  // Run prisma db push
  console.log('Running prisma db push...');
  execSync('npx prisma db push --skip-generate --accept-data-loss', { stdio: 'inherit' });

  console.log('=== Database reset and schema push complete ===');
}

main().catch((error) => {
  console.error('Deployment failed:', error);
  process.exit(1);
});
