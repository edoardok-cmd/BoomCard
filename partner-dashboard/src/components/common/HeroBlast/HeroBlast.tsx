import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import Button from '../Button/Button';

interface HeroBlastProps {
  language?: 'en' | 'bg';
}

const HeroContainer = styled.div`
  position: relative;
  width: 100%;
  height: 100vh;
  min-height: 600px;
  max-height: 900px;
  background: var(--color-primary);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;

  @media (max-width: 1380px) {
    min-height: 800px;
    max-height: none;
    overflow: visible;
  }

  @media (max-width: 768px) {
    overflow: visible;
    min-height: 900px;
    padding-top: 80px; /* Account for fixed header on mobile */
    justify-content: flex-start;
  }

  /* Side card positioning */
  .side-card {
    position: fixed;
    top: 50%;
    transform: translateY(-50%);
    z-index: 5;
  }

  .side-card-left {
    left: 2%;
  }

  .side-card-right {
    right: 2%;
  }

  /* Move cards below CTA on smaller screens */
  @media (max-width: 1380px) {
    .cards-wrapper {
      position: relative !important;
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
      gap: 0 !important;
      flex-wrap: nowrap !important;
      margin-top: 2rem;
    }

    .side-card {
      position: relative;
      top: auto;
      left: auto;
      right: auto;
      transform: none;
      margin: 0;
      display: inline-block;
    }

    .side-card-left {
      left: auto;
      right: auto;
      z-index: 1;
    }

    .side-card-right {
      left: auto;
      right: auto;
      z-index: 2;
      margin-left: -150px; /* Overlap the black card more on mobile */
    }
  }
`;

const VideoBackground = styled.video`
  position: absolute;
  top: 50%;
  left: 50%;
  min-width: 100%;
  min-height: 100%;
  width: auto;
  height: auto;
  transform: translate(-50%, -50%);
  object-fit: cover;
  z-index: 1;
  will-change: transform;

  /* Optimize video decoding for better performance */
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const VideoOverlay = styled.div<{ $fadeOut: boolean }>`
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.15) 100%);
  z-index: 2;
  opacity: ${props => props.$fadeOut ? 0 : 1};
  transition: opacity 1s ease-out;
`;

const ContentContainer = styled.div`
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;

  /* 4K support - larger container */
  @media (min-width: 2560px) {
    max-width: 1800px;
    padding: 3rem;
  }

  @media (max-width: 768px) {
    padding: 1rem;
    padding-top: 2rem;
    overflow: visible;
  }
`;

const CardContainer = styled(motion.div)`
  perspective: 1000px;
  margin-bottom: 2rem;
  transition: transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 15rem;

  @media (max-width: 768px) {
    gap: 0;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-width: 90vw;
    margin: 0 auto 2rem;
  }

`;

const SideCardsContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rem;
  position: relative;
`;

const SideCardWrapper = styled(motion.div)<{ $position?: 'left' | 'right' }>`
  position: relative;
  perspective: 1000px;

  @media (max-width: 768px) {
    display: none;
  }
`;

const PhotosContainer = styled(motion.div)`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: -1;

  @media (max-width: 1024px) {
    display: none;
  }
`;

const Photo = styled(motion.div)<{ $index: number; $side: 'left' | 'right' }>`
  position: absolute;
  width: 150px;
  height: 200px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  border: 3px solid white;
  overflow: hidden;
  will-change: transform, opacity;

  /* Center as starting point - positions controlled by Framer Motion */
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  @media (max-width: 768px) {
    width: 100px;
    height: 133px;
  }

  /* Disable animations for reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    will-change: auto;
  }
`;

const SideCardPhotosContainer = styled(motion.div)`
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  width: 300px;
  height: 350px;
  pointer-events: none;
  margin-top: 2rem;

  @media (max-width: 768px) {
    display: none;
  }
`;

const SidePhoto = styled(motion.div)`
  position: absolute;
  width: 80px;
  height: 110px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 6px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  border: 2px solid white;
  overflow: hidden;
  left: 50%;
  top: 0;
  transform: translateX(-50%);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const QRCodeContainer = styled.div`
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: white;
  padding: 0.5rem;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);

  @media (max-width: 768px) {
    top: 0.7rem;
    right: 0.7rem;
    padding: 0.35rem;
    border-radius: 6px;
  }

  img {
    width: 80px;
    height: 80px;
    display: block;

    @media (max-width: 768px) {
      width: 58px;
      height: 58px;
    }
  }

  span {
    font-size: 0.75rem;
    font-weight: 700;
    color: #000;
    background: #000;
    color: #fff;
    padding: 0.25rem 0.75rem;
    border-radius: 4px;

    @media (max-width: 768px) {
      font-size: 0.6rem;
      padding: 0.2rem 0.5rem;
    }
  }
`;

const BoomCard = styled(motion.div)<{ $showAnimation?: boolean; $stopAnimation?: boolean }>`
  width: 360px;
  height: 225px;
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%);
  border-radius: 20px;
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.8),
    0 0 40px rgba(255, 215, 0, 0.3),
    inset 0 2px 4px rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 1.8rem;
  position: relative;
  overflow: visible;
  border: 2px solid rgba(255, 215, 0, 0.3);
  transform-style: preserve-3d;
  perspective: 1000px;
  will-change: transform;

  /* Card rotation animation: 3 tilts + 5s rest = 8s cycle, repeats forever */
  animation: ${props => props.$stopAnimation ? 'none' : props.$showAnimation ? 'cardFlip 16s ease-in-out infinite' : 'none'};

  /* Disable animations for reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    animation: none;
    will-change: auto;
  }

  @keyframes cardFlip {
    /* Phase 1: 3 tilts during photo dealing (0-3s) */
    0% {
      transform: rotateY(0deg);
    }
    3.125% { /* 0.5s */
      transform: rotateY(15deg);
    }
    6.25% { /* 1s */
      transform: rotateY(-15deg);
    }
    9.375% { /* 1.5s */
      transform: rotateY(15deg);
    }
    12.5% { /* 2s */
      transform: rotateY(-15deg);
    }
    15.625% { /* 2.5s */
      transform: rotateY(15deg);
    }
    18.75% { /* 3s */
      transform: rotateY(0deg);
    }
    /* Rest for 5 seconds (3-8s) */
    50% { /* 8s */
      transform: rotateY(0deg);
    }
    /* Phase 2: 3 tilts during photo returning (8-11s) */
    53.125% { /* 8.5s */
      transform: rotateY(15deg);
    }
    56.25% { /* 9s */
      transform: rotateY(-15deg);
    }
    59.375% { /* 9.5s */
      transform: rotateY(15deg);
    }
    62.5% { /* 10s */
      transform: rotateY(-15deg);
    }
    65.625% { /* 10.5s */
      transform: rotateY(15deg);
    }
    68.75% { /* 11s */
      transform: rotateY(0deg);
    }
    /* Rest for 5 seconds (11-16s) */
    100% {
      transform: rotateY(0deg);
    }
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.3),
      transparent
    );
    transition: left 0.5s;
  }

  &:hover::before {
    left: 100%;
  }

  @media (max-width: 768px) {
    width: min(289px, 90vw);
    height: 179px;
    padding: 1.3rem;
  }

  @media (max-width: 480px) {
    width: min(255px, 85vw);
    height: 162px;
    padding: 1.1rem;
  }

  @media (max-width: 375px) {
    width: 85vw;
    height: auto;
    min-height: 136px;
    padding: 0.9rem;
  }
`;

const SilverCard = styled(motion.div)<{ $showAnimation?: boolean; $stopAnimation?: boolean }>`
  width: 360px;
  height: 225px;
  background: linear-gradient(135deg, #71717a 0%, #a1a1aa 50%, #71717a 100%);
  border-radius: 20px;
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.8),
    0 0 40px rgba(229, 231, 235, 0.5),
    inset 0 2px 4px rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 1.8rem;
  position: relative;
  overflow: visible;
  border: 2px solid rgba(229, 231, 235, 0.5);
  transform-style: preserve-3d;
  perspective: 1000px;
  will-change: transform;

  /* Tilting animation for silver card */
  animation: ${props => props.$stopAnimation ? 'none' : props.$showAnimation ? 'silverCardTilt 4s ease-in-out infinite' : 'none'};

  /* Disable animations for reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    animation: none;
    will-change: auto;
  }

  @keyframes silverCardTilt {
    0%, 100% {
      transform: rotateY(0deg);
    }
    16.67% {
      transform: rotateY(25deg);
    }
    33.33% {
      transform: rotateY(-25deg);
    }
    50% {
      transform: rotateY(25deg);
    }
    66.67% {
      transform: rotateY(-25deg);
    }
    83.33% {
      transform: rotateY(25deg);
    }
  }

  @media (max-width: 768px) {
    width: min(289px, 90vw);
    height: 179px;
    padding: 1.3rem;
  }

  @media (max-width: 480px) {
    width: min(255px, 85vw);
    height: 162px;
    padding: 1.1rem;
  }

  @media (max-width: 375px) {
    width: 85vw;
    height: auto;
    min-height: 136px;
    padding: 0.9rem;
  }
`;

const LogoExplode = styled(motion.img)<{ $showAnimation?: boolean; $stopAnimation?: boolean }>`
  width: 518px;
  height: auto;
  max-height: 324px;
  object-fit: contain;
  filter: drop-shadow(0 25px 50px rgba(0, 0, 0, 0.8));
  transform-style: preserve-3d;
  perspective: 1000px;
  will-change: transform;

  /* Tilting animation for logo - same as black card */
  animation: ${props => props.$stopAnimation ? 'none' : props.$showAnimation ? 'logoTilt 16s ease-in-out infinite' : 'none'};

  /* Disable animations for reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    animation: none;
    will-change: auto;
  }

  @keyframes logoTilt {
    /* Phase 1: 3 tilts during photo dealing (0-3s) */
    0% {
      transform: rotateY(0deg);
    }
    3.125% {
      transform: rotateY(15deg);
    }
    6.25% {
      transform: rotateY(-15deg);
    }
    9.375% {
      transform: rotateY(15deg);
    }
    12.5% {
      transform: rotateY(-15deg);
    }
    15.625% {
      transform: rotateY(15deg);
    }
    18.75% {
      transform: rotateY(0deg);
    }
    /* Rest for 5 seconds (3-8s) */
    50% {
      transform: rotateY(0deg);
    }
    /* Phase 2: 3 tilts during photo returning (8-11s) */
    53.125% {
      transform: rotateY(15deg);
    }
    56.25% {
      transform: rotateY(-15deg);
    }
    59.375% {
      transform: rotateY(15deg);
    }
    62.5% {
      transform: rotateY(-15deg);
    }
    65.625% {
      transform: rotateY(15deg);
    }
    68.75% {
      transform: rotateY(0deg);
    }
    /* Rest for 5 seconds (11-16s) */
    100% {
      transform: rotateY(0deg);
    }
  }

  /* 4K resolution - prevent logo from going too high */
  @media (min-width: 2560px) {
    width: 620px;
    max-height: 388px;
  }

  @media (max-width: 768px) {
    width: min(490px, 90vw);
    max-height: 302px;
  }

  @media (max-width: 480px) {
    width: min(432px, 85vw);
    max-height: 274px;
  }

  @media (max-width: 375px) {
    width: 90vw;
    max-height: 230px;
  }
`;

const SilverCardLogo = styled.div`
  font-size: 2.5rem;
  font-weight: 900;
  background: linear-gradient(135deg, #e5e7eb 0%, #f9fafb 50%, #e5e7eb 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -1px;
  text-shadow: 0 2px 10px rgba(229, 231, 235, 0.5);
  margin-bottom: 1rem;

  @media (max-width: 768px) {
    font-size: 1.7rem;
    margin-bottom: 0.7rem;
  }
`;


const CardLogo = styled.div`
  font-size: 2.5rem;
  font-weight: 900;
  background: linear-gradient(135deg, #ffd700 0%, #ffed4e 50%, #ffd700 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -1px;
  text-shadow: 0 2px 10px rgba(255, 215, 0, 0.5);
  margin-bottom: 1rem;

  @media (max-width: 768px) {
    font-size: 1.7rem;
    margin-bottom: 0.7rem;
  }
`;

const CardNumber = styled.div`
  font-size: 1.5rem;
  color: #fff;
  letter-spacing: 4px;
  font-family: 'Courier New', monospace;
  font-weight: 600;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);

  @media (max-width: 768px) {
    font-size: 1.06rem;
    letter-spacing: 2.5px;
  }

  @media (max-width: 480px) {
    font-size: 0.95rem;
    letter-spacing: 2px;
  }
`;

const CardInfo = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
`;

const CardHolder = styled.div`
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 1px;

  @media (max-width: 768px) {
    font-size: 0.76rem;
  }

  @media (max-width: 480px) {
    font-size: 0.65rem;
  }
`;

const CardExpiry = styled.div`
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  font-family: 'Courier New', monospace;

  @media (max-width: 768px) {
    font-size: 0.72rem;
  }

  @media (max-width: 480px) {
    font-size: 0.6rem;
  }
`;

const CTAContainer = styled(motion.div)`
  text-align: center;
  color: var(--color-secondary);
`;

const CTATitle = styled(motion.h1)`
  font-size: 4rem;
  font-weight: 700;
  margin-bottom: 1rem;
  line-height: 1.2;
  letter-spacing: -0.02em;
  white-space: pre-line;

  /* Mellow fire gradient with yellow base and orange accent */
  background: linear-gradient(
    90deg,
    #ffd700 0%,
    #ffd700 30%,
    #ffed4e 50%,
    #ffd700 70%,
    #ff8800 85%,
    #ffd700 100%
  );
  background-size: 300% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: mellowFireFlow 8s ease-in-out infinite;

  /* Inner shadow for depth only */
  text-shadow: 0 4px 20px rgba(0, 0, 0, 0.8);

  /* Smaller font for Bulgarian text with line breaks */
  [lang="bg"] & {
    font-size: 3.2rem;
  }

  @keyframes mellowFireFlow {
    0% {
      background-position: 0% center;
    }
    50% {
      background-position: 100% center;
    }
    100% {
      background-position: 0% center;
    }
  }

  @media (max-width: 768px) {
    font-size: 2.75rem;

    [lang="bg"] & {
      font-size: 2.2rem;
    }
  }

  @media (max-width: 480px) {
    font-size: 2rem;

    [lang="bg"] & {
      font-size: 1.6rem;
    }
  }

  @media (max-width: 375px) {
    font-size: 1.75rem;

    [lang="bg"] & {
      font-size: 1.4rem;
    }
  }

  @media (max-width: 320px) {
    font-size: 1.5rem;

    [lang="bg"] & {
      font-size: 1.2rem;
    }
  }
`;

const CTASubtitle = styled(motion.p)`
  font-size: 1.5rem;
  margin-bottom: 2rem;
  color: #ffffff;
  opacity: 0.95;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
  padding: 0 1rem;

  @media (max-width: 768px) {
    font-size: 1.25rem;
    margin-bottom: 1.5rem;
  }

  @media (max-width: 480px) {
    font-size: 1rem;
    margin-bottom: 1rem;
  }

  @media (max-width: 375px) {
    font-size: 0.95rem;
  }

  @media (max-width: 320px) {
    font-size: 0.875rem;
  }
`;

const ButtonContainer = styled(motion.div)`
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
  padding: 0 1rem;
  max-width: 100%;
  width: 100%;

  a {
    text-decoration: none;
    max-width: 100%;
  }

  button {
    max-width: 100%;
    white-space: normal;
    word-wrap: break-word;
  }

  /* Enhanced button contrast for vibrant color mode */
  [data-theme="color"] & {
    button {
      font-size: 1.125rem;
      font-weight: 700;
      padding: 16px 40px;
      min-width: 200px;
      box-shadow:
        0 8px 35px -5px rgba(0, 0, 0, 0.5),
        0 10px 40px -5px rgba(255, 69, 0, 0.6);
    }

    /* Primary button - ultra bold gradient */
    button:first-child {
      background: linear-gradient(135deg, #ff0066 0%, #ff4500 50%, #ff8800 100%) !important;
      color: #ffffff !important;
      border: 3px solid rgba(255, 255, 255, 0.3);
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
      animation: heroPrimaryPulse 2s ease-in-out infinite;

      &:hover {
        box-shadow:
          0 12px 50px -5px rgba(0, 0, 0, 0.6),
          0 14px 55px -5px rgba(255, 69, 0, 0.8),
          0 8px 40px -5px rgba(255, 0, 102, 0.7) !important;
        transform: translateY(-3px) scale(1.05) !important;
      }
    }

    /* Secondary button - strong outline */
    a:nth-child(2) button {
      background: rgba(255, 255, 255, 0.95) !important;
      color: #1a0a2e !important;
      border: 3px solid #ff006e !important;
      text-shadow: none !important;
      box-shadow:
        0 8px 35px -5px rgba(255, 0, 110, 0.5),
        0 10px 40px -5px rgba(0, 0, 0, 0.3);

      &:hover {
        background: linear-gradient(135deg, #ffe4f1 0%, #fff5e1 100%) !important;
        border-color: #ff4500 !important;
        box-shadow:
          0 12px 50px -5px rgba(255, 0, 110, 0.7),
          0 14px 55px -5px rgba(255, 69, 0, 0.5),
          0 8px 40px -5px rgba(0, 0, 0, 0.4) !important;
        transform: translateY(-3px) scale(1.05) !important;
      }
    }
  }

  @keyframes heroPrimaryPulse {
    0%, 100% {
      box-shadow:
        0 8px 35px -5px rgba(0, 0, 0, 0.5),
        0 10px 40px -5px rgba(255, 69, 0, 0.6);
    }
    50% {
      box-shadow:
        0 8px 35px -5px rgba(0, 0, 0, 0.5),
        0 12px 45px -5px rgba(255, 69, 0, 0.8),
        0 8px 35px -5px rgba(255, 0, 102, 0.6);
    }
  }

  @media (max-width: 480px) {
    flex-direction: column;
    align-items: stretch;
    max-width: min(300px, 90vw);
    margin: 0 auto;
    gap: 0.75rem;
    padding: 0 0.5rem;
  }

  @media (max-width: 375px) {
    max-width: 85vw;
    padding: 0 0.25rem;
  }
`;

const HeroBlast: React.FC<HeroBlastProps> = ({ language = 'en' }) => {
  const [videoEnded, setVideoEnded] = useState(false);
  const [showLogo, setShowLogo] = useState(false);
  const [showBlackCard, setShowBlackCard] = useState(false);
  const [showSilverCard, setShowSilverCard] = useState(false);
  const [showCTA, setShowCTA] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [photoState, setPhotoState] = useState<'hidden' | 'dealing' | 'returning' | 'finished'>('hidden');
  const [showSideCards, setShowSideCards] = useState(false);
  const [animationsFinished, setAnimationsFinished] = useState(false);
  const [hideCardsOnScroll, setHideCardsOnScroll] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  // Photo placeholders - 8 per side for fuller spread
  const photos = {
    left: [
      'https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=300&h=400&fit=crop', // Spa massage
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300&h=400&fit=crop', // Beach paradise
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=300&h=400&fit=crop', // Luxury hotel
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=300&h=400&fit=crop', // Fashion shopping
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=300&h=400&fit=crop', // Coffee shop
      'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=300&h=400&fit=crop', // Makeup beauty
      'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=300&h=400&fit=crop', // Movie theater
      'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=300&h=400&fit=crop', // Gym fitness
    ],
    right: [
      'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=300&h=400&fit=crop', // Travel suitcase
      'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=300&h=400&fit=crop', // Coffee art
      'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=300&h=400&fit=crop', // Retail store
      'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=300&h=400&fit=crop', // Food plate
      'https://images.unsplash.com/photo-1464746133101-a2c3f88e0dd9?w=300&h=400&fit=crop', // Happy person
      'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=300&h=400&fit=crop', // Mountain hiking
      'https://images.unsplash.com/photo-1445205170230-053b83016050?w=300&h=400&fit=crop', // Clothing fashion
      'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=300&h=400&fit=crop', // Cake dessert
    ],
  };


  // Random tilts for each photo - 8 per side now
  const photoTilts = [
    [-8, 5, -12, 7, -6, 9, -10, 6],  // Left side tilts
    [6, -9, 11, -5, 8, -10, 7, -8],  // Right side tilts
  ];

  // Symmetrical positions for photos - further from center, closer to sides, lower in hero
  // Photos should stay in the side margins, NOT over the center content
  const photoPositions = {
    left: [
      { x: -750, y: -100 },   // Top left, far out
      { x: -680, y: 0 },      // Upper-middle left
      { x: -800, y: 80 },     // Middle left, very far
      { x: -720, y: 160 },    // Lower-middle left
      { x: -780, y: 240 },    // Lower left, far out
      { x: -700, y: 320 },    // Bottom left
      { x: -760, y: -50 },    // Upper left, far
      { x: -690, y: 280 },    // Bottom-middle left
    ],
    right: [
      { x: 590, y: -100 },    // Top right, far out
      { x: 520, y: 0 },       // Upper-middle right
      { x: 640, y: 80 },      // Middle right, very far
      { x: 560, y: 160 },     // Lower-middle right
      { x: 620, y: 240 },     // Lower right, far out
      { x: 540, y: 320 },     // Bottom right
      { x: 600, y: -50 },     // Upper right, far
      { x: 530, y: 280 },     // Bottom-middle right
    ],
  };

  // Photo cycling effect - simplified to one cycle only
  useEffect(() => {
    if (photoState === 'hidden' || photoState === 'finished') return;

    // Animation cycle:
    // Cycle 1: 0-3s dealing, 3-8s rest (8s total)
    // Cycle 2: 8-11s returning, 11-16s rest (8s total)
    // Then show side cards and stop

    let timeout: NodeJS.Timeout | undefined;

    if (photoState === 'dealing') {
      const isMobile = window.innerWidth <= 768;
      timeout = setTimeout(() => setPhotoState('returning'), isMobile ? 2000 : 8000);
    } else if (photoState === 'returning') {
      // Show both cards immediately when returning starts
      setShowBlackCard(true);
      setShowSilverCard(true);
      setShowSideCards(true);

      timeout = setTimeout(() => {
        setPhotoState('finished');
        setAnimationsFinished(true);
      }, 8000);
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [photoState]);

  // Mobile now follows same timing as desktop - removed immediate show logic

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedData = () => {
      setVideoLoaded(true);
    };

    const handleTimeUpdate = () => {
      // Show logo at 60% of video duration (during the peak of the blast)
      if (video.currentTime >= video.duration * 0.6 && !showLogo) {
        setShowLogo(true);
      }
    };

    const handleEnded = () => {
      // Only trigger once
      if (!videoEnded) {
        setVideoEnded(true);
        setShowCTA(true);
        // Start photo cycling from the logo after video ends
        setTimeout(() => setPhotoState('dealing'), 800);
        // Prevent video from replaying
        video.pause();
        video.currentTime = video.duration;
      }
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [showLogo, videoEnded, showCTA]);

  // Hide side cards when scrolling below hero section (desktop only)
  useEffect(() => {
    const handleScroll = () => {
      const isMobile = window.innerWidth <= 1380;
      if (isMobile) {
        setHideCardsOnScroll(false);
        return;
      }

      const heroElement = heroRef.current;
      if (!heroElement) return;

      const heroBottom = heroElement.getBoundingClientRect().bottom;
      const viewportHeight = window.innerHeight;
      // Hide cards when hero bottom is in the top 70% of viewport (when scrolling down into "How it works")
      const shouldHideCards = heroBottom < viewportHeight * 0.7;

      setHideCardsOnScroll(shouldHideCards);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const content = {
    en: {
      title: 'Live More - Pay Less',
      subtitle: 'Unlock exclusive discounts at Bulgaria\'s finest venues',
      ctaButton: 'Learn More and Get your Card',
      cardHolder: 'CARD HOLDER',
    },
    bg: {
      title: 'Живейте повече\nПлащайте по-малко',
      subtitle: 'Отключете ексклузивни отстъпки в най-добрите заведения в България',
      ctaButton: 'Научете повече и вземете картата си',
      cardHolder: 'ПРИТЕЖАТЕЛ',
    },
  };

  const t = content[language];

  return (
    <HeroContainer ref={heroRef}>
      <VideoBackground
        ref={videoRef}
        autoPlay
        muted
        playsInline
        preload="auto"
        poster="/boom-blast-poster.jpg"
        webkit-playsinline="true"
        x5-playsinline="true"
      >
        <source src="/boom-blast.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </VideoBackground>

      <VideoOverlay $fadeOut={videoEnded} />

      <ContentContainer>
        {/* Logo - centered at top */}
        <AnimatePresence>
          {showLogo && (
            <motion.div
              initial={{ scale: 0, opacity: 0, rotateX: 90, z: -1000 }}
              animate={{
                scale: 1,
                opacity: 1,
                rotateX: 0,
                z: 0,
                // Keep logo centered on mobile (no upward movement), reduce movement on 4K
                y: showCTA && window.innerWidth > 768 ? (window.innerWidth >= 2560 ? -50 : -100) : 0,
              }}
              transition={{
                // Smoother animation with easing
                type: 'tween',
                ease: [0.4, 0, 0.2, 1], // Cubic bezier for smooth easing
                duration: 1.2,
              }}
              style={{ position: 'relative', marginBottom: '2rem' }}
            >
              <LogoExplode
                src="/logo-explode.png"
                alt="Boom Logo Explode"
                $showAnimation={showCTA && !showSideCards}
                $stopAnimation={showSideCards}
              />

              {/* Ejected Photos - cycle between dealing and returning from the logo */}
              {photoState !== 'hidden' && photoState !== 'finished' && (
                <PhotosContainer>
                  {/* Left side photos */}
                  {photos.left.map((photoUrl, index) => (
                    <Photo
                      key={`left-${index}`}
                      $index={index}
                      $side="left"
                      animate={
                        photoState === 'dealing'
                          ? {
                              x: photoPositions.left[index].x,
                              y: photoPositions.left[index].y,
                              opacity: 1,
                              scale: 1,
                              rotate: photoTilts[0][index],
                            }
                          : {
                              x: 0,
                              y: 0,
                              opacity: 0,
                              scale: 0,
                              rotate: 0,
                            }
                      }
                      transition={{
                        delay: index * 0.15,
                        type: 'spring',
                        stiffness: 100,
                        damping: 18,
                        duration: 0.6,
                      }}
                    >
                      <img src={photoUrl} alt={`Experience ${index + 1}`} />
                    </Photo>
                  ))}

                  {/* Right side photos */}
                  {photos.right.map((photoUrl, index) => (
                    <Photo
                      key={`right-${index}`}
                      $index={index}
                      $side="right"
                      animate={
                        photoState === 'dealing'
                          ? {
                              x: photoPositions.right[index].x,
                              y: photoPositions.right[index].y,
                              opacity: 1,
                              scale: 1,
                              rotate: photoTilts[1][index],
                            }
                          : {
                              x: 0,
                              y: 0,
                              opacity: 0,
                              scale: 0,
                              rotate: 0,
                            }
                      }
                      transition={{
                        delay: index * 0.15,
                        type: 'spring',
                        stiffness: 100,
                        damping: 18,
                        duration: 0.6,
                      }}
                    >
                      <img src={photoUrl} alt={`Experience ${index + 9}`} />
                    </Photo>
                  ))}
                </PhotosContainer>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Container for CTA and Side Cards */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }} className="cta-cards-container">
          <AnimatePresence>
            {showCTA && (
              <CTAContainer
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 2.5,
                  duration: 0.8,
                  ease: [0.4, 0, 0.2, 1] // Smooth cubic bezier easing
                }}
                lang={language}
              >
                <CTATitle
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 2.7,
                    duration: 0.8, // Slightly longer duration for smoothness
                    ease: [0.4, 0, 0.2, 1]
                  }}
                >
                  {t.title}
                </CTATitle>

                <CTASubtitle
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 2.9,
                    duration: 0.8,
                    ease: [0.4, 0, 0.2, 1]
                  }}
                >
                  {t.subtitle}
                </CTASubtitle>

                <ButtonContainer
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 3.1,
                    duration: 0.8,
                    ease: [0.4, 0, 0.2, 1]
                  }}
                >
                  <Link to="/subscriptions">
                    <Button variant="primary" size="large">
                      {t.ctaButton}
                    </Button>
                  </Link>
                </ButtonContainer>
              </CTAContainer>
            )}
          </AnimatePresence>

          {/* Cards container for responsive layout */}
          <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', flexWrap: 'wrap' }} className="cards-wrapper">
            {/* Black Card - slides in from left, positioned on far left side */}
            <AnimatePresence>
              {showBlackCard && !hideCardsOnScroll && (
                <motion.div
                  initial={{ opacity: 0, x: -500 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -500 }}
                  transition={{ duration: 1, type: 'spring', stiffness: 80, damping: 20 }}
                  className="side-card side-card-left"
                >
                  <BoomCard $showAnimation={false} $stopAnimation={animationsFinished}>
                    <QRCodeContainer>
                      <img src="/qr-code.svg" alt="Scan QR Code" />
                      <span>SCAN ME</span>
                    </QRCodeContainer>
                    <div>
                      <CardLogo>BOOM</CardLogo>
                      <CardNumber>2025</CardNumber>
                    </div>
                    <CardInfo>
                      <div>
                        <CardHolder>{t.cardHolder}</CardHolder>
                        <CardExpiry>12/25</CardExpiry>
                      </div>
                    </CardInfo>
                  </BoomCard>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Silver Card - slides in from right, positioned on far right side */}
            <AnimatePresence>
              {showSilverCard && !hideCardsOnScroll && (
                <motion.div
                  initial={{ opacity: 0, x: 500 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 500 }}
                  transition={{ duration: 1, type: 'spring', stiffness: 80, damping: 20 }}
                  className="side-card side-card-right"
                >
                  <SilverCard
                    $showAnimation={false}
                    $stopAnimation={animationsFinished}
                  >
                    <QRCodeContainer>
                      <img src="/qr-code.svg" alt="Scan QR Code" />
                      <span>SCAN ME</span>
                    </QRCodeContainer>
                    <div>
                      <SilverCardLogo>BOOM</SilverCardLogo>
                      <CardNumber>2025</CardNumber>
                    </div>
                    <CardInfo>
                      <div>
                        <CardHolder>{t.cardHolder}</CardHolder>
                        <CardExpiry>12/25</CardExpiry>
                      </div>
                    </CardInfo>
                  </SilverCard>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </ContentContainer>
    </HeroContainer>
  );
};

export default HeroBlast;
