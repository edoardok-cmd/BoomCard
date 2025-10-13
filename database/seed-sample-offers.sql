-- BoomCard Sample Offers Seed Script
-- Run this script to populate the database with test offers
-- This will allow the homepage "Top Offers" section to display data

-- ============================================
-- STEP 1: Create Sample Partners
-- ============================================

INSERT INTO partners (
  id,
  name,
  name_bg,
  email,
  phone,
  city,
  category,
  is_verified,
  is_premium,
  rating,
  review_count,
  created_at
)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655440001',
    'Grand Hotel Sofia',
    'Гранд Хотел София',
    'contact@grandhotelsofia.bg',
    '+359 2 123 4567',
    'Sofia',
    'Hotels',
    true,
    true,
    4.8,
    156,
    CURRENT_TIMESTAMP
  ),
  (
    '550e8400-e29b-41d4-a716-446655440002',
    'Wine & Dine Restaurant',
    'Ресторант Wine & Dine',
    'info@wineanddine.bg',
    '+359 2 234 5678',
    'Sofia',
    'Restaurants',
    true,
    true,
    4.7,
    234,
    CURRENT_TIMESTAMP
  ),
  (
    '550e8400-e29b-41d4-a716-446655440003',
    'Spa Retreat Bansko',
    'Спа Ритрийт Банско',
    'info@sparetreat.bg',
    '+359 749 123456',
    'Bansko',
    'Spa',
    true,
    false,
    4.9,
    89,
    CURRENT_TIMESTAMP
  ),
  (
    '550e8400-e29b-41d4-a716-446655440004',
    'Sky Adventures',
    'Скай Адвенчърс',
    'contact@skyadventures.bg',
    '+359 888 123456',
    'Rila',
    'Experiences',
    true,
    false,
    4.8,
    167,
    CURRENT_TIMESTAMP
  ),
  (
    '550e8400-e29b-41d4-a716-446655440005',
    'Beachfront Hotel Varna',
    'Крайбрежен Хотел Варна',
    'info@beachfrontvarna.bg',
    '+359 52 123456',
    'Varna',
    'Hotels',
    true,
    true,
    4.6,
    203,
    CURRENT_TIMESTAMP
  ),
  (
    '550e8400-e29b-41d4-a716-446655440006',
    'Villa Melnik Winery',
    'Вила Мелник Винарна',
    'info@villamelnik.bg',
    '+359 743 123456',
    'Melnik',
    'Wineries',
    true,
    true,
    4.9,
    178,
    CURRENT_TIMESTAMP
  )
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- STEP 2: Create Featured Top Offers
-- ============================================

INSERT INTO offers (
  id,
  title,
  title_bg,
  description,
  description_bg,
  discount,
  original_price,
  discounted_price,
  category,
  category_bg,
  location,
  city,
  image_url,
  partner_id,
  partner_name,
  is_featured,
  is_active,
  rating,
  review_count,
  redemptions,
  created_at
)
VALUES
  -- Offer 1: Luxury Hotel Suite (50% discount - TOP)
  (
    '660e8400-e29b-41d4-a716-446655440001',
    'Luxury Suite with Breakfast',
    'Луксозен Апартамент със Закуска',
    'Experience luxury at its finest with our premium suite including complimentary breakfast for two, spa access, and stunning city views.',
    'Изживейте лукс на най-високо ниво с нашия премиум апартамент с включена закуска за двама, достъп до спа и зашеметяваща градска гледка.',
    50.00,
    600.00,
    300.00,
    'hotels',
    'Хотели',
    'Sofia Center',
    'Sofia',
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
    '550e8400-e29b-41d4-a716-446655440001',
    'Grand Hotel Sofia',
    true,
    true,
    4.8,
    156,
    89,
    CURRENT_TIMESTAMP
  ),

  -- Offer 2: Spa Package (45% discount)
  (
    '660e8400-e29b-41d4-a716-446655440002',
    'Full Day Spa Package',
    'Целодневен Спа Пакет',
    'Relax and rejuvenate with our premium spa package including massage, sauna, thermal pools, and aromatherapy.',
    'Релаксирайте и се подмладете с нашия премиум спа пакет включващ масаж, сауна, термални басейни и ароматерапия.',
    45.00,
    220.00,
    121.00,
    'spa',
    'Спа',
    'Bansko Resort',
    'Bansko',
    'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800',
    '550e8400-e29b-41d4-a716-446655440003',
    'Spa Retreat Bansko',
    true,
    true,
    4.9,
    89,
    134,
    CURRENT_TIMESTAMP
  ),

  -- Offer 3: Wine Tasting (40% discount)
  (
    '660e8400-e29b-41d4-a716-446655440003',
    'Premium Wine Tasting Experience',
    'Премиум Дегустация на Вино',
    'Sample our finest Bulgarian wines paired with local cheeses and charcuterie in our historic wine cellar.',
    'Опитайте нашите най-добри български вина съчетани с местни сирена и деликатеси в нашата историческа винарска изба.',
    40.00,
    150.00,
    90.00,
    'gastronomy',
    'Гастрономия',
    'Melnik Wine Region',
    'Melnik',
    'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800',
    '550e8400-e29b-41d4-a716-446655440006',
    'Villa Melnik Winery',
    true,
    true,
    4.9,
    178,
    256,
    CURRENT_TIMESTAMP
  ),

  -- Offer 4: Fine Dining (35% discount)
  (
    '660e8400-e29b-41d4-a716-446655440004',
    'Gourmet Dinner for Two',
    'Гурме Вечеря за Двама',
    'Indulge in a 5-course tasting menu expertly paired with premium wines selected by our sommelier.',
    '5-курсово дегустационно меню майсторски съчетано с премиум вина подбрани от нашия сомелиер.',
    35.00,
    200.00,
    130.00,
    'restaurants',
    'Ресторанти',
    'Sofia Downtown',
    'Sofia',
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
    '550e8400-e29b-41d4-a716-446655440002',
    'Wine & Dine Restaurant',
    true,
    true,
    4.7,
    234,
    178,
    CURRENT_TIMESTAMP
  ),

  -- Offer 5: Adventure Experience (30% discount)
  (
    '660e8400-e29b-41d4-a716-446655440005',
    'Paragliding Adventure',
    'Парапланерно Приключение',
    'Soar through the skies above the stunning Rila Mountains with our experienced instructors. Includes photos and video.',
    'Излетете в небето над зашеметяващите Рилски планини с нашите опитни инструктори. Включва снимки и видео.',
    30.00,
    250.00,
    175.00,
    'adventure',
    'Приключенски',
    'Rila Mountains',
    'Rila',
    'https://images.unsplash.com/photo-1534787238916-9ba6764efd4f?w=800',
    '550e8400-e29b-41d4-a716-446655440004',
    'Sky Adventures',
    true,
    true,
    4.8,
    167,
    203,
    CURRENT_TIMESTAMP
  ),

  -- Offer 6: Beach Resort (35% discount)
  (
    '660e8400-e29b-41d4-a716-446655440006',
    'Romantic Beachfront Suite',
    'Романтичен Апартамент на Плажа',
    'Wake up to spectacular ocean views in our exclusive beachfront suite with private balcony and champagne breakfast.',
    'Събудете се с впечатляваща гледка към океана в нашия ексклузивен апартамент на плажа с частен балкон и закуска с шампанско.',
    35.00,
    450.00,
    292.50,
    'hotels',
    'Хотели',
    'Varna Beach',
    'Varna',
    'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800',
    '550e8400-e29b-41d4-a716-446655440005',
    'Beachfront Hotel Varna',
    true,
    true,
    4.6,
    203,
    145,
    CURRENT_TIMESTAMP
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- STEP 3: Create Additional Diverse Offers
-- ============================================

INSERT INTO offers (
  title,
  title_bg,
  description,
  description_bg,
  discount,
  original_price,
  discounted_price,
  category,
  category_bg,
  location,
  city,
  image_url,
  is_featured,
  is_active,
  rating,
  review_count,
  redemptions,
  created_at
)
VALUES
  -- Cultural experiences
  (
    'Cultural Tour of Sofia',
    'Културна Обиколка на София',
    'Explore Sofia''s rich history with visits to ancient churches, museums, and architectural landmarks.',
    'Разгледайте богатата история на София с посещения на древни църкви, музеи и архитектурни забележителности.',
    25.00,
    60.00,
    45.00,
    'cultural',
    'Културни',
    'Sofia Center',
    'Sofia',
    'https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=800',
    false,
    true,
    4.5,
    92,
    67,
    CURRENT_TIMESTAMP
  ),

  -- Mountain adventure
  (
    'Mountain Hiking Package',
    'Планински Поход Пакет',
    'Guided hike through pristine Pirin mountains with picnic lunch and professional photographer.',
    'Воден поход през девствените Пирински планини с пикник обяд и професионален фотограф.',
    20.00,
    100.00,
    80.00,
    'adventure',
    'Приключенски',
    'Pirin National Park',
    'Bansko',
    'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
    false,
    true,
    4.7,
    124,
    89,
    CURRENT_TIMESTAMP
  ),

  -- Family activities
  (
    'Family Fun Day Package',
    'Семеен Забавен Ден Пакет',
    'Perfect family day with activities for all ages including mini golf, swimming, and kids club.',
    'Перфектен семеен ден с дейности за всички възрасти включващ мини голф, плуване и детски клуб.',
    30.00,
    150.00,
    105.00,
    'family-activities',
    'Семейни Дейности',
    'Sofia',
    'Sofia',
    'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800',
    false,
    true,
    4.6,
    156,
    112,
    CURRENT_TIMESTAMP
  ),

  -- Romantic dinner
  (
    'Romantic Dinner Cruise',
    'Романтична Вечеря с Круиз',
    'Sunset dinner cruise along the Black Sea coast with live music and premium menu.',
    'Вечеря на залез слънце с круиз по Черноморието с жива музика и премиум меню.',
    25.00,
    180.00,
    135.00,
    'romantic',
    'Романтични',
    'Varna Marina',
    'Varna',
    'https://images.unsplash.com/photo-1516458210609-7e5f2f4f108e?w=800',
    false,
    true,
    4.8,
    201,
    87,
    CURRENT_TIMESTAMP
  ),

  -- Food tours
  (
    'Street Food Tour',
    'Тур на Улична Храна',
    'Discover Sofia''s best street food spots with local guide and tastings at 6 locations.',
    'Открийте най-добрите места за улична храна в София с местен водач и дегустации на 6 локации.',
    20.00,
    70.00,
    56.00,
    'food-tours',
    'Кулинарни Турове',
    'Sofia Center',
    'Sofia',
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
    false,
    true,
    4.4,
    78,
    93,
    CURRENT_TIMESTAMP
  ),

  -- Museum experience
  (
    'Museum Pass - 5 Museums',
    'Музеен Пас - 5 Музея',
    'Unlimited access to Sofia''s top 5 museums valid for 7 days.',
    'Неограничен достъп до топ 5 музея в София валиден за 7 дни.',
    40.00,
    80.00,
    48.00,
    'museums',
    'Музеи',
    'Sofia',
    'Sofia',
    'https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=800',
    false,
    true,
    4.3,
    67,
    124,
    CURRENT_TIMESTAMP
  ),

  -- Extreme sports
  (
    'White Water Rafting',
    'Рафтинг по Бели Води',
    'Navigate thrilling rapids on the Struma River with experienced guides and safety equipment.',
    'Навигирайте вълнуващи каскади на река Струма с опитни водачи и предпазно оборудване.',
    25.00,
    120.00,
    90.00,
    'extreme',
    'Екстремни',
    'Struma River',
    'Blagoevgrad',
    'https://images.unsplash.com/photo-1520209759809-a9bcb6cb3241?w=800',
    false,
    true,
    4.7,
    143,
    78,
    CURRENT_TIMESTAMP
  ),

  -- Cafe experience
  (
    'Premium Coffee Tasting',
    'Премиум Кафе Дегустация',
    'Taste 8 different specialty coffees and learn brewing techniques from master barista.',
    'Опитайте 8 различни специални кафета и научете техники за приготвяне от майстор бариста.',
    15.00,
    40.00,
    34.00,
    'cafes',
    'Кафенета',
    'Sofia Center',
    'Sofia',
    'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=800',
    false,
    true,
    4.5,
    89,
    156,
    CURRENT_TIMESTAMP
  )
ON CONFLICT DO NOTHING;

-- ============================================
-- STEP 4: Verify Data
-- ============================================

-- Check partners count
SELECT 'Partners inserted:' as status, COUNT(*) as count FROM partners;

-- Check offers count
SELECT 'Offers inserted:' as status, COUNT(*) as count FROM offers;

-- Check featured offers (should show 6 for homepage)
SELECT 'Featured offers (for homepage):' as status, COUNT(*) as count
FROM offers WHERE is_featured = true;

-- Show top offers with highest discounts
SELECT
  title,
  discount,
  original_price,
  discounted_price,
  is_featured,
  city
FROM offers
ORDER BY discount DESC
LIMIT 10;

-- ============================================
-- SUCCESS!
-- ============================================

SELECT '✅ Sample offers created successfully!' as status;
SELECT 'The homepage should now display 6 featured offers in the "Top Offers" carousel.' as info;
SELECT 'Visit http://localhost:5173 to see the offers!' as action;
