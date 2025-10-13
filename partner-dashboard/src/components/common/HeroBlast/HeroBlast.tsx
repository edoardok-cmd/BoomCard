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
  background: #000;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
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
`;

const VideoOverlay = styled.div<{ $fadeOut: boolean }>`
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.4) 100%);
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
`;

const CardContainer = styled(motion.div)`
  perspective: 1000px;
  margin-bottom: 2rem;
  transition: transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
`;

const BoomCard = styled(motion.div)`
  width: 400px;
  height: 250px;
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%);
  border-radius: 20px;
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.8),
    0 0 40px rgba(255, 215, 0, 0.3),
    inset 0 2px 4px rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 2rem;
  position: relative;
  overflow: hidden;
  border: 2px solid rgba(255, 215, 0, 0.3);
  transform-style: preserve-3d;

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
    width: 340px;
    height: 210px;
    padding: 1.5rem;
  }

  @media (max-width: 480px) {
    width: 300px;
    height: 190px;
    padding: 1.25rem;
  }
`;

const CardChip = styled.div`
  width: 50px;
  height: 40px;
  background: linear-gradient(135deg, #d4af37 0%, #f4e5a1 50%, #d4af37 100%);
  border-radius: 8px;
  margin-bottom: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
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
    font-size: 2rem;
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
    font-size: 1.25rem;
    letter-spacing: 3px;
  }

  @media (max-width: 480px) {
    font-size: 1.1rem;
    letter-spacing: 2px;
  }
`;

const CardInfo = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
`;

const CardHolder = styled.div`
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 1px;

  @media (max-width: 480px) {
    font-size: 0.75rem;
  }
`;

const CardExpiry = styled.div`
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  font-family: 'Courier New', monospace;

  @media (max-width: 480px) {
    font-size: 0.7rem;
  }
`;

const CTAContainer = styled(motion.div)`
  text-align: center;
  color: white;
`;

const CTATitle = styled(motion.h1)`
  font-size: 3.5rem;
  font-weight: 900;
  margin-bottom: 1rem;
  text-shadow: 0 4px 20px rgba(0, 0, 0, 0.8);
  line-height: 1.2;
  background: linear-gradient(135deg, #fff 0%, #f0f0f0 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }

  @media (max-width: 480px) {
    font-size: 1.75rem;
  }
`;

const CTASubtitle = styled(motion.p)`
  font-size: 1.5rem;
  margin-bottom: 2rem;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;

  @media (max-width: 768px) {
    font-size: 1.25rem;
    margin-bottom: 1.5rem;
  }

  @media (max-width: 480px) {
    font-size: 1rem;
    margin-bottom: 1rem;
  }
`;

const ButtonContainer = styled(motion.div)`
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;

  a {
    text-decoration: none;
  }
`;

const HeroBlast: React.FC<HeroBlastProps> = ({ language = 'en' }) => {
  const [videoEnded, setVideoEnded] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [showCTA, setShowCTA] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedData = () => {
      setVideoLoaded(true);
    };

    const handleTimeUpdate = () => {
      // Show card at 60% of video duration (during the peak of the blast)
      if (video.currentTime >= video.duration * 0.6 && !showCard) {
        setShowCard(true);
      }
    };

    const handleEnded = () => {
      setVideoEnded(true);
      setShowCTA(true);
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [showCard]);

  const content = {
    en: {
      title: 'Let the Fun Begin!',
      subtitle: 'Unlock exclusive discounts at Bulgaria\'s finest venues',
      getStarted: 'Get Your BoomCard',
      learnMore: 'Learn More',
      cardHolder: 'CARD HOLDER',
    },
    bg: {
      title: 'Нека забавлението започне!',
      subtitle: 'Отключете ексклузивни отстъпки в най-добрите заведения в България',
      getStarted: 'Вземете BoomCard',
      learnMore: 'Научете повече',
      cardHolder: 'ПРИТЕЖАТЕЛ',
    },
  };

  const t = content[language];

  return (
    <HeroContainer>
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
        <AnimatePresence>
          {showCard && (
            <CardContainer
              initial={{ scale: 0, opacity: 0, rotateX: 90, z: -1000 }}
              animate={{
                scale: 1,
                opacity: 1,
                rotateX: 0,
                z: 0,
                y: showCTA ? -100 : 0, // Smoothly move card up when CTA appears
              }}
              transition={{
                type: 'spring',
                stiffness: showCTA ? 150 : 200, // Softer spring when moving up
                damping: showCTA ? 25 : 20, // More damping for smoother movement
                duration: 1.2,
                y: {
                  type: 'spring',
                  stiffness: 120,
                  damping: 28,
                },
              }}
            >
              <BoomCard
                whileHover={{
                  rotateY: 5,
                  scale: 1.05,
                  transition: { duration: 0.3 }
                }}
              >
                <div>
                  <CardChip />
                  <CardLogo>BOOM</CardLogo>
                  <CardNumber>•••• •••• •••• 2024</CardNumber>
                </div>
                <CardInfo>
                  <CardHolder>{t.cardHolder}</CardHolder>
                  <CardExpiry>12/25</CardExpiry>
                </CardInfo>
              </BoomCard>
            </CardContainer>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showCTA && (
            <CTAContainer
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.8 }}
            >
              <CTATitle
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.6 }}
              >
                {t.title}
              </CTATitle>

              <CTASubtitle
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9, duration: 0.6 }}
              >
                {t.subtitle}
              </CTASubtitle>

              <ButtonContainer
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1, duration: 0.6 }}
              >
                <Link to="/register">
                  <Button variant="primary" size="large">
                    {t.getStarted}
                  </Button>
                </Link>
                <Link to="/categories">
                  <Button variant="secondary" size="large">
                    {t.learnMore}
                  </Button>
                </Link>
              </ButtonContainer>
            </CTAContainer>
          )}
        </AnimatePresence>
      </ContentContainer>
    </HeroContainer>
  );
};

export default HeroBlast;
