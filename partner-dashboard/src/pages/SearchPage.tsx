import React, { useState } from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import SearchAutocomplete from '../components/common/SearchAutocomplete/SearchAutocomplete';
import OfferCard, { Offer } from '../components/common/OfferCard/OfferCard';
import Button from '../components/common/Button/Button';
import Badge from '../components/common/Badge/Badge';

const PageContainer = styled.div`
  min-height: 100vh;
  background: #f9fafb;
`;

const Hero = styled.div`
  background: linear-gradient(135deg, #000000 0%, #1f2937 100%);
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
  color: #111827;
  margin-bottom: 1rem;
`;

const TagsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
`;

const SearchTag = styled.button`
  padding: 0.5rem 1rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 9999px;
  font-size: 0.9375rem;
  color: #374151;
  cursor: pointer;
  transition: all 200ms;

  &:hover {
    border-color: #000000;
    background: #f9fafb;
    color: #111827;
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
  color: #6b7280;
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
`;

const EmptyText = styled.p`
  font-size: 1rem;
  color: #6b7280;
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

const SearchPage: React.FC = () => {
  const [language, setLanguage] = useState<'en' | 'bg'>('en');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Offer[]>([]);
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
    const filtered = sampleOffers.filter(offer =>
      offer.title.toLowerCase().includes(query.toLowerCase()) ||
      offer.category.toLowerCase().includes(query.toLowerCase())
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
                {language === 'bg' ? 'Открийте перфектната оферта' : 'Find Your Perfect Deal'}
              </Title>
              <Subtitle>
                {language === 'bg'
                  ? 'Търсете измежду хиляди ексклузивни оферти за ресторанти, хотели и изживявания'
                  : 'Search through thousands of exclusive offers for restaurants, hotels, and experiences'}
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
                {language === 'bg' ? 'Популярни търсения' : 'Popular Searches'}
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
                    {language === 'bg' ? 'Резултати от търсенето' : 'Search Results'}
                  </SectionTitle>
                  {searchQuery && (
                    <ResultsCount>
                      {searchResults.length} {language === 'bg' ? 'резултата за' : 'results for'} "{searchQuery}"
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
                  {language === 'bg' ? 'Изчисти търсенето' : 'Clear Search'}
                </Button>
              </ResultsHeader>

              {searchResults.length > 0 ? (
                <OffersGrid>
                  {searchResults.map((offer, index) => (
                    <motion.div
                      key={offer.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: index * 0.05 }}
                    >
                      <OfferCard offer={offer} language={language} />
                    </motion.div>
                  ))}
                </OffersGrid>
              ) : (
                <EmptyState>
                  <EmptyIcon>🔍</EmptyIcon>
                  <EmptyTitle>
                    {language === 'bg' ? 'Няма намерени резултати' : 'No Results Found'}
                  </EmptyTitle>
                  <EmptyText>
                    {language === 'bg'
                      ? 'Опитайте с различни ключови думи или разгледайте популярните търсения'
                      : 'Try different keywords or browse popular searches'}
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
                    {language === 'bg' ? 'Назад към търсенето' : 'Back to Search'}
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
