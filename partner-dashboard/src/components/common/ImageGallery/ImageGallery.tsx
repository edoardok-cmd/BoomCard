import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';

interface ImageGalleryProps {
  images: string[];
  alt?: string;
}

const GalleryContainer = styled.div`
  position: relative;
  width: 100%;
  border-radius: 1rem;
  overflow: hidden;
  background: #000;
`;

const MainImageContainer = styled.div`
  position: relative;
  width: 100%;
  padding-top: 56.25%; /* 16:9 aspect ratio */
  overflow: hidden;
  cursor: pointer;
`;

const MainImage = styled(motion.img)`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const NavigationButton = styled.button<{ $direction: 'left' | 'right' }>`
  position: absolute;
  top: 50%;
  ${props => props.$direction === 'left' ? 'left: 1rem;' : 'right: 1rem;'}
  transform: translateY(-50%);
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0;

  ${GalleryContainer}:hover & {
    opacity: 1;
  }

  &:hover {
    background: white;
    transform: translateY(-50%) scale(1.05);
  }

  &:active {
    transform: translateY(-50%) scale(0.95);
  }

  svg {
    width: 1.25rem;
    height: 1.25rem;
    color: #111827;
  }

  @media (max-width: 768px) {
    opacity: 1;
    width: 2.5rem;
    height: 2.5rem;
  }
`;

const ThumbnailsContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem;
  overflow-x: auto;
  scrollbar-width: thin;
  background: rgba(0, 0, 0, 0.8);

  &::-webkit-scrollbar {
    height: 4px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }

  @media (max-width: 768px) {
    gap: 0.375rem;
    padding: 0.5rem;
  }
`;

const Thumbnail = styled.button<{ $active: boolean }>`
  flex-shrink: 0;
  width: 80px;
  height: 60px;
  border: 2px solid ${props => props.$active ? '#ffffff' : 'transparent'};
  border-radius: 0.5rem;
  overflow: hidden;
  cursor: pointer;
  transition: all 200ms;
  opacity: ${props => props.$active ? '1' : '0.6'};
  background: none;
  padding: 0;

  &:hover {
    opacity: 1;
    border-color: ${props => props.$active ? '#ffffff' : 'rgba(255, 255, 255, 0.5)'};
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  @media (max-width: 768px) {
    width: 60px;
    height: 45px;
  }
`;

const Counter = styled.div`
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  padding: 0.5rem 1rem;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 500;
  backdrop-filter: blur(4px);
  z-index: 5;
`;

const FullscreenOverlay = styled(motion.div)`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.95);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
`;

const FullscreenImage = styled(motion.img)`
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 0.5rem;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 200ms;

  &:hover {
    background: white;
    transform: scale(1.05);
  }

  svg {
    width: 1.5rem;
    height: 1.5rem;
    color: #111827;
  }
`;

export const ImageGallery: React.FC<ImageGalleryProps> = ({ images, alt = 'Gallery image' }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [direction, setDirection] = useState(0);

  const goToNext = () => {
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const goToPrevious = () => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const goToImage = (index: number) => {
    setDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 1000 : -1000,
      opacity: 0
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 1000 : -1000,
      opacity: 0
    })
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') goToPrevious();
    if (e.key === 'ArrowRight') goToNext();
    if (e.key === 'Escape') setIsFullscreen(false);
  };

  return (
    <>
      <GalleryContainer onKeyDown={handleKeyDown} tabIndex={0}>
        <MainImageContainer onClick={() => setIsFullscreen(true)}>
          <AnimatePresence initial={false} custom={direction}>
            <MainImage
              key={currentIndex}
              src={images[currentIndex]}
              alt={`${alt} ${currentIndex + 1}`}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: 'spring', stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 }
              }}
            />
          </AnimatePresence>

          {images.length > 1 && (
            <>
              <NavigationButton
                $direction="left"
                onClick={(e) => {
                  e.stopPropagation();
                  goToPrevious();
                }}
                aria-label="Previous image"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </NavigationButton>

              <NavigationButton
                $direction="right"
                onClick={(e) => {
                  e.stopPropagation();
                  goToNext();
                }}
                aria-label="Next image"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </NavigationButton>

              <Counter>
                {currentIndex + 1} / {images.length}
              </Counter>
            </>
          )}
        </MainImageContainer>

        {images.length > 1 && (
          <ThumbnailsContainer>
            {images.map((image, index) => (
              <Thumbnail
                key={index}
                $active={index === currentIndex}
                onClick={() => goToImage(index)}
                aria-label={`View image ${index + 1}`}
              >
                <img src={image} alt={`${alt} thumbnail ${index + 1}`} />
              </Thumbnail>
            ))}
          </ThumbnailsContainer>
        )}
      </GalleryContainer>

      <AnimatePresence>
        {isFullscreen && (
          <FullscreenOverlay
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsFullscreen(false)}
          >
            <CloseButton
              onClick={() => setIsFullscreen(false)}
              aria-label="Close fullscreen"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </CloseButton>

            <FullscreenImage
              src={images[currentIndex]}
              alt={`${alt} ${currentIndex + 1}`}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            />

            {images.length > 1 && (
              <>
                <NavigationButton
                  $direction="left"
                  onClick={(e) => {
                    e.stopPropagation();
                    goToPrevious();
                  }}
                  style={{ opacity: 1 }}
                  aria-label="Previous image"
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </NavigationButton>

                <NavigationButton
                  $direction="right"
                  onClick={(e) => {
                    e.stopPropagation();
                    goToNext();
                  }}
                  style={{ opacity: 1 }}
                  aria-label="Next image"
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </NavigationButton>
              </>
            )}
          </FullscreenOverlay>
        )}
      </AnimatePresence>
    </>
  );
};

export default ImageGallery;
