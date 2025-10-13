import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import ImageGallery from '../components/common/ImageGallery/ImageGallery';
import Button from '../components/common/Button/Button';
import Badge from '../components/common/Badge/Badge';
import Card from '../components/common/Card/Card';
import QRCode from '../components/common/QRCode/QRCode';
import FavoriteButton from '../components/common/FavoriteButton/FavoriteButton';
import ShareButton from '../components/common/ShareButton/ShareButton';
import { convertBGNToEUR } from '../utils/helpers';

const PageContainer = styled.div`
  min-height: 100vh;
  background: #f9fafb;
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem 1.5rem;

  @media (max-width: 768px) {
    padding: 1rem;
  }
`;

const Breadcrumb = styled.div`
  display: flex;
  gap: 0.5rem;
  font-size: 0.875rem;
  margin-bottom: 2rem;
  color: #6b7280;

  a {
    color: #6b7280;
    text-decoration: none;
    transition: color 200ms;

    &:hover {
      color: #111827;
    }
  }

  span {
    color: #9ca3af;
  }
`;

const ContentGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 2rem;
  align-items: start;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

const MainContent = styled.div``;

const Sidebar = styled.aside`
  position: sticky;
  top: 5rem;

  @media (max-width: 1024px) {
    position: static;
  }
`;

const GalleryWrapper = styled.div`
  margin-bottom: 2rem;
`;

const HeaderSection = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 1rem;
  margin-bottom: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

  @media (max-width: 768px) {
    padding: 1.5rem;
  }
`;

const BadgeRow = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
`;

const Title = styled.h1`
  font-size: 2.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 1rem;
  line-height: 1.2;

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const Location = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  color: #6b7280;
  margin-bottom: 1rem;

  svg {
    width: 1.25rem;
    height: 1.25rem;
  }
`;

const RatingRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
`;

const Rating = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.125rem;

  svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: #fbbf24;
  }

  strong {
    font-weight: 600;
    color: #111827;
  }

  span {
    color: #6b7280;
  }
`;

const PartnerName = styled.div`
  font-size: 1rem;
  color: #6b7280;

  strong {
    color: #111827;
    font-weight: 600;
  }
`;

const Description = styled.div`
  font-size: 1.0625rem;
  line-height: 1.7;
  color: #4b5563;
  margin-bottom: 1.5rem;
`;

const Section = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 1rem;
  margin-bottom: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

  @media (max-width: 768px) {
    padding: 1.5rem;
  }
`;

const SectionTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 1.5rem;
`;

const FeaturesList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
`;

const FeatureItem = styled.li`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.9375rem;
  color: #4b5563;

  svg {
    width: 1.25rem;
    height: 1.25rem;
    color: #10b981;
    flex-shrink: 0;
  }
`;

const PriceCard = styled(Card)`
  padding: 2rem;

  @media (max-width: 768px) {
    padding: 1.5rem;
  }
`;

const DiscountBadge = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #000000;
  color: white;
  padding: 0.5rem 1.25rem;
  border-radius: 9999px;
  font-weight: 700;
  font-size: 1.5rem;
  margin-bottom: 1.5rem;
`;

const PriceSection = styled.div`
  margin-bottom: 2rem;
`;

const OriginalPrice = styled.div`
  font-size: 1.125rem;
  color: #9ca3af;
  text-decoration: line-through;
  margin-bottom: 0.5rem;
`;

const DiscountedPrice = styled.div`
  font-size: 3rem;
  font-weight: 700;
  color: #111827;
  line-height: 1;

  span {
    font-size: 1.5rem;
    font-weight: 600;
    color: #6b7280;
    margin-left: 0.5rem;
  }
`;

const Savings = styled.div`
  font-size: 1rem;
  color: #10b981;
  font-weight: 600;
  margin-top: 0.5rem;
`;

const ValidityInfo = styled.div`
  background: #f3f4f6;
  padding: 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 1.5rem;

  strong {
    color: #111827;
    font-weight: 600;
  }
`;

const ActionButtons = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const InfoList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 1.5rem 0 0 0;
`;

const InfoItem = styled.li`
  padding: 0.75rem 0;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.9375rem;
  color: #4b5563;

  &:last-child {
    border-bottom: none;
  }

  strong {
    color: #111827;
    font-weight: 600;
  }
`;

const Map = styled.div`
  width: 100%;
  height: 300px;
  background: #e5e7eb;
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  font-size: 0.875rem;
  margin-top: 1.5rem;
`;

const VenueDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { language, t } = useLanguage();

  // Sample data - would come from API in real implementation
  const venue = {
    id: '1',
    title: language === 'bg' ? 'Спа уикенд в Банско' : 'Spa Weekend in Bansko',
    category: language === 'bg' ? 'Спа и уелнес' : 'Spa & Wellness',
    location: 'Bansko, Bulgaria',
    locationBg: 'Банско, България',
    rating: 4.8,
    reviewCount: 124,
    partnerName: 'Kempinski Hotel Grand Arena',
    discount: 70,
    originalPrice: 800,
    discountedPrice: 240,
    savings: 560,
    description: language === 'bg'
      ? 'Насладете се на незабравим спа уикенд в сърцето на планината Пирин. Луксозният Kempinski Hotel Grand Arena предлага пакет от премиум спа третирания, включващ масажи, сауна, парна баня и достъп до вътрешен басейн с минерална вода. Перфектно място за релаксация и възстановяване.'
      : 'Enjoy an unforgettable spa weekend in the heart of Pirin Mountain. The luxurious Kempinski Hotel Grand Arena offers a premium spa package including massages, sauna, steam bath, and access to an indoor mineral water pool. Perfect place for relaxation and recovery.',
    features: [
      { icon: '✓', text: language === 'bg' ? '2 нощувки' : '2 nights accommodation' },
      { icon: '✓', text: language === 'bg' ? '3 спа третирания' : '3 spa treatments' },
      { icon: '✓', text: language === 'bg' ? 'Неограничен достъп до басейн' : 'Unlimited pool access' },
      { icon: '✓', text: language === 'bg' ? 'Закуска включена' : 'Breakfast included' },
      { icon: '✓', text: language === 'bg' ? 'Безплатен Wi-Fi' : 'Free Wi-Fi' },
      { icon: '✓', text: language === 'bg' ? 'Паркинг' : 'Parking' },
    ],
    images: [
      'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1200',
      'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=1200',
      'https://images.unsplash.com/photo-1596178060810-4dd26d6c0d07?w=1200',
      'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1200',
      'https://images.unsplash.com/photo-1562790351-d273a961e0e9?w=1200',
    ],
    validUntil: language === 'bg' ? '31 Март 2025' : 'March 31, 2025',
    phone: '+359 88 123 4567',
    email: 'spa@kempinski-bansko.com',
    website: 'www.kempinski-bansko.com',
    address: language === 'bg' ? 'бул. Пирин 96, Банско 2770' : '96 Pirin Blvd, Bansko 2770',
  };

  return (
    <PageContainer>
      <Container>
        <Breadcrumb>
          <Link to="/">{t('venueDetail.home')}</Link>
          <span>/</span>
          <Link to="/categories/spa">{venue.category}</Link>
          <span>/</span>
          <span>{venue.title}</span>
        </Breadcrumb>

        <ContentGrid>
          <MainContent>
            <GalleryWrapper>
              <ImageGallery images={venue.images} alt={venue.title} />
            </GalleryWrapper>

            <HeaderSection>
              <BadgeRow>
                <Badge variant="default">{venue.category}</Badge>
                <Badge variant="success">
                  {t('venueDetail.available')}
                </Badge>
              </BadgeRow>

              <Title>{venue.title}</Title>

              <Location>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <span>{language === 'bg' ? venue.locationBg : venue.location}</span>
              </Location>

              <RatingRow>
                <Rating>
                  <svg viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  <strong>{venue.rating}</strong>
                  <span>({venue.reviewCount} {t('venueDetail.reviews')})</span>
                </Rating>

                <PartnerName>
                  <strong>{t('venueDetail.partner')}</strong> {venue.partnerName}
                </PartnerName>
              </RatingRow>

              <Description>{venue.description}</Description>
            </HeaderSection>

            <Section>
              <SectionTitle>{t('venueDetail.whatsIncluded')}</SectionTitle>
              <FeaturesList>
                {venue.features.map((feature, index) => (
                  <FeatureItem key={index}>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span>{feature.text}</span>
                  </FeatureItem>
                ))}
              </FeaturesList>
            </Section>

            <Section>
              <SectionTitle>{t('venueDetail.location')}</SectionTitle>
              <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
                {venue.address}
              </p>
              <Map>
                {t('venueDetail.mapIntegration')}
              </Map>
            </Section>
          </MainContent>

          <Sidebar>
            <PriceCard>
              <DiscountBadge>-{venue.discount}%</DiscountBadge>

              <PriceSection>
                <OriginalPrice>
                  {venue.originalPrice} {language === 'bg' ? 'лв.' : 'BGN'} / €{convertBGNToEUR(venue.originalPrice)}
                </OriginalPrice>
                <DiscountedPrice>
                  {venue.discountedPrice}
                  <span>{language === 'bg' ? 'лв.' : 'BGN'} / €{convertBGNToEUR(venue.discountedPrice)}</span>
                </DiscountedPrice>
                <Savings>
                  {t('venueDetail.youSave')} {venue.savings} {language === 'bg' ? 'лв.' : 'BGN'} / €{convertBGNToEUR(venue.savings)}
                </Savings>
              </PriceSection>

              <ValidityInfo>
                <strong>{t('venueDetail.validUntil')}</strong> {venue.validUntil}
              </ValidityInfo>

              <ActionButtons>
                <Button variant="primary" size="large">
                  {t('venueDetail.getThisOffer')}
                </Button>
                <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                  <FavoriteButton
                    offerId={venue.id}
                    offerData={{
                      title: venue.title,
                      titleBg: venue.title,
                      category: venue.category,
                      categoryBg: venue.category,
                      location: venue.location,
                      discount: venue.discount,
                      originalPrice: venue.originalPrice,
                      discountedPrice: venue.discountedPrice,
                      imageUrl: venue.images[0],
                      path: `/offers/${venue.id}`
                    }}
                    variant="button"
                    language={language}
                  />
                  <ShareButton
                    url={window.location.href}
                    title={venue.title}
                    description={venue.description}
                    buttonText={t('venueDetail.share')}
                  />
                </div>
              </ActionButtons>

              <InfoList>
                <InfoItem>
                  <strong>{t('venueDetail.phone')}</strong> {venue.phone}
                </InfoItem>
                <InfoItem>
                  <strong>{t('venueDetail.email')}</strong> {venue.email}
                </InfoItem>
                <InfoItem>
                  <strong>{t('venueDetail.website')}</strong> {venue.website}
                </InfoItem>
              </InfoList>
            </PriceCard>

            <div style={{ marginTop: '2rem' }}>
              <QRCode
                data={`https://boomcard.bg/offers/${venue.id}?code=SAVE${venue.discount}`}
                size={200}
                title={t('venueDetail.offerQRCode')}
                description={t('venueDetail.scanToRedeem')}
                language={language}
              />
            </div>
          </Sidebar>
        </ContentGrid>
      </Container>
    </PageContainer>
  );
};

export default VenueDetailPage;
