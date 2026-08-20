import React, { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useLanguage } from '../../contexts/LanguageContext';
import Button from '../common/Button/Button';
import OfferCard from '../common/OfferCard/OfferCard';
import ClientCTA from '../common/ClientCTA/ClientCTA';
import Loading from '../common/Loading/Loading';
import type { Entity } from '../../types/entity.types';

const PageContainer = styled.div`
  min-height: 100vh;
  background: var(--color-background);
`;

const Hero = styled.div<{ $bgImage?: string }>`
  ${({ $bgImage }) => $bgImage
    ? `
      background-image: url('${$bgImage}');
      background-size: cover;
      background-position: center;
      position: relative;
      overflow: hidden;
      min-height: 480px;
      display: flex;
      align-items: center;

      &::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          to bottom,
          rgba(0, 0, 0, 0.55) 0%,
          rgba(0, 0, 0, 0.65) 50%,
          rgba(0, 0, 0, 0.75) 100%
        );
        z-index: 0;
      }

      [data-theme="color"] & {
        &::before {
          background: linear-gradient(
            135deg,
            rgba(26, 10, 46, 0.75) 0%,
            rgba(106, 5, 114, 0.65) 25%,
            rgba(171, 37, 103, 0.6) 50%,
            rgba(255, 0, 110, 0.55) 75%,
            rgba(255, 69, 0, 0.6) 100%
          );
          background-size: 200% 200%;
          animation: heroGradientFlow 10s ease infinite;
        }
      }
    `
    : `
      background: linear-gradient(135deg, #000000 0%, #1f2937 100%);

      [data-theme="color"] & {
        background: linear-gradient(135deg, #1a0a2e 0%, #6a0572 25%, #ab2567 50%, #ff006e 75%, #ff4500 100%);
        background-size: 200% 200%;
        animation: heroGradientFlow 10s ease infinite;
        box-shadow:
          inset 0 -8px 40px -10px rgba(255, 69, 0, 0.3),
          inset 0 -4px 30px -10px rgba(255, 0, 110, 0.2);
      }
    `
  }

  @keyframes heroGradientFlow {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  color: white;
  padding: ${({ $bgImage }) => $bgImage ? '8rem 0 6rem' : '4rem 0 3rem'};

  @media (max-width: 768px) {
    padding: ${({ $bgImage }) => $bgImage ? '5rem 0 3rem' : '3rem 0 2rem'};
    ${({ $bgImage }) => $bgImage && 'min-height: 360px;'}
  }
`;

const Container = styled.div<{ $zIndexed?: boolean }>`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1.5rem;
  ${({ $zIndexed }) => $zIndexed && `
    position: relative;
    z-index: 1;
    width: 100%;
  `}
`;

const HeroContent = styled.div`
  max-width: 800px;
  margin: 0 auto;
  text-align: center;
`;

const Title = styled.h1`
  font-size: 3.5rem;
  font-weight: 700;
  margin-bottom: 1rem;
  line-height: 1.1;

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }
`;

const Subtitle = styled.p`
  font-size: 1.25rem;
  opacity: 0.9;
  margin-bottom: 2.5rem;
  line-height: 1.6;

  @media (max-width: 768px) {
    font-size: 1.125rem;
  }
`;

const CTAButtonWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  margin-top: 2rem;
`;

const TrustLine = styled.p`
  font-size: 0.9rem;
  opacity: 0.7;
  margin: 0;
`;

const ContentSection = styled.div`
  padding: 3rem 0;
`;

const ContentLayout = styled.div`
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 2rem;
  align-items: start;

  @media (max-width: 1024px) {
    grid-template-columns: 260px 1fr;
  }

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const SidebarFilters = styled.aside<{ $showMobile: boolean }>`
  position: sticky;
  top: 1.5rem;
  max-height: calc(100vh - 3rem);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #e5e7eb transparent;

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: #e5e7eb;
    border-radius: 2px;
  }

  @media (max-width: 768px) {
    position: static;
    max-height: none;
    display: ${props => props.$showMobile ? 'block' : 'none'};
  }
`;

const MobileFilterToggle = styled.button`
  display: none;
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 0.75rem;
  background: var(--color-background, #ffffff);
  color: var(--color-text-primary, #374151);
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  font-family: inherit;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
    color: #d1d5db;
  }

  @media (max-width: 768px) {
    display: flex;
  }
`;

const MainContent = styled.div``;

const OffersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 1rem;
  color: #6b7280;
`;

const EmptyIcon = styled.div`
  font-size: 4rem;
  margin-bottom: 1rem;
`;

const EmptyTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--color-text-primary);
`;

const EmptyText = styled.p`
  font-size: 1rem;
  margin-bottom: 2rem;
  color: var(--color-text-secondary);
`;

const ContentBlock = styled.div`
  background: var(--color-background);
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: var(--shadow-soft);
  border: 1px solid var(--color-border);
  margin-bottom: 2rem;
`;

interface GenericPageProps {
  titleEn: string;
  titleBg: string;
  subtitleEn: string;
  subtitleBg: string;
  /** Unified entity array */
  entities?: Entity[];
  children?: ReactNode;
  emptyIcon?: string;
  emptyTitleEn?: string;
  emptyTitleBg?: string;
  emptyTextEn?: string;
  emptyTextBg?: string;
  showEmptyState?: boolean;
  isLoading?: boolean;
  filters?: ReactNode;
  backgroundImage?: string;
}

export const GenericPage: React.FC<GenericPageProps> = ({
  titleEn,
  titleBg,
  subtitleEn,
  subtitleBg,
  entities,
  children,
  emptyIcon = '🔍',
  emptyTitleEn = 'No items found',
  emptyTitleBg = 'Няма намерени елементи',
  emptyTextEn = 'Check back soon for new items!',
  emptyTextBg = 'Проверете отново скоро!',
  showEmptyState = false,
  isLoading = false,
  filters,
  backgroundImage,
}) => {
  const { language, t } = useLanguage();
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const title = language === 'bg' ? titleBg : titleEn;
  const subtitle = language === 'bg' ? subtitleBg : subtitleEn;
  const emptyTitle = language === 'bg' ? emptyTitleBg : emptyTitleEn;
  const emptyText = language === 'bg' ? emptyTextBg : emptyTextEn;

  return (
    <PageContainer>
      <Hero $bgImage={backgroundImage}>
        <Container $zIndexed={!!backgroundImage}>
          <HeroContent>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Title>{title}</Title>
              <Subtitle>{subtitle}</Subtitle>
              <CTAButtonWrapper>
                <Link to="/#subscription-plans" style={{ textDecoration: 'none' }}>
                  <Button variant="golden" size="large">
                    {t('offersPage.heroCta')}
                  </Button>
                </Link>
                <TrustLine>{t('offersPage.heroTrustLine')}</TrustLine>
              </CTAButtonWrapper>
            </motion.div>
          </HeroContent>
        </Container>
      </Hero>

      <ContentSection>
        <Container>
          {filters ? (
            <>
              <MobileFilterToggle onClick={() => setShowMobileFilters(v => !v)}>
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                {language === 'bg' ? 'Филтри' : 'Filters'}
              </MobileFilterToggle>
              <ContentLayout>
              <SidebarFilters $showMobile={showMobileFilters}>{filters}</SidebarFilters>
              <MainContent>
                {children}

                {isLoading && <Loading size="large" fullScreen={false} />}

                {!isLoading && entities && entities.length > 0 && (
                  <OffersGrid>
                    {entities.map((entity, index) => (
                      <motion.div
                        key={entity.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: index * 0.1 }}
                      >
                        <OfferCard entity={entity} />
                      </motion.div>
                    ))}
                  </OffersGrid>
                )}

                {!isLoading && (showEmptyState || (entities && entities.length === 0)) && (
                  <EmptyState>
                    <EmptyIcon>{emptyIcon}</EmptyIcon>
                    <EmptyTitle>{emptyTitle}</EmptyTitle>
                    <EmptyText>{emptyText}</EmptyText>
                    <Link to="/search">
                      <Button variant="primary">
                        {language === 'bg' ? 'Разгледай Всички Отстъпки' : 'Browse All Discounts'}
                      </Button>
                    </Link>
                  </EmptyState>
                )}
              </MainContent>
              </ContentLayout>
            </>
          ) : (
            <>
              {children}

              {isLoading && <Loading size="large" fullScreen={false} />}

              {!isLoading && entities && entities.length > 0 && (
                <OffersGrid>
                  {entities.map((entity, index) => (
                    <motion.div
                      key={entity.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: index * 0.1 }}
                    >
                      <OfferCard entity={entity} />
                    </motion.div>
                  ))}
                </OffersGrid>
              )}

              {!isLoading && (showEmptyState || (entities && entities.length === 0)) && (
                <EmptyState>
                  <EmptyIcon>{emptyIcon}</EmptyIcon>
                  <EmptyTitle>{emptyTitle}</EmptyTitle>
                  <EmptyText>{emptyText}</EmptyText>
                  <Link to="/search">
                    <Button variant="primary">
                      {language === 'bg' ? 'Разгледай Всички Отстъпки' : 'Browse All Discounts'}
                    </Button>
                  </Link>
                </EmptyState>
              )}
            </>
          )}
        </Container>
      </ContentSection>

      {/* Client CTA */}
      <ClientCTA />
    </PageContainer>
  );
};

export { ContentBlock };
export default GenericPage;
