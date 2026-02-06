import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import ClientCTA from '../components/common/ClientCTA/ClientCTA';
import Button from '../components/common/Button/Button';
import { plansService, Plan } from '../services/plans.service';
import { convertEURToBGN } from '../utils/helpers';

const PageContainer = styled.div`
  min-height: 100vh;
  background: var(--color-background);
`;

const HeroSection = styled.section`
  padding: 6rem 2rem 4rem;
  text-align: center;
  background: var(--color-background-secondary);
`;

const HeroTitle = styled(motion.h1)`
  font-size: 3.5rem;
  font-weight: 800;
  margin-bottom: 1.5rem;
  color: var(--color-text-primary);

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }
`;

const HeroSubtitle = styled(motion.p)`
  font-size: 1.5rem;
  color: var(--color-text-secondary);
  margin-bottom: 1.5rem;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
`;

const TrialPeriodText = styled(motion.p)`
  font-size: 1.4rem;
  font-weight: 800;
  color: #059669;
  margin-bottom: 2rem;

  [data-theme="dark"] & {
    color: #10b981;
  }
`;

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

const SaveBadge = styled.div`
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 3rem;
  font-size: 0.9375rem;
  font-weight: 700;
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  [data-theme="color"] & {
    background: linear-gradient(135deg, #10b981 0%, #00d4ff 100%);
  }

  @media (max-width: 480px) {
    font-size: 0.875rem;
    padding: 0.625rem 1.25rem;
  }
`;

const SubscriptionCardsContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: stretch;
  gap: 4rem;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem 5rem;

  @media (max-width: 968px) {
    flex-direction: column;
    align-items: center;
    gap: 4rem; /* Increased gap to prevent badge overlap with button above */
  }

  @media (max-width: 480px) {
    gap: 3.5rem; /* Increased gap to prevent badge overlap with button above */
  }
`;

const CashbackExplanation = styled.p`
  text-align: center;
  max-width: 800px;
  margin: 0 auto 3rem;
  padding: 0 1.5rem;
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
`;

const PlanCardWrapper = styled(motion.div)<{ $disabled?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  padding-top: 1rem;
  flex: 1;
  align-self: stretch;
  opacity: ${props => props.$disabled ? 0.5 : 1};
  filter: ${props => props.$disabled ? 'grayscale(70%)' : 'none'};
  pointer-events: ${props => props.$disabled ? 'none' : 'auto'};
  transition: opacity 0.3s ease, filter 0.3s ease;
`;

const FeaturedBadge = styled.div`
  position: absolute;
  top: -1rem;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, #c9a237 0%, #d4af37 100%);
  color: #000;
  padding: 0.4rem 1.25rem;
  border-radius: 9999px;
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 12px rgba(201, 162, 55, 0.5);
  z-index: 10;
  white-space: nowrap;
`;

const MostBoughtBadge = styled.div`
  position: absolute;
  top: -1rem;
  left: 50%;
  transform: translateX(-50%);
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
`;

const CreditCardPlan = styled(motion.div)<{ $type: 'black' | 'silver' | 'light' }>`
  width: 360px;
  height: 225px;
  border-radius: 1.25rem;
  padding: 1.75rem 2rem;
  position: relative;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  margin-top: 1.5rem;

  @media (max-width: 768px) {
    width: min(360px, 92vw);
    height: 210px;
    padding: 1.5rem 1.75rem;
  }

  /* Black Card */
  ${props => props.$type === 'black' && `
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

  /* Silver Card */
  ${props => props.$type === 'silver' && `
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

  /* Light Card */
  ${props => props.$type === 'light' && `
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

  &:hover {
    transform: translateY(-10px) scale(1.02);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  }

  /* Dark Theme */
  [data-theme="dark"] & {
    ${props => props.$type === 'black' && `
      background: linear-gradient(135deg, #111827 0%, #1f2937 50%, #0f172a 100%);
      border: 3px solid #06b6d4;
      box-shadow:
        0 10px 40px rgba(6, 182, 212, 0.5),
        0 8px 35px rgba(59, 130, 246, 0.4);

      &::before {
        background: radial-gradient(circle, rgba(6, 182, 212, 0.2) 0%, transparent 70%);
      }
    `}

    ${props => props.$type === 'silver' && `
      background: linear-gradient(135deg, #374151 0%, #4b5563 100%);
      border: 3px solid #3b82f6;
      box-shadow:
        0 10px 40px rgba(59, 130, 246, 0.3),
        0 8px 30px rgba(6, 182, 212, 0.2);

      &::before {
        background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%);
      }
    `}

    ${props => props.$type === 'light' && `
      background: linear-gradient(135deg, #f9fafb 0%, #e5e7eb 100%);
      border: 2px solid rgba(156, 163, 175, 0.5);
      box-shadow:
        0 10px 40px rgba(0, 0, 0, 0.2);

      &::before {
        background: radial-gradient(circle, rgba(0, 0, 0, 0.05) 0%, transparent 70%);
      }
    `}

    &:hover {
      box-shadow:
        0 20px 60px rgba(59, 130, 246, 0.4),
        0 15px 50px rgba(6, 182, 212, 0.35);
    }
  }

  /* Color Theme - Vibrant gradients */
  [data-theme="color"] & {
    ${props => props.$type === 'light' && `
      background: linear-gradient(135deg, #ffffff 0%, #fff5f0 100%);
      border: 2px solid rgba(255, 148, 214, 0.3);
      box-shadow:
        0 10px 40px rgba(0, 0, 0, 0.15);

      &::before {
        background: radial-gradient(circle, rgba(255, 105, 180, 0.08) 0%, transparent 70%);
      }
    `}

    ${props => props.$type === 'silver' && `
      background: linear-gradient(135deg, #ffd6a5 0%, #ffb5d5 50%, #c9e4ff 100%);
      border: 3px solid #ff94d6;
      box-shadow:
        0 10px 40px rgba(255, 148, 214, 0.4),
        0 8px 30px rgba(178, 75, 243, 0.3);

      &::before {
        background: radial-gradient(circle, rgba(255, 105, 180, 0.2) 0%, transparent 70%);
      }
    `}

    ${props => props.$type === 'black' && `
      background: linear-gradient(135deg, #1a0a2e 0%, #6a0572 50%, #ab2567 100%);
      border: 3px solid #ff4500;
      box-shadow:
        0 10px 40px rgba(255, 69, 0, 0.6),
        0 8px 35px rgba(255, 0, 110, 0.5),
        0 6px 30px rgba(139, 47, 184, 0.4);

      &::before {
        background: radial-gradient(circle, rgba(255, 69, 0, 0.15) 0%, transparent 70%);
      }
    `}

    &:hover {
      box-shadow:
        0 20px 60px rgba(255, 69, 0, 0.5),
        0 15px 50px rgba(255, 0, 110, 0.4),
        0 10px 40px rgba(139, 47, 184, 0.3);
    }
  }

  @media (max-width: 480px) {
    width: min(340px, 90vw);
    height: 212px;
  }
`;

const CardLogoText = styled.div<{ $type: 'black' | 'silver' | 'light' }>`
  font-size: 1.75rem;
  font-weight: 900;
  font-family: 'Arial Black', sans-serif;
  letter-spacing: 2px;
  margin-bottom: 1.5rem;
  color: ${props => {
    if (props.$type === 'black') return '#ffd700';
    if (props.$type === 'light') return '#4a4a4a';
    return '#1a1a1a';
  }};
  text-shadow: ${props => {
    if (props.$type === 'black') return '0 2px 10px rgba(255, 215, 0, 0.3)';
    if (props.$type === 'light') return '0 1px 2px rgba(0, 0, 0, 0.1)';
    return '0 1px 2px rgba(255, 255, 255, 0.5)';
  }};

  [data-theme="dark"] & {
    color: ${props => {
      if (props.$type === 'black') return '#06b6d4';
      if (props.$type === 'light') return '#1a1a1a';
      return '#f8fafc';
    }};
    text-shadow: ${props => {
      if (props.$type === 'black') return '0 2px 15px rgba(6, 182, 212, 0.6), 0 0 30px rgba(59, 130, 246, 0.4)';
      if (props.$type === 'light') return '0 1px 2px rgba(0, 0, 0, 0.1)';
      return '0 2px 8px rgba(59, 130, 246, 0.3)';
    }};
  }

  [data-theme="color"] & {
    color: ${props => {
      if (props.$type === 'black') return '#ff4500';
      if (props.$type === 'light') return '#1a0a2e';
      return '#1a0a2e';
    }};
    text-shadow: ${props => {
      if (props.$type === 'black') return '0 2px 15px rgba(255, 69, 0, 0.6), 0 0 30px rgba(255, 0, 110, 0.4)';
      if (props.$type === 'light') return '0 1px 2px rgba(0, 0, 0, 0.08)';
      return '0 2px 8px rgba(139, 47, 184, 0.3)';
    }};
  }
`;

const CardNumber = styled.div<{ $type?: 'black' | 'silver' | 'light' }>`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 2rem;
  font-size: 1.25rem;
  color: ${props => {
    if (props.$type === 'black') return 'rgba(255, 255, 255, 0.9)';
    if (props.$type === 'light') return 'rgba(100, 100, 100, 0.8)';
    return 'rgba(26, 26, 26, 0.9)';
  }};
  letter-spacing: 0.25rem;
  font-family: 'Courier New', monospace;

  [data-theme="dark"] & {
    color: ${props => props.$type === 'light' ? 'rgba(26, 26, 26, 0.8)' : 'rgba(248, 250, 252, 0.9)'};
  }

  [data-theme="color"] & {
    color: ${props => {
      if (props.$type === 'light') return 'rgba(26, 10, 46, 0.7)';
      if (props.$type === 'silver') return 'rgba(26, 10, 46, 0.8)';
      return 'rgba(255, 255, 255, 0.95)';
    }};
  }
`;

const CardBottomRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
`;

const CardHolderName = styled.div<{ $type?: 'black' | 'silver' | 'light' }>`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: ${props => {
    if (props.$type === 'black') return 'rgba(255, 255, 255, 0.95)';
    if (props.$type === 'light') return 'rgba(74, 74, 74, 0.95)';
    return 'rgba(26, 26, 26, 0.95)';
  }};
  font-size: 0.8125rem;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  font-weight: 400;

  [data-theme="dark"] & {
    color: ${props => props.$type === 'light' ? 'rgba(26, 26, 26, 0.95)' : 'rgba(248, 250, 252, 0.95)'};
  }

  [data-theme="color"] & {
    color: ${props => {
      if (props.$type === 'light') return 'rgba(26, 10, 46, 0.85)';
      if (props.$type === 'silver') return 'rgba(26, 10, 46, 0.9)';
      return 'rgba(255, 255, 255, 0.95)';
    }};
  }
`;

const CardPriceDisplay = styled.div<{ $type: 'black' | 'silver' | 'light' }>`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  text-align: right;
  color: ${props => {
    if (props.$type === 'black') return '#ffd700';
    if (props.$type === 'light') return 'rgba(74, 74, 74, 0.95)';
    return 'rgba(26, 26, 26, 0.95)';
  }};
  font-size: 1.75rem;
  font-weight: 400;
  line-height: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;

  span {
    font-size: 0.875rem;
    font-weight: 400;
    opacity: 0.9;
  }

  [data-theme="dark"] & {
    color: ${props => {
      if (props.$type === 'black') return '#06b6d4';
      if (props.$type === 'light') return '#1a1a1a';
      return '#f8fafc';
    }};
    text-shadow: ${props => {
      if (props.$type === 'black') return '0 2px 10px rgba(6, 182, 212, 0.4)';
      if (props.$type === 'light') return 'none';
      return '0 1px 4px rgba(59, 130, 246, 0.2)';
    }};
  }

  [data-theme="color"] & {
    color: ${props => {
      if (props.$type === 'black') return '#ff4500';
      if (props.$type === 'light') return '#1a0a2e';
      return '#1a0a2e';
    }};
    text-shadow: ${props => {
      if (props.$type === 'black') return '0 2px 10px rgba(255, 69, 0, 0.4)';
      if (props.$type === 'light') return 'none';
      return '0 1px 4px rgba(139, 47, 184, 0.2)';
    }};
  }
`;

const PlanDetails = styled.div`
  margin-top: 2rem;
  width: 360px;
  display: flex;
  flex-direction: column;
  flex: 1;

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
  flex: 1;

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
  margin-top: auto;
  padding-top: 1.5rem;
  display: flex;
  justify-content: center;
  align-items: center;

  a {
    display: block;
  }

  /* Golden gradient for all "Choose Plan" buttons */
  button {
    background: linear-gradient(135deg, #c9a237 0%, #d4af37 100%) !important;
    color: #000000 !important;
    border: 2px solid #c9a237 !important;
    font-weight: 600 !important;
    box-shadow: 0 4px 15px rgba(201, 162, 55, 0.4) !important;

    &:hover {
      background: linear-gradient(135deg, #d4af37 0%, #c9a237 100%) !important;
      color: #000000 !important;
      border-color: #d4af37 !important;
      box-shadow: 0 6px 20px rgba(201, 162, 55, 0.5) !important;
    }
  }
`;

const FAQSection = styled.section`
  max-width: 800px;
  margin: 0 auto;
  padding: 5rem 2rem;
`;

const FAQTitle = styled.h2`
  font-size: 2.5rem;
  font-weight: 700;
  text-align: center;
  margin-bottom: 3rem;
  color: var(--color-text-primary);
`;

const FAQItem = styled.div`
  background: var(--color-background);
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  border: 1px solid var(--color-border);
`;

const FAQQuestion = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
`;

const FAQAnswer = styled.p`
  font-size: 1rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  gap: 1rem;
`;

const LoadingSpinner = styled(Loader2)`
  width: 48px;
  height: 48px;
  color: var(--color-primary);
  animation: spin 1s linear infinite;

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const ErrorMessage = styled.div`
  text-align: center;
  padding: 2rem;
  color: #ef4444;
  font-size: 1.125rem;
`;

// Fallback plans data when API is unavailable
const getFallbackPlans = (lang: 'en' | 'bg'): Plan[] => [
  {
    id: 'lite-premium',
    planCode: 'LITE_PREMIUM',
    displayName: 'LITE PREMIUM',
    displayNameBg: 'ЛАЙТ ПРЕМИУМ',
    pricing: {
      weekly: 4.99,
      monthly: null,
      yearly: 52,
      currency: 'EUR',
      yearlyDiscountPct: 20
    },
    billingOptions: {
      hasWeekly: true,
      hasMonthly: false,
      hasYearly: false
    },
    cashbackRate: 20,
    stickerBonus: 0,
    features: [
      'One week Premium access',
      'Up to 20% discount',
      'Exclusive Premium offers',
      'Limited availability special offers',
      'Access to exclusive Premium campaigns',
      'VIP priority support',
      'Cashback via the app'
    ],
    featuresBg: [
      'Едноседмичен Premium достъп',
      'До 20% отстъпка',
      'Ексклузивни Premium оферти',
      'Специални предложения с ограничена наличност',
      'Достъп до затворени Premium кампании',
      'VIP приоритетна поддръжка',
      'Връщане на пари чрез приложението'
    ],
    cardType: 'light',
    isFeatured: false,
    badge: { text: 'Most Bought', textBg: 'Най-купуван' }
  },
  {
    id: 'basic',
    planCode: 'BASIC',
    displayName: 'BASIC',
    displayNameBg: 'ОСНОВЕН',
    pricing: {
      weekly: null,
      monthly: 7.99,
      yearly: 84,
      currency: 'EUR',
      yearlyDiscountPct: 20
    },
    billingOptions: {
      hasWeekly: false,
      hasMonthly: true,
      hasYearly: true
    },
    cashbackRate: 10,
    stickerBonus: 0,
    features: [
      'One month access',
      'Up to 10% discount',
      'Cashback via the app',
      'Access to partner offers',
      'Standard support'
    ],
    featuresBg: [
      'Едномесечен достъп',
      'До 10% отстъпка',
      'Връщане на пари чрез приложението',
      'Достъп до партньорски оферти',
      'Стандартна поддръжка'
    ],
    cardType: 'silver',
    isFeatured: false,
    badge: null
  },
  {
    id: 'premium',
    planCode: 'PREMIUM',
    displayName: 'PREMIUM',
    displayNameBg: 'ПРЕМИУМ',
    pricing: {
      weekly: null,
      monthly: 12.99,
      yearly: 136,
      currency: 'EUR',
      yearlyDiscountPct: 20
    },
    billingOptions: {
      hasWeekly: false,
      hasMonthly: true,
      hasYearly: true
    },
    cashbackRate: 20,
    stickerBonus: 0,
    features: [
      'One month Premium access',
      'Up to 20% discount',
      'Exclusive Premium offers',
      'Limited availability special offers',
      'Access to exclusive Premium campaigns',
      'VIP priority support',
      'Cashback via the app'
    ],
    featuresBg: [
      'Едномесечен Premium достъп',
      'До 20% отстъпка',
      'Ексклузивни Premium оферти',
      'Специални предложения с ограничена наличност',
      'Достъп до затворени Premium кампании',
      'VIP приоритетна поддръжка',
      'Връщане на пари чрез приложението'
    ],
    cardType: 'black',
    isFeatured: true,
    badge: { text: 'Most Popular', textBg: 'Най-популярен' }
  }
];

const PricingPublicPage: React.FC = () => {
  const { language } = useLanguage();
  const [isAnnual, setIsAnnual] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch plans from API with fallback to static data
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoading(true);
        setError(null);

        // Set a timeout for the API call
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('API timeout')), 5000);
        });

        const apiPlans = await Promise.race([
          plansService.getPlans(),
          timeoutPromise
        ]);
        setPlans(apiPlans);
      } catch (err) {
        console.warn('API unavailable, using fallback plans:', err);
        // Use fallback plans instead of showing error
        setPlans(getFallbackPlans(language as 'en' | 'bg'));
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, [language]);

  const faqs = [
    {
      questionEn: 'Can I change my plan later?',
      questionBg: 'Мога ли да променя плана си по-късно?',
      answerEn: 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.',
      answerBg: 'Да, можете да надстроите или понижите плана си по всяко време. Промените влизат в сила незабавно.',
    },
    {
      questionEn: 'What payment methods do you accept?',
      questionBg: 'Какви методи за плащане приемате?',
      answerEn: 'We accept all major credit cards, debit cards, and bank transfers for annual plans.',
      answerBg: 'Приемаме всички основни кредитни карти, дебитни карти и банкови преводи за годишни планове.',
    },
    {
      questionEn: 'Is there a setup fee?',
      questionBg: 'Има ли такса за настройка?',
      answerEn: 'No, there are no setup fees or hidden charges. You only pay the monthly or annual subscription.',
      answerBg: 'Не, няма такси за настройка или скрити такси. Плащате само месечния или годишния абонамент.',
    },
  ];

  return (
    <PageContainer>
      <HeroSection>
        <HeroTitle
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {language === 'bg' ? 'Ясни, прозрачни цени' : 'Simple, Transparent Pricing'}
        </HeroTitle>
        <HeroSubtitle
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {language === 'bg'
            ? 'Изберете перфектния план за вашия начин на живот'
            : 'Choose the perfect plan for your lifestyle'}
        </HeroSubtitle>

        <TrialPeriodText
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          {language === 'bg'
            ? '24 часа безплатен Premium пробен период за всички планове'
            : '24h free Premium trial for all plans'}
        </TrialPeriodText>

        <BillingToggleContainer>
          <BillingToggle>
            <ToggleOption
              $active={isAnnual}
              onClick={() => setIsAnnual(true)}
            >
              {language === 'bg' ? 'Годишен абонамент (20% отстъпка)' : 'Yearly (20% off)'}
            </ToggleOption>
            <ToggleOption
              $active={!isAnnual}
              onClick={() => setIsAnnual(false)}
            >
              {language === 'bg' ? 'Месечен/Седмичен абонамент' : 'Monthly/Weekly'}
            </ToggleOption>
          </BillingToggle>
        </BillingToggleContainer>
      </HeroSection>

      {loading ? (
        <LoadingContainer>
          <LoadingSpinner />
          <p>{language === 'bg' ? 'Зареждане на планове...' : 'Loading plans...'}</p>
        </LoadingContainer>
      ) : error ? (
        <ErrorMessage>{error}</ErrorMessage>
      ) : (
        <SubscriptionCardsContainer>
          {plans.map((plan, index) => {
            // Check if this plan only has weekly billing (no monthly)
            const isWeeklyOnlyPlan = plan.billingOptions.hasWeekly && !plan.billingOptions.hasMonthly;
            // Weekly-only plans are disabled when yearly toggle is selected
            const isDisabled = isWeeklyOnlyPlan && isAnnual;

            // Determine display price based on plan's billing options
            let displayPriceEUR: number | null;
            let billingPeriod: 'weekly' | 'monthly' | 'yearly';
            let periodLabel: string;

            if (isWeeklyOnlyPlan) {
              // Weekly-only plan always shows weekly price
              displayPriceEUR = plan.pricing.weekly;
              billingPeriod = 'weekly';
              periodLabel = language === 'bg' ? '/седмица' : '/week';
            } else if (isAnnual) {
              displayPriceEUR = plan.pricing.yearly;
              billingPeriod = 'yearly';
              periodLabel = language === 'bg' ? '/година' : '/year';
            } else {
              displayPriceEUR = plan.pricing.monthly;
              billingPeriod = 'monthly';
              periodLabel = language === 'bg' ? '/месец' : '/month';
            }

            // Calculate BGN price
            const displayPriceBGN = displayPriceEUR ? convertEURToBGN(displayPriceEUR) : 0;
            const bgnLabel = language === 'bg' ? 'лв.' : 'BGN';

            // Get features based on language
            const features = language === 'bg' ? plan.featuresBg : plan.features;

            return (
              <PlanCardWrapper
                key={plan.id}
                $disabled={isDisabled}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: isDisabled ? 0.5 : 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.2 }}
              >
                {/* Badge from API - Most Bought for light card type */}
                {plan.cardType === 'light' && plan.badge && (
                  <MostBoughtBadge>
                    {language === 'bg' ? plan.badge.textBg : plan.badge.text}
                  </MostBoughtBadge>
                )}

                {/* Most Popular Badge for featured plans */}
                {plan.isFeatured && plan.badge && (
                  <FeaturedBadge>
                    {language === 'bg' ? plan.badge.textBg : plan.badge.text}
                  </FeaturedBadge>
                )}

                <CreditCardPlan $type={plan.cardType}>
                  <CardLogoText $type={plan.cardType}>
                    BOOM Card
                  </CardLogoText>

                  <CardNumber $type={plan.cardType}>
                    <span>••••</span>
                    <span>••••</span>
                    <span>••••</span>
                    <span>••••</span>
                  </CardNumber>

                  <CardBottomRow>
                    <CardHolderName $type={plan.cardType}>
                      {language === 'bg' ? plan.displayNameBg : plan.displayName}
                    </CardHolderName>
                    <CardPriceDisplay $type={plan.cardType}>
                      <span style={{ fontSize: '0.9rem', opacity: 0.85 }}>{displayPriceBGN.toFixed(2)} {bgnLabel} /</span> €{displayPriceEUR}
                      <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                        {periodLabel}
                      </span>
                    </CardPriceDisplay>
                  </CardBottomRow>
                </CreditCardPlan>

                <PlanDetails>
                  <FeaturesList>
                    {features.map((feature, i) => (
                      <FeatureItem key={i}>
                        {feature}
                      </FeatureItem>
                    ))}
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
                      /* SECURITY: Only pass planId and billing period - NO PRICE IN URL */
                      <Link to={`/register?planId=${plan.id}&billing=${billingPeriod}`}>
                        <Button
                          variant={plan.isFeatured ? 'primary' : 'secondary'}
                          size="large"
                        >
                          {language === 'bg' ? 'Започнете сега' : 'Get Started'}
                        </Button>
                      </Link>
                    )}
                  </PlanButtonContainer>
                </PlanDetails>
              </PlanCardWrapper>
            );
          })}
        </SubscriptionCardsContainer>
      )}

      <CashbackExplanation>
        {language === 'bg'
          ? 'Отстъпките се получават под формата на връщане на пари след качване на касова бележка в приложението. Процентът зависи от абонаментния план.'
          : 'Discounts are received as cashback after uploading a receipt in the app. The percentage depends on the subscription plan.'}
      </CashbackExplanation>

      <FAQSection>
        <FAQTitle>{language === 'bg' ? 'Често задавани въпроси' : 'Frequently Asked Questions'}</FAQTitle>
        {faqs.map((faq, index) => (
          <FAQItem key={index}>
            <FAQQuestion>{language === 'bg' ? faq.questionBg : faq.questionEn}</FAQQuestion>
            <FAQAnswer>{language === 'bg' ? faq.answerBg : faq.answerEn}</FAQAnswer>
          </FAQItem>
        ))}
      </FAQSection>

      {/* Client CTA */}
      <ClientCTA />
    </PageContainer>
  );
};

export default PricingPublicPage;
