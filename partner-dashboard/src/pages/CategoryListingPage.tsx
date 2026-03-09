import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import OfferCard from '../components/common/OfferCard/OfferCard';
import { offerToEntity, type Offer, type Entity } from '../types/entity.types';
import Button from '../components/common/Button/Button';
import Loading from '../components/common/Loading/Loading';
import { placesCategories } from '../types/categories.types';

const PageContainer = styled.div`

  [data-theme="dark"] & {
    background: #0a0a0a;
  }
  min-height: 100vh;
  background: #f9fafb;
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
  text-align: center;

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

const Breadcrumb = styled.div`
  display: flex;
  gap: 0.5rem;
  font-size: 0.875rem;
  margin-bottom: 1rem;
  opacity: 0.8;
  justify-content: center;

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
  margin-bottom: 2rem;

  @media (max-width: 768px) {
    font-size: 1rem;
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

const ContentWrapper = styled.div`
  padding: 2rem 0;
`;

const LayoutGrid = styled.div`
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 2rem;
  align-items: start;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

const FilterSidebar = styled.aside<{ $showMobile?: boolean }>`
  background: var(--color-background, #ffffff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 1rem;
  padding: 1.25rem;
  position: sticky;
  top: 5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
  }

  @media (max-width: 1024px) {
    position: static;
    display: ${props => props.$showMobile ? 'flex' : 'none'};
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
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
    color: #d1d5db;
  }

  @media (max-width: 1024px) {
    display: flex;
  }
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const FilterLabel = styled.span`
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-secondary, #6b7280);

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const FilterChipsWrapper = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
`;

const FilterChip = styled.button<{ $active?: boolean }>`
  padding: 0.3125rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 200ms ease;
  border: 1.5px solid ${props => props.$active ? 'var(--color-primary, #ff4500)' : 'var(--color-border, #e5e7eb)'};
  background: ${props => props.$active ? 'var(--color-primary, #ff4500)' : 'transparent'};
  color: ${props => props.$active ? '#ffffff' : 'var(--color-text-primary, #374151)'};
  white-space: nowrap;
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  [data-theme="dark"] & {
    border-color: ${props => props.$active ? '#ff4500' : '#4b5563'};
    background: ${props => props.$active ? '#ff4500' : 'transparent'};
    color: ${props => props.$active ? '#ffffff' : '#d1d5db'};
  }

  &:hover {
    border-color: var(--color-primary, #ff4500);
    ${props => !props.$active && `
      background: rgba(255, 69, 0, 0.08);
    `}
  }
`;

const FilterDivider = styled.hr`
  border: none;
  border-top: 1px solid var(--color-border, #e5e7eb);
  margin: 0;

  [data-theme="dark"] & {
    border-color: #374151;
  }
`;

const SubcategorySection = styled(motion.div)`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.625rem 0.75rem;
  margin-top: 0.25rem;
  background: #f9fafb;
  border-radius: 0.75rem;
  border-left: 3px solid var(--color-primary, #ff4500);

  [data-theme="dark"] & {
    background: #111827;
    border-left-color: #ff4500;
  }
`;

const SubcategoryParentLabel = styled.span`
  font-size: 0.6875rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.125rem;

  [data-theme="dark"] & {
    color: #9ca3af;
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

const allEntities = allOffers.map(offerToEntity);

const CategoryListingPage: React.FC = () => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [filteredOffers, setFilteredOffers] = useState<Entity[]>(allEntities);
  const [sortBy, setSortBy] = useState('relevance');
  const [isLoading] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({
    category: [],
    location: [],
    discount: [],
    rating: [],
    priceLevel: [],
  });

  const handleCategoryToggle = (categoryId: string) => {
    setActiveFilters(prev => {
      const current = prev.category || [];
      const category = placesCategories.find(c => c.id === categoryId);
      if (!category) return prev;

      const isSelected = current.includes(categoryId);
      // Collect all subcategory IDs including nested children
      const allSubIds: string[] = [];
      category.subcategories.forEach(s => {
        allSubIds.push(s.id);
        if (s.children) {
          s.children.forEach(c => allSubIds.push(c.id));
        }
      });

      let updated: string[];
      if (isSelected) {
        // Deselect parent + all its subcategories
        updated = current.filter(id => id !== categoryId && !allSubIds.includes(id));
      } else {
        // Select parent only
        updated = [...current, categoryId];
      }
      return { ...prev, category: updated };
    });
  };

  const handleSubcategoryToggle = (subcategoryId: string, parentId: string) => {
    setActiveFilters(prev => {
      const current = prev.category || [];
      const isSelected = current.includes(subcategoryId);
      let updated: string[];

      if (isSelected) {
        // Deselect subcategory + any nested children
        const category = placesCategories.find(c => c.id === parentId);
        const sub = category?.subcategories.find(s => s.id === subcategoryId);
        const childIds = sub?.children?.map(c => c.id) || [];
        updated = current.filter(id => id !== subcategoryId && !childIds.includes(id));
      } else {
        updated = [...current, subcategoryId];
        // Auto-select parent if not already selected
        if (!updated.includes(parentId)) {
          updated.push(parentId);
        }
      }
      return { ...prev, category: updated };
    });
  };

  const toggleFilter = (group: string, value: string) => {
    setActiveFilters(prev => {
      const current = prev[group] || [];
      const updated = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      const newFilters = { ...prev, [group]: updated };

      // Apply filters
      let filtered = [...allEntities];

      if (newFilters.location.length > 0) {
        filtered = filtered.filter(entity =>
          newFilters.location.some(loc =>
            entity.location.display.toLowerCase().includes(loc.toLowerCase())
          )
        );
      }

      if (newFilters.discount.length > 0) {
        filtered = filtered.filter(entity => {
          return newFilters.discount.some(range => {
            const [min, max] = range.split('-').map(Number);
            const percent = entity.discount?.percent ?? 0;
            return percent >= min && percent <= max;
          });
        });
      }

      if (newFilters.rating.length > 0) {
        filtered = filtered.filter(entity => {
          return newFilters.rating.some(range => {
            const [min, max] = range.split('-').map(Number);
            return (entity.rating || 0) >= min && (entity.rating || 0) <= max;
          });
        });
      }

      if (newFilters.priceLevel.length > 0) {
        // Price level filtering would match on offer data
        // For now, keeps all results when price level is selected
      }

      setFilteredOffers(filtered);
      return newFilters;
    });
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSortBy = e.target.value;
    setSortBy(newSortBy);

    const sorted = [...filteredOffers];

    switch(newSortBy) {
      case 'discount-high':
        sorted.sort((a, b) => (b.discount?.percent ?? 0) - (a.discount?.percent ?? 0));
        break;
      case 'discount-low':
        sorted.sort((a, b) => (a.discount?.percent ?? 0) - (b.discount?.percent ?? 0));
        break;
      case 'price-high':
        sorted.sort((a, b) => (b.discount?.discountedPrice ?? 0) - (a.discount?.discountedPrice ?? 0));
        break;
      case 'price-low':
        sorted.sort((a, b) => (a.discount?.discountedPrice ?? 0) - (b.discount?.discountedPrice ?? 0));
        break;
      case 'rating':
        sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'popular':
        sorted.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
        break;
      default: // 'relevance'
        // Keep original order
        break;
    }

    setFilteredOffers(sorted);
  };

  return (
    <PageContainer>
      <Hero>
        <Container>
          <HeroContent>
            <Breadcrumb>
              <a href="/">{t('categoryListing.home')}</a>
              <span>/</span>
              <span>{t('offersPage.breadcrumb')}</span>
            </Breadcrumb>
            <Title>{t('offersPage.title')}</Title>
            <Subtitle>{t('offersPage.subtitle')}</Subtitle>
            <CTAButtonWrapper>
              <a href="/#subscription-plans" onClick={(e) => { e.preventDefault(); navigate('/#subscription-plans'); }} style={{ textDecoration: 'none' }}>
                <Button variant="golden" size="large">
                  {t('offersPage.heroCta')}
                </Button>
              </a>
              <TrustLine>{t('offersPage.heroTrustLine')}</TrustLine>
            </CTAButtonWrapper>
          </HeroContent>
        </Container>
      </Hero>

      <Container>
        <ContentWrapper>
          {/* Mobile Filter Toggle */}
          <MobileFilterToggle onClick={() => setShowMobileFilters(!showMobileFilters)}>
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {t('categoryListing.filters')}
          </MobileFilterToggle>

          <LayoutGrid>
            {/* Sidebar Filters */}
            <FilterSidebar $showMobile={showMobileFilters}>
              {/* Category */}
              <FilterGroup>
                <FilterLabel>{language === 'bg' ? 'Категория' : 'Category'}</FilterLabel>
                <FilterChipsWrapper>
                  {placesCategories.map(cat => (
                    <FilterChip
                      key={cat.id}
                      $active={activeFilters.category.includes(cat.id)}
                      onClick={() => handleCategoryToggle(cat.id)}
                    >
                      {language === 'bg' ? cat.name.bg : cat.name.en}
                    </FilterChip>
                  ))}
                </FilterChipsWrapper>
                {/* Dynamic subcategories - appear after selecting a category */}
                {placesCategories
                  .filter(cat => activeFilters.category.includes(cat.id))
                  .map(cat => (
                    <SubcategorySection
                      key={`sub-${cat.id}`}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.2 }}
                    >
                      <SubcategoryParentLabel>
                        {language === 'bg' ? cat.name.bg : cat.name.en}
                      </SubcategoryParentLabel>
                      <FilterChipsWrapper>
                        {cat.subcategories.map(sub => (
                          <FilterChip
                            key={sub.id}
                            $active={activeFilters.category.includes(sub.id)}
                            onClick={() => handleSubcategoryToggle(sub.id, cat.id)}
                          >
                            {language === 'bg' ? sub.name.bg : sub.name.en}
                          </FilterChip>
                        ))}
                      </FilterChipsWrapper>
                    </SubcategorySection>
                  ))}
              </FilterGroup>

              <FilterDivider />

              {/* Location */}
              <FilterGroup>
                <FilterLabel>{t('boomPlacesFilters.location')}</FilterLabel>
                <FilterChipsWrapper>
                  <FilterChip
                    $active={activeFilters.location.includes('nearby')}
                    onClick={() => toggleFilter('location', 'nearby')}
                  >
                    📍 {t('boomPlacesFilters.nearMe')}
                  </FilterChip>
                  {Object.entries({
                    sofia: t('boomPlacesFilters.locations.sofia'),
                    plovdiv: t('boomPlacesFilters.locations.plovdiv'),
                    varna: t('boomPlacesFilters.locations.varna'),
                    burgas: t('boomPlacesFilters.locations.burgas'),
                    bansko: t('boomPlacesFilters.locations.bansko'),
                    melnik: t('boomPlacesFilters.locations.melnik'),
                  }).map(([key, label]) => (
                    <FilterChip
                      key={key}
                      $active={activeFilters.location.includes(key)}
                      onClick={() => toggleFilter('location', key)}
                    >
                      {label}
                    </FilterChip>
                  ))}
                </FilterChipsWrapper>
              </FilterGroup>

              <FilterDivider />

              {/* Discount Range */}
              <FilterGroup>
                <FilterLabel>{t('boomPlacesFilters.discountRange')}</FilterLabel>
                <FilterChipsWrapper>
                  {Object.entries({
                    '0-5': t('boomPlacesFilters.discountRanges.range0to5'),
                    '5-10': t('boomPlacesFilters.discountRanges.range5to10'),
                    '10-15': t('boomPlacesFilters.discountRanges.range10to15'),
                    '15-20': t('boomPlacesFilters.discountRanges.range15to20'),
                  }).map(([key, label]) => (
                    <FilterChip
                      key={key}
                      $active={activeFilters.discount.includes(key)}
                      onClick={() => toggleFilter('discount', key)}
                    >
                      {label}
                    </FilterChip>
                  ))}
                </FilterChipsWrapper>
              </FilterGroup>

              <FilterDivider />

              {/* Rating */}
              <FilterGroup>
                <FilterLabel>{t('boomPlacesFilters.rating')} {t('boomPlacesFilters.ratingSource')}</FilterLabel>
                <FilterChipsWrapper>
                  {Object.entries({
                    '3.5-4.0': t('boomPlacesFilters.ratingRanges.range35to40'),
                    '4.0-4.5': t('boomPlacesFilters.ratingRanges.range40to45'),
                    '4.5-5.0': t('boomPlacesFilters.ratingRanges.range45to50'),
                  }).map(([key, label]) => (
                    <FilterChip
                      key={key}
                      $active={activeFilters.rating.includes(key)}
                      onClick={() => toggleFilter('rating', key)}
                    >
                      ⭐ {label}
                    </FilterChip>
                  ))}
                </FilterChipsWrapper>
              </FilterGroup>

              <FilterDivider />

              {/* Price Level */}
              <FilterGroup>
                <FilterLabel>{t('boomPlacesFilters.priceLevel')}</FilterLabel>
                <FilterChipsWrapper>
                  {Object.entries({
                    budget: t('boomPlacesFilters.priceLevels.budget'),
                    midRange: t('boomPlacesFilters.priceLevels.midRange'),
                    highEnd: t('boomPlacesFilters.priceLevels.highEnd'),
                  }).map(([key, label]) => (
                    <FilterChip
                      key={key}
                      $active={activeFilters.priceLevel.includes(key)}
                      onClick={() => toggleFilter('priceLevel', key)}
                    >
                      {label}
                    </FilterChip>
                  ))}
                </FilterChipsWrapper>
              </FilterGroup>
            </FilterSidebar>

            <Main>
              <ResultsHeader>
                <ResultsCount>
                  {t('offersPage.resultsTitle')}
                </ResultsCount>
                <SortSelect value={sortBy} onChange={handleSortChange}>
                  <option value="relevance">
                    {t('categoryListing.mostRelevant')}
                  </option>
                  <option value="discount">
                    {t('categoryListing.highestDiscount')}
                  </option>
                  <option value="price-low">
                    {t('categoryListing.priceLowToHigh')}
                  </option>
                  <option value="price-high">
                    {t('categoryListing.priceHighToLow')}
                  </option>
                  <option value="rating">
                    {t('categoryListing.highestRating')}
                  </option>
                </SortSelect>
              </ResultsHeader>

              {isLoading ? (
                <Loading size="large" fullScreen={false} />
              ) : filteredOffers.length > 0 ? (
                <OffersGrid>
                  {filteredOffers.map((entity, index) => (
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
                  <EmptyStateIcon>🔍</EmptyStateIcon>
                  <EmptyStateTitle>
                    {t('categoryListing.noOffersFound')}
                  </EmptyStateTitle>
                  <EmptyStateText>
                    {t('categoryListing.noOffersDescription')}
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
