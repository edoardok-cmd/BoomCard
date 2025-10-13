import React, { useState } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, DollarSign, CreditCard, Users, ArrowUp, ArrowDown } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

const PageContainer = styled.div`
  min-height: calc(100vh - 4rem);
  background: #f9fafb;
  padding: 2rem 1rem;
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
`;

const PageHeader = styled.div`
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
`;

const Subtitle = styled.p`
  color: #6b7280;
  font-size: 1rem;
`;

const DateFilter = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
`;

const FilterButton = styled.button<{ $active: boolean }>`
  padding: 0.5rem 1rem;
  border: 2px solid ${props => props.$active ? '#667eea' : '#e5e7eb'};
  background: ${props => props.$active ? '#667eea' : 'white'};
  color: ${props => props.$active ? 'white' : '#374151'};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: #667eea;
    background: ${props => props.$active ? '#5568d3' : '#f9fafb'};
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
`;

const StatCard = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const StatHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
`;

const StatIconWrapper = styled.div<{ $color: string }>`
  width: 48px;
  height: 48px;
  border-radius: 0.75rem;
  background: ${props => props.$color}15;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 24px;
    height: 24px;
    color: ${props => props.$color};
  }
`;

const StatLabel = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  font-weight: 500;
`;

const StatValue = styled.div`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
`;

const StatChange = styled.div<{ $positive: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => props.$positive ? '#10b981' : '#ef4444'};

  svg {
    width: 16px;
    height: 16px;
  }
`;

const ChartsGrid = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.5rem;
  margin-bottom: 2rem;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

const ChartCard = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
`;

const ChartHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
`;

const ChartTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
`;

const ChartLegend = styled.div`
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
`;

const LegendItem = styled.div<{ $color: string }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;

  &::before {
    content: '';
    width: 12px;
    height: 12px;
    border-radius: 2px;
    background: ${props => props.$color};
  }
`;

const BarChart = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  height: 200px;
  padding: 1rem 0;
`;

const Bar = styled(motion.div)<{ $height: number; $color: string }>`
  flex: 1;
  background: ${props => props.$color};
  border-radius: 0.5rem 0.5rem 0 0;
  height: ${props => props.$height}%;
  min-height: 2px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  padding-bottom: 0.5rem;
  position: relative;
  transition: all 0.3s;

  &:hover {
    opacity: 0.8;
    transform: translateY(-4px);
  }
`;

const BarLabel = styled.div`
  position: absolute;
  bottom: -1.5rem;
  font-size: 0.75rem;
  color: #6b7280;
  white-space: nowrap;
`;

const BarValue = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
`;

const PieChartContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 250px;
  position: relative;
`;

const PieChart = styled.svg`
  width: 200px;
  height: 200px;
  transform: rotate(-90deg);
`;

const CategoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1.5rem;
`;

const CategoryItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const CategoryInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const CategoryDot = styled.div<{ $color: string }>`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${props => props.$color};
`;

const CategoryName = styled.div`
  font-size: 0.875rem;
  color: #374151;
  font-weight: 500;
`;

const CategoryValue = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: #111827;
`;

const AnalyticsPage: React.FC = () => {
  const { language } = useLanguage();
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('30d');

  const content = {
    en: {
      title: 'Analytics',
      subtitle: 'Track your savings and card usage',
      periods: {
        '7d': 'Last 7 days',
        '30d': 'Last 30 days',
        '90d': 'Last 3 months',
        '1y': 'Last year',
      },
      stats: {
        totalSavings: 'Total Savings',
        activeCards: 'Active Cards',
        totalUses: 'Total Uses',
        avgDiscount: 'Avg. Discount',
      },
      charts: {
        savingsOverTime: 'Savings Over Time',
        savingsByCategory: 'Savings by Category',
        savings: 'Savings',
        uses: 'Uses',
      },
      categories: {
        restaurants: 'Restaurants',
        hotels: 'Hotels',
        spa: 'Spa & Wellness',
        entertainment: 'Entertainment',
      },
    },
    bg: {
      title: 'Анализи',
      subtitle: 'Следете спестяванията и използването на картите',
      periods: {
        '7d': 'Последните 7 дни',
        '30d': 'Последните 30 дни',
        '90d': 'Последните 3 месеца',
        '1y': 'Последната година',
      },
      stats: {
        totalSavings: 'Общо Спестявания',
        activeCards: 'Активни Карти',
        totalUses: 'Общо Използвания',
        avgDiscount: 'Средна Отстъпка',
      },
      charts: {
        savingsOverTime: 'Спестявания във Времето',
        savingsByCategory: 'Спестявания по Категория',
        savings: 'Спестявания',
        uses: 'Използвания',
      },
      categories: {
        restaurants: 'Ресторанти',
        hotels: 'Хотели',
        spa: 'Спа и Уелнес',
        entertainment: 'Развлечения',
      },
    },
  };

  const t = content[language as keyof typeof content];

  // Mock data - would come from API in production
  const stats = {
    totalSavings: { value: 1247, change: 12.5, positive: true },
    activeCards: { value: 3, change: 0, positive: true },
    totalUses: { value: 24, change: 8.3, positive: true },
    avgDiscount: { value: 38, change: -2.1, positive: false },
  };

  const savingsData = [
    { label: 'Mon', value: 45, uses: 3 },
    { label: 'Tue', value: 78, uses: 5 },
    { label: 'Wed', value: 120, uses: 8 },
    { label: 'Thu', value: 95, uses: 6 },
    { label: 'Fri', value: 180, uses: 12 },
    { label: 'Sat', value: 240, uses: 15 },
    { label: 'Sun', value: 210, uses: 11 },
  ];

  const categoryData = [
    { name: t.categories.restaurants, value: 450, percentage: 36, color: '#667eea' },
    { name: t.categories.hotels, value: 380, percentage: 30, color: '#10b981' },
    { name: t.categories.spa, value: 280, percentage: 22, color: '#f59e0b' },
    { name: t.categories.entertainment, value: 137, percentage: 12, color: '#ef4444' },
  ];

  const maxSavings = Math.max(...savingsData.map(d => d.value));

  // Calculate pie chart segments
  let currentAngle = 0;
  const pieSegments = categoryData.map(cat => {
    const angle = (cat.percentage / 100) * 360;
    const segment = {
      ...cat,
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
    };
    currentAngle += angle;
    return segment;
  });

  const createPieSegmentPath = (percentage: number, startAngle: number) => {
    const radius = 80;
    const cx = 100;
    const cy = 100;

    const angleInRadians = (percentage / 100) * 2 * Math.PI;
    const startAngleRad = (startAngle / 100) * 2 * Math.PI;

    const x1 = cx + radius * Math.cos(startAngleRad);
    const y1 = cy + radius * Math.sin(startAngleRad);
    const x2 = cx + radius * Math.cos(startAngleRad + angleInRadians);
    const y2 = cy + radius * Math.sin(startAngleRad + angleInRadians);

    const largeArc = percentage > 50 ? 1 : 0;

    return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  };

  return (
    <PageContainer>
      <Container>
        <PageHeader>
          <Title>{t.title}</Title>
          <Subtitle>{t.subtitle}</Subtitle>
        </PageHeader>

        <DateFilter>
          {(Object.keys(t.periods) as Array<keyof typeof t.periods>).map(period => (
            <FilterButton
              key={period}
              $active={selectedPeriod === period}
              onClick={() => setSelectedPeriod(period as typeof selectedPeriod)}
            >
              {t.periods[period]}
            </FilterButton>
          ))}
        </DateFilter>

        <StatsGrid>
          <StatCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <StatHeader>
              <div>
                <StatLabel>{t.stats.totalSavings}</StatLabel>
              </div>
              <StatIconWrapper $color="#10b981">
                <DollarSign />
              </StatIconWrapper>
            </StatHeader>
            <StatValue>{stats.totalSavings.value} BGN</StatValue>
            <StatChange $positive={stats.totalSavings.positive}>
              {stats.totalSavings.positive ? <ArrowUp /> : <ArrowDown />}
              {Math.abs(stats.totalSavings.change)}%
            </StatChange>
          </StatCard>

          <StatCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <StatHeader>
              <div>
                <StatLabel>{t.stats.activeCards}</StatLabel>
              </div>
              <StatIconWrapper $color="#667eea">
                <CreditCard />
              </StatIconWrapper>
            </StatHeader>
            <StatValue>{stats.activeCards.value}</StatValue>
            <StatChange $positive={stats.activeCards.positive}>
              {stats.activeCards.positive ? <ArrowUp /> : <ArrowDown />}
              {Math.abs(stats.activeCards.change)}%
            </StatChange>
          </StatCard>

          <StatCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <StatHeader>
              <div>
                <StatLabel>{t.stats.totalUses}</StatLabel>
              </div>
              <StatIconWrapper $color="#f59e0b">
                <Users />
              </StatIconWrapper>
            </StatHeader>
            <StatValue>{stats.totalUses.value}</StatValue>
            <StatChange $positive={stats.totalUses.positive}>
              {stats.totalUses.positive ? <ArrowUp /> : <ArrowDown />}
              {Math.abs(stats.totalUses.change)}%
            </StatChange>
          </StatCard>

          <StatCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <StatHeader>
              <div>
                <StatLabel>{t.stats.avgDiscount}</StatLabel>
              </div>
              <StatIconWrapper $color="#ef4444">
                {stats.avgDiscount.positive ? <TrendingUp /> : <TrendingDown />}
              </StatIconWrapper>
            </StatHeader>
            <StatValue>{stats.avgDiscount.value}%</StatValue>
            <StatChange $positive={stats.avgDiscount.positive}>
              {stats.avgDiscount.positive ? <ArrowUp /> : <ArrowDown />}
              {Math.abs(stats.avgDiscount.change)}%
            </StatChange>
          </StatCard>
        </StatsGrid>

        <ChartsGrid>
          <ChartCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <ChartHeader>
              <ChartTitle>{t.charts.savingsOverTime}</ChartTitle>
              <ChartLegend>
                <LegendItem $color="#667eea">{t.charts.savings}</LegendItem>
              </ChartLegend>
            </ChartHeader>
            <BarChart>
              {savingsData.map((data, index) => (
                <Bar
                  key={data.label}
                  $height={(data.value / maxSavings) * 100}
                  $color="#667eea"
                  initial={{ height: 0 }}
                  animate={{ height: `${(data.value / maxSavings) * 100}%` }}
                  transition={{ delay: 0.6 + index * 0.1, duration: 0.5 }}
                >
                  <BarValue>{data.value}</BarValue>
                  <BarLabel>{data.label}</BarLabel>
                </Bar>
              ))}
            </BarChart>
          </ChartCard>

          <ChartCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <ChartHeader>
              <ChartTitle>{t.charts.savingsByCategory}</ChartTitle>
            </ChartHeader>
            <PieChartContainer>
              <PieChart viewBox="0 0 200 200">
                {pieSegments.map((segment, index) => (
                  <motion.path
                    key={segment.name}
                    d={createPieSegmentPath(segment.percentage, (segment.startAngle / 360) * 100)}
                    fill={segment.color}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7 + index * 0.1 }}
                  />
                ))}
              </PieChart>
            </PieChartContainer>
            <CategoryList>
              {categoryData.map(category => (
                <CategoryItem key={category.name}>
                  <CategoryInfo>
                    <CategoryDot $color={category.color} />
                    <CategoryName>{category.name}</CategoryName>
                  </CategoryInfo>
                  <CategoryValue>{category.value} BGN ({category.percentage}%)</CategoryValue>
                </CategoryItem>
              ))}
            </CategoryList>
          </ChartCard>
        </ChartsGrid>
      </Container>
    </PageContainer>
  );
};

export default AnalyticsPage;
