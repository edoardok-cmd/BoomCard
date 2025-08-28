#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testSupabase() {
  console.log('🔌 Testing Supabase Connection (Simple)...\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  console.log('URL:', supabaseUrl);
  console.log('Key:', supabaseKey?.substring(0, 20) + '...');

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Try to query the auth schema
    const { data, error } = await supabase.rpc('version');
    
    if (error) {
      console.log('Trying alternative test...');
      // Try a simple select
      const { data: testData, error: testError } = await supabase
        .from('auth_service.roles')
        .select('name')
        .limit(1);
        
      if (testError) {
        console.error('❌ Connection failed:', testError.message);
      } else {
        console.log('✅ Successfully connected to Supabase!');
        console.log('Found roles:', testData);
      }
    } else {
      console.log('✅ Successfully connected to Supabase!');
      console.log('PostgreSQL version:', data);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

testSupabase();