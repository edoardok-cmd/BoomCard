import React from 'react';
import styled from 'styled-components';
import { useLanguage } from '../../../contexts/LanguageContext';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  className?: string;
}

const PaginationContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  margin: 2rem 0;
`;

const PaginationInfo = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  text-align: center;
`;

const PaginationControls = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
`;

const PageButton = styled.button<{ $active?: boolean; $disabled?: boolean }>`
  min-width: 40px;
  height: 40px;
  padding: 0 0.75rem;
  border: 2px solid ${props => props.$active ? '#000000' : '#e5e7eb'};
  background: ${props => props.$active ? '#000000' : 'white'};
  color: ${props => props.$active ? 'white' : '#374151'};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: ${props => props.$active ? '600' : '500'};
  cursor: ${props => props.$disabled ? 'not-allowed' : 'pointer'};
  opacity: ${props => props.$disabled ? '0.5' : '1'};
  transition: all 0.2s;

  &:hover:not(:disabled) {
    border-color: #000000;
    background: ${props => props.$active ? '#000000' : '#f9fafb'};
  }

  &:active:not(:disabled) {
    transform: scale(0.95);
  }

  &:disabled {
    cursor: not-allowed;
  }
`;

const NavButton = styled(PageButton)`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-weight: 500;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const Ellipsis = styled.span`
  display: flex;
  align-items: center;
  padding: 0 0.5rem;
  color: #9ca3af;
  font-weight: 500;
`;

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  className,
}) => {
  const { language } = useLanguage();

  const t = {
    en: {
      showing: 'Showing',
      to: 'to',
      of: 'of',
      results: 'results',
      previous: 'Previous',
      next: 'Next',
      first: 'First',
      last: 'Last',
    },
    bg: {
      showing: 'Показване на',
      to: 'до',
      of: 'от',
      results: 'резултата',
      previous: 'Предишна',
      next: 'Следваща',
      first: 'Първа',
      last: 'Последна',
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  // Calculate showing range
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7; // Max page buttons to show

    if (totalPages <= maxVisible) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage <= 3) {
        // Near beginning
        for (let i = 2; i <= Math.min(5, totalPages - 1); i++) {
          pages.push(i);
        }
        pages.push('...');
      } else if (currentPage >= totalPages - 2) {
        // Near end
        pages.push('...');
        for (let i = totalPages - 4; i < totalPages; i++) {
          if (i > 1) pages.push(i);
        }
      } else {
        // In middle
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
      }

      // Always show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const handlePageClick = (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      onPageChange(page);
      // Scroll to top of page
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (totalPages <= 1) {
    return null; // Don't show pagination if only 1 page
  }

  return (
    <PaginationContainer className={className}>
      {/* Info */}
      <PaginationInfo>
        {content.showing} <strong>{startItem}</strong> {content.to}{' '}
        <strong>{endItem}</strong> {content.of} <strong>{totalItems}</strong>{' '}
        {content.results}
      </PaginationInfo>

      {/* Controls */}
      <PaginationControls>
        {/* First Page Button */}
        <NavButton
          onClick={() => handlePageClick(1)}
          disabled={currentPage === 1}
          $disabled={currentPage === 1}
          aria-label="First page"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
          {content.first}
        </NavButton>

        {/* Previous Button */}
        <NavButton
          onClick={() => handlePageClick(currentPage - 1)}
          disabled={currentPage === 1}
          $disabled={currentPage === 1}
          aria-label="Previous page"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {content.previous}
        </NavButton>

        {/* Page Numbers */}
        {getPageNumbers().map((page, index) =>
          typeof page === 'number' ? (
            <PageButton
              key={index}
              onClick={() => handlePageClick(page)}
              $active={page === currentPage}
              aria-label={`Page ${page}`}
              aria-current={page === currentPage ? 'page' : undefined}
            >
              {page}
            </PageButton>
          ) : (
            <Ellipsis key={index}>…</Ellipsis>
          )
        )}

        {/* Next Button */}
        <NavButton
          onClick={() => handlePageClick(currentPage + 1)}
          disabled={currentPage === totalPages}
          $disabled={currentPage === totalPages}
          aria-label="Next page"
        >
          {content.next}
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </NavButton>

        {/* Last Page Button */}
        <NavButton
          onClick={() => handlePageClick(totalPages)}
          disabled={currentPage === totalPages}
          $disabled={currentPage === totalPages}
          aria-label="Last page"
        >
          {content.last}
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </NavButton>
      </PaginationControls>
    </PaginationContainer>
  );
};

export default Pagination;
