import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useOffers } from '../hooks/useOffers';

const PageContainer = styled.div`
  max-width: 80rem;
  margin: 0 auto;
  padding: 2rem 1rem;
  min-height: calc(100vh - 4rem);
`;

const PageHeader = styled.div`
  margin-bottom: 3rem;
`;

const Title = styled.h1`
  font-size: 3rem;
  font-weight: 800;
  background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.5rem;
  letter-spacing: -0.03em;

  @media (max-width: 640px) {
    font-size: 2rem;
  }
`;

const Subtitle = styled.p`
  font-size: 1.125rem;
  color: #6b7280;
  font-weight: 500;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;
`;

const StatCard = styled(motion.div)`
  background: linear-gradient(to bottom right, #ffffff 0%, #fafbfc 100%);
  border-radius: 1.5rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.06);
  padding: 2rem;
  transition: all 300ms;

  &:hover {
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    transform: translateY(-4px);
  }
`;

const StatLabel = styled.p`
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
`;

const StatValue = styled.h3`
  font-size: 2.5rem;
  font-weight: 800;
  color: #111827;
  margin-bottom: 0.5rem;
`;

const StatChange = styled.p<{ positive?: boolean }>`
  font-size: 0.875rem;
  color: ${props => props.positive ? '#10b981' : '#6b7280'};
  font-weight: 600;
`;

const QuickActionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;
`;

const ActionCard = styled(Link)`
  background: white;
  border-radius: 1.25rem;
  padding: 2rem;
  border: 2px solid #e5e7eb;
  text-decoration: none;
  transition: all 300ms;
  display: flex;
  flex-direction: column;
  gap: 1rem;

  &:hover {
    border-color: #dc2626;
    box-shadow: 0 8px 24px rgba(220, 38, 38, 0.15);
    transform: translateY(-4px);
  }
`;

const ActionIcon = styled.div`
  width: 3rem;
  height: 3rem;
  border-radius: 0.75rem;
  background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
`;

const ActionTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
`;

const ActionDescription = styled.p`
  font-size: 0.9375rem;
  color: #6b7280;
  margin: 0;
  line-height: 1.5;
`;

const Section = styled.div`
  margin-bottom: 3rem;
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
`;

const SectionTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
`;

const AdminDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { data: offersData } = useOffers({ limit: 100 });

  // Calculate stats
  const totalOffers = offersData?.total || 0;
  const featuredOffers = offersData?.data?.filter(o => o.isFeatured)?.length || 0;
  const activeOffers = offersData?.data?.filter(o => o.status === 'ACTIVE')?.length || 0;

  return (
    <PageContainer>
      <PageHeader>
        <Title>
          {language === 'bg' ? 'Администраторски Панел' : 'Admin Dashboard'}
        </Title>
        <Subtitle>
          {language === 'bg'
            ? `Добре дошли обратно, ${user?.firstName || 'Admin'}`
            : `Welcome back, ${user?.firstName || 'Admin'}`}
        </Subtitle>
      </PageHeader>

      <StatsGrid>
        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <StatLabel>{language === 'bg' ? 'Общо Оферти' : 'Total Offers'}</StatLabel>
          <StatValue>{totalOffers}</StatValue>
          <StatChange positive>
            {language === 'bg' ? 'Всички оферти' : 'All offers'}
          </StatChange>
        </StatCard>

        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <StatLabel>{language === 'bg' ? 'Топ Оферти' : 'Featured Offers'}</StatLabel>
          <StatValue>{featuredOffers}</StatValue>
          <StatChange positive>
            {language === 'bg' ? 'Показани на началната страница' : 'Shown on homepage'}
          </StatChange>
        </StatCard>

        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <StatLabel>{language === 'bg' ? 'Активни Оферти' : 'Active Offers'}</StatLabel>
          <StatValue>{activeOffers}</StatValue>
          <StatChange positive>
            {language === 'bg' ? 'Видими за клиенти' : 'Visible to clients'}
          </StatChange>
        </StatCard>

        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <StatLabel>{language === 'bg' ? 'Процент Показвани' : 'Featured Rate'}</StatLabel>
          <StatValue>{totalOffers > 0 ? Math.round((featuredOffers / totalOffers) * 100) : 0}%</StatValue>
          <StatChange>
            {language === 'bg' ? 'От всички оферти' : 'Of all offers'}
          </StatChange>
        </StatCard>
      </StatsGrid>

      <Section>
        <SectionHeader>
          <SectionTitle>
            {language === 'bg' ? 'Бързи Действия' : 'Quick Actions'}
          </SectionTitle>
        </SectionHeader>

        <QuickActionsGrid>
          <ActionCard to="/admin/offers">
            <ActionIcon>⭐</ActionIcon>
            <div>
              <ActionTitle>
                {language === 'bg' ? 'Управление на Топ Оферти' : 'Manage Top Offers'}
              </ActionTitle>
              <ActionDescription>
                {language === 'bg'
                  ? 'Маркирайте оферти като топ, подредете ги и управлявайте показването им на началната страница'
                  : 'Mark offers as featured, reorder them, and manage homepage display'}
              </ActionDescription>
            </div>
          </ActionCard>

          <ActionCard to="/partners/offers">
            <ActionIcon>📋</ActionIcon>
            <div>
              <ActionTitle>
                {language === 'bg' ? 'Всички Оферти' : 'All Offers'}
              </ActionTitle>
              <ActionDescription>
                {language === 'bg'
                  ? 'Преглед и редакция на всички оферти от всички партньори'
                  : 'View and edit all offers from all partners'}
              </ActionDescription>
            </div>
          </ActionCard>

          <ActionCard to="/partners">
            <ActionIcon>🏢</ActionIcon>
            <div>
              <ActionTitle>
                {language === 'bg' ? 'Партньори' : 'Partners'}
              </ActionTitle>
              <ActionDescription>
                {language === 'bg'
                  ? 'Управление на партньорски акаунти и одобрения'
                  : 'Manage partner accounts and approvals'}
              </ActionDescription>
            </div>
          </ActionCard>

          <ActionCard to="/analytics">
            <ActionIcon>📊</ActionIcon>
            <div>
              <ActionTitle>
                {language === 'bg' ? 'Аналитика' : 'Analytics'}
              </ActionTitle>
              <ActionDescription>
                {language === 'bg'
                  ? 'Преглед на статистики и отчети на системата'
                  : 'View system statistics and reports'}
              </ActionDescription>
            </div>
          </ActionCard>
        </QuickActionsGrid>
      </Section>
    </PageContainer>
  );
};

export default AdminDashboardPage;
