/**
 * Database Seeder for BoomCard Demo Data
 *
 * This script populates the database with realistic demo data including:
 * - Partners (restaurants, hotels, spas, etc.)
 * - Venues
 * - Offers with various discounts
 * - Users (demo accounts)
 *
 * Run with: npx ts-node scripts/seedDemoData.ts
 */

import { apiService } from '../src/services/api.service';

// Demo Users
const demoUsers = [
  {
    email: 'demo@boomcard.bg',
    password: 'demo123',
    firstName: 'Demo',
    lastName: 'User',
    phone: '+359 88 123 4567',
    role: 'user',
  },
  {
    email: 'partner@boomcard.bg',
    password: 'partner123',
    firstName: 'Partner',
    lastName: 'Business',
    phone: '+359 88 765 4321',
    role: 'partner',
  },
  {
    email: 'admin@boomcard.bg',
    password: 'admin123',
    firstName: 'Admin',
    lastName: 'Administrator',
    phone: '+359 88 999 8888',
    role: 'admin',
  },
];

// Demo Partners
const demoPartners = [
  {
    name: 'Kempinski Hotel Grand Arena',
    nameEn: 'Kempinski Hotel Grand Arena',
    nameBg: 'Кемпински Хотел Гранд Арена',
    description: 'Luxury 5-star hotel in Bansko with world-class spa facilities',
    descriptionBg: 'Луксозен 5-звезден хотел в Банско с първокласни спа съоръжения',
    category: 'hotels',
    status: 'vip',
    city: 'Bansko',
    region: 'Blagoevgrad',
    contactEmail: 'reservations@kempinski-bansko.bg',
    contactPhone: '+359 749 88888',
    website: 'https://www.kempinski.com/en/grand-arena-bansko',
    isVerified: true,
  },
  {
    name: 'Made in Home',
    nameEn: 'Made in Home',
    nameBg: 'Мейд ин Хоум',
    description: 'Michelin-recommended fine dining restaurant in Sofia',
    descriptionBg: 'Препоръчан от Michelin ресторант за изискана кухня в София',
    category: 'restaurants',
    status: 'vip',
    city: 'Sofia',
    region: 'Sofia-city',
    contactEmail: 'reservations@madeinhome.bg',
    contactPhone: '+359 2 980 6333',
    website: 'https://madeinhome.bg',
    isVerified: true,
  },
  {
    name: 'Villa Melnik',
    nameEn: 'Villa Melnik',
    nameBg: 'Вила Мелник',
    description: 'Traditional Bulgarian winery with award-winning wines',
    descriptionBg: 'Традиционна българска винарна с награждавани вина',
    category: 'wineries',
    status: 'exclusive',
    city: 'Melnik',
    region: 'Blagoevgrad',
    contactEmail: 'info@villamelnik.com',
    contactPhone: '+359 887 123 456',
    website: 'https://villamelnik.com',
    isVerified: true,
  },
  {
    name: 'Graffit Gallery Hotel',
    nameEn: 'Graffit Gallery Hotel',
    nameBg: 'Графит Галъри Хотел',
    description: 'Premium beachfront hotel in Varna',
    descriptionBg: 'Премиум хотел на брега в Варна',
    category: 'hotels',
    status: 'vip',
    city: 'Varna',
    region: 'Varna',
    contactEmail: 'reservations@graffithotel.com',
    contactPhone: '+359 52 664 400',
    website: 'https://graffithotel.com',
    isVerified: true,
  },
  {
    name: 'SkyHigh Adventures',
    nameEn: 'SkyHigh Adventures',
    nameBg: 'СкайХай Адвънчърс',
    description: 'Extreme sports and adventure activities',
    descriptionBg: 'Екстремни спортове и приключенски дейности',
    category: 'extreme-sports',
    status: 'new',
    city: 'Sopot',
    region: 'Plovdiv',
    contactEmail: 'info@skyhigh.bg',
    contactPhone: '+359 888 777 666',
    website: 'https://skyhigh-adventures.bg',
    isVerified: true,
  },
  {
    name: 'Hebros Hotel Restaurant',
    nameEn: 'Hebros Hotel Restaurant',
    nameBg: 'Ресторант Хотел Хеброс',
    description: 'Romantic restaurant in Plovdiv Old Town',
    descriptionBg: 'Романтичен ресторант в Стария град на Пловдив',
    category: 'restaurants',
    status: 'exclusive',
    city: 'Plovdiv',
    region: 'Plovdiv',
    contactEmail: 'reservations@hebros-hotel.com',
    contactPhone: '+359 32 260 180',
    website: 'https://hebros-hotel.com',
    isVerified: true,
  },
];

// Demo Offers (matching the current mock data)
const demoOffers = [
  {
    title: 'Spa Weekend in Bansko',
    titleBg: 'Спа уикенд в Банско',
    description: 'Luxury spa retreat with mountain views and premium treatments including massage, sauna, and wellness programs',
    descriptionBg: 'Луксозен спа център с планинска гледка и премиум третирания включващи масаж, сауна и уелнес програми',
    category: 'spa-wellness',
    categoryBg: 'Спа и уелнес',
    discount: 70,
    originalPrice: 800,
    discountedPrice: 240,
    imageUrl: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800',
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days from now
    maxRedemptions: 100,
    isActive: true,
    isFeatured: true,
    tags: ['spa', 'wellness', 'bansko', 'luxury', 'weekend'],
  },
  {
    title: 'Fine Dining Experience Sofia',
    titleBg: 'Изискана вечеря София',
    description: 'Michelin-recommended restaurant with seasonal menu featuring Bulgarian and international cuisine',
    descriptionBg: 'Препоръчан от Michelin ресторант със сезонно меню с българска и международна кухня',
    category: 'fine-dining',
    categoryBg: 'Висока кухня',
    discount: 50,
    originalPrice: 200,
    discountedPrice: 100,
    imageUrl: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    maxRedemptions: 50,
    isActive: true,
    isFeatured: true,
    tags: ['restaurant', 'fine-dining', 'sofia', 'michelin'],
  },
  {
    title: 'Wine Tasting in Melnik',
    titleBg: 'Дегустация на вина в Мелник',
    description: 'Exclusive wine tasting with local varietals and traditional Bulgarian appetizers',
    descriptionBg: 'Ексклузивна дегустация с местни сортове и традиционни български мезета',
    category: 'wineries',
    categoryBg: 'Винарни',
    discount: 40,
    originalPrice: 150,
    discountedPrice: 90,
    imageUrl: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800',
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(),
    maxRedemptions: 30,
    isActive: true,
    isFeatured: true,
    tags: ['wine', 'tasting', 'melnik', 'culture'],
  },
  {
    title: 'Beach Resort Varna All-Inclusive',
    titleBg: 'Плажен курорт Варна - All Inclusive',
    description: 'Premium beachfront resort with unlimited food and drinks, pool access, and entertainment',
    descriptionBg: 'Премиум курорт на брега с неограничена храна и напитки, достъп до басейн и развлечения',
    category: 'hotels',
    categoryBg: 'Хотели',
    discount: 60,
    originalPrice: 600,
    discountedPrice: 240,
    imageUrl: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800',
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    maxRedemptions: 200,
    isActive: true,
    isFeatured: true,
    tags: ['hotel', 'beach', 'varna', 'all-inclusive', 'summer'],
  },
  {
    title: 'Extreme Paragliding Adventure',
    titleBg: 'Екстремно парапланерно приключение',
    description: 'Tandem paragliding flight over the mountains with professional instructor and safety equipment',
    descriptionBg: 'Тандем парапланерен полет над планината с професионален инструктор и защитно оборудване',
    category: 'extreme-sports',
    categoryBg: 'Екстремни спортове',
    discount: 35,
    originalPrice: 280,
    discountedPrice: 182,
    imageUrl: 'https://images.unsplash.com/photo-1512227613242-e6b5e7e72c4e?w=800',
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    maxRedemptions: 40,
    isActive: true,
    isFeatured: true,
    tags: ['extreme', 'paragliding', 'adventure', 'outdoor'],
  },
  {
    title: 'Romantic Dinner Plovdiv',
    titleBg: 'Романтична вечеря Пловдив',
    description: 'Candlelit dinner for two in historic Old Town with live music and premium wine selection',
    descriptionBg: 'Вечеря при свещи за двама в историческия Стар град с жива музика и премиум селекция вина',
    category: 'restaurants',
    categoryBg: 'Ресторанти',
    discount: 45,
    originalPrice: 180,
    discountedPrice: 99,
    imageUrl: 'https://images.unsplash.com/photo-1464195643332-1f236b1c2255?w=800',
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    maxRedemptions: 60,
    isActive: true,
    isFeatured: false,
    tags: ['romantic', 'dinner', 'plovdiv', 'couple'],
  },
  // Additional offers for different categories
  {
    title: 'Sofia Cafe Brunch Special',
    titleBg: 'Специален бранч в София',
    description: 'All-day brunch menu with specialty coffee and fresh pastries',
    descriptionBg: 'Целодневно меню за бранч със специално кафе и пресни сладкиши',
    category: 'cafes',
    categoryBg: 'Кафенета',
    discount: 30,
    originalPrice: 50,
    discountedPrice: 35,
    imageUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800',
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    maxRedemptions: 100,
    isActive: true,
    isFeatured: false,
    tags: ['cafe', 'brunch', 'sofia', 'coffee'],
  },
  {
    title: 'Nightclub VIP Package Sofia',
    titleBg: 'VIP пакет нощен клуб София',
    description: 'VIP table reservation with bottle service and priority entry',
    descriptionBg: 'VIP резервация на маса с бутилка и приоритетен вход',
    category: 'clubs',
    categoryBg: 'Клубове',
    discount: 40,
    originalPrice: 300,
    discountedPrice: 180,
    imageUrl: 'https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=800',
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
    maxRedemptions: 20,
    isActive: true,
    isFeatured: false,
    tags: ['nightclub', 'vip', 'sofia', 'entertainment'],
  },
  {
    title: 'Cultural Museum Tour Package',
    titleBg: 'Културна музейна обиколка',
    description: 'Guided tour of top museums in Sofia with expert art historian',
    descriptionBg: 'Водена обиколка на топ музеи в София с експерт по история на изкуството',
    category: 'museums',
    categoryBg: 'Музеи',
    discount: 25,
    originalPrice: 80,
    discountedPrice: 60,
    imageUrl: 'https://images.unsplash.com/photo-1565173097592-a44c6ecf4e3f?w=800',
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    maxRedemptions: 50,
    isActive: true,
    isFeatured: false,
    tags: ['museum', 'culture', 'sofia', 'educational'],
  },
  {
    title: 'Family Adventure Park Day',
    titleBg: 'Семеен ден в приключенски парк',
    description: 'Full day family ticket for adventure park with zip-lines, climbing, and activities',
    descriptionBg: 'Целодневен семеен билет за приключенски парк със zip-line, катерене и активности',
    category: 'family-activities',
    categoryBg: 'Семейни дейности',
    discount: 35,
    originalPrice: 160,
    discountedPrice: 104,
    imageUrl: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800',
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(),
    maxRedemptions: 80,
    isActive: true,
    isFeatured: false,
    tags: ['family', 'adventure', 'kids', 'outdoor'],
  },
  {
    title: 'Educational Cooking Workshop',
    titleBg: 'Образователен кулинарен workshop',
    description: 'Learn traditional Bulgarian cuisine from master chef in hands-on workshop',
    descriptionBg: 'Научете традиционна българска кухня от майстор-готвач в практически workshop',
    category: 'educational',
    categoryBg: 'Образователни',
    discount: 30,
    originalPrice: 120,
    discountedPrice: 84,
    imageUrl: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800',
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    maxRedemptions: 25,
    isActive: true,
    isFeatured: false,
    tags: ['educational', 'cooking', 'workshop', 'culture'],
  },
];

/**
 * Main seeder function
 */
async function seedDatabase() {
  console.log('🌱 Starting database seeding...\n');

  try {
    // 1. Seed Users
    console.log('👥 Creating demo users...');
    const createdUsers = [];
    for (const user of demoUsers) {
      try {
        const response = await apiService.post('/auth/register', user);
        createdUsers.push(response);
        console.log(`✅ Created user: ${user.email}`);
      } catch (error: any) {
        if (error.response?.status === 409) {
          console.log(`⏭️  User already exists: ${user.email}`);
        } else {
          console.error(`❌ Failed to create user ${user.email}:`, error.message);
        }
      }
    }

    // 2. Seed Partners
    console.log('\n🏢 Creating demo partners...');
    const createdPartners = [];
    for (const partner of demoPartners) {
      try {
        const response = await apiService.post('/partners', partner);
        createdPartners.push(response);
        console.log(`✅ Created partner: ${partner.name}`);
      } catch (error: any) {
        console.error(`❌ Failed to create partner ${partner.name}:`, error.message);
      }
    }

    // 3. Seed Offers (associate with partners)
    console.log('\n🎁 Creating demo offers...');
    for (let i = 0; i < demoOffers.length; i++) {
      const offer = demoOffers[i];
      const partner = createdPartners[i % createdPartners.length]; // Distribute offers among partners

      try {
        const offerData = {
          ...offer,
          partnerId: partner?.id,
          venueId: partner?.venueId, // If partner has venues
        };

        const response = await apiService.post('/offers', offerData);
        console.log(`✅ Created offer: ${offer.title}`);
      } catch (error: any) {
        console.error(`❌ Failed to create offer ${offer.title}:`, error.message);
      }
    }

    console.log('\n✨ Database seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - Users: ${demoUsers.length}`);
    console.log(`   - Partners: ${demoPartners.length}`);
    console.log(`   - Offers: ${demoOffers.length}`);
    console.log('\n🔑 Demo Credentials:');
    console.log('   User: demo@boomcard.bg / demo123');
    console.log('   Partner: partner@boomcard.bg / partner123');
    console.log('   Admin: admin@boomcard.bg / admin123');

  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Export the data for reference
export { demoUsers, demoPartners, demoOffers };

// Run seeder if executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('\n✅ Seeding process completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Seeding process failed:', error);
      process.exit(1);
    });
}

export default seedDatabase;
