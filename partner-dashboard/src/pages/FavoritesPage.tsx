import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useFavorites } from '../contexts/FavoritesContext';
import { useLanguage } from '../contexts/LanguageContext';
import OfferCard from '../components/common/OfferCard/OfferCard';
import Button from '../components/common/Button/Button';

const PageContainer = styled.div`
  min-height: 100vh;
  background: #f9fafb;

  [data-theme="dark"] & {
    background: #0a0a0a;
  }
`;

const Hero = styled.div`
  background: linear-gradient(135deg, #000000 0%, #1f2937 100%);

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
  color: white;
  padding: 4rem 0 3rem;

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
  line-height: 1.6;

  @media (max-width: 768px) {
    font-size: 1rem;
  }
`;

const Content = styled.div`
  padding: 3rem 0;

  @media (max-width: 768px) {
    padding: 2rem 0;
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
`;

const HeaderLeft = styled.div``;

const SectionTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.25rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const Count = styled.p`
  font-size: 1rem;
  color: #6b7280;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const OffersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  background: white;
  border-radius: 1rem;

  [data-theme="dark"] & {
    background: #1f2937;
  }
`;

const EmptyIcon = styled.div`
  font-size: 4rem;
  margin-bottom: 1rem;
`;

const EmptyTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.5rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const EmptyText = styled.p`
  font-size: 1rem;
  color: #6b7280;
  margin-bottom: 2rem;
  line-height: 1.6;

  [data-theme="dark"] & {
    color: #d1d5db;
  }
`;

const SortOptions = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const SortButton = styled.button<{ $active: boolean }>`
  padding: 0.5rem 1rem;
  background: ${props => props.$active ? '#000000' : 'white'};
  color: ${props => props.$active ? 'white' : '#374151'};
  border: 1px solid ${props => props.$active ? '#000000' : '#e5e7eb'};
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 200ms;

  [data-theme="dark"] & {
    background: ${props => props.$active ? '#60a5fa' : '#374151'};
    color: ${props => props.$active ? '#000000' : '#d1d5db'};
    border-color: ${props => props.$active ? '#60a5fa' : '#4b5563'};
  }

  &:hover {
    background: ${props => props.$active ? '#1f2937' : '#f9fafb'};
    border-color: ${props => props.$active ? '#1f2937' : '#d1d5db'};

    [data-theme="dark"] & {
      background: ${props => props.$active ? '#3b82f6' : '#4b5563'};
      border-color: ${props => props.$active ? '#3b82f6' : '#6b7280'};
    }
  }
`;

type SortType = 'recent' | 'discount' | 'price-low' | 'price-high';

const FavoritesPage: React.FC = () => {
  const { language, t } = useLanguage();
  const [sortBy, setSortBy] = useState<SortType>('recent');
  const { favorites, clearFavorites } = useFavorites();

  const sortOptions: { value: SortType; label: string }[] = [
    { value: 'recent', label: t('favorites.sortRecentlyAdded') },
    { value: 'discount', label: t('favorites.sortHighestDiscount') },
    { value: 'price-low', label: t('favorites.sortPriceLowToHigh') },
    { value: 'price-high', label: t('favorites.sortPriceHighToLow') }
  ];

  const sortedFavorites = [...favorites].sort((a, b) => {
    switch (sortBy) {
      case 'recent':
        return b.addedAt - a.addedAt;
      case 'discount':
        return b.discount - a.discount;
      case 'price-low':
        return a.discountedPrice - b.discountedPrice;
      case 'price-high':
        return b.discountedPrice - a.discountedPrice;
      default:
        return 0;
    }
  });

  const handleClearAll = () => {
    if (window.confirm(t('favorites.clearAllConfirm'))) {
      clearFavorites();
    }
  };

  return (
    <PageContainer>
      <Hero>
        <Container>
          <HeroContent>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <Title>
                {t('favorites.title')}
              </Title>
              <Subtitle>
                {t('favorites.subtitle')}
              </Subtitle>
            </motion.div>
          </HeroContent>
        </Container>
      </Hero>

      <Container>
        <Content>
          {favorites.length > 0 ? (
            <>
              <Header>
                <HeaderLeft>
                  <SectionTitle>
                    {t('favorites.savedOffers')}
                  </SectionTitle>
                  <Count>
                    {favorites.length} {favorites.length === 1 ? t('favorites.offer') : t('favorites.offers')}
                  </Count>
                </HeaderLeft>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <SortOptions>
                    {sortOptions.map(option => (
                      <SortButton
                        key={option.value}
                        $active={sortBy === option.value}
                        onClick={() => setSortBy(option.value)}
                      >
                        {option.label}
                      </SortButton>
                    ))}
                  </SortOptions>

                  <Button
                    variant="danger"
                    size="small"
                    onClick={handleClearAll}
                  >
                    {t('favorites.clearAll')}
                  </Button>
                </div>
              </Header>

              <OffersGrid>
                {sortedFavorites.map((favorite, index) => (
                  <motion.div
                    key={favorite.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.05 }}
                  >
                    <OfferCard
                      offer={{
                        id: favorite.id,
                        title: favorite.title,
                        titleBg: favorite.titleBg,
                        description: '',
                        descriptionBg: '',
                        category: favorite.category,
                        categoryBg: favorite.categoryBg,
                        location: favorite.location,
                        discount: favorite.discount,
                        originalPrice: favorite.originalPrice,
                        discountedPrice: favorite.discountedPrice,
                        imageUrl: favorite.imageUrl,
                        partnerName: '',
                        path: favorite.path
                      }}
                    />
                  </motion.div>
                ))}
              </OffersGrid>
            </>
          ) : (
            <EmptyState>
              <EmptyIcon>❤️</EmptyIcon>
              <EmptyTitle>
                {t('favorites.noFavorites')}
              </EmptyTitle>
              <EmptyText>
                {t('favorites.noFavoritesDescription')}
              </EmptyText>
              <Link to="/categories">
                <Button variant="primary" size="large">
                  {t('favorites.browseOffers')}
                </Button>
              </Link>
            </EmptyState>
          )}
        </Content>
      </Container>
    </PageContainer>
  );
};

export default FavoritesPage;
