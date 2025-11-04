import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import { receiptsApiService } from '../services/receipts-api.service';
import { Receipt, ReceiptStatus } from '../types/receipt.types';
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
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';
import { ArrowLeft, Calendar, DollarSign, TrendingUp, PieChart as PieChartIcon, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval, parseISO } from 'date-fns';
import { exportReceiptsToCSV } from '../utils/receiptExport';

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

const StatChange = styled.div<{ $positive: boolean }>`
  font-size: 0.875rem;
  color: ${props => props.$positive ? '#10b981' : '#ef4444'};
  font-weight: 600;
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

interface AnalyticsData {
  receipts: Receipt[];
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
    nextMonthCashback: number;
    averageGrowth: number;
  };
}

export const ReceiptAnalyticsPage: React.FC = () => {
  const { language } = useLanguage();
  const navigate = useNavigate();
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
        nextMonthCashback: 'Predicted Next Month Cashback',
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
        nextMonthCashback: 'Прогнозен кешбек за следващия месец',
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

      // Fetch receipts
      const receiptsResponse = await receiptsApiService.getReceipts({ limit: 1000 });
      const allReceipts = receiptsResponse.data;

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
      if (minAmount) {
        filteredReceipts = filteredReceipts.filter(r => (r.totalAmount || 0) >= parseFloat(minAmount));
      }
      if (maxAmount) {
        filteredReceipts = filteredReceipts.filter(r => (r.totalAmount || 0) <= parseFloat(maxAmount));
      }

      // Calculate stats
      const totalAmount = filteredReceipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
      const totalCashback = filteredReceipts
        .filter(r => r.status === ReceiptStatus.CASHBACK_APPLIED)
        .reduce((sum, r) => sum + (r.cashbackAmount || 0), 0);
      const averageAmount = filteredReceipts.length > 0 ? totalAmount / filteredReceipts.length : 0;
      const validatedCount = filteredReceipts.filter(
        r => r.status === ReceiptStatus.VALIDATED || r.status === ReceiptStatus.CASHBACK_APPLIED
      ).length;
      const successRate = filteredReceipts.length > 0 ? (validatedCount / filteredReceipts.length) * 100 : 0;

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
                r.status === ReceiptStatus.CASHBACK_APPLIED
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

      const topMerchants = Array.from(merchantMap.entries())
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const merchantData = {
        labels: topMerchants.map(m => m.name),
        values: topMerchants.map(m => m.count),
        amounts: topMerchants.map(m => m.amount),
      };

      // Status breakdown
      const statusMap = new Map<string, number>();
      filteredReceipts.forEach(r => {
        statusMap.set(r.status, (statusMap.get(r.status) || 0) + 1);
      });

      const statusData = {
        labels: Array.from(statusMap.keys()),
        values: Array.from(statusMap.values()),
      };

      // Predictions (simple linear regression on last 3 months)
      const last3MonthsSpending = monthlyData.spending.slice(-3);
      const avgSpending = last3MonthsSpending.reduce((a, b) => a + b, 0) / 3;
      const trend = last3MonthsSpending[2] - last3MonthsSpending[0];
      const nextMonthSpending = avgSpending + trend;
      const nextMonthCashback = nextMonthSpending * 0.05; // Assume 5% cashback
      const averageGrowth = trend / avgSpending * 100;

      setData({
        receipts: filteredReceipts,
        stats: {
          totalReceipts: filteredReceipts.length,
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
          nextMonthCashback: Math.max(0, nextMonthCashback),
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
            <option value="all">{t.filters.all}</option>
            <option value={ReceiptStatus.PENDING}>Pending</option>
            <option value={ReceiptStatus.VALIDATED}>Validated</option>
            <option value={ReceiptStatus.REJECTED}>Rejected</option>
            <option value={ReceiptStatus.CASHBACK_APPLIED}>Cashback Applied</option>
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
          <StatValue>{data.stats.totalAmount.toFixed(2)} лв</StatValue>
        </StatCard>

        <StatCard>
          <StatHeader>
            <StatLabel>{t.stats.totalCashback}</StatLabel>
            <StatIcon $color="#10b981">
              <TrendingUp size={20} />
            </StatIcon>
          </StatHeader>
          <StatValue>{data.stats.totalCashback.toFixed(2)} лв</StatValue>
        </StatCard>

        <StatCard>
          <StatHeader>
            <StatLabel>{t.stats.avgReceipt}</StatLabel>
            <StatIcon $color="#f59e0b">
              <PieChartIcon size={20} />
            </StatIcon>
          </StatHeader>
          <StatValue>{data.stats.averageAmount.toFixed(2)} лв</StatValue>
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
            <PredictionValue>{data.predictions.nextMonthSpending.toFixed(2)} лв</PredictionValue>
          </PredictionItem>
          <PredictionItem>
            <PredictionLabel>{t.predictions.nextMonthCashback}</PredictionLabel>
            <PredictionValue>{data.predictions.nextMonthCashback.toFixed(2)} лв</PredictionValue>
          </PredictionItem>
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
