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
import Tooltip from '../components/common/Tooltip/Tooltip';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useTopOffers } from '../hooks/useOffers';
import { usePartnerReviews } from '../hooks/usePartnerReviews';
import { updateSEO, addOrganizationSchema, addWebSiteSchema, generateHowToSchema, generateFAQSchema } from '../utils/seo';

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
    gap: 2rem;
  }

  @media (max-width: 480px) {
    gap: 1.5rem;
  }
`;

const PlanCardWrapper = styled(motion.div)`
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  padding-top: 1rem; /* Space for "Most Popular" badge */
  height: 100%; /* Ensure full height */
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
  top: 0;
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

  @media (max-width: 768px) {
    padding: 1rem 0;
  }

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
  }
`;

const FeatureItem = styled.li`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 0.875rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.875rem;
  font-size: clamp(0.875rem, 2.5vw, 0.9375rem);
  font-weight: 400;

  @media (max-width: 768px) {
    padding: 0.75rem 1rem;
    gap: 0.75rem;
  }
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);

  &:last-child {
    border-bottom: none;
  }

  &::before {
    content: '✓';
    display: flex;
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

  a {
    display: block;
    width: 100%;
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
  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 300], [1, 0]);
  const heroScale = useTransform(scrollY, [0, 300], [1, 0.95]);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  // Fetch top offers from API
  const { data: topOffersData, isLoading: isLoadingOffers } = useTopOffers(6);
  const topOffers = topOffersData || [];

  // Fetch reviews from API
  const { reviews: reviewsData, loading: loadingReviews, createReview: createReviewMutation, markHelpful: markHelpfulMutation } = usePartnerReviews({
    filters: { status: 'APPROVED', limit: 3, sortBy: 'createdAt', sortOrder: 'desc' }
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
          ? 'BOOM Card предлага два плана: Безплатен основен план и Премиум план за 29 лв/месец.'
          : 'BOOM Card offers two plans: Free basic plan and Premium plan for 29 BGN/month.',
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
      name: language === 'bg' ? 'Лек План' : 'Light Plan',
      monthlyPrice: 4.99,
      yearlyPrice: 52,
      duration: language === 'bg' ? ' €/седмица' : ' €/week',
      type: 'starter' as const,
      features: [
        language === 'bg' ? '24 часа премиум услуга' : '24 hours premium service',
        language === 'bg' ? 'Важи една седмица' : 'Valid for one week',
        language === 'bg' ? 'Достъп до основни оферти' : 'Access to basic offers'
      ],
      tooltips: [
        language === 'bg' ? 'Пробвайте всички премиум функции за 24 часа' : 'Try all premium features for 24 hours',
        language === 'bg' ? 'Достъп за 7 дни след активиране' : 'Access for 7 days after activation',
        language === 'bg' ? 'Над 500 партньори в цялата страна' : 'Over 500 partners across the country'
      ]
    },
    {
      name: language === 'bg' ? 'Основен' : 'Basic',
      monthlyPrice: 7.99,
      yearlyPrice: 84,
      duration: language === 'bg' ? ' €/седмица' : ' €/week',
      features: [
        language === 'bg' ? '24 часа премиум услуга' : '24 hours premium service',
        language === 'bg' ? 'Достъп до основни оферти' : 'Access to basic offers',
        language === 'bg' ? 'До 10% отстъпка' : 'Up to 10% discount',
        language === 'bg' ? 'Кешбек в приложението' : 'In-app cashback'
      ],
      tooltips: [
        language === 'bg' ? 'Пробвайте всички премиум функции за 24 часа' : 'Try all premium features for 24 hours',
        language === 'bg' ? 'Над 500 партньори в цялата страна' : 'Over 500 partners across the country',
        language === 'bg' ? 'Ексклузивни отстъпки в избрани заведения' : 'Exclusive discounts at selected venues',
        language === 'bg' ? 'Връщане на пари при всяка покупка' : 'Cashback on every purchase'
      ]
    },
    {
      name: language === 'bg' ? 'Премиум' : 'Premium',
      monthlyPrice: 12.99,
      yearlyPrice: 136,
      duration: language === 'bg' ? ' €/седмица' : ' €/week',
      featured: true,
      features: [
        language === 'bg' ? '24 часа премиум услуга' : '24 hours premium service',
        language === 'bg' ? 'До 20% отстъпка' : 'Up to 20% discount',
        language === 'bg' ? 'В зависимост от заведението' : 'Depending on the venue',
        language === 'bg' ? 'Приоритетна поддръжка' : 'Priority support',
        language === 'bg' ? 'Ексклузивни оферти' : 'Exclusive offers'
      ],
      tooltips: [
        language === 'bg' ? 'Пробвайте всички премиум функции за 24 часа' : 'Try all premium features for 24 hours',
        language === 'bg' ? 'Най-високи отстъпки във всички партньори' : 'Highest discounts at all partners',
        language === 'bg' ? 'Отстъпките варират според партньора' : 'Discounts vary by partner',
        language === 'bg' ? 'Получете помощ в рамките на 1 час' : 'Get help within 1 hour',
        language === 'bg' ? 'Достъп до лимитирани VIP промоции' : 'Access to limited VIP promotions'
      ]
    }
  ];

  // Reviews are now fetched from API via usePartnerReviews hook above

  return (
    <div style={{ marginTop: '-65px' }}>
      {/* Hero Section with Blast Video */}
      <HeroBlast language={language} />

      {/* Product Details - How It Works Section */}
      <section className="section">
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
        </div>
      </section>

      {/* Subscription Plans Section */}
      <section className="section" style={{ background: 'var(--color-background-secondary)' }}>
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
            <BodyText className="text-lg max-w-2xl mx-auto mt-3" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
              {language === 'bg'
                ? '24 часа безплатен Премиум пробен период за всички планове'
                : '24h free Premium Trial for all Plans'}
            </BodyText>
          </div>

          {/* Billing Period Toggle */}
          <BillingToggleContainer>
            <BillingToggle>
              <Tooltip
                content={language === 'bg'
                  ? 'Плащай годишно и спести 20% от общата цена'
                  : 'Pay yearly and save 20% on total price'}
                position="top"
              >
                <ToggleOption
                  $active={billingPeriod === 'yearly'}
                  onClick={() => setBillingPeriod('yearly')}
                >
                  {language === 'bg' ? 'Годишен абонамент (20% отстъпка)' : 'Yearly (20% off)'}
                </ToggleOption>
              </Tooltip>
              <Tooltip
                content={language === 'bg'
                  ? 'Плащай всеки месец за по-голяма гъвкавост'
                  : 'Pay monthly for more flexibility'}
                position="top"
              >
                <ToggleOption
                  $active={billingPeriod === 'monthly'}
                  onClick={() => setBillingPeriod('monthly')}
                >
                  {language === 'bg' ? 'Месечен абонамент' : 'Monthly'}
                </ToggleOption>
              </Tooltip>
            </BillingToggle>
            {billingPeriod === 'yearly' && (
              <Tooltip
                content={language === 'bg'
                  ? 'Спестявате 2 месеца при годишен абонамент'
                  : 'You save 2 months with yearly subscription'}
                position="bottom"
              >
                <SaveBadge>
                  {language === 'bg' ? 'Спести 20%' : 'Save 20%'}
                </SaveBadge>
              </Tooltip>
            )}
          </BillingToggleContainer>

          <SubscriptionCardsContainer>
            {subscriptionPlans.map((plan, index) => {
              const planType = (plan as any).type || (plan.featured ? 'premium' : 'basic');
              const displayPrice = billingPeriod === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
              const priceLabel = billingPeriod === 'yearly'
                ? (language === 'bg' ? ' лв/година' : ' BGN/year')
                : ((plan as any).duration || (language === 'bg' ? ' лв/мес' : ' BGN/mo'));
              return (
              <PlanCardWrapper
                key={index}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.2 }}
              >
                {/* Most Popular Badge - positioned relative to wrapper */}
                {plan.featured && (
                  <Tooltip
                    content={language === 'bg'
                      ? 'Избран от 70% от нашите клиенти'
                      : 'Chosen by 70% of our customers'}
                    position="top"
                  >
                    <PopularBadge>
                      {language === 'bg' ? 'Най-популярен' : 'Most Popular'}
                    </PopularBadge>
                  </Tooltip>
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
                      {displayPrice}
                      <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                        {priceLabel}
                      </span>
                    </CardPriceDisplay>
                  </CardBottomRow>
                </CreditCardPlan>

                {/* Plan Details Below Card */}
                <PlanDetails>
                  <FeaturesList>
                    {plan.features.map((feature, i) => (
                      <Tooltip
                        key={i}
                        content={(plan as any).tooltips?.[i] || ''}
                        position="right"
                      >
                        <FeatureItem>
                          {feature}
                        </FeatureItem>
                      </Tooltip>
                    ))}
                  </FeaturesList>

                  <PlanButtonContainer>
                    <Tooltip
                      content={language === 'bg'
                        ? 'Преминете към плащане и активирайте плана си'
                        : 'Proceed to payment and activate your plan'}
                      position="bottom"
                    >
                      <Link to="/subscriptions" style={{ width: '100%' }}>
                        <Button
                          variant={plan.featured ? 'primary' : 'secondary'}
                          size="large"
                        >
                          {language === 'bg' ? 'Избери План' : 'Choose Plan'}
                        </Button>
                      </Link>
                    </Tooltip>
                  </PlanButtonContainer>
                </PlanDetails>
              </PlanCardWrapper>
              );
            })}
          </SubscriptionCardsContainer>
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
            <BodyText className="text-xl max-w-2xl mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
              {language === 'bg'
                ? 'Хиляди доволни клиенти спестяват с BOOM Card всеки ден'
                : 'Thousands of happy customers saving with BOOM Card every day'}
            </BodyText>
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
              {/* Placeholder testimonials carousel */}
              <Carousel
                autoPlay={true}
                interval={5000}
                itemsToShow={{ mobile: 1, tablet: 2, desktop: 3 }}
              >
                {[
                  {
                    author: language === 'bg' ? 'Мария С.' : 'Maria S.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Страхотна карта! Спестих над 500 лв само за първия месец.'
                      : 'Amazing card! I saved over BGN 500 in just the first month.'
                  },
                  {
                    author: language === 'bg' ? 'Иван П.' : 'Ivan P.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Много изживявания на страхотни цени. Препоръчвам!'
                      : 'So many experiences at great prices. Highly recommend!'
                  },
                  {
                    author: language === 'bg' ? 'Елена Д.' : 'Elena D.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Най-добрата инвестиция в моя начин на живот.'
                      : 'The best investment in my lifestyle.'
                  },
                  {
                    author: language === 'bg' ? 'Георги М.' : 'Georgi M.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Използвам BOOM Card от 6 месеца и съм много доволен. Отстъпките са реални!'
                      : 'Using BOOM Card for 6 months and very satisfied. The discounts are real!'
                  },
                  {
                    author: language === 'bg' ? 'Петя К.' : 'Petya K.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Страхотно приложение! Намерих много добри оферти за ресторанти в София.'
                      : 'Great app! Found many good restaurant offers in Sofia.'
                  },
                  {
                    author: language === 'bg' ? 'Николай Т.' : 'Nikolay T.',
                    rating: 4,
                    comment: language === 'bg'
                      ? 'Много полезна карта за ежедневни покупки. Препоръчвам Premium плана.'
                      : 'Very useful card for daily shopping. I recommend the Premium plan.'
                  },
                  {
                    author: language === 'bg' ? 'Силвия В.' : 'Silvia V.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Открих много нови места благодарение на офертите. Отлична идея!'
                      : 'Discovered many new places thanks to the offers. Excellent idea!'
                  },
                  {
                    author: language === 'bg' ? 'Димитър А.' : 'Dimitar A.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Като собственик на бизнес имам и личен профил. Спестяванията са значителни.'
                      : 'As a business owner, I also have a personal profile. The savings are significant.'
                  },
                  {
                    author: language === 'bg' ? 'Веселина Р.' : 'Veselina R.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Перфектно за уикенд излети! Винаги намирам добри оферти за хотели и СПА.'
                      : 'Perfect for weekend trips! Always find good hotel and SPA offers.'
                  },
                  {
                    author: language === 'bg' ? 'Стоян Ж.' : 'Stoyan Zh.',
                    rating: 4,
                    comment: language === 'bg'
                      ? 'Добро съотношение цена-качество. Годишният абонамент определено си заслужава.'
                      : 'Good value for money. The yearly subscription is definitely worth it.'
                  },
                  {
                    author: language === 'bg' ? 'Красимира Н.' : 'Krasimira N.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Невероятни отстъпки за фитнес и здраве. Спестих си абонамента още в първия месец!'
                      : 'Incredible discounts for fitness and wellness. I saved my subscription cost in the first month!'
                  },
                  {
                    author: language === 'bg' ? 'Борис С.' : 'Boris S.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Семейството ми обожава BOOM Card! Ходим на театър и кино с чудесни отстъпки.'
                      : 'My family loves BOOM Card! We go to theater and cinema with wonderful discounts.'
                  },
                  {
                    author: language === 'bg' ? 'Анна Й.' : 'Anna Y.',
                    rating: 4,
                    comment: language === 'bg'
                      ? 'Чудесно разнообразие от партньори. Винаги откривам нещо ново за изпробване.'
                      : 'Great variety of partners. I always discover something new to try.'
                  },
                  {
                    author: language === 'bg' ? 'Пламен Г.' : 'Plamen G.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Като гурме любител, офертите за ресторанти са фантастични. Пробвах места, за които само бях чувал!'
                      : 'As a foodie, the restaurant offers are fantastic. I tried places I had only heard about!'
                  },
                  {
                    author: language === 'bg' ? 'Даниела М.' : 'Daniela M.',
                    rating: 5,
                    comment: language === 'bg'
                      ? 'Използвам картата всеки ден. От кафе сутрин до вечеря вечер - навсякъде има отстъпки!'
                      : 'I use the card every day. From morning coffee to evening dinner - discounts everywhere!'
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