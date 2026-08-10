import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import { useEntities } from '../hooks/useOffers';
import ExperiencesFilters, {
  defaultExperiencesFilters,
  type ExperiencesFiltersState,
} from '../components/common/ExperiencesFilters';
import OfferCard from '../components/common/OfferCard/OfferCard';
import Button from '../components/common/Button/Button';
import BookingModal from '../components/common/BookingModal/BookingModal';
import ClientCTA from '../components/common/ClientCTA/ClientCTA';
import type { Entity, CardEntity } from '../types/entity.types';

// ── Styled Components ──────────────────────────────────────

const PageContainer = styled.div`
  min-height: 100vh;
  background: #f9fafb;

  [data-theme="dark"] & {
    background: #0a0a0a;
  }
`;

const Hero = styled.div`
  background-image: url('https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=1920&q=80');
  background-size: cover;
  background-position: center;
  color: white;
  padding: 8rem 0 6rem;
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

  @keyframes heroGradientFlow {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  @media (max-width: 768px) {
    padding: 5rem 0 3rem;
    min-height: 360px;
  }
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1.5rem;
  position: relative;
  z-index: 1;
  width: 100%;
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
    font-size: 2.25rem;
  }
`;

const Subtitle = styled.p`
  font-size: 1.125rem;
  opacity: 0.9;
  margin-bottom: 2rem;
  line-height: 1.6;
`;

const HelperText = styled.p`
  font-size: 0.875rem;
  opacity: 0.75;
  margin-top: 0.75rem;
`;

const ContentSection = styled.div`
  padding: 3rem 0;
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

const MainContent = styled.main`
  min-height: 60vh;
`;

const ResultsHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 0.75rem;
`;

const ResultCount = styled.p`
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary, #111827);
`;

const ExperiencesGrid = styled.div`
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
  color: var(--color-text-secondary, #6b7280);
`;

const EmptyIcon = styled.div`
  font-size: 3rem;
  margin-bottom: 1rem;
`;

const EmptyTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-primary, #111827);
  margin-bottom: 0.5rem;
`;

const EmptyText = styled.p`
  font-size: 0.9375rem;
  margin-bottom: 1.5rem;
`;

// ── Filter Logic ───────────────────────────────────────────

function applyFilters(entities: Entity[], filters: ExperiencesFiltersState, searchLang: string): Entity[] {
  let result = [...entities];

  // Search
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(e => {
      const name = searchLang === 'bg' ? e.name.bg : e.name.en;
      const desc = searchLang === 'bg' ? e.description.bg : e.description.en;
      const cat = searchLang === 'bg' ? e.category.bg : e.category.en;
      const loc = e.location.displayBg || e.location.display;
      return [name, desc, cat, loc].some(s => s.toLowerCase().includes(q));
    });
  }

  // Categories
  if (filters.categories.length > 0) {
    result = result.filter(e =>
      filters.categories.includes(e.categoryId) ||
      e.subcategoryIds?.some(s => filters.categories.includes(s))
    );
  }

  // Locations
  if (filters.locations.length > 0) {
    result = result.filter(e =>
      e.location.city && filters.locations.includes(e.location.city)
    );
  }

  // Durations — entities without experience data pass through
  if (filters.durations.length > 0) {
    result = result.filter(e =>
      !e.experience || filters.durations.includes(e.experience.duration)
    );
  }

  // Types (group/private/vip) — entities without experience data pass through
  if (filters.types.length > 0) {
    result = result.filter(e =>
      !e.experience || filters.types.includes(e.experience.type)
    );
  }

  // Availability — entities without experience data pass through
  if (filters.availability.length > 0) {
    result = result.filter(e => {
      if (!e.experience?.availability) return true;
      const avail = e.experience.availability;
      if (typeof avail === 'string') {
        return filters.availability.includes(avail) || avail === 'always';
      }
      return true;
    });
  }

  // Formats — entities without experience data pass through
  if (filters.formats.length > 0) {
    result = result.filter(e =>
      !e.experience?.format || filters.formats.includes(e.experience.format)
    );
  }

  // Seasons — entities without experience data pass through
  if (filters.seasons.length > 0) {
    result = result.filter(e =>
      !e.experience?.season || filters.seasons.includes(e.experience.season)
    );
  }

  // Participations (mapped to experience type) — entities without experience data pass through
  if (filters.participations.length > 0) {
    result = result.filter(e => {
      if (!e.experience) return true;
      if (filters.participations.includes('group') && e.experience.type === 'group') return true;
      if (filters.participations.includes('individual-private') &&
        (e.experience.type === 'private' || e.experience.type === 'vip')) return true;
      return false;
    });
  }

  // Rating ranges
  if (filters.ratingRanges.length > 0) {
    result = result.filter(e => {
      if (!e.rating) return false;
      return filters.ratingRanges.some(range => {
        const [min, max] = range.split('-').map(Number);
        return e.rating! >= min && e.rating! <= max;
      });
    });
  }

  // Price levels
  if (filters.priceLevels.length > 0) {
    result = result.filter(e => {
      const price = e.experience?.price ?? e.discount?.originalPrice ?? 0;
      return filters.priceLevels.some(level => {
        if (level === 'budget') return price < 60;
        if (level === 'mid-range') return price >= 60 && price < 150;
        if (level === 'high-end') return price >= 150;
        return false;
      });
    });
  }

  // Sort
  switch (filters.sortBy) {
    case 'price-asc':
      result.sort((a, b) => (a.experience?.price ?? 0) - (b.experience?.price ?? 0));
      break;
    case 'price-desc':
      result.sort((a, b) => (b.experience?.price ?? 0) - (a.experience?.price ?? 0));
      break;
    case 'rating':
      result.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      break;
    case 'duration': {
      const durationOrder: Record<string, number> = {
        'up-to-2h': 1, '2-4h': 2, 'half-day': 3, 'full-day': 4, 'multi-day': 5,
      };
      result.sort((a, b) =>
        (durationOrder[a.experience?.duration ?? ''] ?? 0) -
        (durationOrder[b.experience?.duration ?? ''] ?? 0)
      );
      break;
    }
    case 'featured':
    default:
      result.sort((a, b) => {
        if (a.isFeatured && !b.isFeatured) return -1;
        if (!a.isFeatured && b.isFeatured) return 1;
        return (b.rating ?? 0) - (a.rating ?? 0);
      });
  }

  return result;
}

// ── Page Component ─────────────────────────────────────────

const ExperiencesPage: React.FC = () => {
  const { language } = useLanguage();
  const navigate = useNavigate();

  // Filters
  const [filters, setFilters] = useState<ExperiencesFiltersState>(defaultExperiencesFilters);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Booking modal
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  // Fetch from API
  const { data: apiData, isLoading, isError, refetch } = useEntities({ limit: 100 });

  const sourceEntities = useMemo(() => apiData?.data ?? [], [apiData]);

  // Apply client-side filters
  const filteredEntities = useMemo(
    () => applyFilters(sourceEntities, filters, language),
    [sourceEntities, filters, language]
  );

  const handleBookClick = (entity: Entity | CardEntity) => {
    setSelectedEntity(entity as Entity);
    setIsBookingOpen(true);
  };

  const t = language === 'bg' ? {
    title: 'Изживявания, които си струват.',
    subtitle: 'Открийте уникални преживявания и дейности от нашите партньори. Спестете с BOOM Card.',
    cta: 'Резервирай с BOOM Card',
    helper: '24 часа безплатен пробен период. Без ангажимент.',
    results: (n: number) => `${n} изживявания намерени`,
    emptyTitle: 'Няма намерени резултати',
    emptyText: 'Опитайте с различни филтри.',
    clearFilters: 'Изчисти филтрите',
  } : {
    title: 'Experiences Worth Having.',
    subtitle: 'Discover unique experiences and activities from our partners. Save with BOOM Card.',
    cta: 'Book with BOOM Card',
    helper: '24-hour free trial. No commitment.',
    results: (n: number) => `${n} experiences found`,
    emptyTitle: 'No results found',
    emptyText: 'Try adjusting your filters.',
    clearFilters: 'Clear filters',
  };

  return (
    <PageContainer>
      {/* Hero */}
      <Hero>
        <Container>
          <HeroContent>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Title>{t.title}</Title>
              <Subtitle>{t.subtitle}</Subtitle>
              <a
                href="/#subscription-plans"
                onClick={(e) => { e.preventDefault(); navigate('/#subscription-plans'); }}
                style={{ textDecoration: 'none' }}
              >
                <Button variant="golden" size="large">
                  {t.cta}
                </Button>
              </a>
              <HelperText>{t.helper}</HelperText>
            </motion.div>
          </HeroContent>
        </Container>
      </Hero>

      {/* Content */}
      <ContentSection>
        <Container>
          {/* Mobile filter toggle */}
          <MobileFilterToggle
            onClick={() => setShowMobileFilters(v => !v)}
            aria-expanded={showMobileFilters}
            aria-controls="experiences-filter-sidebar"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {language === 'bg' ? 'Филтри' : 'Filters'}
          </MobileFilterToggle>

          <LayoutGrid>
            {/* Sidebar Filters */}
            <FilterSidebar id="experiences-filter-sidebar" $showMobile={showMobileFilters}>
              <ExperiencesFilters filters={filters} onChange={setFilters} sidebar />
            </FilterSidebar>

            {/* Results */}
            <MainContent>
              {isLoading && (
                <div style={{ textAlign: 'center', padding: '4rem' }}>
                  {language === 'bg' ? 'Зареждане...' : 'Loading...'}
                </div>
              )}

              {!isLoading && isError && (
                <EmptyState>
                  <EmptyIcon>⚠️</EmptyIcon>
                  <EmptyTitle>
                    {language === 'bg' ? 'Грешка при зареждане' : 'Failed to load experiences'}
                  </EmptyTitle>
                  <EmptyText>
                    {language === 'bg' ? 'Моля, опитайте отново.' : 'Please try again.'}
                  </EmptyText>
                  <Button variant="ghost" size="small" onClick={() => refetch()}>
                    {language === 'bg' ? 'Опитай отново' : 'Try again'}
                  </Button>
                </EmptyState>
              )}

              {!isLoading && !isError && sourceEntities.length === 0 && (
                <EmptyState>
                  <EmptyIcon>🌟</EmptyIcon>
                  <EmptyTitle>
                    {language === 'bg' ? 'Няма налични изживявания' : 'No experiences available'}
                  </EmptyTitle>
                  <EmptyText>
                    {language === 'bg' ? 'Разгледайте нашите отстъпки и локации.' : 'Browse our offers and locations.'}
                  </EmptyText>
                  <Button variant="ghost" size="small" onClick={() => navigate('/offers')}>
                    {language === 'bg' ? 'Разгледай отстъпки' : 'Browse offers'}
                  </Button>
                </EmptyState>
              )}

              {!isLoading && !isError && sourceEntities.length > 0 && (
                <>
                  <ResultsHeader>
                    <ResultCount>{t.results(filteredEntities.length)}</ResultCount>
                  </ResultsHeader>

                  {filteredEntities.length > 0 ? (
                    <ExperiencesGrid>
                      {filteredEntities.map((entity, index) => (
                        <motion.div
                          key={entity.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: index * 0.08 }}
                        >
                          <OfferCard
                            entity={entity}
                            onBookClick={handleBookClick}
                          />
                        </motion.div>
                      ))}
                    </ExperiencesGrid>
                  ) : (
                    <EmptyState>
                      <EmptyIcon>🔍</EmptyIcon>
                      <EmptyTitle>{t.emptyTitle}</EmptyTitle>
                      <EmptyText>{t.emptyText}</EmptyText>
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => setFilters(defaultExperiencesFilters)}
                      >
                        {t.clearFilters}
                      </Button>
                    </EmptyState>
                  )}
                </>
              )}
            </MainContent>
          </LayoutGrid>
        </Container>
      </ContentSection>

      <ClientCTA />

      {/* Booking Modal */}
      {selectedEntity && (
        <BookingModal
          entity={selectedEntity}
          isOpen={isBookingOpen}
          onClose={() => {
            setIsBookingOpen(false);
            setSelectedEntity(null);
          }}
        />
      )}
    </PageContainer>
  );
};

export default ExperiencesPage;
