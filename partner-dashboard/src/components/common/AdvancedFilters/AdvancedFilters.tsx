import React, { useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import { Filter, X, MapPin, DollarSign, Star, TrendingUp, Clock } from 'lucide-react';
import Button from '../Button/Button';
import { SearchFilters } from '../../../lib/search/SearchEngine';

const FilterContainer = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  margin-bottom: 2rem;

  [data-theme="dark"] & {
    background: #1f2937;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }
`;

const FilterHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
`;

const FilterTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }

  svg {
    width: 1.25rem;
    height: 1.25rem;
  }
`;

const FilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  [data-theme="dark"] & {
    color: #d1d5db;
  }

  svg {
    width: 1rem;
    height: 1rem;
    color: #6b7280;

    [data-theme="dark"] & {
      color: #9ca3af;
    }
  }
`;

const Select = styled.select`
  padding: 0.625rem 0.875rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: #111827;
  background: white;
  cursor: pointer;
  transition: all 0.2s;

  [data-theme="dark"] & {
    background: #374151;
    border-color: #4b5563;
    color: #f9fafb;
  }

  &:focus {
    outline: none;
    border-color: #000000;

    [data-theme="dark"] & {
      border-color: #9ca3af;
    }
  }

  &:hover {
    border-color: #d1d5db;

    [data-theme="dark"] & {
      border-color: #6b7280;
    }
  }
`;

const Input = styled.input`
  padding: 0.625rem 0.875rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: #111827;
  transition: all 0.2s;

  [data-theme="dark"] & {
    background: #374151;
    border-color: #4b5563;
    color: #f9fafb;
  }

  &:focus {
    outline: none;
    border-color: #000000;

    [data-theme="dark"] & {
      border-color: #9ca3af;
    }
  }

  &::placeholder {
    color: #9ca3af;

    [data-theme="dark"] & {
      color: #6b7280;
    }
  }
`;

const RangeGroup = styled.div`
  display: flex;
  gap: 0.75rem;
  align-items: center;
`;

const RangeInput = styled(Input)`
  flex: 1;
`;

const RangeSeparator = styled.span`
  color: #6b7280;
  font-weight: 500;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const CheckboxGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
`;

const CheckboxLabel = styled.label<{ $checked: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: 2px solid ${props => props.$checked ? '#000000' : '#e5e7eb'};
  background: ${props => props.$checked ? '#000000' : 'white'};
  color: ${props => props.$checked ? 'white' : '#374151'};
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;

  [data-theme="dark"] & {
    border-color: ${props => props.$checked ? '#f9fafb' : '#4b5563'};
    background: ${props => props.$checked ? '#f9fafb' : '#374151'};
    color: ${props => props.$checked ? '#111827' : '#d1d5db'};
  }

  &:hover {
    border-color: #000000;
    background: ${props => props.$checked ? '#1f2937' : '#f9fafb'};

    [data-theme="dark"] & {
      border-color: #f9fafb;
      background: ${props => props.$checked ? '#e5e7eb' : '#4b5563'};
    }
  }

  input {
    display: none;
  }
`;

const SliderContainer = styled.div`
  padding: 0.5rem 0;
`;

const Slider = styled.input`
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #e5e7eb;
  outline: none;
  -webkit-appearance: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #000000;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      transform: scale(1.2);
    }
  }

  &::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #000000;
    cursor: pointer;
    border: none;
  }
`;

const SliderValue = styled.div`
  text-align: center;
  font-size: 0.875rem;
  font-weight: 600;
  color: #111827;
  margin-top: 0.5rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const ToggleSwitch = styled.label`
  position: relative;
  display: inline-block;
  width: 48px;
  height: 24px;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }
`;

const ToggleSlider = styled.span<{ $checked: boolean }>`
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${props => props.$checked ? '#000000' : '#e5e7eb'};
  transition: 0.3s;
  border-radius: 24px;

  &:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: ${props => props.$checked ? '27px' : '3px'};
    bottom: 3px;
    background-color: white;
    transition: 0.3s;
    border-radius: 50%;
  }
`;

const FilterActions = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e5e7eb;

  [data-theme="dark"] & {
    border-top-color: #374151;
  }
`;

const ActiveFilters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
`;

const FilterTag = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  background: #f3f4f6;
  border-radius: 9999px;
  font-size: 0.8125rem;
  color: #374151;

  [data-theme="dark"] & {
    background: #374151;
    color: #d1d5db;
  }

  button {
    display: flex;
    align-items: center;
    background: none;
    border: none;
    color: #6b7280;
    cursor: pointer;
    padding: 0;

    [data-theme="dark"] & {
      color: #9ca3af;
    }

    svg {
      width: 0.875rem;
      height: 0.875rem;
    }

    &:hover {
      color: #111827;

      [data-theme="dark"] & {
        color: #f9fafb;
      }
    }
  }
`;

interface AdvancedFiltersProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  language?: 'en' | 'bg';
}

export const AdvancedFilters: React.FC<AdvancedFiltersProps> = ({
  filters,
  onChange,
  language = 'en',
}) => {
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);

  const categories = ['RESTAURANT', 'HOTEL', 'SPA', 'WINERY', 'ENTERTAINMENT', 'SPORTS'];
  const cuisines = ['Bulgarian', 'Italian', 'Asian', 'Mediterranean', 'Seafood', 'Vegetarian'];

  const handleCategoryChange = (category: string) => {
    const current = filters.category || [];
    const updated = current.includes(category)
      ? current.filter(c => c !== category)
      : [...current, category];

    onChange({ ...filters, category: updated });
  };

  const handleCuisineChange = (cuisine: string) => {
    const current = filters.cuisine || [];
    const updated = current.includes(cuisine)
      ? current.filter(c => c !== cuisine)
      : [...current, cuisine];

    onChange({ ...filters, cuisine: updated });
  };

  const handlePriceRangeChange = (min: number, max: number) => {
    onChange({ ...filters, priceRange: { min, max } });
  };

  const handleRatingChange = (rating: number) => {
    onChange({ ...filters, rating });
  };

  const handleDiscountChange = (discount: number) => {
    onChange({ ...filters, discountMin: discount });
  };

  const handleOpenNowChange = (openNow: boolean) => {
    onChange({ ...filters, openNow });
  };

  const handleClearFilters = () => {
    onChange({});
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.category?.length) count += filters.category.length;
    if (filters.cuisine?.length) count += filters.cuisine.length;
    if (filters.priceRange) count++;
    if (filters.rating) count++;
    if (filters.discountMin) count++;
    if (filters.openNow) count++;
    return count;
  };

  const activeCount = getActiveFiltersCount();

  return (
    <FilterContainer
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <FilterHeader>
        <FilterTitle>
          <Filter />
          {t('common.filters')}
          {activeCount > 0 && ` (${activeCount})`}
        </FilterTitle>
        <Button
          variant="ghost"
          size="small"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded
            ? t('common.hide')
            : t('common.show')}
        </Button>
      </FilterHeader>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <FilterGrid>
              {/* Category Filter */}
              <FilterGroup>
                <Label>
                  {t('common.category')}
                </Label>
                <CheckboxGroup>
                  {categories.map(category => (
                    <CheckboxLabel
                      key={category}
                      $checked={filters.category?.includes(category) || false}
                    >
                      <input
                        type="checkbox"
                        checked={filters.category?.includes(category) || false}
                        onChange={() => handleCategoryChange(category)}
                      />
                      {category}
                    </CheckboxLabel>
                  ))}
                </CheckboxGroup>
              </FilterGroup>

              {/* Price Range */}
              <FilterGroup>
                <Label>
                  <DollarSign />
                  {t('common.priceRange')}
                </Label>
                <RangeGroup>
                  <RangeInput
                    type="number"
                    placeholder="Min"
                    value={filters.priceRange?.min || ''}
                    onChange={(e) =>
                      handlePriceRangeChange(
                        parseInt(e.target.value) || 0,
                        filters.priceRange?.max || 500
                      )
                    }
                  />
                  <RangeSeparator>—</RangeSeparator>
                  <RangeInput
                    type="number"
                    placeholder="Max"
                    value={filters.priceRange?.max || ''}
                    onChange={(e) =>
                      handlePriceRangeChange(
                        filters.priceRange?.min || 0,
                        parseInt(e.target.value) || 500
                      )
                    }
                  />
                </RangeGroup>
              </FilterGroup>

              {/* Rating */}
              <FilterGroup>
                <Label>
                  <Star />
                  {t('common.minimumRating')}
                </Label>
                <SliderContainer>
                  <Slider
                    type="range"
                    min="0"
                    max="5"
                    step="0.5"
                    value={filters.rating || 0}
                    onChange={(e) => handleRatingChange(parseFloat(e.target.value))}
                  />
                  <SliderValue>{filters.rating?.toFixed(1) || '0.0'} ⭐</SliderValue>
                </SliderContainer>
              </FilterGroup>

              {/* Discount */}
              <FilterGroup>
                <Label>
                  <TrendingUp />
                  {t('common.minimumDiscount')}
                </Label>
                <SliderContainer>
                  <Slider
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={filters.discountMin || 0}
                    onChange={(e) => handleDiscountChange(parseInt(e.target.value))}
                  />
                  <SliderValue>{filters.discountMin || 0}%</SliderValue>
                </SliderContainer>
              </FilterGroup>

              {/* Cuisine */}
              <FilterGroup>
                <Label>
                  {t('common.cuisine')}
                </Label>
                <CheckboxGroup>
                  {cuisines.map(cuisine => (
                    <CheckboxLabel
                      key={cuisine}
                      $checked={filters.cuisine?.includes(cuisine) || false}
                    >
                      <input
                        type="checkbox"
                        checked={filters.cuisine?.includes(cuisine) || false}
                        onChange={() => handleCuisineChange(cuisine)}
                      />
                      {cuisine}
                    </CheckboxLabel>
                  ))}
                </CheckboxGroup>
              </FilterGroup>

              {/* Open Now */}
              <FilterGroup>
                <Label>
                  <Clock />
                  {t('common.openNow')}
                </Label>
                <ToggleSwitch>
                  <input
                    type="checkbox"
                    checked={filters.openNow || false}
                    onChange={(e) => handleOpenNowChange(e.target.checked)}
                  />
                  <ToggleSlider $checked={filters.openNow || false} />
                </ToggleSwitch>
              </FilterGroup>
            </FilterGrid>

            <FilterActions>
              <Button variant="primary" size="medium" onClick={() => setIsExpanded(false)}>
                {t('common.applyFilters')}
              </Button>
              <Button variant="ghost" size="medium" onClick={handleClearFilters}>
                {t('common.clearAll')}
              </Button>
            </FilterActions>
          </motion.div>
        )}
      </AnimatePresence>

      {activeCount > 0 && !isExpanded && (
        <ActiveFilters>
          {filters.category?.map(cat => (
            <FilterTag key={cat}>
              {cat}
              <button onClick={() => handleCategoryChange(cat)}>
                <X />
              </button>
            </FilterTag>
          ))}
          {filters.priceRange && (
            <FilterTag>
              ${filters.priceRange.min} - ${filters.priceRange.max}
              <button onClick={() => onChange({ ...filters, priceRange: undefined })}>
                <X />
              </button>
            </FilterTag>
          )}
          {filters.rating && (
            <FilterTag>
              ⭐ {filters.rating}+
              <button onClick={() => onChange({ ...filters, rating: undefined })}>
                <X />
              </button>
            </FilterTag>
          )}
        </ActiveFilters>
      )}
    </FilterContainer>
  );
};

export default AdvancedFilters;
