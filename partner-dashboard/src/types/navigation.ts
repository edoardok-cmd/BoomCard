/**
 * Navigation types based on menu structure
 */

export interface MenuItem {
  id: string;
  label: string;
  labelBg: string;
  path: string;
  children?: MenuItem[];
}

export interface NavConfig {
  main: MenuItem[];
  footer: {
    aboutUs: MenuItem[];
    termsConditions: MenuItem[];
    contacts: MenuItem[];
  };
}

/**
 * Complete navigation structure
 */
export const navigationConfig: NavConfig = {
  main: [
    {
      id: 'home',
      label: 'Home',
      labelBg: 'Начало',
      path: '/',
      children: [
        {
          id: 'top-offers',
          label: 'Top Offers with Biggest Discounts',
          labelBg: 'ТОП оферти с най-големи отстъпки',
          path: '/top-offers',
          children: [
            {
              id: 'spa-bansko',
              label: 'Spa Weekend in Bansko – 70%',
              labelBg: 'Спа уикенд в Банско – 70% (2 нощувки, СПА, масаж, вечеря)',
              path: '/offers/spa-bansko-70',
            },
            {
              id: 'wine-melnik',
              label: 'Wine Tasting in Melnik – 50%',
              labelBg: 'Дегустация вина в Мелник – 50% (5 вида вина, мезета, тур, сертификат)',
              path: '/offers/wine-melnik-50',
            },
            {
              id: 'romantic-dinner',
              label: 'Romantic Dinner for Two – 60%',
              labelBg: 'Романтична вечеря за двама – 60%',
              path: '/offers/romantic-dinner-60',
            },
            {
              id: 'adventure-rila',
              label: 'Adventure Tour in Rila – 45%',
              labelBg: 'Приключенски тур в Рила – 45%',
              path: '/offers/adventure-rila-45',
            },
          ],
        },
        {
          id: 'photos-videos',
          label: 'Photos/Videos',
          labelBg: 'Картинки/видео',
          path: '/media',
          children: [
            {
              id: 'gallery',
              label: 'Photo Gallery, 360° Tours, Video Reviews, Promo Videos, Drone Footage',
              labelBg: 'Галерия със снимки, 360° обиколки, видео ревюта, промо видеа, дрон кадри',
              path: '/media/gallery',
            },
            {
              id: 'photos-type',
              label: 'Photos by Type',
              labelBg: 'Снимки: Exterior/Interior, Food, Activity, Before/After',
              path: '/media/photos',
            },
            {
              id: 'videos-type',
              label: 'Videos by Type',
              labelBg: 'Видеа: Time-lapse, Testimonials, Behind-the-scenes, Live streaming',
              path: '/media/videos',
            },
          ],
        },
      ],
    },
    {
      id: 'promotions',
      label: 'Promotions',
      labelBg: 'Промоции',
      path: '/promotions',
      children: [
        {
          id: 'by-type',
          label: 'By Type',
          labelBg: 'По вид',
          path: '/promotions/type',
          children: [
            {
              id: 'gastronomy',
              label: 'Gastronomy',
              labelBg: 'Гастрономични: Street food, Wine & dine, Cooking, Farm-to-table',
              path: '/promotions/gastronomy',
            },
            {
              id: 'extreme',
              label: 'Extreme',
              labelBg: 'Екстремни: Въздушни, Водни, Планински, Зимни',
              path: '/promotions/extreme',
            },
            {
              id: 'cultural',
              label: 'Cultural',
              labelBg: 'Културни, Романтични, Семейни, Учебни',
              path: '/promotions/cultural',
            },
          ],
        },
      ],
    },
    {
      id: 'categories',
      label: 'Categories',
      labelBg: 'Заведения',
      path: '/categories',
      children: [
        {
          id: 'restaurants',
          label: 'Restaurants & Bars',
          labelBg: 'Ресторанти и барове',
          path: '/categories/restaurants',
          children: [
            {
              id: 'restaurant-types',
              label: 'Restaurant Types',
              labelBg: 'Fine dining, Casual, Fast casual, Етнически',
              path: '/categories/restaurants/types',
            },
          ],
        },
        {
          id: 'hotels',
          label: 'Hotels & Guest Houses',
          labelBg: 'Хотели и къщи за гости',
          path: '/categories/hotels',
          children: [
            {
              id: 'hotel-types',
              label: 'Accommodation Types',
              labelBg: 'Бутик, Бизнес, Курортни, Семейни',
              path: '/categories/hotels/types',
            },
          ],
        },
        {
          id: 'spa',
          label: 'Spa & Wellness Centers',
          labelBg: 'Спа и уелнес центрове',
          path: '/categories/spa',
        },
        {
          id: 'wineries',
          label: 'Wineries & Tasting Halls',
          labelBg: 'Винарни и дегустационни зали',
          path: '/categories/wineries',
        },
        {
          id: 'clubs',
          label: 'Clubs & Night Venues',
          labelBg: 'Клубове и нощни заведения',
          path: '/categories/clubs',
        },
        {
          id: 'cafes',
          label: 'Cafes & Pastry Shops',
          labelBg: 'Кафенета и сладкарници',
          path: '/categories/cafes',
        },
      ],
    },
    {
      id: 'experiences',
      label: 'Experiences',
      labelBg: 'Изживявания',
      path: '/experiences',
      children: [
        {
          id: 'gastronomy-exp',
          label: 'Gastronomy',
          labelBg: 'Гастрономични',
          path: '/experiences/gastronomy',
          children: [
            {
              id: 'food-tours',
              label: 'Food Experiences',
              labelBg: 'Street food tours, Wine & dine tours, Cooking classes, Farm-to-table',
              path: '/experiences/gastronomy/food-tours',
            },
          ],
        },
        {
          id: 'extreme-exp',
          label: 'Extreme',
          labelBg: 'Екстремни',
          path: '/experiences/extreme',
          children: [
            {
              id: 'adventure',
              label: 'Adventure Activities',
              labelBg: 'Въздушни, Водни, Планински, Зимни',
              path: '/experiences/extreme/adventure',
            },
          ],
        },
        {
          id: 'cultural-exp',
          label: 'Cultural',
          labelBg: 'Културни',
          path: '/experiences/cultural',
          children: [
            {
              id: 'culture',
              label: 'Cultural Activities',
              labelBg: 'Музеи, Галерии, Исторически места',
              path: '/experiences/cultural/museums',
            },
          ],
        },
        {
          id: 'romantic-exp',
          label: 'Romantic',
          labelBg: 'Романтични',
          path: '/experiences/romantic',
          children: [
            {
              id: 'romantic-activities',
              label: 'Romantic Experiences',
              labelBg: 'Вечери, СПА, Фотосесии',
              path: '/experiences/romantic/activities',
            },
          ],
        },
        {
          id: 'family-exp',
          label: 'Family',
          labelBg: 'Семейни',
          path: '/experiences/family',
          children: [
            {
              id: 'family-activities',
              label: 'Family Activities',
              labelBg: 'Зоопаркове, Тематични паркове',
              path: '/experiences/family/activities',
            },
          ],
        },
        {
          id: 'educational-exp',
          label: 'Educational',
          labelBg: 'Учебни',
          path: '/experiences/educational',
          children: [
            {
              id: 'learning',
              label: 'Learning Experiences',
              labelBg: 'Готвене, Танци, Рисуване',
              path: '/experiences/educational/learning',
            },
          ],
        },
      ],
    },
    {
      id: 'locations',
      label: 'Locations',
      labelBg: 'Настаняване',
      path: '/locations',
      children: [
        {
          id: 'by-city',
          label: 'By City',
          labelBg: 'По градове',
          path: '/locations/cities',
          children: [
            {
              id: 'sofia-location',
              label: 'Sofia (150)',
              labelBg: 'София (150)',
              path: '/locations/sofia',
            },
            {
              id: 'plovdiv-location',
              label: 'Plovdiv (80)',
              labelBg: 'Пловдив (80)',
              path: '/locations/plovdiv',
            },
            {
              id: 'varna-location',
              label: 'Varna (120)',
              labelBg: 'Варна (120)',
              path: '/locations/varna',
            },
            {
              id: 'bansko-location',
              label: 'Bansko (90)',
              labelBg: 'Банско (90)',
              path: '/locations/bansko',
            },
          ],
        },
        {
          id: 'by-price',
          label: 'By Price',
          labelBg: 'По цена',
          path: '/locations/price',
          children: [
            {
              id: 'budget',
              label: '150-250 BGN (mid-range)',
              labelBg: '150-250 лв (среден клас)',
              path: '/locations/price/budget',
            },
            {
              id: 'premium',
              label: '250-400 BGN (high-end)',
              labelBg: '250-400 лв (висок клас)',
              path: '/locations/price/premium',
            },
            {
              id: 'luxury',
              label: '400+ BGN (luxury)',
              labelBg: '400+ лв (лукс)',
              path: '/locations/price/luxury',
            },
          ],
        },
        {
          id: 'by-type-location',
          label: 'By Type',
          labelBg: 'По тип',
          path: '/locations/type',
          children: [
            {
              id: 'location-types',
              label: 'Location Types',
              labelBg: 'Бизнес, Бутик, СПА, Семейни',
              path: '/locations/type/all',
            },
          ],
        },
      ],
    },
    {
      id: 'partners',
      label: 'Partners',
      labelBg: 'Партньори',
      path: '/partners',
      children: [
        {
          id: 'by-category-partners',
          label: 'By Category',
          labelBg: 'По категории',
          path: '/partners/categories',
          children: [
            {
              id: 'restaurant-partners',
              label: 'Restaurants',
              labelBg: 'Ресторанти',
              path: '/partners/restaurants',
            },
          ],
        },
        {
          id: 'by-region',
          label: 'By Region',
          labelBg: 'По региони',
          path: '/partners/regions',
          children: [
            {
              id: 'sofia-partners',
              label: 'Sofia (150)',
              labelBg: 'София (150)',
              path: '/partners/sofia',
            },
            {
              id: 'plovdiv-partners',
              label: 'Plovdiv (80)',
              labelBg: 'Пловдив (80)',
              path: '/partners/plovdiv',
            },
            {
              id: 'varna-partners',
              label: 'Varna (120)',
              labelBg: 'Варна (120)',
              path: '/partners/varna',
            },
            {
              id: 'bansko-partners',
              label: 'Bansko (90)',
              labelBg: 'Банско (90)',
              path: '/partners/bansko',
            },
          ],
        },
        {
          id: 'by-status',
          label: 'By Status',
          labelBg: 'По статус',
          path: '/partners/status',
          children: [
            {
              id: 'new-partners',
              label: 'New Partners',
              labelBg: 'Нови',
              path: '/partners/new',
            },
            {
              id: 'vip-partners',
              label: 'VIP Partners',
              labelBg: 'VIP',
              path: '/partners/vip',
            },
            {
              id: 'exclusive-partners',
              label: 'Exclusive Partners',
              labelBg: 'Ексклузивни',
              path: '/partners/exclusive',
            },
          ],
        },
      ],
    },
    {
      id: 'integrations',
      label: 'Integrations',
      labelBg: 'Интеграции',
      path: '/integrations',
    },
  ],
  footer: {
    aboutUs: [
      {
        id: 'about',
        label: 'About Us',
        labelBg: 'За нас',
        path: '/about',
      },
      {
        id: 'subscriptions',
        label: 'Subscriptions',
        labelBg: 'Абонаменти',
        path: '/subscriptions',
      },
      {
        id: 'partners-footer',
        label: 'Partners',
        labelBg: 'Партньори',
        path: '/partners',
      },
      {
        id: 'contacts-footer',
        label: 'Contacts',
        labelBg: 'Контакти',
        path: '/contacts',
      },
    ],
    termsConditions: [
      {
        id: 'terms',
        label: 'Terms & Conditions',
        labelBg: 'Общи условия',
        path: '/terms',
      },
      {
        id: 'privacy',
        label: 'Privacy Policy',
        labelBg: 'Политика за поверителност',
        path: '/privacy',
      },
      {
        id: 'faq',
        label: 'FAQ',
        labelBg: 'ЧЗВ',
        path: '/faq',
      },
    ],
    contacts: [
      {
        id: 'support',
        label: 'Contact & Support',
        labelBg: 'Контакт & Support',
        path: '/support',
      },
      {
        id: 'about-us-footer',
        label: 'About Us',
        labelBg: 'За нас',
        path: '/about',
      },
    ],
  },
};
