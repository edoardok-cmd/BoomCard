import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import OfferCard from '../components/common/OfferCard/OfferCard';
import Button from '../components/common/Button/Button';
import Badge from '../components/common/Badge/Badge';
import ClientCTA from '../components/common/ClientCTA/ClientCTA';
import { updateSEO, generateOfferSchema } from '../utils/seo';
import { mockOffers } from '../data/mockOffers';

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

  [data-theme="dark"] & {
    color: #f9fafb;
  }

  [data-theme="color"] & {
    color: #111827;
  }

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

  [data-theme="dark"] & {
    background: #1f2937;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  [data-theme="color"] & {
    background: white;
  }
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

  [data-theme="dark"] & {
    background: ${props => props.$active ? '#3b82f6' : 'transparent'};
    color: ${props => props.$active ? 'white' : '#9ca3af'};

    &:hover {
      background: ${props => props.$active ? '#3b82f6' : '#374151'};
    }
  }

  [data-theme="color"] & {
    background: ${props => props.$active ? '#ff006e' : 'transparent'};
    color: ${props => props.$active ? 'white' : '#6b7280'};

    &:hover {
      background: ${props => props.$active ? '#ff006e' : '#f3f4f6'};
    }
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

  [data-theme="dark"] & {
    color: #9ca3af;
  }
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

  [data-theme="dark"] & {
    color: #f9fafb;
  }

  [data-theme="color"] & {
    color: #111827;
  }
`;

const EmptyText = styled.p`
  font-size: 1rem;
  margin-bottom: 2rem;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const PageLayout = styled.div`
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 2rem;
  align-items: start;

  @media (max-width: 968px) {
    grid-template-columns: 1fr;
  }
`;

const SidePanel = styled.div`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  position: sticky;
  top: 100px;

  [data-theme="dark"] & {
    background: #1f2937;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  [data-theme="color"] & {
    background: white;
    border: 2px solid rgba(255, 148, 214, 0.3);
  }

  @media (max-width: 968px) {
    position: static;
  }
`;

const FilterSection = styled.div`
  margin-bottom: 2rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

const FilterTitle = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }

  [data-theme="color"] & {
    color: #1a0a2e;
  }
`;

const FilterOption = styled.label`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9375rem;
  color: #374151;

  &:hover {
    color: #111827;
  }

  [data-theme="dark"] & {
    color: #d1d5db;

    &:hover {
      color: #f9fafb;
    }
  }

  [data-theme="color"] & {
    color: #4b5563;

    &:hover {
      color: #1a0a2e;
    }
  }

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: #000000;

    [data-theme="dark"] & {
      accent-color: #3b82f6;
    }

    [data-theme="color"] & {
      accent-color: #ff006e;
    }
  }
`;

const TopOfferItem = styled(motion.div)`
  padding: 0.75rem;
  background: #f9fafb;
  border-radius: 0.5rem;
  margin-bottom: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f3f4f6;
    transform: translateX(4px);
  }

  &:last-child {
    margin-bottom: 0;
  }

  [data-theme="dark"] & {
    background: #374151;

    &:hover {
      background: #4b5563;
    }
  }

  [data-theme="color"] & {
    background: linear-gradient(135deg, #fff5f0 0%, #ffe4f1 100%);
    border: 1px solid rgba(255, 148, 214, 0.3);

    &:hover {
      background: linear-gradient(135deg, #ffe4f1 0%, #fff5f0 100%);
      border-color: rgba(255, 148, 214, 0.5);
    }
  }
`;

const TopOfferTitle = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.25rem;
  line-height: 1.3;

  [data-theme="dark"] & {
    color: #f9fafb;
  }

  [data-theme="color"] & {
    color: #1a0a2e;
  }
`;

const TopOfferDiscount = styled.div`
  font-size: 0.75rem;
  color: #22c55e;
  font-weight: 600;

  [data-theme="dark"] & {
    color: #34d399;
  }

  [data-theme="color"] & {
    color: #059669;
  }
`;

const ClearFiltersButton = styled.button`
  width: 100%;
  padding: 0.625rem;
  background: transparent;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  color: #6b7280;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f9fafb;
    color: #111827;
    border-color: #d1d5db;
  }

  [data-theme="dark"] & {
    border-color: #4b5563;
    color: #9ca3af;

    &:hover {
      background: #374151;
      color: #f9fafb;
      border-color: #6b7280;
    }
  }

  [data-theme="color"] & {
    border-color: rgba(255, 148, 214, 0.3);
    color: #6a0572;

    &:hover {
      background: rgba(255, 148, 214, 0.1);
      color: #1a0a2e;
      border-color: rgba(255, 148, 214, 0.5);
    }
  }
`;

const MainContent = styled.div`
  min-width: 0;
`;

const PromotionsPage: React.FC = () => {
  const { language } = useLanguage();

  // Filter states
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedDiscounts, setSelectedDiscounts] = useState<string[]>([]);

  // Sort promotions by discount size
  const topPromotions = [...mockOffers]
    .sort((a, b) => b.discount - a.discount)
    .slice(0, 4);

  // Filter offers based on selected filters
  const filteredOffers = mockOffers.filter(offer => {
    // Category filter
    if (selectedCategories.length > 0) {
      const offerCategory = language === 'bg' ? offer.categoryBg : offer.category;
      if (!selectedCategories.includes(offerCategory)) {
        return false;
      }
    }

    // Discount filter
    if (selectedDiscounts.length > 0) {
      const hasMatchingDiscount = selectedDiscounts.some(range => {
        if (range === '50+') return offer.discount >= 50;
        if (range === '30-50') return offer.discount >= 30 && offer.discount < 50;
        if (range === '20-30') return offer.discount >= 20 && offer.discount < 30;
        if (range === '10-20') return offer.discount >= 10 && offer.discount < 20;
        return false;
      });
      if (!hasMatchingDiscount) return false;
    }

    return true;
  }).sort((a, b) => b.discount - a.discount);

  // Get unique categories from offers
  const categories = Array.from(new Set(mockOffers.map(offer =>
    language === 'bg' ? offer.categoryBg : offer.category
  )));

  // Handle category toggle
  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  // Handle discount toggle
  const toggleDiscount = (range: string) => {
    setSelectedDiscounts(prev =>
      prev.includes(range)
        ? prev.filter(d => d !== range)
        : [...prev, range]
    );
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedCategories([]);
    setSelectedDiscounts([]);
  };

  const hasActiveFilters = selectedCategories.length > 0 || selectedDiscounts.length > 0;

  // SEO optimization for promotions page
  useEffect(() => {
    updateSEO({
      title: language === 'bg'
        ? 'Промоции и Специални Оферти | BoomCard'
        : 'Promotions and Special Offers | BoomCard',
      description: language === 'bg'
        ? 'Разгледайте най-добрите промоции и ексклузивни оферти с вашата BoomCard карта за намаления. Топ изживявания на специални цени!'
        : 'Browse the best promotions and exclusive offers with your BoomCard discount card. Top experiences at special prices!',
      keywords: language === 'bg'
        ? ['промоции', 'специални оферти', 'отстъпки', 'ексклузивни промоции', 'промоции ресторанти', 'промоции хотели', 'карта за намаления']
        : ['promotions', 'special offers', 'discounts', 'exclusive promotions', 'restaurant promotions', 'hotel promotions', 'discount card'],
      language: language,
      url: window.location.href,
    });

    // Add offer schema for the top promotion
    if (topPromotions.length > 0) {
      const topOffer = topPromotions[0];
      generateOfferSchema({
        name: language === 'bg' ? topOffer.titleBg : topOffer.title,
        description: language === 'bg' ? topOffer.descriptionBg : topOffer.description,
        discount: topOffer.discount,
        originalPrice: topOffer.originalPrice,
        discountedPrice: topOffer.discountedPrice,
        category: language === 'bg' ? topOffer.categoryBg : topOffer.category,
        image: topOffer.imageUrl,
      });
    }
  }, [language, topPromotions]);

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
                  <StatValue>{mockOffers.length}</StatValue>
                  <StatLabel>{content.totalOffers}</StatLabel>
                </StatItem>
                <StatItem>
                  <StatValue>{mockOffers.length}</StatValue>
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
          <PageLayout>
            {/* Side Panel Filter */}
            <SidePanel>
              {/* Top Offers Section */}
              <FilterSection>
                <FilterTitle>
                  ⭐ {language === 'bg' ? 'Топ Оферти' : 'Top Offers'}
                </FilterTitle>
                {topPromotions.map((offer, index) => (
                  <TopOfferItem
                    key={offer.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                  >
                    <TopOfferTitle>
                      {language === 'bg' ? offer.titleBg : offer.title}
                    </TopOfferTitle>
                    <TopOfferDiscount>
                      {offer.discount}% {language === 'bg' ? 'отстъпка' : 'off'}
                    </TopOfferDiscount>
                  </TopOfferItem>
                ))}
              </FilterSection>

              {/* Category Filter */}
              <FilterSection>
                <FilterTitle>
                  📂 {language === 'bg' ? 'Категории' : 'Categories'}
                </FilterTitle>
                {categories.map(category => (
                  <FilterOption key={category}>
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(category)}
                      onChange={() => toggleCategory(category)}
                    />
                    <span>{category}</span>
                  </FilterOption>
                ))}
              </FilterSection>

              {/* Discount Range Filter */}
              <FilterSection>
                <FilterTitle>
                  💰 {language === 'bg' ? 'Размер на Отстъпката' : 'Discount Range'}
                </FilterTitle>
                {[
                  { value: '50+', label: language === 'bg' ? '50%+' : '50%+' },
                  { value: '30-50', label: '30% - 50%' },
                  { value: '20-30', label: '20% - 30%' },
                  { value: '10-20', label: '10% - 20%' }
                ].map(range => (
                  <FilterOption key={range.value}>
                    <input
                      type="checkbox"
                      checked={selectedDiscounts.includes(range.value)}
                      onChange={() => toggleDiscount(range.value)}
                    />
                    <span>{range.label}</span>
                  </FilterOption>
                ))}
              </FilterSection>

              {/* Clear Filters Button */}
              {hasActiveFilters && (
                <FilterSection>
                  <ClearFiltersButton onClick={clearFilters}>
                    {language === 'bg' ? 'Изчисти Филтрите' : 'Clear Filters'}
                  </ClearFiltersButton>
                </FilterSection>
              )}
            </SidePanel>

            {/* Main Content */}
            <MainContent id="all-offers">
              <SectionHeader>
                <SectionTitle>
                  {hasActiveFilters
                    ? (language === 'bg' ? 'Филтрирани Промоции' : 'Filtered Promotions')
                    : (language === 'bg' ? 'Всички Промоции' : 'All Promotions')}
                </SectionTitle>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  {filteredOffers.length} {language === 'bg' ? 'оферти' : 'offers'}
                </div>
              </SectionHeader>

              {filteredOffers.length > 0 ? (
                <>
                  <OffersGrid>
                    {filteredOffers.map((offer, index) => (
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

                  <div style={{ textAlign: 'center', marginTop: '3rem' }}>
                    <Link to="#all-offers">
                      <Button variant="primary" size="large">
                        {language === 'bg' ? 'Виж Всички Оферти' : 'View All Offers'}
                      </Button>
                    </Link>
                  </div>
                </>
              ) : (
                <EmptyState>
                  <EmptyIcon>🔍</EmptyIcon>
                  <EmptyTitle>{content.emptyTitle}</EmptyTitle>
                  <EmptyText>{content.emptyText}</EmptyText>
                  <ClearFiltersButton onClick={clearFilters}>
                    {language === 'bg' ? 'Изчисти Филтрите' : 'Clear Filters'}
                  </ClearFiltersButton>
                </EmptyState>
              )}
            </MainContent>
          </PageLayout>
        </Container>
      </ContentSection>

      {/* Client CTA */}
      <ClientCTA />
    </PageContainer>
  );
};

export default PromotionsPage;
