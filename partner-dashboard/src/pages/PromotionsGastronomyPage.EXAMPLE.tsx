/**
 * EXAMPLE: PromotionsGastronomyPage with Real API Integration
 *
 * This is an example showing how to convert a page from mock data to real API data.
 * Copy this pattern to update other pages.
 */

import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';
import { OfferFilters } from '../services/offers.service';
import Loading from '../components/common/Loading/Loading';
import styled from 'styled-components';

// Styled components for filters
const FilterBar = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
`;

const FilterSelect = styled.select`
  padding: 0.5rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: white;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #000000;
  }
`;

const FilterInput = styled.input`
  padding: 0.5rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  min-width: 200px;

  &:focus {
    outline: none;
    border-color: #000000;
  }
`;

const ErrorMessage = styled.div`
  padding: 2rem;
  text-align: center;
  color: #ef4444;
  background: #fee2e2;
  border-radius: 0.5rem;
  margin: 2rem 0;
`;

const PromotionsGastronomyPageExample: React.FC = () => {
  // State for filters
  const [filters, setFilters] = useState<OfferFilters>({
    page: 1,
    limit: 12,
    sortBy: 'discount',
    sortOrder: 'desc',
  });

  // Fetch data using the custom hook
  const { data, isLoading, error, refetch } = useOffersByCategory('gastronomy', filters);

  // Convert API data to Offer format for OfferCard component
  const offers = data?.data.map(apiOffer => ({
    id: apiOffer.id,
    title: apiOffer.title,
    titleBg: apiOffer.titleBg,
    description: apiOffer.description,
    descriptionBg: apiOffer.descriptionBg,
    discount: apiOffer.discount,
    originalPrice: apiOffer.originalPrice,
    discountedPrice: apiOffer.discountedPrice,
    category: apiOffer.category,
    categoryBg: apiOffer.categoryBg,
    location: apiOffer.location,
    imageUrl: apiOffer.imageUrl,
    partnerName: apiOffer.partnerName || 'Partner',
    path: `/offers/${apiOffer.id}`,
    rating: apiOffer.rating,
    reviewCount: apiOffer.reviewCount,
  })) || [];

  // Handle filter changes
  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, sortBy: e.target.value as any }));
  };

  const handleMinDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    setFilters(prev => ({ ...prev, minDiscount: value }));
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, search: e.target.value }));
  };

  // Show loading state
  if (isLoading) {
    return (
      <GenericPage
        titleEn="Gastronomy Promotions"
        titleBg="Гастрономични Промоции"
        subtitleEn="Loading delicious food experiences..."
        subtitleBg="Зареждане на вкусни кулинарни изживявания..."
      >
        <Loading />
      </GenericPage>
    );
  }

  // Show error state
  if (error) {
    return (
      <GenericPage
        titleEn="Gastronomy Promotions"
        titleBg="Гастрономични Промоции"
        subtitleEn="Culinary experiences including street food tours, wine & dine events, cooking classes"
        subtitleBg="Кулинарни изживявания включващи турове на улична храна, вино и храна, готварски класове"
      >
        <ErrorMessage>
          <h3>Failed to load offers</h3>
          <p>{(error as Error).message}</p>
          <button onClick={() => refetch()}>Try Again</button>
        </ErrorMessage>
      </GenericPage>
    );
  }

  return (
    <GenericPage
      titleEn="Gastronomy Promotions"
      titleBg="Гастрономични Промоции"
      subtitleEn="Culinary experiences including street food tours, wine & dine events, cooking classes, and farm-to-table dining"
      subtitleBg="Кулинарни изживявания включващи турове на улична храна, вино и храна, готварски класове и farm-to-table ресторанти"
      offers={offers}
    >
      {/* Filter Bar */}
      <FilterBar>
        <FilterInput
          type="text"
          placeholder="Search offers..."
          onChange={handleSearchChange}
          value={filters.search || ''}
        />

        <FilterSelect onChange={handleSortChange} value={filters.sortBy}>
          <option value="discount">Highest Discount</option>
          <option value="price">Lowest Price</option>
          <option value="rating">Highest Rating</option>
          <option value="newest">Newest First</option>
        </FilterSelect>

        <FilterInput
          type="number"
          placeholder="Min Discount %"
          min="0"
          max="100"
          onChange={handleMinDiscountChange}
          value={filters.minDiscount || ''}
        />
      </FilterBar>

      {/* Pagination info */}
      {data && (
        <div style={{ marginTop: '2rem', textAlign: 'center', color: '#6b7280' }}>
          Showing {offers.length} of {data.total} offers (Page {data.page} of {data.totalPages})
        </div>
      )}
    </GenericPage>
  );
};

export default PromotionsGastronomyPageExample;

/**
 * HOW TO USE THIS PATTERN:
 *
 * 1. Import the appropriate hook:
 *    - useOffersByCategory for category pages
 *    - useOffersByCity for city pages
 *    - useOffers for general listing
 *
 * 2. Set up filters state:
 *    const [filters, setFilters] = useState<OfferFilters>({ ... });
 *
 * 3. Use the hook with filters:
 *    const { data, isLoading, error } = useOffersByCategory('category', filters);
 *
 * 4. Map API data to component format:
 *    const offers = data?.data.map(apiOffer => ({ ...convert fields... }));
 *
 * 5. Handle loading and error states
 *
 * 6. Pass offers to GenericPage component
 *
 * 7. Add filters/search UI as needed
 */
