import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useFavorites } from '../../../contexts/FavoritesContext';
import { useLanguage } from '../../../contexts/LanguageContext';

interface FavoriteButtonProps {
  offerId: string;
  offerData: {
    title: string;
    titleBg: string;
    category: string;
    categoryBg: string;
    location: string;
    discount: number;
    originalPrice: number;
    discountedPrice: number;
    imageUrl: string;
    path: string;
  };
  size?: 'small' | 'medium' | 'large';
  variant?: 'icon' | 'button';
  language?: 'en' | 'bg';
}

const IconButton = styled(motion.button)<{ $isFavorite: boolean; $size: string }>`
  width: ${props => {
    switch (props.$size) {
      case 'small': return '2rem';
      case 'large': return '3rem';
      default: return '2.5rem';
    }
  }};
  height: ${props => {
    switch (props.$size) {
      case 'small': return '2rem';
      case 'large': return '3rem';
      default: return '2.5rem';
    }
  }};
  border-radius: 50%;
  background: ${props => props.$isFavorite ? '#000000' : 'white'};
  border: 1px solid ${props => props.$isFavorite ? '#000000' : '#e5e7eb'};
  color: ${props => props.$isFavorite ? 'white' : '#6b7280'};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

  &:hover {
    background: ${props => props.$isFavorite ? '#1f2937' : '#f9fafb'};
    border-color: ${props => props.$isFavorite ? '#1f2937' : '#d1d5db'};
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: ${props => {
      switch (props.$size) {
        case 'small': return '1rem';
        case 'large': return '1.5rem';
        default: return '1.25rem';
      }
    }};
    height: ${props => {
      switch (props.$size) {
        case 'small': return '1rem';
        case 'large': return '1.5rem';
        default: return '1.25rem';
      }
    }};
    fill: ${props => props.$isFavorite ? 'currentColor' : 'none'};
    stroke: currentColor;
    stroke-width: 2;
  }
`;

const TextButton = styled(motion.button)<{ $isFavorite: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: ${props => props.$isFavorite ? '#000000' : 'white'};
  border: 1px solid ${props => props.$isFavorite ? '#000000' : '#e5e7eb'};
  color: ${props => props.$isFavorite ? 'white' : '#374151'};
  border-radius: 9999px;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    background: ${props => props.$isFavorite ? '#1f2937' : '#f9fafb'};
    border-color: ${props => props.$isFavorite ? '#1f2937' : '#d1d5db'};
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  &:active {
    transform: translateY(0);
  }

  svg {
    width: 1.125rem;
    height: 1.125rem;
    fill: ${props => props.$isFavorite ? 'currentColor' : 'none'};
    stroke: currentColor;
    stroke-width: 2;
  }
`;

const heartVariants = {
  inactive: { scale: 1 },
  active: { scale: [1, 1.3, 1] }
};

const HeartIcon: React.FC<{ favorite: boolean }> = ({ favorite }) => (
  <motion.svg
    viewBox="0 0 24 24"
    variants={heartVariants}
    animate={favorite ? 'active' : 'inactive'}
    transition={{ duration: 0.3 }}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
    />
  </motion.svg>
);

export const FavoriteButton: React.FC<FavoriteButtonProps> = ({
  offerId,
  offerData,
  size = 'medium',
  variant = 'icon',
  language = 'en'
}) => {
  const { addToFavorites, removeFromFavorites, isFavorite } = useFavorites();
  const { t } = useLanguage();
  const favorite = isFavorite(offerId);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (favorite) {
      removeFromFavorites(offerId);
    } else {
      addToFavorites({
        id: offerId,
        ...offerData
      });
    }
  };

  if (variant === 'button') {
    return (
      <TextButton
        $isFavorite={favorite}
        onClick={handleClick}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.95 }}
        aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <HeartIcon favorite={favorite} />
        <span>
          {favorite ? t('common.saved') : t('common.save')}
        </span>
      </TextButton>
    );
  }

  return (
    <IconButton
      $isFavorite={favorite}
      $size={size}
      onClick={handleClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      <HeartIcon favorite={favorite} />
    </IconButton>
  );
};

export default FavoriteButton;
