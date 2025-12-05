import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import Button from '../components/common/Button/Button';
import Badge from '../components/common/Badge/Badge';

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
  padding: 5rem 0 4rem;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 50%;
    height: 100%;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 100%);
  }

  @media (max-width: 768px) {
    padding: 3rem 0 2rem;
  }
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1.5rem;
  position: relative;
  z-index: 1;
`;

const HeroContent = styled.div`
  max-width: 800px;
  margin: 0 auto;
  text-align: center;
`;

const Title = styled.h1`
  font-size: 4rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  line-height: 1.1;

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }
`;

const Subtitle = styled.p`
  font-size: 1.5rem;
  opacity: 0.9;
  margin-bottom: 3rem;
  line-height: 1.6;

  @media (max-width: 768px) {
    font-size: 1.125rem;
  }
`;

const ContentSection = styled.div`
  padding: 3rem 0;
`;

const ContentLayout = styled.div`
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 2rem;
  align-items: start;

  @media (max-width: 968px) {
    grid-template-columns: 1fr;
  }
`;

const FilterSidebar = styled.div`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  position: sticky;
  top: 100px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

  [data-theme="dark"] & {
    background: #1f2937;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  @media (max-width: 968px) {
    position: relative;
    top: 0;
    max-height: none;
    margin-bottom: 2rem;
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
  font-weight: 700;
  color: #111827;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e5e7eb;

  [data-theme="dark"] & {
    color: #f9fafb;
    border-bottom-color: #374151;
  }
`;

const FilterOption = styled.button<{ $active: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: none;
  background: ${props => props.$active ? '#f3f4f6' : 'transparent'};
  color: ${props => props.$active ? '#111827' : '#6b7280'};
  font-size: 0.9375rem;
  font-weight: ${props => props.$active ? '600' : '400'};
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  border-radius: 0.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;

  [data-theme="dark"] & {
    background: ${props => props.$active ? '#374151' : 'transparent'};
    color: ${props => props.$active ? '#f9fafb' : '#9ca3af'};
  }

  &:hover {
    background: ${props => props.$active ? '#f3f4f6' : '#f9fafb'};
    color: #111827;

    [data-theme="dark"] & {
      background: ${props => props.$active ? '#374151' : '#374151'};
      color: #f9fafb;
    }
  }

  span {
    font-size: 0.875rem;
    opacity: 0.7;
  }
`;

const ClearFiltersButton = styled.button`
  width: 100%;
  padding: 0.875rem;
  border: 2px solid #e5e7eb;
  background: white;
  color: #6b7280;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border-radius: 0.5rem;
  margin-top: 1.5rem;

  [data-theme="dark"] & {
    border-color: #374151;
    background: #1f2937;
    color: #9ca3af;
  }

  &:hover {
    border-color: #000000;
    color: #111827;

    [data-theme="dark"] & {
      border-color: #60a5fa;
      color: #f9fafb;
    }
  }
`;

const MainContent = styled.div`
  flex: 1;
`;

const SectionTitle = styled.h2`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const SectionSubtitle = styled.p`
  font-size: 1rem;
  color: #6b7280;
  margin-bottom: 2rem;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const ExperiencesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 1.5rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const ExperienceCard = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s, box-shadow 0.3s;
  cursor: pointer;

  [data-theme="dark"] & {
    background: #1f2937;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  }

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);

    [data-theme="dark"] & {
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.5);
    }
  }
`;

const ExperienceImage = styled.div<{ $bgImage: string }>`
  height: 240px;
  background-image: url(${props => props.$bgImage});
  background-size: cover;
  background-position: center;
  position: relative;
`;

const ExperienceBadge = styled(Badge)`
  position: absolute;
  top: 1rem;
  right: 1rem;
`;

const ExperienceContent = styled.div`
  padding: 1.5rem;
`;

const ExperienceTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.75rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const ExperienceDescription = styled.p`
  font-size: 1rem;
  color: #6b7280;
  line-height: 1.6;
  margin-bottom: 1.5rem;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const ExperienceFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;

  [data-theme="dark"] & {
    border-top-color: #374151;
  }
`;

const ExperiencePrice = styled.div`
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const ExperienceLocation = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

interface Experience {
  id: string;
  title: string;
  description: string;
  category: string;
  price: string;
  location: string;
  imageUrl: string;
  featured?: boolean;
}

const mockExperiences: Experience[] = [
  {
    id: '1',
    title: 'Culinary Master Class',
    description: 'Learn to cook like a pro with our expert chefs. Includes a 3-course meal and wine pairing.',
    category: 'Dining',
    price: 'From $89',
    location: 'Downtown Kitchen',
    imageUrl: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800',
    featured: true,
  },
  {
    id: '2',
    title: 'Spa & Wellness Retreat',
    description: 'Full day spa experience with massage, facial, and access to thermal pools.',
    category: 'Wellness',
    price: 'From $149',
    location: 'Serenity Spa',
    imageUrl: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800',
    featured: true,
  },
  {
    id: '3',
    title: 'Wine Tasting Tour',
    description: 'Visit 3 local wineries with guided tastings and gourmet lunch included.',
    category: 'Dining',
    price: 'From $129',
    location: 'Wine Country',
    imageUrl: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800',
  },
  {
    id: '4',
    title: 'Adventure Park Day Pass',
    description: 'Unlimited access to zip lines, rock climbing, and obstacle courses.',
    category: 'Adventure',
    price: 'From $59',
    location: 'Adventure Park',
    imageUrl: 'https://images.unsplash.com/photo-1533167649158-6d508895b680?w=800',
  },
  {
    id: '5',
    title: 'Art Gallery Night Tour',
    description: 'Exclusive evening tour of contemporary art galleries with champagne reception.',
    category: 'Culture',
    price: 'From $45',
    location: 'Arts District',
    imageUrl: 'https://images.unsplash.com/photo-1577083552431-6e5fd01988ec?w=800',
  },
  {
    id: '6',
    title: 'Sunset Yacht Cruise',
    description: 'Private yacht cruise with dinner, drinks, and live music as you watch the sunset.',
    category: 'Leisure',
    price: 'From $199',
    location: 'Marina Bay',
    imageUrl: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800',
    featured: true,
  },
];

const ExperiencesPage: React.FC = () => {
  const { language } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPriceRange, setSelectedPriceRange] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('featured');

  const t = {
    en: {
      title: 'Unforgettable Experiences',
      subtitle: 'Discover unique experiences and activities from our partner venues',
      browse: 'Get Your BoomCard',
      featured: 'Featured',
      all: 'All Categories',
      dining: 'Dining',
      wellness: 'Wellness',
      adventure: 'Adventure',
      culture: 'Culture',
      leisure: 'Leisure',
      bookNow: 'Book Now',
      learnMore: 'Learn More',
      filters: {
        categories: 'Categories',
        priceRange: 'Price Range',
        sortBy: 'Sort By',
        clearFilters: 'Clear Filters',
      },
      priceRanges: {
        all: 'All Prices',
        under50: 'Under $50',
        under100: '$50 - $100',
        under150: '$100 - $150',
        over150: 'Over $150',
      },
      sortOptions: {
        featured: 'Featured',
        priceLowToHigh: 'Price: Low to High',
        priceHighToLow: 'Price: High to Low',
        nameAZ: 'Name: A-Z',
      },
    },
    bg: {
      title: 'Незабравими Преживявания',
      subtitle: 'Открийте уникални преживявания и дейности от нашите партньори',
      browse: 'Вземете Вашата BoomCard',
      featured: 'Препоръчани',
      all: 'Всички Категории',
      dining: 'Хранене',
      wellness: 'Уелнес',
      adventure: 'Приключения',
      culture: 'Култура',
      leisure: 'Отдих',
      bookNow: 'Резервирай',
      learnMore: 'Научи Повече',
      filters: {
        categories: 'Категории',
        priceRange: 'Ценови Диапазон',
        sortBy: 'Сортирай по',
        clearFilters: 'Изчисти Филтри',
      },
      priceRanges: {
        all: 'Всички Цени',
        under50: 'До $50',
        under100: '$50 - $100',
        under150: '$100 - $150',
        over150: 'Над $150',
      },
      sortOptions: {
        featured: 'Препоръчани',
        priceLowToHigh: 'Цена: Ниска към Висока',
        priceHighToLow: 'Цена: Висока към Ниска',
        nameAZ: 'Име: А-Я',
      },
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  const categories = [
    { id: 'all', label: content.all, count: mockExperiences.length },
    { id: 'Dining', label: content.dining, count: mockExperiences.filter(e => e.category === 'Dining').length },
    { id: 'Wellness', label: content.wellness, count: mockExperiences.filter(e => e.category === 'Wellness').length },
    { id: 'Adventure', label: content.adventure, count: mockExperiences.filter(e => e.category === 'Adventure').length },
    { id: 'Culture', label: content.culture, count: mockExperiences.filter(e => e.category === 'Culture').length },
    { id: 'Leisure', label: content.leisure, count: mockExperiences.filter(e => e.category === 'Leisure').length },
  ];

  const priceRanges = [
    { id: 'all', label: content.priceRanges.all },
    { id: 'under50', label: content.priceRanges.under50, min: 0, max: 50 },
    { id: 'under100', label: content.priceRanges.under100, min: 50, max: 100 },
    { id: 'under150', label: content.priceRanges.under150, min: 100, max: 150 },
    { id: 'over150', label: content.priceRanges.over150, min: 150, max: Infinity },
  ];

  const sortOptions = [
    { id: 'featured', label: content.sortOptions.featured },
    { id: 'priceLowToHigh', label: content.sortOptions.priceLowToHigh },
    { id: 'priceHighToLow', label: content.sortOptions.priceHighToLow },
    { id: 'nameAZ', label: content.sortOptions.nameAZ },
  ];

  // Parse price from string (e.g., "From $89" -> 89)
  const parsePrice = (priceStr: string): number => {
    const match = priceStr.match(/\$?(\d+)/);
    return match ? parseInt(match[1]) : 0;
  };

  // Filter experiences
  let filteredExperiences = mockExperiences;

  // Filter by category
  if (selectedCategory !== 'all') {
    filteredExperiences = filteredExperiences.filter(exp => exp.category === selectedCategory);
  }

  // Filter by price range
  if (selectedPriceRange !== 'all') {
    const range = priceRanges.find(r => r.id === selectedPriceRange);
    if (range && range.min !== undefined && range.max !== undefined) {
      filteredExperiences = filteredExperiences.filter(exp => {
        const price = parsePrice(exp.price);
        return price >= range.min && price <= range.max;
      });
    }
  }

  // Sort experiences
  const sortedExperiences = [...filteredExperiences].sort((a, b) => {
    switch (sortBy) {
      case 'priceLowToHigh':
        return parsePrice(a.price) - parsePrice(b.price);
      case 'priceHighToLow':
        return parsePrice(b.price) - parsePrice(a.price);
      case 'nameAZ':
        return a.title.localeCompare(b.title);
      case 'featured':
      default:
        // Featured items first, then by price
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        return parsePrice(a.price) - parsePrice(b.price);
    }
  });

  const clearFilters = () => {
    setSelectedCategory('all');
    setSelectedPriceRange('all');
    setSortBy('featured');
  };

  const hasActiveFilters = selectedCategory !== 'all' || selectedPriceRange !== 'all' || sortBy !== 'featured';

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
              <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center' }}>
                <Link to="/register">
                  <Button variant="primary" size="large">
                    {content.browse}
                  </Button>
                </Link>
              </div>
            </motion.div>
          </HeroContent>
        </Container>
      </Hero>

      <ContentSection>
        <Container>
          <ContentLayout>
            {/* Filter Sidebar */}
            <FilterSidebar>
              {/* Category Filters */}
              <FilterSection>
                <FilterTitle>{content.filters.categories}</FilterTitle>
                {categories.map((category) => (
                  <FilterOption
                    key={category.id}
                    $active={selectedCategory === category.id}
                    onClick={() => setSelectedCategory(category.id)}
                  >
                    <span>{category.label}</span>
                    <span>({category.count})</span>
                  </FilterOption>
                ))}
              </FilterSection>

              {/* Price Range Filters */}
              <FilterSection>
                <FilterTitle>{content.filters.priceRange}</FilterTitle>
                {priceRanges.map((range) => (
                  <FilterOption
                    key={range.id}
                    $active={selectedPriceRange === range.id}
                    onClick={() => setSelectedPriceRange(range.id)}
                  >
                    {range.label}
                  </FilterOption>
                ))}
              </FilterSection>

              {/* Sort Options */}
              <FilterSection>
                <FilterTitle>{content.filters.sortBy}</FilterTitle>
                {sortOptions.map((option) => (
                  <FilterOption
                    key={option.id}
                    $active={sortBy === option.id}
                    onClick={() => setSortBy(option.id)}
                  >
                    {option.label}
                  </FilterOption>
                ))}
              </FilterSection>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <ClearFiltersButton onClick={clearFilters}>
                  {content.filters.clearFilters}
                </ClearFiltersButton>
              )}
            </FilterSidebar>

            {/* Main Content */}
            <MainContent>
              <SectionTitle>
                {selectedCategory === 'all' ? content.featured : categories.find(c => c.id === selectedCategory)?.label}
              </SectionTitle>
              <SectionSubtitle>
                {sortedExperiences.length} {language === 'bg' ? 'преживявания налични' : 'experiences available'}
              </SectionSubtitle>

              <ExperiencesGrid>
                {sortedExperiences.map((experience, index) => (
                  <Link
                    key={experience.id}
                    to={`/offers/${experience.id}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <ExperienceCard
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: index * 0.1 }}
                    >
                      <ExperienceImage $bgImage={experience.imageUrl}>
                        {experience.featured && (
                          <ExperienceBadge variant="warning">
                            {content.featured}
                          </ExperienceBadge>
                        )}
                      </ExperienceImage>

                      <ExperienceContent>
                        <ExperienceTitle>{experience.title}</ExperienceTitle>
                        <ExperienceDescription>
                          {experience.description}
                        </ExperienceDescription>

                        <ExperienceFooter>
                          <div>
                            <ExperiencePrice>{experience.price}</ExperiencePrice>
                            <ExperienceLocation>
                              📍 {experience.location}
                            </ExperienceLocation>
                          </div>
                          <Button variant="primary" size="small">
                            {content.bookNow}
                          </Button>
                        </ExperienceFooter>
                      </ExperienceContent>
                    </ExperienceCard>
                  </Link>
                ))}
              </ExperiencesGrid>
            </MainContent>
          </ContentLayout>
        </Container>
      </ContentSection>
    </PageContainer>
  );
};

export default ExperiencesPage;
