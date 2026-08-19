import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import { Gem, CheckCircle, Tag } from 'lucide-react';
import Button from '../components/common/Button/Button';
import Carousel from '../components/common/Carousel/Carousel';
import HeroBlast from '../components/common/HeroBlast/HeroBlast';
import FomoBanner from '../components/common/FomoBanner/FomoBanner';
import ReviewCard from '../components/reviews/ReviewCard';
import ReviewSubmissionForm from '../components/reviews/ReviewSubmissionForm';
import ClientCTA from '../components/common/ClientCTA/ClientCTA';
import DownloadAppSection from '../components/common/DownloadAppSection/DownloadAppSection';
import Tooltip from '../components/common/Tooltip/Tooltip';
import { useLanguage } from '../contexts/LanguageContext';
import { usePartnerReviews } from '../hooks/usePartnerReviews';
import { updateSEO, addOrganizationSchema, addWebSiteSchema, generateHowToSchema, generateFAQSchema } from '../utils/seo';
import { convertEURToBGN } from '../utils/helpers';
import { Plan, plansService } from '../services/plans.service';

// Global styled components for typography
const SectionTitle = styled.h2`
  font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
  font-weight: 800 !important;
`;

const SubsectionTitle = styled.h3`
  font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
  font-weight: 800 !important;
`;

const BodyText = styled.p`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
  font-weight: 400 !important;
`;

const FAQAccordionItem: React.FC<{ question: string; answer: string }> = ({ question, answer }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  return (
    <div style={{ borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          padding: '1.25rem 0',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          gap: '1rem',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 'clamp(0.9375rem, 3vw, 1.0625rem)', color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
          {question}
        </span>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-text-secondary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, transition: 'transform 300ms', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div style={{
        overflow: 'hidden',
        maxHeight: isOpen ? '300px' : '0',
        opacity: isOpen ? 1 : 0,
        transition: 'max-height 300ms ease, opacity 300ms ease',
      }}>
        <p style={{
          paddingBottom: '1.25rem',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.7,
          fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
        }}>
          {answer}
        </p>
      </div>
    </div>
  );
};

const HowItWorksContainer = styled.div`
  @media (max-width: 768px) {
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    display: flex;
    gap: 1rem;
    padding: 1rem 0;
    margin: 0 -1rem;
    padding-left: 1rem;
    padding-right: 1rem;

    &::-webkit-scrollbar {
      height: 6px;
    }

    &::-webkit-scrollbar-track {
      background: var(--color-background-secondary);
      border-radius: 10px;
    }

    &::-webkit-scrollbar-thumb {
      background: var(--color-primary);
      border-radius: 10px;
    }
  }
`;

const HowItWorksStep = styled.div`
  @media (max-width: 768px) {
    flex: 0 0 min(280px, 80vw);
    scroll-snap-align: center;
    background: var(--color-background);
    padding: 1.5rem;
    border-radius: 1rem;
    border: 1px solid var(--color-border);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
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
  opacity: 0.55; /* 45% transparency */

  @media (max-width: 768px) {
    width: 3rem;
    height: 3rem;
    font-size: 1.25rem;
    margin-bottom: 1rem;
  }

  /* Vibrant mode - gradient circle */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #ff4500 0%, #ff006e 50%, #b24bf3 100%);
    color: #ffffff;
    box-shadow:
      0 8px 30px -5px rgba(255, 69, 0, 0.5),
      0 6px 25px -5px rgba(255, 0, 110, 0.4);
  }
`;

const ReviewsSection = styled.section`
  background: var(--color-background-secondary);

  /* Vibrant mode - light bluish gradient background */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #e0f2fe 0%, #bfdbfe 25%, #93c5fd 50%, #60a5fa 75%, #3b82f6 100%);
    background-size: 200% 200%;
    animation: reviewsGradientFlow 10s ease infinite;
    box-shadow:
      inset 0 -8px 40px -10px rgba(96, 165, 250, 0.3),
      inset 0 -4px 30px -10px rgba(59, 130, 246, 0.2);
  }

  @keyframes reviewsGradientFlow {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }
`;

// Subscription cards - Credit card design matching hero exactly
const SubscriptionCardsContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: stretch; /* Make all cards same height */
  gap: 4rem;
  max-width: 1200px;
  margin: 0 auto;

  @media (max-width: 968px) {
    flex-direction: column;
    align-items: center;
    gap: 4rem; /* Increased gap to prevent badge overlap with button above */
  }

  @media (max-width: 480px) {
    gap: 3.5rem; /* Increased gap to prevent badge overlap with button above */
  }
`;

const PlanCardWrapper = styled(motion.div)<{ $disabled?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  padding-top: 1rem; /* Space for "Most Popular" badge */
  flex: 1; /* Allow wrapper to grow */
  align-self: stretch; /* Stretch to match siblings */
  opacity: ${props => props.$disabled ? 0.5 : 1};
  filter: ${props => props.$disabled ? 'grayscale(70%)' : 'none'};
  pointer-events: ${props => props.$disabled ? 'none' : 'auto'};
  transition: opacity 0.3s ease, filter 0.3s ease;
`;

const CreditCardPlan = styled(motion.div)<{ $type: 'starter' | 'basic' | 'premium' }>`
  width: 360px;
  height: 225px;
  border-radius: 1.25rem;
  padding: 1.75rem 2rem;
  position: relative;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  margin-top: 1.5rem; /* Equal spacing for both cards to align them */

  @media (max-width: 768px) {
    width: min(360px, 92vw);
    height: 210px;
    padding: 1.5rem 1.75rem;
  }

  /* Starter Card - White/Light gradient */
  ${props => props.$type === 'starter' && `
    background: linear-gradient(135deg, #ffffff 0%, #f5f5f5 100%);
    border: 2px solid rgba(200, 200, 200, 0.5);

    &::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -10%;
      width: 200px;
      height: 200px;
      background: radial-gradient(circle, rgba(0, 0, 0, 0.05) 0%, transparent 70%);
      border-radius: 50%;
    }
  `}

  /* Basic Card - Silver/Gray gradient like hero silver card */
  ${props => props.$type === 'basic' && `
    background: linear-gradient(135deg, #c0c0c0 0%, #939393 100%);
    border: 2px solid rgba(255, 255, 255, 0.3);

    &::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -10%;
      width: 200px;
      height: 200px;
      background: radial-gradient(circle, rgba(255, 255, 255, 0.15) 0%, transparent 70%);
      border-radius: 50%;
    }
  `}

  /* Premium Card - Black/Gold gradient like hero black card */
  ${props => props.$type === 'premium' && `
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    border: 3px solid #ffd700;

    &::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -10%;
      width: 200px;
      height: 200px;
      background: radial-gradient(circle, rgba(255, 215, 0, 0.1) 0%, transparent 70%);
      border-radius: 50%;
    }
  `}

  &:hover {
    transform: translateY(-10px) scale(1.02);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  }

  @media (max-width: 480px) {
    width: min(340px, 90vw);
    height: 212px;
  }
`;

const PopularBadge = styled.div`
  position: absolute;
  top: -1rem;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
  color: #000;
  padding: 0.4rem 1.25rem;
  border-radius: 9999px;
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 12px rgba(255, 215, 0, 0.5);
  z-index: 10;
  white-space: nowrap;
`;

const MostBoughtBadge = styled.div`
  position: absolute;
  top: -1rem;
  left: 50%;
  transform: translateX(-50%);
  -webkit-transform: translateX(-50%);
  -moz-transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.1);
  color: #c9a237;
  border: 2px solid #c9a237;
  padding: 0.4rem 1.25rem;
  border-radius: 9999px;
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 12px rgba(201, 162, 55, 0.3);
  z-index: 10;
  white-space: nowrap;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  pointer-events: none;

`;

const CardLogoText = styled.div<{ $type: 'starter' | 'basic' | 'premium' }>`
  font-size: 1.75rem;
  font-weight: 900;
  font-family: 'Arial Black', sans-serif;
  letter-spacing: 2px;
  margin-bottom: 1.5rem;
  color: ${props => props.$type === 'premium' ? '#ffd700' : props.$type === 'starter' ? '#4a4a4a' : '#1a1a1a'};
  text-shadow: ${props => props.$type === 'premium'
    ? '0 2px 10px rgba(255, 215, 0, 0.3)'
    : props.$type === 'starter'
    ? '0 1px 2px rgba(0, 0, 0, 0.1)'
    : '0 1px 2px rgba(255, 255, 255, 0.5)'};
`;

const CardNumber = styled.div<{ $type?: 'starter' | 'basic' | 'premium' }>`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 2rem;
  font-size: 1.25rem;
  color: ${props => props.$type === 'starter' ? 'rgba(100, 100, 100, 0.8)' : props.$type === 'basic' ? 'rgba(26, 26, 26, 0.9)' : 'rgba(255, 255, 255, 0.9)'};
  letter-spacing: 0.25rem;
  font-family: 'Courier New', monospace;
`;

const CardBottomRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
`;

const CardHolderName = styled.div<{ $type?: 'starter' | 'basic' | 'premium' }>`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: ${props => props.$type === 'starter' ? 'rgba(74, 74, 74, 0.95)' : props.$type === 'basic' ? 'rgba(26, 26, 26, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
  font-size: 0.8125rem;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  font-weight: 400;
`;

const CardPriceDisplay = styled.div<{ $type: 'starter' | 'basic' | 'premium' }>`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  text-align: right;
  color: ${props => props.$type === 'premium' ? '#ffd700' : props.$type === 'starter' ? 'rgba(74, 74, 74, 0.95)' : 'rgba(26, 26, 26, 0.95)'};
  font-size: 1.75rem;
  font-weight: 400;
  line-height: 1;

  span {
    font-size: 0.875rem;
    font-weight: 400;
    opacity: 0.9;
  }
`;

const PlanDetails = styled.div`
  margin-top: 2rem;
  width: 360px;
  display: flex;
  flex-direction: column;
  flex: 1; /* Take remaining space */
  min-height: 0; /* Allow flex shrinking */

  @media (max-width: 768px) {
    margin-top: 1.5rem;
    width: min(360px, 92vw);
  }

  @media (max-width: 480px) {
    margin-top: 1rem;
    width: min(340px, 90vw);
  }
`;

const FeaturesList = styled.ul`
  list-style: none;
  padding: 1.5rem 0;
  margin: 0;
  background: var(--color-background);
  border-radius: 0.75rem;
  border: 1px solid var(--color-border);
  flex: 1; /* Expand to fill remaining space and align buttons */
  display: flex;
  flex-direction: column;

  @media (max-width: 768px) {
    padding: 1rem 0;
  }

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
  }
`;

const FeatureItem = styled.li<{ $isEmpty?: boolean }>`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 0.875rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.875rem;
  font-size: clamp(0.875rem, 2.5vw, 0.9375rem);
  font-weight: 400;
  min-height: ${props => props.$isEmpty ? '3rem' : 'auto'};

  @media (max-width: 768px) {
    padding: 0.75rem 1rem;
    gap: 0.75rem;
  }
  color: var(--color-text-secondary);
  border-bottom: ${props => props.$isEmpty ? 'none' : '1px solid var(--color-border)'};

  &:last-child {
    border-bottom: none;
  }

  &::before {
    content: '✓';
    display: ${props => props.$isEmpty ? 'none' : 'flex'};
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    font-weight: 700;
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  [data-theme="dark"] & {
    color: #d1d5db;
    border-bottom-color: #374151;
  }
`;

const PlanButtonContainer = styled.div`
  margin-top: auto; /* Push to bottom */
  padding-top: 1.5rem; /* Add spacing above */
  display: flex;
  justify-content: center;
  align-items: center;

  a {
    display: block;
    text-decoration: none;
  }

  /* Golden gradient for all "Choose Plan" buttons with lively animations */
  button {
    background: linear-gradient(135deg, #c9a237 0%, #d4af37 50%, #c9a237 100%) !important;
    background-size: 200% 200% !important;
    color: #000000 !important;
    border: 2px solid #c9a237 !important;
    font-weight: 600 !important;
    box-shadow: 0 4px 15px rgba(201, 162, 55, 0.4) !important;
    position: relative;
    overflow: hidden;
    animation: gentleGlow 3s ease-in-out infinite;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;

    /* Ensure button text is above effects */
    & > * {
      position: relative;
      z-index: 2;
    }

    /* Shimmer effect */
    &::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: linear-gradient(
        45deg,
        transparent 30%,
        rgba(255, 255, 255, 0.3) 50%,
        transparent 70%
      );
      transform: rotate(45deg);
      animation: shimmer 3s infinite;
      z-index: 1;
    }

    &:hover {
      background: linear-gradient(135deg, #d4af37 0%, #ffed4e 50%, #d4af37 100%) !important;
      background-size: 200% 200% !important;
      color: #000000 !important;
      border-color: #d4af37 !important;
      box-shadow:
        0 8px 30px rgba(201, 162, 55, 0.6) !important,
        0 0 40px rgba(212, 175, 55, 0.4) !important;
      transform: translateY(-4px) scale(1.03) !important;
      animation: pulseGlow 0.6s ease-in-out infinite;
    }

    &:active {
      transform: translateY(-2px) scale(1.01) !important;
    }
  }

  @keyframes gentleGlow {
    0%, 100% {
      box-shadow: 0 4px 15px rgba(201, 162, 55, 0.4);
      background-position: 0% 50%;
    }
    50% {
      box-shadow: 0 4px 20px rgba(201, 162, 55, 0.5);
      background-position: 100% 50%;
    }
  }

  @keyframes pulseGlow {
    0%, 100% {
      box-shadow:
        0 8px 30px rgba(201, 162, 55, 0.6),
        0 0 40px rgba(212, 175, 55, 0.4);
    }
    50% {
      box-shadow:
        0 8px 35px rgba(201, 162, 55, 0.7),
        0 0 50px rgba(212, 175, 55, 0.5);
    }
  }

  @keyframes shimmer {
    0% {
      transform: translateX(-100%) translateY(-100%) rotate(45deg);
    }
    100% {
      transform: translateX(100%) translateY(100%) rotate(45deg);
    }
  }
`;

// Billing toggle components
const BillingToggleContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 3rem;
  flex-wrap: wrap;
`;

const BillingToggle = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--color-background);
  padding: 0.5rem;
  border-radius: 3rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border: 1px solid var(--color-border);
`;

const ToggleOption = styled.button<{ $active: boolean }>`
  padding: 0.875rem 2rem;
  border-radius: 3rem;
  border: none;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  background: ${props => props.$active ? 'var(--color-primary)' : 'transparent'};
  color: ${props => props.$active ? 'var(--color-secondary)' : 'var(--color-text-secondary)'};
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  &:hover {
    color: ${props => props.$active ? 'var(--color-secondary)' : 'var(--color-text-primary)'};
  }

  @media (max-width: 480px) {
    padding: 0.75rem 1.5rem;
    font-size: 0.9375rem;
  }
`;

const SectionDivider = styled.div`
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, 0.6) 50%, transparent 100%);

  /* Dark theme - grey gradient */
  [data-theme="dark"] & {
    background: linear-gradient(90deg, transparent 0%, rgba(156, 163, 175, 0.5) 50%, transparent 100%);
  }

  /* Vibrant color theme - use light theme gradient */
  [data-theme="color"] & {
    background: linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, 0.6) 50%, transparent 100%);
  }
`;

const HomePage: React.FC = () => {
  const { language, t } = useLanguage();
  const location = useLocation();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [subscriptionPlans, setSubscriptionPlans] = useState<Plan[]>([]);
  const [plansError, setPlansError] = useState<string | null>(null);

  useEffect(() => {
    plansService.getPlans().then(setSubscriptionPlans).catch(() => {
      setPlansError(
        language === 'bg'
          ? 'Грешка при зареждане на плановете.'
          : 'Error loading plans.',
      );
    });
  }, []);

  function cardTypeToStyle(cardType: string): 'starter' | 'basic' | 'premium' {
    switch (cardType) {
      case 'silver': return 'basic';
      case 'black': return 'premium';
      default: return 'starter';
    }
  }

  // Scroll to section when navigating with hash (e.g. /#subscription-plans)
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [location.hash]);

  // Fetch reviews from API with overall stats
  const { reviews: reviewsData, loading: loadingReviews, stats: reviewStats, createReview: createReviewMutation, markHelpful: markHelpfulMutation } = usePartnerReviews({
    filters: { status: 'APPROVED', limit: 6, sortBy: 'createdAt', sortOrder: 'desc' }
  });
  const [showReviewForm, setShowReviewForm] = useState(false);

  // Wrap mutations to match expected signatures
  const createReview = async (data: Parameters<typeof createReviewMutation>[0]): Promise<void> => {
    await createReviewMutation(data);
  };

  const markHelpful = async (id: string, helpful: boolean): Promise<void> => {
    await markHelpfulMutation(id, helpful);
  };

  // SEO optimization with bilingual support
  useEffect(() => {
    updateSEO({
      title: language === 'bg'
        ? 'BOOM Card - Отстъпки, Изживявания, Карта за Намаления'
        : 'BOOM Card - Discounts, Experiences, Discount Card',
      description: language === 'bg'
        ? 'Открийте ексклузивни отстъпки и топ изживявания с вашата BOOM Card карта за намаления. Подарете си незабравими преживявания!'
        : 'Discover exclusive discounts and top experiences with your BOOM Card discount card. Gift yourself unforgettable experiences!',
      keywords: language === 'bg'
        ? ['отстъпки', 'изживявания', 'карта за намаления', 'ексклузивни отстъпки', 'подарък', 'топ изживявания', 'България', 'София', 'Пловдив', 'Варна']
        : ['discounts', 'experiences', 'discount card', 'exclusive discounts', 'gift', 'top experiences', 'Bulgaria', 'Sofia', 'Plovdiv', 'Varna'],
      language: language,
      url: window.location.href,
    });

    // Add structured data for organization and website
    addOrganizationSchema();
    addWebSiteSchema();

    // Add HowTo schema for "How It Works" section
    generateHowToSchema({
      name: language === 'bg' ? 'Как работи BOOM Card' : 'How BOOM Card Works',
      description: language === 'bg'
        ? 'Научете как да използвате вашата BOOM Card карта за достъп до ексклузивни отстъпки и изживявания'
        : 'Learn how to use your BOOM Card to access exclusive discounts and experiences',
      totalTime: 'PT3M',
      steps: [
        {
          name: language === 'bg' ? 'Регистрирайте се' : 'Sign Up',
          text: language === 'bg'
            ? 'Създайте вашия безплатен BOOM Card акаунт за достъп до хиляди отстъпки'
            : 'Create your free BOOM Card account to access thousands of discounts',
        },
        {
          name: language === 'bg' ? 'Разгледайте Отстъпките' : 'Browse Discounts',
          text: language === 'bg'
            ? 'Открийте ексклузивни отстъпки от ресторанти, хотели и други партньори'
            : 'Discover exclusive discounts from restaurants, hotels, and other partners',
        },
        {
          name: language === 'bg' ? 'Използвайте Картата' : 'Use Your Card',
          text: language === 'bg'
            ? 'Покажете вашата дигитална карта за получаване на отстъпки и специални отстъпки'
            : 'Show your digital card to receive discounts and special discounts',
        },
      ],
    });

    // Add FAQ schema
    generateFAQSchema([
      {
        question: language === 'bg' ? 'Какво е BOOM Card?' : 'What is BOOM Card?',
        answer: language === 'bg'
          ? 'BOOM Card е карта за намаления, която ви дава достъп до ексклузивни отстъпки и топ изживявания в цяла България.'
          : 'BOOM Card is a discount card that gives you access to exclusive discounts and top experiences across Bulgaria.',
      },
      {
        question: language === 'bg' ? 'Колко струва BOOM Card?' : 'How much does BOOM Card cost?',
        answer: language === 'bg'
          ? 'BOOM Card предлага три плана: Basic €8.99/месец, Premium Седмичен €6.99/седмица и Premium Месечен €13.99/месец. Всички планове включват 24 часа безплатен Premium пробен период.'
          : 'BOOM Card offers three plans: Basic at €8.99/month, Premium Weekly at €6.99/week, and Premium Monthly at €13.99/month. All plans include a 24-hour free Premium trial.',
      },
      {
        question: language === 'bg' ? 'Къде мога да използвам BOOM Card?' : 'Where can I use BOOM Card?',
        answer: language === 'bg'
          ? 'BOOM Card може да се използва в над 500 партньорски локации в София, Пловдив, Варна, Банско и други градове в България.'
          : 'BOOM Card can be used at over 500 partner locations in Sofia, Plovdiv, Varna, Bansko, and other cities in Bulgaria.',
      },
      {
        question: language === 'bg' ? 'Каква е средната отстъпка?' : 'What is the average discount?',
        answer: language === 'bg'
          ? 'Кешбекът зависи от отстъпката на партньора. Basic план дава до 10% кешбек, а Premium планове — до 20%. Точният процент следва фиксирана матрица спрямо нивото на партньора.'
          : 'Cashback depends on the discount offered by the partner. The Basic plan gives up to 10% cashback, and Premium plans up to 20%. The exact percentage follows a fixed matrix based on the partner\'s discount level.',
      },
    ]);
  }, [language]);

  // Reviews are now fetched from API via usePartnerReviews hook above

  return (
    <>
      {/* Sticky FOMO Banner - positioned below fixed header */}
      <FomoBanner language={language} />

      <div>
        {/* Hero Section with Blast Video */}
        <HeroBlast language={language} />

      {/* Product Details - How It Works Section */}
      <section id="how-it-works" className="section">
        <div className="container-custom">
          <div className="text-center mb-16">
            <SectionTitle className="text-4xl md:text-5xl font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>
              {t('home.howItWorks')}
            </SectionTitle>
            <BodyText className="text-xl max-w-2xl mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
              {t('home.howItWorksSubtitle')}
            </BodyText>
          </div>

          <HowItWorksContainer className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                step: '1',
                title: 'step1Title',
                desc: 'step1Description',
                tooltip: language === 'bg' ? 'Сканирай BOOM стикера на масата' : 'Scan the BOOM sticker at your table'
              },
              {
                step: '2',
                title: 'step2Title',
                desc: 'step2Description',
                tooltip: language === 'bg' ? 'Поръчай, насладей се и плати сметката' : 'Order, enjoy and pay your bill'
              },
              {
                step: '3',
                title: 'step3Title',
                desc: 'step3Description',
                tooltip: language === 'bg' ? 'Кешбек се кредитира в портфейла след проверка на бележката' : 'Cashback credited to your wallet after receipt verification'
              }
            ].map((item, index) => (
              <HowItWorksStep key={index} className="text-center">
                <Tooltip content={item.tooltip} position="top">
                  <StepCircle>
                    {item.step}
                  </StepCircle>
                </Tooltip>
                <SubsectionTitle className="text-xl font-semibold mb-3" style={{ color: 'var(--color-text-primary)', fontSize: 'clamp(1rem, 4vw, 1.25rem)' }}>
                  {t(`home.${item.title}`)}
                </SubsectionTitle>
                <BodyText className="leading-relaxed" style={{ color: 'var(--color-text-secondary)', fontSize: 'clamp(0.875rem, 3vw, 1rem)' }}>
                  {t(`home.${item.desc}`)}
                </BodyText>
              </HowItWorksStep>
            ))}
          </HowItWorksContainer>

          {/* Download App CTA */}
          <DownloadAppSection />
        </div>
      </section>

      {/* Divider */}
      <SectionDivider />

      {/* Subscription Plans Section */}
      <section id="subscription-plans" className="section" style={{ background: 'var(--color-background-secondary)' }}>
        <div className="container-custom">
          <div className="text-center mb-16">
            <SectionTitle className="text-4xl md:text-5xl font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>
              {language === 'bg' ? 'Абонаментни Планове' : 'Subscription Plans'}
            </SectionTitle>
            <BodyText className="text-xl max-w-2xl mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
              {language === 'bg'
                ? 'Изберете перфектния план за вашия начин на живот'
                : 'Choose the perfect plan for your lifestyle'}
            </BodyText>
            <BodyText className="text-lg max-w-2xl mx-auto mt-4 mb-2" style={{ color: '#059669', fontWeight: 800, fontSize: '1.4rem' }}>
              {language === 'bg'
                ? '24 часа безплатен Premium пробен период за всички планове'
                : '24h free Premium trial for all plans'}
            </BodyText>
          </div>

          {/* Billing Period Toggle */}
          <BillingToggleContainer>
            <BillingToggle>
              <ToggleOption
                $active={billingPeriod === 'yearly'}
                onClick={() => setBillingPeriod('yearly')}
              >
                {language === 'bg' ? 'Годишен абонамент (20% отстъпка)' : 'Yearly (20% off)'}
              </ToggleOption>
              <ToggleOption
                $active={billingPeriod === 'monthly'}
                onClick={() => setBillingPeriod('monthly')}
              >
                {language === 'bg' ? 'Месечен/Седмичен абонамент' : 'Monthly/Weekly'}
              </ToggleOption>
            </BillingToggle>
          </BillingToggleContainer>

          {plansError && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#ef4444' }}>
              {plansError}
            </div>
          )}

          <SubscriptionCardsContainer>
            {subscriptionPlans.map((plan, index) => {
              const planType = cardTypeToStyle(plan.cardType);
              const isLitePlan = !plan.billingOptions.hasMonthly && plan.billingOptions.hasWeekly;
              const isDisabled = isLitePlan && billingPeriod === 'yearly';
              const eurPrice = isLitePlan
                ? plan.pricing.weekly
                : (billingPeriod === 'yearly' ? plan.pricing.yearly : plan.pricing.monthly);
              const bgnPrice = eurPrice != null ? convertEURToBGN(eurPrice) : null;
              const bgnLabel = language === 'bg' ? 'лв.' : 'BGN';
              const priceLabel = isLitePlan
                ? (language === 'bg' ? '/седмица' : '/week')
                : (billingPeriod === 'yearly'
                  ? (language === 'bg' ? '/година' : '/year')
                  : (language === 'bg' ? '/месец' : '/month'));
              const features = language === 'bg' ? plan.featuresBg : plan.features;
              const planName = (language === 'bg' && plan.displayNameBg) ? plan.displayNameBg : plan.displayName;
              return (
              <PlanCardWrapper
                key={plan.id}
                $disabled={isDisabled}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: isDisabled ? 0.5 : 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.2 }}
              >
                {/* Most Bought Badge for Light Plan */}
                {isLitePlan && (
                  <MostBoughtBadge>
                    {language === 'bg' ? 'Най-купуван' : 'Most Bought'}
                  </MostBoughtBadge>
                )}

                {/* Most Popular Badge - positioned relative to wrapper */}
                {plan.isFeatured && !isLitePlan && (
                  <PopularBadge>
                    {language === 'bg' ? 'Най-популярен' : 'Most Popular'}
                  </PopularBadge>
                )}

                {/* Credit Card matching hero design */}
                <CreditCardPlan $type={planType}>
                  <CardLogoText $type={planType}>
                    BOOM Card
                  </CardLogoText>

                  <CardNumber $type={planType}>
                    <span>••••</span>
                    <span>••••</span>
                    <span>••••</span>
                    <span>••••</span>
                  </CardNumber>

                  <CardBottomRow>
                    <CardHolderName $type={planType}>
                      {planName.toUpperCase()}
                    </CardHolderName>
                    <CardPriceDisplay $type={planType}>
                      {eurPrice != null && bgnPrice != null ? (
                        <>
                          <span style={{ fontSize: '0.9rem', opacity: 0.85 }}>{bgnPrice.toFixed(2)} {bgnLabel} /</span> €{eurPrice}
                          <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                            {priceLabel}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: '0.875rem' }}>N/A</span>
                      )}
                    </CardPriceDisplay>
                  </CardBottomRow>
                </CreditCardPlan>

                {/* Plan Details Below Card */}
                <PlanDetails>
                  <FeaturesList>
                    {features.map((feature, i) => {
                      const isEmpty = !feature || feature.trim() === '';
                      return (
                        <FeatureItem key={i} $isEmpty={isEmpty}>
                          {isEmpty ? '\u00A0' : feature}
                        </FeatureItem>
                      );
                    })}
                  </FeaturesList>

                  <PlanButtonContainer>
                    {isDisabled ? (
                      <div style={{ opacity: 0.6 }}>
                        <Button
                          variant="secondary"
                          size="large"
                          disabled
                        >
                          {language === 'bg' ? 'Само седмичен план' : 'Weekly only'}
                        </Button>
                      </div>
                    ) : (
                      /* SECURITY: Only pass planCode and billing period - NO PRICE IN URL */
                      <Link to={`/checkout?planCode=${plan.planCode}&billing=${isLitePlan ? 'weekly' : billingPeriod}`}>
                        <Button
                          variant={plan.isFeatured ? 'primary' : 'secondary'}
                          size="large"
                        >
                          {language === 'bg' ? 'Избери План' : 'Choose Plan'}
                        </Button>
                      </Link>
                    )}
                  </PlanButtonContainer>
                </PlanDetails>
              </PlanCardWrapper>
              );
            })}
          </SubscriptionCardsContainer>

          {/* Cashback Explanation */}
          <div className="text-center mt-8 max-w-3xl mx-auto">
            <BodyText style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              {language === 'bg'
                ? 'Отстъпките се получават под формата на връщане на пари след качване на касова бележка в приложението. Процентът зависи от абонаментния план.'
                : 'Discounts are received as cashback after uploading a receipt in the app. The percentage depends on the subscription plan.'}
            </BodyText>
          </div>
        </div>
      </section>

      {/* Divider between Subscription Plans and Reviews */}
      <SectionDivider />

      {/* User Reviews Section */}
      <ReviewsSection className="section">
        <div className="container-custom">
          <div className="text-center mb-16">
            <SectionTitle className="text-4xl md:text-5xl font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>
              {language === 'bg' ? 'Какво казват нашите клиенти' : 'What Our Customers Say'}
            </SectionTitle>

            {/* Overall Rating Display */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              marginBottom: '1rem',
              marginTop: '1rem'
            }}>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <svg
                    key={star}
                    width="24"
                    height="24"
                    viewBox="0 0 20 20"
                    fill={star <= Math.round((reviewStats?.averageRating ?? 0) > 0 ? reviewStats!.averageRating! : 4.9) ? '#fbbf24' : '#d1d5db'}
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <span style={{
                fontWeight: 700,
                fontSize: '1.5rem',
                color: 'var(--color-text-primary)'
              }}>
                {(reviewStats?.averageRating ?? 0) > 0 ? reviewStats!.averageRating!.toFixed(1) : '4.9'}/5
              </span>
              <span style={{
                color: 'var(--color-text-secondary)',
                fontSize: '1rem'
              }}>
                ({reviewStats?.totalReviews || 127} {language === 'bg' ? 'отзива' : 'reviews'})
              </span>
            </div>
          </div>

          {loadingReviews ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--color-primary)' }}></div>
              <BodyText className="mt-4" style={{ color: 'var(--color-text-secondary)' }}>
                {language === 'bg' ? 'Зареждане на отзиви...' : 'Loading reviews...'}
              </BodyText>
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
            <>
              {/* Placeholder testimonials - realistic reviews with practical examples */}
              <Carousel
                autoPlay={false}
                interval={5000}
                itemsToShow={{ mobile: 1, tablet: 2, desktop: 3 }}
              >
                {[
                  {
                    author: language === 'bg' ? 'Мария С.' : 'Maria S.',
                    photo: 'https://randomuser.me/api/portraits/women/44.jpg',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Спестих около 35 лв. / €18 при вечеря за двама. Качих бележката за под минута.'
                      : 'Saved about 35 BGN / €18 on dinner for two. Uploaded the receipt in under a minute.'
                  },
                  {
                    author: language === 'bg' ? 'Иван П.' : 'Ivan P.',
                    photo: 'https://randomuser.me/api/portraits/men/32.jpg',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Ползвах го в бар и ресторант. Процесът е ясен и работи както е описано.'
                      : 'Used it at a bar and restaurant. The process is clear and works as described.'
                  },
                  {
                    author: language === 'bg' ? 'Георги М.' : 'Georgi M.',
                    photo: 'https://randomuser.me/api/portraits/men/46.jpg',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Сканирането е бързо, а качването на бележката е супер лесно. Няма излишни стъпки.'
                      : 'Scanning is fast and uploading the receipt is super easy. No unnecessary steps.'
                  },
                  {
                    author: language === 'bg' ? 'Петя К.' : 'Petya K.',
                    photo: 'https://randomuser.me/api/portraits/women/26.jpg',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Спестих 23 лв. / €12 на първата си поръчка. Приложението е лесно за използване.'
                      : 'Saved 23 BGN / €12 on my first order. The app is easy to use.'
                  },
                  {
                    author: language === 'bg' ? 'Николай Т.' : 'Nikolay T.',
                    photo: 'https://randomuser.me/api/portraits/men/12.jpg',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Добри отстъпки за СПА уикенд. Спестихме 68 лв. / €35 за масажи.'
                      : 'Good discounts for a spa weekend. We saved 68 BGN / €35 on massages.'
                  },
                  {
                    author: language === 'bg' ? 'Силвия В.' : 'Silvia V.',
                    photo: 'https://randomuser.me/api/portraits/women/26.jpg',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Много лесно за използване. Вече препоръчах на приятели.'
                      : 'Very easy to use. Already recommended to friends.'
                  },
                  {
                    author: language === 'bg' ? 'Димитър А.' : 'Dimitar A.',
                    photo: 'https://randomuser.me/api/portraits/men/33.jpg',
                    rating: 4,
                    comment: language === 'bg'
                      ? 'Работи добре в София. Искам повече партньори в Пловдив.'
                      : 'Works well in Sofia. Would like more partners in Plovdiv.'
                  },
                  {
                    author: language === 'bg' ? 'Александра Н.' : 'Alexandra N.',
                    photo: 'https://randomuser.me/api/portraits/women/33.jpg',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Използвам картата всяка седмица. Спестих над 150 лв. / €77 за месец.'
                      : 'I use the card every week. Saved over 150 BGN / €77 in a month.'
                  },
                  {
                    author: language === 'bg' ? 'Ваня Р.' : 'Vanya R.',
                    photo: 'https://randomuser.me/api/portraits/women/68.jpg',
                    rating: 4,
                    comment: language === 'bg'
                      ? 'Добро приложение, лесен интерфейс. Би било страхотно с повече винарни.'
                      : 'Good app, easy interface. Would be great with more wineries.'
                  },
                  {
                    author: language === 'bg' ? 'Красимир Л.' : 'Krasimir L.',
                    photo: 'https://randomuser.me/api/portraits/men/22.jpg',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Спестих 42 лв. / €21 на рожден ден в ресторант. Препоръчвам!'
                      : 'Saved 42 BGN / €21 on a birthday dinner at a restaurant. Recommend!'
                  },
                  {
                    author: language === 'bg' ? 'Даниела К.' : 'Daniela K.',
                    photo: 'https://randomuser.me/api/portraits/women/57.jpg',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Супер за семейни излизания. Децата се радват, а ние спестяваме.'
                      : 'Great for family outings. Kids are happy and we save money.'
                  },
                  {
                    author: language === 'bg' ? 'Тодор В.' : 'Todor V.',
                    photo: 'https://randomuser.me/api/portraits/men/36.jpg',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Качих 5 бележки тази седмица. Всички кешбеци дойдоха навреме.'
                      : 'Uploaded 5 receipts this week. All cashbacks came on time.'
                  },
                  {
                    author: language === 'bg' ? 'Ирина Х.' : 'Irina H.',
                    photo: 'https://randomuser.me/api/portraits/women/49.jpg',
                    rating: 4,
                    comment: language === 'bg'
                      ? 'Харесва ми концепцията. Използвам го предимно в кафенета.'
                      : 'I like the concept. I use it mainly in cafes.'
                  },
                  {
                    author: language === 'bg' ? 'Борис Г.' : 'Boris G.',
                    photo: 'https://randomuser.me/api/portraits/men/64.jpg',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Отлична услуга! Спестих 89 лв. / €45 за уикенд в Банско.'
                      : 'Excellent service! Saved 89 BGN / €45 for a weekend in Bansko.'
                  },
                  {
                    author: language === 'bg' ? 'Надя П.' : 'Nadya P.',
                    photo: 'https://randomuser.me/api/portraits/women/11.jpg',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Приложението работи безупречно. VIP поддръжката отговаря веднага.'
                      : 'The app works flawlessly. VIP support responds immediately.'
                  },
                  {
                    author: language === 'bg' ? 'Мартин Й.' : 'Martin Y.',
                    photo: 'https://randomuser.me/api/portraits/men/41.jpg',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Най-добрата инвестиция тази година. Спестих колкото годишен абонамент за месец.'
                      : 'Best investment this year. Saved as much as the annual subscription in a month.'
                  },
                  {
                    author: language === 'bg' ? 'Росица Ф.' : 'Rositsa F.',
                    photo: 'https://randomuser.me/api/portraits/women/72.jpg',
                    rating: 4,
                    comment: language === 'bg'
                      ? 'Много партньори във Варна. Използвам го всеки уикенд на морето.'
                      : 'Many partners in Varna. I use it every weekend at the seaside.'
                  },
                  {
                    author: language === 'bg' ? 'Калоян С.' : 'Kaloyan S.',
                    photo: 'https://randomuser.me/api/portraits/men/19.jpg',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Спестих 56 лв. / €29 на вечеря за четирима. Определено си струва.'
                      : 'Saved 56 BGN / €29 on dinner for four. Definitely worth it.'
                  },
                  {
                    author: language === 'bg' ? 'Анна М.' : 'Anna M.',
                    photo: 'https://randomuser.me/api/portraits/women/38.jpg',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Премиум планът е страхотен. Получавам достъп до ексклузивни отстъпки.'
                      : 'The Premium plan is great. I get access to exclusive discounts.'
                  },
                  {
                    author: language === 'bg' ? 'Христо Д.' : 'Hristo D.',
                    photo: 'https://randomuser.me/api/portraits/men/77.jpg',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Лесно и бързо. Сканираш, качваш, получаваш кешбек. Толкова просто.'
                      : 'Easy and fast. Scan, upload, get cashback. That simple.'
                  },
                  {
                    author: language === 'bg' ? 'Виктория Т.' : 'Victoria T.',
                    photo: 'https://randomuser.me/api/portraits/women/32.jpg',
                    rating: 4,
                    comment: language === 'bg'
                      ? 'Добро съотношение качество-цена. Бих искала повече хотели в мрежата.'
                      : 'Good value for money. Would like more hotels in the network.'
                  },
                  {
                    author: language === 'bg' ? 'Пламен К.' : 'Plamen K.',
                    photo: 'https://randomuser.me/api/portraits/men/28.jpg',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Използвам го от 3 месеца. Общо спестени над 280 лв. / €143.'
                      : 'Been using it for 3 months. Total saved over 280 BGN / €143.'
                  }
                ].map((testimonial, index) => (
                  <div
                    key={index}
                    style={{
                      background: 'var(--color-background)',
                      borderRadius: '1rem',
                      padding: 'clamp(1rem, 3vw, 1.5rem)',
                      border: '1px solid var(--color-border)',
                      opacity: 0.95,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', gap: '0.75rem' }}>
                      <img
                        src={testimonial.photo}
                        alt={testimonial.author}
                        style={{
                          width: '3rem',
                          height: '3rem',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          flexShrink: 0
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 600,
                          color: 'var(--color-text-primary)',
                          marginBottom: '0.25rem',
                          fontSize: 'clamp(0.9375rem, 2.5vw, 1rem)'
                        }}>
                          {testimonial.author}
                        </div>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          {[...Array(5)].map((_, i) => (
                            <svg
                              key={i}
                              width="16"
                              height="16"
                              viewBox="0 0 20 20"
                              fill={i < testimonial.rating ? '#fbbf24' : '#d1d5db'}
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                        </div>
                      </div>
                    </div>
                    <BodyText style={{
                      color: 'var(--color-text-secondary)',
                      lineHeight: '1.6',
                      fontSize: 'clamp(0.875rem, 2.5vw, 0.9375rem)',
                      flex: 1
                    }}>
                      "{testimonial.comment}"
                    </BodyText>
                  </div>
                ))}
              </Carousel>
              <div className="text-center" style={{ marginTop: '3rem' }}>
                <Button
                  variant="primary"
                  size="large"
                  onClick={() => setShowReviewForm(true)}
                >
                  {language === 'bg' ? 'Споделете вашето мнение' : 'Share Your Review'}
                </Button>
              </div>
            </>
          )}
        </div>
      </ReviewsSection>

      {/* Secondary Trust Badges Section */}
      <section style={{
        padding: '3rem 0',
        background: 'var(--color-background)'
      }}>
        <div className="container-custom">
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 'clamp(2rem, 5vw, 4rem)',
            flexWrap: 'wrap'
          }}>
            {/* Badge 1: Premium Product */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '1rem'
            }}>
              <Gem size={36} style={{ color: '#D4AF37' }} />
              <span style={{
                fontSize: '0.9rem',
                fontWeight: 500,
                color: 'var(--color-text-secondary)',
                textAlign: 'center'
              }}>
                {language === 'bg' ? 'Премиум продукт' : 'Premium Product'}
              </span>
            </div>

            {/* Badge 2: Selected Venues */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '1rem'
            }}>
              <CheckCircle size={36} style={{ color: '#D4AF37' }} />
              <span style={{
                fontSize: '0.9rem',
                fontWeight: 500,
                color: 'var(--color-text-secondary)',
                textAlign: 'center'
              }}>
                {language === 'bg' ? 'Селектирани заведения' : 'Selected Venues'}
              </span>
            </div>

            {/* Badge 3: Real Value */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '1rem'
            }}>
              <Tag size={36} style={{ color: '#D4AF37' }} />
              <span style={{
                fontSize: '0.9rem',
                fontWeight: 500,
                color: 'var(--color-text-secondary)',
                textAlign: 'center'
              }}>
                {language === 'bg' ? 'Реална стойност' : 'Real Value'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" style={{ padding: 'clamp(3rem, 6vw, 5rem) 0', background: 'var(--color-background)' }}>
        <div className="container-custom" style={{ maxWidth: '800px', margin: '0 auto', padding: '0 1.5rem' }}>
          <SectionTitle className="text-3xl md:text-4xl font-bold mb-4 text-center" style={{ color: 'var(--color-text-primary)' }}>
            {language === 'bg' ? 'Често задавани въпроси' : 'Frequently Asked Questions'}
          </SectionTitle>
          <BodyText className="text-lg max-w-2xl mx-auto text-center mb-12" style={{ color: 'var(--color-text-secondary)' }}>
            {language === 'bg' ? 'Всичко, което трябва да знаете за BOOM Card' : 'Everything you need to know about BOOM Card'}
          </BodyText>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[
              {
                q: language === 'bg' ? 'Какво е BOOM Card?' : 'What is BOOM Card?',
                a: language === 'bg'
                  ? 'BOOM Card е карта за намаления, която ви дава достъп до ексклузивни отстъпки и топ изживявания в цяла България — ресторанти, хотели, СПА центрове и още.'
                  : 'BOOM Card is a discount card that gives you access to exclusive discounts and top experiences across Bulgaria — restaurants, hotels, spas, and more.',
              },
              {
                q: language === 'bg' ? 'Колко струва BOOM Card?' : 'How much does BOOM Card cost?',
                a: language === 'bg'
                  ? 'BOOM Card предлага три плана: Basic €8.99/месец, Premium Седмичен €6.99/седмица и Premium Месечен €13.99/месец. Всички планове включват 24 часа безплатен Premium пробен период!'
                  : 'BOOM Card offers three plans: Basic at €8.99/month, Premium Weekly at €6.99/week, and Premium Monthly at €13.99/month. All plans include a 24-hour free Premium trial!',
              },
              {
                q: language === 'bg' ? 'Къде мога да използвам BOOM Card?' : 'Where can I use BOOM Card?',
                a: language === 'bg'
                  ? 'BOOM Card може да се използва в над 500 партньорски локации в София, Пловдив, Варна, Банско и други градове в България.'
                  : 'BOOM Card can be used at over 500 partner locations in Sofia, Plovdiv, Varna, Bansko, and other cities in Bulgaria.',
              },
              {
                q: language === 'bg' ? 'Каква е средната отстъпка?' : 'What is the average discount?',
                a: language === 'bg'
                  ? 'Кешбекът зависи от отстъпката на партньора. Basic план дава до 10% кешбек, а Premium планове — до 20%. Точният процент следва фиксирана матрица спрямо нивото на партньора.'
                  : 'Cashback depends on the discount offered by the partner. The Basic plan gives up to 10% cashback, and Premium plans up to 20%. The exact percentage follows a fixed matrix based on the partner\'s discount level.',
              },
              {
                q: language === 'bg' ? 'Мога ли да откажа абонамента си?' : 'Can I cancel my subscription?',
                a: language === 'bg'
                  ? 'Да, можете да откажете абонамента си по всяко време от вашия профил. Без скрити такси или обвързване.'
                  : 'Yes, you can cancel your subscription at any time from your profile settings. No hidden fees or commitments.',
              },
              {
                q: language === 'bg' ? 'Как работи мобилното приложение?' : 'How does the mobile app work?',
                a: language === 'bg'
                  ? 'Изтеглете приложението от App Store или Google Play, влезте с акаунта си, сканирайте BOOM стикера на масата, платете сметката, след което качете снимка на касовата бележка, за да получите кешбек по портфейла.'
                  : 'Download the app from the App Store or Google Play, sign in, scan the BOOM sticker at your table, pay your bill, then upload a photo of your receipt — cashback is credited to your wallet after verification.',
              },
            ].map((faq, index) => (
              <FAQAccordionItem key={index} question={faq.q} answer={faq.a} />
            ))}
          </div>

          {/* Download App CTA below FAQ */}
          <DownloadAppSection />
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
    </>
  );
};

export default HomePage;