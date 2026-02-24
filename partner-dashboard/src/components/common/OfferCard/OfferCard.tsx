import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import Badge from '../Badge/Badge';
import FavoriteButton from '../FavoriteButton/FavoriteButton';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { Entity, CardEntity } from '../../../types/entity.types';

interface OfferCardProps {
  /** Unified entity data */
  entity: Entity | CardEntity;
  className?: string;
  /** Callback when "Book" CTA is clicked (experience cards). Prevents navigation. */
  onBookClick?: (entity: Entity | CardEntity) => void;
}

// Normalized card data shape (internal)
interface CardData {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  imageUrl: string;
  discount: number;
  originalPrice: number;
  discountedPrice: number;
  rating?: number;
  reviewCount?: number;
  workingHours?: string;
  path: string;
  partnerName: string;
  tags?: string[];
  // Fields for FavoriteButton legacy shape
  titleEn: string;
  titleBg: string;
  categoryEn: string;
  categoryBg: string;
  // Experience-specific fields
  isExperience?: boolean;
  durationDisplay?: string;
  experienceType?: string;
  price?: number;
  savings?: number;
}

function normalizeEntity(entity: Entity | CardEntity, language: 'en' | 'bg'): CardData {
  const exp = entity.experience;
  const originalPrice = entity.discount?.originalPrice ?? exp?.price ?? 0;
  const discountedPrice = entity.discount?.discountedPrice ?? 0;

  return {
    id: entity.id,
    title: language === 'bg' ? entity.name.bg : entity.name.en,
    description: language === 'bg' ? entity.description.bg : entity.description.en,
    category: language === 'bg' ? entity.category.bg : entity.category.en,
    location: entity.location.displayBg && language === 'bg'
      ? entity.location.displayBg
      : entity.location.display,
    imageUrl: entity.images.hero,
    discount: entity.discount?.percent ?? 0,
    originalPrice,
    discountedPrice,
    rating: entity.rating,
    reviewCount: entity.reviewCount,
    workingHours: language === 'bg'
      ? (entity.workingHours?.displayBg || entity.workingHours?.display)
      : (entity.workingHours?.display || entity.workingHours?.displayBg),
    path: entity.path,
    partnerName: entity.partnerName
      ? (language === 'bg' ? entity.partnerName.bg : entity.partnerName.en)
      : '',
    tags: entity.tags?.slice(0, 2).map(t => language === 'bg' ? t.bg : t.en),
    titleEn: entity.name.en,
    titleBg: entity.name.bg,
    categoryEn: entity.category.en,
    categoryBg: entity.category.bg,
    // Experience-specific
    isExperience: entity.kind === 'experience' || !!exp,
    durationDisplay: exp
      ? (language === 'bg' ? exp.durationDisplay.bg : exp.durationDisplay.en)
      : undefined,
    experienceType: exp?.type,
    price: exp?.price,
    savings: originalPrice > 0 && discountedPrice > 0
      ? originalPrice - discountedPrice
      : 0,
  };
}

const CardContainer = styled(motion.div)`
  background: var(--color-background);
  border-radius: 1.5rem;
  overflow: hidden;
  box-shadow: var(--shadow-soft);
  border: 1px solid var(--color-border);
  transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;

  /* Color mode - vibrant gradient border */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #fff5e1 0%, #ffe4f1 50%, #e8f4ff 100%);
    border: 3px solid transparent;
    box-shadow:
      0 8px 35px -5px rgba(255, 69, 0, 0.3),
      0 10px 40px -5px rgba(255, 0, 110, 0.25),
      0 6px 30px -5px rgba(0, 212, 255, 0.2);
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 1.5rem;
    padding: 2px;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0;
    transition: opacity 400ms cubic-bezier(0.4, 0, 0.2, 1);

    [data-theme="color"] & {
      background: linear-gradient(135deg, #ff4500, #ff006e, #00d4ff, #b24bf3);
      padding: 3px;
    }
  }

  &:hover {
    box-shadow: var(--shadow-hover);
    transform: translateY(-12px) scale(1.02);
    border-color: var(--color-primary);

    [data-theme="color"] & {
      box-shadow:
        0 15px 55px -5px rgba(255, 69, 0, 0.5),
        0 18px 60px -5px rgba(255, 0, 110, 0.4),
        0 12px 50px -5px rgba(0, 212, 255, 0.35);
    }

    &::before {
      opacity: 1;
    }
  }
`;

const ImageContainer = styled.div`
  position: relative;
  width: 100%;
  padding-top: 66.67%; /* 3:2 aspect ratio */
  overflow: hidden;
  background: var(--color-background-secondary);
`;

const Image = styled.img`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 400ms cubic-bezier(0.4, 0, 0.2, 1);

  ${CardContainer}:hover & {
    transform: scale(1.05);
  }
`;

const DiscountBadge = styled.div`
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  color: #ffffff;
  padding: 0.5rem 1rem;
  border-radius: 0.75rem;
  font-weight: 800;
  font-size: 1.25rem;
  box-shadow:
    0 4px 16px rgba(220, 38, 38, 0.4),
    0 8px 32px rgba(0, 0, 0, 0.15);
  letter-spacing: -0.02em;
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.2);
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 5;
  line-height: 1;

  /* Color mode - vibrant gradient badge */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #ff4500 0%, #ff006e 100%);
    color: #ffffff;
    border: 2px solid rgba(255, 255, 255, 0.3);
    box-shadow:
      0 6px 25px rgba(255, 69, 0, 0.6),
      0 8px 35px rgba(255, 0, 110, 0.4);
  }

  ${CardContainer}:hover & {
    transform: scale(1.08);
    box-shadow:
      0 6px 20px rgba(220, 38, 38, 0.5),
      0 10px 40px rgba(0, 0, 0, 0.2);

    [data-theme="color"] & {
      box-shadow:
        0 8px 35px rgba(255, 69, 0, 0.8),
        0 10px 45px rgba(255, 0, 110, 0.6);
    }
  }
`;

const FavoriteButtonWrapper = styled.div`
  position: absolute;
  top: 1rem;
  left: 1rem;
  z-index: 10;
`;

const Content = styled.div`
  padding: 1.25rem 1.5rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
`;

const CategoryBadgeWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
`;

const Title = styled.h3`
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 0.375rem;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  letter-spacing: -0.02em;
  transition: color 300ms cubic-bezier(0.4, 0, 0.2, 1);

  ${CardContainer}:hover & {
    color: var(--color-primary);
  }
`;

const Description = styled.p`
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  line-height: 1.55;
  margin-bottom: 0.75rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  letter-spacing: -0.01em;
  min-height: 2.4em;
`;

const MetaInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
`;

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

const Location = styled.div`
  display: flex;
  align-items: center;
  gap: 0.3rem;

  svg {
    flex-shrink: 0;
    color: var(--color-primary);
  }
`;

const GoogleRating = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: rgba(251, 191, 36, 0.1);
  padding: 0.2rem 0.5rem;
  border-radius: 0.375rem;
  border: 1px solid rgba(251, 191, 36, 0.2);
`;

const GoogleIcon = styled.span`
  display: flex;
  align-items: center;
  font-size: 0.75rem;
`;

const RatingStars = styled.div`
  display: flex;
  align-items: center;
  gap: 1px;
`;

const WorkingHoursDisplay = styled.div`
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  color: var(--color-text-tertiary, #9ca3af);

  svg {
    flex-shrink: 0;
  }
`;

const DurationBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--color-text-secondary);

  svg {
    flex-shrink: 0;
    color: var(--color-primary);
  }
`;

const ExperienceTypeBadge = styled.span<{ $type?: string }>`
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  background: ${props =>
    props.$type === 'vip' ? 'rgba(245, 158, 11, 0.12)' :
    props.$type === 'private' ? 'rgba(139, 92, 246, 0.12)' :
    'rgba(59, 130, 246, 0.12)'
  };
  color: ${props =>
    props.$type === 'vip' ? '#b45309' :
    props.$type === 'private' ? '#6d28d9' :
    '#1d4ed8'
  };
  border: 1px solid ${props =>
    props.$type === 'vip' ? 'rgba(245, 158, 11, 0.25)' :
    props.$type === 'private' ? 'rgba(139, 92, 246, 0.25)' :
    'rgba(59, 130, 246, 0.25)'
  };
`;

const PriceDisplay = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
`;

const OriginalPrice = styled.span`
  text-decoration: line-through;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.45);
`;

const FinalPrice = styled.span`
  font-size: 1.0625rem;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: -0.02em;
`;

const SavingsText = styled.span`
  font-size: 0.6875rem;
  color: #34d399;
  font-weight: 600;
`;

const DiscountSection = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.875rem 1.5rem;
  margin-top: auto;
  background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
  margin-left: -1.5rem;
  margin-right: -1.5rem;
  margin-bottom: -1.25rem;
  position: relative;
  overflow: hidden;

  /* Color mode - explosive gradient section */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #1a0a2e 0%, #6a0572 50%, #ab2567 100%);
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #6366f1 100%);
    background-size: 200% 100%;
    animation: shimmer 3s linear infinite;

    [data-theme="color"] & {
      height: 3px;
      background: linear-gradient(90deg, #ff4500 0%, #ff006e 25%, #00d4ff 50%, #b24bf3 75%, #ff4500 100%);
      background-size: 300% 100%;
    }
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  &::after {
    content: '';
    position: absolute;
    top: -50%;
    right: -20%;
    width: 200px;
    height: 200px;
    background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
    border-radius: 50%;
    transition: transform 400ms cubic-bezier(0.4, 0, 0.2, 1);

    [data-theme="color"] & {
      background: radial-gradient(circle, rgba(255, 0, 110, 0.25) 0%, rgba(255, 69, 0, 0.15) 50%, transparent 70%);
    }
  }

  ${CardContainer}:hover &::after {
    transform: scale(1.5) translate(-10%, 10%);
  }
`;

const SubscriptionNote = styled.span`
  font-size: 0.6875rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
`;

const CTAButton = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #16a34a 0%, #22c55e 50%, #4ade80 100%);
  color: #ffffff;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 0.5rem;
  white-space: nowrap;
  position: relative;
  z-index: 1;
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(22, 163, 74, 0.35);

  ${CardContainer}:hover & {
    background: linear-gradient(135deg, #22c55e 0%, #4ade80 50%, #86efac 100%);
    box-shadow: 0 4px 16px rgba(34, 197, 94, 0.5);
    transform: scale(1.05);
  }

  svg {
    transition: transform 300ms;
  }

  ${CardContainer}:hover & svg {
    transform: translateX(2px);
  }
`;

const renderStars = (rating: number) => {
  const stars = [];
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.3;

  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push(
        <svg key={i} width="12" height="12" viewBox="0 0 20 20" fill="#fbbf24">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      );
    } else if (i === fullStars && hasHalf) {
      stars.push(
        <svg key={i} width="12" height="12" viewBox="0 0 20 20">
          <defs>
            <linearGradient id={`half-star-${i}`}>
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="50%" stopColor="#d1d5db" />
            </linearGradient>
          </defs>
          <path fill={`url(#half-star-${i})`} d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      );
    } else {
      stars.push(
        <svg key={i} width="12" height="12" viewBox="0 0 20 20" fill="#d1d5db">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      );
    }
  }
  return stars;
};

const localizeType = (type: string, lang: string) => {
  const map: Record<string, { en: string; bg: string }> = {
    group: { en: 'Group', bg: 'Групово' },
    private: { en: 'Private', bg: 'Частно' },
    vip: { en: 'VIP', bg: 'VIP' },
  };
  return lang === 'bg' ? (map[type]?.bg ?? type) : (map[type]?.en ?? type);
};

const formatCurrency = (amount: number) => `€${amount.toFixed(0)}`;

export const OfferCard: React.FC<OfferCardProps> = ({ entity, className, onBookClick }) => {
  const { language } = useLanguage();

  const data = normalizeEntity(entity, language as 'en' | 'bg');

  const discountPct = Math.min(data.discount, 20);
  const subscriptionNote = language === 'bg'
    ? `до ${discountPct}% отстъпка според абонаментния план`
    : `up to ${discountPct}% discount based on subscription plan`;

  const ctaLabel = language === 'bg' ? 'Виж офертата' : 'View offer';

  const handleCardClick = (e: React.MouseEvent) => {
    if (onBookClick && entity && data.isExperience) {
      e.preventDefault();
      onBookClick(entity);
    }
  };

  return (
    <Link to={data.path} style={{ textDecoration: 'none' }} onClick={handleCardClick}>
      <CardContainer
        className={className}
        whileHover={{ y: -4 }}
        transition={{ duration: 0.3 }}
      >
        <ImageContainer>
          <Image src={data.imageUrl} alt={data.title} loading="lazy" />
          <FavoriteButtonWrapper onClick={(e) => e.preventDefault()}>
            <FavoriteButton
              offerId={data.id}
              offerData={{
                title: data.titleEn,
                titleBg: data.titleBg,
                category: data.categoryEn,
                categoryBg: data.categoryBg,
                location: data.location,
                discount: data.discount,
                originalPrice: data.originalPrice,
                discountedPrice: data.discountedPrice,
                imageUrl: data.imageUrl,
                path: data.path
              }}
              size="small"
            />
          </FavoriteButtonWrapper>
          {data.discount > 0 && (
            <DiscountBadge>
              {data.isExperience
                ? (language === 'bg' ? `До ${discountPct}% с BOOM` : `Up to ${discountPct}% BOOM`)
                : `${discountPct}%`}
            </DiscountBadge>
          )}
        </ImageContainer>

        <Content>
          <CategoryBadgeWrapper>
            <Badge variant="default">{data.category}</Badge>
            {data.tags && data.tags.map((tag, i) => (
              <Badge key={i} variant="info" size="small">{tag}</Badge>
            ))}
          </CategoryBadgeWrapper>

          <Title>{data.title}</Title>
          <Description>{data.description}</Description>

          <MetaInfo>
            <MetaRow>
              <Location>
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{data.location}</span>
              </Location>

              {data.durationDisplay && (
                <DurationBadge>
                  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" strokeWidth={2} />
                    <path strokeLinecap="round" strokeWidth={2} d="M12 6v6l4 2" />
                  </svg>
                  <span>{data.durationDisplay}</span>
                </DurationBadge>
              )}

              {data.experienceType && (
                <ExperienceTypeBadge $type={data.experienceType}>
                  {localizeType(data.experienceType, language)}
                </ExperienceTypeBadge>
              )}

              {data.rating && (
                <GoogleRating>
                  <GoogleIcon>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  </GoogleIcon>
                  <RatingStars>
                    {renderStars(data.rating)}
                  </RatingStars>
                  <span style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--color-text-primary)' }}>
                    {data.rating.toFixed(1)}
                  </span>
                  {data.reviewCount && (
                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary, #9ca3af)' }}>
                      ({data.reviewCount})
                    </span>
                  )}
                </GoogleRating>
              )}
            </MetaRow>

            {data.workingHours && (
              <WorkingHoursDisplay>
                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" strokeWidth={2} />
                  <path strokeLinecap="round" strokeWidth={2} d="M12 6v6l4 2" />
                </svg>
                <span>{data.workingHours}</span>
              </WorkingHoursDisplay>
            )}
          </MetaInfo>

          <DiscountSection>
            {data.isExperience && data.originalPrice > 0 ? (
              <PriceDisplay>
                {data.discountedPrice > 0 && data.discountedPrice < data.originalPrice && (
                  <OriginalPrice>{formatCurrency(data.originalPrice)}</OriginalPrice>
                )}
                <FinalPrice>
                  {formatCurrency(data.discountedPrice > 0 ? data.discountedPrice : data.originalPrice)}
                </FinalPrice>
                {(data.savings ?? 0) > 0 && (
                  <SavingsText>
                    {language === 'bg'
                      ? `Спестяваш ${formatCurrency(data.savings!)}`
                      : `You save ${formatCurrency(data.savings!)}`}
                  </SavingsText>
                )}
              </PriceDisplay>
            ) : (
              <SubscriptionNote>{subscriptionNote}</SubscriptionNote>
            )}
            <CTAButton>
              {data.isExperience
                ? (language === 'bg' ? 'Резервирай с BOOM Card' : 'Book with BOOM Card')
                : ctaLabel}
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </CTAButton>
          </DiscountSection>
        </Content>
      </CardContainer>
    </Link>
  );
};

export default OfferCard;
