import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styled, { keyframes, css } from 'styled-components';
import { motion } from 'framer-motion';
import { MapPin, List, Map, Navigation, ImageOff } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useUserLocation } from '../contexts/LocationContext';
import { useEntities } from '../hooks/useOffers';
import MapView, { Venue } from '../components/common/MapView/MapView';
import BoomPlacesFilters, { BoomPlacesFiltersState } from '../components/common/BoomPlacesFilters';
import ExperiencesFilters, {
  defaultExperiencesFilters,
  type ExperiencesFiltersState,
} from '../components/common/ExperiencesFilters';
import { filterEntities, NEAR_ME_RADIUS_KM } from '../utils/filterEntities';
import { getCategoryName } from '../types/categories.types';
import Button from '../components/common/Button/Button';
import type { Entity } from '../types/entity.types';

const content = {
  en: {
    title: 'Nearby',
    subtitle: 'Discover exclusive deals near you',
    tabs: { places: 'Boom Places', experiences: 'Experiences' },
    viewToggle: { map: 'Map View', list: 'List View' },
    noOffers: 'No nearby offers found',
    tryWidening: 'Try clearing some filters or enable location.',
    enableLocation: 'Enable location',
    enableLocationPrompt: 'Enable location to see offers near you',
    yourLocation: 'Using your current location',
    locationDenied: 'Location denied — showing all results',
    results: (n: number) => `${n} results`,
    radiusLabel: (km: number) => `within ${km} km`,
    viewDetails: 'View Details',
  },
  bg: {
    title: 'На близо',
    subtitle: 'Открийте ексклузивни оферти близо до вас',
    tabs: { places: 'Boom места', experiences: 'Изживявания' },
    viewToggle: { map: 'Карта', list: 'Списък' },
    noOffers: 'Няма намерени близки оферти',
    tryWidening: 'Опитайте да премахнете филтри или разрешете локация.',
    enableLocation: 'Разреши локация',
    enableLocationPrompt: 'Разрешете локация, за да видите оферти близо до вас',
    yourLocation: 'Използва се вашето местоположение',
    locationDenied: 'Локацията е отказана — показване на всички резултати',
    results: (n: number) => `${n} резултата`,
    radiusLabel: (km: number) => `в радиус от ${km} км`,
    viewDetails: 'Виж детайли',
  },
};

type Tab = 'places' | 'experiences';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function entityToVenue(entity: Entity, language: 'en' | 'bg'): Venue | null {
  const coords = entity.location.coordinates;
  if (!coords) return null;
  const address =
    entity.location.address ||
    (language === 'bg' ? entity.location.displayBg : entity.location.display) ||
    entity.location.display;
  return {
    id: entity.id,
    name: entity.name[language] || entity.name.en,
    category: entity.categoryId,
    categoryLabel: entity.categoryId ? getCategoryName(entity.categoryId, language) : undefined,
    lat: coords.lat,
    lng: coords.lng,
    address,
    phone: entity.contact?.phone,
    rating: entity.rating,
    image: entity.images.hero && entity.images.hero.length > 0 ? entity.images.hero : undefined,
    discount: entity.discount?.percent,
  };
}

function applyExperiencesFilters(
  entities: Entity[],
  filters: ExperiencesFiltersState,
  language: string
): Entity[] {
  let result = [...entities];

  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(e => {
      const name = language === 'bg' ? e.name.bg : e.name.en;
      const desc = language === 'bg' ? e.description.bg : e.description.en;
      const cat = language === 'bg' ? e.category.bg : e.category.en;
      const loc = e.location.displayBg || e.location.display;
      return [name, desc, cat, loc].some(s => s.toLowerCase().includes(q));
    });
  }

  if (filters.categories.length > 0) {
    result = result.filter(
      e =>
        filters.categories.includes(e.categoryId) ||
        e.subcategoryIds?.some(s => filters.categories.includes(s))
    );
  }

  if (filters.locations.length > 0) {
    result = result.filter(
      e => e.location.city && filters.locations.includes(e.location.city)
    );
  }

  if (filters.durations.length > 0) {
    result = result.filter(
      e => e.experience && filters.durations.includes(e.experience.duration)
    );
  }

  if (filters.types.length > 0) {
    result = result.filter(
      e => e.experience && filters.types.includes(e.experience.type)
    );
  }

  if (filters.formats.length > 0) {
    result = result.filter(
      e => e.experience?.format && filters.formats.includes(e.experience.format)
    );
  }

  if (filters.seasons.length > 0) {
    result = result.filter(
      e => e.experience?.season && filters.seasons.includes(e.experience.season)
    );
  }

  if (filters.participations.length > 0) {
    result = result.filter(e => {
      if (!e.experience) return false;
      if (filters.participations.includes('group') && e.experience.type === 'group') return true;
      if (
        filters.participations.includes('individual-private') &&
        (e.experience.type === 'private' || e.experience.type === 'vip')
      ) {
        return true;
      }
      return false;
    });
  }

  if (filters.availability.length > 0) {
    result = result.filter(e => {
      const avail = e.experience?.availability;
      if (!avail) return false;
      if (typeof avail === 'string') {
        return filters.availability.includes(avail) || avail === 'always';
      }
      return true;
    });
  }

  if (filters.ratingRanges.length > 0) {
    result = result.filter(e => {
      if (!e.rating) return false;
      return filters.ratingRanges.some(range => {
        const [min, max] = range.split('-').map(Number);
        return e.rating! >= min && e.rating! <= max;
      });
    });
  }

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
      result.sort(
        (a, b) =>
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

const NearbyOffersPage: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const t = content[language as keyof typeof content];

  const { userCoords, permission, permissionChecked, requestLocation } = useUserLocation();

  // Auto-request location on first page entry, but wait for the async
  // permissions.query to resolve first — otherwise `permission` is still the
  // default 'prompt' and we'd fire getCurrentPosition against a truly-denied
  // browser state. Also gate with a ref so we only auto-request once per
  // session, even if permissionChecked re-fires.
  const didAutoRequestRef = useRef(false);
  useEffect(() => {
    if (!permissionChecked) return;
    if (didAutoRequestRef.current) return;
    if (userCoords) return;
    if (permission === 'denied') return;
    didAutoRequestRef.current = true;
    requestLocation();
  }, [permissionChecked, permission, userCoords, requestLocation]);

  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const urlView = searchParams.get('view');
  const initialTab: Tab = urlTab === 'experiences' ? 'experiences' : 'places';
  const initialView: 'map' | 'list' = urlView === 'list' ? 'list' : 'map';

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [viewMode, setViewMode] = useState<'map' | 'list'>(initialView);

  // Clean unknown ?tab= / ?view= values from the URL on mount so the state we
  // chose is consistent with what the address bar shows.
  const didCleanUrlRef = useRef(false);
  useEffect(() => {
    if (didCleanUrlRef.current) return;
    didCleanUrlRef.current = true;
    const next = new URLSearchParams(searchParams);
    let changed = false;
    if (urlTab && urlTab !== 'places' && urlTab !== 'experiences') {
      next.delete('tab');
      changed = true;
    }
    if (urlView && urlView !== 'map' && urlView !== 'list') {
      next.delete('view');
      changed = true;
    }
    if (changed) setSearchParams(next, { replace: true });
  }, [urlTab, urlView, searchParams, setSearchParams]);

  const updateTab = (tab: Tab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'places') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const updateView = (mode: 'map' | 'list') => {
    setViewMode(mode);
    const next = new URLSearchParams(searchParams);
    if (mode === 'map') next.delete('view');
    else next.set('view', mode);
    setSearchParams(next, { replace: true });
  };

  const [placesFilters, setPlacesFilters] = useState<BoomPlacesFiltersState>({
    categories: [],
    locations: [],
    nearMe: true,
    discountRanges: [],
    ratingRanges: [],
    priceLevels: [],
  });

  const [experiencesFilters, setExperiencesFilters] = useState<ExperiencesFiltersState>(
    defaultExperiencesFilters
  );

  const { data, isLoading } = useEntities({ limit: 200 });
  const entities = useMemo(() => data?.data ?? [], [data]);

  const places = useMemo(
    () => entities.filter(e => e.kind !== 'experience' && !e.experience),
    [entities]
  );
  const experiences = useMemo(
    () => entities.filter(e => e.kind === 'experience' || !!e.experience),
    [entities]
  );

  // filterEntities already applies the `nearMe` radius filter when coords are present,
  // so we only add a distance sort on top (not a second radius filter).
  const filteredPlaces = useMemo(() => {
    const result = filterEntities(places, placesFilters, userCoords);
    if (!userCoords) return result;
    return [...result].sort((a, b) => {
      const da = a.location.coordinates
        ? haversineKm(userCoords.lat, userCoords.lng, a.location.coordinates.lat, a.location.coordinates.lng)
        : Infinity;
      const db = b.location.coordinates
        ? haversineKm(userCoords.lat, userCoords.lng, b.location.coordinates.lat, b.location.coordinates.lng)
        : Infinity;
      return da - db;
    });
  }, [places, placesFilters, userCoords]);

  const filteredExperiences = useMemo(() => {
    let result = applyExperiencesFilters(experiences, experiencesFilters, language);
    if (userCoords) {
      result = result.filter(e => {
        const c = e.location.coordinates;
        if (!c) return false;
        return haversineKm(userCoords.lat, userCoords.lng, c.lat, c.lng) <= NEAR_ME_RADIUS_KM;
      });
      result = [...result].sort((a, b) => {
        const da = a.location.coordinates
          ? haversineKm(userCoords.lat, userCoords.lng, a.location.coordinates.lat, a.location.coordinates.lng)
          : Infinity;
        const db = b.location.coordinates
          ? haversineKm(userCoords.lat, userCoords.lng, b.location.coordinates.lat, b.location.coordinates.lng)
          : Infinity;
        return da - db;
      });
    }
    return result;
  }, [experiences, experiencesFilters, language, userCoords]);

  const activeEntities = activeTab === 'places' ? filteredPlaces : filteredExperiences;

  const venues = useMemo(
    () =>
      activeEntities
        .map(e => entityToVenue(e, language as 'en' | 'bg'))
        .filter((v): v is Venue => v !== null),
    [activeEntities, language]
  );

  const handleVenueClick = (venue: Venue) => {
    const entity = activeEntities.find(e => e.id === venue.id);
    if (entity?.path) {
      navigate(entity.path);
    } else {
      navigate(`/offers/${venue.id}`);
    }
  };

  const mapCenter = userCoords ?? undefined;

  return (
    <Container>
      <Header>
        <HeaderContent>
          <div>
            <Title>{t.title}</Title>
            <Subtitle>{t.subtitle}</Subtitle>
          </div>

          <ViewToggle>
            <ToggleButton $active={viewMode === 'map'} onClick={() => updateView('map')}>
              <Map size={18} />
              {t.viewToggle.map}
            </ToggleButton>
            <ToggleButton $active={viewMode === 'list'} onClick={() => updateView('list')}>
              <List size={18} />
              {t.viewToggle.list}
            </ToggleButton>
          </ViewToggle>
        </HeaderContent>

        {permissionChecked && (userCoords || permission === 'denied' || permission === 'prompt') && (
          <LocationBanner>
            <Navigation size={16} />
            {userCoords ? (
              <span>{t.yourLocation} · {t.radiusLabel(NEAR_ME_RADIUS_KM)}</span>
            ) : permission === 'denied' ? (
              <span>{t.locationDenied}</span>
            ) : (
              <>
                <span>{t.enableLocationPrompt}</span>
                <Button variant="ghost" size="small" onClick={requestLocation}>
                  {t.enableLocation}
                </Button>
              </>
            )}
          </LocationBanner>
        )}

        <Tabs role="tablist">
          <TabButton
            role="tab"
            aria-selected={activeTab === 'places'}
            $active={activeTab === 'places'}
            onClick={() => updateTab('places')}
          >
            {t.tabs.places}
          </TabButton>
          <TabButton
            role="tab"
            aria-selected={activeTab === 'experiences'}
            $active={activeTab === 'experiences'}
            onClick={() => updateTab('experiences')}
          >
            {t.tabs.experiences}
          </TabButton>
        </Tabs>
      </Header>

      <FiltersSection>
        {activeTab === 'places' ? (
          <BoomPlacesFilters filters={placesFilters} onChange={setPlacesFilters} />
        ) : (
          <ExperiencesFilters filters={experiencesFilters} onChange={setExperiencesFilters} />
        )}
      </FiltersSection>

      <ResultCount>{isLoading ? '…' : t.results(activeEntities.length)}</ResultCount>

      {viewMode === 'map' ? (
        <MapView
          venues={venues}
          onVenueClick={handleVenueClick}
          initialCenter={mapCenter}
          height="600px"
        />
      ) : (
        <ListView>
          {isLoading ? (
            <VenuesGrid>
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i}>
                  <SkeletonImage />
                  <SkeletonBody>
                    <SkeletonLine $w="70%" />
                    <SkeletonLine $w="45%" />
                    <SkeletonLine $w="30%" />
                  </SkeletonBody>
                </SkeletonCard>
              ))}
            </VenuesGrid>
          ) : activeEntities.length === 0 ? (
            <EmptyState>
              <EmptyIcon>
                <MapPin size={48} />
              </EmptyIcon>
              <EmptyTitle>{t.noOffers}</EmptyTitle>
              <EmptyText>{t.tryWidening}</EmptyText>
            </EmptyState>
          ) : (
            <VenuesGrid>
              {activeEntities.map((entity, index) => {
                const distKm =
                  userCoords && entity.location.coordinates
                    ? haversineKm(
                        userCoords.lat,
                        userCoords.lng,
                        entity.location.coordinates.lat,
                        entity.location.coordinates.lng
                      )
                    : null;
                return (
                  <VenueCard
                    key={entity.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index, 12) * 0.05 }}
                    onClick={() => navigate(entity.path || `/offers/${entity.id}`)}
                  >
                    <VenueImageContainer>
                      <VenueHeroImage
                        src={entity.images.hero}
                        alt={entity.name[language] || entity.name.en}
                      />
                      {entity.discount?.percent ? (
                        <DiscountBadge>{entity.discount.percent}% OFF</DiscountBadge>
                      ) : null}
                    </VenueImageContainer>

                    <VenueContent>
                      <VenueHeader>
                        <VenueName>{entity.name[language] || entity.name.en}</VenueName>
                        {entity.rating != null && (
                          <VenueRating>⭐ {entity.rating.toFixed(1)}</VenueRating>
                        )}
                      </VenueHeader>

                      <VenueAddress>
                        <MapPin size={14} />
                        {language === 'bg'
                          ? entity.location.displayBg || entity.location.display
                          : entity.location.display}
                      </VenueAddress>

                      {distKm != null && (
                        <VenueDistance>
                          {distKm.toFixed(1)} km
                        </VenueDistance>
                      )}

                      <VenueAction>
                        <Button variant="primary" size="small">
                          {t.viewDetails}
                        </Button>
                      </VenueAction>
                    </VenueContent>
                  </VenueCard>
                );
              })}
            </VenuesGrid>
          )}
        </ListView>
      )}
    </Container>
  );
};

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
`;

const Header = styled.div`
  margin-bottom: 2rem;
`;

const HeaderContent = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 2rem;
  margin-bottom: 1rem;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 0.5rem 0;
`;

const Subtitle = styled.p`
  font-size: 1.125rem;
  color: var(--text-secondary);
  margin: 0;
`;

const ViewToggle = styled.div`
  display: flex;
  gap: 0.5rem;
  background: white;
  padding: 0.25rem;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  [data-theme="dark"] & {
    background: #1f2937;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
`;

const ToggleButton = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.375rem;
  background: ${props => (props.$active ? 'var(--primary)' : 'transparent')};
  color: ${props => (props.$active ? 'white' : 'var(--text-secondary)')};
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${props => (props.$active ? 'var(--primary)' : 'var(--gray-100)')};

    [data-theme="dark"] & {
      background: ${props => (props.$active ? 'var(--primary)' : '#374151')};
    }
  }
`;

const LocationBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.875rem;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  margin-bottom: 1rem;

  [data-theme="dark"] & {
    background: rgba(16, 185, 129, 0.1);
    border-color: rgba(16, 185, 129, 0.3);
    color: #6ee7b7;
  }
`;

const Tabs = styled.div`
  display: flex;
  gap: 0.5rem;
  border-bottom: 2px solid #e5e7eb;

  [data-theme="dark"] & {
    border-bottom-color: #374151;
  }
`;

const TabButton = styled.button<{ $active: boolean }>`
  padding: 0.75rem 1.25rem;
  border: none;
  background: transparent;
  color: ${props => (props.$active ? 'var(--text-primary)' : 'var(--text-secondary)')};
  font-size: 1rem;
  font-weight: ${props => (props.$active ? 700 : 500)};
  cursor: pointer;
  border-bottom: 3px solid ${props => (props.$active ? '#000000' : 'transparent')};
  margin-bottom: -2px;
  transition: all 0.2s;

  [data-theme="dark"] & {
    border-bottom-color: ${props => (props.$active ? '#f9fafb' : 'transparent')};
  }

  &:hover {
    color: var(--text-primary);
  }
`;

const FiltersSection = styled.div`
  margin-bottom: 1.5rem;
`;

const ResultCount = styled.p`
  font-size: 0.9375rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
`;

const ListView = styled.div`
  margin-top: 1rem;
`;

const VenuesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
`;

const VenueCard = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.3s;

  [data-theme="dark"] & {
    background: #1f2937;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  &:hover {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    transform: translateY(-4px);
  }
`;

const VenueImageContainer = styled.div`
  position: relative;
  width: 100%;
  height: 200px;
  overflow: hidden;
`;

const VenueImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;

  ${VenueCard}:hover & {
    transform: scale(1.05);
  }
`;

const VenueImagePlaceholder = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
  color: #9ca3af;

  [data-theme="dark"] & {
    background: linear-gradient(135deg, #4b5563 0%, #374151 100%);
    color: #9ca3af;
  }
`;

const VenueHeroImage: React.FC<{ src?: string; alt: string }> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <VenueImagePlaceholder role="img" aria-label={alt}>
        <ImageOff size={32} aria-hidden="true" />
      </VenueImagePlaceholder>
    );
  }
  return <VenueImage src={src} alt={alt} onError={() => setFailed(true)} />;
};

const DiscountBadge = styled.div`
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: var(--success);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 2rem;
  font-weight: 700;
  font-size: 0.875rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
`;

const VenueContent = styled.div`
  padding: 1.25rem;
`;

const VenueHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 0.75rem;
`;

const VenueName = styled.h3`
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  flex: 1;
`;

const VenueRating = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  margin-left: 0.5rem;
`;

const VenueAddress = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;

  svg {
    flex-shrink: 0;
  }
`;

const VenueDistance = styled.div`
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--success);
  margin-bottom: 0.75rem;
`;

const VenueAction = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 2rem;
`;

const EmptyIcon = styled.div`
  color: var(--text-secondary);
  margin-bottom: 1rem;
`;

const EmptyTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
`;

const EmptyText = styled.p`
  color: var(--text-secondary);
  font-size: 1.125rem;
`;

const shimmer = keyframes`
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
`;

const shimmerAnimation = css`
  @media (prefers-reduced-motion: no-preference) {
    animation: ${shimmer} 1.4s linear infinite;
  }
`;

const SkeletonCard = styled.div`
  background: white;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

  [data-theme="dark"] & {
    background: #1f2937;
  }
`;

const SkeletonImage = styled.div`
  width: 100%;
  height: 200px;
  background: linear-gradient(90deg, #e5e7eb 0%, #f3f4f6 50%, #e5e7eb 100%);
  background-size: 800px 100%;
  ${shimmerAnimation}

  [data-theme="dark"] & {
    background: linear-gradient(90deg, #374151 0%, #4b5563 50%, #374151 100%);
    background-size: 800px 100%;
  }
`;

const SkeletonBody = styled.div`
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
`;

const SkeletonLine = styled.div<{ $w: string }>`
  height: 0.75rem;
  width: ${props => props.$w};
  border-radius: 0.25rem;
  background: linear-gradient(90deg, #e5e7eb 0%, #f3f4f6 50%, #e5e7eb 100%);
  background-size: 800px 100%;
  ${shimmerAnimation}

  [data-theme="dark"] & {
    background: linear-gradient(90deg, #374151 0%, #4b5563 50%, #374151 100%);
    background-size: 800px 100%;
  }
`;

export default NearbyOffersPage;
