import React, { useMemo, useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCategory } from '../hooks/useOffers';
import { type OfferFilters } from '../services/offers.service';
import ExperiencesFilters, { defaultExperiencesFilters, type ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

function toApiFilters(f: ExperiencesFiltersState): OfferFilters {
  const result: OfferFilters = {};
  if (f.search) result.search = f.search;
  // API accepts a single city; when multiple are selected, use the first.
  if (f.locations.length > 0) result.city = f.locations[0];
  if (f.sortBy === 'price-asc') { result.sortBy = 'price'; result.sortOrder = 'asc'; }
  else if (f.sortBy === 'price-desc') { result.sortBy = 'price'; result.sortOrder = 'desc'; }
  else if (f.sortBy === 'rating') { result.sortBy = 'rating'; result.sortOrder = 'desc'; }
  // 'duration' has no backend equivalent; proxy to 'newest' so the sort is not a no-op.
  else if (f.sortBy === 'duration') { result.sortBy = 'newest'; result.sortOrder = 'desc'; }
  // 'featured' intentionally emits no sortBy — the backend applies its default ordering.
  if (f.ratingRanges.length > 0) {
    const min = Math.min(...f.ratingRanges.map(r => parseFloat(r.split('-')[0])).filter(n => !isNaN(n)));
    if (isFinite(min)) result.minRating = min;
  }
  // Note: durations, formats, seasons, participations, priceLevels, types, availability
  // have no backend OfferFilters equivalents and are not forwarded to the API.
  return result;
}

const ExperiencesGastronomyPage: React.FC = () => {
  const [filters, setFilters] = useState<ExperiencesFiltersState>(defaultExperiencesFilters);
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const { data, isLoading, isError } = useEntitiesByCategory('gastronomic', apiFilters);
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn="Gastronomy Experiences"
      titleBg="Гастрономични Изживявания"
      subtitleEn="Culinary adventures including street food tours, wine & dine experiences, cooking classes, and farm-to-table dining"
      subtitleBg="Кулинарни приключения включващи турове на улична храна, вино и храна, готварски класове и farm-to-table хранене"
      entities={isError ? [] : entities}
      isLoading={isLoading}
      showEmptyState={isError}
      {...(isError && {
        emptyIcon: '⚠️',
        emptyTitleEn: 'Unable to load experiences',
        emptyTitleBg: 'Грешка при зареждане',
        emptyTextEn: 'Failed to load gastronomy experiences. Please try again later.',
        emptyTextBg: 'Неуспешно зареждане на гастрономични изживявания. Моля, опитайте отново.',
      })}
      filters={isError ? undefined : <ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesGastronomyPage;
