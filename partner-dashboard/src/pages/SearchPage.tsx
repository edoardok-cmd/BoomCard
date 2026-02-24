import React, { useState } from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import SearchAutocomplete from '../components/common/SearchAutocomplete/SearchAutocomplete';
import OfferCard from '../components/common/OfferCard/OfferCard';
import { offerToEntity, type Offer, type Entity } from '../types/entity.types';
import Button from '../components/common/Button/Button';
import Badge from '../components/common/Badge/Badge';

const PageContainer = styled.div`
  min-height: 100vh;
  background: var(--color-background);
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
    font-size: 1rem;
  }
`;

const SearchWrapper = styled.div`
  max-width: 600px;
  margin: 0 auto;
`;

const Content = styled.div`
  padding: 3rem 0;

  @media (max-width: 768px) {
    padding: 2rem 0;
  }
`;

const PopularSearches = styled.div`
  margin-bottom: 3rem;
`;

const SectionTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 1rem;
`;

const TagsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
`;

const SearchTag = styled.button`
  padding: 0.5rem 1rem;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 9999px;
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 200ms;

  &:hover {
    border-color: var(--color-primary);
    background: var(--color-background-secondary);
    color: var(--color-text-primary);
  }
`;

const ResultsSection = styled.div``;

const ResultsHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
`;

const ResultsCount = styled.p`
  font-size: 1rem;
  color: var(--color-text-secondary);
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
  background: var(--color-background);
  border-radius: 1rem;
  border: 1px solid var(--color-border);
`;

const EmptyIcon = styled.div`
  font-size: 4rem;
  margin-bottom: 1rem;
`;

const EmptyTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
`;

const EmptyText = styled.p`
  font-size: 1rem;
  color: var(--color-text-secondary);
  margin-bottom: 2rem;
`;

// Sample data
const sampleOffers: Offer[] = [
  {
    id: '1',
    title: 'Spa Weekend in Bansko',
    titleBg: 'Спа уикенд в Банско',
    description: 'Luxury spa retreat with mountain views',
    descriptionBg: 'Луксозен спа център с планинска гледка',
    category: 'Spa & Wellness',
    categoryBg: 'Спа и уелнес',
    location: 'Bansko',
    discount: 70,
    originalPrice: 800,
    discountedPrice: 240,
    imageUrl: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800',
    partnerName: 'Kempinski Hotel Grand Arena',
    rating: 4.8,
    reviewCount: 124,
    path: '/offers/spa-bansko-70'
  },
  {
    id: '2',
    title: 'Fine Dining Experience',
    titleBg: 'Изискана вечеря',
    description: 'Michelin-recommended restaurant',
    descriptionBg: 'Препоръчан от Michelin ресторант',
    category: 'Fine Dining',
    categoryBg: 'Висока кухня',
    location: 'Sofia',
    discount: 50,
    originalPrice: 200,
    discountedPrice: 100,
    imageUrl: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
    partnerName: 'Made in Home',
    rating: 4.9,
    reviewCount: 267,
    path: '/offers/fine-dining-sofia-50'
  }
];

const sampleEntities = sampleOffers.map(offerToEntity);

const SearchPage: React.FC = () => {
  const { language, t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Entity[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const popularSearches = [
    { en: 'Spa & Wellness', bg: 'Спа и уелнес' },
    { en: 'Restaurants Sofia', bg: 'Ресторанти София' },
    { en: 'Hotels Bansko', bg: 'Хотели Банско' },
    { en: 'Wine Tasting', bg: 'Дегустация на вина' },
    { en: 'Beach Resorts', bg: 'Плажни курорти' },
    { en: 'Fine Dining', bg: 'Висока кухня' }
  ];

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setHasSearched(true);
    // Simulate search - in real app would call API
    const filtered = sampleEntities.filter(entity =>
      entity.name.en.toLowerCase().includes(query.toLowerCase()) ||
      entity.category.en.toLowerCase().includes(query.toLowerCase())
    );
    setSearchResults(filtered);
  };

  const handlePopularSearch = (search: string) => {
    handleSearch(search);
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
                {t('search.title')}
              </Title>
              <Subtitle>
                {t('search.subtitle')}
              </Subtitle>
              <SearchWrapper>
                <SearchAutocomplete
                  language={language}
                  onSearch={handleSearch}
                />
              </SearchWrapper>
            </motion.div>
          </HeroContent>
        </Container>
      </Hero>

      <Container>
        <Content>
          {!hasSearched ? (
            <PopularSearches>
              <SectionTitle>
                {t('search.popularSearches')}
              </SectionTitle>
              <TagsContainer>
                {popularSearches.map((search, index) => (
                  <SearchTag
                    key={index}
                    onClick={() => handlePopularSearch(language === 'bg' ? search.bg : search.en)}
                  >
                    {language === 'bg' ? search.bg : search.en}
                  </SearchTag>
                ))}
              </TagsContainer>
            </PopularSearches>
          ) : (
            <ResultsSection>
              <ResultsHeader>
                <div>
                  <SectionTitle>
                    {t('search.searchResults')}
                  </SectionTitle>
                  {searchQuery && (
                    <ResultsCount>
                      {searchResults.length} {t('search.resultsFor')} "{searchQuery}"
                    </ResultsCount>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setHasSearched(false);
                  }}
                >
                  {t('search.clearSearch')}
                </Button>
              </ResultsHeader>

              {searchResults.length > 0 ? (
                <OffersGrid>
                  {searchResults.map((entity, index) => (
                    <motion.div
                      key={entity.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: index * 0.05 }}
                    >
                      <OfferCard entity={entity} />
                    </motion.div>
                  ))}
                </OffersGrid>
              ) : (
                <EmptyState>
                  <EmptyIcon>🔍</EmptyIcon>
                  <EmptyTitle>
                    {t('search.noResults')}
                  </EmptyTitle>
                  <EmptyText>
                    {t('search.noResultsDescription')}
                  </EmptyText>
                  <Button
                    variant="secondary"
                    size="medium"
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                      setHasSearched(false);
                    }}
                  >
                    {t('search.backToSearch')}
                  </Button>
                </EmptyState>
              )}
            </ResultsSection>
          )}
        </Content>
      </Container>
    </PageContainer>
  );
};

export default SearchPage;
