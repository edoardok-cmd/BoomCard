import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useLanguage } from '../../contexts/LanguageContext';
import { receiptsApiService } from '../../services/receipts-api.service';
import { Receipt, ReceiptStatus } from '../../types/receipt.types';
import { FileText, TrendingUp, DollarSign, CheckCircle, ArrowRight, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Widget = styled.div`
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 1rem;
  padding: 1.5rem;
  transition: all 0.2s;

  &:hover {
    border-color: #000000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
`;

const WidgetHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
`;

const WidgetTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  svg {
    color: #6b7280;
  }
`;

const ViewAllButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: white;
  color: #111827;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: #000000;
    transform: translateY(-2px);
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const StatCard = styled.div`
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.75rem;
  border: 1px solid #e5e7eb;
`;

const StatLabel = styled.div`
  font-size: 0.75rem;
  color: #6b7280;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.5rem;
`;

const StatValue = styled.div`
  font-size: 1.75rem;
  font-weight: 700;
  color: #111827;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  svg {
    width: 24px;
    height: 24px;
    color: #059669;
  }
`;

const ProgressSection = styled.div`
  margin-bottom: 1.5rem;
`;

const ProgressLabel = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 0.5rem;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $percentage: number; $color?: string }>`
  width: ${props => props.$percentage}%;
  height: 100%;
  background: ${props => props.$color || '#10b981'};
  transition: width 0.3s ease;
`;

const MerchantsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const MerchantRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: #f9fafb;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
`;

const MerchantName = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: #111827;
`;

const MerchantCount = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
`;

const LoadingSpinner = styled.div`
  text-align: center;
  padding: 2rem;
  font-size: 0.875rem;
  color: #6b7280;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 2rem;
  color: #6b7280;

  p {
    margin: 0;
    font-size: 0.875rem;
  }
`;

interface ReceiptAnalytics {
  totalReceipts: number;
  totalAmount: number;
  totalCashback: number;
  averageAmount: number;
  successRate: number;
  topMerchants: Array<{ name: string; count: number; amount: number }>;
}

export const ReceiptAnalyticsWidget: React.FC = () => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<ReceiptAnalytics>({
    totalReceipts: 0,
    totalAmount: 0,
    totalCashback: 0,
    averageAmount: 0,
    successRate: 0,
    topMerchants: [],
  });

  const t = {
    en: {
      title: 'Receipt Analytics',
      viewAll: 'View All',
      viewAnalytics: 'Full Analytics',
      totalReceipts: 'Total Receipts',
      totalSpent: 'Total Spent',
      totalCashback: 'Total Cashback',
      avgAmount: 'Avg Amount',
      successRate: 'Success Rate',
      topMerchants: 'Top Merchants',
      receipts: 'receipts',
      loading: 'Loading...',
      noData: 'No receipt data available yet',
      scanFirst: 'Scan your first receipt to see analytics!',
    },
    bg: {
      title: 'Анализ на бележки',
      viewAll: 'Виж всички',
      viewAnalytics: 'Пълен анализ',
      totalReceipts: 'Общо бележки',
      totalSpent: 'Общо похарчено',
      totalCashback: 'Общ кешбек',
      avgAmount: 'Средна сума',
      successRate: 'Успеваемост',
      topMerchants: 'Топ търговци',
      receipts: 'бележки',
      loading: 'Зареждане...',
      noData: 'Все още няма данни за бележки',
      scanFirst: 'Сканирайте първата си бележка за да видите анализ!',
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      // Fetch stats and receipts
      const [statsResponse, receiptsResponse] = await Promise.all([
        receiptsApiService.getUserStats(),
        receiptsApiService.getReceipts({ limit: 100 }),
      ]);

      if (statsResponse.success && receiptsResponse.success) {
        const stats = statsResponse.data;
        const receipts = receiptsResponse.data;

        // Calculate total cashback (from validated/applied receipts)
        const cashbackReceipts = receipts.filter(
          r => r.status === ReceiptStatus.CASHBACK_APPLIED
        );
        const totalCashback = cashbackReceipts.reduce((sum, r) => {
          // Assume 5% cashback for now (should come from backend)
          return sum + (r.totalAmount || 0) * 0.05;
        }, 0);

        // Calculate success rate
        const validatedCount = stats.validatedReceipts + (stats.totalReceipts - stats.pendingReceipts - stats.rejectedReceipts - stats.validatedReceipts);
        const successRate = stats.totalReceipts > 0
          ? (validatedCount / stats.totalReceipts) * 100
          : 0;

        // Calculate top merchants
        const merchantMap = new Map<string, { count: number; amount: number }>();
        receipts.forEach(receipt => {
          if (receipt.merchantName) {
            const existing = merchantMap.get(receipt.merchantName) || { count: 0, amount: 0 };
            merchantMap.set(receipt.merchantName, {
              count: existing.count + 1,
              amount: existing.amount + (receipt.totalAmount || 0),
            });
          }
        });

        const topMerchants = Array.from(merchantMap.entries())
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        setAnalytics({
          totalReceipts: stats.totalReceipts,
          totalAmount: stats.totalAmount,
          totalCashback,
          averageAmount: stats.averageAmount,
          successRate,
          topMerchants,
        });
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Widget>
        <LoadingSpinner>{content.loading}</LoadingSpinner>
      </Widget>
    );
  }

  if (analytics.totalReceipts === 0) {
    return (
      <Widget>
        <WidgetHeader>
          <WidgetTitle>
            <FileText />
            {content.title}
          </WidgetTitle>
        </WidgetHeader>
        <EmptyState>
          <p>{content.noData}</p>
          <p>{content.scanFirst}</p>
        </EmptyState>
      </Widget>
    );
  }

  return (
    <Widget>
      <WidgetHeader>
        <WidgetTitle>
          <FileText />
          {content.title}
        </WidgetTitle>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <ViewAllButton onClick={() => navigate('/receipts/analytics')}>
            <BarChart3 size={16} />
            {content.viewAnalytics}
          </ViewAllButton>
          <ViewAllButton onClick={() => navigate('/receipts')}>
            {content.viewAll}
            <ArrowRight size={16} />
          </ViewAllButton>
        </div>
      </WidgetHeader>

      <StatsGrid>
        <StatCard>
          <StatLabel>{content.totalReceipts}</StatLabel>
          <StatValue>{analytics.totalReceipts}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>{content.totalCashback}</StatLabel>
          <StatValue>
            <DollarSign />
            {analytics.totalCashback.toFixed(2)} лв
          </StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>{content.totalSpent}</StatLabel>
          <StatValue>{analytics.totalAmount.toFixed(2)} лв</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>{content.avgAmount}</StatLabel>
          <StatValue>{analytics.averageAmount.toFixed(2)} лв</StatValue>
        </StatCard>
      </StatsGrid>

      <ProgressSection>
        <ProgressLabel>
          <span>{content.successRate}</span>
          <span>{analytics.successRate.toFixed(0)}%</span>
        </ProgressLabel>
        <ProgressBar>
          <ProgressFill
            $percentage={analytics.successRate}
            $color={analytics.successRate >= 70 ? '#10b981' : analytics.successRate >= 50 ? '#f59e0b' : '#ef4444'}
          />
        </ProgressBar>
      </ProgressSection>

      {analytics.topMerchants.length > 0 && (
        <>
          <StatLabel style={{ marginBottom: '0.75rem' }}>{content.topMerchants}</StatLabel>
          <MerchantsList>
            {analytics.topMerchants.map((merchant, index) => (
              <MerchantRow key={index}>
                <MerchantName>{merchant.name}</MerchantName>
                <MerchantCount>
                  {merchant.count} {content.receipts}
                </MerchantCount>
              </MerchantRow>
            ))}
          </MerchantsList>
        </>
      )}
    </Widget>
  );
};

export default ReceiptAnalyticsWidget;
