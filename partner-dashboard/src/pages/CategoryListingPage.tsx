import React, { useState, useMemo, useEffect } from 'react';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import GenericPage from '../components/templates/GenericPage';
import { useEntities } from '../hooks/useOffers';
import BoomPlacesFilters, { BoomPlacesFiltersState } from '../components/common/BoomPlacesFilters';
import { filterEntities } from '../utils/filterEntities';

const SortRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 0.75rem;
`;

const ResultsCount = styled.p`
  font-size: 0.9375rem;
  color: var(--color-text-secondary, #6b7280);
`;

const SortSelect = styled.select`
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: var(--color-text-primary, #374151);
  background: var(--color-background, white);
  cursor: pointer;
  font-family: inherit;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
    color: #d1d5db;
  }
`;

type SortKey = 'relevance' | 'discount-high' | 'price-low' | 'price-high' | 'rating';

function sortEntities(entities: ReturnType<typeof filterEntities>, sortBy: SortKey) {
  const arr = [...entities];
  switch (sortBy) {
    case 'discount-high':
      return arr.sort((a, b) => (b.discount?.percent ?? 0) - (a.discount?.percent ?? 0));
    case 'price-low':
      return arr.sort((a, b) => (a.discount?.discountedPrice ?? 0) - (b.discount?.discountedPrice ?? 0));
    case 'price-high':
      return arr.sort((a, b) => (b.discount?.discountedPrice ?? 0) - (a.discount?.discountedPrice ?? 0));
    case 'rating':
      return arr.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    default:
      return arr;
  }
}

const CategoryListingPage: React.FC = () => {
  const { language } = useLanguage();
  const { data, isLoading } = useEntities();
  const entities = data?.data || [];

  const [filters, setFilters] = useState<BoomPlacesFiltersState>({
    categories: [],
    locations: [],
    nearMe: false,
    discountRanges: [],
    ratingRanges: [],
    priceLevels: [],
  });

  const [sortBy, setSortBy] = useState<SortKey>('relevance');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | undefined>();

  // Request geolocation when nearMe is toggled on; clear when toggled off
  useEffect(() => {
    if (!filters.nearMe) {
      setUserCoords(undefined);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setFilters(prev => ({ ...prev, nearMe: false }))
    );
  }, [filters.nearMe]);

  const filteredEntities = useMemo(
    () => filterEntities(entities, filters, userCoords),
    [entities, filters, userCoords]
  );

  const sortedEntities = useMemo(
    () => sortEntities(filteredEntities, sortBy),
    [filteredEntities, sortBy]
  );

  const sortRow = (
    <SortRow>
      <ResultsCount>
        {language === 'bg'
          ? `${sortedEntities.length} места`
          : `${sortedEntities.length} places`}
      </ResultsCount>
      <SortSelect value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)}>
        <option value="relevance">{language === 'bg' ? 'Най-подходящи' : 'Most Relevant'}</option>
        <option value="discount-high">{language === 'bg' ? 'Най-висока отстъпка' : 'Highest Discount'}</option>
        <option value="price-low">{language === 'bg' ? 'Цена: ниска към висока' : 'Price: Low to High'}</option>
        <option value="price-high">{language === 'bg' ? 'Цена: висока към ниска' : 'Price: High to Low'}</option>
        <option value="rating">{language === 'bg' ? 'Най-висок рейтинг' : 'Highest Rating'}</option>
      </SortSelect>
    </SortRow>
  );

  return (
    <GenericPage
      titleEn="All BOOM Discounts in One Place"
      titleBg="Всички BOOM отстъпки на едно място"
      subtitleEn="BOOM Card gives you access to exclusive offers with up to 20% cashback, based on your chosen plan."
      subtitleBg="BOOM Card ти дава достъп до ексклузивни отстъпки с до 20% кешбек, според избрания от теб план."
      entities={sortedEntities}
      isLoading={isLoading}
      filters={<BoomPlacesFilters filters={filters} onChange={setFilters} />}
      backgroundImage="https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1920&q=80"
    >
      {sortRow}
    </GenericPage>
  );
};

export default CategoryListingPage;
