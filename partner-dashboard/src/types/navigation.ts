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
    },
    {
      id: 'promotions',
      label: 'Offers',
      labelBg: 'Оферти',
      path: '/promotions',
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
