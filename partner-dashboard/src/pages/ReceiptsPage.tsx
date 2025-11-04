import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { receiptsApiService } from '../services/receipts-api.service';
import { Receipt, ReceiptStatus, ReceiptFilters } from '../types/receipt.types';
import { ReceiptCard } from '../components/feature/ReceiptCard';
import { FileText, Filter, Plus, Search, X, Download, BarChart3 } from 'lucide-react';
import { exportReceiptsToCSV } from '../utils/receiptExport';

const PageContainer = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
`;

const PageHeader = styled.div`
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.5rem 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;

  svg {
    color: #6b7280;
  }
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: #6b7280;
  margin: 0;
`;

const ActionsBar = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
`;

const SearchBar = styled.div`
  display: flex;
  align-items: center;
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  flex: 1;
  min-width: 250px;
  max-width: 400px;

  svg {
    color: #9ca3af;
    margin-right: 0.75rem;
  }

  input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 0.9375rem;
    color: #111827;

    &::placeholder {
      color: #9ca3af;
    }
  }
`;

const FilterButton = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: ${props => props.$active ? '#000000' : 'white'};
  color: ${props => props.$active ? 'white' : '#111827'};
  border: 2px solid ${props => props.$active ? '#000000' : '#e5e7eb'};
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const AddButton = styled(FilterButton)`
  background: #000000;
  color: white;
  border-color: #000000;

  &:hover {
    background: #111827;
  }
`;

const FiltersPanel = styled.div<{ $isOpen: boolean }>`
  display: ${props => props.$isOpen ? 'grid' : 'none'};
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  padding: 1.5rem;
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 1rem;
  margin-bottom: 2rem;
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const FilterLabel = styled.label`
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
`;

const FilterSelect = styled.select`
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: #111827;
  background: white;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #000000;
  }
`;

const FilterInput = styled.input`
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: #111827;

  &:focus {
    outline: none;
    border-color: #000000;
  }
`;

const ActiveFilters = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
`;

const FilterChip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #f3f4f6;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;

  button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    color: #6b7280;

    &:hover {
      color: #111827;
    }

    svg {
      width: 14px;
      height: 14px;
    }
  }
`;

const ReceiptsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  background: white;
  border: 2px dashed #e5e7eb;
  border-radius: 1rem;

  svg {
    width: 64px;
    height: 64px;
    color: #d1d5db;
    margin: 0 auto 1rem;
  }

  h3 {
    font-size: 1.25rem;
    font-weight: 700;
    color: #111827;
    margin: 0 0 0.5rem 0;
  }

  p {
    font-size: 0.9375rem;
    color: #6b7280;
    margin: 0 0 1.5rem 0;
  }
`;

const Pagination = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 2rem;
`;

const PageButton = styled.button<{ $active?: boolean }>`
  padding: 0.75rem 1.25rem;
  background: ${props => props.$active ? '#000000' : 'white'};
  color: ${props => props.$active ? 'white' : '#111827'};
  border: 2px solid ${props => props.$active ? '#000000' : '#e5e7eb'};
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const PageInfo = styled.div`
  font-size: 0.9375rem;
  color: #6b7280;
`;

const LoadingSpinner = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  font-size: 1.125rem;
  color: #6b7280;
`;

export const ReceiptsPage: React.FC = () => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<ReceiptFilters>({
    page: 1,
    limit: 12,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0,
  });

  const t = {
    en: {
      title: 'My Receipts',
      subtitle: 'View and manage all your scanned receipts',
      search: 'Search by merchant...',
      filters: 'Filters',
      addNew: 'Scan Receipt',
      exportCSV: 'Export CSV',
      viewAnalytics: 'View Analytics',
      status: 'Status',
      sortBy: 'Sort By',
      dateRange: 'Date Range',
      allStatuses: 'All Statuses',
      pending: 'Pending',
      validated: 'Validated',
      rejected: 'Rejected',
      cashbackApplied: 'Cashback Applied',
      sortNewest: 'Newest First',
      sortOldest: 'Oldest First',
      sortAmountHigh: 'Highest Amount',
      sortAmountLow: 'Lowest Amount',
      emptyTitle: 'No Receipts Yet',
      emptyDescription: 'Start scanning receipts to earn cashback!',
      loading: 'Loading receipts...',
      page: 'Page',
      of: 'of',
      previous: 'Previous',
      next: 'Next',
      activeFilters: 'Active Filters:',
      clearFilter: 'Clear',
    },
    bg: {
      title: 'Моите бележки',
      subtitle: 'Преглед и управление на всички сканирани бележки',
      search: 'Търси по търговец...',
      filters: 'Филтри',
      addNew: 'Сканирай бележка',
      exportCSV: 'Експорт CSV',
      viewAnalytics: 'Виж анализ',
      status: 'Статус',
      sortBy: 'Сортиране',
      dateRange: 'Период',
      allStatuses: 'Всички статуси',
      pending: 'Очакващи',
      validated: 'Валидирани',
      rejected: 'Отхвърлени',
      cashbackApplied: 'С кешбек',
      sortNewest: 'Най-нови първо',
      sortOldest: 'Най-стари първо',
      sortAmountHigh: 'Най-висока сума',
      sortAmountLow: 'Най-ниска сума',
      emptyTitle: 'Все още няма бележки',
      emptyDescription: 'Започнете да сканирате бележки за да спечелите кешбек!',
      loading: 'Зареждане на бележки...',
      page: 'Страница',
      of: 'от',
      previous: 'Предишна',
      next: 'Следваща',
      activeFilters: 'Активни филтри:',
      clearFilter: 'Изчисти',
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  useEffect(() => {
    fetchReceipts();
  }, [filters]);

  const fetchReceipts = async () => {
    setLoading(true);
    try {
      const response = await receiptsApiService.getReceipts({
        ...filters,
        merchantName: searchTerm || undefined,
      });

      if (response.success) {
        setReceipts(response.data);
        setPagination(response.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch receipts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setFilters({ ...filters, page: 1 });
    fetchReceipts();
  };

  const handleStatusFilter = (status?: ReceiptStatus) => {
    setFilters({ ...filters, status, page: 1 });
  };

  const handleSortChange = (sortBy: 'createdAt' | 'totalAmount', sortOrder: 'asc' | 'desc') => {
    setFilters({ ...filters, sortBy, sortOrder, page: 1 });
  };

  const handleDelete = async (id: string) => {
    try {
      await receiptsApiService.deleteReceipt(id);
      fetchReceipts();
    } catch (error) {
      console.error('Failed to delete receipt:', error);
      alert(language === 'bg' ? 'Грешка при изтриване' : 'Failed to delete receipt');
    }
  };

  const handlePageChange = (newPage: number) => {
    setFilters({ ...filters, page: newPage });
  };

  const getActiveFilters = () => {
    const active: Array<{ key: string; label: string }> = [];
    if (filters.status) {
      active.push({
        key: 'status',
        label: `${content.status}: ${content[filters.status.toLowerCase() as keyof typeof content] || filters.status}`,
      });
    }
    if (searchTerm) {
      active.push({ key: 'search', label: `${content.search.replace('...', '')}: ${searchTerm}` });
    }
    return active;
  };

  const clearFilter = (key: string) => {
    if (key === 'status') {
      setFilters({ ...filters, status: undefined, page: 1 });
    } else if (key === 'search') {
      setSearchTerm('');
      setFilters({ ...filters, page: 1 });
    }
  };

  return (
    <PageContainer>
      <PageHeader>
        <Title>
          <FileText />
          {content.title}
        </Title>
        <Subtitle>{content.subtitle}</Subtitle>
      </PageHeader>

      <ActionsBar>
        <SearchBar>
          <Search size={20} />
          <input
            type="text"
            placeholder={content.search}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
        </SearchBar>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <FilterButton $active={showFilters} onClick={() => setShowFilters(!showFilters)}>
            <Filter />
            {content.filters}
          </FilterButton>
          <FilterButton onClick={() => navigate('/receipts/analytics')}>
            <BarChart3 />
            {content.viewAnalytics}
          </FilterButton>
          <FilterButton onClick={() => exportReceiptsToCSV(receipts, 'my-receipts.csv')}>
            <Download />
            {content.exportCSV}
          </FilterButton>
          <AddButton onClick={() => navigate('/receipt-scanner')}>
            <Plus />
            {content.addNew}
          </AddButton>
        </div>
      </ActionsBar>

      {getActiveFilters().length > 0 && (
        <ActiveFilters>
          <span style={{ fontSize: '0.875rem', color: '#6b7280', marginRight: '0.5rem' }}>
            {content.activeFilters}
          </span>
          {getActiveFilters().map((filter) => (
            <FilterChip key={filter.key}>
              {filter.label}
              <button onClick={() => clearFilter(filter.key)}>
                <X />
              </button>
            </FilterChip>
          ))}
        </ActiveFilters>
      )}

      <FiltersPanel $isOpen={showFilters}>
        <FilterGroup>
          <FilterLabel>{content.status}</FilterLabel>
          <FilterSelect
            value={filters.status || ''}
            onChange={(e) => handleStatusFilter(e.target.value as ReceiptStatus || undefined)}
          >
            <option value="">{content.allStatuses}</option>
            <option value={ReceiptStatus.PENDING}>{content.pending}</option>
            <option value={ReceiptStatus.VALIDATED}>{content.validated}</option>
            <option value={ReceiptStatus.REJECTED}>{content.rejected}</option>
            <option value={ReceiptStatus.CASHBACK_APPLIED}>{content.cashbackApplied}</option>
          </FilterSelect>
        </FilterGroup>

        <FilterGroup>
          <FilterLabel>{content.sortBy}</FilterLabel>
          <FilterSelect
            value={`${filters.sortBy}-${filters.sortOrder}`}
            onChange={(e) => {
              const [sortBy, sortOrder] = e.target.value.split('-') as ['createdAt' | 'totalAmount', 'asc' | 'desc'];
              handleSortChange(sortBy, sortOrder);
            }}
          >
            <option value="createdAt-desc">{content.sortNewest}</option>
            <option value="createdAt-asc">{content.sortOldest}</option>
            <option value="totalAmount-desc">{content.sortAmountHigh}</option>
            <option value="totalAmount-asc">{content.sortAmountLow}</option>
          </FilterSelect>
        </FilterGroup>
      </FiltersPanel>

      {loading ? (
        <LoadingSpinner>{content.loading}</LoadingSpinner>
      ) : receipts.length === 0 ? (
        <EmptyState>
          <FileText />
          <h3>{content.emptyTitle}</h3>
          <p>{content.emptyDescription}</p>
          <AddButton onClick={() => navigate('/receipt-scanner')}>
            <Plus />
            {content.addNew}
          </AddButton>
        </EmptyState>
      ) : (
        <>
          <ReceiptsGrid>
            {receipts.map((receipt) => (
              <ReceiptCard
                key={receipt.id}
                receipt={receipt}
                onDelete={handleDelete}
              />
            ))}
          </ReceiptsGrid>

          {pagination.totalPages > 1 && (
            <Pagination>
              <PageButton
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
              >
                {content.previous}
              </PageButton>
              <PageInfo>
                {content.page} {pagination.page} {content.of} {pagination.totalPages}
              </PageInfo>
              <PageButton
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
              >
                {content.next}
              </PageButton>
            </Pagination>
          )}
        </>
      )}
    </PageContainer>
  );
};

export default ReceiptsPage;
