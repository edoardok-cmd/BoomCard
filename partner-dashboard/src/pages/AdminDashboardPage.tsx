import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useOffers } from '../hooks/useOffers';
import { adminCashbackService, CashbackDashboardStats } from '../services/adminCashback.service';

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
  const [cashbackStats, setCashbackStats] = useState<CashbackDashboardStats | null>(null);

  useEffect(() => {
    adminCashbackService.getStats().then(setCashbackStats).catch(() => {});
  }, []);

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

        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <StatLabel>{language === 'bg' ? 'Очакван Кешбек (лв.)' : 'Pending Cashback (BGN)'}</StatLabel>
          <StatValue>{cashbackStats ? cashbackStats.pendingTotal.toFixed(2) : '—'}</StatValue>
          <StatChange>
            {language === 'bg' ? 'Неплатен от партньори' : 'Unpaid by partners'}
          </StatChange>
        </StatCard>

        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <StatLabel>{language === 'bg' ? 'Просрочени Партньори' : 'Overdue Partners'}</StatLabel>
          <StatValue style={{ color: cashbackStats && cashbackStats.overdueCount > 0 ? '#dc2626' : undefined }}>
            {cashbackStats ? cashbackStats.overdueCount : '—'}
          </StatValue>
          <StatChange>
            {language === 'bg' ? 'С просрочен кешбек' : 'With overdue cashback'}
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
          <ActionCard to="/admin/partner-types">
            <ActionIcon>🏷️</ActionIcon>
            <div>
              <ActionTitle>
                {language === 'bg' ? 'Типове Партньори' : 'Partner Types'}
              </ActionTitle>
              <ActionDescription>
                {language === 'bg'
                  ? 'Създавайте типове партньори, задавайте лимити за отстъпки и контролирайте достъпа по абонамент'
                  : 'Create partner types, set discount rate caps, and control which subscription plans can view or redeem offers'}
              </ActionDescription>
            </div>
          </ActionCard>

          <ActionCard to="/admin/top-discounts">
            <ActionIcon>⭐</ActionIcon>
            <div>
              <ActionTitle>
                {language === 'bg' ? 'Топ Отстъпки' : 'Top Discounts'}
              </ActionTitle>
              <ActionDescription>
                {language === 'bg'
                  ? 'Управлявайте featured оферти — всички полета и снимка са задължителни'
                  : 'Manage featured Top Discounts — all fields and image are required'}
              </ActionDescription>
            </div>
          </ActionCard>


          <ActionCard to="/admin/partners">
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

          <ActionCard to="/admin/bulk-import">
            <ActionIcon>📥</ActionIcon>
            <div>
              <ActionTitle>
                {language === 'bg' ? 'Масов Импорт' : 'Bulk Import'}
              </ActionTitle>
              <ActionDescription>
                {language === 'bg'
                  ? 'Импортирайте партньори и техните оферти от CSV или Excel файл с шаблон'
                  : 'Import partners and their offers in bulk from a CSV or Excel spreadsheet template'}
              </ActionDescription>
            </div>
          </ActionCard>

          <ActionCard to="/admin/receipts">
            <ActionIcon>🧾</ActionIcon>
            <div>
              <ActionTitle>
                {language === 'bg' ? 'Преглед на Касови Бележки' : 'Receipt Review'}
              </ActionTitle>
              <ActionDescription>
                {language === 'bg'
                  ? 'Одобрявайте или отхвърляйте касови бележки с изчакване и управлявайте начисления за кешбек'
                  : 'Approve or reject pending receipts and manage cashback credits'}
              </ActionDescription>
            </div>
          </ActionCard>

          <ActionCard to="/admin/cashback">
            <ActionIcon>💰</ActionIcon>
            <div>
              <ActionTitle>
                {language === 'bg' ? 'Плащания за Кешбек' : 'Cashback Payments'}
              </ActionTitle>
              <ActionDescription>
                {language === 'bg'
                  ? 'Проследявайте месечните кешбек задължения на партньорите и маркирайте платените'
                  : 'Track monthly cashback owed by partners and mark payments as received'}
              </ActionDescription>
            </div>
          </ActionCard>

          <ActionCard to="/admin/merchant-whitelist">
            <ActionIcon>🛡️</ActionIcon>
            <div>
              <ActionTitle>
                {language === 'bg' ? 'Списък Търговци' : 'Merchant Whitelist'}
              </ActionTitle>
              <ActionDescription>
                {language === 'bg'
                  ? 'Управлявайте одобрени и блокирани търговци за проверка на бележки'
                  : 'Manage approved and blocked merchants for receipt verification'}
              </ActionDescription>
            </div>
          </ActionCard>

          <ActionCard to="/admin/venue-fraud-config">
            <ActionIcon>⚙️</ActionIcon>
            <div>
              <ActionTitle>
                {language === 'bg' ? 'Конфиг за Измами' : 'Venue Fraud Config'}
              </ActionTitle>
              <ActionDescription>
                {language === 'bg'
                  ? 'Настройте прагове за измами, GPS и OCR проверки по обекти'
                  : 'Configure fraud thresholds, GPS and OCR verification per venue'}
              </ActionDescription>
            </div>
          </ActionCard>

          <ActionCard to="/admin/receipt-templates">
            <ActionIcon>📄</ActionIcon>
            <div>
              <ActionTitle>
                {language === 'bg' ? 'Шаблони за Бележки' : 'Receipt Templates'}
              </ActionTitle>
              <ActionDescription>
                {language === 'bg'
                  ? 'Управлявайте шаблони за визуално сравнение на бележки по обекти'
                  : 'Manage receipt templates for visual comparison per venue'}
              </ActionDescription>
            </div>
          </ActionCard>

          <ActionCard to="/admin/menu-approvals">
            <ActionIcon>📋</ActionIcon>
            <div>
              <ActionTitle>
                {language === 'bg' ? 'Одобрения на Менюта' : 'Menu Approvals'}
              </ActionTitle>
              <ActionDescription>
                {language === 'bg'
                  ? 'Преглед и одобряване на подадени URL адреси за менюта на обекти'
                  : 'Review and approve partner-submitted menu URLs for venues'}
              </ActionDescription>
            </div>
          </ActionCard>

          <ActionCard to="/admin/scan-review">
            <ActionIcon>🔍</ActionIcon>
            <div>
              <ActionTitle>
                {language === 'bg' ? 'Преглед на Сканирания' : 'Scan Review'}
              </ActionTitle>
              <ActionDescription>
                {language === 'bg'
                  ? 'Ръчен преглед на стикер сканирания с възможна измама'
                  : 'Manual review of sticker scans flagged for potential fraud'}
              </ActionDescription>
            </div>
          </ActionCard>

          <ActionCard to="/admin/partner-onboarding">
            <ActionIcon>🤝</ActionIcon>
            <div>
              <ActionTitle>
                {language === 'bg' ? 'Въвеждане на Партньор' : 'Partner Onboarding'}
              </ActionTitle>
              <ActionDescription>
                {language === 'bg'
                  ? 'Ръчно въвеждане на партньор с бизнес данни, обекти и условия'
                  : 'Manually onboard a partner with business info, venues, and terms'}
              </ActionDescription>
            </div>
          </ActionCard>
        </QuickActionsGrid>
      </Section>
    </PageContainer>
  );
};

export default AdminDashboardPage;
