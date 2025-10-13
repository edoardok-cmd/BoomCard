import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { useLanguage } from '../contexts/LanguageContext';
import MapView, { Venue } from '../components/common/MapView/MapView';
import { MapPin, List, Map, SlidersHorizontal } from 'lucide-react';
import Button from '../components/common/Button/Button';
import Badge from '../components/common/Badge/Badge';

const content = {
  en: {
    title: 'Nearby Offers',
    subtitle: 'Discover exclusive deals near you',
    viewToggle: {
      map: 'Map View',
      list: 'List View',
    },
    filters: {
      all: 'All Categories',
      restaurants: 'Restaurants',
      hotels: 'Hotels',
      spas: 'Spas',
      entertainment: 'Entertainment',
      sports: 'Sports',
      beauty: 'Beauty',
      shopping: 'Shopping',
      travel: 'Travel',
    },
    distance: {
      nearby: 'Nearby',
      km: 'km away',
    },
    sort: {
      distance: 'Distance',
      discount: 'Discount',
      rating: 'Rating',
      name: 'Name',
    },
    noOffers: 'No nearby offers found',
    enableLocation: 'Enable location to find offers near you',
    openNow: 'Open Now',
    closed: 'Closed',
    viewDetails: 'View Details',
  },
  bg: {
    title: 'Близки Оферти',
    subtitle: 'Открийте ексклузивни оферти близо до вас',
    viewToggle: {
      map: 'Карта',
      list: 'Списък',
    },
    filters: {
      all: 'Всички Категории',
      restaurants: 'Ресторанти',
      hotels: 'Хотели',
      spas: 'СПА',
      entertainment: 'Забавления',
      sports: 'Спорт',
      beauty: 'Красота',
      shopping: 'Пазаруване',
      travel: 'Пътувания',
    },
    distance: {
      nearby: 'Наблизо',
      km: 'км разстояние',
    },
    sort: {
      distance: 'Разстояние',
      discount: 'Отстъпка',
      rating: 'Рейтинг',
      name: 'Име',
    },
    noOffers: 'Няма намерени близки оферти',
    enableLocation: 'Разрешете местоположение за да намерите оферти',
    openNow: 'Отворено Сега',
    closed: 'Затворено',
    viewDetails: 'Виж Детайли',
  },
};

const NearbyOffersPage: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const t = content[language as keyof typeof content];

  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'distance' | 'discount' | 'rating' | 'name'>('distance');
  const [showFilters, setShowFilters] = useState(false);

  // Mock venue data - replace with real API
  const [venues] = useState<Venue[]>([
    {
      id: '1',
      name: 'Sofia Grand Hotel',
      category: 'hotels',
      lat: 42.6977,
      lng: 23.3219,
      address: '1 Narodno Sabranie Sq, Sofia',
      phone: '+359 2 811 0811',
      rating: 4.7,
      isOpen: true,
      image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400',
      discount: 25,
    },
    {
      id: '2',
      name: 'The Capital Grill',
      category: 'restaurants',
      lat: 42.6954,
      lng: 23.3279,
      address: '12 Vitosha Blvd, Sofia',
      phone: '+359 2 987 6543',
      rating: 4.5,
      isOpen: true,
      image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400',
      discount: 20,
    },
    {
      id: '3',
      name: 'Relax SPA Center',
      category: 'spas',
      lat: 42.6925,
      lng: 23.3189,
      address: '45 Alabin St, Sofia',
      phone: '+359 2 943 2109',
      rating: 4.8,
      isOpen: true,
      image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=400',
      discount: 30,
    },
    {
      id: '4',
      name: 'Cinema City Sofia',
      category: 'entertainment',
      lat: 42.6853,
      lng: 23.3154,
      address: '102 Bulgaria Blvd, Sofia',
      phone: '+359 700 20 888',
      rating: 4.3,
      isOpen: true,
      image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400',
      discount: 15,
    },
    {
      id: '5',
      name: 'Fitness Pro Gym',
      category: 'sports',
      lat: 42.7042,
      lng: 23.3145,
      address: '78 Tzar Boris III Blvd, Sofia',
      phone: '+359 2 962 1234',
      rating: 4.6,
      isOpen: false,
      image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400',
      discount: 40,
    },
    {
      id: '6',
      name: 'Beauty Lounge Sofia',
      category: 'beauty',
      lat: 42.6889,
      lng: 23.3344,
      address: '23 Graf Ignatiev St, Sofia',
      phone: '+359 2 987 3210',
      rating: 4.9,
      isOpen: true,
      image: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400',
      discount: 35,
    },
  ]);

  const filteredVenues = venues.filter((venue) => {
    if (selectedCategory === 'all') return true;
    return venue.category === selectedCategory;
  });

  const sortedVenues = [...filteredVenues].sort((a, b) => {
    switch (sortBy) {
      case 'discount':
        return (b.discount || 0) - (a.discount || 0);
      case 'rating':
        return (b.rating || 0) - (a.rating || 0);
      case 'name':
        return a.name.localeCompare(b.name);
      default:
        return 0; // Distance sorting handled by MapView
    }
  });

  const handleVenueClick = (venue: Venue) => {
    navigate(`/offers/${venue.id}`);
  };

  const categories = Object.keys(t.filters).filter((key) => key !== 'all');

  return (
    <Container>
      <Header>
        <HeaderContent>
          <div>
            <Title>{t.title}</Title>
            <Subtitle>{t.subtitle}</Subtitle>
          </div>

          <ViewToggle>
            <ToggleButton
              active={viewMode === 'map'}
              onClick={() => setViewMode('map')}
            >
              <Map size={18} />
              {t.viewToggle.map}
            </ToggleButton>
            <ToggleButton
              active={viewMode === 'list'}
              onClick={() => setViewMode('list')}
            >
              <List size={18} />
              {t.viewToggle.list}
            </ToggleButton>
          </ViewToggle>
        </HeaderContent>
      </Header>

      <FiltersSection>
        <FiltersToggle onClick={() => setShowFilters(!showFilters)}>
          <SlidersHorizontal size={18} />
          Filters
          {selectedCategory !== 'all' && (
            <Badge variant="success" size="small">
              1
            </Badge>
          )}
        </FiltersToggle>

        {showFilters && (
          <FiltersContent
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <FilterGroup>
              <FilterLabel>CATEGORY</FilterLabel>
              <CategoryFilters>
                <CategoryButton
                  active={selectedCategory === 'all'}
                  onClick={() => setSelectedCategory('all')}
                >
                  {t.filters.all}
                </CategoryButton>
                {categories.map((category) => (
                  <CategoryButton
                    key={category}
                    active={selectedCategory === category}
                    onClick={() => setSelectedCategory(selectedCategory === category ? 'all' : category)}
                  >
                    {t.filters[category as keyof typeof t.filters]}
                  </CategoryButton>
                ))}
              </CategoryFilters>
            </FilterGroup>

            <FilterGroup>
              <FilterLabel>SORT BY</FilterLabel>
              <SortButtons>
                <SortButton
                  active={sortBy === 'distance'}
                  onClick={() => setSortBy('distance')}
                >
                  {t.sort.distance}
                </SortButton>
                <SortButton
                  active={sortBy === 'rating'}
                  onClick={() => setSortBy('rating')}
                >
                  {t.sort.rating}
                </SortButton>
                <SortButton
                  active={sortBy === 'name'}
                  onClick={() => setSortBy('name')}
                >
                  {t.sort.name}
                </SortButton>
              </SortButtons>
            </FilterGroup>
          </FiltersContent>
        )}
      </FiltersSection>

      {viewMode === 'map' ? (
        <MapView
          venues={sortedVenues}
          onVenueClick={handleVenueClick}
          height="600px"
        />
      ) : (
        <ListView>
          {sortedVenues.length === 0 ? (
            <EmptyState>
              <EmptyIcon>
                <MapPin size={48} />
              </EmptyIcon>
              <EmptyTitle>{t.noOffers}</EmptyTitle>
              <EmptyText>{t.enableLocation}</EmptyText>
            </EmptyState>
          ) : (
            <VenuesGrid>
              {sortedVenues.map((venue, index) => (
                <VenueCard
                  key={venue.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onClick={() => handleVenueClick(venue)}
                >
                  <VenueImageContainer>
                    <VenueImage src={venue.image} alt={venue.name} />
                    {venue.discount && (
                      <DiscountBadge>{venue.discount}% OFF</DiscountBadge>
                    )}
                  </VenueImageContainer>

                  <VenueContent>
                    <VenueHeader>
                      <VenueName>{venue.name}</VenueName>
                      {venue.rating && (
                        <VenueRating>
                          ⭐ {venue.rating.toFixed(1)}
                        </VenueRating>
                      )}
                    </VenueHeader>

                    <VenueAddress>
                      <MapPin size={14} />
                      {venue.address}
                    </VenueAddress>

                    <VenueMeta>
                      <VenueStatus isOpen={venue.isOpen || false}>
                        {venue.isOpen ? t.openNow : t.closed}
                      </VenueStatus>
                      <VenueCategory>
                        {t.filters[venue.category as keyof typeof t.filters]}
                      </VenueCategory>
                    </VenueMeta>

                    <VenueAction>
                      <Button variant="primary" size="small">
                        {t.viewDetails}
                      </Button>
                    </VenueAction>
                  </VenueContent>
                </VenueCard>
              ))}
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
`;

const ToggleButton = styled.button<{ active: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.375rem;
  background: ${props => (props.active ? 'var(--primary)' : 'transparent')};
  color: ${props => (props.active ? 'white' : 'var(--text-secondary)')};
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${props => (props.active ? 'var(--primary)' : 'var(--gray-100)')};
  }
`;

const FiltersSection = styled.div`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  margin-bottom: 2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const FiltersToggle = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: none;
  border: 2px solid var(--primary);
  font-size: 1rem;
  font-weight: 600;
  color: var(--primary);
  cursor: pointer;
  padding: 0.625rem 1.25rem;
  border-radius: 0.5rem;
  transition: all 0.2s;

  &:hover {
    background: var(--primary);
    color: white;
  }

  svg {
    flex-shrink: 0;
  }
`;

const FiltersContent = styled(motion.div)`
  padding-top: 1.5rem;
  margin-top: 1.5rem;
  border-top: 1px solid var(--gray-200);
`;

const FilterGroup = styled.div`
  margin-bottom: 2rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

const FilterLabel = styled.div`
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 1rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding-left: 0.25rem;
`;

const CategoryFilters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-left: 0;
`;

const CategoryButton = styled.button<{ active: boolean }>`
  padding: 0.5rem 1.125rem;
  border: none;
  border-radius: 0.375rem;
  background: ${props => (props.active ? '#1a1a1a' : '#f5f5f5')};
  color: ${props => (props.active ? '#ffffff' : '#1a1a1a')};
  font-size: 0.9375rem;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;

  &:hover {
    background: ${props => (props.active ? '#1a1a1a' : '#e5e5e5')};
  }
`;

const SortButtons = styled.div`
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  align-items: center;
  margin-left: 0;
`;

const SortButton = styled.button<{ active: boolean }>`
  padding: 0.5rem 1.125rem;
  border: none;
  border-radius: 0.375rem;
  background: ${props => (props.active ? '#1a1a1a' : '#f5f5f5')};
  color: ${props => (props.active ? '#ffffff' : '#1a1a1a')};
  font-size: 0.9375rem;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;

  &:hover {
    background: ${props => (props.active ? '#1a1a1a' : '#e5e5e5')};
  }
`;

const ListView = styled.div`
  margin-top: 2rem;
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
  margin-bottom: 0.75rem;

  svg {
    flex-shrink: 0;
  }
`;

const VenueMeta = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
`;

const VenueStatus = styled.div<{ isOpen: boolean }>`
  font-size: 0.75rem;
  font-weight: 600;
  color: ${props => (props.isOpen ? 'var(--success)' : 'var(--error)')};
  text-transform: uppercase;
`;

const VenueCategory = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
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

export default NearbyOffersPage;
