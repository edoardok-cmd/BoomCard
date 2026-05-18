import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useCookieConsent } from '../../../contexts/CookieConsentContext';
import { useLanguage } from '../../../contexts/LanguageContext';

const BannerOverlay = styled(motion.div)`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  padding: 1rem;
  pointer-events: none;

  @media (max-width: 768px) {
    padding: 0.75rem;
  }
`;

const BannerContainer = styled(motion.div)`
  max-width: 1200px;
  margin: 0 auto;
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border-radius: 1rem;
  padding: 1.5rem 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  pointer-events: auto;

  @media (max-width: 768px) {
    flex-direction: column;
    padding: 1.25rem;
    gap: 1rem;
    text-align: center;
  }
`;

const BannerContent = styled.div`
  flex: 1;
`;

const BannerTitle = styled.h3`
  font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 1.1rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 0.5rem 0;
`;

const BannerText = styled.p`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
  line-height: 1.5;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 0.75rem;
  flex-shrink: 0;

  @media (max-width: 768px) {
    flex-direction: column;
    width: 100%;
  }
`;

const StyledButton = styled.button<{ $variant: 'primary' | 'secondary' | 'outline' }>`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0.75rem 1.25rem;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;

  ${props => props.$variant === 'primary' && `
    background: linear-gradient(135deg, #c9a237 0%, #d4af37 100%);
    color: #000000;
    border: none;
    box-shadow: 0 4px 15px rgba(201, 162, 55, 0.3);

    &:hover {
      background: linear-gradient(135deg, #d4af37 0%, #c9a237 100%);
      box-shadow: 0 6px 20px rgba(201, 162, 55, 0.4);
    }
  `}

  ${props => props.$variant === 'secondary' && `
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.3);

    &:hover {
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.5);
    }
  `}

  ${props => props.$variant === 'outline' && `
    background: transparent;
    color: rgba(255, 255, 255, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.2);

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }
  `}

  @media (max-width: 768px) {
    width: 100%;
  }
`;

const BANNER_HEIGHT_VAR = '--cookie-banner-h';

const CookieConsentBanner: React.FC = () => {
  const { showBanner, acceptAll, rejectNonEssential, openSettings } = useCookieConsent();
  const { language } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);

  // Publish the banner's rendered height as a CSS variable so the layout can
  // add matching bottom padding and prevent the banner from covering page content.
  // Ref is on BannerOverlay so offsetHeight includes the overlay's own padding,
  // which is responsive (1rem desktop / 0.75rem mobile) — no hardcoded offset needed.
  useEffect(() => {
    if (!showBanner) {
      document.documentElement.style.setProperty(BANNER_HEIGHT_VAR, '0px');
      return;
    }
    const measure = () => {
      const h = containerRef.current?.offsetHeight ?? 0;
      document.documentElement.style.setProperty(BANNER_HEIGHT_VAR, `${h}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [showBanner]);

  const content = {
    en: {
      title: 'We use cookies',
      text: 'We use cookies to improve your experience. Analytics cookies help us understand how you use our site.',
      acceptAll: 'Accept All',
      rejectNonEssential: 'Reject Non-Essential',
      settings: 'Settings',
    },
    bg: {
      title: 'Използваме бисквитки',
      text: 'Използваме бисквитки, за да подобрим вашето преживяване. Бисквитките за анализ ни помагат да разберем как използвате сайта.',
      acceptAll: 'Приемам всички',
      rejectNonEssential: 'Отхвърлям ненужните',
      settings: 'Настройки',
    },
  };

  const t = language === 'bg' ? content.bg : content.en;

  return (
    <AnimatePresence>
      {showBanner && (
        <BannerOverlay
          ref={containerRef}
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <BannerContainer>
            <BannerContent>
              <BannerTitle>{t.title}</BannerTitle>
              <BannerText>{t.text}</BannerText>
            </BannerContent>
            <ButtonGroup>
              <StyledButton $variant="primary" onClick={acceptAll}>
                {t.acceptAll}
              </StyledButton>
              <StyledButton $variant="secondary" onClick={rejectNonEssential}>
                {t.rejectNonEssential}
              </StyledButton>
              <StyledButton $variant="outline" onClick={openSettings}>
                {t.settings}
              </StyledButton>
            </ButtonGroup>
          </BannerContainer>
        </BannerOverlay>
      )}
    </AnimatePresence>
  );
};

export default CookieConsentBanner;
