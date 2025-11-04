import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { receiptService } from '../../services/receipt.service';
import { useLanguage } from '../../contexts/LanguageContext';
import { TrendingUp, DollarSign, FileText, CheckCircle, XCircle, PieChart } from 'lucide-react';

const Container = styled.div`
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 2rem;
  color: #111827;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
`;

const StatCard = styled.div`
  padding: 1.5rem;
  background: white;
  border-radius: 0.75rem;
  border: 2px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const StatHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
`;

const StatLabel = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  font-weight: 600;
`;

const StatIcon = styled.div<{ $color: string }>`
  width: 40px;
  height: 40px;
  border-radius: 0.5rem;
  background: ${props => props.$color};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
`;

const StatValue = styled.div`
  font-size: 2.5rem;
  font-weight: 700;
  color: #111827;
`;

const StatSubtext = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 0.5rem;
`;

const ChartSection = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
`;

const ChartCard = styled.div`
  padding: 1.5rem;
  background: white;
  border-radius: 0.75rem;
  border: 2px solid #e5e7eb;
`;

const ChartTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: #111827;
`;

const TopMerchantsTable = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableRow = styled.tr`
  border-bottom: 1px solid #e5e7eb;

  &:last-child {
    border-bottom: none;
  }
`;

const TableCell = styled.td`
  padding: 0.75rem 0;
  font-size: 0.875rem;
  color: #6b7280;

  &:first-child {
    font-weight: 600;
    color: #111827;
  }

  &:last-child {
    text-align: right;
    font-weight: 600;
    color: #111827;
  }
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
  margin-top: 0.5rem;
`;

const ProgressFill = styled.div<{ $percentage: number; $color: string }>`
  width: ${props => props.$percentage}%;
  height: 100%;
  background: ${props => props.$color};
  transition: width 0.3s ease;
`;

const SuccessRate = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 2rem 0;
`;

const SuccessCircle = styled.div<{ $percentage: number }>`
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: conic-gradient(
    #10b981 0deg ${props => props.$percentage * 3.6}deg,
    #e5e7eb ${props => props.$percentage * 3.6}deg 360deg
  );
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    width: 160px;
    height: 160px;
    background: white;
    border-radius: 50%;
  }
`;

const SuccessPercentage = styled.div`
  position: relative;
  z-index: 1;
  font-size: 3rem;
  font-weight: 700;
  color: #111827;
`;

export interface ReceiptAnalyticsData {
  totalReceipts: number;
  approvedReceipts: number;
  rejectedReceipts: number;
  pendingReceipts: number;
  totalCashback: number;
  totalSpent: number;
  averageReceiptAmount: number;
  topMerchant?: string;
  lastReceiptDate?: string;
  successRate: number;
  topMerchants: Array<{ name: string; count: number; totalSpent: number }>;
  monthlyStats: Array<{ month: string; receipts: number; cashback: number }>;
}

export const ReceiptAnalytics: React.FC = () => {
  const { language } = useLanguage();
  const [analytics, setAnalytics] = useState<ReceiptAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const t = {
    en: {
      title: 'Receipt Analytics',
      stats: {
        totalReceipts: 'Total Receipts',
        totalCashback: 'Total Cashback',
        avgAmount: 'Avg Receipt Amount',
        successRate: 'Success Rate',
        totalSpent: 'Total Spent',
        approved: 'Approved',
        rejected: 'Rejected',
        pending: 'Pending',
      },
      charts: {
        topMerchants: 'Top Merchants',
        successRate: 'Approval Rate',
        distribution: 'Receipt Distribution',
      },
      table: {
        merchant: 'Merchant',
        receipts: 'Receipts',
        spent: 'Total Spent',
      },
    },
    bg: {
      title: 'Аналитика на касови бележки',
      stats: {
        totalReceipts: 'Общо бележки',
        totalCashback: 'Общ кешбек',
        avgAmount: 'Средна сума',
        successRate: 'Процент одобрени',
        totalSpent: 'Общо похарчени',
        approved: 'Одобрени',
        rejected: 'Отхвърлени',
        pending: 'Изчакващи',
      },
      charts: {
        topMerchants: 'Топ търговци',
        successRate: 'Процент одобрени',
        distribution: 'Разпределение на бележки',
      },
      table: {
        merchant: 'Търговец',
        receipts: 'Бележки',
        spent: 'Обща сума',
      },
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const data = await receiptService.getReceiptAnalytics();
      setAnalytics(data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !analytics) {
    return <Container><Title>{content.title}</Title><p>Loading...</p></Container>;
  }

  return (
    <Container>
      <Title>{content.title}</Title>

      <StatsGrid>
        <StatCard>
          <StatHeader>
            <StatLabel>{content.stats.totalReceipts}</StatLabel>
            <StatIcon $color="#667eea">
              <FileText size={20} />
            </StatIcon>
          </StatHeader>
          <StatValue>{analytics.totalReceipts}</StatValue>
          <StatSubtext>
            {analytics.approvedReceipts} {content.stats.approved} •
            {analytics.rejectedReceipts} {content.stats.rejected}
          </StatSubtext>
        </StatCard>

        <StatCard>
          <StatHeader>
            <StatLabel>{content.stats.totalCashback}</StatLabel>
            <StatIcon $color="#10b981">
              <DollarSign size={20} />
            </StatIcon>
          </StatHeader>
          <StatValue>{analytics.totalCashback.toFixed(2)} BGN</StatValue>
          <StatSubtext>
            {content.stats.totalSpent}: {analytics.totalSpent.toFixed(2)} BGN
          </StatSubtext>
        </StatCard>

        <StatCard>
          <StatHeader>
            <StatLabel>{content.stats.avgAmount}</StatLabel>
            <StatIcon $color="#f59e0b">
              <TrendingUp size={20} />
            </StatIcon>
          </StatHeader>
          <StatValue>{analytics.averageReceiptAmount.toFixed(2)} BGN</StatValue>
          <StatSubtext>Per receipt</StatSubtext>
        </StatCard>

        <StatCard>
          <StatHeader>
            <StatLabel>{content.stats.successRate}</StatLabel>
            <StatIcon $color="#8b5cf6">
              <PieChart size={20} />
            </StatIcon>
          </StatHeader>
          <StatValue>{analytics.successRate.toFixed(0)}%</StatValue>
          <StatSubtext>
            {analytics.approvedReceipts}/{analytics.totalReceipts} approved
          </StatSubtext>
        </StatCard>
      </StatsGrid>

      <ChartSection>
        <ChartCard>
          <ChartTitle>{content.charts.topMerchants}</ChartTitle>
          <TopMerchantsTable>
            <tbody>
              {analytics.topMerchants?.map((merchant, idx) => (
                <TableRow key={idx}>
                  <TableCell>{merchant.name}</TableCell>
                  <TableCell>{merchant.count} {content.table.receipts}</TableCell>
                  <TableCell>{merchant.totalSpent.toFixed(2)} BGN</TableCell>
                </TableRow>
              ))}
            </tbody>
          </TopMerchantsTable>
        </ChartCard>

        <ChartCard>
          <ChartTitle>{content.charts.successRate}</ChartTitle>
          <SuccessRate>
            <SuccessCircle $percentage={analytics.successRate}>
              <SuccessPercentage>{analytics.successRate.toFixed(0)}%</SuccessPercentage>
            </SuccessCircle>
          </SuccessRate>
        </ChartCard>
      </ChartSection>

      <ChartCard>
        <ChartTitle>{content.charts.distribution}</ChartTitle>
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span>{content.stats.approved}</span>
              <span>{analytics.approvedReceipts}</span>
            </div>
            <ProgressBar>
              <ProgressFill
                $percentage={(analytics.approvedReceipts / analytics.totalReceipts) * 100}
                $color="#10b981"
              />
            </ProgressBar>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span>{content.stats.rejected}</span>
              <span>{analytics.rejectedReceipts}</span>
            </div>
            <ProgressBar>
              <ProgressFill
                $percentage={(analytics.rejectedReceipts / analytics.totalReceipts) * 100}
                $color="#ef4444"
              />
            </ProgressBar>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span>{content.stats.pending}</span>
              <span>{analytics.pendingReceipts}</span>
            </div>
            <ProgressBar>
              <ProgressFill
                $percentage={(analytics.pendingReceipts / analytics.totalReceipts) * 100}
                $color="#f59e0b"
              />
            </ProgressBar>
          </div>
        </div>
      </ChartCard>
    </Container>
  );
};

export default ReceiptAnalytics;
