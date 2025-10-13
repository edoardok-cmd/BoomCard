#!/usr/bin/env node

/**
 * Simple Database Seeder
 *
 * This script seeds the database with demo data from demo-data.json
 * Run with: node scripts/seedDatabase.js
 */

const demoData = require('./demo-data.json');

const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

async function seedDatabase() {
  console.log('🌱 Starting database seeding...\n');
  console.log(`API URL: ${API_BASE_URL}\n`);

  try {
    // 1. Seed Users
    console.log('👥 Creating demo users...');
    for (const user of demoData.users) {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(user)
        });

        if (response.ok) {
          console.log(`✅ Created user: ${user.email}`);
        } else if (response.status === 409 || response.status === 400) {
          console.log(`⏭️  User already exists: ${user.email}`);
        } else {
          const error = await response.text();
          console.log(`❌ Failed to create user ${user.email}: ${error}`);
        }
      } catch (error) {
        console.error(`❌ Error creating user ${user.email}:`, error.message);
      }
    }

    // 2. Seed Partners
    console.log('\n🏢 Creating demo partners...');
    const partnerTokenMap = {};

    for (const partner of demoData.partners) {
      try {
        // Login as partner user to get token
        const loginResponse = await fetch(`${API_BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'partner@boomcard.bg',
            password: 'partner123'
          })
        });

        let token = '';
        if (loginResponse.ok) {
          const loginData = await loginResponse.json();
          token = loginData.token || loginData.accessToken;
        }

        const response = await fetch(`${API_BASE_URL}/partners`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          },
          body: JSON.stringify(partner)
        });

        if (response.ok) {
          const createdPartner = await response.json();
          partnerTokenMap[partner.id] = createdPartner.id || createdPartner._id || partner.id;
          console.log(`✅ Created partner: ${partner.name}`);
        } else {
          const error = await response.text();
          console.log(`⚠️  Partner ${partner.name}: ${error}`);
        }
      } catch (error) {
        console.error(`❌ Error creating partner ${partner.name}:`, error.message);
      }
    }

    // 3. Seed Offers
    console.log('\n🎁 Creating demo offers...');
    for (const offer of demoData.offers) {
      try {
        // Login to get token
        const loginResponse = await fetch(`${API_BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'partner@boomcard.bg',
            password: 'partner123'
          })
        });

        let token = '';
        if (loginResponse.ok) {
          const loginData = await loginResponse.json();
          token = loginData.token || loginData.accessToken;
        }

        // Map partner ID
        const offerData = {
          ...offer,
          partnerId: partnerTokenMap[offer.partnerId] || offer.partnerId
        };

        const response = await fetch(`${API_BASE_URL}/offers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          },
          body: JSON.stringify(offerData)
        });

        if (response.ok) {
          console.log(`✅ Created offer: ${offer.title}`);
        } else {
          const error = await response.text();
          console.log(`⚠️  Offer ${offer.title}: ${error}`);
        }
      } catch (error) {
        console.error(`❌ Error creating offer ${offer.title}:`, error.message);
      }
    }

    console.log('\n✨ Database seeding completed!\n');
    console.log('📊 Summary:');
    console.log(`   - Users: ${demoData.users.length}`);
    console.log(`   - Partners: ${demoData.partners.length}`);
    console.log(`   - Offers: ${demoData.offers.length}\n`);
    console.log('🔑 Demo Credentials:');
    console.log('   User: demo@boomcard.bg / demo123');
    console.log('   Partner: partner@boomcard.bg / partner123');
    console.log('   Admin: admin@boomcard.bg / admin123\n');

  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run seeder
seedDatabase()
  .then(() => {
    console.log('✅ Seeding process completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seeding process failed:', error);
    process.exit(1);
  });
