import React, { useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import { Filter, Clock, Compass, Sun, Users, ChevronDown, ChevronUp, Star, DollarSign } from 'lucide-react';
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

export interface ExperiencesFiltersState {
  durations: string[];
  formats: string[];
  seasons: string[];
  participations: string[];
  ratingRanges: string[];
  priceLevels: string[];
}

interface ExperiencesFiltersProps {
  filters: ExperiencesFiltersState;
  onChange: (filters: ExperiencesFiltersState) => void;
}

const ExperiencesFilters: React.FC<ExperiencesFiltersProps> = ({
  filters,
  onChange,
}) => {
  const { language } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(true);

  const durations = [
    { id: 'up-to-2h', en: 'Up to 2 hours', bg: 'До 2 часа' },
    { id: 'half-day', en: 'Half day', bg: 'Половин ден' },
    { id: 'full-day', en: 'Full day', bg: 'Цял ден' },
    { id: '2-plus-days', en: '2+ days', bg: '2+ дни' },
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

  const handleClearAll = () => {
    onChange({
      durations: [],
      formats: [],
      seasons: [],
      participations: [],
      ratingRanges: [],
      priceLevels: [],
    });
  };

  const getActiveCount = () => {
    return (
      filters.durations.length +
      filters.formats.length +
      filters.seasons.length +
      filters.participations.length +
      filters.ratingRanges.length +
      filters.priceLevels.length
    );
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
                  {language === 'bg' ? 'Тип участие' : 'Participation Type'}
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

export default ExperiencesFilters;
