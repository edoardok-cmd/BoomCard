import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import OfferCard, { Offer } from '../components/common/OfferCard/OfferCard';
import FilterPanel, { FilterGroup } from '../components/common/FilterPanel/FilterPanel';
import Button from '../components/common/Button/Button';
import Loading from '../components/common/Loading/Loading';

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
`;

const Breadcrumb = styled.div`
  display: flex;
  gap: 0.5rem;
  font-size: 0.875rem;
  margin-bottom: 1rem;
  opacity: 0.8;

  a {
    color: white;
    text-decoration: none;
    transition: opacity 200ms;

    &:hover {
      opacity: 1;
    }
  }

  span {
    opacity: 0.6;
  }
`;

const Title = styled.h1`
  font-size: 3rem;
  font-weight: 700;
  margin-bottom: 1rem;
  line-height: 1.2;

  @media (max-width: 768px) {
    font-size: 2rem;
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

const ContentWrapper = styled.div`
  padding: 2rem 0;
`;

const LayoutGrid = styled.div`
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 2rem;
  align-items: start;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

const Sidebar = styled.aside`
  position: sticky;
  top: 5rem;

  @media (max-width: 1024px) {
    position: static;
  }
`;

const MobileFilterToggle = styled(Button)`
  display: none;
  margin-bottom: 1rem;

  @media (max-width: 1024px) {
    display: flex;
    width: 100%;
  }
`;

const Main = styled.main`
  min-height: 60vh;
`;

const ResultsHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
`;

const ResultsCount = styled.p`
  font-size: 0.9375rem;
  color: #6b7280;
`;

const SortSelect = styled.select`
  padding: 0.625rem 2.5rem 0.625rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: #374151;
  background: white;
  cursor: pointer;
  transition: all 200ms;

  &:hover {
    border-color: #d1d5db;
  }

  &:focus {
    outline: none;
    border-color: #000000;
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
`;

const EmptyStateIcon = styled.div`
  font-size: 4rem;
  margin-bottom: 1rem;
`;

const EmptyStateTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.5rem;
`;

const EmptyStateText = styled.p`
  font-size: 1rem;
  color: #6b7280;
`;

// Sample data - would come from API in real implementation
const allOffers: Offer[] = [
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
  },
  {
    id: '3',
    title: 'Wine Tasting Experience',
    titleBg: 'Дегустация на вина',
    description: 'Exclusive wine tasting with local varietals',
    descriptionBg: 'Ексклузивна дегустация с местни сортове',
    category: 'Wineries',
    categoryBg: 'Винарни',
    location: 'Melnik',
    discount: 40,
    originalPrice: 150,
    discountedPrice: 90,
    imageUrl: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800',
    partnerName: 'Villa Melnik',
    rating: 4.7,
    reviewCount: 89,
    path: '/offers/wine-tasting-melnik-40'
  },
  // Add more offers as needed
];

const filterGroups: FilterGroup[] = [
  {
    id: 'location',
    title: 'Location',
    titleBg: 'Локация',
    type: 'checkbox',
    options: [
      { id: 'sofia', label: 'Sofia', labelBg: 'София', value: 'sofia' },
      { id: 'plovdiv', label: 'Plovdiv', labelBg: 'Пловдив', value: 'plovdiv' },
      { id: 'varna', label: 'Varna', labelBg: 'Варна', value: 'varna' },
      { id: 'bansko', label: 'Bansko', labelBg: 'Банско', value: 'bansko' },
      { id: 'melnik', label: 'Melnik', labelBg: 'Мелник', value: 'melnik' },
    ]
  },
  {
    id: 'category',
    title: 'Category',
    titleBg: 'Категория',
    type: 'checkbox',
    options: [
      { id: 'restaurants', label: 'Restaurants', labelBg: 'Ресторанти', value: 'restaurants' },
      { id: 'hotels', label: 'Hotels', labelBg: 'Хотели', value: 'hotels' },
      { id: 'spa', label: 'Spa & Wellness', labelBg: 'Спа и уелнес', value: 'spa' },
      { id: 'wineries', label: 'Wineries', labelBg: 'Винарни', value: 'wineries' },
      { id: 'experiences', label: 'Experiences', labelBg: 'Изживявания', value: 'experiences' },
    ]
  },
  {
    id: 'discount',
    title: 'Discount',
    titleBg: 'Отстъпка',
    type: 'range',
    min: 0,
    max: 100,
    options: []
  },
  {
    id: 'price',
    title: 'Price Range (BGN)',
    titleBg: 'Ценови диапазон (лв.)',
    type: 'range',
    min: 0,
    max: 1000,
    options: []
  },
  {
    id: 'rating',
    title: 'Rating',
    titleBg: 'Рейтинг',
    type: 'checkbox',
    options: [
      { id: 'rating-5', label: '5 stars', labelBg: '5 звезди', value: '5' },
      { id: 'rating-4', label: '4+ stars', labelBg: '4+ звезди', value: '4' },
      { id: 'rating-3', label: '3+ stars', labelBg: '3+ звезди', value: '3' },
    ]
  }
];

const CategoryListingPage: React.FC = () => {
  const { category } = useParams<{ category: string }>();
  const [language] = useState<'en' | 'bg'>('en');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [filteredOffers, setFilteredOffers] = useState<Offer[]>(allOffers);
  const [sortBy, setSortBy] = useState('relevance');

  const categoryTitles: Record<string, { en: string; bg: string }> = {
    restaurants: { en: 'Restaurants & Bars', bg: 'Ресторанти и Барове' },
    hotels: { en: 'Hotels & Accommodation', bg: 'Хотели и Настаняване' },
    spa: { en: 'Spa & Wellness', bg: 'Спа и Уелнес' },
    wineries: { en: 'Wineries', bg: 'Винарни' },
    experiences: { en: 'Experiences', bg: 'Изживявания' },
  };

  const currentCategory = category || 'all';
  const categoryTitle = categoryTitles[currentCategory] || { en: 'All Offers', bg: 'Всички оферти' };

  const handleApplyFilters = (filters: Record<string, string[]>) => {
    // In real implementation, this would make API call with filters
    console.log('Applied filters:', filters);
    setFilteredOffers(allOffers);
    setShowMobileFilters(false);
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value);
    // Implement sorting logic here
  };

  return (
    <PageContainer>
      <Hero>
        <Container>
          <HeroContent>
            <Breadcrumb>
              <a href="/">{language === 'bg' ? 'Начало' : 'Home'}</a>
              <span>/</span>
              <span>{language === 'bg' ? categoryTitle.bg : categoryTitle.en}</span>
            </Breadcrumb>
            <Title>{language === 'bg' ? categoryTitle.bg : categoryTitle.en}</Title>
            <Subtitle>
              {language === 'bg'
                ? `Открийте ${filteredOffers.length} ексклузивни оферти с отстъпки до 70%`
                : `Discover ${filteredOffers.length} exclusive offers with up to 70% off`}
            </Subtitle>
          </HeroContent>
        </Container>
      </Hero>

      <Container>
        <ContentWrapper>
          <LayoutGrid>
            {/* Desktop Filters */}
            <Sidebar className="hidden lg:block">
              <FilterPanel
                filters={filterGroups}
                language={language}
                onApplyFilters={handleApplyFilters}
              />
            </Sidebar>

            <Main>
              {/* Mobile Filter Toggle */}
              <MobileFilterToggle
                variant="secondary"
                size="medium"
                onClick={() => setShowMobileFilters(!showMobileFilters)}
              >
                <svg
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  style={{ marginRight: '0.5rem' }}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
                {language === 'bg' ? 'Филтри' : 'Filters'}
              </MobileFilterToggle>

              {/* Mobile Filters Panel */}
              {showMobileFilters && (
                <div className="lg:hidden mb-4">
                  <FilterPanel
                    filters={filterGroups}
                    language={language}
                    onApplyFilters={handleApplyFilters}
                  />
                </div>
              )}

              <ResultsHeader>
                <ResultsCount>
                  {language === 'bg'
                    ? `${filteredOffers.length} ${filteredOffers.length === 1 ? 'оферта' : 'оферти'}`
                    : `${filteredOffers.length} ${filteredOffers.length === 1 ? 'offer' : 'offers'}`}
                </ResultsCount>
                <SortSelect value={sortBy} onChange={handleSortChange}>
                  <option value="relevance">
                    {language === 'bg' ? 'Най-подходящи' : 'Most Relevant'}
                  </option>
                  <option value="discount">
                    {language === 'bg' ? 'Най-голяма отстъпка' : 'Highest Discount'}
                  </option>
                  <option value="price-low">
                    {language === 'bg' ? 'Цена: Ниска към висока' : 'Price: Low to High'}
                  </option>
                  <option value="price-high">
                    {language === 'bg' ? 'Цена: Висока към ниска' : 'Price: High to Low'}
                  </option>
                  <option value="rating">
                    {language === 'bg' ? 'Най-висок рейтинг' : 'Highest Rating'}
                  </option>
                </SortSelect>
              </ResultsHeader>

              {isLoading ? (
                <Loading size="large" fullScreen={false} />
              ) : filteredOffers.length > 0 ? (
                <OffersGrid>
                  {filteredOffers.map((offer, index) => (
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
                  <EmptyStateIcon>🔍</EmptyStateIcon>
                  <EmptyStateTitle>
                    {language === 'bg' ? 'Няма намерени оферти' : 'No offers found'}
                  </EmptyStateTitle>
                  <EmptyStateText>
                    {language === 'bg'
                      ? 'Опитайте да промените филтрите си'
                      : 'Try adjusting your filters'}
                  </EmptyStateText>
                </EmptyState>
              )}
            </Main>
          </LayoutGrid>
        </ContentWrapper>
      </Container>
    </PageContainer>
  );
};

export default CategoryListingPage;
