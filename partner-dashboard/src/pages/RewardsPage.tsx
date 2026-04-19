import React, { useState } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { useLanguage } from '../contexts/LanguageContext';
import {
  Gift,
  Award,
  TrendingUp,
  Clock,
  Star,
  Zap,
  Crown,
  CheckCircle,
  Lock,
  ArrowRight,
  Calendar,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import Button from '../components/common/Button/Button';
import toast from 'react-hot-toast';

const content = {
  en: {
    title: 'Loyalty Rewards',
    subtitle: 'Earn points with every purchase and unlock exclusive rewards',
    myPoints: 'My Points',
    pointsBalance: 'Points Balance',
    nextReward: 'Next Reward',
    pointsAway: 'points away',
    earnMore: 'Earn More Points',
    redeemRewards: 'Redeem Rewards',
    howItWorks: 'How It Works',
    pointsHistory: 'Points History',
    availableRewards: 'Available Rewards',
    lockedRewards: 'Locked Rewards',
    tiers: {
      bronze: 'Bronze',
      silver: 'Silver',
      gold: 'Gold',
      platinum: 'Platinum',
    },
    tierBenefits: {
      bronze: 'Earn 1 point per BGN/EUR spent',
      silver: 'Earn 1.5 points per BGN/EUR spent + 5% bonus',
      gold: 'Earn 2 points per BGN/EUR spent + 10% bonus',
      platinum: 'Earn 3 points per BGN/EUR spent + 20% bonus',
    },
    currentTier: 'Current Tier',
    nextTier: 'Next Tier',
    progress: 'Progress',
    howToEarn: {
      title: 'How to Earn Points',
      purchase: 'Make a Purchase',
      purchaseDesc: 'Earn 1 point for every BGN/EUR spent',
      review: 'Write a Review',
      reviewDesc: 'Get 50 bonus points',
      referral: 'Refer a Friend',
      referralDesc: 'Earn 100 points per referral',
      birthday: 'Birthday Bonus',
      birthdayDesc: 'Get 200 points on your birthday',
    },
    rewardTypes: {
      discount: 'Discount Voucher',
      freeItem: 'Free Item',
      upgrade: 'Tier Upgrade',
      exclusive: 'Exclusive Access',
    },
    redeem: 'Redeem',
    redeemed: 'Redeemed',
    locked: 'Locked',
    points: 'points',
    expiresIn: 'Expires in',
    days: 'days',
    activity: {
      earned: 'Earned',
      redeemed: 'Redeemed',
      expired: 'Expired',
      bonus: 'Bonus',
    },
    noHistory: 'No points history yet',
    startEarning: 'Start making purchases to earn points',
    confirmRedeem: 'Are you sure you want to redeem this reward?',
    redeemSuccess: 'Reward redeemed successfully!',
    insufficientPoints: 'Insufficient points for this reward',
  },
  bg: {
    title: 'Програма за Лоялност',
    subtitle: 'Спечелете точки с всяка покупка и отключете ексклузивни награди',
    myPoints: 'Моите Точки',
    pointsBalance: 'Баланс Точки',
    nextReward: 'Следваща Награда',
    pointsAway: 'точки остават',
    earnMore: 'Спечелете Още',
    redeemRewards: 'Използвай Награди',
    howItWorks: 'Как Работи',
    pointsHistory: 'История на Точките',
    availableRewards: 'Налични Награди',
    lockedRewards: 'Заключени Награди',
    tiers: {
      bronze: 'Бронз',
      silver: 'Сребро',
      gold: 'Злато',
      platinum: 'Платина',
    },
    tierBenefits: {
      bronze: 'Спечелете 1 точка на лв./EUR',
      silver: 'Спечелете 1.5 точки на лв./EUR + 5% бонус',
      gold: 'Спечелете 2 точки на лв./EUR + 10% бонус',
      platinum: 'Спечелете 3 точки на лв./EUR + 20% бонус',
    },
    currentTier: 'Текущо Ниво',
    nextTier: 'Следващо Ниво',
    progress: 'Прогрес',
    howToEarn: {
      title: 'Как да Спечелите Точки',
      purchase: 'Направете Покупка',
      purchaseDesc: 'Спечелете 1 точка за всеки лв./EUR',
      review: 'Напишете Отзив',
      reviewDesc: 'Получете 50 бонус точки',
      referral: 'Поканете Приятел',
      referralDesc: 'Спечелете 100 точки на покана',
      birthday: 'Рожден Ден Бонус',
      birthdayDesc: 'Получете 200 точки на рождения си ден',
    },
    rewardTypes: {
      discount: 'Ваучер за Отстъпка',
      freeItem: 'Безплатен Продукт',
      upgrade: 'Повишение',
      exclusive: 'Ексклузивен Достъп',
    },
    redeem: 'Използвай',
    redeemed: 'Използвана',
    locked: 'Заключена',
    points: 'точки',
    expiresIn: 'Изтича след',
    days: 'дни',
    activity: {
      earned: 'Спечелени',
      redeemed: 'Използвани',
      expired: 'Изтекли',
      bonus: 'Бонус',
    },
    noHistory: 'Все още няма история',
    startEarning: 'Започнете да правите покупки за да спечелите точки',
    confirmRedeem: 'Сигурни ли сте, че искате да използвате тази награда?',
    redeemSuccess: 'Наградата е използвана успешно!',
    insufficientPoints: 'Недостатъчно точки за тази награда',
  },
};

interface PointsActivity {
  id: string;
  type: 'earned' | 'redeemed' | 'expired' | 'bonus';
  amount: number;
  description: string;
  date: string;
  relatedTo?: string;
}

interface Reward {
  id: string;
  title: string;
  description: string;
  type: 'discount' | 'freeItem' | 'upgrade' | 'exclusive';
  pointsCost: number;
  icon: string;
  image?: string;
  isRedeemed?: boolean;
  expiresIn?: number; // days
}

const RewardsPage: React.FC = () => {
  const { language } = useLanguage();
  const t = content[language as keyof typeof content];

  // Mock data
  const [pointsBalance, setPointsBalance] = useState(1250);
  const [currentTier] = useState<'bronze' | 'silver' | 'gold' | 'platinum'>('silver');
  const [tierProgress] = useState(65); // Percentage to next tier

  const [pointsHistory, setPointsHistory] = useState<PointsActivity[]>([
    {
      id: '1',
      type: 'earned',
      amount: 85,
      description: 'Purchase at The Capital Grill',
      date: '2025-10-10',
      relatedTo: 'order-123',
    },
    {
      id: '2',
      type: 'bonus',
      amount: 50,
      description: 'Review posted for Sofia Grand Hotel',
      date: '2025-10-09',
      relatedTo: 'review-456',
    },
    {
      id: '3',
      type: 'redeemed',
      amount: -500,
      description: '20% Discount Voucher',
      date: '2025-10-08',
      relatedTo: 'reward-789',
    },
    {
      id: '4',
      type: 'earned',
      amount: 120,
      description: 'Purchase at Relax SPA Center',
      date: '2025-10-05',
      relatedTo: 'order-124',
    },
    {
      id: '5',
      type: 'bonus',
      amount: 100,
      description: 'Friend referral bonus',
      date: '2025-10-01',
      relatedTo: 'referral-001',
    },
  ]);

  const [rewards, setRewards] = useState<Reward[]>([
    {
      id: '1',
      title: '10% Off Next Purchase',
      description: 'Get 10% discount on your next order',
      type: 'discount',
      pointsCost: 250,
      icon: '🎁',
      image: 'https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?w=800&auto=format&fit=crop',
      expiresIn: 30,
    },
    {
      id: '2',
      title: 'Free Coffee',
      description: 'Complimentary coffee at partner cafes',
      type: 'freeItem',
      pointsCost: 150,
      icon: '☕',
      image: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=800&auto=format&fit=crop',
      expiresIn: 15,
    },
    {
      id: '3',
      title: '20% Off Next Purchase',
      description: 'Get 20% discount on your next order',
      type: 'discount',
      pointsCost: 500,
      icon: '💎',
      image: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&auto=format&fit=crop',
      expiresIn: 30,
    },
    {
      id: '4',
      title: 'Tier Upgrade to Gold',
      description: 'Instant upgrade to Gold tier for 3 months',
      type: 'upgrade',
      pointsCost: 1000,
      icon: '👑',
      image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop',
      expiresIn: 60,
    },
    {
      id: '5',
      title: 'Free Dessert',
      description: 'Free dessert at select restaurants',
      type: 'freeItem',
      pointsCost: 300,
      icon: '🍰',
      image: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=800&auto=format&fit=crop',
      expiresIn: 20,
    },
    {
      id: '6',
      title: 'VIP Event Access',
      description: 'Exclusive access to partner events',
      type: 'exclusive',
      pointsCost: 2000,
      icon: '🎟️',
      image: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop',
      expiresIn: 90,
    },
  ]);

  const tierThresholds = {
    bronze: 0,
    silver: 500,
    gold: 2000,
    platinum: 5000,
  };

  const nextTierName = currentTier === 'bronze' ? 'silver' : currentTier === 'silver' ? 'gold' : currentTier === 'gold' ? 'platinum' : null;
  const pointsToNextTier = nextTierName ? tierThresholds[nextTierName] - pointsBalance : 0;

  const availableRewards = rewards.filter(r => r.pointsCost <= pointsBalance && !r.isRedeemed);
  const lockedRewards = rewards.filter(r => r.pointsCost > pointsBalance && !r.isRedeemed);

  const handleRedeemReward = (reward: Reward) => {
    if (reward.pointsCost > pointsBalance) {
      toast.error(t.insufficientPoints);
      return;
    }

    if (window.confirm(t.confirmRedeem)) {
      const timestamp = Date.now();
      setPointsBalance(prev => prev - reward.pointsCost);
      setRewards(prev =>
        prev.map(r => (r.id === reward.id ? { ...r, isRedeemed: true } : r))
      );

      const newActivity: PointsActivity = {
        id: timestamp.toString(),
        type: 'redeemed',
        amount: -reward.pointsCost,
        description: reward.title,
        date: new Date(timestamp).toISOString().split('T')[0],
        relatedTo: reward.id,
      };

      setPointsHistory(prev => [newActivity, ...prev]);
      toast.success(t.redeemSuccess);
    }
  };

  const getActivityIcon = (type: PointsActivity['type']) => {
    switch (type) {
      case 'earned':
        return <TrendingUp size={16} />;
      case 'redeemed':
        return <Gift size={16} />;
      case 'expired':
        return <Clock size={16} />;
      case 'bonus':
        return <Zap size={16} />;
    }
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'bronze':
        return <Award size={24} color="#cd7f32" />;
      case 'silver':
        return <Award size={24} color="#c0c0c0" />;
      case 'gold':
        return <Award size={24} color="#ffd700" />;
      case 'platinum':
        return <Crown size={24} color="#e5e4e2" />;
      default:
        return <Award size={24} />;
    }
  };

  return (
    <Container>
      <Header>
        <HeaderContent>
          <Title>{t.title}</Title>
          <Subtitle>{t.subtitle}</Subtitle>
        </HeaderContent>
      </Header>

      {/* Points Overview */}
      <PointsOverview>
        <PointsCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <PointsIcon>
            <Sparkles size={32} />
          </PointsIcon>
          <PointsContent>
            <PointsLabel>{t.pointsBalance}</PointsLabel>
            <PointsValue>{pointsBalance.toLocaleString()}</PointsValue>
            <PointsSubtext>{t.myPoints}</PointsSubtext>
          </PointsContent>
        </PointsCard>

        <TierCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <TierHeader>
            <div>
              <TierLabel>{t.currentTier}</TierLabel>
              <TierName tier={currentTier}>
                {getTierIcon(currentTier)}
                {t.tiers[currentTier]}
              </TierName>
            </div>
            {nextTierName && (
              <div style={{ textAlign: 'right' }}>
                <TierLabel>{t.nextTier}</TierLabel>
                <TierName tier={nextTierName}>
                  {getTierIcon(nextTierName)}
                  {t.tiers[nextTierName]}
                </TierName>
              </div>
            )}
          </TierHeader>

          {nextTierName && (
            <>
              <ProgressBar>
                <ProgressFill
                  progress={tierProgress}
                  initial={{ width: 0 }}
                  animate={{ width: `${tierProgress}%` }}
                  transition={{ duration: 1, delay: 0.3 }}
                />
              </ProgressBar>
              <ProgressText>
                {pointsToNextTier} {t.pointsAway}
              </ProgressText>
            </>
          )}

          <TierBenefit>{t.tierBenefits[currentTier]}</TierBenefit>
        </TierCard>
      </PointsOverview>

      {/* How to Earn Points */}
      <Section>
        <SectionTitle>{t.howToEarn.title}</SectionTitle>
        <EarnGrid>
          {[
            {
              icon: <ShoppingBag size={24} />,
              title: t.howToEarn.purchase,
              desc: t.howToEarn.purchaseDesc,
            },
            {
              icon: <Star size={24} />,
              title: t.howToEarn.review,
              desc: t.howToEarn.reviewDesc,
            },
            {
              icon: <Gift size={24} />,
              title: t.howToEarn.referral,
              desc: t.howToEarn.referralDesc,
            },
            {
              icon: <Calendar size={24} />,
              title: t.howToEarn.birthday,
              desc: t.howToEarn.birthdayDesc,
            },
          ].map((item, index) => (
            <EarnCard
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * index }}
            >
              <EarnIcon>{item.icon}</EarnIcon>
              <EarnTitle>{item.title}</EarnTitle>
              <EarnDesc>{item.desc}</EarnDesc>
            </EarnCard>
          ))}
        </EarnGrid>
      </Section>

      {/* Available Rewards */}
      <Section>
        <SectionTitle>{t.availableRewards}</SectionTitle>
        {availableRewards.length === 0 ? (
          <EmptyState>
            <EmptyIcon>
              <Lock size={48} />
            </EmptyIcon>
            <EmptyText>No available rewards at the moment</EmptyText>
          </EmptyState>
        ) : (
          <RewardsGrid>
            {availableRewards.map((reward, index) => (
              <RewardCard
                key={reward.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05 * index }}
              >
                <RewardImageContainer>
                  <RewardImage src={reward.image} alt={reward.title} loading="lazy" />
                  <RewardBadge>
                    <Sparkles size={14} />
                    {reward.pointsCost} {t.points}
                  </RewardBadge>
                </RewardImageContainer>

                <RewardContent>
                  <RewardTitle>{reward.title}</RewardTitle>
                  <RewardDesc>{reward.description}</RewardDesc>
                </RewardContent>

                <RewardFooter>
                  {reward.expiresIn && (
                    <RewardExpiry>
                      <Clock size={14} />
                      {t.expiresIn} {reward.expiresIn} {t.days}
                    </RewardExpiry>
                  )}
                  <RewardAction>
                    <Button
                      size="small"
                      onClick={() => handleRedeemReward(reward)}
                      disabled={reward.isRedeemed}
                    >
                      {reward.isRedeemed ? (
                        <>
                          <CheckCircle size={16} /> {t.redeemed}
                        </>
                      ) : (
                        <>
                          {t.redeem} <ArrowRight size={16} />
                        </>
                      )}
                    </Button>
                  </RewardAction>
                </RewardFooter>
              </RewardCard>
            ))}
          </RewardsGrid>
        )}
      </Section>

      {/* Locked Rewards */}
      {lockedRewards.length > 0 && (
        <Section>
          <SectionTitle>{t.lockedRewards}</SectionTitle>
          <RewardsGrid>
            {lockedRewards.map((reward, index) => (
              <RewardCard
                key={reward.id}
                locked
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05 * index }}
              >
                <RewardImageContainer>
                  <RewardImage src={reward.image} alt={reward.title} loading="lazy" style={{ opacity: 0.5 }} />
                  <LockedOverlay>
                    <Lock size={24} />
                  </LockedOverlay>
                  <RewardBadge style={{ opacity: 0.7 }}>
                    <Sparkles size={14} />
                    {reward.pointsCost} {t.points}
                  </RewardBadge>
                </RewardImageContainer>

                <RewardContent>
                  <RewardTitle>{reward.title}</RewardTitle>
                  <RewardDesc>{reward.description}</RewardDesc>
                </RewardContent>

                <RewardFooter style={{ opacity: 0.7 }}>
                  {reward.expiresIn && (
                    <RewardExpiry>
                      <Clock size={14} />
                      {t.expiresIn} {reward.expiresIn} {t.days}
                    </RewardExpiry>
                  )}
                  <RewardCost>
                    <Lock size={16} />
                    {t.locked}
                  </RewardCost>
                </RewardFooter>
              </RewardCard>
            ))}
          </RewardsGrid>
        </Section>
      )}

      {/* Points History */}
      <Section>
        <SectionTitle>{t.pointsHistory}</SectionTitle>
        {pointsHistory.length === 0 ? (
          <EmptyState>
            <EmptyIcon>
              <Clock size={48} />
            </EmptyIcon>
            <EmptyText>{t.noHistory}</EmptyText>
            <EmptySubtext>{t.startEarning}</EmptySubtext>
          </EmptyState>
        ) : (
          <HistoryList>
            {pointsHistory.map((activity, index) => (
              <HistoryItem
                key={activity.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * index }}
              >
                <HistoryIcon type={activity.type}>
                  {getActivityIcon(activity.type)}
                </HistoryIcon>
                <HistoryContent>
                  <HistoryDesc>{activity.description}</HistoryDesc>
                  <HistoryDate>{activity.date}</HistoryDate>
                </HistoryContent>
                <HistoryAmount positive={activity.amount > 0}>
                  {activity.amount > 0 ? '+' : ''}
                  {activity.amount}
                </HistoryAmount>
              </HistoryItem>
            ))}
          </HistoryList>
        )}
      </Section>
    </Container>
  );
};

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
`;

const Header = styled.div`
  margin-bottom: 2rem;
`;

const HeaderContent = styled.div``;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 0.5rem 0;
`;

const Subtitle = styled.p`
  font-size: 1.125rem;
  color: var(--text-secondary);
  margin: 0;
`;

const PointsOverview = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;
`;

const PointsCard = styled(motion.div)`
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 1.5rem;
  padding: 2rem;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);
  color: white;
`;

const PointsIcon = styled.div`
  width: 64px;
  height: 64px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const PointsContent = styled.div`
  flex: 1;
`;

const PointsLabel = styled.div`
  font-size: 0.875rem;
  opacity: 0.9;
  margin-bottom: 0.5rem;
`;

const PointsValue = styled.div`
  font-size: 2.5rem;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 0.25rem;
`;

const PointsSubtext = styled.div`
  font-size: 0.875rem;
  opacity: 0.8;
`;

const TierCard = styled(motion.div)`
  background: var(--color-background);
  border-radius: 1.5rem;
  padding: 2rem;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);

  [data-theme="dark"] & {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  }
`;

const TierHeader = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 1.5rem;
`;

const TierLabel = styled.div`
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.5rem;
`;

const TierName = styled.div<{ tier: string }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 8px;
  background: var(--gray-200);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.5rem;
`;

const ProgressFill = styled(motion.div)<{ progress: number }>`
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  border-radius: 4px;
`;

const ProgressText = styled.div`
  font-size: 0.875rem;
  color: var(--text-secondary);
  text-align: center;
  margin-bottom: 1rem;
`;

const TierBenefit = styled.div`
  background: var(--gray-50);
  padding: 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-primary);
  text-align: center;
`;

const Section = styled.div`
  margin-bottom: 3rem;
`;

const SectionTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 1.5rem 0;
`;

const EarnGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
`;

const EarnCard = styled(motion.div)`
  background: var(--color-background);
  border-radius: 1rem;
  padding: 1.5rem;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.2s;

  [data-theme="dark"] & {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    transform: translateY(-2px);

    [data-theme="dark"] & {
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    }
  }
`;

const EarnIcon = styled.div`
  width: 56px;
  height: 56px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1rem;
`;

const EarnTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 0.5rem 0;
`;

const EarnDesc = styled.p`
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0;
`;

const RewardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
`;

const RewardCard = styled(motion.div)<{ locked?: boolean }>`
  background: var(--color-background);
  border-radius: 1.25rem;
  overflow: hidden;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.05),
    0 4px 12px rgba(0, 0, 0, 0.03),
    0 0 0 1px rgba(0, 0, 0, 0.02);
  position: relative;
  opacity: ${props => (props.locked ? 0.6 : 1)};
  transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  height: 100%;

  [data-theme="dark"] & {
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.3),
      0 4px 12px rgba(0, 0, 0, 0.2),
      0 0 0 1px rgba(0, 0, 0, 0.1);
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 1.25rem;
    padding: 2px;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0;
    transition: opacity 400ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  &:hover {
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.08),
      0 16px 48px rgba(0, 0, 0, 0.06),
      0 0 0 1px rgba(99, 102, 241, 0.1);
    transform: translateY(-8px) scale(1.02);

    [data-theme="dark"] & {
      box-shadow:
        0 8px 24px rgba(0, 0, 0, 0.4),
        0 16px 48px rgba(0, 0, 0, 0.3),
        0 0 0 1px rgba(99, 102, 241, 0.2);
    }

    &::before {
      opacity: 1;
    }
  }
`;

const RewardImageContainer = styled.div`
  position: relative;
  width: 100%;
  padding-top: 66.67%; /* 3:2 aspect ratio */
  overflow: hidden;
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
`;

const RewardImage = styled.img`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 400ms cubic-bezier(0.4, 0, 0.2, 1);

  ${RewardCard}:hover & {
    transform: scale(1.05);
  }
`;

const RewardBadge = styled.div`
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-weight: 700;
  font-size: 0.875rem;
  box-shadow:
    0 4px 16px rgba(102, 126, 234, 0.3),
    0 8px 32px rgba(118, 75, 162, 0.2);
  letter-spacing: -0.01em;
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.1);
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 0.25rem;

  ${RewardCard}:hover & {
    transform: scale(1.05);
    box-shadow:
      0 6px 20px rgba(102, 126, 234, 0.4),
      0 10px 40px rgba(118, 75, 162, 0.3);
  }
`;

const LockedOverlay = styled.div`
  position: absolute;
  top: 1rem;
  left: 1rem;
  width: 48px;
  height: 48px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  z-index: 10;
  backdrop-filter: blur(10px);
`;

const RewardContent = styled.div`
  flex: 1;
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
`;

const RewardTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 0.5rem 0;
`;

const RewardDesc = styled.p`
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0 0 1rem 0;
  line-height: 1.5;
`;

const RewardFooter = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem 1.75rem;
  margin-top: auto;
  margin-left: -1.75rem;
  margin-right: -1.75rem;
  margin-bottom: -1.75rem;
  background: #000000;
  border-top: 2px solid #000000;
`;

const RewardCost = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.125rem;
  font-weight: 700;
  color: #ffffff;
`;

const RewardExpiry = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #ffffff;
  opacity: 0.6;
`;

const RewardAction = styled.div`
  display: flex;
  justify-content: stretch;

  button {
    width: 100%;
    background: #ffffff;
    color: #000000;

    &:hover {
      background: #f3f4f6;
    }
  }
`;

const HistoryList = styled.div`
  background: var(--color-background);
  border-radius: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;

  [data-theme="dark"] & {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
`;

const HistoryItem = styled(motion.div)`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--gray-100);

  &:last-child {
    border-bottom: none;
  }
`;

const HistoryIcon = styled.div<{ type: string }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: ${props =>
    props.type === 'earned'
      ? 'var(--success-light)'
      : props.type === 'bonus'
      ? '#fef3c7'
      : props.type === 'redeemed'
      ? '#dbeafe'
      : 'var(--gray-100)'};
  color: ${props =>
    props.type === 'earned'
      ? 'var(--success)'
      : props.type === 'bonus'
      ? '#f59e0b'
      : props.type === 'redeemed'
      ? '#3b82f6'
      : 'var(--text-secondary)'};
`;

const HistoryContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const HistoryDesc = styled.div`
  font-size: 0.9375rem;
  color: var(--text-primary);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const HistoryDate = styled.div`
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
`;

const HistoryAmount = styled.div<{ positive: boolean }>`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${props => (props.positive ? 'var(--success)' : 'var(--text-secondary)')};
  white-space: nowrap;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  background: var(--color-background);
  border-radius: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

  [data-theme="dark"] & {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
`;

const EmptyIcon = styled.div`
  color: var(--text-secondary);
  margin-bottom: 1rem;
`;

const EmptyText = styled.div`
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
`;

const EmptySubtext = styled.div`
  font-size: 0.9375rem;
  color: var(--text-secondary);
`;

export default RewardsPage;
