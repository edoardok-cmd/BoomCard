import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import styled from 'styled-components';
import Card from '../components/common/Card/Card';
import Button from '../components/common/Button/Button';
import Carousel from '../components/common/Carousel/Carousel';
import OfferCard, { Offer } from '../components/common/OfferCard/OfferCard';
import HeroBlast from '../components/common/HeroBlast/HeroBlast';
import { useLanguage } from '../contexts/LanguageContext';
import { useTopOffers } from '../hooks/useOffers';

// Styled components for category cards
const CategoryCard = styled(motion.div)`
  height: 100%;
  display: flex;
  flex-direction: column;
`;

const CategoryImageContainer = styled.div<{ $imageUrl?: string }>`
  width: 100%;
  height: 200px;
  background: ${props => props.$imageUrl ? `url(${props.$imageUrl})` : '#f3f4f6'};
  background-size: cover;
  background-position: center;
  overflow: hidden;
  transition: all 300ms;
  border-radius: 0.75rem 0.75rem 0 0;

  ${CategoryCard}:hover & {
    transform: scale(1.05);
  }
`;

const CategoryContent = styled.div`
  padding: 2rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  text-align: center;

  @media (max-width: 768px) {
    padding: 1.5rem;
  }
`;

const HomePage: React.FC = () => {
  const { language, t } = useLanguage();
  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 300], [1, 0]);
  const heroScale = useTransform(scrollY, [0, 300], [1, 0.95]);

  // Fetch top offers from API
  const { data: topOffersData, isLoading: isLoadingOffers } = useTopOffers(6);
  const topOffers = topOffersData || [];

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
      title: t('home.restaurantsBars'),
      description: t('home.restaurantsBarsDesc'),
      icon: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=400&fit=crop',
      count: 150,
      path: '/categories/restaurants'
    },
    {
      title: t('home.hotelsSpa'),
      description: t('home.hotelsSpaDesc'),
      icon: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&h=400&fit=crop',
      count: 80,
      path: '/categories/hotels'
    },
    {
      title: t('home.wineries'),
      description: t('home.wineriesDesc'),
      icon: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=400&h=400&fit=crop',
      count: 45,
      path: '/categories/wineries'
    },
    {
      title: t('home.experiences'),
      description: t('home.experiencesDesc'),
      icon: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=400&h=400&fit=crop',
      count: 120,
      path: '/categories/experiences'
    }
  ];

  return (
    <div className="bg-white">
      {/* Hero Section with Blast Video */}
      <HeroBlast language={language} />

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
                  {t('home.topOffers')}
                </h2>
                <p className="text-xl text-gray-600">
                  {t('home.topOffersSubtitle')}
                </p>
              </div>
              <Link to="/top-offers" className="hidden md:block">
                <Button variant="ghost">
                  {t('common.viewAll')}
                </Button>
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={offersInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {isLoadingOffers ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
                <p className="mt-4 text-gray-600">Loading top offers...</p>
              </div>
            ) : topOffers.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <p className="text-xl text-gray-600 mb-4">
                  {language === 'bg' ? 'Няма налични оферти в момента' : 'No offers available at the moment'}
                </p>
                <p className="text-sm text-gray-500">
                  {language === 'bg'
                    ? 'Офертите ще се зареждат от API сървъра. Моля, уверете се, че има създадени оферти в базата данни.'
                    : 'Offers will be loaded from the API server. Please make sure there are offers created in the database.'}
                </p>
              </div>
            ) : (
              <Carousel
                autoPlay={true}
                interval={6000}
                itemsToShow={{ mobile: 1, tablet: 2, desktop: 3 }}
              >
                {topOffers.map((offer) => (
                  <OfferCard key={offer.id} offer={offer} language={language} />
                ))}
              </Carousel>
            )}
          </motion.div>

          <div className="mt-8 text-center md:hidden">
            <Link to="/top-offers">
              <Button variant="ghost" size="large">
                {t('common.viewAll')}
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
              {t('home.categories')}
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {t('home.categoriesSubtitle')}
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {categories.map((category, index) => (
              <CategoryCard
                key={index}
                initial={{ opacity: 0, y: 30 }}
                animate={categoriesInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <Link to={category.path} style={{ textDecoration: 'none', height: '100%', display: 'flex' }}>
                  <Card>
                    <CategoryImageContainer $imageUrl={category.icon} />
                    <CategoryContent>
                      <h3 className="text-xl font-semibold mb-2 text-gray-900">
                        {category.title}
                      </h3>
                      <p className="text-gray-600 mb-4 text-sm leading-relaxed">
                        {category.description}
                      </p>
                      <div className="text-sm font-medium text-gray-500 mt-auto">
                        {category.count} {t('home.places')}
                      </div>
                    </CategoryContent>
                  </Card>
                </Link>
              </CategoryCard>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="section bg-white">
        <div className="container-custom">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              {t('home.howItWorks')}
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {t('home.howItWorksSubtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                step: '1',
                title: 'step1Title',
                desc: 'step1Description'
              },
              {
                step: '2',
                title: 'step2Title',
                desc: 'step2Description'
              },
              {
                step: '3',
                title: 'step3Title',
                desc: 'step3Description'
              }
            ].map((item, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-black text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold mb-3 text-gray-900">
                  {t(`home.${item.title}`)}
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  {t(`home.${item.desc}`)}
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
              {t('home.readyToSave')}
            </h2>
            <p className="text-xl mb-10 opacity-90 leading-relaxed">
              {t('home.readyToSaveDescription')}
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link to="/register">
                <Button variant="secondary" size="large">
                  {t('home.signUpFree')}
                </Button>
              </Link>
              <Link to="/partners">
                <Button variant="secondary" size="large">
                  {t('home.forPartners')}
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