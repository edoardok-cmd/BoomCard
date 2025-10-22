import React, { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useLanguage } from '../../contexts/LanguageContext';
import Button from '../common/Button/Button';
import OfferCard, { Offer } from '../common/OfferCard/OfferCard';
import ClientCTA from '../common/ClientCTA/ClientCTA';

const PageContainer = styled.div`
  min-height: 100vh;
  background: var(--color-background);
`;

const Hero = styled.div`
  background: linear-gradient(135deg, #000000 0%, #1f2937 100%);
  color: white;
  padding: 4rem 0 3rem;

  /* Vibrant mode - explosive gradient hero */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #1a0a2e 0%, #6a0572 25%, #ab2567 50%, #ff006e 75%, #ff4500 100%);
    background-size: 200% 200%;
    animation: heroGradientFlow 10s ease infinite;
    box-shadow:
      inset 0 -8px 40px -10px rgba(255, 69, 0, 0.3),
      inset 0 -4px 30px -10px rgba(255, 0, 110, 0.2);
  }

  @keyframes heroGradientFlow {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  @media (max-width: 768px) {
    padding: 3rem 0 2rem;
  }
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1.5rem;
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

const ContentSection = styled.div`
  padding: 3rem 0;
`;

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
  offers?: Offer[];
  children?: ReactNode;
  emptyIcon?: string;
  emptyTitleEn?: string;
  emptyTitleBg?: string;
  emptyTextEn?: string;
  emptyTextBg?: string;
  showEmptyState?: boolean;
  isLoading?: boolean;
}

export const GenericPage: React.FC<GenericPageProps> = ({
  titleEn,
  titleBg,
  subtitleEn,
  subtitleBg,
  offers,
  children,
  emptyIcon = '🔍',
  emptyTitleEn = 'No items found',
  emptyTitleBg = 'Няма намерени елементи',
  emptyTextEn = 'Check back soon for new items!',
  emptyTextBg = 'Проверете отново скоро!',
  showEmptyState = false,
}) => {
  const { language } = useLanguage();

  const title = language === 'bg' ? titleBg : titleEn;
  const subtitle = language === 'bg' ? subtitleBg : subtitleEn;
  const emptyTitle = language === 'bg' ? emptyTitleBg : emptyTitleEn;
  const emptyText = language === 'bg' ? emptyTextBg : emptyTextEn;

  return (
    <PageContainer>
      <Hero>
        <Container>
          <HeroContent>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Title>{title}</Title>
              <Subtitle>{subtitle}</Subtitle>
            </motion.div>
          </HeroContent>
        </Container>
      </Hero>

      <ContentSection>
        <Container>
          {children}

          {offers && offers.length > 0 && (
            <OffersGrid>
              {offers.map((offer, index) => (
                <motion.div
                  key={offer.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                >
                  <OfferCard offer={offer} />
                </motion.div>
              ))}
            </OffersGrid>
          )}

          {(showEmptyState || (offers && offers.length === 0)) && (
            <EmptyState>
              <EmptyIcon>{emptyIcon}</EmptyIcon>
              <EmptyTitle>{emptyTitle}</EmptyTitle>
              <EmptyText>{emptyText}</EmptyText>
              <Link to="/search">
                <Button variant="primary">
                  {language === 'bg' ? 'Разгледай Всички Оферти' : 'Browse All Offers'}
                </Button>
              </Link>
            </EmptyState>
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
