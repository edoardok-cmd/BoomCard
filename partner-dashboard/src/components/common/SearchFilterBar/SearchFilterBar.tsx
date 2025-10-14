import React, { useState } from 'react';
import styled from 'styled-components';
import { useLanguage } from '../../../contexts/LanguageContext';

interface FilterOption {
  label: string;
  labelBg: string;
  value: string;
}

interface SearchFilterBarProps {
  onSearchChange: (query: string) => void;
  onFilterChange: (filters: any) => void;
  showCategoryFilter?: boolean;
  showCityFilter?: boolean;
  showPriceFilter?: boolean;
  showDiscountFilter?: boolean;
  showSortFilter?: boolean;
  showRatingFilter?: boolean;
  categories?: FilterOption[];
  cities?: FilterOption[];
  className?: string;
}

const FilterBarContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 2rem;
  background: white;
  padding: 1.5rem;
  border-radius: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  [data-theme="dark"] & {
    background: #1f2937;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
`;

const SearchRow = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 250px;
  padding: 0.75rem 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  transition: border-color 0.2s;

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

const FiltersRow = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
`;

const FilterSelect = styled.select`
  padding: 0.75rem 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: white;
  cursor: pointer;
  min-width: 150px;
  transition: border-color 0.2s;

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

  &:disabled {
    background: #f3f4f6;
    cursor: not-allowed;

    [data-theme="dark"] & {
      background: #4b5563;
    }
  }
`;

const FilterInput = styled.input`
  padding: 0.75rem 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  width: 120px;
  transition: border-color 0.2s;

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
    font-size: 0.8125rem;

    [data-theme="dark"] & {
      color: #6b7280;
    }
  }
`;

const ClearButton = styled.button`
  padding: 0.75rem 1.5rem;
  background: #f3f4f6;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;

  [data-theme="dark"] & {
    background: #374151;
    color: #d1d5db;
  }

  &:hover {
    background: #e5e7eb;

    [data-theme="dark"] & {
      background: #4b5563;
    }
  }

  &:active {
    transform: scale(0.98);
  }
`;

const SearchFilterBar: React.FC<SearchFilterBarProps> = ({
  onSearchChange,
  onFilterChange,
  showCategoryFilter = false,
  showCityFilter = false,
  showPriceFilter = false,
  showDiscountFilter = false,
  showSortFilter = true,
  showRatingFilter = false,
  categories = [],
  cities = [],
  className,
}) => {
  const { language } = useLanguage();

  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    category: '',
    city: '',
    priceRange: '',
    minDiscount: '',
    minRating: '',
    sortBy: 'discount',
    sortOrder: 'desc',
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    onSearchChange(query);
  };

  const handleFilterChange = (key: string, value: string) => {
    const updatedFilters = { ...filters, [key]: value };
    setFilters(updatedFilters);

    // Convert to API format
    const apiFilters: any = {};
    if (updatedFilters.category) apiFilters.category = updatedFilters.category;
    if (updatedFilters.city) apiFilters.city = updatedFilters.city;
    if (updatedFilters.priceRange) apiFilters.priceRange = updatedFilters.priceRange;
    if (updatedFilters.minDiscount) apiFilters.minDiscount = parseInt(updatedFilters.minDiscount);
    if (updatedFilters.minRating) apiFilters.minRating = parseFloat(updatedFilters.minRating);
    if (updatedFilters.sortBy) {
      apiFilters.sortBy = updatedFilters.sortBy;
      apiFilters.sortOrder = updatedFilters.sortOrder;
    }

    onFilterChange(apiFilters);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setFilters({
      category: '',
      city: '',
      priceRange: '',
      minDiscount: '',
      minRating: '',
      sortBy: 'discount',
      sortOrder: 'desc',
    });
    onSearchChange('');
    onFilterChange({});
  };

  const t = {
    en: {
      searchPlaceholder: 'Search offers, venues, partners...',
      category: 'Category',
      allCategories: 'All Categories',
      city: 'City',
      allCities: 'All Cities',
      priceRange: 'Price Range',
      allPrices: 'All Prices',
      budget: 'Budget (150-250 BGN)',
      midRange: 'Mid-Range (250-350 BGN)',
      premium: 'Premium (350-500 BGN)',
      luxury: 'Luxury (500+ BGN)',
      minDiscount: 'Min Discount %',
      minRating: 'Min Rating',
      sortBy: 'Sort By',
      highestDiscount: 'Highest Discount',
      lowestPrice: 'Lowest Price',
      highestRating: 'Highest Rating',
      newest: 'Newest First',
      clearFilters: 'Clear Filters',
    },
    bg: {
      searchPlaceholder: 'Търсене на оферти, места, партньори...',
      category: 'Категория',
      allCategories: 'Всички Категории',
      city: 'Град',
      allCities: 'Всички Градове',
      priceRange: 'Ценова Категория',
      allPrices: 'Всички Цени',
      budget: 'Бюджет (150-250 лв)',
      midRange: 'Среден Клас (250-350 лв)',
      premium: 'Премиум (350-500 лв)',
      luxury: 'Лукс (500+ лв)',
      minDiscount: 'Мин. Отстъпка %',
      minRating: 'Мин. Рейтинг',
      sortBy: 'Сортирай По',
      highestDiscount: 'Най-Висока Отстъпка',
      lowestPrice: 'Най-Ниска Цена',
      highestRating: 'Най-Висок Рейтинг',
      newest: 'Най-Нови Първи',
      clearFilters: 'Изчисти Филтри',
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  return (
    <FilterBarContainer className={className}>
      {/* Search Row */}
      <SearchRow>
        <SearchInput
          type="text"
          placeholder={content.searchPlaceholder}
          value={searchQuery}
          onChange={handleSearchChange}
        />
      </SearchRow>

      {/* Filters Row */}
      <FiltersRow>
        {/* Category Filter */}
        {showCategoryFilter && (
          <FilterSelect
            value={filters.category}
            onChange={(e) => handleFilterChange('category', e.target.value)}
          >
            <option value="">{content.allCategories}</option>
            {categories.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {language === 'bg' ? cat.labelBg : cat.label}
              </option>
            ))}
          </FilterSelect>
        )}

        {/* City Filter */}
        {showCityFilter && (
          <FilterSelect
            value={filters.city}
            onChange={(e) => handleFilterChange('city', e.target.value)}
          >
            <option value="">{content.allCities}</option>
            {cities.map((city) => (
              <option key={city.value} value={city.value}>
                {language === 'bg' ? city.labelBg : city.label}
              </option>
            ))}
          </FilterSelect>
        )}

        {/* Price Range Filter */}
        {showPriceFilter && (
          <FilterSelect
            value={filters.priceRange}
            onChange={(e) => handleFilterChange('priceRange', e.target.value)}
          >
            <option value="">{content.allPrices}</option>
            <option value="budget">{content.budget}</option>
            <option value="mid-range">{content.midRange}</option>
            <option value="premium">{content.premium}</option>
            <option value="luxury">{content.luxury}</option>
          </FilterSelect>
        )}

        {/* Minimum Discount Filter */}
        {showDiscountFilter && (
          <FilterInput
            type="number"
            placeholder={content.minDiscount}
            min="0"
            max="100"
            value={filters.minDiscount}
            onChange={(e) => handleFilterChange('minDiscount', e.target.value)}
          />
        )}

        {/* Minimum Rating Filter */}
        {showRatingFilter && (
          <FilterInput
            type="number"
            placeholder={content.minRating}
            min="0"
            max="5"
            step="0.1"
            value={filters.minRating}
            onChange={(e) => handleFilterChange('minRating', e.target.value)}
          />
        )}

        {/* Sort Filter */}
        {showSortFilter && (
          <FilterSelect
            value={filters.sortBy}
            onChange={(e) => handleFilterChange('sortBy', e.target.value)}
          >
            <option value="discount">{content.highestDiscount}</option>
            <option value="price">{content.lowestPrice}</option>
            <option value="rating">{content.highestRating}</option>
            <option value="newest">{content.newest}</option>
          </FilterSelect>
        )}

        {/* Clear Filters Button */}
        <ClearButton onClick={handleClearFilters}>
          {content.clearFilters}
        </ClearButton>
      </FiltersRow>
    </FilterBarContainer>
  );
};

export default SearchFilterBar;
