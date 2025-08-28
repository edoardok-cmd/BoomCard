#!/usr/bin/env node

const pg = require('pg');
require('dotenv').config();

async function testDirectConnection() {
  console.log('🔌 Testing Direct PostgreSQL Connection...\n');

  // Try the direct URL
  const directUrl = process.env.DIRECT_URL;
  console.log('Testing with DIRECT_URL...');
  console.log('URL pattern:', directUrl?.replace(/:[^@]+@/, ':****@') || 'Not set');

  const client = new pg.Client({
    connectionString: directUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected successfully!');
    
    const result = await client.query('SELECT current_database(), current_user, version()');
    console.log('Database:', result.rows[0].current_database);
    console.log('User:', result.rows[0].current_user);
    console.log('Version:', result.rows[0].version);
    
    // Check our schemas
    const schemas = await client.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name IN ('auth_service', 'analytics_service', 'ml_service', 'event_store')
      ORDER BY schema_name
    `);
    
    console.log('\nSchemas found:');
    schemas.rows.forEach(row => console.log('  -', row.schema_name));
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('Error code:', error.code);
  } finally {
    await client.end();
  }
}

testDirectConnection();