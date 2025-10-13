import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';

interface CarouselProps {
  children: React.ReactNode[];
  autoPlay?: boolean;
  interval?: number;
  itemsToShow?: {
    mobile: number;
    tablet: number;
    desktop: number;
  };
  gap?: number;
}

const CarouselContainer = styled.div`
  position: relative;
  width: 100%;
  overflow: hidden;
`;

const CarouselTrack = styled.div`
  display: flex;
  gap: 1.5rem;
  overflow-x: auto;
  scroll-behavior: smooth;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding-bottom: 1rem;

  &::-webkit-scrollbar {
    display: none;
  }

  @media (max-width: 768px) {
    gap: 1rem;
  }
`;

const CarouselItem = styled(motion.div)<{ $itemWidth: string }>`
  flex: 0 0 ${props => props.$itemWidth};
  min-width: ${props => props.$itemWidth};
`;

const NavigationButton = styled.button<{ $direction: 'left' | 'right' }>`
  position: absolute;
  top: 50%;
  ${props => props.$direction === 'left' ? 'left: -1rem;' : 'right: -1rem;'}
  transform: translateY(-50%);
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: white;
  border: 1px solid #e5e7eb;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);

  &:hover:not(:disabled) {
    background: #f9fafb;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
    transform: translateY(-50%) scale(1.05);
  }

  &:active:not(:disabled) {
    transform: translateY(-50%) scale(0.95);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  svg {
    width: 1.25rem;
    height: 1.25rem;
    color: #111827;
  }

  @media (max-width: 1024px) {
    display: none;
  }
`;

const DotsContainer = styled.div`
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 2rem;
`;

const Dot = styled.button<{ $active: boolean }>`
  width: ${props => props.$active ? '2rem' : '0.5rem'};
  height: 0.5rem;
  border-radius: 9999px;
  background: ${props => props.$active ? '#111827' : '#d1d5db'};
  border: none;
  cursor: pointer;
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    background: ${props => props.$active ? '#111827' : '#9ca3af'};
  }
`;

export const Carousel: React.FC<CarouselProps> = ({
  children,
  autoPlay = false,
  interval = 5000,
  itemsToShow = { mobile: 1, tablet: 2, desktop: 3 },
  gap = 24
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [itemsPerView, setItemsPerView] = useState(itemsToShow.desktop);
  const trackRef = useRef<HTMLDivElement>(null);

  const totalItems = children.length;
  const maxIndex = Math.max(0, totalItems - itemsPerView);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setItemsPerView(itemsToShow.mobile);
      } else if (width < 1024) {
        setItemsPerView(itemsToShow.tablet);
      } else {
        setItemsPerView(itemsToShow.desktop);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [itemsToShow]);

  useEffect(() => {
    if (autoPlay && totalItems > itemsPerView) {
      const timer = setInterval(() => {
        setCurrentIndex((prev) => (prev >= maxIndex ? 0 : prev + 1));
      }, interval);
      return () => clearInterval(timer);
    }
  }, [autoPlay, interval, maxIndex, totalItems, itemsPerView]);

  useEffect(() => {
    if (trackRef.current) {
      const itemWidth = trackRef.current.offsetWidth / itemsPerView;
      trackRef.current.scrollTo({
        left: currentIndex * (itemWidth + gap),
        behavior: 'smooth'
      });
    }
  }, [currentIndex, itemsPerView, gap]);

  const goToNext = () => {
    if (currentIndex < maxIndex) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(Math.min(index, maxIndex));
  };

  const itemWidth = `calc((100% - ${gap * (itemsPerView - 1)}px) / ${itemsPerView})`;

  return (
    <CarouselContainer>
      <NavigationButton
        $direction="left"
        onClick={goToPrevious}
        disabled={currentIndex === 0}
        aria-label="Previous slide"
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </NavigationButton>

      <CarouselTrack ref={trackRef}>
        {children.map((child, index) => (
          <CarouselItem
            key={index}
            $itemWidth={itemWidth}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
          >
            {child}
          </CarouselItem>
        ))}
      </CarouselTrack>

      <NavigationButton
        $direction="right"
        onClick={goToNext}
        disabled={currentIndex >= maxIndex}
        aria-label="Next slide"
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </NavigationButton>

      {totalItems > itemsPerView && (
        <DotsContainer>
          {Array.from({ length: maxIndex + 1 }).map((_, index) => (
            <Dot
              key={index}
              $active={index === currentIndex}
              onClick={() => goToSlide(index)}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </DotsContainer>
      )}
    </CarouselContainer>
  );
};

export default Carousel;
