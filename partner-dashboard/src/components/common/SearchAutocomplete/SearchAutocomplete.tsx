import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import { useLanguage } from '../../../contexts/LanguageContext';

interface SearchResult {
  id: string;
  title: string;
  titleBg: string;
  category: string;
  categoryBg: string;
  location: string;
  type: 'offer' | 'venue' | 'category';
  path: string;
  imageUrl?: string;
  discount?: number;
}

interface SearchAutocompleteProps {
  language?: 'en' | 'bg';
  placeholder?: string;
  onSearch?: (query: string) => void;
}

const SearchContainer = styled.div`
  position: relative;
  width: 100%;
  max-width: 600px;
`;

const SearchInputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 9999px;
  padding: 0.75rem 1.5rem;
  transition: all 200ms;

  &:focus-within {
    border-color: #000000;
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.1);
  }

  @media (max-width: 768px) {
    padding: 0.625rem 1.25rem;
  }
`;

const SearchIcon = styled.svg`
  width: 1.25rem;
  height: 1.25rem;
  color: #6b7280;
  margin-right: 0.75rem;
  flex-shrink: 0;
`;

const SearchInput = styled.input`
  flex: 1;
  border: none;
  outline: none;
  font-size: 1rem;
  color: #111827;
  background: transparent;

  &::placeholder {
    color: #9ca3af;
  }

  @media (max-width: 768px) {
    font-size: 0.9375rem;
  }
`;

const ClearButton = styled.button`
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  border: none;
  background: #e5e7eb;
  color: #6b7280;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 200ms;
  margin-left: 0.5rem;

  &:hover {
    background: #d1d5db;
    color: #111827;
  }

  svg {
    width: 0.875rem;
    height: 0.875rem;
  }
`;

const ResultsDropdown = styled(motion.div)`
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  right: 0;
  background: white;
  border-radius: 1rem;
  box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.15);
  max-height: 400px;
  overflow-y: auto;
  z-index: 50;

  @media (max-width: 768px) {
    max-height: 300px;
  }
`;

const ResultsHeader = styled.div`
  padding: 1rem 1.5rem 0.75rem;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const ResultItem = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.875rem 1.5rem;
  cursor: pointer;
  transition: background 200ms;
  border-bottom: 1px solid #f3f4f6;

  &:hover {
    background: #f9fafb;
  }

  &:last-child {
    border-bottom: none;
  }
`;

const ResultImage = styled.div<{ $url?: string }>`
  width: 3rem;
  height: 3rem;
  border-radius: 0.5rem;
  background: ${props => props.$url ? `url(${props.$url})` : '#e5e7eb'};
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
`;

const ResultContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const ResultTitle = styled.div`
  font-size: 0.9375rem;
  font-weight: 500;
  color: #111827;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ResultMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8125rem;
  color: #6b7280;
`;

const ResultBadge = styled.span`
  display: inline-flex;
  padding: 0.125rem 0.5rem;
  background: #f3f4f6;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  color: #6b7280;
`;

const DiscountBadge = styled.span`
  display: inline-flex;
  padding: 0.125rem 0.5rem;
  background: #000000;
  color: white;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 700;
`;

const EmptyState = styled.div`
  padding: 3rem 1.5rem;
  text-align: center;
  color: #9ca3af;
`;

const EmptyIcon = styled.div`
  font-size: 3rem;
  margin-bottom: 0.75rem;
`;

const EmptyText = styled.div`
  font-size: 0.9375rem;
`;

// Sample data - would come from API in real implementation
const sampleResults: SearchResult[] = [
  {
    id: '1',
    title: 'Spa Weekend in Bansko',
    titleBg: 'Спа уикенд в Банско',
    category: 'Spa & Wellness',
    categoryBg: 'Спа и уелнес',
    location: 'Bansko',
    type: 'offer',
    path: '/offers/spa-bansko-70',
    imageUrl: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=200',
    discount: 70
  },
  {
    id: '2',
    title: 'Fine Dining Experience',
    titleBg: 'Изискана вечеря',
    category: 'Fine Dining',
    categoryBg: 'Висока кухня',
    location: 'Sofia',
    type: 'offer',
    path: '/offers/fine-dining-sofia-50',
    imageUrl: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=200',
    discount: 50
  },
  {
    id: '3',
    title: 'Kempinski Hotel Grand Arena',
    titleBg: 'Кемпински Хотел Гранд Арена',
    category: 'Hotels',
    categoryBg: 'Хотели',
    location: 'Bansko',
    type: 'venue',
    path: '/venues/kempinski-bansko',
    imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=200'
  },
  {
    id: '4',
    title: 'Restaurants & Bars',
    titleBg: 'Ресторанти и барове',
    category: 'Category',
    categoryBg: 'Категория',
    location: '150 places',
    type: 'category',
    path: '/categories/restaurants'
  }
];

export const SearchAutocomplete: React.FC<SearchAutocompleteProps> = ({
  language = 'en',
  placeholder,
  onSearch
}) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const defaultPlaceholder = t('common.searchPlaceholder');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    // Simulate API call with debounce
    const timeoutId = setTimeout(() => {
      if (query.length < 2) {
        setResults([]);
        setIsOpen(false);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const filtered = sampleResults.filter(result => {
        const searchIn = language === 'bg'
          ? `${result.titleBg} ${result.categoryBg} ${result.location}`.toLowerCase()
          : `${result.title} ${result.category} ${result.location}`.toLowerCase();
        return searchIn.includes(query.toLowerCase());
      });

      setResults(filtered);
      setIsOpen(true);
      setIsLoading(false);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, language]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  const handleResultClick = (result: SearchResult) => {
    navigate(result.path);
    setQuery('');
    setResults([]);
    setIsOpen(false);
    if (onSearch) {
      onSearch(result.title);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <SearchContainer ref={containerRef}>
      <SearchInputWrapper>
        <SearchIcon fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </SearchIcon>
        <SearchInput
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || defaultPlaceholder}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
        />
        {query && (
          <ClearButton onClick={handleClear} aria-label="Clear search">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </ClearButton>
        )}
      </SearchInputWrapper>

      <AnimatePresence>
        {isOpen && (
          <ResultsDropdown
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {isLoading ? (
              <EmptyState>
                <EmptyText>{t('common.searching')}</EmptyText>
              </EmptyState>
            ) : results.length > 0 ? (
              <>
                <ResultsHeader>
                  {results.length} {t('common.results')}
                </ResultsHeader>
                {results.map((result) => (
                  <ResultItem key={result.id} onClick={() => handleResultClick(result)}>
                    <ResultImage $url={result.imageUrl} />
                    <ResultContent>
                      <ResultTitle>
                        {language === 'bg' ? result.titleBg : result.title}
                      </ResultTitle>
                      <ResultMeta>
                        <ResultBadge>
                          {language === 'bg' ? result.categoryBg : result.category}
                        </ResultBadge>
                        <span>{result.location}</span>
                        {result.discount && (
                          <DiscountBadge>-{result.discount}%</DiscountBadge>
                        )}
                      </ResultMeta>
                    </ResultContent>
                  </ResultItem>
                ))}
              </>
            ) : (
              <EmptyState>
                <EmptyIcon>🔍</EmptyIcon>
                <EmptyText>
                  {t('common.noResultsFound')}
                </EmptyText>
              </EmptyState>
            )}
          </ResultsDropdown>
        )}
      </AnimatePresence>
    </SearchContainer>
  );
};

export default SearchAutocomplete;
