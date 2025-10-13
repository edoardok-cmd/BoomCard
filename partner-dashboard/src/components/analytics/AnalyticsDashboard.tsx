import React, { useState } from 'react';
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
  const [timeRange, setTimeRange] = useState<TimeRange>('month');

  // Mock data - replace with real data
  const metrics: Record<string, MetricData> = {
    revenue: {
      value: '$45,231',
      change: 12.5,
      isPositive: true,
    },
    transactions: {
      value: '1,234',
      change: 8.2,
      isPositive: true,
    },
    customers: {
      value: '892',
      change: -3.1,
      isPositive: false,
    },
    avgOrderValue: {
      value: '$36.67',
      change: 15.8,
      isPositive: true,
    },
  };

  const topOffers = [
    { rank: 1, name: '20% Off Dinner', venue: 'Italian Restaurant', redemptions: 234, revenue: '$4,680' },
    { rank: 2, name: 'Buy 1 Get 1 Free', venue: 'Burger Place', redemptions: 189, revenue: '$3,780' },
    { rank: 3, name: '30% Off Spa', venue: 'Luxury Spa', redemptions: 156, revenue: '$6,240' },
    { rank: 4, name: 'Wine Tasting', venue: 'Mountain Winery', redemptions: 142, revenue: '$5,680' },
    { rank: 5, name: 'Hotel Weekend', venue: 'Beach Resort', redemptions: 98, revenue: '$7,840' },
  ];

  const handleExport = () => {
    console.log('Export analytics report');
  };

  const handleFilter = () => {
    console.log('Open filter modal');
  };

  return (
    <Container>
      <Header>
        <Title>{language === 'bg' ? 'Анализи' : 'Analytics'}</Title>
        <Subtitle>
          {language === 'bg'
            ? 'Преглед на вашите показатели и статистики'
            : 'View your performance metrics and insights'}
        </Subtitle>
      </Header>

      <Controls>
        <TimeRangeSelector>
          <TimeButton
            $active={timeRange === 'today'}
            onClick={() => setTimeRange('today')}
          >
            {language === 'bg' ? 'Днес' : 'Today'}
          </TimeButton>
          <TimeButton
            $active={timeRange === 'week'}
            onClick={() => setTimeRange('week')}
          >
            {language === 'bg' ? 'Седмица' : 'Week'}
          </TimeButton>
          <TimeButton
            $active={timeRange === 'month'}
            onClick={() => setTimeRange('month')}
          >
            {language === 'bg' ? 'Месец' : 'Month'}
          </TimeButton>
          <TimeButton
            $active={timeRange === 'year'}
            onClick={() => setTimeRange('year')}
          >
            {language === 'bg' ? 'Година' : 'Year'}
          </TimeButton>
        </TimeRangeSelector>

        <Actions>
          <Button variant="outline" size="medium" onClick={handleFilter}>
            <Filter style={{ width: '1rem', height: '1rem' }} />
            {language === 'bg' ? 'Филтри' : 'Filter'}
          </Button>
          <Button variant="outline" size="medium" onClick={handleExport}>
            <Download style={{ width: '1rem', height: '1rem' }} />
            {language === 'bg' ? 'Експорт' : 'Export'}
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
            <MetricLabel>{language === 'bg' ? 'Приходи' : 'Revenue'}</MetricLabel>
            <MetricIcon $color="#10b981">
              <DollarSign />
            </MetricIcon>
          </MetricHeader>
          <MetricValue>{metrics.revenue.value}</MetricValue>
          <MetricChange $positive={metrics.revenue.isPositive}>
            {metrics.revenue.isPositive ? <TrendingUp /> : <TrendingDown />}
            {Math.abs(metrics.revenue.change)}% {language === 'bg' ? 'от миналия месец' : 'from last month'}
          </MetricChange>
        </MetricCard>

        <MetricCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <MetricHeader>
            <MetricLabel>{language === 'bg' ? 'Транзакции' : 'Transactions'}</MetricLabel>
            <MetricIcon $color="#6366f1">
              <ShoppingCart />
            </MetricIcon>
          </MetricHeader>
          <MetricValue>{metrics.transactions.value}</MetricValue>
          <MetricChange $positive={metrics.transactions.isPositive}>
            {metrics.transactions.isPositive ? <TrendingUp /> : <TrendingDown />}
            {Math.abs(metrics.transactions.change)}% {language === 'bg' ? 'от миналия месец' : 'from last month'}
          </MetricChange>
        </MetricCard>

        <MetricCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <MetricHeader>
            <MetricLabel>{language === 'bg' ? 'Клиенти' : 'Customers'}</MetricLabel>
            <MetricIcon $color="#f59e0b">
              <Users />
            </MetricIcon>
          </MetricHeader>
          <MetricValue>{metrics.customers.value}</MetricValue>
          <MetricChange $positive={metrics.customers.isPositive}>
            {metrics.customers.isPositive ? <TrendingUp /> : <TrendingDown />}
            {Math.abs(metrics.customers.change)}% {language === 'bg' ? 'от миналия месец' : 'from last month'}
          </MetricChange>
        </MetricCard>

        <MetricCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <MetricHeader>
            <MetricLabel>{language === 'bg' ? 'Средна стойност' : 'Avg Order Value'}</MetricLabel>
            <MetricIcon $color="#8b5cf6">
              <Percent />
            </MetricIcon>
          </MetricHeader>
          <MetricValue>{metrics.avgOrderValue.value}</MetricValue>
          <MetricChange $positive={metrics.avgOrderValue.isPositive}>
            {metrics.avgOrderValue.isPositive ? <TrendingUp /> : <TrendingDown />}
            {Math.abs(metrics.avgOrderValue.change)}% {language === 'bg' ? 'от миналия месец' : 'from last month'}
          </MetricChange>
        </MetricCard>
      </MetricsGrid>

      <ChartsGrid>
        <ChartCard>
          <ChartHeader>
            <ChartTitle>{language === 'bg' ? 'Приходи по време' : 'Revenue Over Time'}</ChartTitle>
          </ChartHeader>
          <ChartContent>
            {language === 'bg' ? 'Графиката ще бъде показана тук' : 'Chart visualization would go here'}
            <br />
            <small>
              {language === 'bg'
                ? 'Интегрирайте с Chart.js, Recharts или D3.js'
                : 'Integrate with Chart.js, Recharts, or D3.js'}
            </small>
          </ChartContent>
        </ChartCard>

        <ChartCard>
          <ChartHeader>
            <ChartTitle>{language === 'bg' ? 'Транзакции по категория' : 'Transactions by Category'}</ChartTitle>
          </ChartHeader>
          <ChartContent>
            {language === 'bg' ? 'Графиката ще бъде показана тук' : 'Chart visualization would go here'}
            <br />
            <small>
              {language === 'bg'
                ? 'Интегрирайте с Chart.js, Recharts или D3.js'
                : 'Integrate with Chart.js, Recharts, or D3.js'}
            </small>
          </ChartContent>
        </ChartCard>
      </ChartsGrid>

      <TableCard>
        <ChartHeader>
          <ChartTitle>{language === 'bg' ? 'Топ оферти' : 'Top Performing Offers'}</ChartTitle>
        </ChartHeader>
        <Table>
          <thead>
            <tr>
              <TableHeader>#</TableHeader>
              <TableHeader>{language === 'bg' ? 'Оферта' : 'Offer'}</TableHeader>
              <TableHeader>{language === 'bg' ? 'Заведение' : 'Venue'}</TableHeader>
              <TableHeader style={{ textAlign: 'right' }}>
                {language === 'bg' ? 'Използвания' : 'Redemptions'}
              </TableHeader>
              <TableHeader style={{ textAlign: 'right' }}>
                {language === 'bg' ? 'Приходи' : 'Revenue'}
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
