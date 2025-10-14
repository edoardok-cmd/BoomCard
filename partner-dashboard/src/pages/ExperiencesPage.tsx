import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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
  padding: 4rem 0;
`;

const SectionTitle = styled.h2`
  font-size: 2.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 1rem;
  text-align: center;

  [data-theme="dark"] & {
    color: #f9fafb;
  }

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const SectionSubtitle = styled.p`
  font-size: 1.125rem;
  color: #6b7280;
  text-align: center;
  margin-bottom: 3rem;
  max-width: 700px;
  margin-left: auto;
  margin-right: auto;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const ExperiencesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 2rem;
  margin-bottom: 3rem;

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

const CategoriesSection = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 3rem;
`;

const CategoryChip = styled.button<{ $active: boolean }>`
  padding: 0.75rem 1.5rem;
  border: 2px solid ${props => props.$active ? '#000000' : '#e5e7eb'};
  background: ${props => props.$active ? '#000000' : 'white'};
  color: ${props => props.$active ? 'white' : '#6b7280'};
  border-radius: 2rem;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;

  [data-theme="dark"] & {
    border-color: ${props => props.$active ? '#ffffff' : '#374151'};
    background: ${props => props.$active ? '#ffffff' : '#1f2937'};
    color: ${props => props.$active ? '#000000' : '#9ca3af'};
  }

  &:hover {
    border-color: #000000;
    background: ${props => props.$active ? '#000000' : '#f9fafb'};

    [data-theme="dark"] & {
      border-color: #ffffff;
      background: ${props => props.$active ? '#ffffff' : '#374151'};
    }
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

  const t = {
    en: {
      title: 'Unforgettable Experiences',
      subtitle: 'Discover unique experiences and activities from our partner venues',
      browse: 'Get Your BoomCard',
      featured: 'Featured',
      all: 'All',
      dining: 'Dining',
      wellness: 'Wellness',
      adventure: 'Adventure',
      culture: 'Culture',
      leisure: 'Leisure',
      bookNow: 'Book Now',
      learnMore: 'Learn More',
    },
    bg: {
      title: 'Незабравими Преживявания',
      subtitle: 'Открийте уникални преживявания и дейности от нашите партньори',
      browse: 'Вземете Вашата BoomCard',
      featured: 'Препоръчани',
      all: 'Всички',
      dining: 'Хранене',
      wellness: 'Уелнес',
      adventure: 'Приключения',
      culture: 'Култура',
      leisure: 'Отдих',
      bookNow: 'Резервирай',
      learnMore: 'Научи Повече',
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  const categories = [
    { id: 'all', label: content.all },
    { id: 'Dining', label: content.dining },
    { id: 'Wellness', label: content.wellness },
    { id: 'Adventure', label: content.adventure },
    { id: 'Culture', label: content.culture },
    { id: 'Leisure', label: content.leisure },
  ];

  const filteredExperiences = selectedCategory === 'all'
    ? mockExperiences
    : mockExperiences.filter(exp => exp.category === selectedCategory);

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
              <Link to="/register">
                <Button variant="primary" size="large">
                  {content.browse}
                </Button>
              </Link>
            </motion.div>
          </HeroContent>
        </Container>
      </Hero>

      <ContentSection>
        <Container>
          <SectionTitle>
            {selectedCategory === 'all' ? content.featured : categories.find(c => c.id === selectedCategory)?.label}
          </SectionTitle>
          <SectionSubtitle>
            {filteredExperiences.length} experiences available
          </SectionSubtitle>

          <CategoriesSection>
            {categories.map((category) => (
              <CategoryChip
                key={category.id}
                $active={selectedCategory === category.id}
                onClick={() => setSelectedCategory(category.id)}
              >
                {category.label}
              </CategoryChip>
            ))}
          </CategoriesSection>

          <ExperiencesGrid>
            {filteredExperiences.map((experience, index) => (
              <ExperienceCard
                key={experience.id}
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
            ))}
          </ExperiencesGrid>
        </Container>
      </ContentSection>
    </PageContainer>
  );
};

export default ExperiencesPage;
