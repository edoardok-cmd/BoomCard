import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import ImageGallery from '../components/common/ImageGallery/ImageGallery';
import Button from '../components/common/Button/Button';
import Badge from '../components/common/Badge/Badge';
import Card from '../components/common/Card/Card';
import QRCode from '../components/common/QRCode/QRCode';
import FavoriteButton from '../components/common/FavoriteButton/FavoriteButton';
import ShareButton from '../components/common/ShareButton/ShareButton';
import { useOffer } from '../hooks/useOffers';
import { offersService } from '../services/offers.service';
import toast from 'react-hot-toast';
import { convertBGNToEUR } from '../utils/helpers';

// ─── Menu Modal Styles ─────────────────────────────────────────────────────────

const MenuModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  backdrop-filter: blur(4px);
`;

const MenuModalContent = styled.div`
  background: white;
  border-radius: 1.25rem;
  width: 100%;
  max-width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);

  [data-theme="dark"] & {
    background: #1f2937;
  }
`;

const MenuModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;

  [data-theme="dark"] & {
    border-bottom-color: #374151;
  }
`;

const MenuModalTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const MenuModalClose = styled.button`
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 1px solid #e5e7eb;
  background: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  color: #6b7280;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: #f3f4f6;
    color: #111827;
  }

  [data-theme="dark"] & {
    border-color: #374151;
    &:hover { background: #374151; color: #f9fafb; }
  }
`;

const MenuModalBody = styled.div`
  overflow-y: auto;
  padding: 1.5rem;
  flex: 1;
`;

const MenuNavigation = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1rem;
  flex-shrink: 0;
  padding: 1rem 1.5rem;
  border-top: 1px solid #e5e7eb;

  [data-theme="dark"] & {
    border-top-color: #374151;
  }
`;

const MenuNavBtn = styled.button`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  border: 1px solid #e5e7eb;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  color: #374151;
  transition: background 0.15s;

  &:hover:not(:disabled) { background: #f3f4f6; }
  &:disabled { opacity: 0.35; cursor: default; }

  [data-theme="dark"] & {
    background: #374151;
    border-color: #4b5563;
    color: #d1d5db;
    &:hover:not(:disabled) { background: #4b5563; }
  }
`;

const MenuPageIndicator = styled.span`
  font-size: 0.875rem;
  color: #6b7280;
  min-width: 5rem;
  text-align: center;
`;

const MenuEmptyState = styled.div`
  text-align: center;
  padding: 3rem;
  color: #9ca3af;
  font-size: 0.95rem;
`;

const MenuButtonStyled = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.25rem;
  background: #111827;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  width: 100%;
  justify-content: center;

  &:hover { background: #374151; }

  [data-theme="dark"] & {
    background: #374151;
    &:hover { background: #4b5563; }
  }
`;

const PageContainer = styled.div`
  min-height: 100vh;
  background: #f9fafb;

  [data-theme="dark"] & {
    background: #0a0a0a;
  }
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

  [data-theme="dark"] & {
    color: #9ca3af;
  }

  a {
    color: #6b7280;
    text-decoration: none;
    transition: color 200ms;

    [data-theme="dark"] & {
      color: #9ca3af;
    }

    &:hover {
      color: #111827;

      [data-theme="dark"] & {
        color: #f9fafb;
      }
    }
  }

  span {
    color: #9ca3af;

    [data-theme="dark"] & {
      color: #6b7280;
    }
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

  [data-theme="dark"] & {
    background: #1f2937;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

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

  [data-theme="dark"] & {
    color: #f9fafb;
  }

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

  [data-theme="dark"] & {
    color: #9ca3af;
  }

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

  [data-theme="dark"] & {
    border-bottom-color: #374151;
  }
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

    [data-theme="dark"] & {
      color: #f9fafb;
    }
  }

  span {
    color: #6b7280;

    [data-theme="dark"] & {
      color: #9ca3af;
    }
  }
`;

const PartnerName = styled.div`
  font-size: 1rem;
  color: #6b7280;

  [data-theme="dark"] & {
    color: #9ca3af;
  }

  strong {
    color: #111827;
    font-weight: 600;

    [data-theme="dark"] & {
      color: #f9fafb;
    }
  }
`;

const Description = styled.div`
  font-size: 1.0625rem;
  line-height: 1.7;
  color: #4b5563;
  margin-bottom: 1.5rem;

  [data-theme="dark"] & {
    color: #d1d5db;
  }
`;

const Section = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 1rem;
  margin-bottom: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

  [data-theme="dark"] & {
    background: #1f2937;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  @media (max-width: 768px) {
    padding: 1.5rem;
  }
`;

const SectionTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 1.5rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
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

  [data-theme="dark"] & {
    color: #d1d5db;
  }

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

  [data-theme="dark"] & {
    color: #6b7280;
  }
`;

const DiscountedPrice = styled.div`
  font-size: 3rem;
  font-weight: 700;
  color: #111827;
  line-height: 1;

  [data-theme="dark"] & {
    color: #f9fafb;
  }

  span {
    font-size: 1.5rem;
    font-weight: 600;
    color: #6b7280;
    margin-left: 0.5rem;

    [data-theme="dark"] & {
      color: #9ca3af;
    }
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

  [data-theme="dark"] & {
    background: #374151;
    color: #9ca3af;
  }

  strong {
    color: #111827;
    font-weight: 600;

    [data-theme="dark"] & {
      color: #f9fafb;
    }
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

  [data-theme="dark"] & {
    border-bottom-color: #374151;
    color: #d1d5db;
  }

  &:last-child {
    border-bottom: none;
  }

  strong {
    color: #111827;
    font-weight: 600;

    [data-theme="dark"] & {
      color: #f9fafb;
    }
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

  [data-theme="dark"] & {
    background: #374151;
    color: #9ca3af;
  }
`;

const AddressText = styled.p`
  color: #6b7280;
  margin-bottom: 1rem;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

// ─── Menu Modal Component ──────────────────────────────────────────────────────

interface MenuModalProps {
  images: string[];
  title: string;
  onClose: () => void;
}

const MenuModal: React.FC<MenuModalProps> = ({ images, title, onClose }) => {
  const [page, setPage] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <MenuModalOverlay ref={overlayRef} onClick={handleOverlayClick}>
      <MenuModalContent>
        <MenuModalHeader>
          <MenuModalTitle>
            <span>🍽️</span>
            {title} — Menu
          </MenuModalTitle>
          <MenuModalClose onClick={onClose} aria-label="Close">×</MenuModalClose>
        </MenuModalHeader>

        <MenuModalBody>
          {images.length === 0 ? (
            <MenuEmptyState>No menu images available.</MenuEmptyState>
          ) : (
            <img
              src={images[page]}
              alt={`Menu page ${page + 1}`}
              style={{ width: '100%', borderRadius: '0.75rem', display: 'block', objectFit: 'contain', maxHeight: '65vh' }}
            />
          )}
        </MenuModalBody>

        {images.length > 1 && (
          <MenuNavigation>
            <MenuNavBtn onClick={() => setPage((p) => p - 1)} disabled={page === 0}>‹</MenuNavBtn>
            <MenuPageIndicator>Page {page + 1} of {images.length}</MenuPageIndicator>
            <MenuNavBtn onClick={() => setPage((p) => p + 1)} disabled={page === images.length - 1}>›</MenuNavBtn>
          </MenuNavigation>
        )}
      </MenuModalContent>
    </MenuModalOverlay>
  );
};

// ─── Page ──────────────────────────────────────────────────────────────────────

const VenueDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { language, t } = useLanguage();
  const [isActivating, setIsActivating] = useState(false);
  const [activationCode, setActivationCode] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: offerDetails, isLoading, isError } = useOffer(id);

  if (isLoading) {
    return (
      <PageContainer>
        <Container>
          <div style={{ textAlign: 'center', padding: '4rem', color: '#6b7280' }}>
            {language === 'bg' ? 'Зареждане...' : 'Loading...'}
          </div>
        </Container>
      </PageContainer>
    );
  }

  if (isError || !offerDetails) {
    return <Navigate to="/offers" replace />;
  }

  // Access gating is handled server-side; if the offer is returned it's redeemable
  const isLocked = false;

  const handleActivate = async () => {
    if (!id || isLocked) return;
    setIsActivating(true);
    try {
      // Require GPS location — user must be at the venue
      let location: { latitude: number; longitude: number };
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          });
        });
        location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
      } catch {
        toast.error(
          language === 'bg'
            ? 'Моля, разрешете достъп до местоположение, за да активирате офертата'
            : 'Please allow location access to activate this offer',
        );
        setIsActivating(false);
        return;
      }

      const result = await offersService.activateOffer(id, location);
      if (result.success && result.code) {
        setActivationCode(result.code);
        toast.success(language === 'bg' ? 'Офертата е активирана!' : 'Offer activated!');
      } else {
        toast.error(result.message || (language === 'bg' ? 'Грешка при активиране' : 'Activation failed'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (language === 'bg' ? 'Грешка при активиране' : 'Activation failed'));
    } finally {
      setIsActivating(false);
    }
  };

  // Parse menu images from offer's partner venue data
  const menuImages: string[] = (() => {
    try {
      const offerWithMenu = offerDetails as (typeof offerDetails & {
        partner?: { venue?: { menuImages?: string | string[] } };
        menuImages?: string | string[];
      }) | null | undefined;
      const raw = offerWithMenu?.partner?.venue?.menuImages || offerWithMenu?.menuImages;
      if (!raw) return [];
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  // Map offer data to venue format for display
  const venue = {
    id: offerDetails.id,
    title: language === 'bg' ? (offerDetails.titleBg || offerDetails.title) : offerDetails.title,
    category: language === 'bg' ? (offerDetails.categoryBg || offerDetails.category) : offerDetails.category,
    location: offerDetails.location || offerDetails.partner?.city || 'Bulgaria',
    locationBg: offerDetails.location || offerDetails.partner?.city || 'Bulgaria',
    rating: offerDetails.rating,
    reviewCount: offerDetails.reviewCount,
    partnerName: offerDetails.partnerName || offerDetails.partner?.businessName || '',
    discount: offerDetails.discount || offerDetails.discountPercent || 0,
    originalPrice: offerDetails.originalPrice || 0,
    discountedPrice: offerDetails.discountedPrice || 0,
    savings: (offerDetails.originalPrice || 0) - (offerDetails.discountedPrice || 0),
    description: language === 'bg' ? (offerDetails.descriptionBg || offerDetails.description) : offerDetails.description,
    features: [
      { icon: '✓', text: language === 'bg' ? `${offerDetails.discount || offerDetails.discountPercent || 0}% отстъпка` : `${offerDetails.discount || offerDetails.discountPercent || 0}% discount` },
      { icon: '✓', text: language === 'bg' ? 'Валидно с BOOM Card' : 'Valid with BOOM Card' },
      { icon: '✓', text: language === 'bg' ? 'Лесно активиране' : 'Easy activation' },
      { icon: '✓', text: language === 'bg' ? 'Моментална валидация' : 'Instant validation' },
    ],
    images: offerDetails.imageUrl ? [offerDetails.imageUrl, offerDetails.imageUrl, offerDetails.imageUrl] : [],
    validUntil: offerDetails.validUntil
      ? new Date(offerDetails.validUntil).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : (language === 'bg' ? '31 Декември 2025' : 'December 31, 2025'),
    phone: offerDetails.partner?.['phone' as keyof typeof offerDetails.partner] as string || '+359 88 123 4567',
    email: offerDetails.partner?.['email' as keyof typeof offerDetails.partner] as string || 'contact@boomcard.bg',
    website: offerDetails.partner?.['website' as keyof typeof offerDetails.partner] as string || 'www.boomcard.bg',
    address: offerDetails.location || offerDetails.partner?.city || 'Bulgaria',
  };

  return (
    <PageContainer>
      {menuOpen && (
        <MenuModal
          images={menuImages}
          title={venue.title}
          onClose={() => setMenuOpen(false)}
        />
      )}
      <Container>
        <Breadcrumb>
          <Link to="/offers">{t('venueDetail.home')}</Link>
          <span>/</span>
          <Link to="/venues/spa">{venue.category}</Link>
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
              <AddressText>
                {venue.address}
              </AddressText>
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
                {activationCode ? (
                  <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '0.5rem', padding: '1rem', textAlign: 'center', width: '100%' }}>
                    <div style={{ fontSize: '0.75rem', color: '#166534', marginBottom: '0.25rem', fontWeight: 600 }}>
                      {language === 'bg' ? 'Вашият код:' : 'Your code:'}
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#15803d', letterSpacing: '0.1em' }}>
                      {activationCode}
                    </div>
                  </div>
                ) : isLocked ? (
                  <Button variant="secondary" size="large" disabled>
                    {language === 'bg' ? '🔒 Надградете абонамента' : '🔒 Upgrade to unlock'}
                  </Button>
                ) : (
                  <Button variant="primary" size="large" onClick={handleActivate} disabled={isActivating}>
                    {isActivating
                      ? (language === 'bg' ? 'Активиране...' : 'Activating...')
                      : t('venueDetail.getThisOffer')}
                  </Button>
                )}
                {menuImages.length > 0 && (
                  <MenuButtonStyled onClick={() => setMenuOpen(true)}>
                    🍽️ {language === 'bg' ? 'Виж менюто' : 'View Menu'}
                  </MenuButtonStyled>
                )}
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
              />
            </div>
          </Sidebar>
        </ContentGrid>
      </Container>
    </PageContainer>
  );
};

export default VenueDetailPage;
