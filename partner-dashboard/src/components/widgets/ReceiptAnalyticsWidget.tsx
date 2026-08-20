import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useLanguage } from '../../contexts/LanguageContext';
import { receiptsApiService } from '../../services/receipts-api.service';
import { ReceiptStatus } from '../../types/receipt.types';
import { FileText, DollarSign, ArrowRight, BarChart3 } from 'lucide-react';
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

        // Total cashback actually granted.
        // BC-QA-031-FOLLOWUP-4: this used to filter on
        // ReceiptStatus.CASHBACK_APPLIED and multiply totalAmount by a
        // hardcoded 0.05. The backend never emits that status (see the
        // ReceiptStatus enum in receipt.types.ts, which is now aligned with
        // backend-api/prisma/schema.prisma), so the filter matched nothing and
        // this card rendered €0.00 for every account, always. APPROVED is the
        // terminal state in which cashback has been calculated and credited,
        // and each row carries its own real `cashbackAmount` — no client-side
        // rate guess.
        //
        // ReceiptAnalyticsPage.tsx:549-566 made the same status/field
        // correction for the same reason, and this hunk is modelled on it — but
        // only on that half of it. The sibling carries a SECOND, separate fix
        // immediately below (server-side cap-free aggregates when no filter
        // narrows the view) that is NOT reproduced here: the sum below still
        // runs over the `limit: 100` page fetched at :249, while the Total
        // Receipts card beside it is an unbounded server-side count, so the two
        // disagree above 100 receipts. That divergence is out of scope for
        // BC-QA-031-FOLLOWUP-4 and is tracked as board task BC-QA-056.
        const totalCashback = receipts
          .filter(r => r.status === ReceiptStatus.APPROVED)
          .reduce((sum, r) => sum + (r.cashbackAmount || 0), 0);

        // Calculate success rate.
        // GET /api/receipts/stats counts only three statuses explicitly —
        // validatedReceipts = APPROVED, rejectedReceipts = REJECTED,
        // pendingReceipts = PENDING — so the expression below reduces to
        // (totalReceipts - pendingReceipts - rejectedReceipts): every receipt
        // that is neither pending nor rejected counts as a success, whatever
        // status it actually holds — EXPIRED, MANUAL_REVIEW, PROCESSING and
        // VALIDATING all score as wins, and an EXPIRED receipt in particular is
        // a failed submission. The two stats.validatedReceipts terms cancel out.
        // Left exactly as-is by BC-QA-031-FOLLOWUP-4: that task repointed where
        // these counts come from and did not re-scope what "success" means here.
        // Re-scoping it is tracked as board task BC-QA-056 (item 6).
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

        {/* BC-QA-031 — provenance: every money figure below is EUR.

            `totalCashback` is the sum of the per-row `cashbackAmount` of the
            APPROVED receipts returned by receiptsApiService.getReceipts()
            → GET /api/receipts/v2, which does NOT pass `includeInternal`, so
            receipt.service.ts `formatReceipt()` reaches its bgnToEur() block —
            it converts `cashbackAmount` unconditionally (receipt.service.ts
            L693), so the summed figure is EUR.

            `totalAmount` / `averageAmount` come from
            receiptsApiService.getUserStats() → GET /api/receipts/stats
            (`getUserReceiptStats()`), which runs both through bgnToEur() before
            responding.

            This note is about CURRENCY only — it says the figures are EUR, not
            that each one means what its label says. `averageAmount` in
            particular divides a sum taken over receipts with a non-null
            `totalAmount` by a count of ALL of the account's receipts, so an
            amount-less receipt inflates the denominator and never the
            numerator, and the "Avg Amount" card understates. That basis is a
            backend question and is tracked as board task BC-QA-057. */}
        <StatCard>
          <StatLabel>{content.totalCashback}</StatLabel>
          <StatValue>
            <DollarSign />
            €{analytics.totalCashback.toFixed(2)}
          </StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>{content.totalSpent}</StatLabel>
          <StatValue>€{analytics.totalAmount.toFixed(2)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>{content.avgAmount}</StatLabel>
          <StatValue>€{analytics.averageAmount.toFixed(2)}</StatValue>
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
