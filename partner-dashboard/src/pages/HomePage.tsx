import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import Card from '../components/common/Card/Card';
import Button from '../components/common/Button/Button';
import Carousel from '../components/common/Carousel/Carousel';
import OfferCard, { Offer } from '../components/common/OfferCard/OfferCard';

// Sample offers data - would normally come from API
const topOffers: Offer[] = [
  {
    id: '1',
    title: 'Spa Weekend in Bansko',
    titleBg: 'Спа уикенд в Банско',
    description: 'Luxury spa retreat with mountain views and premium treatments',
    descriptionBg: 'Луксозен спа център с планинска гледка и премиум третирания',
    category: 'Spa & Wellness',
    categoryBg: 'Спа и уелнес',
    location: 'Bansko',
    discount: 70,
    originalPrice: 800,
    discountedPrice: 240,
    imageUrl: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800',
    partnerName: 'Kempinski Hotel Grand Arena',
    rating: 4.8,
    reviewCount: 124,
    path: '/offers/spa-bansko-70'
  },
  {
    id: '2',
    title: 'Fine Dining Experience Sofia',
    titleBg: 'Изискана вечеря София',
    description: 'Michelin-recommended restaurant with seasonal menu',
    descriptionBg: 'Препоръчан от Michelin ресторант със сезонно меню',
    category: 'Fine Dining',
    categoryBg: 'Висока кухня',
    location: 'Sofia',
    discount: 50,
    originalPrice: 200,
    discountedPrice: 100,
    imageUrl: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
    partnerName: 'Made in Home',
    rating: 4.9,
    reviewCount: 267,
    path: '/offers/fine-dining-sofia-50'
  },
  {
    id: '3',
    title: 'Wine Tasting in Melnik',
    titleBg: 'Дегустация на вина в Мелник',
    description: 'Exclusive wine tasting with local varietals and appetizers',
    descriptionBg: 'Ексклузивна дегустация с местни сортове и мезета',
    category: 'Wineries',
    categoryBg: 'Винарни',
    location: 'Melnik',
    discount: 40,
    originalPrice: 150,
    discountedPrice: 90,
    imageUrl: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800',
    partnerName: 'Villa Melnik',
    rating: 4.7,
    reviewCount: 89,
    path: '/offers/wine-tasting-melnik-40'
  },
  {
    id: '4',
    title: 'Beach Resort Varna All-Inclusive',
    titleBg: 'Плажен курорт Варна - All Inclusive',
    description: 'Premium beachfront resort with unlimited food and drinks',
    descriptionBg: 'Премиум курорт на брега с неограничена храна и напитки',
    category: 'Hotels',
    categoryBg: 'Хотели',
    location: 'Varna',
    discount: 60,
    originalPrice: 600,
    discountedPrice: 240,
    imageUrl: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800',
    partnerName: 'Graffit Gallery Hotel',
    rating: 4.6,
    reviewCount: 342,
    path: '/offers/beach-resort-varna-60'
  },
  {
    id: '5',
    title: 'Extreme Paragliding Adventure',
    titleBg: 'Екстремно парапланерно приключение',
    description: 'Tandem paragliding flight over the mountains with instructor',
    descriptionBg: 'Тандем парапланерен полет над планината с инструктор',
    category: 'Extreme Sports',
    categoryBg: 'Екстремни спортове',
    location: 'Sopot',
    discount: 35,
    originalPrice: 280,
    discountedPrice: 182,
    imageUrl: 'https://images.unsplash.com/photo-1512227613242-e6b5e7e72c4e?w=800',
    partnerName: 'SkyHigh Adventures',
    rating: 4.9,
    reviewCount: 156,
    path: '/offers/paragliding-sopot-35'
  },
  {
    id: '6',
    title: 'Romantic Dinner Plovdiv',
    titleBg: 'Романтична вечеря Пловдив',
    description: 'Candlelit dinner for two in historic Old Town',
    descriptionBg: 'Вечеря при свещи за двама в историческия Стар град',
    category: 'Restaurants',
    categoryBg: 'Ресторанти',
    location: 'Plovdiv',
    discount: 45,
    originalPrice: 180,
    discountedPrice: 99,
    imageUrl: 'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?w=800',
    partnerName: 'Pavaj Restaurant',
    rating: 4.8,
    reviewCount: 203,
    path: '/offers/romantic-plovdiv-45'
  }
];

const HomePage: React.FC = () => {
  const [language, setLanguage] = useState<'en' | 'bg'>('en');
  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 300], [1, 0]);
  const heroScale = useTransform(scrollY, [0, 300], [1, 0.95]);

  const [offersRef, offersInView] = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const [categoriesRef, categoriesInView] = useInView({
    threshold: 0.2,
    triggerOnce: true,
  });

  const [benefitsRef, benefitsInView] = useInView({
    threshold: 0.2,
    triggerOnce: true,
  });

  const categories = [
    {
      title: language === 'bg' ? 'Ресторанти и Барове' : 'Restaurants & Bars',
      description: language === 'bg' ? 'Открийте над 150 заведения с отстъпки до 70%' : 'Discover 150+ venues with up to 70% off',
      icon: '🍽️',
      count: 150,
      path: '/categories/restaurants'
    },
    {
      title: language === 'bg' ? 'Хотели и СПА' : 'Hotels & Spa',
      description: language === 'bg' ? 'Луксозни престои и спа третирания' : 'Luxury stays and spa treatments',
      icon: '🏨',
      count: 80,
      path: '/categories/hotels'
    },
    {
      title: language === 'bg' ? 'Винарни' : 'Wineries',
      description: language === 'bg' ? 'Дегустации и винени турове' : 'Wine tastings and vineyard tours',
      icon: '🍷',
      count: 45,
      path: '/categories/wineries'
    },
    {
      title: language === 'bg' ? 'Изживявания' : 'Experiences',
      description: language === 'bg' ? 'Незабравими преживявания и приключения' : 'Unforgettable adventures and activities',
      icon: '🎯',
      count: 120,
      path: '/categories/experiences'
    }
  ];

  return (
    <div className="bg-white">
      {/* Hero Section */}
      <motion.section
        className="section-hero relative overflow-hidden"
        style={{ opacity: heroOpacity, scale: heroScale }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-white to-gray-100 -z-10" />

        <div className="container-custom text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 tracking-tight leading-tight">
              {language === 'bg' ? (
                <>Открийте България<br />с <span className="text-gradient">BoomCard</span></>
              ) : (
                <>Discover Bulgaria<br />with <span className="text-gradient">BoomCard</span></>
              )}
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 mb-12 max-w-3xl mx-auto font-light">
              {language === 'bg'
                ? 'Ексклузивни отстъпки за ресторанти, хотели, спа центрове и изживявания'
                : 'Exclusive discounts for restaurants, hotels, spas, and experiences'}
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4 items-center">
              <Link to="/register">
                <Button variant="primary" size="large">
                  {language === 'bg' ? 'Започнете сега' : 'Get Started'}
                </Button>
              </Link>
              <Link to="/categories">
                <Button variant="secondary" size="large">
                  {language === 'bg' ? 'Разгледайте оферти' : 'Browse Offers'}
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* Top Offers Carousel */}
      <section ref={offersRef} className="section bg-white">
        <div className="container-custom">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={offersInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="mb-12"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">
                  {language === 'bg' ? 'ТОП оферти' : 'Top Offers'}
                </h2>
                <p className="text-xl text-gray-600">
                  {language === 'bg'
                    ? 'Най-големите отстъпки в момента'
                    : 'Biggest discounts right now'}
                </p>
              </div>
              <Link to="/top-offers" className="hidden md:block">
                <Button variant="ghost">
                  {language === 'bg' ? 'Вижте всички' : 'View all'}
                </Button>
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={offersInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Carousel
              autoPlay={true}
              interval={6000}
              itemsToShow={{ mobile: 1, tablet: 2, desktop: 3 }}
            >
              {topOffers.map((offer) => (
                <OfferCard key={offer.id} offer={offer} language={language} />
              ))}
            </Carousel>
          </motion.div>

          <div className="mt-8 text-center md:hidden">
            <Link to="/top-offers">
              <Button variant="ghost" size="large">
                {language === 'bg' ? 'Вижте всички оферти' : 'View all offers'}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section ref={categoriesRef} className="section bg-gradient-to-b from-white to-gray-50">
        <div className="container-custom">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={categoriesInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              {language === 'bg' ? 'Категории' : 'Categories'}
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {language === 'bg'
                ? 'Разгледайте нашите категории заведения и изживявания'
                : 'Browse our categories of venues and experiences'}
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {categories.map((category, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                animate={categoriesInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <Link to={category.path} style={{ textDecoration: 'none' }}>
                  <Card>
                    <div className="text-center">
                      <div className="text-5xl mb-4">{category.icon}</div>
                      <h3 className="text-xl font-semibold mb-2 text-gray-900">
                        {category.title}
                      </h3>
                      <p className="text-gray-600 mb-4 text-sm leading-relaxed">
                        {category.description}
                      </p>
                      <div className="text-sm font-medium text-gray-500">
                        {category.count} {language === 'bg' ? 'места' : 'places'}
                      </div>
                    </div>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="section bg-white">
        <div className="container-custom">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              {language === 'bg' ? 'Как работи' : 'How it works'}
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {language === 'bg'
                ? 'Прост и бърз начин да спестите пари'
                : 'Simple and fast way to save money'}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                step: '1',
                titleEn: 'Choose your offer',
                titleBg: 'Изберете оферта',
                descEn: 'Browse through hundreds of exclusive offers',
                descBg: 'Разгледайте стотици ексклузивни оферти'
              },
              {
                step: '2',
                titleEn: 'Get your QR code',
                titleBg: 'Вземете QR код',
                descEn: 'Receive your unique discount QR code instantly',
                descBg: 'Получете уникален QR код за отстъпка веднага'
              },
              {
                step: '3',
                titleEn: 'Enjoy & Save',
                titleBg: 'Насладете се',
                descEn: 'Show your code at the venue and enjoy your discount',
                descBg: 'Покажете кода на място и се насладете на отстъпката'
              }
            ].map((item, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-black text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold mb-3 text-gray-900">
                  {language === 'bg' ? item.titleBg : item.titleEn}
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  {language === 'bg' ? item.descBg : item.descEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section ref={benefitsRef} className="section bg-gradient-to-b from-white to-gray-50">
        <div className="container-custom">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={benefitsInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="max-w-4xl mx-auto text-center bg-black text-white rounded-3xl p-12 md:p-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              {language === 'bg' ? 'Готови да спестите?' : 'Ready to save?'}
            </h2>
            <p className="text-xl mb-10 opacity-90 leading-relaxed">
              {language === 'bg'
                ? 'Присъединете се към хиляди българи, които вече спестяват с BoomCard'
                : 'Join thousands of Bulgarians already saving with BoomCard'}
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link to="/register">
                <Button variant="secondary" size="large">
                  {language === 'bg' ? 'Регистрирайте се безплатно' : 'Sign up free'}
                </Button>
              </Link>
              <Link to="/partners">
                <Button variant="secondary" size="large">
                  {language === 'bg' ? 'За партньори' : 'For partners'}
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;