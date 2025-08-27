#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const pg = require('pg');

/**
 * Test Supabase connection
 * Run this after setting up your Supabase project
 */

async function testConnection() {
  console.log('🔌 Testing Supabase Connection...\n');

  // Check for required environment variables
  const requiredEnvVars = [
    'DATABASE_URL',
    'SUPABASE_URL', 
    'SUPABASE_ANON_KEY'
  ];

  const missing = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing.join(', '));
    console.log('\nPlease set these in a .env file:');
    console.log('DATABASE_URL=your-database-url');
    console.log('SUPABASE_URL=your-supabase-url');
    console.log('SUPABASE_ANON_KEY=your-anon-key');
    process.exit(1);
  }

  // Test PostgreSQL connection
  console.log('1️⃣ Testing PostgreSQL connection...');
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected:', result.rows[0].now);
    
    // Test schema creation
    const schemas = await pool.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name IN ('auth_service', 'analytics_service', 'ml_service', 'event_store')
    `);
    
    console.log('✅ Schemas found:', schemas.rows.map(r => r.schema_name).join(', '));
    
  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }

  // Test Supabase client
  console.log('\n2️⃣ Testing Supabase client...');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  try {
    const { data, error } = await supabase
      .from('auth_service.users')
      .select('count')
      .limit(1);
      
    if (error) throw error;
    
    console.log('✅ Supabase client connected successfully');
    
  } catch (error) {
    console.error('❌ Supabase client error:', error.message);
    console.log('Note: This might be normal if RLS is enabled without policies');
  }

  console.log('\n✨ Connection test complete!');
  console.log('\nNext steps:');
  console.log('1. Deploy backend services to Render');
  console.log('2. Update service environment variables');
  console.log('3. Test the full application');
}

// Run test if called directly
if (require.main === module) {
  require('dotenv').config();
  testConnection();
}

module.exports = { testConnection };