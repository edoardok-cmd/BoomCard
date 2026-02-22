import React, { useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import { Filter, MapPin, Percent, Star, DollarSign, ChevronDown, ChevronUp, Navigation, LayoutGrid } from 'lucide-react';
import Button from '../Button/Button';

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
  cursor: pointer;
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

const ExpandIcon = styled.div`
  color: #6b7280;
  display: flex;
  align-items: center;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const FilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-top: 1.5rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const CategoryFilterGroup = styled(FilterGroup)`
  grid-column: 1 / -1;
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

const LabelHint = styled.span`
  font-size: 0.75rem;
  font-weight: 400;
  color: #9ca3af;
`;

const CheckboxGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const CheckboxLabel = styled.label<{ $checked: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  border: 2px solid ${props => props.$checked ? '#000000' : '#e5e7eb'};
  background: ${props => props.$checked ? '#000000' : 'white'};
  color: ${props => props.$checked ? 'white' : '#374151'};
  border-radius: 9999px;
  font-size: 0.8125rem;
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

const SubcategoryGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding-left: 0.5rem;
  margin-top: 0.25rem;
`;

const SubcategoryLabel = styled(CheckboxLabel)`
  font-size: 0.75rem;
  padding: 0.375rem 0.75rem;
`;

const NearMeButton = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  border: 2px solid ${props => props.$active ? '#10b981' : '#e5e7eb'};
  background: ${props => props.$active ? '#10b981' : 'white'};
  color: ${props => props.$active ? 'white' : '#374151'};
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  [data-theme="dark"] & {
    border-color: ${props => props.$active ? '#10b981' : '#4b5563'};
    background: ${props => props.$active ? '#10b981' : '#374151'};
    color: ${props => props.$active ? 'white' : '#d1d5db'};
  }

  &:hover {
    border-color: #10b981;
    background: ${props => props.$active ? '#059669' : '#ecfdf5'};
  }

  svg {
    width: 0.875rem;
    height: 0.875rem;
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

interface CategoryDef {
  id: string;
  en: string;
  bg: string;
  subcategories: { id: string; en: string; bg: string }[];
}

const placesCategories: CategoryDef[] = [
  {
    id: 'restaurants',
    en: 'Restaurants & Food',
    bg: 'Ресторанти и храна',
    subcategories: [
      { id: 'restaurants/curated', en: 'BOOM Restaurants', bg: 'BOOM Ресторанти' },
      { id: 'restaurants/fast-food', en: 'Fast Food', bg: 'Бързо хранене' },
      { id: 'restaurants/traditional', en: 'Traditional Cuisine', bg: 'Традиционна кухня' },
      { id: 'restaurants/vegetarian-vegan', en: 'Vegetarian & Vegan', bg: 'Вегетарианска и веган' },
    ],
  },
  {
    id: 'accommodation',
    en: 'Accommodation',
    bg: 'Настаняване',
    subcategories: [
      { id: 'accommodation/hotels', en: 'Hotels', bg: 'Хотели' },
      { id: 'accommodation/guest-houses', en: 'Guest Houses', bg: 'Къщи за гости' },
      { id: 'accommodation/apartments', en: 'Apartments', bg: 'Апартаменти' },
    ],
  },
  {
    id: 'spa',
    en: 'SPA & Wellness',
    bg: 'СПА и уелнес',
    subcategories: [
      { id: 'spa/spa-centers', en: 'SPA Centers', bg: 'СПА центрове' },
      { id: 'spa/pools', en: 'Pools', bg: 'Басейни' },
      { id: 'spa/mineral-pools', en: 'Mineral Pools', bg: 'Минерални басейни' },
      { id: 'spa/fitness-wellness', en: 'Fitness & Wellness', bg: 'Фитнес и уелнес' },
      { id: 'spa/sports', en: 'Sports', bg: 'Спорт' },
    ],
  },
  {
    id: 'panoramic',
    en: 'Panoramic Places',
    bg: 'Панорамни места',
    subcategories: [
      { id: 'panoramic/bars', en: 'Rooftop Bars', bg: 'Руфтоп барове' },
      { id: 'panoramic/restaurants', en: 'Sky Restaurants', bg: 'Скай ресторанти' },
    ],
  },
  {
    id: 'clubs',
    en: 'Clubs & Nightlife',
    bg: 'Клубове и нощен живот',
    subcategories: [
      { id: 'clubs/clubs', en: 'Clubs', bg: 'Клубове' },
      { id: 'clubs/bars', en: 'Bars', bg: 'Барове' },
      { id: 'clubs/lounge', en: 'Lounge', bg: 'Лаундж' },
      { id: 'clubs/parties-events', en: 'Parties & Events', bg: 'Партита и събития' },
      { id: 'clubs/live-music', en: 'Live Music', bg: 'Жива музика' },
    ],
  },
  {
    id: 'cafes',
    en: 'Cafes, Pastry Shops & Bakeries',
    bg: 'Кафенета, сладкарници и пекарни',
    subcategories: [
      { id: 'cafes/cafes', en: 'Cafes', bg: 'Кафенета' },
      { id: 'cafes/pastry-shops', en: 'Pastry Shops', bg: 'Сладкарници' },
      { id: 'cafes/brunch', en: 'Brunch', bg: 'Бранч' },
      { id: 'cafes/bakeries', en: 'Bakeries', bg: 'Пекарни' },
    ],
  },
];

export interface BoomPlacesFiltersState {
  categories: string[];
  locations: string[];
  nearMe: boolean;
  discountRanges: string[];
  ratingRanges: string[];
  priceLevels: string[];
}

interface BoomPlacesFiltersProps {
  filters: BoomPlacesFiltersState;
  onChange: (filters: BoomPlacesFiltersState) => void;
  showCategory?: boolean;
  categoryOptions?: { id: string; label: string; labelBg: string }[];
}

const BoomPlacesFilters: React.FC<BoomPlacesFiltersProps> = ({
  filters,
  onChange,
  showCategory = false,
  categoryOptions = [],
}) => {
  const { language, t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(true);

  const locations = [
    { id: 'sofia', en: 'Sofia', bg: 'София' },
    { id: 'plovdiv', en: 'Plovdiv', bg: 'Пловдив' },
    { id: 'varna', en: 'Varna', bg: 'Варна' },
    { id: 'burgas', en: 'Burgas', bg: 'Бургас' },
    { id: 'bansko', en: 'Bansko', bg: 'Банско' },
    { id: 'melnik', en: 'Melnik', bg: 'Мелник' },
  ];

  const discountRanges = [
    { id: '0-5', label: '0-5%' },
    { id: '5-10', label: '5-10%' },
    { id: '10-15', label: '10-15%' },
    { id: '15-20', label: '15-20%' },
  ];

  const ratingRanges = [
    { id: '3.5-4.0', label: '3.5 - 4.0' },
    { id: '4.0-4.5', label: '4.0 - 4.5' },
    { id: '4.5-5.0', label: '4.5 - 5.0' },
  ];

  const priceLevels = [
    { id: 'budget', en: '€ Budget', bg: '€ Евтино' },
    { id: 'mid-range', en: '€€ Mid-range', bg: '€€ Среден клас' },
    { id: 'high-end', en: '€€€ High-end', bg: '€€€ Висок клас' },
  ];

  const handleCategoryToggle = (categoryId: string) => {
    const category = placesCategories.find(c => c.id === categoryId);
    if (!category) return;

    const isSelected = filters.categories.includes(categoryId);
    const subIds = category.subcategories.map(s => s.id);

    if (isSelected) {
      // Deselect parent + all its subcategories
      const updated = filters.categories.filter(
        id => id !== categoryId && !subIds.includes(id)
      );
      onChange({ ...filters, categories: updated });
    } else {
      // Select parent only
      onChange({ ...filters, categories: [...filters.categories, categoryId] });
    }
  };

  const handleSubcategoryToggle = (subcategoryId: string, parentId: string) => {
    const isSelected = filters.categories.includes(subcategoryId);
    let updated: string[];

    if (isSelected) {
      updated = filters.categories.filter(id => id !== subcategoryId);
    } else {
      updated = [...filters.categories, subcategoryId];
      // Auto-select parent if not already selected
      if (!updated.includes(parentId)) {
        updated.push(parentId);
      }
    }
    onChange({ ...filters, categories: updated });
  };

  const handleLocationToggle = (locationId: string) => {
    const updated = filters.locations.includes(locationId)
      ? filters.locations.filter(l => l !== locationId)
      : [...filters.locations, locationId];
    onChange({ ...filters, locations: updated });
  };

  const handleNearMeToggle = () => {
    onChange({ ...filters, nearMe: !filters.nearMe });
  };

  const handleDiscountToggle = (rangeId: string) => {
    const updated = filters.discountRanges.includes(rangeId)
      ? filters.discountRanges.filter(r => r !== rangeId)
      : [...filters.discountRanges, rangeId];
    onChange({ ...filters, discountRanges: updated });
  };

  const handleRatingToggle = (rangeId: string) => {
    const updated = filters.ratingRanges.includes(rangeId)
      ? filters.ratingRanges.filter(r => r !== rangeId)
      : [...filters.ratingRanges, rangeId];
    onChange({ ...filters, ratingRanges: updated });
  };

  const handlePriceLevelToggle = (levelId: string) => {
    const updated = filters.priceLevels.includes(levelId)
      ? filters.priceLevels.filter(l => l !== levelId)
      : [...filters.priceLevels, levelId];
    onChange({ ...filters, priceLevels: updated });
  };

  const handleClearAll = () => {
    onChange({
      categories: [],
      locations: [],
      nearMe: false,
      discountRanges: [],
      ratingRanges: [],
      priceLevels: [],
    });
  };

  const getActiveCount = () => {
    let count = 0;
    count += filters.categories.length;
    count += filters.locations.length;
    if (filters.nearMe) count++;
    count += filters.discountRanges.length;
    count += filters.ratingRanges.length;
    count += filters.priceLevels.length;
    return count;
  };

  const activeCount = getActiveCount();

  return (
    <FilterContainer
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <FilterHeader onClick={() => setIsExpanded(!isExpanded)}>
        <FilterTitle>
          <Filter />
          {language === 'bg' ? 'Филтри' : 'Filters'}
          {activeCount > 0 && ` (${activeCount})`}
        </FilterTitle>
        <ExpandIcon>
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </ExpandIcon>
      </FilterHeader>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <FilterGrid>
              {/* Category */}
              <CategoryFilterGroup>
                <Label>
                  <LayoutGrid />
                  {language === 'bg' ? 'Категория' : 'Category'}
                </Label>
                <CheckboxGroup>
                  {placesCategories.map(cat => (
                    <CheckboxLabel
                      key={cat.id}
                      $checked={filters.categories.includes(cat.id)}
                    >
                      <input
                        type="checkbox"
                        checked={filters.categories.includes(cat.id)}
                        onChange={() => handleCategoryToggle(cat.id)}
                      />
                      {language === 'bg' ? cat.bg : cat.en}
                    </CheckboxLabel>
                  ))}
                </CheckboxGroup>
                {/* Subcategories for selected parents */}
                {placesCategories
                  .filter(cat => filters.categories.includes(cat.id))
                  .map(cat => (
                    <SubcategoryGroup key={`sub-${cat.id}`}>
                      {cat.subcategories.map(sub => (
                        <SubcategoryLabel
                          key={sub.id}
                          $checked={filters.categories.includes(sub.id)}
                        >
                          <input
                            type="checkbox"
                            checked={filters.categories.includes(sub.id)}
                            onChange={() => handleSubcategoryToggle(sub.id, cat.id)}
                          />
                          {language === 'bg' ? sub.bg : sub.en}
                        </SubcategoryLabel>
                      ))}
                    </SubcategoryGroup>
                  ))}
              </CategoryFilterGroup>

              {/* Location */}
              <FilterGroup>
                <Label>
                  <MapPin />
                  {language === 'bg' ? 'Локация' : 'Location'}
                </Label>
                <CheckboxGroup>
                  <NearMeButton $active={filters.nearMe} onClick={handleNearMeToggle}>
                    <Navigation />
                    {language === 'bg' ? 'Близо до мен' : 'Near me'}
                  </NearMeButton>
                  {locations.map(loc => (
                    <CheckboxLabel
                      key={loc.id}
                      $checked={filters.locations.includes(loc.id)}
                    >
                      <input
                        type="checkbox"
                        checked={filters.locations.includes(loc.id)}
                        onChange={() => handleLocationToggle(loc.id)}
                      />
                      {language === 'bg' ? loc.bg : loc.en}
                    </CheckboxLabel>
                  ))}
                </CheckboxGroup>
              </FilterGroup>

              {/* Discount Range */}
              <FilterGroup>
                <Label>
                  <Percent />
                  {language === 'bg' ? 'Отстъпка (потенциал)' : 'Discount (Potential)'}
                </Label>
                <CheckboxGroup>
                  {discountRanges.map(range => (
                    <CheckboxLabel
                      key={range.id}
                      $checked={filters.discountRanges.includes(range.id)}
                    >
                      <input
                        type="checkbox"
                        checked={filters.discountRanges.includes(range.id)}
                        onChange={() => handleDiscountToggle(range.id)}
                      />
                      {range.label}
                    </CheckboxLabel>
                  ))}
                </CheckboxGroup>
              </FilterGroup>

              {/* Rating */}
              <FilterGroup>
                <Label>
                  <Star />
                  {language === 'bg' ? 'Рейтинг' : 'Rating'}
                  <LabelHint>(Google Maps)</LabelHint>
                </Label>
                <CheckboxGroup>
                  {ratingRanges.map(range => (
                    <CheckboxLabel
                      key={range.id}
                      $checked={filters.ratingRanges.includes(range.id)}
                    >
                      <input
                        type="checkbox"
                        checked={filters.ratingRanges.includes(range.id)}
                        onChange={() => handleRatingToggle(range.id)}
                      />
                      {range.label}
                    </CheckboxLabel>
                  ))}
                </CheckboxGroup>
              </FilterGroup>

              {/* Price Level */}
              <FilterGroup>
                <Label>
                  <DollarSign />
                  {language === 'bg' ? 'Ценово ниво' : 'Price Level'}
                </Label>
                <CheckboxGroup>
                  {priceLevels.map(level => (
                    <CheckboxLabel
                      key={level.id}
                      $checked={filters.priceLevels.includes(level.id)}
                    >
                      <input
                        type="checkbox"
                        checked={filters.priceLevels.includes(level.id)}
                        onChange={() => handlePriceLevelToggle(level.id)}
                      />
                      {language === 'bg' ? level.bg : level.en}
                    </CheckboxLabel>
                  ))}
                </CheckboxGroup>
              </FilterGroup>
            </FilterGrid>

            {activeCount > 0 && (
              <FilterActions>
                <Button variant="ghost" size="small" onClick={handleClearAll}>
                  {language === 'bg' ? 'Изчисти всички' : 'Clear all'}
                </Button>
              </FilterActions>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </FilterContainer>
  );
};

export default BoomPlacesFilters;
