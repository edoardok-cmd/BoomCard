import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import { receiptsApiService } from '../services/receipts-api.service';
import { apiService } from '../services/api.service';
import { PartnerReceipt, ReceiptStatus } from '../types/receipt.types';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title as ChartTitle,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { ArrowLeft, Calendar, DollarSign, TrendingUp, PieChart as PieChartIcon, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns';
import { exportReceiptsToCSV } from '../utils/receiptExport';
// MEDIUM-2 fix (r2t): currency-aware formatter for displayed amounts
// (spec §7.3 / Clash 12.1 — BGN during transition, EUR after).
import { useCurrencyDisplay, formatWithCurrency } from '../utils/currencyDisplay';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  ChartTitle,
  Tooltip,
  Legend,
  Filler
);

const PageContainer = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;

  @media (max-width: 768px) {
    padding: 1rem;
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
`;

const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--color-border);
    transform: translateY(-2px);
  }
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const FilterBar = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  align-items: center;
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
`;

const Select = styled.select`
  padding: 0.625rem 1rem;
  border: 2px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--color-primary);
  }

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`;

const Input = styled.input`
  padding: 0.625rem 1rem;
  border: 2px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  background: var(--color-background);
  color: var(--color-text-primary);

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`;

const ExportButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  margin-left: auto;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 25px rgba(102, 126, 234, 0.3);
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
`;

const StatCard = styled.div`
  background: var(--color-card-background, var(--color-background));
  border-radius: 1rem;
  padding: 1.5rem;
  border: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const StatHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const StatLabel = styled.div`
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  font-weight: 500;
`;

const StatIcon = styled.div<{ $color: string }>`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => props.$color}20;
  color: ${props => props.$color};
`;

const StatValue = styled.div`
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
`;

const ChartsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
  gap: 2rem;
  margin-bottom: 2rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const ChartCard = styled.div`
  background: var(--color-card-background, var(--color-background));
  border-radius: 1rem;
  padding: 2rem;
  border: 1px solid var(--color-border);
`;

const ChartHeading = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 1.5rem 0;
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 3rem;
  font-size: 1.125rem;
  color: var(--color-text-secondary);
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem;
  color: var(--color-text-secondary);

  h3 {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
    color: var(--color-text-primary);
  }

  p {
    font-size: 1rem;
  }
`;

const PredictionCard = styled.div`
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 1rem;
  padding: 2rem;
  margin-bottom: 2rem;
`;

const PredictionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-top: 1.5rem;
`;

const PredictionItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const PredictionLabel = styled.div`
  font-size: 0.875rem;
  opacity: 0.9;
`;

const PredictionValue = styled.div`
  font-size: 1.75rem;
  font-weight: 700;
`;

/**
 * Server-side analytics shape returned by GET /receipts/v2/analytics
 * (receiptAnalyticsService.getAnalytics). Computed over ALL of the user's
 * receipts in the DB, so its totals are correct regardless of how many
 * receipts exist — unlike summing a list endpoint that the backend caps at
 * 100 rows per request. The route returns this object directly (no
 * { success, data } envelope). cashbackPercent and other internal fields are
 * intentionally absent (spec §11.3).
 */
interface ServerAnalytics {
  totalReceipts: number;
  approvedReceipts: number;
  rejectedReceipts: number;
  pendingReceipts: number;
  totalCashback: number;
  totalSpent: number;
  averageReceiptAmount: number;
  successRate: number;
  topMerchants?: Array<{ name: string; count: number; totalSpent: number }>;
}

/**
 * Walk every page of the user's receipts.
 *
 * HIGH fix: the backend clamps the receipts list `limit` to 100
 * (receipts.enhanced.routes.ts L192), so the previous single
 * getReceipts({ limit: 1000 }) call silently returned at most 100 rows and
 * every client-side aggregate (totals, monthly trends, merchant/status
 * breakdowns) was wrong for partners with >100 receipts. We page through the
 * full result set instead of assuming a large `limit` works. A hard page
 * ceiling guards against runaway loops.
 */
async function fetchAllReceipts(pageSize = 100, maxPages = 200): Promise<PartnerReceipt[]> {
  const all: PartnerReceipt[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const res = await receiptsApiService.getReceipts({ page, limit: pageSize });
    all.push(...res.data);
    totalPages = res.pagination?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages && page <= maxPages);

  return all;
}

// LOW-3: use PartnerReceipt (partner-safe type) instead of the admin-only Receipt type.
interface AnalyticsData {
  receipts: PartnerReceipt[];
  stats: {
    totalReceipts: number;
    totalAmount: number;
    totalCashback: number;
    averageAmount: number;
    successRate: number;
  };
  monthlyData: {
    labels: string[];
    receipts: number[];
    spending: number[];
    cashback: number[];
  };
  merchantData: {
    labels: string[];
    values: number[];
    amounts: number[];
  };
  statusData: {
    labels: string[];
    values: number[];
  };
  predictions: {
    nextMonthSpending: number;
    // LOW-2 fix (r2t): nextMonthCashback removed — field was hardcoded to 0
    // (spec §11.3 prohibits exposing cashback % to partners), never rendered
    // (JSX commented out), yet its dead translation keys and interface field
    // created confusion about spec intent. Removed entirely.
    averageGrowth: number;
  };
}

export const ReceiptAnalyticsPage: React.FC = () => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  // MEDIUM-2 fix (r2t): resolve active currency mode for displayed amounts
  const currencyMode = useCurrencyDisplay();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [dateRange, setDateRange] = useState('6months');
  const [merchantFilter, setMerchantFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  const content = {
    en: {
      title: 'Receipt Analytics',
      back: 'Back to Receipts',
      filters: {
        dateRange: 'Date Range',
        merchant: 'Merchant',
        status: 'Status',
        minAmount: 'Min Amount',
        maxAmount: 'Max Amount',
        all: 'All',
        last30days: 'Last 30 Days',
        last3months: 'Last 3 Months',
        last6months: 'Last 6 Months',
        lastyear: 'Last Year',
        alltime: 'All Time',
      },
      stats: {
        totalSpent: 'Total Spent',
        totalCashback: 'Total Cashback',
        avgReceipt: 'Avg Receipt',
        successRate: 'Success Rate',
      },
      charts: {
        spendingTrend: 'Spending Trend Over Time',
        receiptsTrend: 'Receipts Submitted Over Time',
        merchantBreakdown: 'Top Merchants by Receipts',
        categoryBreakdown: 'Receipts by Status',
        cashbackTrend: 'Cashback Earned Over Time',
      },
      predictions: {
        title: 'Predictive Analytics',
        nextMonthSpending: 'Predicted Next Month Spending',
        // LOW-2 fix (r2t): nextMonthCashback translation key removed — field
        // removed from AnalyticsData.predictions (spec §11.3 / Clash 10.6).
        avgGrowth: 'Average Monthly Growth',
      },
      export: 'Export to CSV',
      loading: 'Loading analytics...',
      noData: 'No receipts found',
      noDataDesc: 'Scan some receipts to see your analytics!',
    },
    bg: {
      title: 'Анализ на бележки',
      back: 'Обратно към бележките',
      filters: {
        dateRange: 'Период',
        merchant: 'Търговец',
        status: 'Статус',
        minAmount: 'Мин сума',
        maxAmount: 'Макс сума',
        all: 'Всички',
        last30days: 'Последните 30 дни',
        last3months: 'Последните 3 месеца',
        last6months: 'Последните 6 месеца',
        lastyear: 'Последната година',
        alltime: 'Цялото време',
      },
      stats: {
        totalSpent: 'Общо харчено',
        totalCashback: 'Общ кешбек',
        avgReceipt: 'Средна бележка',
        successRate: 'Процент успех',
      },
      charts: {
        spendingTrend: 'Тенденция на разходите във времето',
        receiptsTrend: 'Подадени бележки във времето',
        merchantBreakdown: 'Топ търговци по бележки',
        categoryBreakdown: 'Бележки по статус',
        cashbackTrend: 'Получен кешбек във времето',
      },
      predictions: {
        title: 'Прогнозна аналитика',
        nextMonthSpending: 'Прогнозни разходи за следващия месец',
        // LOW-2 fix (r2t): nextMonthCashback translation key removed
        avgGrowth: 'Среден месечен растеж',
      },
      export: 'Експорт в CSV',
      loading: 'Зареждане на анализ...',
      noData: 'Няма намерени бележки',
      noDataDesc: 'Сканирайте бележки, за да видите анализа!',
    },
  };

  const t = content[language];

  useEffect(() => {
    loadData();
  }, [dateRange, merchantFilter, statusFilter, minAmount, maxAmount]);

  const loadData = async () => {
    try {
      setLoading(true);

      // HIGH fix: source authoritative totals from the server-side analytics
      // endpoint (computed over ALL receipts) and page through the full receipt
      // list for per-receipt data (monthly trends, filters) instead of summing a
      // single list response the backend caps at 100 rows.
      // Both run in parallel. If server analytics is unavailable we still have
      // the fully-paginated receipt set to aggregate from.
      const [serverAnalyticsResult, allReceipts] = await Promise.all([
        apiService
          .get<ServerAnalytics>('/receipts/v2/analytics')
          .catch((err) => {
            console.error('Failed to load server analytics; falling back to client aggregation:', err);
            return null;
          }),
        fetchAllReceipts(),
      ]);

      // Whether the user has narrowed the data with any filter. When no filter
      // is active the authoritative server analytics totals are used for the
      // headline stat cards / status / merchant breakdowns; once a filter is
      // applied those server lifetime totals no longer match the visible subset,
      // so we fall back to aggregating the (now fully-paginated, uncapped) set.
      const filtersActive =
        dateRange !== 'alltime' ||
        merchantFilter !== 'all' ||
        statusFilter !== 'all' ||
        minAmount !== '' ||
        maxAmount !== '';

      // Apply filters
      let filteredReceipts = [...allReceipts];

      // Date filter
      const now = new Date();
      if (dateRange !== 'alltime') {
        const months = dateRange === 'last30days' ? 1 : dateRange === 'last3months' ? 3 : dateRange === 'last6months' ? 6 : 12;
        const cutoffDate = subMonths(now, months);
        filteredReceipts = filteredReceipts.filter(r => new Date(r.createdAt) >= cutoffDate);
      }

      // Merchant filter
      if (merchantFilter !== 'all') {
        filteredReceipts = filteredReceipts.filter(r => r.merchantName === merchantFilter);
      }

      // Status filter
      if (statusFilter !== 'all') {
        filteredReceipts = filteredReceipts.filter(r => r.status === statusFilter);
      }

      // Amount filters
      // LOW-2 fix (review r2t): guard against NaN — parseFloat returns NaN for
      // non-numeric input and `number >= NaN` is always false, silently dropping
      // every receipt. Only apply the filter when the parsed value is a valid number.
      if (minAmount) {
        const min = parseFloat(minAmount);
        if (!isNaN(min)) {
          filteredReceipts = filteredReceipts.filter(r => (r.totalAmount || 0) >= min);
        }
      }
      if (maxAmount) {
        const max = parseFloat(maxAmount);
        if (!isNaN(max)) {
          filteredReceipts = filteredReceipts.filter(r => (r.totalAmount || 0) <= max);
        }
      }

      // Calculate stats
      // MEDIUM fix: the backend ReceiptStatus enum has no CASHBACK_APPLIED / VALIDATED
      // states for granted cashback — an APPROVED receipt is the one whose cashback has
      // been calculated and credited (receipts.routes.ts review/validate flow). Filtering
      // on the non-existent statuses produced a constant 0 cashback and 0% success rate.
      const clientTotalAmount = filteredReceipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
      const clientTotalCashback = filteredReceipts
        .filter(r => r.status === ReceiptStatus.APPROVED)
        .reduce((sum, r) => sum + (r.cashbackAmount || 0), 0);
      const clientApprovedCount = filteredReceipts.filter(
        r => r.status === ReceiptStatus.APPROVED
      ).length;

      // HIGH fix: when no filter narrows the view, use the server-side
      // aggregates (correct over the full dataset). Otherwise aggregate the
      // fully-paginated filtered subset. Both are now cap-free.
      const useServer = !filtersActive && serverAnalyticsResult !== null;
      const totalAmount = useServer ? serverAnalyticsResult!.totalSpent : clientTotalAmount;
      const totalCashback = useServer ? serverAnalyticsResult!.totalCashback : clientTotalCashback;
      const totalReceiptsCount = useServer ? serverAnalyticsResult!.totalReceipts : filteredReceipts.length;
      const averageAmount = useServer
        ? serverAnalyticsResult!.averageReceiptAmount
        : (filteredReceipts.length > 0 ? clientTotalAmount / filteredReceipts.length : 0);
      const successRate = useServer
        ? serverAnalyticsResult!.successRate
        : (filteredReceipts.length > 0 ? (clientApprovedCount / filteredReceipts.length) * 100 : 0);

      // Generate monthly data
      const monthsToShow = 6;
      const months = eachMonthOfInterval({
        start: subMonths(startOfMonth(now), monthsToShow - 1),
        end: endOfMonth(now),
      });

      const monthlyData = {
        labels: months.map(m => format(m, 'MMM yyyy')),
        receipts: months.map(month => {
          return filteredReceipts.filter(r => {
            const receiptDate = new Date(r.createdAt);
            return (
              receiptDate >= startOfMonth(month) &&
              receiptDate <= endOfMonth(month)
            );
          }).length;
        }),
        spending: months.map(month => {
          return filteredReceipts
            .filter(r => {
              const receiptDate = new Date(r.createdAt);
              return (
                receiptDate >= startOfMonth(month) &&
                receiptDate <= endOfMonth(month)
              );
            })
            .reduce((sum, r) => sum + (r.totalAmount || 0), 0);
        }),
        cashback: months.map(month => {
          return filteredReceipts
            .filter(r => {
              const receiptDate = new Date(r.createdAt);
              return (
                receiptDate >= startOfMonth(month) &&
                receiptDate <= endOfMonth(month) &&
                r.status === ReceiptStatus.APPROVED
              );
            })
            .reduce((sum, r) => sum + (r.cashbackAmount || 0), 0);
        }),
      };

      // Merchant breakdown
      const merchantMap = new Map<string, { count: number; amount: number }>();
      filteredReceipts.forEach(r => {
        if (r.merchantName) {
          const existing = merchantMap.get(r.merchantName) || { count: 0, amount: 0 };
          merchantMap.set(r.merchantName, {
            count: existing.count + 1,
            amount: existing.amount + (r.totalAmount || 0),
          });
        }
      });

      const clientTopMerchants = Array.from(merchantMap.entries())
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // HIGH fix: prefer the server's top-merchant aggregate when unfiltered —
      // it is computed over all receipts, not just the first capped page.
      const topMerchants =
        useServer && serverAnalyticsResult!.topMerchants?.length
          ? serverAnalyticsResult!.topMerchants.map(m => ({
              name: m.name,
              count: m.count,
              amount: m.totalSpent,
            }))
          : clientTopMerchants;

      const merchantData = {
        labels: topMerchants.map(m => m.name),
        values: topMerchants.map(m => m.count),
        amounts: topMerchants.map(m => m.amount),
      };

      // Status breakdown
      // HIGH fix: when unfiltered, build the breakdown from the server's
      // status counters (full dataset) rather than tallying a capped page.
      let statusData: { labels: string[]; values: number[] };
      if (useServer) {
        const serverStatusEntries: Array<[string, number]> = [
          [ReceiptStatus.APPROVED, serverAnalyticsResult!.approvedReceipts],
          [ReceiptStatus.REJECTED, serverAnalyticsResult!.rejectedReceipts],
          [ReceiptStatus.PENDING, serverAnalyticsResult!.pendingReceipts],
        ].filter(([, count]) => (count as number) > 0) as Array<[string, number]>;
        statusData = {
          labels: serverStatusEntries.map(([label]) => label),
          values: serverStatusEntries.map(([, count]) => count),
        };
      } else {
        const statusMap = new Map<string, number>();
        filteredReceipts.forEach(r => {
          statusMap.set(r.status, (statusMap.get(r.status) || 0) + 1);
        });
        statusData = {
          labels: Array.from(statusMap.keys()),
          values: Array.from(statusMap.values()),
        };
      }

      // Predictions (simple linear regression on last 3 months)
      const last3MonthsSpending = monthlyData.spending.slice(-3);
      const avgSpending = last3MonthsSpending.reduce((a, b) => a + b, 0) / 3;
      const trend = last3MonthsSpending[2] - last3MonthsSpending[0];
      const nextMonthSpending = avgSpending + trend;
      // LOW-2 fix (r2t) / spec §11.3 Clash 10.6: nextMonthCashback removed entirely
      // (was hardcoded to 0 and never rendered — dead field).
      const averageGrowth = trend / avgSpending * 100;

      setData({
        receipts: filteredReceipts,
        stats: {
          totalReceipts: totalReceiptsCount,
          totalAmount,
          totalCashback,
          averageAmount,
          successRate,
        },
        monthlyData,
        merchantData,
        statusData,
        predictions: {
          nextMonthSpending: Math.max(0, nextMonthSpending),
          averageGrowth,
        },
      });
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (data?.receipts) {
      // LOW-1 fix (review r2t): exportReceiptsToCSV already accepts PartnerReceipt[]
      // (receiptExport.ts:489). The previous `as any` cast and its comment were
      // factually wrong and disabled TypeScript checking at this call site.
      exportReceiptsToCSV(data.receipts, 'receipt-analytics.csv');
    }
  };

  // Get unique merchants for filter
  const uniqueMerchants = Array.from(new Set(data?.receipts.map(r => r.merchantName).filter(Boolean) || []));

  if (loading) {
    return (
      <PageContainer>
        <LoadingSpinner>{t.loading}</LoadingSpinner>
      </PageContainer>
    );
  }

  if (!data || data.receipts.length === 0) {
    return (
      <PageContainer>
        <Header>
          <BackButton onClick={() => navigate('/receipts')}>
            <ArrowLeft size={20} />
            {t.back}
          </BackButton>
        </Header>
        <EmptyState>
          <h3>{t.noData}</h3>
          <p>{t.noDataDesc}</p>
        </EmptyState>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Header>
        <BackButton onClick={() => navigate('/receipts')}>
          <ArrowLeft size={20} />
          {t.back}
        </BackButton>
        <Title>{t.title}</Title>
        <ExportButton onClick={handleExportCSV}>
          <Download size={20} />
          {t.export}
        </ExportButton>
      </Header>

      <FilterBar>
        <FilterGroup>
          <Label>{t.filters.dateRange}</Label>
          <Select value={dateRange} onChange={e => setDateRange(e.target.value)}>
            <option value="last30days">{t.filters.last30days}</option>
            <option value="last3months">{t.filters.last3months}</option>
            <option value="last6months">{t.filters.last6months}</option>
            <option value="lastyear">{t.filters.lastyear}</option>
            <option value="alltime">{t.filters.alltime}</option>
          </Select>
        </FilterGroup>

        <FilterGroup>
          <Label>{t.filters.merchant}</Label>
          <Select value={merchantFilter} onChange={e => setMerchantFilter(e.target.value)}>
            <option value="all">{t.filters.all}</option>
            {uniqueMerchants.map(merchant => (
              <option key={merchant} value={merchant}>{merchant}</option>
            ))}
          </Select>
        </FilterGroup>

        <FilterGroup>
          <Label>{t.filters.status}</Label>
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            {/* MEDIUM fix: offer only statuses the backend enum actually emits.
                VALIDATED / CASHBACK_APPLIED are not produced by the receipt
                pipeline, so those options matched nothing. APPROVED is the
                granted-cashback terminal state. */}
            <option value="all">{t.filters.all}</option>
            <option value={ReceiptStatus.PENDING}>Pending</option>
            <option value={ReceiptStatus.PROCESSING}>Processing</option>
            <option value={ReceiptStatus.APPROVED}>Approved</option>
            <option value={ReceiptStatus.REJECTED}>Rejected</option>
            <option value={ReceiptStatus.MANUAL_REVIEW}>Manual Review</option>
            <option value={ReceiptStatus.EXPIRED}>Expired</option>
          </Select>
        </FilterGroup>

        <FilterGroup>
          <Label>{t.filters.minAmount}</Label>
          <Input
            type="number"
            placeholder="0"
            value={minAmount}
            onChange={e => setMinAmount(e.target.value)}
          />
        </FilterGroup>

        <FilterGroup>
          <Label>{t.filters.maxAmount}</Label>
          <Input
            type="number"
            placeholder="999"
            value={maxAmount}
            onChange={e => setMaxAmount(e.target.value)}
          />
        </FilterGroup>
      </FilterBar>

      <StatsGrid>
        <StatCard>
          <StatHeader>
            <StatLabel>{t.stats.totalSpent}</StatLabel>
            <StatIcon $color="#667eea">
              <DollarSign size={20} />
            </StatIcon>
          </StatHeader>
          <StatValue>{formatWithCurrency(data.stats.totalAmount, currencyMode)}</StatValue>
        </StatCard>

        <StatCard>
          <StatHeader>
            <StatLabel>{t.stats.totalCashback}</StatLabel>
            <StatIcon $color="#10b981">
              <TrendingUp size={20} />
            </StatIcon>
          </StatHeader>
          <StatValue>{formatWithCurrency(data.stats.totalCashback, currencyMode)}</StatValue>
        </StatCard>

        <StatCard>
          <StatHeader>
            <StatLabel>{t.stats.avgReceipt}</StatLabel>
            <StatIcon $color="#f59e0b">
              <PieChartIcon size={20} />
            </StatIcon>
          </StatHeader>
          <StatValue>{formatWithCurrency(data.stats.averageAmount, currencyMode)}</StatValue>
        </StatCard>

        <StatCard>
          <StatHeader>
            <StatLabel>{t.stats.successRate}</StatLabel>
            <StatIcon $color="#8b5cf6">
              <Calendar size={20} />
            </StatIcon>
          </StatHeader>
          <StatValue>{data.stats.successRate.toFixed(1)}%</StatValue>
        </StatCard>
      </StatsGrid>

      <PredictionCard>
        <ChartHeading style={{ color: 'white' }}>{t.predictions.title}</ChartHeading>
        <PredictionGrid>
          <PredictionItem>
            <PredictionLabel>{t.predictions.nextMonthSpending}</PredictionLabel>
            <PredictionValue>{formatWithCurrency(data.predictions.nextMonthSpending, currencyMode)}</PredictionValue>
          </PredictionItem>
          {/* nextMonthCashback prediction removed — spec §11.3 prohibits exposing cashback % to partners */}
          <PredictionItem>
            <PredictionLabel>{t.predictions.avgGrowth}</PredictionLabel>
            <PredictionValue>
              {data.predictions.averageGrowth > 0 ? '+' : ''}
              {data.predictions.averageGrowth.toFixed(1)}%
            </PredictionValue>
          </PredictionItem>
        </PredictionGrid>
      </PredictionCard>

      <ChartsGrid>
        <ChartCard>
          <ChartHeading>{t.charts.spendingTrend}</ChartHeading>
          <Line
            data={{
              labels: data.monthlyData.labels,
              datasets: [
                {
                  label: t.stats.totalSpent,
                  data: data.monthlyData.spending,
                  borderColor: '#667eea',
                  backgroundColor: 'rgba(102, 126, 234, 0.1)',
                  fill: true,
                  tension: 0.4,
                },
              ],
            }}
            options={{
              responsive: true,
              plugins: {
                legend: {
                  display: false,
                },
              },
              scales: {
                y: {
                  beginAtZero: true,
                },
              },
            }}
          />
        </ChartCard>

        <ChartCard>
          <ChartHeading>{t.charts.receiptsTrend}</ChartHeading>
          <Bar
            data={{
              labels: data.monthlyData.labels,
              datasets: [
                {
                  label: 'Receipts',
                  data: data.monthlyData.receipts,
                  backgroundColor: '#10b981',
                },
              ],
            }}
            options={{
              responsive: true,
              plugins: {
                legend: {
                  display: false,
                },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: {
                    stepSize: 1,
                  },
                },
              },
            }}
          />
        </ChartCard>

        <ChartCard>
          <ChartHeading>{t.charts.merchantBreakdown}</ChartHeading>
          <Bar
            data={{
              labels: data.merchantData.labels,
              datasets: [
                {
                  label: 'Receipts',
                  data: data.merchantData.values,
                  backgroundColor: [
                    '#667eea',
                    '#764ba2',
                    '#f093fb',
                    '#4facfe',
                    '#00f2fe',
                    '#43e97b',
                    '#38f9d7',
                    '#fa709a',
                    '#fee140',
                    '#30cfd0',
                  ],
                },
              ],
            }}
            options={{
              responsive: true,
              indexAxis: 'y',
              plugins: {
                legend: {
                  display: false,
                },
              },
              scales: {
                x: {
                  beginAtZero: true,
                },
              },
            }}
          />
        </ChartCard>

        <ChartCard>
          <ChartHeading>{t.charts.categoryBreakdown}</ChartHeading>
          <Doughnut
            data={{
              labels: data.statusData.labels,
              datasets: [
                {
                  data: data.statusData.values,
                  backgroundColor: [
                    '#10b981',
                    '#f59e0b',
                    '#ef4444',
                    '#8b5cf6',
                  ],
                },
              ],
            }}
            options={{
              responsive: true,
              plugins: {
                legend: {
                  position: 'bottom',
                },
              },
            }}
          />
        </ChartCard>

        <ChartCard>
          <ChartHeading>{t.charts.cashbackTrend}</ChartHeading>
          <Line
            data={{
              labels: data.monthlyData.labels,
              datasets: [
                {
                  label: t.stats.totalCashback,
                  data: data.monthlyData.cashback,
                  borderColor: '#10b981',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  fill: true,
                  tension: 0.4,
                },
              ],
            }}
            options={{
              responsive: true,
              plugins: {
                legend: {
                  display: false,
                },
              },
              scales: {
                y: {
                  beginAtZero: true,
                },
              },
            }}
          />
        </ChartCard>
      </ChartsGrid>
    </PageContainer>
  );
};

export default ReceiptAnalyticsPage;
