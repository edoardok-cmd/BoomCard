import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import OfferCard, { Offer } from '../components/common/OfferCard/OfferCard';
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

const StatsRow = styled.div`
  display: flex;
  justify-content: center;
  gap: 3rem;
  flex-wrap: wrap;
  margin-top: 2rem;
`;

const StatItem = styled.div`
  text-align: center;
`;

const StatValue = styled.div`
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
`;

const StatLabel = styled.div`
  font-size: 0.875rem;
  opacity: 0.8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const ContentSection = styled.div`
  padding: 3rem 0;
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
`;

const SectionTitle = styled.h2`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const FilterBar = styled.div`
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
`;

const FilterTabs = styled.div`
  display: flex;
  gap: 0.5rem;
  background: white;
  padding: 0.25rem;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const TabButton = styled.button<{ $active: boolean }>`
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.375rem;
  background: ${props => props.$active ? '#000000' : 'transparent'};
  color: ${props => props.$active ? 'white' : '#6b7280'};
  font-weight: 500;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${props => props.$active ? '#000000' : '#f3f4f6'};
  }
`;

const OffersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 1rem;
  color: #6b7280;
`;

const EmptyIcon = styled.div`
  font-size: 4rem;
  margin-bottom: 1rem;
`;

const EmptyTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #111827;
`;

const EmptyText = styled.p`
  font-size: 1rem;
  margin-bottom: 2rem;
`;

// Mock promotions data
const mockPromotions: Offer[] = [
  {
    id: '1',
    title: 'Flash Sale - 50% Off Everything',
    titleBg: 'Флаш Разпродажба - 50% Отстъпка',
    description: 'Limited time offer! Get 50% off all menu items. Valid for the next 4 hours only.',
    descriptionBg: 'Ограничена оферта! Вземете 50% отстъпка на всички артикули.',
    discount: 50,
    originalPrice: 100,
    discountedPrice: 50,
    category: 'Flash Sale',
    categoryBg: 'Флаш Оферта',
    location: 'All Locations',
    imageUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
    partnerName: 'BoomCard Partner',
    path: '/offers/1',
    rating: 4.8,
    reviewCount: 124,
  },
  {
    id: '2',
    title: 'Happy Hour Special',
    titleBg: 'Специална Happy Hour Оферта',
    description: 'Buy one get one free on all drinks from 5 PM to 7 PM every weekday.',
    descriptionBg: 'Купи едно, вземи едно безплатно на всички напитки от 17:00 до 19:00.',
    discount: 50,
    originalPrice: 40,
    discountedPrice: 20,
    category: 'Happy Hour',
    categoryBg: 'Щастлив Час',
    location: 'Downtown Location',
    imageUrl: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800',
    partnerName: 'Downtown Bar',
    path: '/offers/2',
    rating: 4.6,
    reviewCount: 89,
  },
  {
    id: '3',
    title: 'Birthday Special',
    titleBg: 'Специална Рожденоденска Оферта',
    description: 'Celebrate your birthday with us! Get a complimentary dessert when you dine with 3+ people.',
    descriptionBg: 'Празнувайте рождения си ден с нас! Получете безплатен десерт.',
    discount: 100,
    originalPrice: 15,
    discountedPrice: 0,
    category: 'Birthday',
    categoryBg: 'Рожден Ден',
    location: 'All Locations',
    imageUrl: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=800',
    partnerName: 'Sweet Treats',
    path: '/offers/3',
    rating: 4.9,
    reviewCount: 210,
  },
  {
    id: '4',
    title: 'Healthy Monday',
    titleBg: 'Здравословен Понеделник',
    description: 'All salads and healthy bowls 30% off every Monday. Start your week right!',
    descriptionBg: 'Всички салати и здравословни купи 30% отстъпка всеки понеделник.',
    discount: 30,
    originalPrice: 20,
    discountedPrice: 14,
    category: 'Weekly Special',
    categoryBg: 'Седмична Оферта',
    location: 'All Locations',
    imageUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800',
    partnerName: 'Fresh & Healthy',
    path: '/offers/4',
    rating: 4.7,
    reviewCount: 156,
  },
  {
    id: '5',
    title: 'Family Bundle Deal',
    titleBg: 'Семейна Пакетна Оферта',
    description: 'Feed the whole family! Get 2 large pizzas, garlic bread, and a 2L drink for just $39.99',
    descriptionBg: 'Нахранете цялото семейство! 2 големи пици, чеснов хляб и 2L напитка за само $39.99',
    discount: 25,
    originalPrice: 52,
    discountedPrice: 39.99,
    category: 'Family Deal',
    categoryBg: 'Семейна Оферта',
    location: 'All Locations',
    imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800',
    partnerName: 'Pizza Paradise',
    path: '/offers/5',
    rating: 4.5,
    reviewCount: 342,
  },
  {
    id: '6',
    title: 'Student Discount',
    titleBg: 'Студентска Отстъпка',
    description: 'Show your student ID and get 20% off your entire order, any day of the week!',
    descriptionBg: 'Покажете студентската си карта и получете 20% отстъпка на цялата поръчка!',
    discount: 20,
    originalPrice: 50,
    discountedPrice: 40,
    category: 'Student',
    categoryBg: 'Студент',
    location: 'All Locations',
    imageUrl: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800',
    partnerName: 'Student Cafe',
    path: '/offers/6',
    rating: 4.8,
    reviewCount: 267,
  },
];

const PromotionsPage: React.FC = () => {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'upcoming' | 'expired'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [filteredOffers, setFilteredOffers] = useState<Offer[]>(mockPromotions);

  const t = {
    en: {
      title: 'Special Promotions',
      subtitle: 'Discover amazing deals and limited-time offers from your favorite venues',
      activePromotions: 'Active Promotions',
      totalOffers: 'Total Offers',
      avgDiscount: 'Avg. Discount',
      all: 'All',
      active: 'Active',
      upcoming: 'Upcoming',
      expired: 'Expired',
      filters: 'Filters',
      emptyTitle: 'No promotions found',
      emptyText: 'Check back soon for new exciting deals!',
      browseOffers: 'Browse All Offers',
    },
    bg: {
      title: 'Специални Промоции',
      subtitle: 'Открийте невероятни оферти и ограничени промоции от любимите си места',
      activePromotions: 'Активни Промоции',
      totalOffers: 'Общо Оферти',
      avgDiscount: 'Средна Отстъпка',
      all: 'Всички',
      active: 'Активни',
      upcoming: 'Предстоящи',
      expired: 'Изтекли',
      filters: 'Филтри',
      emptyTitle: 'Няма намерени промоции',
      emptyText: 'Проверете отново скоро за нови вълнуващи оферти!',
      browseOffers: 'Разгледай Всички Оферти',
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  const handleFilterChange = (filters: any) => {
    // Apply filters logic here
    let filtered = [...mockPromotions];

    if (filters.category && filters.category.length > 0) {
      filtered = filtered.filter(offer =>
        filters.category.includes(offer.category)
      );
    }

    setFilteredOffers(filtered);
  };

  // For demo purposes, show all offers regardless of tab
  // In production, offers would have validUntil field to filter by
  const displayOffers = filteredOffers;

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

              <StatsRow>
                <StatItem>
                  <StatValue>{mockPromotions.length}</StatValue>
                  <StatLabel>{content.totalOffers}</StatLabel>
                </StatItem>
                <StatItem>
                  <StatValue>{mockPromotions.length}</StatValue>
                  <StatLabel>{content.activePromotions}</StatLabel>
                </StatItem>
                <StatItem>
                  <StatValue>35%</StatValue>
                  <StatLabel>{content.avgDiscount}</StatLabel>
                </StatItem>
              </StatsRow>
            </motion.div>
          </HeroContent>
        </Container>
      </Hero>

      <ContentSection>
        <Container>
          <SectionHeader>
            <SectionTitle>
              {content.activePromotions}{' '}
              <Badge variant="success">
                {displayOffers.length}
              </Badge>
            </SectionTitle>

            <FilterBar>
              <FilterTabs>
                <TabButton
                  $active={activeTab === 'all'}
                  onClick={() => setActiveTab('all')}
                >
                  {content.all}
                </TabButton>
                <TabButton
                  $active={activeTab === 'active'}
                  onClick={() => setActiveTab('active')}
                >
                  {content.active}
                </TabButton>
                <TabButton
                  $active={activeTab === 'upcoming'}
                  onClick={() => setActiveTab('upcoming')}
                >
                  {content.upcoming}
                </TabButton>
                <TabButton
                  $active={activeTab === 'expired'}
                  onClick={() => setActiveTab('expired')}
                >
                  {content.expired}
                </TabButton>
              </FilterTabs>

              <Button
                variant="secondary"
                onClick={() => setShowFilters(!showFilters)}
              >
                {content.filters}
              </Button>
            </FilterBar>
          </SectionHeader>

          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ padding: '1rem', background: 'white', borderRadius: '0.5rem', marginBottom: '2rem' }}
            >
              <p style={{ color: '#6b7280' }}>Filter options will be displayed here</p>
            </motion.div>
          )}

          {displayOffers.length > 0 ? (
            <OffersGrid>
              {displayOffers.map((offer, index) => (
                <motion.div
                  key={offer.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                >
                  <OfferCard offer={offer} />
                </motion.div>
              ))}
            </OffersGrid>
          ) : (
            <EmptyState>
              <EmptyIcon>🎁</EmptyIcon>
              <EmptyTitle>{content.emptyTitle}</EmptyTitle>
              <EmptyText>{content.emptyText}</EmptyText>
              <Link to="/search">
                <Button variant="primary">
                  {content.browseOffers}
                </Button>
              </Link>
            </EmptyState>
          )}
        </Container>
      </ContentSection>
    </PageContainer>
  );
};

export default PromotionsPage;
