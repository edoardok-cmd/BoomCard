import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Button from '../components/common/Button/Button';
import QRCode from '../components/common/QRCode/QRCode';
import { useCurrentPartner, usePartnerStats } from '../hooks/usePartners';
import { useOffers } from '../hooks/useOffers';
import { ReceiptAnalyticsWidget } from '../components/widgets';

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

const CardHeader = styled.div`
  position: relative;
  height: 12rem;
  background: linear-gradient(135deg, #111827 0%, #374151 100%);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

const CardLogo = styled.div`
  width: 3rem;
  height: 3rem;
  background: white;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #111827;

  [data-theme="dark"] & {
    background: #f9fafb;
    color: #111827;
  }
`;

const CardType = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const CardTypeBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  backdrop-filter: blur(10px);
`;

const CardNumber = styled.div`
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
  letter-spacing: 0.1em;
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

const CardMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;

  [data-theme="dark"] & {
    border-top-color: #374151;
  }
`;

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.875rem;
`;

const MetaLabel = styled.span`
  color: #6b7280;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const MetaValue = styled.span`
  font-weight: 600;
  color: #111827;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const CardActions = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
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

const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  background: white;
  border-radius: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const EmptyIcon = styled.div`
  width: 5rem;
  height: 5rem;
  margin: 0 auto 1.5rem;
  background: #f3f4f6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;

  svg {
    width: 2.5rem;
    height: 2.5rem;
  }
`;

const EmptyTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.5rem;
`;

const EmptyDescription = styled.p`
  font-size: 0.9375rem;
  color: #6b7280;
  margin-bottom: 1.5rem;
`;

const ActivityContainer = styled.div`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

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

interface BoomCard {
  id: string;
  cardNumber: string;
  type: 'premium' | 'standard';
  venueName: string;
  venueNameBg: string;
  category: string;
  categoryBg: string;
  discount: number;
  validUntil: number;
  usageCount: number;
  usageLimit: number;
  status: 'active' | 'expired' | 'suspended';
}

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const [selectedCard, setSelectedCard] = useState<string | null>(null);

  // Check if user is a partner or admin
  const isPartner = user?.role === 'partner' || user?.role === 'admin';

  // Fetch real partner data
  const { data: partnerData, isLoading: isLoadingPartner } = useCurrentPartner();
  const { data: stats, isLoading: isLoadingStats } = usePartnerStats(partnerData?.id);
  const { data: offersResponse, isLoading: isLoadingOffers } = useOffers({
    partnerId: partnerData?.id,
    limit: 10,
    active: true
  });

  // Map API data to BoomCards format
  const boomCards: BoomCard[] = useMemo(() => {
    if (!offersResponse?.data) return [];

    const now = new Date().getTime();
    return offersResponse.data.map((offer, index) => ({
      id: offer.id,
      cardNumber: `BC-2024-${String(index + 1).padStart(6, '0')}`,
      type: offer.isFeatured ? 'premium' : 'standard',
      venueName: offer.title,
      venueNameBg: offer.titleBg || offer.title,
      category: offer.category,
      categoryBg: offer.categoryBg || offer.category,
      discount: offer.discount,
      validUntil: offer.validUntil ? new Date(offer.validUntil).getTime() : now + 90 * 24 * 60 * 60 * 1000,
      usageCount: offer.currentRedemptions || 0,
      usageLimit: offer.maxRedemptions || 100,
      status: (offer.isActive ? 'active' : 'suspended') as 'active' | 'expired' | 'suspended',
    }));
  }, [offersResponse]);

  const activeCards = boomCards.filter(card => card.status === 'active');
  const totalSavings = stats?.revenue || 0;
  const totalUsage = stats?.totalRedemptions || 0;

  const isLoading = isLoadingPartner || isLoadingStats || isLoadingOffers;

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getDaysRemaining = useMemo(() => {
    return (timestamp: number) => {
      const now = Date.now();
      const diff = timestamp - now;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      return days;
    };
  }, []);

  return (
    <PageContainer>
      <PageHeader>
        <Title>
          {t('dashboard.greeting')}, {user?.firstName}! 👋
        </Title>
        <Subtitle>
          {isPartner ? 'Manage your business and track performance' : t('dashboard.subtitle')}
        </Subtitle>
      </PageHeader>

      {/* Partner Dashboard */}
      {isPartner ? (
        <>
          {/* Partner Stats */}
          <StatsGrid>
            <StatCard
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <StatLabel>Active Offers</StatLabel>
              <StatValue>{isLoading ? '...' : stats?.activeOffers || 0}</StatValue>
              <StatChange $positive>
                {stats?.totalOffers || 0} total
              </StatChange>
            </StatCard>

            <StatCard
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <StatLabel>Total Redemptions</StatLabel>
              <StatValue>{isLoading ? '...' : (stats?.totalRedemptions || 0).toLocaleString()}</StatValue>
              <StatChange $positive>
                {stats?.monthlyRedemptions || 0} this month
              </StatChange>
            </StatCard>

            <StatCard
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <StatLabel>Revenue Generated</StatLabel>
              <StatValue>{isLoading ? '...' : `${(stats?.revenue || 0).toLocaleString()} лв`}</StatValue>
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
              <StatValue>{isLoading ? '...' : `${stats?.averageRating || 0} ⭐`}</StatValue>
              <StatChange>
                Based on {stats?.totalReviews || 0} reviews
              </StatChange>
            </StatCard>
          </StatsGrid>

          {/* Partner Quick Actions */}
          <SectionHeader>
            <SectionTitle>
              Quick Actions
            </SectionTitle>
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
                    <Button variant="primary" size="medium">
                      Go to Offers
                    </Button>
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
                    <Button variant="primary" size="medium">
                      View Analytics
                    </Button>
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
                    <Button variant="primary" size="medium">
                      Edit Profile
                    </Button>
                  </div>
                </div>
              </CardBody>
            </BoomCardItem>
          </CardsGrid>

          {/* Recent Activity */}
          <SectionHeader style={{ marginTop: '2rem' }}>
            <SectionTitle>
              Recent Offer Activity
            </SectionTitle>
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
                  <Button variant="ghost" size="small">
                    View Details
                  </Button>
                </ActivityItem>
              ))}
            </ActivityList>
          </ActivityContainer>
        </>
      ) : (
        <>
          {/* User Dashboard - Original Stats */}
          <StatsGrid>
        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <StatLabel>{t('dashboard.activeCards')}</StatLabel>
          <StatValue>{activeCards.length}</StatValue>
          <StatChange $positive>
            {t('dashboard.readyToUse')}
          </StatChange>
        </StatCard>

        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <StatLabel>{t('dashboard.totalSavings')}</StatLabel>
          <StatValue>{totalSavings} лв</StatValue>
          <StatChange $positive>
            {t('dashboard.thisMonth')}
          </StatChange>
        </StatCard>

        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <StatLabel>{t('dashboard.totalUses')}</StatLabel>
          <StatValue>{totalUsage}</StatValue>
          <StatChange>
            {t('dashboard.acrossAllCards')}
          </StatChange>
        </StatCard>
      </StatsGrid>

      {/* Receipt Analytics Widget */}
      <div style={{ marginBottom: '2.5rem' }}>
        <ReceiptAnalyticsWidget />
      </div>

      {/* Cards Section */}
      <SectionHeader>
        <SectionTitle>
          {t('dashboard.myCards')}
        </SectionTitle>
        <Button variant="primary" size="medium">
          {t('dashboard.addCard')}
        </Button>
      </SectionHeader>

      {activeCards.length > 0 ? (
        <CardsGrid>
          {activeCards.map((card, index) => (
            <BoomCardItem
              key={card.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <CardHeader>
                <CardType>
                  <CardLogo>BC</CardLogo>
                  <CardTypeBadge>
                    {card.type === 'premium'
                      ? t('dashboard.premium')
                      : t('dashboard.standard')}
                  </CardTypeBadge>
                </CardType>
                <CardNumber>{card.cardNumber}</CardNumber>
              </CardHeader>

              <CardBody>
                <VenueName>
                  {language === 'bg' ? card.venueNameBg : card.venueName}
                </VenueName>
                <VenueCategory>
                  {language === 'bg' ? card.categoryBg : card.category}
                </VenueCategory>

                <CardMeta>
                  <MetaRow>
                    <MetaLabel>
                      {t('dashboard.discount')}
                    </MetaLabel>
                    <MetaValue>{card.discount}%</MetaValue>
                  </MetaRow>
                  <MetaRow>
                    <MetaLabel>
                      {t('dashboard.uses')}
                    </MetaLabel>
                    <MetaValue>
                      {card.usageCount} / {card.usageLimit}
                    </MetaValue>
                  </MetaRow>
                  <MetaRow>
                    <MetaLabel>
                      {t('dashboard.validUntil')}
                    </MetaLabel>
                    <MetaValue>{formatDate(card.validUntil)}</MetaValue>
                  </MetaRow>
                  <MetaRow>
                    <MetaLabel>
                      {t('dashboard.daysLeft')}
                    </MetaLabel>
                    <MetaValue
                      style={{
                        color: getDaysRemaining(card.validUntil) < 30 ? '#ef4444' : '#10b981'
                      }}
                    >
                      {getDaysRemaining(card.validUntil)}
                    </MetaValue>
                  </MetaRow>
                </CardMeta>

                <CardActions>
                  <div style={{ flex: 1 }}>
                    <Button
                      variant="primary"
                      size="small"
                      onClick={() => setSelectedCard(card.id)}
                    >
                      {t('dashboard.showQR')}
                    </Button>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Button variant="ghost" size="small">
                      {t('dashboard.details')}
                    </Button>
                  </div>
                </CardActions>
              </CardBody>
            </BoomCardItem>
          ))}
        </CardsGrid>
      ) : (
        <EmptyState>
          <EmptyIcon>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
          </EmptyIcon>
          <EmptyTitle>
            {t('dashboard.noActiveCards')}
          </EmptyTitle>
          <EmptyDescription>
            {t('dashboard.noActiveCardsDescription')}
          </EmptyDescription>
          <Button variant="primary" size="large">
            {t('home.browseOffers')}
          </Button>
        </EmptyState>
      )}
        </>
      )}

      {/* QR Code Modal - Only for users, not partners */}
      {!isPartner && (
      <AnimatePresence>
        {selectedCard && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedCard(null)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                zIndex: 50,
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'white',
                borderRadius: '1rem',
                padding: '2rem',
                zIndex: 51,
                maxWidth: '90%',
                width: '24rem',
              }}
            >
              {(() => {
                const card = activeCards.find(c => c.id === selectedCard);
                if (!card) return null;
                return (
                  <>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', textAlign: 'center' }}>
                      {language === 'bg' ? card.venueNameBg : card.venueName}
                    </h3>
                    <QRCode
                      data={`https://boomcard.bg/redeem/${card.cardNumber}`}
                      size={256}
                      title={t('dashboard.showAtCheckout')}
                      downloadable
                    />
                    <div style={{ marginTop: '1rem', width: '100%' }}>
                      <Button
                        variant="ghost"
                        size="large"
                        onClick={() => setSelectedCard(null)}
                      >
                        {t('common.close')}
                      </Button>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      )}
    </PageContainer>
  );
};

export default DashboardPage;
