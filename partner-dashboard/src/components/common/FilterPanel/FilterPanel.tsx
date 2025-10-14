import { useLanguage } from '../../../contexts/LanguageContext';
import React, { useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../Button/Button';

export interface FilterOption {
  id: string;
  label: string;
  labelBg: string;
  value: string;
}

export interface FilterGroup {
  id: string;
  title: string;
  titleBg: string;
  options: FilterOption[];
  type: 'checkbox' | 'radio' | 'range';
  min?: number;
  max?: number;
}

interface FilterPanelProps {
  filters: FilterGroup[];
  language?: 'en' | 'bg';
  onApplyFilters: (selectedFilters: Record<string, string[]>) => void;
  className?: string;
}

const FilterContainer = styled.div`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

  [data-theme="dark"] & {
    background: #1f2937;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  @media (max-width: 768px) {
    border-radius: 0;
    padding: 1rem;
  }
`;

const FilterHeader = styled.div`
  display: flex;
  justify-content: between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e5e7eb;

  [data-theme="dark"] & {
    border-bottom-color: #374151;
  }
`;

const FilterTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const FilterGroupContainer = styled.div`
  margin-bottom: 1.5rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

const FilterGroupTitle = styled.button`
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: #374151;
  background: none;
  border: none;
  cursor: pointer;
  transition: color 200ms;

  [data-theme="dark"] & {
    color: #d1d5db;
  }

  &:hover {
    color: #111827;

    [data-theme="dark"] & {
      color: #f9fafb;
    }
  }
`;

const FilterOptions = styled(motion.div)`
  padding-top: 0.75rem;
`;

const FilterOption = styled.label`
  display: flex;
  align-items: center;
  padding: 0.625rem 0;
  cursor: pointer;
  transition: color 200ms;

  &:hover {
    color: #111827;
  }

  input {
    margin-right: 0.75rem;
    cursor: pointer;
  }

  span {
    font-size: 0.9375rem;
    color: #6b7280;
    transition: color 200ms;

    [data-theme="dark"] & {
      color: #9ca3af;
    }
  }

  &:hover span {
    color: #111827;

    [data-theme="dark"] & {
      color: #f9fafb;
    }
  }
`;

const RangeContainer = styled.div`
  padding: 0.75rem 0;
`;

const RangeInput = styled.input`
  width: 100%;
  height: 0.375rem;
  border-radius: 9999px;
  background: #e5e7eb;
  outline: none;
  cursor: pointer;

  &::-webkit-slider-thumb {
    appearance: none;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
    background: #000000;
    cursor: pointer;
    transition: transform 200ms;

    &:hover {
      transform: scale(1.1);
    }
  }

  &::-moz-range-thumb {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
    background: #000000;
    cursor: pointer;
    border: none;
    transition: transform 200ms;

    &:hover {
      transform: scale(1.1);
    }
  }
`;

const RangeLabels = styled.div`
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #6b7280;

  [data-theme="dark"] & {
    color: #9ca3af;
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

const ChevronIcon = styled.svg<{ $isOpen: boolean }>`
  width: 1.25rem;
  height: 1.25rem;
  transition: transform 200ms;
  transform: rotate(${props => props.$isOpen ? '180deg' : '0deg'});
`;

export const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  language = 'en',
  onApplyFilters,
  className
}) => {
  const { t } = useLanguage();
  const [expandedGroups, setExpandedGroups] = useState<string[]>(
    filters.map(f => f.id)
  );
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const [rangeValues, setRangeValues] = useState<Record<string, number>>({});

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleCheckboxChange = (groupId: string, optionValue: string) => {
    setSelectedFilters(prev => {
      const groupFilters = prev[groupId] || [];
      const isSelected = groupFilters.includes(optionValue);

      return {
        ...prev,
        [groupId]: isSelected
          ? groupFilters.filter(v => v !== optionValue)
          : [...groupFilters, optionValue]
      };
    });
  };

  const handleRadioChange = (groupId: string, optionValue: string) => {
    setSelectedFilters(prev => ({
      ...prev,
      [groupId]: [optionValue]
    }));
  };

  const handleRangeChange = (groupId: string, value: number) => {
    setRangeValues(prev => ({
      ...prev,
      [groupId]: value
    }));
  };

  const handleApply = () => {
    const allFilters = {
      ...selectedFilters,
      ...Object.entries(rangeValues).reduce((acc, [key, value]) => ({
        ...acc,
        [key]: [value.toString()]
      }), {})
    };
    onApplyFilters(allFilters);
  };

  const handleClear = () => {
    setSelectedFilters({});
    setRangeValues({});
    onApplyFilters({});
  };

  const hasActiveFilters =
    Object.keys(selectedFilters).length > 0 ||
    Object.keys(rangeValues).length > 0;

  return (
    <FilterContainer className={className}>
      <FilterHeader>
        <FilterTitle>
          {t('common.filters')}
        </FilterTitle>
      </FilterHeader>

      {filters.map((filterGroup) => {
        const isExpanded = expandedGroups.includes(filterGroup.id);
        const title = language === 'bg' ? filterGroup.titleBg : filterGroup.title;

        return (
          <FilterGroupContainer key={filterGroup.id}>
            <FilterGroupTitle onClick={() => toggleGroup(filterGroup.id)}>
              <span>{title}</span>
              <ChevronIcon
                $isOpen={isExpanded}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </ChevronIcon>
            </FilterGroupTitle>

            <AnimatePresence>
              {isExpanded && (
                <FilterOptions
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {filterGroup.type === 'range' ? (
                    <RangeContainer>
                      <RangeInput
                        type="range"
                        min={filterGroup.min || 0}
                        max={filterGroup.max || 100}
                        value={rangeValues[filterGroup.id] || filterGroup.min || 0}
                        onChange={(e) =>
                          handleRangeChange(filterGroup.id, parseInt(e.target.value))
                        }
                      />
                      <RangeLabels>
                        <span>{filterGroup.min || 0}</span>
                        <span>{rangeValues[filterGroup.id] || filterGroup.min || 0}</span>
                        <span>{filterGroup.max || 100}</span>
                      </RangeLabels>
                    </RangeContainer>
                  ) : (
                    filterGroup.options.map((option) => {
                      const label = language === 'bg' ? option.labelBg : option.label;
                      const isChecked = selectedFilters[filterGroup.id]?.includes(
                        option.value
                      );

                      return (
                        <FilterOption key={option.id}>
                          <input
                            type={filterGroup.type}
                            name={filterGroup.id}
                            value={option.value}
                            checked={isChecked}
                            onChange={() =>
                              filterGroup.type === 'checkbox'
                                ? handleCheckboxChange(filterGroup.id, option.value)
                                : handleRadioChange(filterGroup.id, option.value)
                            }
                          />
                          <span>{label}</span>
                        </FilterOption>
                      );
                    })
                  )}
                </FilterOptions>
              )}
            </AnimatePresence>
          </FilterGroupContainer>
        );
      })}

      <FilterActions>
        <div style={{ flex: 1 }}>
          <Button
            variant="primary"
            size="medium"
            onClick={handleApply}
          >
            {t('common.apply')}
          </Button>
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="medium"
            onClick={handleClear}
          >
            {t('common.clear')}
          </Button>
        )}
      </FilterActions>
    </FilterContainer>
  );
};

export default FilterPanel;
