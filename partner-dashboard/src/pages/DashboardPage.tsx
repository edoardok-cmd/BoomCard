import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/common/Button/Button';
import QRCode from '../components/common/QRCode/QRCode';

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
  font-size: 2.25rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;

  @media (max-width: 640px) {
    font-size: 1.875rem;
  }
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: #6b7280;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 1.5rem;
  margin-bottom: 2.5rem;
`;

const StatCard = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 1.5rem;
`;

const StatLabel = styled.p`
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
`;

const StatValue = styled.p`
  font-size: 2.25rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.25rem;
`;

const StatChange = styled.p<{ $positive?: boolean }>`
  font-size: 0.875rem;
  font-weight: 500;
  color: ${props => props.$positive ? '#10b981' : '#6b7280'};
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
`;

const SectionTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
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
  border-radius: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  transition: box-shadow 200ms;

  &:hover {
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
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
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.5rem;
`;

const VenueCategory = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 1rem;
`;

const CardMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
`;

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.875rem;
`;

const MetaLabel = styled.span`
  color: #6b7280;
`;

const MetaValue = styled.span`
  font-weight: 600;
  color: #111827;
`;

const CardActions = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
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

interface DashboardPageProps {
  language?: 'en' | 'bg';
}

const DashboardPage: React.FC<DashboardPageProps> = ({ language = 'en' }) => {
  const { user } = useAuth();
  const [selectedCard, setSelectedCard] = useState<string | null>(null);

  // Mock data - in production this would come from an API
  const boomCards: BoomCard[] = [
    {
      id: '1',
      cardNumber: 'BC-2024-001234',
      type: 'premium',
      venueName: 'Sense Hotel Sofia',
      venueNameBg: 'Хотел Sense София',
      category: 'Hotels & Accommodation',
      categoryBg: 'Хотели и настаняване',
      discount: 50,
      validUntil: Date.now() + 180 * 24 * 60 * 60 * 1000, // 180 days
      usageCount: 3,
      usageLimit: 10,
      status: 'active',
    },
    {
      id: '2',
      cardNumber: 'BC-2024-001235',
      type: 'standard',
      venueName: 'Made in Blue',
      venueNameBg: 'Made in Blue',
      category: 'Restaurants',
      categoryBg: 'Ресторанти',
      discount: 30,
      validUntil: Date.now() + 90 * 24 * 60 * 60 * 1000, // 90 days
      usageCount: 5,
      usageLimit: 15,
      status: 'active',
    },
    {
      id: '3',
      cardNumber: 'BC-2024-001236',
      type: 'premium',
      venueName: 'Spa & Wellness Center',
      venueNameBg: 'Спа и уелнес център',
      category: 'Spa & Wellness',
      categoryBg: 'Спа и уелнес',
      discount: 40,
      validUntil: Date.now() + 365 * 24 * 60 * 60 * 1000, // 365 days
      usageCount: 1,
      usageLimit: 20,
      status: 'active',
    },
  ];

  const activeCards = boomCards.filter(card => card.status === 'active');
  const totalSavings = activeCards.reduce((sum, card) => sum + (card.discount * 10), 0); // Mock calculation
  const totalUsage = activeCards.reduce((sum, card) => sum + card.usageCount, 0);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getDaysRemaining = (timestamp: number) => {
    const now = Date.now();
    const diff = timestamp - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  return (
    <PageContainer>
      <PageHeader>
        <Title>
          {language === 'bg' ? `Здравей, ${user?.firstName}! 👋` : `Hello, ${user?.firstName}! 👋`}
        </Title>
        <Subtitle>
          {language === 'bg'
            ? 'Управлявайте вашите BoomCard карти и преглеждайте спестяванията си'
            : 'Manage your BoomCards and view your savings'}
        </Subtitle>
      </PageHeader>

      {/* Stats */}
      <StatsGrid>
        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <StatLabel>{language === 'bg' ? 'Активни карти' : 'Active Cards'}</StatLabel>
          <StatValue>{activeCards.length}</StatValue>
          <StatChange $positive>
            {language === 'bg' ? 'Готови за ползване' : 'Ready to use'}
          </StatChange>
        </StatCard>

        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <StatLabel>{language === 'bg' ? 'Общи спестявания' : 'Total Savings'}</StatLabel>
          <StatValue>{totalSavings} лв</StatValue>
          <StatChange $positive>
            {language === 'bg' ? 'Този месец' : 'This month'}
          </StatChange>
        </StatCard>

        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <StatLabel>{language === 'bg' ? 'Използвания' : 'Total Uses'}</StatLabel>
          <StatValue>{totalUsage}</StatValue>
          <StatChange>
            {language === 'bg' ? 'От всички карти' : 'Across all cards'}
          </StatChange>
        </StatCard>
      </StatsGrid>

      {/* Cards Section */}
      <SectionHeader>
        <SectionTitle>
          {language === 'bg' ? 'Моите карти' : 'My Cards'}
        </SectionTitle>
        <Button variant="primary" size="medium">
          {language === 'bg' ? 'Добави карта' : 'Add Card'}
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
                      ? (language === 'bg' ? 'Премиум' : 'Premium')
                      : (language === 'bg' ? 'Стандарт' : 'Standard')}
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
                      {language === 'bg' ? 'Отстъпка' : 'Discount'}
                    </MetaLabel>
                    <MetaValue>{card.discount}%</MetaValue>
                  </MetaRow>
                  <MetaRow>
                    <MetaLabel>
                      {language === 'bg' ? 'Използвания' : 'Uses'}
                    </MetaLabel>
                    <MetaValue>
                      {card.usageCount} / {card.usageLimit}
                    </MetaValue>
                  </MetaRow>
                  <MetaRow>
                    <MetaLabel>
                      {language === 'bg' ? 'Валидна до' : 'Valid until'}
                    </MetaLabel>
                    <MetaValue>{formatDate(card.validUntil)}</MetaValue>
                  </MetaRow>
                  <MetaRow>
                    <MetaLabel>
                      {language === 'bg' ? 'Остават дни' : 'Days left'}
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
                      {language === 'bg' ? 'Покажи QR' : 'Show QR'}
                    </Button>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Button variant="ghost" size="small">
                      {language === 'bg' ? 'Детайли' : 'Details'}
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
            {language === 'bg' ? 'Нямате активни карти' : 'No active cards yet'}
          </EmptyTitle>
          <EmptyDescription>
            {language === 'bg'
              ? 'Започнете да спестявате като активирате вашата първа BoomCard'
              : 'Start saving by activating your first BoomCard'}
          </EmptyDescription>
          <Button variant="primary" size="large">
            {language === 'bg' ? 'Разгледай оферти' : 'Browse Offers'}
          </Button>
        </EmptyState>
      )}

      {/* QR Code Modal */}
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
                      title={language === 'bg' ? 'Покажи на касата' : 'Show at checkout'}
                      language={language}
                      downloadable
                    />
                    <div style={{ marginTop: '1rem', width: '100%' }}>
                      <Button
                        variant="ghost"
                        size="large"
                        onClick={() => setSelectedCard(null)}
                      >
                        {language === 'bg' ? 'Затвори' : 'Close'}
                      </Button>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </PageContainer>
  );
};

export default DashboardPage;
