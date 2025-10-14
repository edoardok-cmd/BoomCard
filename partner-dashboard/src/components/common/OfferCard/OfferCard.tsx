import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import Badge from '../Badge/Badge';
import FavoriteButton from '../FavoriteButton/FavoriteButton';
import { useLanguage } from '../../../contexts/LanguageContext';
import { convertBGNToEUR } from '../../../utils/helpers';

export interface Offer {
  id: string;
  title: string;
  titleBg: string;
  description: string;
  descriptionBg: string;
  category: string;
  categoryBg: string;
  location: string;
  discount: number;
  originalPrice: number;
  discountedPrice: number;
  imageUrl: string;
  partnerName: string;
  rating?: number;
  reviewCount?: number;
  path: string;
}

interface OfferCardProps {
  offer: Offer;
  className?: string;
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
  background: var(--color-primary);
  color: var(--color-secondary);
  padding: 0.625rem 1.125rem;
  border-radius: 9999px;
  font-weight: 800;
  font-size: 1.125rem;
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.2),
    0 8px 32px rgba(0, 0, 0, 0.15);
  letter-spacing: -0.02em;
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.1);
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);

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
    transform: scale(1.05);
    box-shadow:
      0 6px 20px rgba(0, 0, 0, 0.25),
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
  padding: 1.75rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
`;

const CategoryBadgeWrapper = styled.div`
  margin-bottom: 0.75rem;
`;

const Title = styled.h3`
  font-size: 1.375rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 0.625rem;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  letter-spacing: -0.02em;
  transition: color 300ms cubic-bezier(0.4, 0, 0.2, 1);

  ${CardContainer}:hover & {
    color: var(--color-primary);
  }
`;

const Description = styled.p`
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
  line-height: 1.65;
  margin-bottom: 1.25rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
  letter-spacing: -0.01em;
`;

const MetaInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
`;

const Location = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
`;

const Rating = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
`;

const PriceSection = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  height: 110px;
  padding-top: 1.25rem;
  padding-bottom: 1.25rem;
  margin-top: 0.5rem;
  border-top: none;
  background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
  margin-left: -1.75rem;
  margin-right: -1.75rem;
  margin-bottom: -1.75rem;
  padding-left: 1.75rem;
  padding-right: 1.75rem;
  position: relative;
  overflow: hidden;

  /* Color mode - explosive gradient price section */
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

const OriginalPrice = styled.span`
  font-size: 0.9375rem;
  color: rgba(255, 255, 255, 0.5);
  text-decoration: line-through;
  font-weight: 500;
  position: relative;
  z-index: 1;
`;

const DiscountedPrice = styled.span`
  font-size: 1.875rem;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: -0.03em;
  position: relative;
  z-index: 1;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
`;

const Currency = styled.span`
  font-size: 1.125rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
  margin-left: 0.25rem;
  position: relative;
  z-index: 1;
`;

export const OfferCard: React.FC<OfferCardProps> = ({ offer, className }) => {
  const { language } = useLanguage();
  const title = language === 'bg' ? offer.titleBg : offer.title;
  const description = language === 'bg' ? offer.descriptionBg : offer.description;
  const category = language === 'bg' ? offer.categoryBg : offer.category;

  // Convert BGN prices to EUR
  const originalPriceEUR = convertBGNToEUR(offer.originalPrice);
  const discountedPriceEUR = convertBGNToEUR(offer.discountedPrice);

  // Currency labels
  const bgnLabel = language === 'bg' ? 'лв.' : 'BGN';

  return (
    <Link to={offer.path} style={{ textDecoration: 'none' }}>
      <CardContainer
        className={className}
        whileHover={{ y: -4 }}
        transition={{ duration: 0.3 }}
      >
        <ImageContainer>
          <Image src={offer.imageUrl} alt={title} loading="lazy" />
          <FavoriteButtonWrapper onClick={(e) => e.preventDefault()}>
            <FavoriteButton
              offerId={offer.id}
              offerData={{
                title: offer.title,
                titleBg: offer.titleBg,
                category: offer.category,
                categoryBg: offer.categoryBg,
                location: offer.location,
                discount: offer.discount,
                originalPrice: offer.originalPrice,
                discountedPrice: offer.discountedPrice,
                imageUrl: offer.imageUrl,
                path: offer.path
              }}
              size="small"
            />
          </FavoriteButtonWrapper>
          <DiscountBadge>-{offer.discount}%</DiscountBadge>
        </ImageContainer>

        <Content>
          <CategoryBadgeWrapper>
            <Badge variant="default">{category}</Badge>
          </CategoryBadgeWrapper>

          <Title>{title}</Title>
          <Description>{description}</Description>

          <MetaInfo>
            <Location>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{offer.location}</span>
            </Location>

            {offer.rating && (
              <Rating>
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span>{offer.rating.toFixed(1)}</span>
                {offer.reviewCount && <span>({offer.reviewCount})</span>}
              </Rating>
            )}
          </MetaInfo>

          <PriceSection>
            <OriginalPrice>
              {offer.originalPrice} {bgnLabel} / €{originalPriceEUR}
            </OriginalPrice>
            <div>
              <DiscountedPrice>{offer.discountedPrice}</DiscountedPrice>
              <Currency>{bgnLabel} / €{discountedPriceEUR}</Currency>
            </div>
          </PriceSection>
        </Content>
      </CardContainer>
    </Link>
  );
};

export default OfferCard;
