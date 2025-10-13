import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import { Link } from 'react-router-dom';

const CitiesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  margin-bottom: 2rem;
`;

const CityCard = styled(Link)`
  background: white;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s;
  text-decoration: none;
  color: inherit;

  &:hover {
    transform: translateY(-4px);
  }
`;

const CityImage = styled.div<{ $bg: string }>`
  height: 200px;
  background: url(${p => p.$bg}) center/cover;
`;

const CityContent = styled.div`
  padding: 1.5rem;
`;

const CityName = styled.h3`
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: #111827;
`;

const CityStats = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
`;

const LocationsCitiesPage: React.FC = () => {
  const { language } = useLanguage();

  // In a real implementation, these would come from the API
  // For now, we'll keep the static list but with dynamic offers count
  const cities = [
    { id: 'sofia', name: language === 'bg' ? 'София' : 'Sofia', city: 'Sofia', img: 'https://images.unsplash.com/photo-1597423244036-ef5020e83f3c?w=800' },
    { id: 'plovdiv', name: language === 'bg' ? 'Пловдив' : 'Plovdiv', city: 'Plovdiv', img: 'https://images.unsplash.com/photo-1584646098378-0874589d76b1?w=800' },
    { id: 'varna', name: language === 'bg' ? 'Варна' : 'Varna', city: 'Varna', img: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800' },
    { id: 'bansko', name: language === 'bg' ? 'Банско' : 'Bansko', city: 'Bansko', img: 'https://images.unsplash.com/photo-1605870445919-838d190e8e1b?w=800' },
  ];

  return (
    <GenericPage
      titleEn="Browse by City"
      titleBg="Разгледай по Град"
      subtitleEn="Find the best offers and venues in major Bulgarian cities"
      subtitleBg="Намерете най-добрите оферти и места в големите български градове"
    >
      <CitiesGrid>
        {cities.map((city) => (
          <CityCard key={city.id} to={`/locations/${city.id}`}>
            <CityImage $bg={city.img} />
            <CityContent>
              <CityName>{city.name}</CityName>
              <CityStats>
                {language === 'bg' ? 'Разгледай оферти' : 'Browse offers'}
              </CityStats>
            </CityContent>
          </CityCard>
        ))}
      </CitiesGrid>
    </GenericPage>
  );
};

export default LocationsCitiesPage;
