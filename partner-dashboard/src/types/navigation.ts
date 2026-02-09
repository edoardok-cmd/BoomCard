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
      id: 'offers',
      label: 'Top Discounts',
      labelBg: 'Топ отстъпки',
      path: '/offers',
    },
    {
      id: 'venues',
      label: 'BOOM Places',
      labelBg: 'BOOM Места',
      path: '/venues',
      children: [
        {
          id: 'restaurants',
          label: 'Restaurants & Food',
          labelBg: 'Ресторанти и храна',
          path: '/venues/restaurants',
          children: [
            {
              id: 'curated',
              label: 'Curated',
              labelBg: 'Подбрани',
              path: '/venues/restaurants?type=curated',
            },
            {
              id: 'fast-food',
              label: 'Fast Food',
              labelBg: 'Бърза храна',
              path: '/venues/restaurants?type=fast-food',
            },
            {
              id: 'traditional',
              label: 'Traditional Cuisine',
              labelBg: 'Традиционна кухня',
              path: '/venues/restaurants?type=traditional',
            },
            {
              id: 'vegetarian-vegan',
              label: 'Vegetarian & Vegan',
              labelBg: 'Вегетарианско и веган',
              path: '/venues/restaurants?type=vegetarian-vegan',
            },
          ],
        },
        {
          id: 'hotels',
          label: 'Accommodation',
          labelBg: 'Настаняване',
          path: '/venues/hotels',
          children: [
            {
              id: 'boutique-hotels',
              label: 'Boutique Hotels',
              labelBg: 'Бутикови хотели',
              path: '/venues/hotels?type=boutique',
            },
            {
              id: 'resort-hotels',
              label: 'Resort Hotels',
              labelBg: 'Курортни хотели',
              path: '/venues/hotels?type=resort',
            },
            {
              id: 'guest-houses',
              label: 'Guest Houses',
              labelBg: 'Къщи за гости',
              path: '/venues/hotels?type=guest-house',
            },
          ],
        },
        {
          id: 'spa',
          label: 'Spa & Wellness',
          labelBg: 'СПА и уелнес',
          path: '/venues/spa',
          children: [
            {
              id: 'day-spa',
              label: 'Day Spa',
              labelBg: 'Дневен СПА',
              path: '/venues/spa?type=day-spa',
            },
            {
              id: 'wellness-centers',
              label: 'Wellness Centers',
              labelBg: 'Уелнес центрове',
              path: '/venues/spa?type=wellness',
            },
          ],
        },
        {
          id: 'rooftop',
          label: 'Rooftop & Sky Places',
          labelBg: 'Rooftop и Sky места',
          path: '/venues/rooftop',
          children: [
            {
              id: 'rooftop-bars',
              label: 'Rooftop Bars',
              labelBg: 'Rooftop барове',
              path: '/venues/rooftop?type=bar',
            },
            {
              id: 'sky-restaurants',
              label: 'Sky Restaurants',
              labelBg: 'Sky ресторанти',
              path: '/venues/rooftop?type=restaurant',
            },
          ],
        },
        {
          id: 'clubs',
          label: 'Clubs & Nightlife',
          labelBg: 'Клубове и нощен живот',
          path: '/venues/clubs',
          children: [
            {
              id: 'night-clubs',
              label: 'Night Clubs',
              labelBg: 'Нощни клубове',
              path: '/venues/clubs?type=night-club',
            },
            {
              id: 'cocktail-bars',
              label: 'Cocktail Bars',
              labelBg: 'Коктейл барове',
              path: '/venues/clubs?type=cocktail-bar',
            },
          ],
        },
        {
          id: 'cafes',
          label: 'Cafes & Sweet Places',
          labelBg: 'Кафенета и сладки места',
          path: '/venues/cafes',
          children: [
            {
              id: 'specialty-coffee',
              label: 'Specialty Coffee',
              labelBg: 'Специално кафе',
              path: '/venues/cafes?type=specialty',
            },
            {
              id: 'pastry-shops',
              label: 'Pastry Shops',
              labelBg: 'Сладкарници',
              path: '/venues/cafes?type=pastry',
            },
          ],
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
          id: 'gastronomic-exp',
          label: 'Gastronomic',
          labelBg: 'Гастрономични',
          path: '/experiences/gastronomic',
          children: [
            {
              id: 'degustations',
              label: 'Degustations',
              labelBg: 'Дегустации',
              path: '/experiences/gastronomic/degustations',
            },
            {
              id: 'food-traditions',
              label: 'Food & Traditions',
              labelBg: 'Храна и традиции',
              path: '/experiences/gastronomic/food-traditions',
            },
          ],
        },
        {
          id: 'historical-cultural-exp',
          label: 'Historical & Cultural',
          labelBg: 'Исторически и културни',
          path: '/experiences/historical-cultural',
          children: [
            {
              id: 'walking-tours',
              label: 'Walking Tours',
              labelBg: 'Пешеходни турове',
              path: '/experiences/historical-cultural/walking-tours',
            },
            {
              id: 'historical-tours',
              label: 'Historical Tours',
              labelBg: 'Исторически обиколки',
              path: '/experiences/historical-cultural/historical-tours',
            },
            {
              id: 'museums-galleries',
              label: 'Museums & Galleries',
              labelBg: 'Музеи и галерии',
              path: '/experiences/historical-cultural/museums-galleries',
            },
          ],
        },
        {
          id: 'active-adventure-exp',
          label: 'Active & Adventure',
          labelBg: 'Активни и приключенски',
          path: '/experiences/active-adventure',
          children: [
            {
              id: 'nature-tours',
              label: 'Nature Tours',
              labelBg: 'Природни турове',
              path: '/experiences/active-adventure/nature-tours',
            },
            {
              id: 'bike-tours',
              label: 'Bike Tours',
              labelBg: 'Велотурове',
              path: '/experiences/active-adventure/bike-tours',
            },
            {
              id: 'offroad-atv',
              label: 'Offroad & ATV',
              labelBg: 'Offroad и ATV',
              path: '/experiences/active-adventure/offroad-atv',
            },
            {
              id: 'water-activities',
              label: 'Water Activities',
              labelBg: 'Водни активности',
              path: '/experiences/active-adventure/water-activities',
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
              id: 'aerial',
              label: 'Aerial',
              labelBg: 'Въздушни',
              path: '/experiences/extreme/aerial',
            },
            {
              id: 'jumping',
              label: 'Jumping',
              labelBg: 'Скокове',
              path: '/experiences/extreme/jumping',
            },
            {
              id: 'motorcycles',
              label: 'Motorcycles',
              labelBg: 'Мотори',
              path: '/experiences/extreme/motorcycles',
            },
            {
              id: 'water-extreme',
              label: 'Water',
              labelBg: 'Водни',
              path: '/experiences/extreme/water',
            },
          ],
        },
        {
          id: 'educational-creative-exp',
          label: 'Educational & Creative',
          labelBg: 'Образователни и творчески',
          path: '/experiences/educational-creative',
          children: [
            {
              id: 'cooking',
              label: 'Cooking',
              labelBg: 'Готварство',
              path: '/experiences/educational-creative/cooking',
            },
            {
              id: 'workshops',
              label: 'Workshops',
              labelBg: 'Работилници',
              path: '/experiences/educational-creative/workshops',
            },
            {
              id: 'arts',
              label: 'Arts',
              labelBg: 'Изкуства',
              path: '/experiences/educational-creative/arts',
            },
          ],
        },
        {
          id: 'relax-wellness-exp',
          label: 'Relax & Wellness',
          labelBg: 'Релакс и уелнес',
          path: '/experiences/relax-wellness',
          children: [
            {
              id: 'spa-thermal',
              label: 'SPA & Thermal',
              labelBg: 'SPA и термални',
              path: '/experiences/relax-wellness/spa-thermal',
            },
            {
              id: 'massages-therapies',
              label: 'Massages & Therapies',
              labelBg: 'Масажи и терапии',
              path: '/experiences/relax-wellness/massages-therapies',
            },
            {
              id: 'relax-experiences',
              label: 'Relax Experiences',
              labelBg: 'Релакс преживявания',
              path: '/experiences/relax-wellness/relax-experiences',
            },
            {
              id: 'yoga-meditation',
              label: 'Yoga & Meditation',
              labelBg: 'Йога и медитация',
              path: '/experiences/relax-wellness/yoga-meditation',
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
    },
    // Hidden: Integrations menu item
    // {
    //   id: 'integrations',
    //   label: 'Integrations',
    //   labelBg: 'Интеграции',
    //   path: '/integrations',
    // },
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
