import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import {
  Filter, Clock, Compass, Sun, Users, ChevronDown, ChevronUp,
  Star, DollarSign, LayoutGrid, MapPin, Calendar, Search, ArrowUpDown, Crown,
} from 'lucide-react';
import Button from '../Button/Button';
import { experiencesCategories } from '../../../types/categories.types';

// ── Styled components ──────────────────────────────────────

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

const SearchRow = styled.div`
  margin-top: 1.25rem;
  margin-bottom: 0.25rem;
`;

const SearchInput = styled.div`
  position: relative;

  svg {
    position: absolute;
    left: 0.875rem;
    top: 50%;
    transform: translateY(-50%);
    width: 1rem;
    height: 1rem;
    color: #9ca3af;
  }

  input {
    width: 100%;
    padding: 0.625rem 0.875rem 0.625rem 2.5rem;
    border: 2px solid #e5e7eb;
    border-radius: 0.75rem;
    font-size: 0.875rem;
    background: white;
    color: #111827;
    transition: all 0.2s;

    [data-theme="dark"] & {
      border-color: #4b5563;
      background: #374151;
      color: #f9fafb;
    }

    &::placeholder {
      color: #9ca3af;
    }

    &:focus {
      outline: none;
      border-color: #000000;

      [data-theme="dark"] & {
        border-color: #f9fafb;
      }
    }
  }
`;

const SortRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1.25rem;
  padding-top: 1.25rem;
  border-top: 1px solid #e5e7eb;
  flex-wrap: wrap;

  [data-theme="dark"] & {
    border-top-color: #374151;
  }
`;

const SortLabel = styled.span`
  font-size: 0.8125rem;
  font-weight: 600;
  color: #374151;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  white-space: nowrap;

  [data-theme="dark"] & {
    color: #d1d5db;
  }

  svg {
    width: 0.875rem;
    height: 0.875rem;
    color: #6b7280;
  }
`;

const SortPill = styled.button<{ $active: boolean }>`
  padding: 0.375rem 0.75rem;
  border: 2px solid ${props => props.$active ? '#000000' : '#e5e7eb'};
  background: ${props => props.$active ? '#000000' : 'white'};
  color: ${props => props.$active ? 'white' : '#374151'};
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;

  [data-theme="dark"] & {
    border-color: ${props => props.$active ? '#f9fafb' : '#4b5563'};
    background: ${props => props.$active ? '#f9fafb' : '#374151'};
    color: ${props => props.$active ? '#111827' : '#d1d5db'};
  }

  &:hover {
    border-color: #000000;

    [data-theme="dark"] & {
      border-color: #f9fafb;
    }
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
  padding: 0.625rem 0.75rem;
  margin-top: 0.375rem;
  background: #f9fafb;
  border-radius: 0.75rem;
  border-left: 3px solid #e5e7eb;

  [data-theme="dark"] & {
    background: #111827;
    border-left-color: #374151;
  }
`;

const SubcategoryParentLabel = styled.span`
  font-size: 0.6875rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  width: 100%;
  margin-bottom: 0.125rem;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const SubcategoryLabel = styled.label<{ $checked: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.3125rem 0.6875rem;
  border: 1.5px solid ${props => props.$checked ? '#6b7280' : '#d1d5db'};
  background: ${props => props.$checked ? '#f3f4f6' : 'white'};
  color: ${props => props.$checked ? '#111827' : '#6b7280'};
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: ${props => props.$checked ? 500 : 400};
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;

  [data-theme="dark"] & {
    border-color: ${props => props.$checked ? '#9ca3af' : '#4b5563'};
    background: ${props => props.$checked ? '#374151' : '#1f2937'};
    color: ${props => props.$checked ? '#f9fafb' : '#9ca3af'};
  }

  &:hover {
    border-color: #6b7280;
    background: ${props => props.$checked ? '#e5e7eb' : '#f9fafb'};

    [data-theme="dark"] & {
      border-color: #9ca3af;
      background: ${props => props.$checked ? '#4b5563' : '#374151'};
    }
  }

  input {
    display: none;
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

// ── Types & Interface ──────────────────────────────────────

export interface ExperiencesFiltersState {
  categories: string[];
  durations: string[];
  formats: string[];
  seasons: string[];
  participations: string[];
  ratingRanges: string[];
  priceLevels: string[];
  locations: string[];
  types: string[];
  availability: string[];
  sortBy: string;
  search: string;
}

export const defaultExperiencesFilters: ExperiencesFiltersState = {
  categories: [],
  durations: [],
  formats: [],
  seasons: [],
  participations: [],
  ratingRanges: [],
  priceLevels: [],
  locations: [],
  types: [],
  availability: [],
  sortBy: 'featured',
  search: '',
};

interface ExperiencesFiltersProps {
  filters: ExperiencesFiltersState;
  onChange: (filters: ExperiencesFiltersState) => void;
  sidebar?: boolean;
}

// ── Component ──────────────────────────────────────────────

const ExperiencesFilters: React.FC<ExperiencesFiltersProps> = ({
  filters,
  onChange,
  sidebar = false,
}) => {
  const { language } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(true);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Static filter option data
  const durations = [
    { id: 'up-to-2h', en: 'Up to 2 hours', bg: 'До 2 часа' },
    { id: '2-4h', en: '2-4 hours', bg: '2-4 часа' },
    { id: 'half-day', en: 'Half day', bg: 'Половин ден' },
    { id: 'full-day', en: 'Full day', bg: 'Цял ден' },
    { id: 'multi-day', en: 'Multi-day', bg: 'Многодневно' },
  ];

  const formats = [
    { id: 'walking', en: 'Walking', bg: 'Пешеходен' },
    { id: 'car', en: 'By car', bg: 'С автомобил' },
    { id: 'bike', en: 'By bike', bg: 'С велосипед' },
    { id: 'atv-motor', en: 'ATV/Motor', bg: 'С ATV/мотор' },
    { id: 'boat', en: 'By boat', bg: 'С лодка' },
    { id: 'combined', en: 'Combined', bg: 'Комбиниран' },
  ];

  const seasons = [
    { id: 'year-round', en: 'Year-round', bg: 'Целогодишно' },
    { id: 'summer', en: 'Summer', bg: 'Лято' },
    { id: 'winter', en: 'Winter', bg: 'Зима' },
  ];

  const participations = [
    { id: 'group', en: 'Group', bg: 'Групов' },
    { id: 'individual-private', en: 'Individual/Private', bg: 'Индивидуален/частен' },
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

  const locations = [
    { id: 'sofia', en: 'Sofia', bg: 'София' },
    { id: 'plovdiv', en: 'Plovdiv', bg: 'Пловдив' },
    { id: 'varna', en: 'Varna', bg: 'Варна' },
    { id: 'burgas', en: 'Burgas', bg: 'Бургас' },
    { id: 'bansko', en: 'Bansko', bg: 'Банско' },
    { id: 'veliko-tarnovo', en: 'Veliko Tarnovo', bg: 'Велико Търново' },
  ];

  const experienceTypes = [
    { id: 'group', en: 'Group', bg: 'Групово' },
    { id: 'private', en: 'Private', bg: 'Частно' },
    { id: 'vip', en: 'VIP', bg: 'VIP' },
  ];

  const availabilityOptions = [
    { id: 'today', en: 'Available Today', bg: 'Налично днес' },
    { id: 'this-week', en: 'This Week', bg: 'Тази седмица' },
  ];

  const sortOptions = [
    { id: 'featured', en: 'Featured', bg: 'Препоръчани' },
    { id: 'price-asc', en: 'Price ↑', bg: 'Цена ↑' },
    { id: 'price-desc', en: 'Price ↓', bg: 'Цена ↓' },
    { id: 'rating', en: 'Rating', bg: 'Рейтинг' },
    { id: 'duration', en: 'Duration', bg: 'Продължителност' },
  ];

  // Handlers
  const handleCategoryToggle = (categoryId: string) => {
    const category = experiencesCategories.find(c => c.id === categoryId);
    if (!category) return;

    const isSelected = filters.categories.includes(categoryId);
    const subIds = category.subcategories.map(s => s.id);

    if (isSelected) {
      const updated = filters.categories.filter(
        id => id !== categoryId && !subIds.includes(id)
      );
      onChange({ ...filters, categories: updated });
    } else {
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
      if (!updated.includes(parentId)) {
        updated.push(parentId);
      }
    }
    onChange({ ...filters, categories: updated });
  };

  const handleToggle = (
    key: keyof ExperiencesFiltersState,
    value: string
  ) => {
    const current = filters[key] as string[];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    onChange({ ...filters, [key]: updated });
  };

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      onChange({ ...filters, search: value });
    }, 300);
  }, [filters, onChange]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const handleClearAll = () => {
    onChange({ ...defaultExperiencesFilters });
  };

  const getActiveCount = () => {
    return (
      filters.categories.length +
      filters.durations.length +
      filters.formats.length +
      filters.seasons.length +
      filters.participations.length +
      filters.ratingRanges.length +
      filters.priceLevels.length +
      filters.locations.length +
      filters.types.length +
      filters.availability.length +
      (filters.search ? 1 : 0)
    );
  };

  const activeCount = getActiveCount();

  const innerContent = (
    <>
      {/* Search */}
      <SearchRow>
        <SearchInput>
          <Search />
          <input
            type="text"
            placeholder={language === 'bg' ? 'Търси изживяване...' : 'Search experiences...'}
            defaultValue={filters.search}
            onChange={handleSearchChange}
          />
        </SearchInput>
      </SearchRow>

      <FilterGrid>
        {/* Category */}
        <CategoryFilterGroup>
          <Label>
            <LayoutGrid />
            {language === 'bg' ? 'Категория' : 'Category'}
          </Label>
          <CheckboxGroup>
            {experiencesCategories.map(cat => (
              <CheckboxLabel
                key={cat.id}
                $checked={filters.categories.includes(cat.id)}
              >
                <input
                  type="checkbox"
                  checked={filters.categories.includes(cat.id)}
                  onChange={() => handleCategoryToggle(cat.id)}
                />
                {language === 'bg' ? cat.name.bg : cat.name.en}
              </CheckboxLabel>
            ))}
          </CheckboxGroup>
          {experiencesCategories
            .filter(cat => filters.categories.includes(cat.id))
            .map(cat => (
              <SubcategoryGroup key={`sub-${cat.id}`}>
                <SubcategoryParentLabel>
                  {language === 'bg' ? cat.name.bg : cat.name.en}
                </SubcategoryParentLabel>
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
                    {language === 'bg' ? sub.name.bg : sub.name.en}
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
            {locations.map(item => (
              <CheckboxLabel
                key={item.id}
                $checked={filters.locations.includes(item.id)}
              >
                <input
                  type="checkbox"
                  checked={filters.locations.includes(item.id)}
                  onChange={() => handleToggle('locations', item.id)}
                />
                {language === 'bg' ? item.bg : item.en}
              </CheckboxLabel>
            ))}
          </CheckboxGroup>
        </FilterGroup>

        {/* Duration */}
        <FilterGroup>
          <Label>
            <Clock />
            {language === 'bg' ? 'Продължителност' : 'Duration'}
          </Label>
          <CheckboxGroup>
            {durations.map(item => (
              <CheckboxLabel
                key={item.id}
                $checked={filters.durations.includes(item.id)}
              >
                <input
                  type="checkbox"
                  checked={filters.durations.includes(item.id)}
                  onChange={() => handleToggle('durations', item.id)}
                />
                {language === 'bg' ? item.bg : item.en}
              </CheckboxLabel>
            ))}
          </CheckboxGroup>
        </FilterGroup>

        {/* Type */}
        <FilterGroup>
          <Label>
            <Crown />
            {language === 'bg' ? 'Тип' : 'Type'}
          </Label>
          <CheckboxGroup>
            {experienceTypes.map(item => (
              <CheckboxLabel
                key={item.id}
                $checked={filters.types.includes(item.id)}
              >
                <input
                  type="checkbox"
                  checked={filters.types.includes(item.id)}
                  onChange={() => handleToggle('types', item.id)}
                />
                {language === 'bg' ? item.bg : item.en}
              </CheckboxLabel>
            ))}
          </CheckboxGroup>
        </FilterGroup>

        {/* Availability */}
        <FilterGroup>
          <Label>
            <Calendar />
            {language === 'bg' ? 'Наличност' : 'Availability'}
          </Label>
          <CheckboxGroup>
            {availabilityOptions.map(item => (
              <CheckboxLabel
                key={item.id}
                $checked={filters.availability.includes(item.id)}
              >
                <input
                  type="checkbox"
                  checked={filters.availability.includes(item.id)}
                  onChange={() => handleToggle('availability', item.id)}
                />
                {language === 'bg' ? item.bg : item.en}
              </CheckboxLabel>
            ))}
          </CheckboxGroup>
        </FilterGroup>

        {/* Format */}
        <FilterGroup>
          <Label>
            <Compass />
            {language === 'bg' ? 'Формат' : 'Format'}
          </Label>
          <CheckboxGroup>
            {formats.map(item => (
              <CheckboxLabel
                key={item.id}
                $checked={filters.formats.includes(item.id)}
              >
                <input
                  type="checkbox"
                  checked={filters.formats.includes(item.id)}
                  onChange={() => handleToggle('formats', item.id)}
                />
                {language === 'bg' ? item.bg : item.en}
              </CheckboxLabel>
            ))}
          </CheckboxGroup>
        </FilterGroup>

        {/* Season */}
        <FilterGroup>
          <Label>
            <Sun />
            {language === 'bg' ? 'Сезон' : 'Season'}
          </Label>
          <CheckboxGroup>
            {seasons.map(item => (
              <CheckboxLabel
                key={item.id}
                $checked={filters.seasons.includes(item.id)}
              >
                <input
                  type="checkbox"
                  checked={filters.seasons.includes(item.id)}
                  onChange={() => handleToggle('seasons', item.id)}
                />
                {language === 'bg' ? item.bg : item.en}
              </CheckboxLabel>
            ))}
          </CheckboxGroup>
        </FilterGroup>

        {/* Participation */}
        <FilterGroup>
          <Label>
            <Users />
            {language === 'bg' ? 'Тип участие' : 'Participation'}
          </Label>
          <CheckboxGroup>
            {participations.map(item => (
              <CheckboxLabel
                key={item.id}
                $checked={filters.participations.includes(item.id)}
              >
                <input
                  type="checkbox"
                  checked={filters.participations.includes(item.id)}
                  onChange={() => handleToggle('participations', item.id)}
                />
                {language === 'bg' ? item.bg : item.en}
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
                  onChange={() => handleToggle('ratingRanges', range.id)}
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
                  onChange={() => handleToggle('priceLevels', level.id)}
                />
                {language === 'bg' ? level.bg : level.en}
              </CheckboxLabel>
            ))}
          </CheckboxGroup>
        </FilterGroup>
      </FilterGrid>

      {/* Sort By */}
      <SortRow>
        <SortLabel>
          <ArrowUpDown />
          {language === 'bg' ? 'Сортирай:' : 'Sort:'}
        </SortLabel>
        {sortOptions.map(opt => (
          <SortPill
            key={opt.id}
            $active={filters.sortBy === opt.id}
            onClick={() => onChange({ ...filters, sortBy: opt.id })}
          >
            {language === 'bg' ? opt.bg : opt.en}
          </SortPill>
        ))}
      </SortRow>

      {activeCount > 0 && (
        <FilterActions>
          <Button variant="ghost" size="small" onClick={handleClearAll}>
            {language === 'bg' ? 'Изчисти всички' : 'Clear all'}
          </Button>
        </FilterActions>
      )}
    </>
  );

  if (sidebar) {
    return <>{innerContent}</>;
  }

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
            {innerContent}
          </motion.div>
        )}
      </AnimatePresence>
    </FilterContainer>
  );
};

export default ExperiencesFilters;
