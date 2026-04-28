import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Button from '../components/common/Button/Button';
import { useCurrentPartner, usePartnerStats } from '../hooks/usePartners';
import { useOffers } from '../hooks/useOffers';
import { apiService } from '../services/api.service';

const PageContainer = styled.div`
  max-width: 72rem;
  margin: 0 auto;
  padding: 2rem 1rem;
  min-height: calc(100vh - 4rem);
`;

const PageHeader = styled.div`
  margin-bottom: 2.5rem;
`;

const Title = styled.h1`
  font-size: 2.75rem;
  font-weight: 800;
  background: linear-gradient(135deg, #111827 0%, #4f46e5 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.625rem;
  letter-spacing: -0.03em;
  line-height: 1.2;

  [data-theme="dark"] & {
    background: linear-gradient(135deg, #f9fafb 0%, #a78bfa 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  @media (max-width: 640px) {
    font-size: 2rem;
  }
`;

const Subtitle = styled.p`
  font-size: 1.125rem;
  color: #6b7280;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.6;

  [data-theme="dark"] & {
    color: #d1d5db;
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 1.5rem;
  margin-bottom: 2.5rem;
`;

const StatCard = styled(motion.div)`
  background: linear-gradient(to bottom right, #ffffff 0%, #fafbfc 100%);
  border-radius: 1.5rem;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.08),
    0 8px 24px rgba(0, 0, 0, 0.06),
    0 16px 48px rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.06);
  padding: 2rem;
  transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;

  [data-theme="dark"] & {
    background: linear-gradient(to bottom right, #1f2937 0%, #111827 100%);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.3),
      0 8px 24px rgba(0, 0, 0, 0.2),
      0 16px 48px rgba(0, 0, 0, 0.1);
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, #6366f1 0%, #a855f7 100%);
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 400ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  &:hover {
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.12),
      0 12px 32px rgba(0, 0, 0, 0.1),
      0 24px 64px rgba(0, 0, 0, 0.08);
    transform: translateY(-6px);
    border-color: rgba(99, 102, 241, 0.2);

    [data-theme="dark"] & {
      box-shadow:
        0 4px 16px rgba(0, 0, 0, 0.4),
        0 12px 32px rgba(0, 0, 0, 0.3),
        0 24px 64px rgba(0, 0, 0, 0.2);
      border-color: rgba(99, 102, 241, 0.4);
    }

    &::before {
      transform: scaleX(1);
    }
  }
`;

const StatLabel = styled.p`
  font-size: 0.8125rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.625rem;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const StatValue = styled.p`
  font-size: 2.5rem;
  font-weight: 800;
  background: linear-gradient(135deg, #111827 0%, #4f46e5 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.375rem;
  letter-spacing: -0.03em;
  line-height: 1.2;

  [data-theme="dark"] & {
    background: linear-gradient(135deg, #f9fafb 0%, #a78bfa 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
`;

const StatChange = styled.p<{ $positive?: boolean }>`
  font-size: 0.875rem;
  font-weight: 500;
  color: ${props => props.$positive ? '#10b981' : '#6b7280'};

  [data-theme="dark"] & {
    color: ${props => props.$positive ? '#34d399' : '#9ca3af'};
  }
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
`;

const SectionTitle = styled.h2`
  font-size: 1.75rem;
  font-weight: 800;
  color: #111827;
  letter-spacing: -0.02em;
  line-height: 1.3;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const CardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
  gap: 1.5rem;
  margin-bottom: 2.5rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const BoomCardItem = styled(motion.div)`
  background: white;
  border-radius: 1.5rem;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.08),
    0 8px 24px rgba(0, 0, 0, 0.06),
    0 16px 48px rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.06);
  overflow: hidden;
  transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.3),
      0 8px 24px rgba(0, 0, 0, 0.2),
      0 16px 48px rgba(0, 0, 0, 0.1);
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 1.5rem;
    padding: 2px;
    background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0;
    transition: opacity 400ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  &:hover {
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.12),
      0 12px 32px rgba(0, 0, 0, 0.1),
      0 24px 64px rgba(0, 0, 0, 0.08);
    transform: translateY(-8px);
    border-color: rgba(99, 102, 241, 0.2);

    [data-theme="dark"] & {
      box-shadow:
        0 4px 16px rgba(0, 0, 0, 0.4),
        0 12px 32px rgba(0, 0, 0, 0.3),
        0 24px 64px rgba(0, 0, 0, 0.2);
      border-color: rgba(99, 102, 241, 0.4);
    }

    &::after {
      opacity: 1;
    }
  }
`;

const ActionCardImage = styled.div<{ $imageUrl?: string }>`
  width: 100%;
  height: 200px;
  background: ${props => props.$imageUrl ? `url(${props.$imageUrl})` : 'var(--color-background-secondary)'};
  background-size: cover;
  background-position: center;
  overflow: hidden;
  transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 0.75rem 0.75rem 0 0;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 100%);
  }

  [data-theme="dark"] &::after {
    background: linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.5) 100%);
  }
`;

const CardBody = styled.div`
  padding: 1.5rem;
`;

const VenueName = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
  letter-spacing: -0.015em;
  line-height: 1.3;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const VenueCategory = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 1rem;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const ActivityContainer = styled.div`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 2.5rem;

  [data-theme="dark"] & {
    background: #1f2937;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
`;

const ActivityList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const ActivityItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.5rem;

  [data-theme="dark"] & {
    background: #111827;
  }
`;

const ActivityContent = styled.div``;

const ActivityTitle = styled.div`
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.25rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const ActivityMeta = styled.div`
  font-size: 0.875rem;
  color: #6b7280;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

/* ── Consumer-only styled components ── */

const CtaCard = styled(motion.div)`
  background: linear-gradient(135deg, #111827 0%, #4f46e5 100%);
  border-radius: 1.5rem;
  padding: 2rem 2.5rem;
  margin-bottom: 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const CtaContent = styled.div``;

const CtaTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 800;
  color: white;
  margin-bottom: 0.375rem;
  letter-spacing: -0.02em;
`;

const CtaDesc = styled.p`
  font-size: 0.9375rem;
  color: rgba(255, 255, 255, 0.75);
`;

const CashbackGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 2rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const SubscriptionCard = styled(motion.div)`
  background: white;
  border-radius: 1.5rem;
  border: 1px solid rgba(0, 0, 0, 0.06);
  padding: 1.75rem 2rem;
  margin-bottom: 2.5rem;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.06),
    0 8px 24px rgba(0, 0, 0, 0.04);

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: rgba(255, 255, 255, 0.1);
  }
`;

const SubscriptionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
`;

const SubscriptionMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
`;

const SubscriptionMetaLabel = styled.span`
  font-size: 0.8rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.07em;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const SubscriptionMetaValue = styled.span`
  font-size: 0.9375rem;
  font-weight: 600;
  color: #111827;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const PlanBadge = styled.span<{ $plan: string }>`
  display: inline-flex;
  align-items: center;
  padding: 0.4rem 1rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  background: ${({ $plan }) => {
    if ($plan === 'PREMIUM') return 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)';
    if ($plan === 'BASIC') return 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)';
    return 'linear-gradient(135deg, #374151 0%, #6b7280 100%)';
  }};
  color: white;
`;

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: ${({ $status }) => {
    if ($status === 'APPROVED') return '#d1fae5';
    if ($status === 'PENDING') return '#fef3c7';
    if ($status === 'MANUAL_REVIEW') return '#dbeafe';
    if ($status === 'REJECTED') return '#fee2e2';
    return '#f3f4f6';
  }};
  color: ${({ $status }) => {
    if ($status === 'APPROVED') return '#065f46';
    if ($status === 'PENDING') return '#92400e';
    if ($status === 'MANUAL_REVIEW') return '#1e40af';
    if ($status === 'REJECTED') return '#991b1b';
    return '#374151';
  }};

  [data-theme="dark"] & {
    background: ${({ $status }) => {
      if ($status === 'APPROVED') return 'rgba(16, 185, 129, 0.2)';
      if ($status === 'PENDING') return 'rgba(245, 158, 11, 0.2)';
      if ($status === 'MANUAL_REVIEW') return 'rgba(59, 130, 246, 0.2)';
      if ($status === 'REJECTED') return 'rgba(239, 68, 68, 0.2)';
      return 'rgba(107, 114, 128, 0.2)';
    }};
    color: ${({ $status }) => {
      if ($status === 'APPROVED') return '#34d399';
      if ($status === 'PENDING') return '#fcd34d';
      if ($status === 'MANUAL_REVIEW') return '#93c5fd';
      if ($status === 'REJECTED') return '#fca5a5';
      return '#d1d5db';
    }};
  }
`;

const TransactionRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.5rem;
  gap: 1rem;

  [data-theme="dark"] & {
    background: #111827;
  }
`;

const TransactionInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const TransactionMerchant = styled.div`
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const TransactionDate = styled.div`
  font-size: 0.8125rem;
  color: #6b7280;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const TransactionAmount = styled.div`
  font-size: 1rem;
  font-weight: 700;
  color: #10b981;
  white-space: nowrap;

  [data-theme="dark"] & {
    color: #34d399;
  }
`;

const UpgradeBanner = styled(motion.div)`
  background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
  border-radius: 1.5rem;
  padding: 1.75rem 2rem;
  margin-top: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const UpgradeBannerContent = styled.div``;

const UpgradeBannerTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 700;
  color: white;
  margin-bottom: 0.25rem;
`;

const UpgradeBannerDesc = styled.p`
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.8);
`;

const EmptyMessage = styled.p`
  text-align: center;
  color: #6b7280;
  font-size: 0.9375rem;
  padding: 1.5rem 0;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

/* ── Types ── */

interface DashboardReceipt {
  id: string;
  merchantName: string;
  totalAmount: number;
  cashbackAmount: number;
  status: string;
  createdAt: string;
}

interface DashboardSubscription {
  plan: string;
  status: string;
  currentPeriodEnd?: string;
}

interface DashboardWallet {
  availableBalance: number;
  pendingBalance: number;
}

interface DashboardData {
  subscription: DashboardSubscription;
  wallet: DashboardWallet;
  receipts: DashboardReceipt[];
}

/* ── Component ── */

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { language, t } = useLanguage();

  const isPartner = user?.role === 'partner' || user?.role === 'admin';

  // Partner data
  const { data: partnerData, isLoading: isLoadingPartner, isError: isPartnerError } = useCurrentPartner();
  const { data: stats, isLoading: isLoadingStats, isError: isStatsError } = usePartnerStats(partnerData?.id);
  const { data: offersResponse, isLoading: isLoadingOffers, isError: isOffersError } = useOffers({
    partnerId: partnerData?.id,
    limit: 10,
    active: true
  });

  const fallbackStats = {
    activeOffers: 0,
    totalOffers: 0,
    totalRedemptions: 0,
    monthlyRedemptions: 0,
    revenue: 0,
    averageRating: 0,
    totalReviews: 0,
    totalVenues: 0,
  };

  const displayStats = stats || (isStatsError || isPartnerError ? fallbackStats : null);

  const isLoading = (isLoadingPartner && !isPartnerError) ||
                    (isLoadingStats && !isStatsError && !!partnerData?.id) ||
                    (isLoadingOffers && !isOffersError && !!partnerData?.id);

  // Consumer dashboard data
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);

  useEffect(() => {
    if (isPartner) return;
    setIsLoadingDashboard(true);
    apiService.get<DashboardData>('/dashboard/me')
      .then(data => setDashboardData(data))
      .catch(() => { /* fail silently — show zeros */ })
      .finally(() => setIsLoadingDashboard(false));
  }, [isPartner]);

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number) =>
    `${amount.toFixed(2)} лв`;

  const statusLabel = (status: string) => {
    const map: Record<string, { en: string; bg: string }> = {
      APPROVED:      { en: t('dashboard.statusApproved'), bg: t('dashboard.statusApproved') },
      PENDING:       { en: t('dashboard.statusPending'),  bg: t('dashboard.statusPending') },
      MANUAL_REVIEW: { en: t('dashboard.statusReview'),   bg: t('dashboard.statusReview') },
      REJECTED:      { en: t('dashboard.statusRejected'), bg: t('dashboard.statusRejected') },
    };
    return map[status]?.[language === 'bg' ? 'bg' : 'en'] ?? status;
  };

  const showUpgradeBanner =
    dashboardData?.subscription.plan === 'LIGHT' ||
    dashboardData?.subscription.plan === 'BASIC';

  return (
    <PageContainer>
      <PageHeader>
        <Title>
          {t('dashboard.greeting')}, {user?.firstName}!
        </Title>
        <Subtitle>
          {isPartner ? 'Manage your business and track performance' : t('dashboard.subtitle')}
        </Subtitle>
      </PageHeader>

      {/* Partner Dashboard */}
      {isPartner ? (
        <>
          <StatsGrid>
            <StatCard
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <StatLabel>Active Offers</StatLabel>
              <StatValue>{isLoading ? '...' : displayStats?.activeOffers || 0}</StatValue>
              <StatChange $positive>
                {displayStats?.totalOffers || 0} total
              </StatChange>
            </StatCard>

            <StatCard
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <StatLabel>Total Redemptions</StatLabel>
              <StatValue>{isLoading ? '...' : (displayStats?.totalRedemptions || 0).toLocaleString()}</StatValue>
              <StatChange $positive>
                {displayStats?.monthlyRedemptions || 0} this month
              </StatChange>
            </StatCard>

            <StatCard
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <StatLabel>Revenue Generated</StatLabel>
              <StatValue>{isLoading ? '...' : `${(displayStats?.revenue || 0).toLocaleString()} лв`}</StatValue>
              <StatChange $positive>
                From all offers
              </StatChange>
            </StatCard>

            <StatCard
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
            >
              <StatLabel>Customer Rating</StatLabel>
              <StatValue>{isLoading ? '...' : `${displayStats?.averageRating || 0} ⭐`}</StatValue>
              <StatChange>
                Based on {displayStats?.totalReviews || 0} reviews
              </StatChange>
            </StatCard>
          </StatsGrid>

          <SectionHeader>
            <SectionTitle>Quick Actions</SectionTitle>
          </SectionHeader>

          <CardsGrid>
            <BoomCardItem
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => window.location.href = '/partners/offers'}
              style={{ cursor: 'pointer' }}
            >
              <ActionCardImage $imageUrl="https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&h=400&fit=crop" />
              <CardBody>
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  <VenueName>Manage Offers</VenueName>
                  <VenueCategory>View, edit, and create new offers</VenueCategory>
                  <div style={{ marginTop: '1rem' }}>
                    <Button variant="primary" size="medium">Go to Offers</Button>
                  </div>
                </div>
              </CardBody>
            </BoomCardItem>

            <BoomCardItem
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              onClick={() => window.location.href = '/analytics'}
              style={{ cursor: 'pointer' }}
            >
              <ActionCardImage $imageUrl="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=400&fit=crop" />
              <CardBody>
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  <VenueName>View Analytics</VenueName>
                  <VenueCategory>Track performance and insights</VenueCategory>
                  <div style={{ marginTop: '1rem' }}>
                    <Button variant="primary" size="medium">View Analytics</Button>
                  </div>
                </div>
              </CardBody>
            </BoomCardItem>

            <BoomCardItem
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              onClick={() => window.location.href = '/profile'}
              style={{ cursor: 'pointer' }}
            >
              <ActionCardImage $imageUrl="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&h=400&fit=crop" />
              <CardBody>
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  <VenueName>Business Profile</VenueName>
                  <VenueCategory>Update your business information</VenueCategory>
                  <div style={{ marginTop: '1rem' }}>
                    <Button variant="primary" size="medium">Edit Profile</Button>
                  </div>
                </div>
              </CardBody>
            </BoomCardItem>
          </CardsGrid>

          <SectionHeader style={{ marginTop: '2rem' }}>
            <SectionTitle>Recent Offer Activity</SectionTitle>
          </SectionHeader>

          <ActivityContainer>
            <ActivityList>
              {[
                { offer: '20% Off All Main Courses', redemptions: 45, time: '2 hours ago' },
                { offer: 'Free Dessert with Any Meal', redemptions: 23, time: '5 hours ago' },
                { offer: 'Summer Special - 30% Off', redemptions: 67, time: 'Yesterday' },
              ].map((activity, index) => (
                <ActivityItem key={index}>
                  <ActivityContent>
                    <ActivityTitle>{activity.offer}</ActivityTitle>
                    <ActivityMeta>{activity.redemptions} redemptions • {activity.time}</ActivityMeta>
                  </ActivityContent>
                  <Button variant="ghost" size="small">View Details</Button>
                </ActivityItem>
              ))}
            </ActivityList>
          </ActivityContainer>
        </>
      ) : (
        <>
          {/* Upload Receipt CTA */}
          <CtaCard
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <CtaContent>
              <CtaTitle>{t('dashboard.uploadReceiptCta')}</CtaTitle>
              <CtaDesc>{t('dashboard.uploadReceiptCtaDesc')}</CtaDesc>
            </CtaContent>
            <Link to="/upload-receipt">
              <Button variant="secondary" size="large">
                {t('dashboard.uploadReceiptCta')}
              </Button>
            </Link>
          </CtaCard>

          {/* Cashback Balances */}
          <CashbackGrid>
            <StatCard
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
            >
              <StatLabel>{t('dashboard.cashbackAvailable')}</StatLabel>
              <StatValue>
                {isLoadingDashboard ? '...' : formatCurrency(dashboardData?.wallet.availableBalance ?? 0)}
              </StatValue>
              <StatChange $positive>{t('dashboard.readyToClaim')}</StatChange>
            </StatCard>

            <StatCard
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <StatLabel>{t('dashboard.cashbackPending')}</StatLabel>
              <StatValue>
                {isLoadingDashboard ? '...' : formatCurrency(dashboardData?.wallet.pendingBalance ?? 0)}
              </StatValue>
              <StatChange>{t('dashboard.awaitingApproval')}</StatChange>
            </StatCard>
          </CashbackGrid>

          {/* Subscription Status */}
          <SectionHeader>
            <SectionTitle>{t('dashboard.subscriptionPlan')}</SectionTitle>
          </SectionHeader>

          <SubscriptionCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            <SubscriptionHeader>
              <PlanBadge $plan={dashboardData?.subscription.plan ?? 'LIGHT'}>
                {isLoadingDashboard ? '...' : (dashboardData?.subscription.plan ?? 'LIGHT')}
              </PlanBadge>
              <StatusBadge $status={dashboardData?.subscription.status ?? 'ACTIVE'}>
                {isLoadingDashboard ? '...' : (dashboardData?.subscription.status ?? 'ACTIVE')}
              </StatusBadge>
            </SubscriptionHeader>

            {dashboardData?.subscription.currentPeriodEnd && (
              <SubscriptionMeta>
                <SubscriptionMetaLabel>
                  {t('dashboard.nextBilling')}
                </SubscriptionMetaLabel>
                <SubscriptionMetaValue>
                  {formatDate(dashboardData.subscription.currentPeriodEnd)}
                </SubscriptionMetaValue>
              </SubscriptionMeta>
            )}
          </SubscriptionCard>

          {/* Recent Transactions */}
          <SectionHeader>
            <SectionTitle>{t('dashboard.recentTransactions')}</SectionTitle>
            <Link to="/receipts">
              <Button variant="ghost" size="small">{t('common.viewAll')}</Button>
            </Link>
          </SectionHeader>

          <ActivityContainer>
            {isLoadingDashboard ? (
              <EmptyMessage>...</EmptyMessage>
            ) : dashboardData?.receipts.length ? (
              <ActivityList>
                {dashboardData.receipts.map((receipt, index) => (
                  <TransactionRow key={receipt.id}
                    as={motion.div}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: index * 0.06 }}
                  >
                    <TransactionInfo>
                      <TransactionMerchant>{receipt.merchantName}</TransactionMerchant>
                      <TransactionDate>{formatDate(receipt.createdAt)}</TransactionDate>
                    </TransactionInfo>
                    <StatusBadge $status={receipt.status}>
                      {statusLabel(receipt.status)}
                    </StatusBadge>
                    <TransactionAmount>
                      +{formatCurrency(receipt.cashbackAmount)}
                    </TransactionAmount>
                  </TransactionRow>
                ))}
              </ActivityList>
            ) : (
              <EmptyMessage>{t('dashboard.noTransactions')}</EmptyMessage>
            )}
          </ActivityContainer>

          {/* Upgrade Banner */}
          {showUpgradeBanner && (
            <UpgradeBanner
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.2 }}
            >
              <UpgradeBannerContent>
                <UpgradeBannerTitle>{t('dashboard.upgradeTitle')}</UpgradeBannerTitle>
                <UpgradeBannerDesc>{t('dashboard.upgradeDesc')}</UpgradeBannerDesc>
              </UpgradeBannerContent>
              <Link to="/subscription">
                <Button variant="secondary" size="medium">{t('dashboard.upgradeBtn')}</Button>
              </Link>
            </UpgradeBanner>
          )}
        </>
      )}
    </PageContainer>
  );
};

export default DashboardPage;
