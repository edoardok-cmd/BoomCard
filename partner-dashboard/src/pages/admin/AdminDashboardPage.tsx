import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import {
  BuildingStorefrontIcon,
  BanknotesIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
  CheckCircleIcon,
  BellAlertIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { adminDashboardService, AdminDashboardStats } from '../../services/adminDashboard.service';
import { adminAlertsService, AdminAlertsResult, AlertTier } from '../../services/adminAlerts.service';

const fmt2 = (n: number | undefined | null): string =>
  typeof n === 'number' && Number.isFinite(n) ? n.toFixed(2) : '—';

/* ─── Palette ─────────────────────────────────────────────────────────────── */
const palette = {
  bg: '#faf9f5',
  surface: '#ffffff',
  surfaceAlt: '#f5f4ee',
  border: '#e8e5dc',
  borderStrong: '#d6d2c4',
  text: '#141413',
  textMuted: '#605a50',
  textSubtle: '#8c8678',
  accent: '#c96442',
  accentSoft: '#f3e8de',
  success: '#4a7c59',
  successSoft: '#e6efe3',
  warning: '#b5803a',
  warningSoft: '#f5ead2',
  danger: '#b54327',
  dangerSoft: '#f4dcd2',
};

/* ─── Layout ───────────────────────────────────────────────────────────────── */
const PageShell = styled.div`
  background: ${palette.bg};
  min-height: calc(100vh - 4rem);
  padding: 4rem 1.5rem 5rem;
  color: ${palette.text};
  font-feature-settings: 'ss01', 'cv11';

  [data-theme='dark'] & {
    background: #1a1917;
    color: #ece9e0;
  }
`;

const PageContainer = styled.div`
  max-width: 74rem;
  margin: 0 auto;
`;

const PageHeader = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 2rem;
  margin-bottom: 4rem;

  @media (max-width: 720px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 2.75rem;
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  max-width: 44rem;
`;

const Eyebrow = styled.span`
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${palette.textSubtle};

  [data-theme='dark'] & {
    color: #9a948a;
  }
`;

const Title = styled.h1`
  font-family: 'Tiempos Headline', 'Copernicus', 'Georgia', 'Times New Roman', serif;
  font-size: 3rem;
  font-weight: 400;
  color: ${palette.text};
  margin: 0;
  letter-spacing: -0.02em;
  line-height: 1.05;

  [data-theme='dark'] & {
    color: #f5f3ec;
  }

  @media (max-width: 720px) {
    font-size: 2.25rem;
  }
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: ${palette.textMuted};
  margin: 0;
  line-height: 1.55;
  max-width: 36rem;

  [data-theme='dark'] & {
    color: #b8b0a3;
  }
`;

const DateChip = styled.div`
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
  padding: 0.625rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.625rem;
  background: ${palette.surface};

  [data-theme='dark'] & {
    background: #252320;
    border-color: #3a3732;
  }

  @media (max-width: 720px) {
    align-items: flex-start;
  }
`;

const DateLabel = styled.span`
  font-size: 0.6875rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: ${palette.textSubtle};
`;

const DateValue = styled.span`
  font-size: 0.8125rem;
  font-weight: 500;
  color: ${palette.text};

  [data-theme='dark'] & {
    color: #ece9e0;
  }
`;

/* ─── Alert Feed ───────────────────────────────────────────────────────────── */
const AlertSection = styled.section`
  margin-bottom: 3.5rem;
`;

const AlertSectionHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
`;

const AlertSectionTitle = styled.h2`
  font-family: 'Tiempos Headline', 'Copernicus', 'Georgia', serif;
  font-size: 1.25rem;
  font-weight: 400;
  color: ${palette.text};
  margin: 0;
  letter-spacing: -0.01em;

  [data-theme='dark'] & {
    color: #f5f3ec;
  }
`;

const AlertSectionLink = styled(Link)`
  font-size: 0.8125rem;
  font-weight: 500;
  color: ${palette.accent};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const AlertGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 0.75rem;
`;

const AlertCard = styled(motion(Link))<{ $severity: 'danger' | 'warning' | 'info' }>`
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  padding: 1rem 1.125rem;
  background: ${palette.surface};
  border: 1px solid
    ${p =>
      p.$severity === 'danger'
        ? '#e8b8ad'
        : p.$severity === 'warning'
          ? '#e8d8ad'
          : palette.border};
  border-left: 3px solid
    ${p =>
      p.$severity === 'danger'
        ? palette.danger
        : p.$severity === 'warning'
          ? palette.warning
          : palette.accent};
  border-radius: 0.75rem;
  text-decoration: none;
  transition: box-shadow 200ms ease, transform 200ms ease;

  [data-theme='dark'] & {
    background: #252320;
    border-color: ${p =>
      p.$severity === 'danger' ? 'rgba(181,67,39,0.4)' : p.$severity === 'warning' ? 'rgba(181,128,58,0.4)' : '#3a3732'};
    border-left-color: ${p =>
      p.$severity === 'danger' ? '#e27d5f' : p.$severity === 'warning' ? '#d4a165' : palette.accent};
  }

  &:hover {
    box-shadow: 0 4px 16px -8px rgba(20, 20, 19, 0.12);
    transform: translateY(-1px);
  }
`;

const AlertIconBox = styled.div<{ $severity: 'danger' | 'warning' | 'info' }>`
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${p =>
    p.$severity === 'danger'
      ? palette.dangerSoft
      : p.$severity === 'warning'
        ? palette.warningSoft
        : palette.accentSoft};
  color: ${p =>
    p.$severity === 'danger'
      ? palette.danger
      : p.$severity === 'warning'
        ? palette.warning
        : palette.accent};

  [data-theme='dark'] & {
    background: ${p =>
      p.$severity === 'danger'
        ? 'rgba(181,67,39,0.2)'
        : p.$severity === 'warning'
          ? 'rgba(181,128,58,0.2)'
          : 'rgba(201,100,66,0.18)'};
    color: ${p =>
      p.$severity === 'danger' ? '#e27d5f' : p.$severity === 'warning' ? '#d4a165' : '#e08162'};
  }

  svg {
    width: 1rem;
    height: 1rem;
    stroke-width: 1.75;
  }
`;

const AlertBody = styled.div`
  flex: 1 1 auto;
  min-width: 0;
`;

const AlertTitle = styled.p`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${palette.text};
  margin: 0 0 0.25rem;
  line-height: 1.3;

  [data-theme='dark'] & {
    color: #f5f3ec;
  }
`;

const AlertCount = styled.span<{ $severity: 'danger' | 'warning' | 'info' }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  height: 1.5rem;
  padding: 0 0.375rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  font-feature-settings: 'tnum';
  flex-shrink: 0;
  background: ${p =>
    p.$severity === 'danger'
      ? palette.dangerSoft
      : p.$severity === 'warning'
        ? palette.warningSoft
        : palette.accentSoft};
  color: ${p =>
    p.$severity === 'danger'
      ? palette.danger
      : p.$severity === 'warning'
        ? palette.warning
        : palette.accent};

  [data-theme='dark'] & {
    background: ${p =>
      p.$severity === 'danger'
        ? 'rgba(181,67,39,0.25)'
        : p.$severity === 'warning'
          ? 'rgba(181,128,58,0.25)'
          : 'rgba(201,100,66,0.2)'};
    color: ${p =>
      p.$severity === 'danger' ? '#e27d5f' : p.$severity === 'warning' ? '#d4a165' : '#e08162'};
  }
`;

const AllClearBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 1rem 1.25rem;
  background: ${palette.successSoft};
  border: 1px solid #b8d8c0;
  border-radius: 0.75rem;
  color: ${palette.success};

  [data-theme='dark'] & {
    background: rgba(74, 124, 89, 0.12);
    border-color: rgba(74, 124, 89, 0.3);
    color: #79b090;
  }

  svg {
    width: 1.125rem;
    height: 1.125rem;
    flex-shrink: 0;
  }
`;

const AllClearText = styled.p`
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0;
`;

/* ─── Stats Grid ───────────────────────────────────────────────────────────── */
const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13.5rem, 1fr));
  gap: 1rem;
`;

const StatCard = styled(motion.div)`
  position: relative;
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.875rem;
  padding: 1.5rem 1.5rem 1.375rem;
  transition: border-color 220ms ease, box-shadow 220ms ease;
  min-height: 8.5rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  [data-theme='dark'] & {
    background: #252320;
    border-color: #3a3732;
  }

  &:hover {
    border-color: ${palette.borderStrong};
    box-shadow: 0 1px 2px rgba(20, 20, 19, 0.04), 0 8px 24px -16px rgba(20, 20, 19, 0.08);

    [data-theme='dark'] & {
      border-color: #4a453e;
    }
  }
`;

const StatTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
`;

const StatLabel = styled.p`
  font-size: 0.8125rem;
  font-weight: 500;
  color: ${palette.textMuted};
  margin: 0;
  letter-spacing: -0.005em;

  [data-theme='dark'] & {
    color: #b8b0a3;
  }
`;

const StatIconBox = styled.div<{ $tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }>`
  width: 1.875rem;
  height: 1.875rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${p =>
    p.$tone === 'accent'
      ? palette.accent
      : p.$tone === 'success'
        ? palette.success
        : p.$tone === 'warning'
          ? palette.warning
          : p.$tone === 'danger'
            ? palette.danger
            : palette.textSubtle};

  svg {
    width: 1.125rem;
    height: 1.125rem;
    stroke-width: 1.6;
  }
`;

const StatValue = styled.h3`
  font-family: 'Tiempos Headline', 'Copernicus', 'Georgia', serif;
  font-size: 2.375rem;
  font-weight: 400;
  color: ${palette.text};
  margin: 0 0 0.375rem 0;
  letter-spacing: -0.03em;
  line-height: 1;
  font-feature-settings: 'tnum', 'lnum';

  [data-theme='dark'] & {
    color: #f5f3ec;
  }
`;

const StatSubs = styled.div`
  display: flex;
  gap: 0.875rem;
  flex-wrap: wrap;
  margin-top: 0.375rem;
`;

const StatSub = styled.span`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  font-feature-settings: 'tnum';

  [data-theme='dark'] & {
    color: #9a948a;
  }

  strong {
    color: ${palette.textMuted};
    font-weight: 600;

    [data-theme='dark'] & {
      color: #b8b0a3;
    }
  }
`;

const TierLabel = styled.h3`
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${palette.textSubtle};
  margin: 0 0 0.75rem;

  [data-theme='dark'] & {
    color: #9a948a;
  }
`;

/* ─── Alert helpers ────────────────────────────────────────────────────────── */
function tierToSeverity(tier: AlertTier): 'danger' | 'warning' | 'info' {
  if (tier === 'critical') return 'danger';
  if (tier === 'operational') return 'warning';
  return 'info';
}

/* ─── Component ────────────────────────────────────────────────────────────── */
const AdminDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [dashStats, setDashStats] = useState<AdminDashboardStats | null>(null);
  const [alerts, setAlerts] = useState<AdminAlertsResult | null>(null);

  useEffect(() => {
    adminDashboardService.getStats().then(setDashStats).catch(() => {});
  }, []);

  useEffect(() => {
    adminAlertsService
      .getAlerts()
      .then(setAlerts)
      .catch(() =>
        setAlerts({ critical: [], operational: [], informational: [], totalCount: 0, generatedAt: '' }),
      );
  }, []);

  const bg = language === 'bg';

  const today = new Date().toLocaleDateString(bg ? 'bg-BG' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <PageShell>
      <PageContainer>
        {/* Header */}
        <PageHeader>
          <HeaderLeft>
            <Eyebrow>{bg ? 'Администрация' : 'Administration'}</Eyebrow>
            <Title>
              {bg
                ? `Добре дошли, ${user?.firstName || 'Admin'}`
                : `Welcome back, ${user?.firstName || 'Admin'}`}
            </Title>
            <Subtitle>
              {bg
                ? 'Контролен център — абонати, транзакции, кешбек, партньори и финанси с един поглед.'
                : 'Control center — subscribers, transactions, cashback, partners and finance at a glance.'}
            </Subtitle>
          </HeaderLeft>
          <DateChip>
            <DateLabel>{bg ? 'Днес' : 'Today'}</DateLabel>
            <DateValue>{today}</DateValue>
          </DateChip>
        </PageHeader>

        {/* Сигнали и известия — spec §3.2 */}
        <AlertSection>
          <AlertSectionHead>
            <AlertSectionTitle>
              {bg ? 'Сигнали и известия' : 'Alerts & Notices'}
            </AlertSectionTitle>
            <AlertSectionLink to="/admin/dashboard/alerts">
              {bg ? 'Виж всички →' : 'View all →'}
            </AlertSectionLink>
          </AlertSectionHead>

          {alerts === null ? null : (alerts.totalCount ?? 0) === 0 ? (
            <AllClearBanner>
              <CheckCircleIcon />
              <AllClearText>
                {bg
                  ? 'Всичко е наред — няма елементи, изискващи незабавно внимание.'
                  : 'All clear — no items require immediate attention.'}
              </AllClearText>
            </AllClearBanner>
          ) : (
            <>
              {alerts.critical.length > 0 && (
                <>
                  <TierLabel>{bg ? 'Критични' : 'Critical'}</TierLabel>
                  <AlertGrid style={{ marginBottom: '1.25rem' }}>
                    {alerts.critical.map((alert, idx) => {
                      const sev = tierToSeverity(alert.tier);
                      return (
                        <AlertCard
                          key={alert.id}
                          to={alert.link}
                          $severity={sev}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 * idx, duration: 0.22 }}
                        >
                          <AlertIconBox $severity={sev}>
                            <BellAlertIcon />
                          </AlertIconBox>
                          <AlertBody>
                            <AlertTitle>{alert.title}</AlertTitle>
                          </AlertBody>
                          <AlertCount $severity={sev}>{alert.count}</AlertCount>
                        </AlertCard>
                      );
                    })}
                  </AlertGrid>
                </>
              )}
              {alerts.operational.length > 0 && (
                <>
                  <TierLabel>{bg ? 'Оперативни' : 'Operational'}</TierLabel>
                  <AlertGrid style={{ marginBottom: '1.25rem' }}>
                    {alerts.operational.map((alert, idx) => {
                      const sev = tierToSeverity(alert.tier);
                      return (
                        <AlertCard
                          key={alert.id}
                          to={alert.link}
                          $severity={sev}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 * idx, duration: 0.22 }}
                        >
                          <AlertIconBox $severity={sev}>
                            <BellAlertIcon />
                          </AlertIconBox>
                          <AlertBody>
                            <AlertTitle>{alert.title}</AlertTitle>
                          </AlertBody>
                          <AlertCount $severity={sev}>{alert.count}</AlertCount>
                        </AlertCard>
                      );
                    })}
                  </AlertGrid>
                </>
              )}
              {alerts.informational.length > 0 && (
                <>
                  <TierLabel>{bg ? 'Информационни' : 'Informational'}</TierLabel>
                  <AlertGrid>
                    {alerts.informational.map((alert, idx) => {
                      const sev = tierToSeverity(alert.tier);
                      return (
                        <AlertCard
                          key={alert.id}
                          to={alert.link}
                          $severity={sev}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 * idx, duration: 0.22 }}
                        >
                          <AlertIconBox $severity={sev}>
                            <BellAlertIcon />
                          </AlertIconBox>
                          <AlertBody>
                            <AlertTitle>{alert.title}</AlertTitle>
                          </AlertBody>
                          <AlertCount $severity={sev}>{alert.count}</AlertCount>
                        </AlertCard>
                      );
                    })}
                  </AlertGrid>
                </>
              )}
            </>
          )}
        </AlertSection>

        {/* Обзор — spec §3.1 */}
        <StatsGrid>
          <StatCard
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <StatTop>
              <StatLabel>{bg ? 'Абонати — активни' : 'Subscribers — active'}</StatLabel>
              <StatIconBox $tone="accent">
                <UsersIcon />
              </StatIconBox>
            </StatTop>
            <div>
              <StatValue>{dashStats?.subscribers.active ?? '—'}</StatValue>
              <StatSubs>
                <StatSub>
                  <strong>{dashStats?.subscribers.newLast30Days ?? '—'}</strong>{' '}
                  {bg ? 'нови / 30 дни' : 'new / 30d'}
                </StatSub>
                <StatSub>
                  <strong>{dashStats?.subscribers.expired ?? '—'}</strong>{' '}
                  {bg ? 'изтекли' : 'expired'}
                </StatSub>
                <StatSub>
                  <strong>{dashStats?.subscribers.paused ?? '—'}</strong>{' '}
                  {bg ? 'спрени' : 'paused'}
                </StatSub>
                <StatSub>
                  <strong>{dashStats?.subscribers.failedPayment ?? '—'}</strong>{' '}
                  {bg ? 'неуспешно плащане' : 'failed payment'}
                </StatSub>
              </StatSubs>
            </div>
          </StatCard>

          <StatCard
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <StatTop>
              <StatLabel>{bg ? 'Транзакции днес' : 'Transactions Today'}</StatLabel>
              <StatIconBox>
                <ChartBarIcon />
              </StatIconBox>
            </StatTop>
            <div>
              <StatValue>{dashStats?.transactions.todayCount ?? '—'}</StatValue>
              <StatSubs>
                <StatSub>
                  <strong>{fmt2(dashStats?.transactions.todayVolume)}</strong>{' '}
                  {bg ? 'лв. днес' : 'BGN today'}
                </StatSub>
                <StatSub>
                  <strong>{fmt2(dashStats?.transactions.todayAvg)}</strong>{' '}
                  {bg ? 'средно' : 'avg'}
                </StatSub>
                <StatSub>
                  <strong>{fmt2(dashStats?.transactions.totalVolume)}</strong>{' '}
                  {bg ? 'общ оборот' : 'total turnover'}
                </StatSub>
              </StatSubs>
            </div>
          </StatCard>

          <StatCard
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <StatTop>
              <StatLabel>{bg ? 'Кешбек — одобрен' : 'Cashback — approved'}</StatLabel>
              <StatIconBox>
                <BanknotesIcon />
              </StatIconBox>
            </StatTop>
            <div>
              <StatValue>
                {`${fmt2(dashStats?.cashback.approved)} ${bg ? 'лв.' : 'BGN'}`}
              </StatValue>
              <StatSubs>
                <StatSub>
                  <strong>{fmt2(dashStats?.cashback.accrued)}</strong>{' '}
                  {bg ? 'начислен' : 'accrued'}
                </StatSub>
                <StatSub>
                  <strong>{fmt2(dashStats?.cashback.pending)}</strong>{' '}
                  {bg ? 'изчакващ' : 'pending'}
                </StatSub>
                <StatSub>
                  <strong>{fmt2(dashStats?.cashback.expiringSoon)}</strong>{' '}
                  {bg ? 'изтичащ' : 'expiring'}
                </StatSub>
              </StatSubs>
            </div>
          </StatCard>

          <StatCard
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <StatTop>
              <StatLabel>{bg ? 'Партньори — активни' : 'Partners — active'}</StatLabel>
              <StatIconBox $tone="success">
                <BuildingStorefrontIcon />
              </StatIconBox>
            </StatTop>
            <div>
              <StatValue>{dashStats?.partners.active ?? '—'}</StatValue>
              <StatSubs>
                <StatSub>
                  <strong>{dashStats?.partners.requests ?? '—'}</strong>{' '}
                  {bg ? 'нови заявки' : 'new requests'}
                </StatSub>
                <StatSub>
                  <strong>{dashStats?.partners.locations ?? '—'}</strong>{' '}
                  {bg ? 'обекти на активни' : 'venues of active'}
                </StatSub>
              </StatSubs>
            </div>
          </StatCard>

          <StatCard
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <StatTop>
              <StatLabel>{bg ? 'Финанси — плащания към абонати' : 'Finance — subscriber payouts'}</StatLabel>
              <StatIconBox $tone={dashStats && dashStats.finance.payoutsDue > 0 ? 'warning' : 'neutral'}>
                <CurrencyDollarIcon />
              </StatIconBox>
            </StatTop>
            <div>
              <StatValue>
                {`${fmt2(dashStats?.finance.payoutsDue)} ${bg ? 'лв.' : 'BGN'}`}
              </StatValue>
              <StatSubs>
                <StatSub>
                  <strong>{dashStats?.finance.payoutsDueCount ?? '—'}</strong>{' '}
                  {bg ? 'в опашка' : 'in queue'}
                </StatSub>
                <StatSub>
                  <strong>{fmt2(dashStats?.finance.partnerReceivables)}</strong>{' '}
                  {bg ? 'от партньори' : 'from partners'}
                </StatSub>
                <StatSub>
                  <strong>{fmt2(dashStats?.finance.margin)}</strong>{' '}
                  {bg ? 'марджин' : 'margin'}
                </StatSub>
              </StatSubs>
            </div>
          </StatCard>
        </StatsGrid>
      </PageContainer>
    </PageShell>
  );
};

export default AdminDashboardPage;
