import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import styled from 'styled-components';
import Card from '../components/common/Card/Card';
import Button from '../components/common/Button/Button';
import Carousel from '../components/common/Carousel/Carousel';
import OfferCard, { Offer } from '../components/common/OfferCard/OfferCard';
import HeroBlast from '../components/common/HeroBlast/HeroBlast';
import ReviewCard from '../components/reviews/ReviewCard';
import ReviewSubmissionForm from '../components/reviews/ReviewSubmissionForm';
import ClientCTA from '../components/common/ClientCTA/ClientCTA';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useTopOffers } from '../hooks/useOffers';
import { usePartnerReviews } from '../hooks/usePartnerReviews';
import { updateSEO, addOrganizationSchema, addWebSiteSchema, generateHowToSchema, generateFAQSchema } from '../utils/seo';

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
  const { user } = useAuth();
  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 300], [1, 0]);
  const heroScale = useTransform(scrollY, [0, 300], [1, 0.95]);

  // Fetch top offers from API
  const { data: topOffersData, isLoading: isLoadingOffers } = useTopOffers(6);
  const topOffers = topOffersData || [];

  // Fetch reviews from API
  const { reviews: reviewsData, loading: loadingReviews, createReview, markHelpful } = usePartnerReviews({
    filters: { status: 'APPROVED', limit: 3, sortBy: 'createdAt', sortOrder: 'desc' }
  });
  const [showReviewForm, setShowReviewForm] = useState(false);

  // SEO optimization with bilingual support
  useEffect(() => {
    updateSEO({
      title: language === 'bg'
        ? 'BoomCard - Промоции, Изживявания, Карта за Намаления'
        : 'BoomCard - Promotions, Experiences, Discount Card',
      description: language === 'bg'
        ? 'Открийте ексклузивни оферти и топ изживявания с вашата BoomCard карта за намаления. Подарете си незабравими преживявания!'
        : 'Discover exclusive offers and top experiences with your BoomCard discount card. Gift yourself unforgettable experiences!',
      keywords: language === 'bg'
        ? ['промоции', 'изживявания', 'карта за намаления', 'ексклузивни оферти', 'подарък', 'топ изживявания', 'отстъпки', 'България', 'София', 'Пловдив', 'Варна']
        : ['promotions', 'experiences', 'discount card', 'exclusive offers', 'gift', 'top experiences', 'discounts', 'Bulgaria', 'Sofia', 'Plovdiv', 'Varna'],
      language: language,
      url: window.location.href,
    });

    // Add structured data for organization and website
    addOrganizationSchema();
    addWebSiteSchema();

    // Add HowTo schema for "How It Works" section
    generateHowToSchema({
      name: language === 'bg' ? 'Как работи BoomCard' : 'How BoomCard Works',
      description: language === 'bg'
        ? 'Научете как да използвате вашата BoomCard карта за достъп до ексклузивни промоции и изживявания'
        : 'Learn how to use your BoomCard to access exclusive promotions and experiences',
      totalTime: 'PT3M',
      steps: [
        {
          name: language === 'bg' ? 'Регистрирайте се' : 'Sign Up',
          text: language === 'bg'
            ? 'Създайте вашия безплатен BoomCard акаунт за достъп до хиляди оферти'
            : 'Create your free BoomCard account to access thousands of offers',
        },
        {
          name: language === 'bg' ? 'Разгледайте Офертите' : 'Browse Offers',
          text: language === 'bg'
            ? 'Открийте ексклузивни промоции от ресторанти, хотели и други партньори'
            : 'Discover exclusive promotions from restaurants, hotels, and other partners',
        },
        {
          name: language === 'bg' ? 'Използвайте Картата' : 'Use Your Card',
          text: language === 'bg'
            ? 'Покажете вашата дигитална карта за получаване на отстъпки и специални оферти'
            : 'Show your digital card to receive discounts and special offers',
        },
      ],
    });

    // Add FAQ schema
    generateFAQSchema([
      {
        question: language === 'bg' ? 'Какво е BoomCard?' : 'What is BoomCard?',
        answer: language === 'bg'
          ? 'BoomCard е карта за намаления, която ви дава достъп до ексклузивни промоции и топ изживявания в цяла България.'
          : 'BoomCard is a discount card that gives you access to exclusive promotions and top experiences across Bulgaria.',
      },
      {
        question: language === 'bg' ? 'Колко струва BoomCard?' : 'How much does BoomCard cost?',
        answer: language === 'bg'
          ? 'BoomCard предлага два плана: Безплатен основен план и Премиум план за 29 лв/месец.'
          : 'BoomCard offers two plans: Free basic plan and Premium plan for 29 BGN/month.',
      },
      {
        question: language === 'bg' ? 'Къде мога да използвам BoomCard?' : 'Where can I use BoomCard?',
        answer: language === 'bg'
          ? 'BoomCard може да се използва в над 500 партньорски локации в София, Пловдив, Варна, Банско и други градове в България.'
          : 'BoomCard can be used at over 500 partner locations in Sofia, Plovdiv, Varna, Bansko, and other cities in Bulgaria.',
      },
      {
        question: language === 'bg' ? 'Каква е средната отстъпка?' : 'What is the average discount?',
        answer: language === 'bg'
          ? 'Средната отстъпка варира между 10% и 50%, в зависимост от вашия план и партньора.'
          : 'The average discount ranges from 10% to 50%, depending on your plan and the partner.',
      },
    ]);
  }, [language]);

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

  const subscriptionPlans = [
    {
      name: language === 'bg' ? 'Основен' : 'Basic',
      price: '0',
      features: [
        language === 'bg' ? 'Достъп до основни оферти' : 'Access to basic offers',
        language === 'bg' ? '10% средна отстъпка' : '10% average discount'
      ]
    },
    {
      name: language === 'bg' ? 'Премиум' : 'Premium',
      price: '29',
      featured: true,
      features: [
        language === 'bg' ? '30% средна отстъпка' : '30% average discount',
        language === 'bg' ? 'Приоритетна поддръжка' : 'Priority support',
        language === 'bg' ? 'Ексклузивни оферти' : 'Exclusive offers'
      ]
    }
  ];

  // Reviews are now fetched from API via usePartnerReviews hook above

  return (
    <div>
      {/* Hero Section with Blast Video */}
      <HeroBlast language={language} />

      {/* Product Details - How It Works Section */}
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

      {/* Subscription Plans Section */}
      <section className="section" style={{ background: 'var(--color-background-secondary)' }}>
        <div className="container-custom">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>
              {language === 'bg' ? 'Абонаментни Планове' : 'Subscription Plans'}
            </h2>
            <p className="text-xl max-w-2xl mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
              {language === 'bg'
                ? 'Изберете перфектния план за вашия начин на живот'
                : 'Choose the perfect plan for your lifestyle'}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {subscriptionPlans.map((plan, index) => (
              <Card key={index} style={{
                padding: '2rem',
                textAlign: 'center',
                border: plan.featured ? '3px solid var(--color-primary)' : '2px solid var(--color-border)',
                position: 'relative',
                transform: plan.featured ? 'scale(1.05)' : 'scale(1)',
                boxShadow: plan.featured ? 'var(--shadow-large)' : 'var(--shadow-soft)'
              }}>
                {plan.featured && (
                  <div style={{
                    position: 'absolute',
                    top: '-12px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--color-primary)',
                    color: 'var(--color-secondary)',
                    padding: '0.25rem 1rem',
                    borderRadius: '9999px',
                    fontSize: '0.875rem',
                    fontWeight: '600'
                  }}>
                    {language === 'bg' ? 'Най-популярен' : 'Most Popular'}
                  </div>
                )}
                <h3 className="text-2xl font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>
                  {plan.name}
                </h3>
                <div className="mb-6">
                  <span className="text-5xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    {plan.price}
                  </span>
                  <span className="text-xl ml-2" style={{ color: 'var(--color-text-secondary)' }}>
                    {language === 'bg' ? 'лв/мес' : 'BGN/mo'}
                  </span>
                </div>
                <ul style={{ textAlign: 'left', marginBottom: '2rem' }}>
                  {plan.features.map((feature, i) => (
                    <li key={i} style={{
                      padding: '0.75rem 0',
                      borderBottom: '1px solid var(--color-border)',
                      color: 'var(--color-text-secondary)'
                    }}>
                      ✓ {feature}
                    </li>
                  ))}
                </ul>
                <Link to="/subscriptions">
                  <Button variant={plan.featured ? 'primary' : 'secondary'} size="large" style={{ width: '100%' }}>
                    {language === 'bg' ? 'Избери План' : 'Choose Plan'}
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Partner CTA Section */}
      <section className="section">
        <div className="container-custom">
          <CTABox
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              {language === 'bg' ? 'Станете партньор на BoomCard' : 'Become a BoomCard Partner'}
            </h2>
            <p className="text-xl mb-10 opacity-90 leading-relaxed">
              {language === 'bg'
                ? 'Присъединете се към нашата мрежа от партньори и достигнете до хиляди нови клиенти'
                : 'Join our partner network and reach thousands of new customers'}
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link to="/partners">
                <Button variant="secondary" size="large">
                  {language === 'bg' ? 'Научете повече' : 'Learn More'}
                </Button>
              </Link>
              <Link to="/contact">
                <Button variant="secondary" size="large">
                  {language === 'bg' ? 'Свържете се с нас' : 'Contact Us'}
                </Button>
              </Link>
            </div>
          </CTABox>
        </div>
      </section>

      {/* User Reviews Section */}
      <section className="section" style={{ background: 'var(--color-background-secondary)' }}>
        <div className="container-custom">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>
              {language === 'bg' ? 'Какво казват нашите клиенти' : 'What Our Customers Say'}
            </h2>
            <p className="text-xl max-w-2xl mx-auto mb-8" style={{ color: 'var(--color-text-secondary)' }}>
              {language === 'bg'
                ? 'Хиляди доволни клиенти спестяват с BoomCard всеки ден'
                : 'Thousands of happy customers saving with BoomCard every day'}
            </p>
            <Button
              variant="primary"
              size="large"
              onClick={() => setShowReviewForm(true)}
            >
              {language === 'bg' ? 'Напишете отзив' : 'Write a Review'}
            </Button>
          </div>

          {loadingReviews ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--color-primary)' }}></div>
              <p className="mt-4" style={{ color: 'var(--color-text-secondary)' }}>
                {language === 'bg' ? 'Зареждане на отзиви...' : 'Loading reviews...'}
              </p>
            </div>
          ) : reviewsData && reviewsData.length > 0 ? (
            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {reviewsData.map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  onMarkHelpful={markHelpful}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12" style={{ background: 'var(--color-background)', borderRadius: '1rem' }}>
              <p className="text-xl mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                {language === 'bg' ? 'Все още няма отзиви' : 'No reviews yet'}
              </p>
              <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}>
                {language === 'bg'
                  ? 'Бъдете първите, които споделят мнение'
                  : 'Be the first to share your opinion'}
              </p>
              <Button
                variant="primary"
                onClick={() => setShowReviewForm(true)}
              >
                {language === 'bg' ? 'Напишете първия отзив' : 'Write the First Review'}
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Client CTA */}
      <ClientCTA />

      {/* Review Submission Modal */}
      <AnimatePresence>
        {showReviewForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '1rem'
            }}
            onClick={() => setShowReviewForm(false)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <ReviewSubmissionForm
                onSubmit={createReview}
                onClose={() => setShowReviewForm(false)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HomePage;