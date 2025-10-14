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
  width: 100%;
  max-width: 100%;
  margin: 0 auto;

  /* Enhanced category cards in vibrant mode */
  [data-theme="color"] & {
    position: relative;

    /* Add vibrant glow effect on hover */
    &:hover {
      filter: drop-shadow(0 15px 40px rgba(255, 69, 0, 0.4))
              drop-shadow(0 10px 35px rgba(255, 0, 110, 0.3))
              drop-shadow(0 8px 30px rgba(0, 212, 255, 0.2));
    }

    /* Make the card wrapper vibrant */
    > a > div {
      background: linear-gradient(135deg, #fff5e1 0%, #ffe4f1 50%, #e8f4ff 100%) !important;
      border: 3px solid transparent;
      position: relative;
      overflow: visible;

      &::before {
        content: '';
        position: absolute;
        inset: -3px;
        border-radius: 2rem;
        padding: 3px;
        background: linear-gradient(135deg, #ff4500 0%, #ff006e 50%, #00d4ff 100%);
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        pointer-events: none;
        z-index: -1;
      }
    }
  }

  @media (max-width: 768px) {
    max-width: 400px;
  }
`;

const CategoryImageContainer = styled.div<{ $imageUrl?: string }>`
  width: 100%;
  height: 200px;
  background: ${props => props.$imageUrl ? `url(${props.$imageUrl})` : 'var(--color-background-secondary)'};
  background-size: cover;
  background-position: center;
  overflow: hidden;
  transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 0.75rem 0.75rem 0 0;
  position: relative;

  /* Vibrant mode overlay */
  [data-theme="color"] & {
    &::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        135deg,
        rgba(255, 69, 0, 0.15) 0%,
        rgba(255, 0, 110, 0.15) 50%,
        rgba(0, 212, 255, 0.15) 100%
      );
      opacity: 0;
      transition: opacity 400ms cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: none;
    }
  }

  ${CategoryCard}:hover & {
    transform: scale(1.08);

    [data-theme="color"] &::after {
      opacity: 1;
    }
  }
`;

const CategoryContent = styled.div`
  padding: 2rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  text-align: center;
  position: relative;
  z-index: 1;

  /* Enhanced text in vibrant mode */
  [data-theme="color"] & {
    h3 {
      color: #1a0a2e !important;
      font-weight: 700 !important;
    }

    p {
      color: #6a0572 !important;
    }

    /* "XX places" count styling */
    div {
      color: #8b2fb8 !important;
      font-weight: 600 !important;
      opacity: 1 !important;
    }
  }

  @media (max-width: 768px) {
    padding: 1.5rem;
  }
`;

const StepCircle = styled.div`
  width: 4rem;
  height: 4rem;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 auto 1.5rem;
  background: var(--color-primary);
  color: var(--color-secondary);

  /* Vibrant mode - gradient circle */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #ff4500 0%, #ff006e 50%, #b24bf3 100%);
    color: #ffffff;
    box-shadow:
      0 8px 30px -5px rgba(255, 69, 0, 0.5),
      0 6px 25px -5px rgba(255, 0, 110, 0.4);
  }
`;

const CTABox = styled(motion.div)`
  max-width: 64rem;
  margin: 0 auto;
  text-align: center;
  border-radius: 1.5rem;
  padding: 3rem 4rem;
  background: var(--color-primary);
  color: var(--color-secondary);

  /* Vibrant mode - explosive gradient CTA */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #1a0a2e 0%, #6a0572 25%, #ab2567 50%, #ff006e 75%, #ff4500 100%);
    background-size: 200% 200%;
    animation: ctaGradientShift 8s ease infinite;
    color: #ffffff;
    border: 3px solid transparent;
    border-image: linear-gradient(90deg, #ff4500, #ff006e, #00d4ff, #b24bf3) 1;
    box-shadow:
      0 25px 70px -15px rgba(255, 69, 0, 0.6),
      0 20px 60px -10px rgba(255, 0, 110, 0.5),
      0 15px 50px -5px rgba(139, 47, 184, 0.4);
  }

  @keyframes ctaGradientShift {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  @media (max-width: 768px) {
    padding: 2.5rem 2rem;
  }

  @media (max-width: 640px) {
    padding: 2rem 1.5rem;
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
  console.log('HomePage: topOffersData =', topOffersData);
  console.log('HomePage: topOffers =', topOffers);
  console.log('HomePage: topOffers.length =', topOffers.length);

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
    <div>
      {/* Hero Section with Blast Video */}
      <HeroBlast language={language} />

      {/* Top Offers Carousel */}
      <section ref={offersRef} className="section">
        <div className="container-custom">
          <motion.div
            initial={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-12"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-4xl md:text-5xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                  {t('home.topOffers')}
                </h2>
                <p className="text-xl" style={{ color: 'var(--color-text-secondary)' }}>
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
            initial={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {isLoadingOffers ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--color-primary)' }}></div>
                <p className="mt-4" style={{ color: 'var(--color-text-secondary)' }}>Loading top offers...</p>
              </div>
            ) : topOffers.length === 0 ? (
              <div className="text-center py-12 rounded-lg" style={{ background: 'var(--color-background-secondary)' }}>
                <p className="text-xl mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                  {language === 'bg' ? 'Няма налични оферти в момента' : 'No offers available at the moment'}
                </p>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}>
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
                  <OfferCard key={offer.id} offer={offer} />
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
      <section ref={categoriesRef} className="section" style={{ background: 'var(--color-background-secondary)' }}>
        <div className="container-custom">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={categoriesInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>
              {t('home.categories')}
            </h2>
            <p className="text-xl max-w-2xl mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
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
                <Link to={category.path} style={{ textDecoration: 'none', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Card style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
                    <CategoryImageContainer $imageUrl={category.icon} />
                    <CategoryContent>
                      <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                        {category.title}
                      </h3>
                      <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                        {category.description}
                      </p>
                      <div className="text-sm font-medium mt-auto" style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}>
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
      <section className="section">
        <div className="container-custom">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>
              {t('home.howItWorks')}
            </h2>
            <p className="text-xl max-w-2xl mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
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
                <StepCircle>
                  {item.step}
                </StepCircle>
                <h3 className="text-xl font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
                  {t(`home.${item.title}`)}
                </h3>
                <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {t(`home.${item.desc}`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section ref={benefitsRef} className="section" style={{ background: 'var(--color-background-secondary)' }}>
        <div className="container-custom">
          <CTABox
            initial={{ opacity: 0, y: 30 }}
            animate={benefitsInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
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
          </CTABox>
        </div>
      </section>
    </div>
  );
};

export default HomePage;