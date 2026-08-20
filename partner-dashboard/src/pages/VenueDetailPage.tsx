import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, Navigate, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
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
import { formatEUR } from '../utils/helpers';

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
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
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

  // LOW-1 fix: source isLocked from offer data if the backend provides it; otherwise
  // default to false. The dead `isLocked = true` UI branch (showing "Upgrade to unlock")
  // is now reachable if the API ever returns an offer with isLocked:true. The old
  // hardcoded `false` made that branch permanently unreachable, hiding tier-gating bugs.
  // LOW-3 fix: isLocked is now a declared optional field on OfferDetails, so it is
  // read through the proper type instead of an `as unknown` double-cast.
  const isLocked = !!offerDetails.isLocked;

  const handleActivate = async () => {
    if (!id || isLocked) return;
    // LOW-3 fix: require authentication before requesting GPS. Without this,
    // unauthenticated users get a GPS permission dialog followed by a silent
    // 401 error with no "please log in" guidance.
    if (!isAuthenticated) {
      toast.error(
        language === 'bg'
          ? 'Моля, влезте в профила си, за да активирате отстъпката'
          : 'Please sign in to activate this offer',
      );
      navigate('/login', { state: { from: { pathname: `/offers/${id}` } } });
      return;
    }
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
            ? 'Моля, разрешете достъп до местоположение, за да активирате отстъпката'
            : 'Please allow location access to activate this offer',
        );
        setIsActivating(false);
        return;
      }

      const result = await offersService.activateOffer(id, location);
      if (result.success && result.code) {
        setActivationCode(result.code);
        toast.success(language === 'bg' ? 'Отстъпката е активирана!' : 'Offer activated!');
      } else {
        toast.error(result.message || (language === 'bg' ? 'Грешка при активиране' : 'Activation failed'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (language === 'bg' ? 'Грешка при активиране' : 'Activation failed'));
    } finally {
      setIsActivating(false);
    }
  };

  // Parse menu URLs from the offer's partner venues.
  // LOW fix: the backend returns `partner.venues` (plural array) where each entry
  // is { id, name, city, menuUrl } and only APPROVED menus with a non-null
  // menuUrl are included (offers.service.ts partner select). The previous code
  // read `partner.venue.menuImages` — a singular relation and a field that do
  // not exist on the response — so 'View Menu' was always dead. We collect the
  // menuUrl from each venue; when none exist the button is hidden (see below).
  const menuImages: string[] = (() => {
    const offerWithMenu = offerDetails as (typeof offerDetails & {
      partner?: { venues?: Array<{ menuUrl?: string | null }> };
    }) | null | undefined;
    const venues = offerWithMenu?.partner?.venues;
    if (!Array.isArray(venues)) return [];
    return venues
      .map(v => v?.menuUrl)
      .filter((url): url is string => typeof url === 'string' && url.length > 0);
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
    // MEDIUM fix (re-audit): the backend has no price model, so absolute BGN amounts
    // were fabricated upstream (mapOffer) and rendered here as real money. Only the
    // discount PERCENTAGE is genuine. Pass prices through ONLY when the backend
    // actually provides them; the price card now presents the discount % otherwise.
    originalPrice: offerDetails.originalPrice,
    discountedPrice: offerDetails.discountedPrice,
    description: language === 'bg' ? (offerDetails.descriptionBg || offerDetails.description) : offerDetails.description,
    features: [
      { icon: '✓', text: language === 'bg' ? `${offerDetails.discount || offerDetails.discountPercent || 0}% отстъпка` : `${offerDetails.discount || offerDetails.discountPercent || 0}% discount` },
      { icon: '✓', text: language === 'bg' ? 'Валидно с BOOM Card' : 'Valid with BOOM Card' },
      { icon: '✓', text: language === 'bg' ? 'Лесно активиране' : 'Easy activation' },
      { icon: '✓', text: language === 'bg' ? 'Моментална валидация' : 'Instant validation' },
    ],
    // LOW-2 fix: do not triplicate the same image URL into the gallery. A single
    // imageUrl becomes a one-element array; a future multi-image API can replace
    // this with `offerDetails.images ?? (offerDetails.imageUrl ? [offerDetails.imageUrl] : [])`.
    images: offerDetails.imageUrl ? [offerDetails.imageUrl] : [],
    // MEDIUM-2 fix: replace the hardcoded "December 31, 2025" fallback (now an
    // expired date — today is 2026-06-02) with a locale-appropriate no-expiry label
    // so offers without validUntil don't mislead users into thinking they've expired.
    validUntil: offerDetails.validUntil
      ? new Date(offerDetails.validUntil).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : (language === 'bg' ? 'Без краен срок' : 'No expiry date'),
    // LOW-1 fix: do NOT fall back to hardcoded placeholder contact details
    // (+359 88 123 4567 / contact@boomcard.bg / www.boomcard.bg). Fabricated
    // contact info misleads users. When the backend omits these fields we
    // render nothing for them (see conditional InfoItems below).
    phone: (offerDetails.partner?.['phone' as keyof typeof offerDetails.partner] as string) || '',
    email: (offerDetails.partner?.['email' as keyof typeof offerDetails.partner] as string) || '',
    website: (offerDetails.partner?.['website' as keyof typeof offerDetails.partner] as string) || '',
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

              {/* MEDIUM fix (re-audit): the backend has no price model, so absolute
                  BGN amounts were fabricated (mapOffer hardcoded ~200 BGN) and shown
                  here as real money ("200 → 160, save 40"). Only the discount
                  PERCENTAGE is genuine, so present the offer by its percentage. If a
                  future backend genuinely provides both prices, the optional block
                  below renders them as plain EUR (BC-QA-031 — the backend emits EUR
                  scalars and the frontend applies no conversion). */}
              <PriceSection>
                <DiscountedPrice>
                  {venue.discount}% {language === 'bg' ? 'отстъпка' : 'discount'}
                </DiscountedPrice>
                {typeof venue.originalPrice === 'number' && typeof venue.discountedPrice === 'number' && (
                  <>
                    <OriginalPrice>
                      {formatEUR(venue.originalPrice)}
                    </OriginalPrice>
                    <Savings>
                      {t('venueDetail.youSave')} {formatEUR(venue.originalPrice - venue.discountedPrice)}
                    </Savings>
                  </>
                )}
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
                      // No backend price model — use 0 as the established "no price"
                      // sentinel (OfferCard / FavoritesContext already treat 0 as
                      // "hide price"). Do not fabricate absolute BGN amounts.
                      originalPrice: venue.originalPrice ?? 0,
                      discountedPrice: venue.discountedPrice ?? 0,
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

              {/* LOW-1 fix: only render contact rows the partner actually
                  provides. No hardcoded placeholder fallbacks. */}
              {(venue.phone || venue.email || venue.website) && (
                <InfoList>
                  {venue.phone && (
                    <InfoItem>
                      <strong>{t('venueDetail.phone')}</strong> {venue.phone}
                    </InfoItem>
                  )}
                  {venue.email && (
                    <InfoItem>
                      <strong>{t('venueDetail.email')}</strong> {venue.email}
                    </InfoItem>
                  )}
                  {venue.website && (
                    <InfoItem>
                      <strong>{t('venueDetail.website')}</strong> {venue.website}
                    </InfoItem>
                  )}
                </InfoList>
              )}
            </PriceCard>

            {/*
              LOW-2 fix: this QR is a DISPLAY/SHARE placeholder only — it links
              to the public offer detail page so a user can reopen or share the
              offer. It is NOT a redemption token. The previous `?code=SAVE{discount}`
              param implied a guessable, redeemable code; it has been removed so the
              QR cannot be mistaken for a real redemption credential. Actual
              redemption happens via handleActivate() -> offersService.activateOffer(),
              which returns a server-issued single-use code (`activationCode`).
            */}
            <div style={{ marginTop: '2rem' }}>
              <QRCode
                data={`https://boomcard.bg/offers/${venue.id}`}
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
