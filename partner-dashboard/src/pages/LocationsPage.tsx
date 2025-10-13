import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
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
    font-size: 1.125rem;
  }
`;

const ContentSection = styled.div`
  padding: 3rem 0;
`;

const LocationsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 2rem;
  margin-bottom: 3rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const LocationCard = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s, box-shadow 0.3s;
  cursor: pointer;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
  }
`;

const LocationImage = styled.div<{ $bgImage: string }>`
  height: 200px;
  background-image: url(${props => props.$bgImage});
  background-size: cover;
  background-position: center;
  position: relative;
`;

const LocationBadge = styled(Badge)`
  position: absolute;
  top: 1rem;
  right: 1rem;
`;

const LocationContent = styled.div`
  padding: 1.5rem;
`;

const LocationName = styled.h3`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
`;

const LocationAddress = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const LocationDescription = styled.p`
  font-size: 1rem;
  color: #4b5563;
  line-height: 1.6;
  margin-bottom: 1.5rem;
`;

const LocationFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
`;

const LocationStats = styled.div`
  display: flex;
  gap: 1rem;
`;

const Stat = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
`;

const CityFilter = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 3rem;
  justify-content: center;
`;

const CityChip = styled.button<{ $active: boolean }>`
  padding: 0.75rem 1.5rem;
  border: 2px solid ${props => props.$active ? '#000000' : '#e5e7eb'};
  background: ${props => props.$active ? '#000000' : 'white'};
  color: ${props => props.$active ? 'white' : '#6b7280'};
  border-radius: 2rem;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: #000000;
  }
`;

interface Location {
  id: string;
  name: string;
  city: string;
  address: string;
  description: string;
  imageUrl: string;
  offers: number;
  rating: number;
  openNow?: boolean;
}

const mockLocations: Location[] = [
  {
    id: '1',
    name: 'Downtown Restaurant & Bar',
    city: 'Sofia',
    address: 'Vitosha Blvd 123, Sofia 1000',
    description: 'Premium dining experience with rooftop terrace and city views. Specializing in Mediterranean cuisine.',
    imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
    offers: 8,
    rating: 4.8,
    openNow: true,
  },
  {
    id: '2',
    name: 'Wellness Spa & Fitness Center',
    city: 'Sofia',
    address: 'Bulgaria Blvd 88, Sofia 1404',
    description: 'Full-service spa with modern fitness facilities, yoga studios, and relaxation areas.',
    imageUrl: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800',
    offers: 5,
    rating: 4.9,
    openNow: true,
  },
  {
    id: '3',
    name: 'Seaside Beach Club',
    city: 'Varna',
    address: 'Sea Garden, Varna 9000',
    description: 'Exclusive beach club with water sports, pool bar, and sunset lounge area.',
    imageUrl: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800',
    offers: 12,
    rating: 4.7,
    openNow: false,
  },
  {
    id: '4',
    name: 'Mountain Resort & Ski Lodge',
    city: 'Bansko',
    address: 'Pirin Mountain, Bansko 2770',
    description: 'Alpine resort with ski slopes, cozy lodge, and après-ski entertainment.',
    imageUrl: 'https://images.unsplash.com/photo-1605870445919-838d190e8e1b?w=800',
    offers: 15,
    rating: 4.6,
  },
  {
    id: '5',
    name: 'Art Gallery & Café',
    city: 'Plovdiv',
    address: 'Old Town, Plovdiv 4000',
    description: 'Contemporary art space with specialty coffee and local artisan exhibitions.',
    imageUrl: 'https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=800',
    offers: 6,
    rating: 4.8,
    openNow: true,
  },
  {
    id: '6',
    name: 'Shopping Mall & Entertainment',
    city: 'Sofia',
    address: 'Tsarigradsko Shose 115, Sofia 1784',
    description: 'Modern shopping center with cinema, bowling, and diverse dining options.',
    imageUrl: 'https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?w=800',
    offers: 25,
    rating: 4.5,
    openNow: true,
  },
];

const LocationsPage: React.FC = () => {
  const { language } = useLanguage();
  const [selectedCity, setSelectedCity] = useState<string>('all');

  const t = {
    en: {
      title: 'Partner Locations',
      subtitle: 'Discover BoomCard partner venues across Bulgaria',
      all: 'All Cities',
      sofia: 'Sofia',
      varna: 'Varna',
      plovdiv: 'Plovdiv',
      bansko: 'Bansko',
      offers: 'offers',
      openNow: 'Open Now',
      viewOffers: 'View Offers',
      getDirections: 'Get Directions',
    },
    bg: {
      title: 'Партньорски Локации',
      subtitle: 'Открийте партньорски места на BoomCard в България',
      all: 'Всички Градове',
      sofia: 'София',
      varna: 'Варна',
      plovdiv: 'Пловдив',
      bansko: 'Банско',
      offers: 'оферти',
      openNow: 'Отворено Сега',
      viewOffers: 'Виж Оферти',
      getDirections: 'Маршрут',
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  const cities = [
    { id: 'all', label: content.all },
    { id: 'Sofia', label: content.sofia },
    { id: 'Varna', label: content.varna },
    { id: 'Plovdiv', label: content.plovdiv },
    { id: 'Bansko', label: content.bansko },
  ];

  const filteredLocations = selectedCity === 'all'
    ? mockLocations
    : mockLocations.filter(loc => loc.city === selectedCity);

  return (
    <PageContainer>
      <Hero>
        <Container>
          <HeroContent>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Title>{content.title}</Title>
              <Subtitle>{content.subtitle}</Subtitle>
            </motion.div>
          </HeroContent>
        </Container>
      </Hero>

      <ContentSection>
        <Container>
          <CityFilter>
            {cities.map((city) => (
              <CityChip
                key={city.id}
                $active={selectedCity === city.id}
                onClick={() => setSelectedCity(city.id)}
              >
                {city.label}
              </CityChip>
            ))}
          </CityFilter>

          <LocationsGrid>
            {filteredLocations.map((location, index) => (
              <LocationCard
                key={location.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <LocationImage $bgImage={location.imageUrl}>
                  {location.openNow && (
                    <LocationBadge variant="success">
                      {content.openNow}
                    </LocationBadge>
                  )}
                </LocationImage>

                <LocationContent>
                  <LocationName>{location.name}</LocationName>
                  <LocationAddress>
                    📍 {location.address}
                  </LocationAddress>
                  <LocationDescription>
                    {location.description}
                  </LocationDescription>

                  <LocationFooter>
                    <LocationStats>
                      <Stat>⭐ {location.rating}</Stat>
                      <Stat>🎁 {location.offers} {content.offers}</Stat>
                    </LocationStats>
                    <Link to={`/offers/${location.id}`}>
                      <Button variant="primary" size="small">
                        {content.viewOffers}
                      </Button>
                    </Link>
                  </LocationFooter>
                </LocationContent>
              </LocationCard>
            ))}
          </LocationsGrid>
        </Container>
      </ContentSection>
    </PageContainer>
  );
};

export default LocationsPage;
