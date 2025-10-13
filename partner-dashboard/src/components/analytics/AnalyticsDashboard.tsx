import React, { useState, useMemo } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePartnerAnalytics } from '../../hooks/useAnalytics';
import { useOffers } from '../../hooks/useOffers';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  ShoppingCart,
  Percent,
  Calendar,
  Download,
  Filter,
} from 'lucide-react';
import Button from '../common/Button/Button';

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
`;

const Header = styled.div`
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: #6b7280;
`;

const Controls = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
`;

const TimeRangeSelector = styled.div`
  display: flex;
  gap: 0.5rem;
  background: white;
  padding: 0.25rem;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
`;

const TimeButton = styled.button<{ $active: boolean }>`
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s;
  background: ${props => props.$active ? '#000000' : 'transparent'};
  color: ${props => props.$active ? 'white' : '#6b7280'};

  &:hover {
    background: ${props => props.$active ? '#000000' : '#f3f4f6'};
    color: ${props => props.$active ? 'white' : '#111827'};
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 0.75rem;
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
`;

const MetricCard = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
`;

const MetricHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
`;

const MetricLabel = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const MetricIcon = styled.div<{ $color: string }>`
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => props.$color}20;
  border-radius: 0.5rem;

  svg {
    width: 1.25rem;
    height: 1.25rem;
    color: ${props => props.$color};
  }
`;

const MetricValue = styled.div`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
`;

const MetricChange = styled.div<{ $positive: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => props.$positive ? '#10b981' : '#ef4444'};

  svg {
    width: 1rem;
    height: 1rem;
  }
`;

const ChartsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const ChartCard = styled.div`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
`;

const ChartHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
`;

const ChartTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 700;
  color: #111827;
`;

const ChartContent = styled.div`
  height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
  border-radius: 0.5rem;
  color: #9ca3af;
  font-size: 0.875rem;
`;

const TableCard = styled.div`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHeader = styled.th`
  padding: 0.75rem 1rem;
  text-align: left;
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b7280;
  border-bottom: 2px solid #e5e7eb;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const TableRow = styled.tr`
  &:hover {
    background: #f9fafb;
  }
`;

const TableCell = styled.td`
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.9375rem;
  color: #374151;
`;

const RankBadge = styled.div`
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  border-radius: 0.5rem;
  font-weight: 700;
  color: #6b7280;
  font-size: 0.875rem;
`;

interface AnalyticsDashboardProps {
  language?: 'en' | 'bg';
}

type TimeRange = 'today' | 'week' | 'month' | 'year';

interface MetricData {
  value: string;
  change: number;
  isPositive: boolean;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  language = 'en',
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState<TimeRange>('month');

  // Calculate date range based on timeRange
  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = new Date();

    switch (timeRange) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        break;
      case 'week':
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setMonth(start.getMonth() - 1);
        break;
      case 'year':
        start.setFullYear(start.getFullYear() - 1);
        break;
    }

    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  }, [timeRange]);

  // Fetch real analytics data
  const { data: analyticsData, isLoading: isLoadingAnalytics } = usePartnerAnalytics(
    user?.id,
    startDate,
    endDate
  );

  // Fetch top offers for the partner
  const { data: offersData, isLoading: isLoadingOffers } = useOffers({
    partnerId: user?.id,
    sortBy: 'redemptions',
    sortOrder: 'desc',
    limit: 5,
  });

  // Prepare metrics from real data or show defaults
  const metrics: Record<string, MetricData> = useMemo(() => {
    if (!analyticsData) {
      return {
        revenue: { value: '...', change: 0, isPositive: true },
        transactions: { value: '...', change: 0, isPositive: true },
        customers: { value: '...', change: 0, isPositive: true },
        avgOrderValue: { value: '...', change: 0, isPositive: true },
      };
    }

    return {
      revenue: {
        value: `${(analyticsData.totalRevenue || 0).toLocaleString()} лв`,
        change: analyticsData.revenueGrowth || 0,
        isPositive: (analyticsData.revenueGrowth || 0) >= 0,
      },
      transactions: {
        value: (analyticsData.totalRedemptions || 0).toLocaleString(),
        change: analyticsData.redemptionsGrowth || 0,
        isPositive: (analyticsData.redemptionsGrowth || 0) >= 0,
      },
      customers: {
        value: (analyticsData.uniqueCustomers || 0).toLocaleString(),
        change: analyticsData.customersGrowth || 0,
        isPositive: (analyticsData.customersGrowth || 0) >= 0,
      },
      avgOrderValue: {
        value: `${(analyticsData.avgOrderValue || 0).toFixed(2)} лв`,
        change: analyticsData.avgOrderValueGrowth || 0,
        isPositive: (analyticsData.avgOrderValueGrowth || 0) >= 0,
      },
    };
  }, [analyticsData]);

  // Prepare top offers from real data
  const topOffers = useMemo(() => {
    if (!offersData?.data) {
      return [];
    }

    return offersData.data.slice(0, 5).map((offer, index) => ({
      rank: index + 1,
      name: offer.title || offer.titleBg || 'Untitled Offer',
      venue: offer.partnerName || 'Unknown Venue',
      redemptions: offer.redemptionCount || 0,
      revenue: `${((offer.redemptionCount || 0) * (offer.discountedPrice || 0)).toLocaleString()} лв`,
    }));
  }, [offersData]);

  const handleExport = () => {
    console.log('Export analytics report');
  };

  const handleFilter = () => {
    console.log('Open filter modal');
  };

  return (
    <Container>
      <Header>
        <Title>{t('analytics.title')}</Title>
        <Subtitle>
          {t('analytics.subtitle')}
        </Subtitle>
      </Header>

      <Controls>
        <TimeRangeSelector>
          <TimeButton
            $active={timeRange === 'today'}
            onClick={() => setTimeRange('today')}
          >
            {t('analytics.today')}
          </TimeButton>
          <TimeButton
            $active={timeRange === 'week'}
            onClick={() => setTimeRange('week')}
          >
            {t('analytics.week')}
          </TimeButton>
          <TimeButton
            $active={timeRange === 'month'}
            onClick={() => setTimeRange('month')}
          >
            {t('analytics.month')}
          </TimeButton>
          <TimeButton
            $active={timeRange === 'year'}
            onClick={() => setTimeRange('year')}
          >
            {t('analytics.year')}
          </TimeButton>
        </TimeRangeSelector>

        <Actions>
          <Button variant="outline" size="medium" onClick={handleFilter}>
            <Filter style={{ width: '1rem', height: '1rem' }} />
            {t('analytics.filter')}
          </Button>
          <Button variant="outline" size="medium" onClick={handleExport}>
            <Download style={{ width: '1rem', height: '1rem' }} />
            {t('analytics.export')}
          </Button>
        </Actions>
      </Controls>

      <MetricsGrid>
        <MetricCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <MetricHeader>
            <MetricLabel>{t('analytics.revenue')}</MetricLabel>
            <MetricIcon $color="#10b981">
              <DollarSign />
            </MetricIcon>
          </MetricHeader>
          <MetricValue>
            {isLoadingAnalytics ? '...' : metrics.revenue.value}
          </MetricValue>
          <MetricChange $positive={metrics.revenue.isPositive}>
            {metrics.revenue.isPositive ? <TrendingUp /> : <TrendingDown />}
            {Math.abs(metrics.revenue.change).toFixed(1)}% {t('analytics.fromLastMonth')}
          </MetricChange>
        </MetricCard>

        <MetricCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <MetricHeader>
            <MetricLabel>{t('analytics.transactions')}</MetricLabel>
            <MetricIcon $color="#6366f1">
              <ShoppingCart />
            </MetricIcon>
          </MetricHeader>
          <MetricValue>
            {isLoadingAnalytics ? '...' : metrics.transactions.value}
          </MetricValue>
          <MetricChange $positive={metrics.transactions.isPositive}>
            {metrics.transactions.isPositive ? <TrendingUp /> : <TrendingDown />}
            {Math.abs(metrics.transactions.change).toFixed(1)}% {t('analytics.fromLastMonth')}
          </MetricChange>
        </MetricCard>

        <MetricCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <MetricHeader>
            <MetricLabel>{t('analytics.customers')}</MetricLabel>
            <MetricIcon $color="#f59e0b">
              <Users />
            </MetricIcon>
          </MetricHeader>
          <MetricValue>
            {isLoadingAnalytics ? '...' : metrics.customers.value}
          </MetricValue>
          <MetricChange $positive={metrics.customers.isPositive}>
            {metrics.customers.isPositive ? <TrendingUp /> : <TrendingDown />}
            {Math.abs(metrics.customers.change).toFixed(1)}% {t('analytics.fromLastMonth')}
          </MetricChange>
        </MetricCard>

        <MetricCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <MetricHeader>
            <MetricLabel>{t('analytics.avgOrderValue')}</MetricLabel>
            <MetricIcon $color="#8b5cf6">
              <Percent />
            </MetricIcon>
          </MetricHeader>
          <MetricValue>
            {isLoadingAnalytics ? '...' : metrics.avgOrderValue.value}
          </MetricValue>
          <MetricChange $positive={metrics.avgOrderValue.isPositive}>
            {metrics.avgOrderValue.isPositive ? <TrendingUp /> : <TrendingDown />}
            {Math.abs(metrics.avgOrderValue.change).toFixed(1)}% {t('analytics.fromLastMonth')}
          </MetricChange>
        </MetricCard>
      </MetricsGrid>

      <ChartsGrid>
        <ChartCard>
          <ChartHeader>
            <ChartTitle>{t('analytics.revenueOverTime')}</ChartTitle>
          </ChartHeader>
          <ChartContent>
            {t('analytics.chartPlaceholder')}
            <br />
            <small>
              {t('analytics.chartIntegration')}
            </small>
          </ChartContent>
        </ChartCard>

        <ChartCard>
          <ChartHeader>
            <ChartTitle>{t('analytics.transactionsByCategory')}</ChartTitle>
          </ChartHeader>
          <ChartContent>
            {t('analytics.chartPlaceholder')}
            <br />
            <small>
              {t('analytics.chartIntegration')}
            </small>
          </ChartContent>
        </ChartCard>
      </ChartsGrid>

      <TableCard>
        <ChartHeader>
          <ChartTitle>{t('analytics.topOffers')}</ChartTitle>
        </ChartHeader>
        <Table>
          <thead>
            <tr>
              <TableHeader>#</TableHeader>
              <TableHeader>{t('analytics.offer')}</TableHeader>
              <TableHeader>{t('analytics.venue')}</TableHeader>
              <TableHeader style={{ textAlign: 'right' }}>
                {t('analytics.redemptions')}
              </TableHeader>
              <TableHeader style={{ textAlign: 'right' }}>
                {t('analytics.revenue')}
              </TableHeader>
            </tr>
          </thead>
          <tbody>
            {topOffers.map((offer) => (
              <TableRow key={offer.rank}>
                <TableCell>
                  <RankBadge>{offer.rank}</RankBadge>
                </TableCell>
                <TableCell>
                  <strong>{offer.name}</strong>
                </TableCell>
                <TableCell>{offer.venue}</TableCell>
                <TableCell style={{ textAlign: 'right' }}>{offer.redemptions}</TableCell>
                <TableCell style={{ textAlign: 'right' }}>
                  <strong>{offer.revenue}</strong>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </TableCard>
    </Container>
  );
};

export default AnalyticsDashboard;
