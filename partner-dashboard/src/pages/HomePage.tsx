import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import styled from 'styled-components';
import { Gem, CheckCircle, Tag } from 'lucide-react';
import Card from '../components/common/Card/Card';
import Button from '../components/common/Button/Button';
import Carousel from '../components/common/Carousel/Carousel';
import OfferCard from '../components/common/OfferCard/OfferCard';
import HeroBlast from '../components/common/HeroBlast/HeroBlast';
import FomoBanner from '../components/common/FomoBanner/FomoBanner';
import ReviewCard from '../components/reviews/ReviewCard';
import ReviewSubmissionForm from '../components/reviews/ReviewSubmissionForm';
import ClientCTA from '../components/common/ClientCTA/ClientCTA';
import Tooltip from '../components/common/Tooltip/Tooltip';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useTopEntities } from '../hooks/useOffers';
import { offerToEntity, type Offer, type Entity } from '../types/entity.types';
import { usePartnerReviews } from '../hooks/usePartnerReviews';
import { updateSEO, addOrganizationSchema, addWebSiteSchema, generateHowToSchema, generateFAQSchema } from '../utils/seo';
import { convertEURToBGN } from '../utils/helpers';

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

const CTABox = styled(motion.div)`
  max-width: 64rem;
  margin: 0 auto;
  text-align: center;
  border-radius: 1.5rem;
  padding: 3rem 4rem;
  background: var(--color-primary);
  color: var(--color-secondary);

  /* Light mode - elegant gradient CTA */
  [data-theme="light"] & {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #4facfe 75%, #00f2fe 100%);
    background-size: 200% 200%;
    animation: ctaGradientShift 8s ease infinite;
    color: #ffffff;
    border: 3px solid transparent;
    border-image: linear-gradient(90deg, #667eea, #764ba2, #4facfe, #00f2fe) 1;
    box-shadow:
      0 25px 70px -15px rgba(102, 126, 234, 0.5),
      0 20px 60px -10px rgba(79, 172, 254, 0.4),
      0 15px 50px -5px rgba(118, 75, 162, 0.3);
  }

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

  /* Dark Theme - Sophisticated dark gradients */
  [data-theme="dark"] & {
    ${props => props.$type === 'starter' && `
      background: linear-gradient(135deg, #f9fafb 0%, #e5e7eb 100%);
      border: 2px solid rgba(156, 163, 175, 0.5);
      box-shadow:
        0 10px 40px rgba(0, 0, 0, 0.2);

      &::before {
        background: radial-gradient(circle, rgba(0, 0, 0, 0.05) 0%, transparent 70%);
      }
    `}

    ${props => props.$type === 'basic' && `
      background: linear-gradient(135deg, #374151 0%, #4b5563 100%);
      border: 3px solid #3b82f6;
      box-shadow:
        0 10px 40px rgba(59, 130, 246, 0.3),
        0 8px 30px rgba(6, 182, 212, 0.2);

      &::before {
        background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%);
      }
    `}

    ${props => props.$type === 'premium' && `
      background: linear-gradient(135deg, #111827 0%, #1f2937 50%, #0f172a 100%);
      border: 3px solid #06b6d4;
      box-shadow:
        0 10px 40px rgba(6, 182, 212, 0.5),
        0 8px 35px rgba(59, 130, 246, 0.4);

      &::before {
        background: radial-gradient(circle, rgba(6, 182, 212, 0.2) 0%, transparent 70%);
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
    ${props => props.$type === 'starter' && `
      background: linear-gradient(135deg, #ffffff 0%, #fff5f0 100%);
      border: 2px solid rgba(255, 148, 214, 0.3);
      box-shadow:
        0 10px 40px rgba(0, 0, 0, 0.15);

      &::before {
        background: radial-gradient(circle, rgba(255, 105, 180, 0.08) 0%, transparent 70%);
      }
    `}

    ${props => props.$type === 'basic' && `
      background: linear-gradient(135deg, #ffd6a5 0%, #ffb5d5 50%, #c9e4ff 100%);
      border: 3px solid #ff94d6;
      box-shadow:
        0 10px 40px rgba(255, 148, 214, 0.4),
        0 8px 30px rgba(178, 75, 243, 0.3);

      &::before {
        background: radial-gradient(circle, rgba(255, 105, 180, 0.2) 0%, transparent 70%);
      }
    `}

    ${props => props.$type === 'premium' && `
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

  /* Light mode */
  [data-theme="light"] & {
    background: rgba(255, 255, 255, 0.9);
  }

  /* Dark mode */
  [data-theme="dark"] & {
    background: rgba(201, 162, 55, 0.15);
  }
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

  [data-theme="dark"] & {
    color: ${props => props.$type === 'premium' ? '#06b6d4' : props.$type === 'starter' ? '#1a1a1a' : '#f8fafc'};
    text-shadow: ${props => props.$type === 'premium'
      ? '0 2px 15px rgba(6, 182, 212, 0.6), 0 0 30px rgba(59, 130, 246, 0.4)'
      : props.$type === 'starter'
      ? '0 1px 2px rgba(0, 0, 0, 0.1)'
      : '0 2px 8px rgba(59, 130, 246, 0.3)'};
  }

  [data-theme="color"] & {
    color: ${props => props.$type === 'premium' ? '#ff4500' : props.$type === 'starter' ? '#1a0a2e' : '#1a0a2e'};
    text-shadow: ${props => props.$type === 'premium'
      ? '0 2px 15px rgba(255, 69, 0, 0.6), 0 0 30px rgba(255, 0, 110, 0.4)'
      : props.$type === 'starter'
      ? '0 1px 2px rgba(0, 0, 0, 0.08)'
      : '0 2px 8px rgba(139, 47, 184, 0.3)'};
  }
`;

const CardNumber = styled.div<{ $type?: 'starter' | 'basic' | 'premium' }>`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 2rem;
  font-size: 1.25rem;
  color: ${props => props.$type === 'starter' ? 'rgba(100, 100, 100, 0.8)' : props.$type === 'basic' ? 'rgba(26, 26, 26, 0.9)' : 'rgba(255, 255, 255, 0.9)'};
  letter-spacing: 0.25rem;
  font-family: 'Courier New', monospace;

  [data-theme="dark"] & {
    color: ${props => props.$type === 'starter' ? 'rgba(26, 26, 26, 0.8)' : 'rgba(248, 250, 252, 0.9)'};
  }

  [data-theme="color"] & {
    color: ${props => props.$type === 'starter' ? 'rgba(26, 10, 46, 0.7)' : props.$type === 'basic' ? 'rgba(26, 10, 46, 0.8)' : 'rgba(255, 255, 255, 0.95)'};
  }
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

  [data-theme="dark"] & {
    color: ${props => props.$type === 'starter' ? 'rgba(26, 26, 26, 0.95)' : 'rgba(248, 250, 252, 0.95)'};
  }

  [data-theme="color"] & {
    color: ${props => props.$type === 'starter' ? 'rgba(26, 10, 46, 0.85)' : props.$type === 'basic' ? 'rgba(26, 10, 46, 0.9)' : 'rgba(255, 255, 255, 0.95)'};
  }
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

  [data-theme="dark"] & {
    color: ${props => props.$type === 'premium' ? '#06b6d4' : props.$type === 'starter' ? '#1a1a1a' : '#f8fafc'};
    text-shadow: ${props => props.$type === 'premium'
      ? '0 2px 10px rgba(6, 182, 212, 0.4)'
      : props.$type === 'starter'
      ? 'none'
      : '0 1px 4px rgba(59, 130, 246, 0.2)'};
  }

  [data-theme="color"] & {
    color: ${props => props.$type === 'premium' ? '#ff4500' : props.$type === 'starter' ? '#1a0a2e' : '#1a0a2e'};
    text-shadow: ${props => props.$type === 'premium'
      ? '0 2px 10px rgba(255, 69, 0, 0.4)'
      : props.$type === 'starter'
      ? 'none'
      : '0 1px 4px rgba(139, 47, 184, 0.2)'};
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

const TopOffersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  max-width: 1200px;
  margin: 0 auto;

  @media (max-width: 1024px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 1.5rem;
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: 1.25rem;
    max-width: 400px;
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
  const { user } = useAuth();
  const location = useLocation();
  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 300], [1, 0]);
  const heroScale = useTransform(scrollY, [0, 300], [1, 0.95]);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  // Scroll to section when navigating with hash (e.g. /#subscription-plans)
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [location.hash]);

  // Fetch top offers from API
  const { data: topEntitiesData, isLoading: isLoadingOffers } = useTopEntities(6);
  const topEntities = topEntitiesData || [];

  // Fetch reviews from API with overall stats
  const { reviews: reviewsData, loading: loadingReviews, stats: reviewStats, createReview: createReviewMutation, markHelpful: markHelpfulMutation } = usePartnerReviews({
    filters: { status: 'APPROVED', limit: 6, sortBy: 'createdAt', sortOrder: 'desc' }
  });
  const [showReviewForm, setShowReviewForm] = useState(false);

  // Wrap mutations to match expected signatures
  const createReview = async (data: any): Promise<void> => {
    await createReviewMutation(data);
  };

  const markHelpful = async (id: string, helpful: boolean): Promise<void> => {
    await markHelpfulMutation(id, helpful);
  };

  // SEO optimization with bilingual support
  useEffect(() => {
    updateSEO({
      title: language === 'bg'
        ? 'BOOM Card - Промоции, Изживявания, Карта за Намаления'
        : 'BOOM Card - Promotions, Experiences, Discount Card',
      description: language === 'bg'
        ? 'Открийте ексклузивни оферти и топ изживявания с вашата BOOM Card карта за намаления. Подарете си незабравими преживявания!'
        : 'Discover exclusive offers and top experiences with your BOOM Card discount card. Gift yourself unforgettable experiences!',
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
      name: language === 'bg' ? 'Как работи BOOM Card' : 'How BOOM Card Works',
      description: language === 'bg'
        ? 'Научете как да използвате вашата BOOM Card карта за достъп до ексклузивни промоции и изживявания'
        : 'Learn how to use your BOOM Card to access exclusive promotions and experiences',
      totalTime: 'PT3M',
      steps: [
        {
          name: language === 'bg' ? 'Регистрирайте се' : 'Sign Up',
          text: language === 'bg'
            ? 'Създайте вашия безплатен BOOM Card акаунт за достъп до хиляди оферти'
            : 'Create your free BOOM Card account to access thousands of offers',
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
        question: language === 'bg' ? 'Какво е BOOM Card?' : 'What is BOOM Card?',
        answer: language === 'bg'
          ? 'BOOM Card е карта за намаления, която ви дава достъп до ексклузивни промоции и топ изживявания в цяла България.'
          : 'BOOM Card is a discount card that gives you access to exclusive promotions and top experiences across Bulgaria.',
      },
      {
        question: language === 'bg' ? 'Колко струва BOOM Card?' : 'How much does BOOM Card cost?',
        answer: language === 'bg'
          ? 'BOOM Card предлага два плана: Безплатен основен план и Премиум план за 57 лв./€29/месец.'
          : 'BOOM Card offers two plans: Free basic plan and Premium plan for 57 BGN/€29/month.',
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
      path: '/venues/restaurants'
    },
    {
      title: t('home.hotelsSpa'),
      description: t('home.hotelsSpaDesc'),
      icon: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&h=400&fit=crop',
      count: 80,
      path: '/venues/hotels'
    },
    {
      title: t('home.wineries'),
      description: t('home.wineriesDesc'),
      icon: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=400&h=400&fit=crop',
      count: 45,
      path: '/venues/wineries'
    },
    {
      title: t('home.experiences'),
      description: t('home.experiencesDesc'),
      icon: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=400&h=400&fit=crop',
      count: 120,
      path: '/venues/experiences'
    }
  ];

  // Fallback exclusive offers when API data is unavailable
  const fallbackExclusiveOffers: Offer[] = [
    {
      id: 'exc-1',
      title: 'Shtastliveca Restaurant',
      titleBg: 'Ресторант Щастливеца',
      description: 'Traditional Bulgarian cuisine with a modern twist in the heart of Sofia. Famous for its cozy atmosphere.',
      descriptionBg: 'Традиционна българска кухня с модерен привкус в сърцето на София. Известен с уютната си атмосфера.',
      category: 'Restaurants',
      categoryBg: 'Ресторанти',
      location: language === 'bg' ? 'София, ул. Витоша 18' : 'Sofia, Vitosha Str. 18',
      discount: 20,
      originalPrice: 80,
      discountedPrice: 64,
      imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=400&fit=crop',
      partnerName: 'Shtastliveca',
      rating: 4.7,
      reviewCount: 1284,
      workingHours: '10:00 - 23:00',
      workingHoursBg: '10:00 - 23:00',
      path: '/offers/exc-1'
    },
    {
      id: 'exc-2',
      title: 'Lucky Bansko SPA & Relax',
      titleBg: 'Lucky Bansko SPA & Relax',
      description: 'Luxury spa hotel with panoramic mountain views, indoor pools, and premium wellness treatments.',
      descriptionBg: 'Луксозен спа хотел с панорамна гледка към планината, закрити басейни и премиум уелнес процедури.',
      category: 'Hotels & SPA',
      categoryBg: 'Хотели и СПА',
      location: language === 'bg' ? 'Банско' : 'Bansko',
      discount: 20,
      originalPrice: 350,
      discountedPrice: 280,
      imageUrl: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=600&h=400&fit=crop',
      partnerName: 'Lucky Bansko',
      rating: 4.8,
      reviewCount: 2156,
      workingHours: '24/7',
      workingHoursBg: '24/7',
      path: '/offers/exc-2'
    },
    {
      id: 'exc-3',
      title: 'Wine & Dine - Todoroff Winery',
      titleBg: 'Wine & Dine - Тодорови Изби',
      description: 'Award-winning winery offering guided wine tastings, gourmet dining, and vineyard tours.',
      descriptionBg: 'Награждавана изба с дегустации, гурме вечери и обиколки на лозята.',
      category: 'Wineries',
      categoryBg: 'Винарни',
      location: language === 'bg' ? 'Брестовица, Пловдив' : 'Brestovitsa, Plovdiv',
      discount: 15,
      originalPrice: 120,
      discountedPrice: 102,
      imageUrl: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=600&h=400&fit=crop',
      partnerName: 'Todoroff',
      rating: 4.6,
      reviewCount: 876,
      workingHours: '10:00 - 20:00',
      workingHoursBg: '10:00 - 20:00',
      path: '/offers/exc-3'
    },
    {
      id: 'exc-4',
      title: 'Escape Rooms Sofia',
      titleBg: 'Ескейп Стаи София',
      description: 'Top-rated escape rooms with immersive themes. Team building and birthday parties available.',
      descriptionBg: 'Топ ескейп стаи с потапящи теми. Тийм билдинг и рождени дни.',
      category: 'Experiences',
      categoryBg: 'Изживявания',
      location: language === 'bg' ? 'София, Младост 1А' : 'Sofia, Mladost 1A',
      discount: 20,
      originalPrice: 60,
      discountedPrice: 48,
      imageUrl: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=600&h=400&fit=crop',
      partnerName: 'Escape Rooms Sofia',
      rating: 4.9,
      reviewCount: 534,
      workingHours: '12:00 - 22:00',
      workingHoursBg: '12:00 - 22:00',
      path: '/offers/exc-4'
    },
    {
      id: 'exc-5',
      title: 'Sense Hotel Sofia',
      titleBg: 'Хотел Сенс София',
      description: 'Boutique hotel in downtown Sofia with rooftop bar, city views, and exclusive member perks.',
      descriptionBg: 'Бутиков хотел в центъра на София с руфтоп бар, градска гледка и ексклузивни предимства.',
      category: 'Hotels & SPA',
      categoryBg: 'Хотели и СПА',
      location: language === 'bg' ? 'София, ул. Цар Освободител' : 'Sofia, Tsar Osvoboditel Str.',
      discount: 18,
      originalPrice: 280,
      discountedPrice: 230,
      imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&h=400&fit=crop',
      partnerName: 'Sense Hotel',
      rating: 4.5,
      reviewCount: 1023,
      workingHours: '24/7',
      workingHoursBg: '24/7',
      path: '/offers/exc-5'
    },
    {
      id: 'exc-6',
      title: 'Happy Bar & Grill Varna',
      titleBg: 'Happy Bar & Grill Варна',
      description: 'Popular seaside restaurant chain with international menu, fresh seafood, and sea views.',
      descriptionBg: 'Популярна верига крайморски ресторанти с международно меню, пресни морски дарове и морска гледка.',
      category: 'Restaurants',
      categoryBg: 'Ресторанти',
      location: language === 'bg' ? 'Варна, Морска градина' : 'Varna, Sea Garden',
      discount: 20,
      originalPrice: 70,
      discountedPrice: 56,
      imageUrl: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=400&fit=crop',
      partnerName: 'Happy',
      rating: 4.4,
      reviewCount: 3412,
      workingHours: '09:00 - 00:00',
      workingHoursBg: '09:00 - 00:00',
      path: '/offers/exc-6'
    }
  ];

  const fallbackEntities = fallbackExclusiveOffers.map(offerToEntity);

  const subscriptionPlans = [
    {
      name: language === 'bg' ? 'ЛАЙТ ПРЕМИУМ' : 'LITE PREMIUM',
      monthlyPrice: 4.99,
      monthlyPriceBGN: 9.77,
      yearlyPrice: 52,
      duration: language === 'bg' ? '/седмица' : '/week',
      type: 'starter' as const,
      features: [
        language === 'bg' ? 'Едноседмичен Premium достъп' : 'One week Premium access',
        language === 'bg' ? 'До 20% отстъпка' : 'Up to 20% discount',
        language === 'bg' ? 'Ексклузивни Premium оферти' : 'Exclusive Premium offers',
        language === 'bg' ? 'Специални предложения с ограничена наличност' : 'Limited availability special offers',
        language === 'bg' ? 'Достъп до затворени Premium кампании' : 'Access to exclusive Premium campaigns',
        language === 'bg' ? 'VIP приоритетна поддръжка' : 'VIP priority support',
        language === 'bg' ? 'Връщане на пари чрез приложението' : 'Cashback via the app'
      ],
      tooltips: [
        language === 'bg' ? 'Пълен Premium достъп за 7 дни' : 'Full Premium access for 7 days',
        language === 'bg' ? 'Най-високи отстъпки във всички партньори' : 'Highest discounts at all partners',
        language === 'bg' ? 'Достъп до затворени Premium кампании' : 'Access to exclusive Premium campaigns',
        language === 'bg' ? 'Оферти с ограничен брой или време' : 'Offers with limited quantity or time',
        language === 'bg' ? 'Ексклузивен достъп до VIP кампании' : 'Exclusive access to VIP campaigns',
        language === 'bg' ? 'Получете помощ в рамките на 1 час' : 'Get help within 1 hour',
        language === 'bg' ? 'Качи касова бележка и получи пари обратно' : 'Upload receipt and get money back'
      ]
    },
    {
      name: language === 'bg' ? 'ОСНОВЕН' : 'BASIC',
      monthlyPrice: 7.99,
      monthlyPriceBGN: 15.63,
      yearlyPrice: 84,
      duration: language === 'bg' ? '/месец' : '/month',
      features: [
        language === 'bg' ? 'Едномесечен достъп' : 'One month access',
        language === 'bg' ? 'До 10% отстъпка' : 'Up to 10% discount',
        language === 'bg' ? 'Връщане на пари чрез приложението' : 'Cashback via the app',
        language === 'bg' ? 'Достъп до партньорски оферти' : 'Access to partner offers',
        language === 'bg' ? 'Стандартна поддръжка' : 'Standard support'
      ],
      tooltips: [
        language === 'bg' ? 'Пълен достъп за 30 дни' : 'Full access for 30 days',
        language === 'bg' ? 'Отстъпки в избрани заведения' : 'Discounts at selected venues',
        language === 'bg' ? 'Качи касова бележка и получи пари обратно' : 'Upload receipt and get money back',
        language === 'bg' ? 'Над 500 партньори в цялата страна' : 'Over 500 partners across the country',
        language === 'bg' ? 'Отговор в рамките на 24 часа' : 'Response within 24 hours'
      ]
    },
    {
      name: language === 'bg' ? 'ПРЕМИУМ' : 'PREMIUM',
      monthlyPrice: 12.99,
      monthlyPriceBGN: 25.41,
      yearlyPrice: 136,
      duration: language === 'bg' ? '/месец' : '/month',
      featured: true,
      features: [
        language === 'bg' ? 'Едномесечен Premium достъп' : 'One month Premium access',
        language === 'bg' ? 'До 20% отстъпка' : 'Up to 20% discount',
        language === 'bg' ? 'Ексклузивни Premium оферти' : 'Exclusive Premium offers',
        language === 'bg' ? 'Специални предложения с ограничена наличност' : 'Limited availability special offers',
        language === 'bg' ? 'Достъп до затворени Premium кампании' : 'Access to exclusive Premium campaigns',
        language === 'bg' ? 'VIP приоритетна поддръжка' : 'VIP priority support',
        language === 'bg' ? 'Връщане на пари чрез приложението' : 'Cashback via the app'
      ],
      tooltips: [
        language === 'bg' ? 'Пълен Premium достъп за 30 дни' : 'Full Premium access for 30 days',
        language === 'bg' ? 'Най-високи отстъпки във всички партньори' : 'Highest discounts at all partners',
        language === 'bg' ? 'Достъп до затворени Premium кампании' : 'Access to exclusive Premium campaigns',
        language === 'bg' ? 'Оферти с ограничен брой или време' : 'Offers with limited quantity or time',
        language === 'bg' ? 'Ексклузивен достъп до VIP кампании' : 'Exclusive access to VIP campaigns',
        language === 'bg' ? 'Получете помощ в рамките на 1 час' : 'Get help within 1 hour',
        language === 'bg' ? 'Качи касова бележка и получи пари обратно' : 'Upload receipt and get money back'
      ]
    }
  ];

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
                tooltip: language === 'bg' ? 'Бърза регистрация за 30 секунди' : 'Quick 30-second registration'
              },
              {
                step: '2',
                title: 'step2Title',
                desc: 'step2Description',
                tooltip: language === 'bg' ? 'Разгледайте над 500 ексклузивни оферти' : 'Browse over 500 exclusive offers'
              },
              {
                step: '3',
                title: 'step3Title',
                desc: 'step3Description',
                tooltip: language === 'bg' ? 'Моментално активиране и спестяване' : 'Instant activation and savings'
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
          <div className="text-center mt-12">
            <a
              href="https://apps.apple.com/app/boomcard/id6740091561"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.875rem 2rem',
                background: 'var(--color-primary, #111827)',
                color: 'var(--color-secondary, #ffffff)',
                borderRadius: '0.75rem',
                fontSize: 'clamp(1rem, 3vw, 1.125rem)',
                fontWeight: 700,
                textDecoration: 'none',
                transition: 'all 200ms',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.15)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.15)';
              }}
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '1.25rem', height: '1.25rem' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {t('home.downloadAppCta')}
            </a>
            <p style={{ color: 'var(--color-text-tertiary, #6b7280)', fontSize: '0.875rem', marginTop: '0.75rem' }}>
              {t('home.availableForIosAndroid')}
            </p>
          </div>
        </div>
      </section>

      {/* Top Discounts - Exclusive Offers Section */}
      <section id="top-discounts" className="section" style={{ background: 'var(--color-background-secondary)' }}>
        <div className="container-custom">
          <div className="text-center mb-12">
            <SectionTitle className="text-4xl md:text-5xl font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>
              {language === 'bg' ? 'Топ Отстъпки' : 'Top Discounts'}
            </SectionTitle>
            <BodyText className="text-xl max-w-2xl mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
              {language === 'bg'
                ? 'Ексклузивни оферти от нашите най-добри партньори'
                : 'Exclusive offers from our best partners'}
            </BodyText>
          </div>

          {isLoadingOffers ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--color-primary)' }}></div>
              <BodyText className="mt-4" style={{ color: 'var(--color-text-secondary)' }}>
                {language === 'bg' ? 'Зареждане на оферти...' : 'Loading offers...'}
              </BodyText>
            </div>
          ) : (
            <TopOffersGrid>
              {(topEntities.length > 0 ? topEntities : fallbackEntities).slice(0, 6).map((entity: Entity, index: number) => (
                <motion.div
                  key={entity.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <OfferCard entity={entity} />
                </motion.div>
              ))}
            </TopOffersGrid>
          )}

          <div className="text-center mt-10">
            <Link to="/offers" style={{ textDecoration: 'none' }}>
              <Button variant="secondary" size="large">
                {language === 'bg' ? 'Виж всички оферти' : 'View all offers'}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Divider between Top Discounts and Subscription Plans */}
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

          <SubscriptionCardsContainer>
            {subscriptionPlans.map((plan, index) => {
              const planType = (plan as any).type || (plan.featured ? 'premium' : 'basic');
              const isLitePlan = planType === 'starter';
              const isDisabled = isLitePlan && billingPeriod === 'yearly';
              // Lite plan always shows weekly price, even when disabled
              const eurPrice = isLitePlan
                ? plan.monthlyPrice
                : (billingPeriod === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice);
              const bgnPrice = isLitePlan
                ? (plan as any).monthlyPriceBGN
                : (billingPeriod === 'yearly' ? convertEURToBGN(plan.yearlyPrice) : (plan as any).monthlyPriceBGN);
              const bgnLabel = language === 'bg' ? 'лв.' : 'BGN';
              // Display dual currency: BGN / €EUR
              const displayPrice = `${bgnPrice.toFixed(2)} ${bgnLabel} / €${eurPrice}`;
              const priceLabel = isLitePlan
                ? (plan as any).duration
                : (billingPeriod === 'yearly'
                  ? (language === 'bg' ? '/година' : '/year')
                  : ((plan as any).duration || (language === 'bg' ? '/месец' : '/month')));
              return (
              <PlanCardWrapper
                key={index}
                $disabled={isDisabled}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: isDisabled ? 0.5 : 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.2 }}
              >
                {/* Most Bought Badge for Light Plan */}
                {planType === 'starter' && (
                  <MostBoughtBadge>
                    {language === 'bg' ? 'Най-купуван' : 'Most Bought'}
                  </MostBoughtBadge>
                )}

                {/* Most Popular Badge - positioned relative to wrapper */}
                {plan.featured && (
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
                      {plan.name.toUpperCase()}
                    </CardHolderName>
                    <CardPriceDisplay $type={planType}>
                      <span style={{ fontSize: '0.9rem', opacity: 0.85 }}>{bgnPrice.toFixed(2)} {bgnLabel} /</span> €{eurPrice}
                      <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                        {priceLabel}
                      </span>
                    </CardPriceDisplay>
                  </CardBottomRow>
                </CreditCardPlan>

                {/* Plan Details Below Card */}
                <PlanDetails>
                  <FeaturesList>
                    {plan.features.map((feature, i) => {
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
                      <Link to={`/checkout?planCode=${planType}&billing=${isLitePlan ? 'weekly' : billingPeriod}`}>
                        <Button
                          variant={plan.featured ? 'primary' : 'secondary'}
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
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Спестих около 35 лв. / €18 при вечеря за двама. Качих бележката за под минута.'
                      : 'Saved about 35 BGN / €18 on dinner for two. Uploaded the receipt in under a minute.'
                  },
                  {
                    author: language === 'bg' ? 'Иван П.' : 'Ivan P.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Ползвах го в бар и ресторант. Процесът е ясен и работи както е описано.'
                      : 'Used it at a bar and restaurant. The process is clear and works as described.'
                  },
                  {
                    author: language === 'bg' ? 'Георги М.' : 'Georgi M.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Сканирането е бързо, а качването на бележката е супер лесно. Няма излишни стъпки.'
                      : 'Scanning is fast and uploading the receipt is super easy. No unnecessary steps.'
                  },
                  {
                    author: language === 'bg' ? 'Петя К.' : 'Petya K.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Спестих 23 лв. / €12 на първата си поръчка. Приложението е лесно за използване.'
                      : 'Saved 23 BGN / €12 on my first order. The app is easy to use.'
                  },
                  {
                    author: language === 'bg' ? 'Николай Т.' : 'Nikolay T.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Добри отстъпки за СПА уикенд. Спестихме 68 лв. / €35 за масажи.'
                      : 'Good discounts for a spa weekend. We saved 68 BGN / €35 on massages.'
                  },
                  {
                    author: language === 'bg' ? 'Силвия В.' : 'Silvia V.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Много лесно за използване. Вече препоръчах на приятели.'
                      : 'Very easy to use. Already recommended to friends.'
                  },
                  {
                    author: language === 'bg' ? 'Димитър А.' : 'Dimitar A.',
                    rating: 4,
                    comment: language === 'bg'
                      ? 'Работи добре в София. Искам повече партньори в Пловдив.'
                      : 'Works well in Sofia. Would like more partners in Plovdiv.'
                  },
                  {
                    author: language === 'bg' ? 'Александра Н.' : 'Alexandra N.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Използвам картата всяка седмица. Спестих над 150 лв. / €77 за месец.'
                      : 'I use the card every week. Saved over 150 BGN / €77 in a month.'
                  },
                  {
                    author: language === 'bg' ? 'Ваня Р.' : 'Vanya R.',
                    rating: 4,
                    comment: language === 'bg'
                      ? 'Добро приложение, лесен интерфейс. Би било страхотно с повече винарни.'
                      : 'Good app, easy interface. Would be great with more wineries.'
                  },
                  {
                    author: language === 'bg' ? 'Красимир Л.' : 'Krasimir L.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Спестих 42 лв. / €21 на рожден ден в ресторант. Препоръчвам!'
                      : 'Saved 42 BGN / €21 on a birthday dinner at a restaurant. Recommend!'
                  },
                  {
                    author: language === 'bg' ? 'Даниела К.' : 'Daniela K.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Супер за семейни излизания. Децата се радват, а ние спестяваме.'
                      : 'Great for family outings. Kids are happy and we save money.'
                  },
                  {
                    author: language === 'bg' ? 'Тодор В.' : 'Todor V.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Качих 5 бележки тази седмица. Всички кешбеци дойдоха навреме.'
                      : 'Uploaded 5 receipts this week. All cashbacks came on time.'
                  },
                  {
                    author: language === 'bg' ? 'Ирина Х.' : 'Irina H.',
                    rating: 4,
                    comment: language === 'bg'
                      ? 'Харесва ми концепцията. Използвам го предимно в кафенета.'
                      : 'I like the concept. I use it mainly in cafes.'
                  },
                  {
                    author: language === 'bg' ? 'Борис Г.' : 'Boris G.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Отлична услуга! Спестих 89 лв. / €45 за уикенд в Банско.'
                      : 'Excellent service! Saved 89 BGN / €45 for a weekend in Bansko.'
                  },
                  {
                    author: language === 'bg' ? 'Надя П.' : 'Nadya P.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Приложението работи безупречно. VIP поддръжката отговаря веднага.'
                      : 'The app works flawlessly. VIP support responds immediately.'
                  },
                  {
                    author: language === 'bg' ? 'Мартин Й.' : 'Martin Y.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Най-добрата инвестиция тази година. Спестих колкото годишен абонамент за месец.'
                      : 'Best investment this year. Saved as much as the annual subscription in a month.'
                  },
                  {
                    author: language === 'bg' ? 'Росица Ф.' : 'Rositsa F.',
                    rating: 4,
                    comment: language === 'bg'
                      ? 'Много партньори във Варна. Използвам го всеки уикенд на морето.'
                      : 'Many partners in Varna. I use it every weekend at the seaside.'
                  },
                  {
                    author: language === 'bg' ? 'Калоян С.' : 'Kaloyan S.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Спестих 56 лв. / €29 на вечеря за четирима. Определено си струва.'
                      : 'Saved 56 BGN / €29 on dinner for four. Definitely worth it.'
                  },
                  {
                    author: language === 'bg' ? 'Анна М.' : 'Anna M.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Премиум планът е страхотен. Получавам достъп до ексклузивни оферти.'
                      : 'The Premium plan is great. I get access to exclusive offers.'
                  },
                  {
                    author: language === 'bg' ? 'Христо Д.' : 'Hristo D.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Лесно и бързо. Сканираш, качваш, получаваш кешбек. Толкова просто.'
                      : 'Easy and fast. Scan, upload, get cashback. That simple.'
                  },
                  {
                    author: language === 'bg' ? 'Виктория Т.' : 'Victoria T.',
                    rating: 4,
                    comment: language === 'bg'
                      ? 'Добро съотношение качество-цена. Бих искала повече хотели в мрежата.'
                      : 'Good value for money. Would like more hotels in the network.'
                  },
                  {
                    author: language === 'bg' ? 'Пламен К.' : 'Plamen K.',
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
                      <div style={{
                        width: '3rem',
                        height: '3rem',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--color-primary) 0%, #ff006e 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '1.25rem',
                        flexShrink: 0
                      }}>
                        {testimonial.author[0]}
                      </div>
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
                  ? 'BOOM Card е карта за намаления, която ви дава достъп до ексклузивни промоции и топ изживявания в цяла България — ресторанти, хотели, СПА центрове и още.'
                  : 'BOOM Card is a discount card that gives you access to exclusive promotions and top experiences across Bulgaria — restaurants, hotels, spas, and more.',
              },
              {
                q: language === 'bg' ? 'Колко струва BOOM Card?' : 'How much does BOOM Card cost?',
                a: language === 'bg'
                  ? 'BOOM Card предлага два плана: Безплатен основен план и Премиум план за 57 лв./€29/месец. Започнете с 24 часа безплатен Premium!'
                  : 'BOOM Card offers two plans: Free basic plan and Premium plan for 57 BGN/€29/month. Start with 24 hours of free Premium!',
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
                  ? 'Средната отстъпка варира между 10% и 50%, в зависимост от вашия план и партньора.'
                  : 'The average discount ranges from 10% to 50%, depending on your plan and the partner.',
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
                  ? 'Изтеглете приложението от App Store или Google Play, влезте с вашия акаунт и покажете дигиталната си карта на място, за да получите отстъпка.'
                  : 'Download the app from the App Store or Google Play, sign in with your account, and show your digital card at the venue to get your discount.',
              },
            ].map((faq, index) => (
              <FAQAccordionItem key={index} question={faq.q} answer={faq.a} />
            ))}
          </div>

          {/* Download App CTA below FAQ */}
          <div style={{ textAlign: 'center', marginTop: 'clamp(2rem, 4vw, 3rem)', paddingTop: '2rem', borderTop: '1px solid var(--color-border, #e5e7eb)' }}>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'clamp(1rem, 3vw, 1.125rem)', marginBottom: '1.25rem', fontWeight: 500 }}>
              {language === 'bg' ? 'Свали мобилно приложение' : 'Download the mobile app'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <a
                href="https://apps.apple.com/app/boomcard/id6740091561"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  background: '#000',
                  color: '#fff',
                  borderRadius: '0.625rem',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  transition: 'opacity 200ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                App Store
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.boomcard.app"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  background: '#000',
                  color: '#fff',
                  borderRadius: '0.625rem',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  transition: 'opacity 200ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.49c.28.17.6.24.92.2.33-.05.63-.2.86-.43L17.21 12 4.96.74c-.23-.23-.53-.38-.86-.43-.32-.04-.64.03-.92.2-.56.34-.91.95-.91 1.62v19.74c0 .67.35 1.28.91 1.62zM20.16 10.65L17.21 12l2.95 1.35L22.06 12l-1.9-1.35z"/></svg>
                Google Play
              </a>
            </div>
          </div>
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