import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { Sparkles } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import OfferCard from '../components/common/OfferCard/OfferCard';
import ClientCTA from '../components/common/ClientCTA/ClientCTA';
import { updateSEO, generateOfferSchema } from '../utils/seo';
import { mockOffers } from '../data/mockOffers';

const PageContainer = styled.div`

  [data-theme="dark"] & {
    background: #0a0a0a;
  }
  min-height: 100vh;
  background: #f9fafb;
`;

const Hero = styled.div`
  background: linear-gradient(135deg, #000000 0%, #1f2937 100%);

  /* Vibrant mode - explosive gradient hero */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #1a0a2e 0%, #6a0572 25%, #ab2567 50%, #ff006e 75%, #ff4500 100%);
    background-size: 200% 200%;
    animation: heroGradientFlow 10s ease infinite;
    box-shadow:
      inset 0 -8px 40px -10px rgba(255, 69, 0, 0.3),
      inset 0 -4px 30px -10px rgba(255, 0, 110, 0.2);
  }

  @keyframes heroGradientFlow {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }
  color: white;
  padding: 4rem 0 3rem;

  @media (max-width: 768px) {
    padding: 3rem 0 2rem;
  }
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1.5rem;
`;

const HeroContent = styled.div`
  max-width: 800px;
  margin: 0 auto;
  text-align: center;
`;

const Title = styled.h1`
  font-size: 3.5rem;
  font-weight: 700;
  margin-bottom: 1rem;
  line-height: 1.1;

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }
`;

const Subtitle = styled.p`
  font-size: 1.25rem;
  opacity: 0.9;
  margin-bottom: 2.5rem;
  line-height: 1.6;

  @media (max-width: 768px) {
    font-size: 1.125rem;
  }
`;

const StatsRow = styled.div`
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 3rem;
  flex-wrap: wrap;
  margin-top: 2rem;
`;

const StatItem = styled.div`
  text-align: center;
  min-width: 150px;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const StatValue = styled.div`
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 3.5rem;
  line-height: 1;
`;

const StatLabel = styled.div`
  font-size: 0.875rem;
  opacity: 0.8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const ContentSection = styled.div`
  padding: 3rem 0;
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
`;

const SectionTitle = styled.h2`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;

  [data-theme="dark"] & {
    color: #f9fafb;
  }

  [data-theme="color"] & {
    color: #111827;
  }

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const FilterBar = styled.div`
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
`;

const FilterTabs = styled.div`
  display: flex;
  gap: 0.5rem;
  background: white;
  padding: 0.25rem;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  [data-theme="dark"] & {
    background: #1f2937;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  [data-theme="color"] & {
    background: white;
  }
`;

const TabButton = styled.button<{ $active: boolean }>`
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.375rem;
  background: ${props => props.$active ? '#000000' : 'transparent'};
  color: ${props => props.$active ? 'white' : '#6b7280'};
  font-weight: 500;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${props => props.$active ? '#000000' : '#f3f4f6'};
  }

  [data-theme="dark"] & {
    background: ${props => props.$active ? '#3b82f6' : 'transparent'};
    color: ${props => props.$active ? 'white' : '#9ca3af'};

    &:hover {
      background: ${props => props.$active ? '#3b82f6' : '#374151'};
    }
  }

  [data-theme="color"] & {
    background: ${props => props.$active ? '#ff006e' : 'transparent'};
    color: ${props => props.$active ? 'white' : '#6b7280'};

    &:hover {
      background: ${props => props.$active ? '#ff006e' : '#f3f4f6'};
    }
  }
`;

const OffersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

// Cashback Steps Section Styles
const CashbackSection = styled.section`
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  padding: 4rem 0;

  [data-theme="dark"] & {
    background: linear-gradient(135deg, #14532d 0%, #166534 100%);
  }

  [data-theme="color"] & {
    background: linear-gradient(135deg, #fdf4ff 0%, #f5d0fe 100%);
  }
`;

const CashbackContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
`;

const CashbackTitle = styled.h2`
  font-size: 2rem;
  font-weight: 700;
  text-align: center;
  margin-bottom: 3rem;
  color: #166534;

  [data-theme="dark"] & {
    color: #86efac;
  }

  [data-theme="color"] & {
    color: #86198f;
  }

  @media (max-width: 768px) {
    font-size: 1.5rem;
    margin-bottom: 2rem;
  }
`;

const CashbackSteps = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  margin-bottom: 2rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
`;

const CashbackStep = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  padding: 2rem;
  text-align: center;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  position: relative;

  [data-theme="dark"] & {
    background: #1f2937;
  }

  [data-theme="color"] & {
    background: white;
    border: 2px solid rgba(134, 25, 143, 0.2);
  }
`;

const StepNumber = styled.div`
  width: 3rem;
  height: 3rem;
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 700;
  color: white;
  margin: 0 auto 1rem;

  [data-theme="color"] & {
    background: linear-gradient(135deg, #d946ef 0%, #a855f7 100%);
  }
`;

const StepIcon = styled.div`
  font-size: 2.5rem;
  margin-bottom: 1rem;
`;

// 2-color SVG icons for cashback steps (gold outline, white/transparent fill)
const CashbackIcon: React.FC<{ type: 'phone' | 'receipt' | 'money' }> = ({ type }) => {
  const goldColor = '#c9a237';

  const icons = {
    phone: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect x="12" y="4" width="24" height="40" rx="3" stroke={goldColor} strokeWidth="2.5" fill="none" />
        <line x1="12" y1="10" x2="36" y2="10" stroke={goldColor} strokeWidth="2" />
        <line x1="12" y1="36" x2="36" y2="36" stroke={goldColor} strokeWidth="2" />
        <circle cx="24" cy="40" r="2" fill={goldColor} />
        {/* QR code pattern */}
        <rect x="17" y="16" width="4" height="4" fill={goldColor} />
        <rect x="22" y="16" width="4" height="4" fill={goldColor} />
        <rect x="27" y="16" width="4" height="4" fill={goldColor} />
        <rect x="17" y="21" width="4" height="4" fill={goldColor} />
        <rect x="27" y="21" width="4" height="4" fill={goldColor} />
        <rect x="17" y="26" width="4" height="4" fill={goldColor} />
        <rect x="22" y="26" width="4" height="4" fill={goldColor} />
        <rect x="27" y="26" width="4" height="4" fill={goldColor} />
      </svg>
    ),
    receipt: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <path d="M10 6h28v36l-4-3-4 3-4-3-4 3-4-3-4 3-4-3V6z" stroke={goldColor} strokeWidth="2.5" fill="none" />
        <line x1="16" y1="14" x2="32" y2="14" stroke={goldColor} strokeWidth="2" strokeLinecap="round" />
        <line x1="16" y1="20" x2="28" y2="20" stroke={goldColor} strokeWidth="2" strokeLinecap="round" />
        <line x1="16" y1="26" x2="30" y2="26" stroke={goldColor} strokeWidth="2" strokeLinecap="round" />
        <line x1="16" y1="32" x2="24" y2="32" stroke={goldColor} strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    money: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="18" stroke={goldColor} strokeWidth="2.5" fill="none" />
        <path d="M24 12v24" stroke={goldColor} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M18 18c0-2 2-4 6-4s6 2 6 4-2 4-6 4-6 2-6 4 2 4 6 4 6-2 6-4" stroke={goldColor} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      </svg>
    ),
  };

  return <div style={{ display: 'flex', justifyContent: 'center' }}>{icons[type]}</div>;
};

const StepText = styled.p`
  font-size: 1rem;
  color: #374151;
  line-height: 1.5;

  [data-theme="dark"] & {
    color: #d1d5db;
  }
`;

const CashbackNote = styled.p`
  text-align: center;
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 1.5rem;
  font-style: italic;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const CashbackTrustText = styled.p`
  text-align: center;
  font-size: 1rem;
  font-weight: 600;
  color: #374151;
  margin-top: 0.75rem;

  [data-theme="dark"] & {
    color: #d1d5db;
  }
`;

const PromotionsPage: React.FC = () => {
  const { language } = useLanguage();

  // Sort promotions by discount size for SEO
  const topPromotions = [...mockOffers]
    .sort((a, b) => b.discount - a.discount)
    .slice(0, 4);

  // SEO optimization for promotions page
  useEffect(() => {
    updateSEO({
      title: language === 'bg'
        ? 'Промоции и Специални Оферти | BoomCard'
        : 'Promotions and Special Offers | BoomCard',
      description: language === 'bg'
        ? 'Разгледайте най-добрите промоции и ексклузивни оферти с вашата BoomCard карта за намаления. Топ изживявания на специални цени!'
        : 'Browse the best promotions and exclusive offers with your BoomCard discount card. Top experiences at special prices!',
      keywords: language === 'bg'
        ? ['промоции', 'специални оферти', 'отстъпки', 'ексклузивни промоции', 'промоции ресторанти', 'промоции хотели', 'карта за намаления']
        : ['promotions', 'special offers', 'discounts', 'exclusive promotions', 'restaurant promotions', 'hotel promotions', 'discount card'],
      language: language,
      url: window.location.href,
    });

    // Add offer schema for the top promotion
    if (topPromotions.length > 0) {
      const topOffer = topPromotions[0];
      generateOfferSchema({
        name: language === 'bg' ? topOffer.titleBg : topOffer.title,
        description: language === 'bg' ? topOffer.descriptionBg : topOffer.description,
        discount: topOffer.discount,
        originalPrice: topOffer.originalPrice,
        discountedPrice: topOffer.discountedPrice,
        category: language === 'bg' ? topOffer.categoryBg : topOffer.category,
        image: topOffer.imageUrl,
      });
    }
  }, [language, topPromotions]);

  const t = {
    en: {
      title: 'Deals with BOOM Card',
      subtitle: 'Real discounts and exclusive offers from selected venues in Bulgaria',
      activeOffers: 'active deals',
      upToDiscount: 'Up to 35% discount',
      newOffersRegularly: 'New offers regularly',
      all: 'All',
      active: 'Active',
      upcoming: 'Upcoming',
      expired: 'Expired',
      filters: 'Filters',
      emptyTitle: 'No deals found',
      emptyText: 'Check back soon for new exciting deals!',
      browseOffers: 'Browse All Deals',
      premiumOnlyNote: 'Some offers are available only with Premium.',
      // Cashback Section
      cashbackTitle: 'Cashback with BOOM Card in 3 steps',
      cashbackStep1: 'Scan the sticker on the table in the app',
      cashbackStep2: 'Take a photo of your receipt after payment',
      cashbackStep3: 'Receive cashback to your bank account',
      cashbackNote: 'Everything happens through the app. No explanations to staff.',
      cashbackTrustText: 'Cashback is credited after receipt verification.',
    },
    bg: {
      title: 'Оферти с BOOM Card',
      subtitle: 'Реални отстъпки и ексклузивни предложения от подбрани места в България',
      activeOffers: 'активни оферти',
      upToDiscount: 'До 35% отстъпка',
      newOffersRegularly: 'Нови предложения редовно',
      all: 'Всички',
      active: 'Активни',
      upcoming: 'Предстоящи',
      expired: 'Изтекли',
      filters: 'Филтри',
      emptyTitle: 'Няма намерени оферти',
      emptyText: 'Проверете отново скоро за нови вълнуващи оферти!',
      browseOffers: 'Разгледай Всички Оферти',
      premiumOnlyNote: 'Някои оферти са достъпни само с Premium.',
      // Cashback Section
      cashbackTitle: 'Кешбек с BOOM Card в 3 стъпки',
      cashbackStep1: 'Сканирай стикера на масата в приложението',
      cashbackStep2: 'Снимай касовата бележка след плащане',
      cashbackStep3: 'Получи кешбек по банковата си сметка',
      cashbackNote: 'Всичко става през приложението. Без обяснения с персонала.',
      cashbackTrustText: 'Кешбекът се начислява след проверка на касовата бележка.',
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  return (
    <PageContainer>
      <Hero>
        <Container>
          <HeroContent>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Title>{content.title}</Title>
              <Subtitle>{content.subtitle}</Subtitle>

              <StatsRow>
                <StatItem>
                  <StatValue>{mockOffers.length}</StatValue>
                  <StatLabel>{content.activeOffers}</StatLabel>
                </StatItem>
                <StatItem>
                  <StatValue>35%</StatValue>
                  <StatLabel>{content.upToDiscount}</StatLabel>
                </StatItem>
                <StatItem>
                  <StatValue><Sparkles size={40} /></StatValue>
                  <StatLabel>{content.newOffersRegularly}</StatLabel>
                </StatItem>
              </StatsRow>
            </motion.div>
          </HeroContent>
        </Container>
      </Hero>

      {/* Cashback Steps Section */}
      <CashbackSection>
        <CashbackContainer>
          <CashbackTitle>{content.cashbackTitle}</CashbackTitle>
          <CashbackSteps>
            <CashbackStep
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <StepNumber>1</StepNumber>
              <StepIcon><CashbackIcon type="phone" /></StepIcon>
              <StepText>{content.cashbackStep1}</StepText>
            </CashbackStep>
            <CashbackStep
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <StepNumber>2</StepNumber>
              <StepIcon><CashbackIcon type="receipt" /></StepIcon>
              <StepText>{content.cashbackStep2}</StepText>
            </CashbackStep>
            <CashbackStep
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <StepNumber>3</StepNumber>
              <StepIcon><CashbackIcon type="money" /></StepIcon>
              <StepText>{content.cashbackStep3}</StepText>
            </CashbackStep>
          </CashbackSteps>
          <CashbackNote>{content.cashbackNote}</CashbackNote>
          <CashbackTrustText>{content.cashbackTrustText}</CashbackTrustText>
        </CashbackContainer>
      </CashbackSection>

      <ContentSection>
        <Container>
          <SectionHeader>
            <SectionTitle>
              {language === 'bg' ? 'Всички Промоции' : 'All Promotions'}
            </SectionTitle>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              {mockOffers.length} {language === 'bg' ? 'оферти' : 'offers'}
            </div>
          </SectionHeader>

          <OffersGrid>
            {mockOffers.sort((a, b) => b.discount - a.discount).map((offer, index) => (
              <motion.div
                key={offer.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <OfferCard offer={offer} />
              </motion.div>
            ))}
          </OffersGrid>
        </Container>
      </ContentSection>

      {/* Client CTA */}
      <ClientCTA />
    </PageContainer>
  );
};

export default PromotionsPage;
