/**
 * Seed script for venues
 * Creates sample venues in Sofia and other Bulgarian cities for testing
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Sample venues data for Bulgaria
const sampleVenues = [
  // Sofia venues
  {
    name: 'Restaurant Happy',
    nameBg: 'Ресторант Happy',
    address: 'ul. "William Gladstone" 10',
    city: 'Sofia',
    region: 'Sofia City',
    latitude: 42.6977,
    longitude: 23.3219,
    phone: '+359 2 980 9870',
    email: 'info@happy.bg',
    description: 'Modern Bulgarian cuisine in the heart of Sofia',
    descriptionBg: 'Модерна българска кухня в сърцето на София',
    images: JSON.stringify(['/images/venues/happy-1.jpg', '/images/venues/happy-2.jpg']),
    openingHours: JSON.stringify({
      monday: '11:00-23:00',
      tuesday: '11:00-23:00',
      wednesday: '11:00-23:00',
      thursday: '11:00-23:00',
      friday: '11:00-00:00',
      saturday: '11:00-00:00',
      sunday: '12:00-22:00',
    }),
    capacity: 80,
    features: JSON.stringify(['WiFi', 'Parking', 'Outdoor Seating', 'Live Music']),
  },
  {
    name: 'Caffe Shtastlivetsa',
    nameBg: 'Кафе Щастливеца',
    address: 'bul. "Vitosha" 23',
    city: 'Sofia',
    region: 'Sofia City',
    latitude: 42.6945,
    longitude: 23.3213,
    phone: '+359 2 987 1234',
    email: 'contact@shtastlivetsa.bg',
    description: 'Cozy café on Vitosha Boulevard with artisan coffee',
    descriptionBg: 'Уютно кафе на булевард Витоша с занаятчийско кафе',
    images: JSON.stringify(['/images/venues/cafe-1.jpg']),
    openingHours: JSON.stringify({
      monday: '08:00-22:00',
      tuesday: '08:00-22:00',
      wednesday: '08:00-22:00',
      thursday: '08:00-22:00',
      friday: '08:00-23:00',
      saturday: '09:00-23:00',
      sunday: '09:00-21:00',
    }),
    capacity: 40,
    features: JSON.stringify(['WiFi', 'Outdoor Seating', 'Pet Friendly']),
  },
  {
    name: 'Pizza Gusto',
    nameBg: 'Пица Густо',
    address: 'ul. "Graf Ignatiev" 15',
    city: 'Sofia',
    region: 'Sofia City',
    latitude: 42.6931,
    longitude: 23.3189,
    phone: '+359 2 943 5678',
    email: 'orders@pizzagusto.bg',
    description: 'Authentic Italian pizza with a Bulgarian twist',
    descriptionBg: 'Автентична италианска пица с български акцент',
    images: JSON.stringify(['/images/venues/pizza-1.jpg', '/images/venues/pizza-2.jpg']),
    openingHours: JSON.stringify({
      monday: '10:00-23:00',
      tuesday: '10:00-23:00',
      wednesday: '10:00-23:00',
      thursday: '10:00-23:00',
      friday: '10:00-01:00',
      saturday: '10:00-01:00',
      sunday: '11:00-23:00',
    }),
    capacity: 60,
    features: JSON.stringify(['WiFi', 'Delivery', 'Takeout', 'Outdoor Seating']),
  },
  {
    name: 'The Market by Chef',
    nameBg: 'Пазарът от Шеф',
    address: 'ul. "Solunska" 32',
    city: 'Sofia',
    region: 'Sofia City',
    latitude: 42.6977,
    longitude: 23.3242,
    phone: '+359 2 989 4567',
    email: 'reservations@themarket.bg',
    description: 'Fine dining experience with seasonal ingredients',
    descriptionBg: 'Изискана трапеза със сезонни продукти',
    images: JSON.stringify(['/images/venues/market-1.jpg']),
    openingHours: JSON.stringify({
      monday: 'Closed',
      tuesday: '12:00-23:00',
      wednesday: '12:00-23:00',
      thursday: '12:00-23:00',
      friday: '12:00-00:00',
      saturday: '12:00-00:00',
      sunday: '12:00-22:00',
    }),
    capacity: 50,
    features: JSON.stringify(['WiFi', 'Parking', 'Reservations Required', 'Wine Bar']),
  },

  // Plovdiv venues
  {
    name: 'Hemingway',
    nameBg: 'Хемингуей',
    address: 'ul. "Knyaz Alexander I" 34',
    city: 'Plovdiv',
    region: 'Plovdiv',
    latitude: 42.1438,
    longitude: 24.7495,
    phone: '+359 32 626 595',
    email: 'info@hemingway-bg.com',
    description: 'Classic restaurant with panoramic city views',
    descriptionBg: 'Класически ресторант с панорамна гледка към града',
    images: JSON.stringify(['/images/venues/hemingway-1.jpg']),
    openingHours: JSON.stringify({
      monday: '11:00-23:00',
      tuesday: '11:00-23:00',
      wednesday: '11:00-23:00',
      thursday: '11:00-23:00',
      friday: '11:00-00:00',
      saturday: '11:00-00:00',
      sunday: '12:00-23:00',
    }),
    capacity: 100,
    features: JSON.stringify(['WiFi', 'Parking', 'Outdoor Seating', 'Romantic Setting']),
  },
  {
    name: 'Kapana Creative District Café',
    nameBg: 'Кафе в Капана',
    address: 'ul. "Hristo Dyukmedjiev" 12',
    city: 'Plovdiv',
    region: 'Plovdiv',
    latitude: 42.1482,
    longitude: 24.7495,
    phone: '+359 32 555 123',
    email: 'hello@kapanacafe.com',
    description: 'Hip café in the artistic Kapana district',
    descriptionBg: 'Модерно кафе в артистичния квартал Капана',
    images: JSON.stringify(['/images/venues/kapana-1.jpg']),
    openingHours: JSON.stringify({
      monday: '08:00-22:00',
      tuesday: '08:00-22:00',
      wednesday: '08:00-22:00',
      thursday: '08:00-23:00',
      friday: '08:00-00:00',
      saturday: '09:00-00:00',
      sunday: '09:00-21:00',
    }),
    capacity: 35,
    features: JSON.stringify(['WiFi', 'Art Gallery', 'Pet Friendly', 'Live Events']),
  },

  // Varna venues
  {
    name: 'Sea Garden Restaurant',
    nameBg: 'Ресторант Морска градина',
    address: 'Primorski Park',
    city: 'Varna',
    region: 'Varna',
    latitude: 43.2039,
    longitude: 27.9150,
    phone: '+359 52 664 789',
    email: 'info@seagarden.bg',
    description: 'Seaside restaurant with fresh seafood',
    descriptionBg: 'Крайбрежен ресторант със свежа риба и морски дарове',
    images: JSON.stringify(['/images/venues/seagarden-1.jpg']),
    openingHours: JSON.stringify({
      monday: '10:00-23:00',
      tuesday: '10:00-23:00',
      wednesday: '10:00-23:00',
      thursday: '10:00-23:00',
      friday: '10:00-00:00',
      saturday: '10:00-00:00',
      sunday: '10:00-23:00',
    }),
    capacity: 120,
    features: JSON.stringify(['WiFi', 'Parking', 'Outdoor Seating', 'Sea View', 'Kids Playground']),
  },

  // Burgas venues
  {
    name: 'Neptune Restaurant',
    nameBg: 'Ресторант Нептун',
    address: 'ul. "Alexandrovska" 89',
    city: 'Burgas',
    region: 'Burgas',
    latitude: 42.5048,
    longitude: 27.4626,
    phone: '+359 56 842 123',
    email: 'contact@neptune-burgas.bg',
    description: 'Elegant dining by the Black Sea',
    descriptionBg: 'Елегантна трапеза край Черно море',
    images: JSON.stringify(['/images/venues/neptune-1.jpg']),
    openingHours: JSON.stringify({
      monday: '11:00-23:00',
      tuesday: '11:00-23:00',
      wednesday: '11:00-23:00',
      thursday: '11:00-23:00',
      friday: '11:00-00:00',
      saturday: '11:00-00:00',
      sunday: '12:00-23:00',
    }),
    capacity: 90,
    features: JSON.stringify(['WiFi', 'Parking', 'Outdoor Seating', 'Beach Access']),
  },
];

async function seedVenues() {
  console.log('🌱 Starting venues seed...\n');

  try {
    // Get or create a test user for the partner
    let user = await prisma.user.findFirst({
      where: {
        email: 'partner@boomcard.com',
      },
    });

    if (!user) {
      console.log('Creating test user for partner...');
      user = await prisma.user.create({
        data: {
          email: 'partner@boomcard.com',
          passwordHash: '$2a$10$xxxxxxxxxxxxxxxxxxxxx', // placeholder hash
          firstName: 'Partner',
          lastName: 'Admin',
          role: 'PARTNER',
        },
      });
    }

    // Get or create a test partner
    let partner = await prisma.partner.findFirst({
      where: {
        email: 'partner@boomcard.com',
      },
    });

    if (!partner) {
      console.log('Creating test partner...');
      partner = await prisma.partner.create({
        data: {
          userId: user.id,
          email: 'partner@boomcard.com',
          businessName: 'BoomCard Test Partners',
          category: 'Restaurant',
          phone: '+359 2 123 4567',
          address: 'Sofia, Bulgaria',
          city: 'Sofia',
          status: 'ACTIVE',
        },
      });
      console.log(`✓ Created partner: ${partner.businessName} (ID: ${partner.id})\n`);
    } else {
      console.log(`✓ Using existing partner: ${partner.businessName} (ID: ${partner.id})\n`);
    }

    // Delete existing venues for this partner to avoid duplicates
    const deletedCount = await prisma.venue.deleteMany({
      where: {
        partnerId: partner.id,
      },
    });
    console.log(`Deleted ${deletedCount.count} existing venues\n`);

    // Create venues
    console.log('Creating venues...\n');
    for (const venueData of sampleVenues) {
      const venue = await prisma.venue.create({
        data: {
          ...venueData,
          partnerId: partner.id,
        },
      });
      console.log(`✓ Created: ${venue.name} in ${venue.city}`);
    }

    console.log(`\n✅ Successfully seeded ${sampleVenues.length} venues!`);
    console.log(`\n📍 Cities:`);
    const cities = [...new Set(sampleVenues.map((v) => v.city))];
    cities.forEach((city) => {
      const count = sampleVenues.filter((v) => v.city === city).length;
      console.log(`   • ${city}: ${count} venue${count > 1 ? 's' : ''}`);
    });

    console.log(`\n🔗 Test endpoints:`);
    console.log(`   GET /api/venues - List all venues`);
    console.log(`   GET /api/venues/nearby?latitude=42.6977&longitude=23.3219&radius=5 - Find venues near Sofia center`);
    console.log(`   GET /api/venues/search?q=pizza - Search for pizza places`);
    console.log(`   GET /api/venues/cities - List all cities`);

  } catch (error) {
    console.error('❌ Error seeding venues:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed
seedVenues();
