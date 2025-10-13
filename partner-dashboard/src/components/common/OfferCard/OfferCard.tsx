import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import Badge from '../Badge/Badge';
import FavoriteButton from '../FavoriteButton/FavoriteButton';
import { useLanguage } from '../../../contexts/LanguageContext';

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
  background: white;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
  height: 100%;
  display: flex;
  flex-direction: column;

  &:hover {
    box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.15);
    transform: translateY(-4px);
  }
`;

const ImageContainer = styled.div`
  position: relative;
  width: 100%;
  padding-top: 66.67%; /* 3:2 aspect ratio */
  overflow: hidden;
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
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
  background: #000000;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-weight: 700;
  font-size: 1.125rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
`;

const FavoriteButtonWrapper = styled.div`
  position: absolute;
  top: 1rem;
  left: 1rem;
  z-index: 10;
`;

const Content = styled.div`
  padding: 1.5rem;
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const CategoryBadgeWrapper = styled.div`
  margin-bottom: 0.75rem;
`;

const Title = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.5rem;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Description = styled.p`
  font-size: 0.9375rem;
  color: #6b7280;
  line-height: 1.6;
  margin-bottom: 1rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
`;

const MetaInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: #6b7280;
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
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
`;

const OriginalPrice = styled.span`
  font-size: 0.9375rem;
  color: #9ca3af;
  text-decoration: line-through;
`;

const DiscountedPrice = styled.span`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
`;

const Currency = styled.span`
  font-size: 1rem;
  font-weight: 600;
  color: #6b7280;
  margin-left: 0.25rem;
`;

export const OfferCard: React.FC<OfferCardProps> = ({ offer, className }) => {
  const { language } = useLanguage();
  const title = language === 'bg' ? offer.titleBg : offer.title;
  const description = language === 'bg' ? offer.descriptionBg : offer.description;
  const category = language === 'bg' ? offer.categoryBg : offer.category;

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
            <OriginalPrice>{offer.originalPrice} BGN</OriginalPrice>
            <div>
              <DiscountedPrice>{offer.discountedPrice}</DiscountedPrice>
              <Currency>BGN</Currency>
            </div>
          </PriceSection>
        </Content>
      </CardContainer>
    </Link>
  );
};

export default OfferCard;
