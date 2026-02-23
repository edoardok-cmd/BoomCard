import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import Button from '../components/common/Button/Button';
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
  padding: 6rem 0 4rem;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 50%;
    height: 100%;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 100%);
  }

  @media (max-width: 768px) {
    padding: 4rem 0 5rem; /* Extra bottom padding for mobile bottom nav */
  }
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1.5rem;
  position: relative;
  z-index: 1;
`;

const HeroContent = styled.div`
  max-width: 700px;
  margin: 0 auto;
  text-align: center;
`;

const Title = styled.h1`
  font-size: 4rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  line-height: 1.1;

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }
`;

const Subtitle = styled.p`
  font-size: 1.5rem;
  opacity: 0.9;
  line-height: 1.6;
  margin-bottom: 2.5rem;

  @media (max-width: 768px) {
    font-size: 1.125rem;
  }
`;

const StatsRow = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
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
  justify-content: center;
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

// Cashback Steps Section Styles - Premium dark theme matching hero
const CashbackSection = styled.section`
  background: linear-gradient(135deg, #111827 0%, #1f2937 50%, #111827 100%);
  padding: 4rem 0;
  position: relative;
  overflow: hidden;

  /* Subtle gold accent line at top */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent 0%, #c9a237 50%, transparent 100%);
  }

  [data-theme="dark"] & {
    background: linear-gradient(135deg, #0a0a0a 0%, #111827 50%, #0a0a0a 100%);
  }

  [data-theme="color"] & {
    background: linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 50%, #1a0a2e 100%);
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
  color: #ffffff;

  [data-theme="dark"] & {
    color: #f9fafb;
  }

  [data-theme="color"] & {
    color: #f5d0fe;
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
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(201, 162, 55, 0.2);
  border-radius: 1rem;
  padding: 2rem;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  position: relative;
  transition: all 0.3s ease;

  &:hover {
    border-color: rgba(201, 162, 55, 0.4);
    transform: translateY(-4px);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }

  [data-theme="dark"] & {
    background: rgba(255, 255, 255, 0.03);
    border-color: rgba(201, 162, 55, 0.15);
  }

  [data-theme="color"] & {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(168, 85, 247, 0.3);
  }
`;

const StepNumber = styled.div`
  width: 3rem;
  height: 3rem;
  background: linear-gradient(135deg, #c9a237 0%, #a68529 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  margin: 0 auto 1rem;
  box-shadow: 0 2px 10px rgba(201, 162, 55, 0.3);

  [data-theme="color"] & {
    background: linear-gradient(135deg, #d946ef 0%, #a855f7 100%);
    color: white;
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
  color: #e5e7eb;
  line-height: 1.5;

  [data-theme="dark"] & {
    color: #d1d5db;
  }

  [data-theme="color"] & {
    color: #e9d5ff;
  }
`;

const CashbackNote = styled.p`
  text-align: center;
  font-size: 0.875rem;
  color: #9ca3af;
  margin-top: 1.5rem;
  font-style: italic;

  [data-theme="dark"] & {
    color: #6b7280;
  }

  [data-theme="color"] & {
    color: #c4b5fd;
  }
`;

const CashbackTrustText = styled.p`
  text-align: center;
  font-size: 1rem;
  font-weight: 600;
  color: #c9a237;
  margin-top: 0.75rem;

  [data-theme="dark"] & {
    color: #c9a237;
  }

  [data-theme="color"] & {
    color: #e9d5ff;
  }
`;

// Download App CTA Section (after cashback steps)
const DownloadAppCTA = styled.div`
  text-align: center;
  padding: 3rem 0 1rem;
`;

const DownloadButton = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 2rem;
  background: linear-gradient(135deg, #c9a237 0%, #d4af37 100%);
  color: #111827;
  border-radius: 0.75rem;
  font-size: 1.125rem;
  font-weight: 700;
  text-decoration: none;
  transition: all 200ms;
  box-shadow: 0 4px 15px rgba(201, 162, 55, 0.4);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(201, 162, 55, 0.5);
  }

  [data-theme="color"] & {
    background: linear-gradient(135deg, #d946ef 0%, #a855f7 100%);
    color: white;
    box-shadow: 0 4px 15px rgba(168, 85, 247, 0.4);

    &:hover {
      box-shadow: 0 6px 20px rgba(168, 85, 247, 0.5);
    }
  }
`;

const DownloadSecondaryText = styled.p`
  font-size: 0.875rem;
  color: #9ca3af;
  margin-top: 0.75rem;

  [data-theme="dark"] & {
    color: #6b7280;
  }

  [data-theme="color"] & {
    color: #c4b5fd;
  }
`;

const StoreLinksRow = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-top: 1rem;
`;

const StoreLink = styled.a`
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  transition: all 200ms;
  opacity: 0.9;

  &:hover {
    opacity: 1;
    transform: translateY(-1px);
  }

  img {
    display: block;
  }
`;

const APP_STORE_URL = 'https://apps.apple.com/app/boomcard/id6740091561';
const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.boomcard.app';

const getDevicePlatform = (): 'ios' | 'android' | 'desktop' => {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
};

const getDownloadUrl = (): string => {
  const platform = getDevicePlatform();
  if (platform === 'ios') return APP_STORE_URL;
  if (platform === 'android') return GOOGLE_PLAY_URL;
  return APP_STORE_URL;
};

const PromotionsPage: React.FC = () => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const isDesktop = getDevicePlatform() === 'desktop';

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
      title: 'Top Discounts with BOOM Card',
      subtitle: 'Real discounts and exclusive offers from selected top venues in Bulgaria',
      stat1Label: 'New offers at top venues',
      stat2Label: 'discount based on subscription plan',
      stat3Label: 'Curated offers',
      all: 'All',
      active: 'Active',
      upcoming: 'Upcoming',
      expired: 'Expired',
      filters: 'Filters',
      emptyTitle: 'No deals found',
      emptyText: 'Check back soon for new exciting deals!',
      browseOffers: 'Browse All Deals',
      premiumOnlyNote: 'Some offers are available only with Premium.',
      selectedOffers: 'Curated Offers',
      heroCta: 'Get Your BoomCard',
      // Money Back Section
      cashbackTitle: 'Money Back with BOOM Card in 3 steps',
      cashbackStep1: 'Scan the sticker on the table in the app',
      cashbackStep2: 'Take a photo of your receipt after payment',
      cashbackStep3: 'Receive the refund to the card used to activate your subscription',
      cashbackNote: 'Everything happens through the app. No explanations to staff.',
      cashbackTrustText: 'The amount is refunded after a quick receipt verification.',
      downloadAppCta: 'Download the App',
      availableForIosAndroid: 'Available for iOS and Android',
      appStore: 'App Store',
      googlePlay: 'Google Play',
    },
    bg: {
      title: 'Топ отстъпки с BOOM Card',
      subtitle: 'Реални отстъпки и ексклузивни предложения от подбрани топ места в България',
      stat1Label: 'Нови предложения на топ места',
      stat2Label: 'отстъпка според абонаментния план',
      stat3Label: 'Подбрани предложения',
      all: 'Всички',
      active: 'Активни',
      upcoming: 'Предстоящи',
      expired: 'Изтекли',
      filters: 'Филтри',
      emptyTitle: 'Няма намерени оферти',
      emptyText: 'Проверете отново скоро за нови вълнуващи оферти!',
      browseOffers: 'Разгледай Всички Оферти',
      premiumOnlyNote: 'Някои оферти са достъпни само с Premium.',
      selectedOffers: 'Подбрани предложения',
      heroCta: 'Вземете Вашата BoomCard',
      // Възстановяване на сума Section
      cashbackTitle: 'Възстановяване на сума с BOOM Card в 3 стъпки',
      cashbackStep1: 'Сканирай стикера на масата в приложението',
      cashbackStep2: 'Снимай касовата бележка след плащане',
      cashbackStep3: 'Получи възстановената сума по картата, с която е активиран абонаментът',
      cashbackNote: 'Всичко става през приложението. Без обяснения с персонала.',
      cashbackTrustText: 'Сумата се възстановява след кратка проверка на касовата бележка.',
      downloadAppCta: 'Свали приложението',
      availableForIosAndroid: 'Налично за iOS и Android',
      appStore: 'App Store',
      googlePlay: 'Google Play',
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  return (
    <PageContainer>
      <Hero>
        <Container>
          <HeroContent>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <Title>{content.title}</Title>
              <Subtitle>{content.subtitle}</Subtitle>

              <StatsRow>
                <StatItem>
                  <StatValue style={{ fontSize: '1.25rem', height: 'auto', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {content.stat1Label}
                  </StatValue>
                  <StatValue style={{ fontSize: '1.25rem', height: 'auto', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {content.stat3Label}
                  </StatValue>
                </StatItem>
                <StatItem>
                  <StatLabel style={{ marginBottom: '0.25rem' }}>{language === 'bg' ? 'до' : 'up to'}</StatLabel>
                  <StatValue>20%</StatValue>
                  <StatLabel>{content.stat2Label}</StatLabel>
                </StatItem>
              </StatsRow>
              <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center' }}>
                <a href="/#subscription-plans" onClick={(e) => { e.preventDefault(); navigate('/#subscription-plans'); }} style={{ textDecoration: 'none' }}>
                  <Button variant="golden" size="large">
                    {content.heroCta}
                  </Button>
                </a>
              </div>
            </motion.div>
          </HeroContent>
        </Container>
      </Hero>

      <ContentSection>
        <Container>
          <SectionHeader>
            <SectionTitle>
              {content.selectedOffers}
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

      {/* Money Back / Възстановяване на сума Steps Section */}
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

          {/* Download App CTA - closes the logical flow after "how it works" steps */}
          <DownloadAppCTA>
            <DownloadButton
              href={getDownloadUrl()}
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '1.25rem', height: '1.25rem' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {content.downloadAppCta}
            </DownloadButton>
            <DownloadSecondaryText>{content.availableForIosAndroid}</DownloadSecondaryText>
            {isDesktop && (
              <StoreLinksRow>
                <StoreLink href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
                  <img src="/badge-app-store.svg" alt="Download on the App Store" style={{ height: '2.25rem' }} />
                </StoreLink>
                <StoreLink href={GOOGLE_PLAY_URL} target="_blank" rel="noopener noreferrer">
                  <img src="/badge-google-play.svg" alt="Get it on Google Play" style={{ height: '2.25rem' }} />
                </StoreLink>
              </StoreLinksRow>
            )}
          </DownloadAppCTA>
        </CashbackContainer>
      </CashbackSection>

      {/* Client CTA */}
      <ClientCTA />
    </PageContainer>
  );
};

export default PromotionsPage;
