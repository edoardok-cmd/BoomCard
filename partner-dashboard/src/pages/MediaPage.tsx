import React from 'react';
import GenericPage, { ContentBlock } from '../components/templates/GenericPage';
import { useLanguage } from '../contexts/LanguageContext';
import styled from 'styled-components';

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  margin-bottom: 2rem;
`;

const MediaCard = styled.div`
  background: white;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s;
  cursor: pointer;

  &:hover {
    transform: translateY(-4px);
  }
`;

const MediaImage = styled.div<{ $bg: string }>`
  height: 200px;
  background: url(${p => p.$bg}) center/cover;
`;

const MediaContent = styled.div`
  padding: 1.5rem;
`;

const MediaTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: #111827;
`;

const MediaDescription = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
  line-height: 1.6;
`;

const MediaPage: React.FC = () => {
  const { language } = useLanguage();

  const mediaTypes = [
    {
      id: 1,
      titleEn: 'Photo Gallery',
      titleBg: 'Галерия със снимки',
      descEn: 'Browse through thousands of high-quality photos from our partner venues',
      descBg: 'Разгледайте хиляди висококачествени снимки от нашите партньорски места',
      img: 'https://images.unsplash.com/photo-1471666875520-c75081f42081?w=800',
    },
    {
      id: 2,
      titleEn: '360° Virtual Tours',
      titleBg: '360° Виртуални Обиколки',
      descEn: 'Experience immersive virtual tours of restaurants, hotels, and venues',
      descBg: 'Изживейте имерсивни виртуални обиколки на ресторанти, хотели и места',
      img: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800',
    },
    {
      id: 3,
      titleEn: 'Video Reviews',
      titleBg: 'Видео Ревюта',
      descEn: 'Watch authentic reviews and testimonials from real customers',
      descBg: 'Гледайте автентични ревюта и отзиви от реални клиенти',
      img: 'https://images.unsplash.com/photo-1485217988980-11786ced9454?w=800',
    },
    {
      id: 4,
      titleEn: 'Promotional Videos',
      titleBg: 'Промоционални Видеа',
      descEn: 'Discover exciting promotional content and special event coverage',
      descBg: 'Открийте вълнуващо промоционално съдържание и специални събития',
      img: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=800',
    },
    {
      id: 5,
      titleEn: 'Drone Footage',
      titleBg: 'Дрон Кадри',
      descEn: 'Stunning aerial views of venues and their surroundings',
      descBg: 'Зашеметяващи въздушни изгледи на заведения и околностите им',
      img: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=800',
    },
    {
      id: 6,
      titleEn: 'Behind the Scenes',
      titleBg: 'Зад Кулисите',
      descEn: 'Get exclusive access to behind-the-scenes content from partner venues',
      descBg: 'Получете ексклузивен достъп до съдържание зад кулисите',
      img: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800',
    },
  ];

  return (
    <GenericPage
      titleEn="Media Gallery"
      titleBg="Медийна Галерия"
      subtitleEn="Explore photos, videos, and virtual tours from our partner venues"
      subtitleBg="Разгледайте снимки, видеа и виртуални обиколки от нашите партньорски места"
    >
      <Grid>
        {mediaTypes.map((media) => (
          <MediaCard key={media.id}>
            <MediaImage $bg={media.img} />
            <MediaContent>
              <MediaTitle>
                {language === 'bg' ? media.titleBg : media.titleEn}
              </MediaTitle>
              <MediaDescription>
                {language === 'bg' ? media.descBg : media.descEn}
              </MediaDescription>
            </MediaContent>
          </MediaCard>
        ))}
      </Grid>
    </GenericPage>
  );
};

export default MediaPage;
