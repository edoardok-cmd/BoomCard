import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { receiptsApiService } from '../services/receipts-api.service';
import { apiService } from '../services/api.service';
import { PartnerReceipt, ReceiptStatus, ReceiptFilters } from '../types/receipt.types';
import { ReceiptCard } from '../components/feature/ReceiptCard';
import { FileText, Filter, Smartphone, X } from 'lucide-react';

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
  color: var(--color-text-primary);
  margin: 0 0 0.5rem 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;

  svg {
    color: var(--color-text-secondary);
  }
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: var(--color-text-secondary);
  margin: 0;
`;

// §5.2 cashback summary
const CashbackSummary = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 2rem;

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const CashbackCard = styled.div<{ $type: 'available' | 'pending' }>`
  background: ${({ $type }) => ($type === 'available' ? '#000000' : 'var(--color-background-secondary)')};
  color: ${({ $type }) => ($type === 'available' ? 'white' : 'var(--color-text-primary)')};
  border: 2px solid ${({ $type }) => ($type === 'available' ? '#000000' : 'var(--color-border)')};
  border-radius: 1rem;
  padding: 1.5rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const CashbackLabel = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  opacity: 0.7;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const CashbackAmount = styled.div`
  font-size: 2rem;
  font-weight: 800;
`;

// §5.2 period chips
const PeriodChips = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
`;

const PeriodChip = styled.button<{ $active: boolean }>`
  padding: 0.5rem 1.25rem;
  border-radius: 9999px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  border: 2px solid ${({ $active }) => ($active ? '#000000' : 'var(--color-border)')};
  background: ${({ $active }) => ($active ? '#000000' : 'var(--color-background)')};
  color: ${({ $active }) => ($active ? 'white' : 'var(--color-text-primary)')};
  transition: all 0.15s;

  &:hover {
    border-color: var(--color-text-primary);
  }
`;

const ActionsBar = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
`;

const FilterButton = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: ${props => props.$active ? '#000000' : 'var(--color-background)'};
  color: ${props => props.$active ? 'white' : 'var(--color-text-primary)'};
  border: 2px solid ${props => props.$active ? '#000000' : 'var(--color-border)'};
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-hover);
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
  background: var(--color-background-secondary);
  border: 2px solid var(--color-border);
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
  color: var(--color-text-secondary);
`;

const FilterSelect = styled.select`
  padding: 0.75rem;
  border: 2px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: var(--color-text-primary);
  background: var(--color-background);
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: var(--color-text-primary);
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
  background: var(--color-background-tertiary);
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);

  button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    color: var(--color-text-secondary);

    &:hover {
      color: var(--color-text-primary);
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
  background: var(--color-background-secondary);
  border: 2px dashed var(--color-border);
  border-radius: 1rem;

  svg {
    width: 64px;
    height: 64px;
    color: var(--color-text-tertiary);
    margin: 0 auto 1rem;
  }

  h3 {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0 0 0.5rem 0;
  }

  p {
    font-size: 0.9375rem;
    color: var(--color-text-secondary);
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
  background: ${props => props.$active ? '#000000' : 'var(--color-background)'};
  color: ${props => props.$active ? 'white' : 'var(--color-text-primary)'};
  border: 2px solid ${props => props.$active ? '#000000' : 'var(--color-border)'};
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: var(--shadow-hover);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const PageInfo = styled.div`
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
`;

const LoadingSpinner = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  font-size: 1.125rem;
  color: var(--color-text-secondary);
`;

type Period = '7' | '30' | 'all';

// The backend /wallet/statistics endpoint returns availableBalance/pendingBalance
// as plain EUR numbers — the dual-currency (BGN/EUR) display feature was fully
// retired (BC-QA-031), so these are no longer {bgn, eur, windowOpen} objects.
interface CashbackSummaryData {
  availableBalance: number;
  pendingBalance: number;
}

export const ReceiptsPage: React.FC = () => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState<PartnerReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [period, setPeriod] = useState<Period>('all');
  const [cashback, setCashback] = useState<CashbackSummaryData | null>(null);
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
      title: 'Cashback & Transactions',
      subtitle: 'View your cashback balance and transaction history',
      filters: 'Filters',
      addNew: 'Upload via mobile app',
      addNewHint: 'Receipt uploads are available only through the BOOM mobile app',
      status: 'Status',
      allStatuses: 'All',
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
      emptyTitle: 'No Transactions Yet',
      emptyDescription: 'Upload a receipt via the mobile app to earn cashback!',
      loading: 'Loading...',
      page: 'Page',
      of: 'of',
      previous: 'Previous',
      next: 'Next',
      activeFilters: 'Active Filters:',
      availableCashback: 'Available Cashback',
      pendingCashback: 'Pending Cashback',
      period7: 'Last 7 days',
      period30: 'Last 30 days',
      periodAll: 'All',
    },
    bg: {
      title: 'Кешбек и транзакции',
      subtitle: 'Преглед на наличен кешбек и история на транзакциите',
      filters: 'Филтри',
      addNew: 'Качване през мобилното приложение',
      addNewHint: 'Качването на бележки е достъпно само през мобилното приложение BOOM',
      status: 'Статус',
      allStatuses: 'Всички',
      pending: 'Чакащи',
      approved: 'Одобрени',
      rejected: 'Отхвърлени',
      emptyTitle: 'Все още няма транзакции',
      emptyDescription: 'Качете бележка от мобилното приложение, за да спечелите кешбек!',
      loading: 'Зареждане...',
      page: 'Страница',
      of: 'от',
      previous: 'Предишна',
      next: 'Следваща',
      activeFilters: 'Активни филтри:',
      availableCashback: 'Наличен кешбек',
      pendingCashback: 'Чакащ кешбек',
      period7: 'Последни 7 дни',
      period30: 'Последни 30 дни',
      periodAll: 'Всички',
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  useEffect(() => {
    fetchCashbackSummary();
  }, []);

  useEffect(() => {
    fetchReceipts();
  }, [filters]);

  const fetchCashbackSummary = async () => {
    try {
      const data = await apiService.get<CashbackSummaryData>('/wallet/statistics');
      setCashback(data);
    } catch {
      setCashback({ availableBalance: 0, pendingBalance: 0 });
    }
  };

  const fetchReceipts = async () => {
    setLoading(true);
    try {
      const response = await receiptsApiService.getReceipts(filters);
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

  const getPeriodDates = (p: Period): { startDate?: string; endDate?: string } => {
    if (p === 'all') return { startDate: undefined, endDate: undefined };
    const days = p === '7' ? 7 : 30;
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { startDate: start.toISOString(), endDate: new Date().toISOString() };
  };

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    setFilters(prev => ({ ...prev, ...getPeriodDates(p), page: 1 }));
  };

  const handleStatusFilter = (status?: ReceiptStatus) => {
    setFilters(prev => ({ ...prev, status, page: 1 }));
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
    setFilters(prev => ({ ...prev, page: newPage }));
  };

  const getActiveFilters = () => {
    const active: Array<{ key: string; label: string }> = [];
    if (filters.status) {
      const label =
        filters.status === ReceiptStatus.PENDING
          ? content.pending
          : filters.status === ReceiptStatus.APPROVED
          ? content.approved
          : content.rejected;
      active.push({ key: 'status', label: `${content.status}: ${label}` });
    }
    return active;
  };

  const clearFilter = (key: string) => {
    if (key === 'status') {
      setFilters(prev => ({ ...prev, status: undefined, page: 1 }));
    }
  };

  const formatCashback = (amount: number): string => {
    return `€${amount.toFixed(2)}`;
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

      {/* §5.2 — наличен + чакащ кешбек */}
      {cashback !== null && (
        <CashbackSummary>
          <CashbackCard $type="available">
            <CashbackLabel>{content.availableCashback}</CashbackLabel>
            <CashbackAmount>{formatCashback(cashback.availableBalance)}</CashbackAmount>
          </CashbackCard>
          <CashbackCard $type="pending">
            <CashbackLabel>{content.pendingCashback}</CashbackLabel>
            <CashbackAmount>{formatCashback(cashback.pendingBalance)}</CashbackAmount>
          </CashbackCard>
        </CashbackSummary>
      )}

      {/* §5.2 — period filters: last 7 days / last 30 days / all */}
      <PeriodChips>
        {(['7', '30', 'all'] as Period[]).map((p) => (
          <PeriodChip key={p} $active={period === p} onClick={() => handlePeriodChange(p)}>
            {p === '7' ? content.period7 : p === '30' ? content.period30 : content.periodAll}
          </PeriodChip>
        ))}
      </PeriodChips>

      <ActionsBar>
        <FilterButton $active={showFilters} onClick={() => setShowFilters(!showFilters)}>
          <Filter />
          {content.filters}
        </FilterButton>
        {/* §5.3 — web upload is disabled (POST /v2/upload → 403 WEB_UPLOAD_DISABLED).
            Button routes to the informational mobile-app page, never the live upload. */}
        <AddButton onClick={() => navigate('/upload-receipt')} title={content.addNewHint}>
          <Smartphone />
          {content.addNew}
        </AddButton>
      </ActionsBar>

      {getActiveFilters().length > 0 && (
        <ActiveFilters>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginRight: '0.5rem' }}>
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

      {/* §5.2 — status filter: Всички / Чакащи / Одобрени / Отхвърлени */}
      <FiltersPanel $isOpen={showFilters}>
        <FilterGroup>
          <FilterLabel>{content.status}</FilterLabel>
          <FilterSelect
            value={filters.status || ''}
            onChange={(e) =>
              handleStatusFilter((e.target.value as ReceiptStatus) || undefined)
            }
          >
            <option value="">{content.allStatuses}</option>
            <option value={ReceiptStatus.PENDING}>{content.pending}</option>
            <option value={ReceiptStatus.APPROVED}>{content.approved}</option>
            <option value={ReceiptStatus.REJECTED}>{content.rejected}</option>
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
          <AddButton onClick={() => navigate('/upload-receipt')} title={content.addNewHint}>
            <Smartphone />
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
