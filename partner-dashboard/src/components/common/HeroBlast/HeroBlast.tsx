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
  position: relative;
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
`;

const BoomCard = styled(motion.div)<{ $showAnimation?: boolean }>`
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
  perspective: 1000px;

  /* Card rotation animation: 3 tilts + 5s rest = 8s cycle, repeats forever */
  animation: ${props => props.$showAnimation ? 'cardFlip 16s ease-in-out infinite' : 'none'};

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
  gap: 1rem;
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
  font-size: 4rem;
  font-weight: 700;
  margin-bottom: 1rem;
  line-height: 1.2;
  letter-spacing: -0.02em;

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
  }

  @media (max-width: 480px) {
    font-size: 2rem;
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
  const [photoState, setPhotoState] = useState<'hidden' | 'dealing' | 'returning'>('hidden');
  const videoRef = useRef<HTMLVideoElement>(null);

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

  // Photo cycling effect - synced with card tilt animation
  useEffect(() => {
    if (photoState === 'hidden') return;

    // Animation cycle: 16 seconds total
    // 0-3s: 3 tilts while dealing photos
    // 3-8s: 5s rest (photos stay out)
    // 8-11s: 3 tilts while returning photos
    // 11-16s: 5s rest (photos stay hidden)
    // Then repeat

    const cycleInterval = setInterval(() => {
      setPhotoState(current => {
        if (current === 'dealing') return 'returning';
        if (current === 'returning') return 'dealing';
        return 'dealing';
      });
    }, 8000); // Switch state every 8 seconds (half the 16s cycle)

    return () => clearInterval(cycleInterval);
  }, [photoState]);

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
      // Only trigger once
      if (!videoEnded) {
        setVideoEnded(true);
        setShowCTA(true);
        // Start photo cycling after card moves up
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
  }, [showCard, videoEnded, showCTA]);

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
              <BoomCard $showAnimation={showCTA}>
                <div>
                  <CardLogo>BOOM</CardLogo>
                  <CardNumber>•••• •••• •••• 2024</CardNumber>
                </div>
                <CardInfo>
                  <div>
                    <CardHolder>{t.cardHolder}</CardHolder>
                    <CardExpiry>12/25</CardExpiry>
                  </div>
                </CardInfo>
              </BoomCard>

              {/* Ejected Photos - cycle between dealing and returning */}
              {photoState !== 'hidden' && (
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
