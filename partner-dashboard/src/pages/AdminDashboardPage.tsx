import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import {
  BuildingStorefrontIcon,
  TagIcon,
  StarIcon,
  ArrowUpTrayIcon,
  ReceiptPercentIcon,
  BanknotesIcon,
  ShieldCheckIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  ClipboardDocumentCheckIcon,
  MagnifyingGlassIcon,
  HandRaisedIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowUpRightIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useOffers } from '../hooks/useOffers';
import { adminCashbackService, CashbackDashboardStats } from '../services/adminCashback.service';
import { partnersService } from '../services/partners.service';
import { partnerTypesService } from '../services/partnerTypes.service';
import { venuesService } from '../services/venues.service';
import { receiptsApiService } from '../services/receipts-api.service';
import { fraudAdminService } from '../services/fraudAdmin.service';
import { apiService } from '../services/api.service';

/* Claude-inspired palette — warm neutrals, serif display, orange accent */
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

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13.5rem, 1fr));
  gap: 1rem;
  margin-bottom: 4.5rem;

  @media (max-width: 720px) {
    margin-bottom: 3rem;
  }
`;

const StatCard = styled(motion.div)`
  position: relative;
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.875rem;
  padding: 1.5rem 1.5rem 1.375rem;
  transition: border-color 220ms ease, box-shadow 220ms ease, transform 220ms ease;
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

const StatValue = styled.h3<{ $danger?: boolean }>`
  font-family: 'Tiempos Headline', 'Copernicus', 'Georgia', serif;
  font-size: 2.375rem;
  font-weight: 400;
  color: ${p => (p.$danger ? palette.danger : palette.text)};
  margin: 0 0 0.375rem 0;
  letter-spacing: -0.03em;
  line-height: 1;
  font-feature-settings: 'tnum', 'lnum';

  [data-theme='dark'] & {
    color: ${p => (p.$danger ? '#e27d5f' : '#f5f3ec')};
  }
`;

const StatChange = styled.p<{ $positive?: boolean; $warning?: boolean }>`
  font-size: 0.8125rem;
  color: ${p =>
    p.$positive ? palette.success : p.$warning ? palette.warning : palette.textSubtle};
  font-weight: 500;
  margin: 0;
  line-height: 1.4;

  [data-theme='dark'] & {
    color: ${p =>
      p.$positive ? '#79b090' : p.$warning ? '#d4a165' : '#9a948a'};
  }
`;

const SectionGroup = styled.section`
  margin-bottom: 3.25rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid ${palette.border};

  [data-theme='dark'] & {
    border-color: #3a3732;
  }
`;

const SectionTitle = styled.h2`
  font-family: 'Tiempos Headline', 'Copernicus', 'Georgia', serif;
  font-size: 1.5rem;
  font-weight: 400;
  color: ${palette.text};
  margin: 0;
  letter-spacing: -0.015em;

  [data-theme='dark'] & {
    color: #f5f3ec;
  }
`;

const SectionHint = styled.span`
  font-size: 0.8125rem;
  color: ${palette.textSubtle};
  text-align: right;
  font-weight: 400;

  @media (max-width: 640px) {
    display: none;
  }
`;

const ActionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
  gap: 0.875rem;
`;

const ActionCard = styled(motion(Link))`
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.875rem;
  padding: 1.25rem 1.25rem 1.125rem;
  min-height: 6.25rem;
  text-decoration: none;
  transition: border-color 220ms ease, box-shadow 220ms ease, transform 220ms ease;

  [data-theme='dark'] & {
    background: #252320;
    border-color: #3a3732;
  }

  &:hover {
    border-color: ${palette.borderStrong};
    box-shadow: 0 1px 2px rgba(20, 20, 19, 0.04), 0 10px 28px -16px rgba(20, 20, 19, 0.1);
    transform: translateY(-1px);

    [data-theme='dark'] & {
      border-color: #4a453e;
    }

    .arrow {
      opacity: 1;
      transform: translate(0, 0);
      color: ${palette.accent};
    }
  }
`;

const ActionIcon = styled.div<{ $accent?: boolean }>`
  flex-shrink: 0;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.625rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${p => (p.$accent ? palette.accentSoft : palette.surfaceAlt)};
  color: ${p => (p.$accent ? palette.accent : palette.text)};

  [data-theme='dark'] & {
    background: ${p => (p.$accent ? 'rgba(201, 100, 66, 0.18)' : '#32302b')};
    color: ${p => (p.$accent ? '#e08162' : '#ece9e0')};
  }

  svg {
    width: 1.125rem;
    height: 1.125rem;
    stroke-width: 1.6;
  }
`;

const ActionBody = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
`;

const ActionTitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
`;

const ActionTitle = styled.h3`
  font-size: 0.9375rem;
  font-weight: 600;
  color: ${palette.text};
  margin: 0;
  line-height: 1.3;
  letter-spacing: -0.01em;

  [data-theme='dark'] & {
    color: #f5f3ec;
  }
`;

const ActionDescription = styled.p`
  font-size: 0.8125rem;
  color: ${palette.textMuted};
  margin: 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;

  [data-theme='dark'] & {
    color: #b0a89c;
  }
`;

const ActionFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.25rem;
`;

const ActionArrow = styled.div.attrs({ className: 'arrow' })`
  color: ${palette.textSubtle};
  opacity: 0;
  transform: translate(-4px, 0);
  transition: opacity 220ms ease, transform 220ms ease, color 220ms ease;
  display: flex;
  align-items: center;

  svg {
    width: 1rem;
    height: 1rem;
    stroke-width: 1.8;
  }
`;

const MetricBadge = styled.div<{ $tone?: 'neutral' | 'warning' | 'danger' | 'success' }>`
  display: inline-flex;
  align-items: baseline;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  border-radius: 999px;
  background: ${p =>
    p.$tone === 'warning'
      ? palette.warningSoft
      : p.$tone === 'danger'
        ? palette.dangerSoft
        : p.$tone === 'success'
          ? palette.successSoft
          : palette.surfaceAlt};

  [data-theme='dark'] & {
    background: ${p =>
      p.$tone === 'warning'
        ? 'rgba(181, 128, 58, 0.2)'
        : p.$tone === 'danger'
          ? 'rgba(181, 67, 39, 0.2)'
          : p.$tone === 'success'
            ? 'rgba(74, 124, 89, 0.2)'
            : '#32302b'};
  }
`;

const MetricValue = styled.span<{ $tone?: 'neutral' | 'warning' | 'danger' | 'success' }>`
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.01em;
  font-feature-settings: 'tnum';
  color: ${p =>
    p.$tone === 'warning'
      ? palette.warning
      : p.$tone === 'danger'
        ? palette.danger
        : p.$tone === 'success'
          ? palette.success
          : palette.text};

  [data-theme='dark'] & {
    color: ${p =>
      p.$tone === 'warning'
        ? '#d4a165'
        : p.$tone === 'danger'
          ? '#e27d5f'
          : p.$tone === 'success'
            ? '#79b090'
            : '#ece9e0'};
  }
`;

const MetricLabel = styled.span`
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1;
  color: ${palette.textMuted};
  text-transform: lowercase;
  letter-spacing: 0.02em;

  [data-theme='dark'] & {
    color: #9a948a;
  }
`;

type MetricTone = 'neutral' | 'warning' | 'danger' | 'success';

type ActionDef = {
  to: string;
  title: string;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  accent?: boolean;
  metric?: { value: number | string; label: string; tone?: MetricTone };
};

interface AdminMetrics {
  partnersTotal?: number;
  partnerTypesCount?: number;
  pendingMenus?: number;
  pendingReceipts?: number;
  cashbackRatesCount?: number;
  whitelistCount?: number;
  pendingScans?: number;
}

const AdminDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { data: offersData } = useOffers({ limit: 100 });
  const [cashbackStats, setCashbackStats] = useState<CashbackDashboardStats | null>(null);
  const [metrics, setMetrics] = useState<AdminMetrics>({});

  useEffect(() => {
    adminCashbackService.getStats().then(setCashbackStats).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const patch = (next: Partial<AdminMetrics>) => {
      if (cancelled) return;
      setMetrics(prev => ({ ...prev, ...next }));
    };

    partnersService
      .getPartners({ limit: 1 })
      .then(res => patch({ partnersTotal: res.total ?? res.data?.length ?? 0 }))
      .catch(() => {});

    partnerTypesService
      .getPartnerTypes()
      .then(list => patch({ partnerTypesCount: list.length }))
      .catch(() => {});

    venuesService
      .adminListPendingMenus()
      .then(list => patch({ pendingMenus: list.length }))
      .catch(() => {});

    receiptsApiService
      .getPendingReviews(100)
      .then(res => patch({ pendingReceipts: res.data?.length ?? 0 }))
      .catch(() => {});

    adminCashbackService
      .getRates()
      .then(rows => patch({ cashbackRatesCount: rows.length }))
      .catch(() => {});

    fraudAdminService
      .getMerchantWhitelist()
      .then(res => patch({ whitelistCount: res.data?.length ?? 0 }))
      .catch(() => {});

    apiService
      .get<unknown>('/stickers/admin/pending-review', { status: 'MANUAL_REVIEW' })
      .then(body => {
        const count = Array.isArray(body)
          ? body.length
          : ((body as { data?: unknown[] })?.data?.length ?? 0);
        patch({ pendingScans: count });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const totalOffers = offersData?.total || 0;
  const featuredOffers = offersData?.data?.filter(o => o.isFeatured)?.length || 0;
  const activeOffers = offersData?.data?.filter(o => o.status === 'ACTIVE')?.length || 0;
  const featuredRate = totalOffers > 0 ? Math.round((featuredOffers / totalOffers) * 100) : 0;
  const pendingCashback = cashbackStats ? cashbackStats.pendingTotal.toFixed(2) : '—';
  const overdueCount = cashbackStats ? cashbackStats.overdueCount : null;

  const bg = language === 'bg';

  const today = new Date().toLocaleDateString(bg ? 'bg-BG' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const lblTotal = bg ? 'общо' : 'total';
  const lblTypes = bg ? 'типа' : 'types';
  const lblPending = bg ? 'чакат' : 'pending';
  const lblFeatured = bg ? 'топ' : 'featured';
  const lblOverdue = bg ? 'просрочени' : 'overdue';
  const lblSteps = bg ? 'стъпки' : 'steps';
  const lblMerchants = bg ? 'търговци' : 'merchants';
  const lblFlagged = bg ? 'маркирани' : 'flagged';

  const partnerActions: ActionDef[] = [
    {
      to: '/admin/partners',
      title: bg ? 'Партньори' : 'Partners',
      description: bg
        ? 'Управление на партньорски акаунти и одобрения'
        : 'Manage partner accounts and approvals',
      icon: BuildingStorefrontIcon,
      accent: true,
      metric:
        metrics.partnersTotal !== undefined
          ? { value: metrics.partnersTotal, label: lblTotal }
          : undefined,
    },
    {
      to: '/admin/partner-types',
      title: bg ? 'Типове Партньори' : 'Partner Types',
      description: bg
        ? 'Лимити за отстъпки и достъп по абонамент'
        : 'Discount rate caps and subscription plan access',
      icon: TagIcon,
      metric:
        metrics.partnerTypesCount !== undefined
          ? { value: metrics.partnerTypesCount, label: lblTypes }
          : undefined,
    },
    {
      to: '/admin/partner-onboarding',
      title: bg ? 'Въвеждане на Партньор' : 'Partner Onboarding',
      description: bg
        ? 'Ръчно въвеждане с бизнес данни, обекти и условия'
        : 'Onboard a partner with business info, venues, and terms',
      icon: HandRaisedIcon,
    },
    {
      to: '/admin/bulk-import',
      title: bg ? 'Масов Импорт' : 'Bulk Import',
      description: bg
        ? 'Импорт на партньори и оферти от CSV/Excel'
        : 'Import partners and offers from CSV or Excel',
      icon: ArrowUpTrayIcon,
    },
  ];

  const contentActions: ActionDef[] = [
    {
      to: '/admin/top-discounts',
      title: bg ? 'Топ Отстъпки' : 'Top Discounts',
      description: bg
        ? 'Управление на featured оферти — снимки и полета'
        : 'Manage featured Top Discounts — images and copy',
      icon: StarIcon,
      accent: true,
      metric: offersData
        ? { value: featuredOffers, label: lblFeatured, tone: 'neutral' }
        : undefined,
    },
    {
      to: '/admin/menu-approvals',
      title: bg ? 'Одобрения на Менюта' : 'Menu Approvals',
      description: bg
        ? 'Преглед и одобряване на URL адреси за менюта'
        : 'Review and approve partner-submitted menu URLs',
      icon: ClipboardDocumentCheckIcon,
      metric:
        metrics.pendingMenus !== undefined
          ? {
              value: metrics.pendingMenus,
              label: lblPending,
              tone: metrics.pendingMenus > 0 ? 'warning' : 'neutral',
            }
          : undefined,
    },
  ];

  const cashbackActions: ActionDef[] = [
    {
      to: '/admin/receipts',
      title: bg ? 'Преглед на Касови Бележки' : 'Receipt Review',
      description: bg
        ? 'Одобрявайте, отхвърляйте и управлявайте начисления'
        : 'Approve, reject, and manage cashback credits',
      icon: ReceiptPercentIcon,
      accent: true,
      metric:
        metrics.pendingReceipts !== undefined
          ? {
              value: metrics.pendingReceipts,
              label: lblPending,
              tone: metrics.pendingReceipts > 0 ? 'warning' : 'neutral',
            }
          : undefined,
    },
    {
      to: '/admin/cashback',
      title: bg ? 'Плащания за Кешбек' : 'Cashback Payments',
      description: bg
        ? 'Месечни кешбек задължения на партньорите'
        : 'Track monthly cashback owed by partners',
      icon: BanknotesIcon,
      metric: cashbackStats
        ? {
            value: cashbackStats.overdueCount,
            label: lblOverdue,
            tone: cashbackStats.overdueCount > 0 ? 'danger' : 'neutral',
          }
        : undefined,
    },
    {
      to: '/admin/cashback/rates',
      title: bg ? 'Ставки за Кешбек' : 'Cashback Rates',
      description: bg
        ? 'Матрица на ставки по ниво и категория'
        : 'Rate matrix by tier and category',
      icon: CurrencyDollarIcon,
      metric:
        metrics.cashbackRatesCount !== undefined
          ? { value: metrics.cashbackRatesCount, label: lblSteps }
          : undefined,
    },
  ];

  const fraudActions: ActionDef[] = [
    {
      to: '/admin/merchant-whitelist',
      title: bg ? 'Списък Търговци' : 'Merchant Whitelist',
      description: bg
        ? 'Одобрени и блокирани търговци за проверка'
        : 'Approved and blocked merchants for verification',
      icon: ShieldCheckIcon,
      metric:
        metrics.whitelistCount !== undefined
          ? { value: metrics.whitelistCount, label: lblMerchants }
          : undefined,
    },
    {
      to: '/admin/venue-fraud-config',
      title: bg ? 'Конфиг за Измами' : 'Venue Fraud Config',
      description: bg
        ? 'Прагове за измами, GPS и OCR проверки'
        : 'Fraud thresholds, GPS and OCR verification',
      icon: Cog6ToothIcon,
    },
    {
      to: '/admin/receipt-templates',
      title: bg ? 'Шаблони за Бележки' : 'Receipt Templates',
      description: bg
        ? 'Шаблони за визуално сравнение по обекти'
        : 'Visual comparison templates per venue',
      icon: DocumentTextIcon,
    },
    {
      to: '/admin/scan-review',
      title: bg ? 'Преглед на Сканирания' : 'Scan Review',
      description: bg
        ? 'Ръчен преглед на сканирания с възможна измама'
        : 'Manual review of scans flagged as suspicious',
      icon: MagnifyingGlassIcon,
      metric:
        metrics.pendingScans !== undefined
          ? {
              value: metrics.pendingScans,
              label: lblFlagged,
              tone: metrics.pendingScans > 0 ? 'danger' : 'neutral',
            }
          : undefined,
    },
  ];

  const renderSection = (titleText: string, hint: string, actions: ActionDef[]) => (
    <SectionGroup>
      <SectionHead>
        <SectionTitle>{titleText}</SectionTitle>
        <SectionHint>{hint}</SectionHint>
      </SectionHead>
      <ActionsGrid>
        {actions.map((a, idx) => (
          <ActionCard
            key={a.to}
            to={a.to}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * idx, duration: 0.28 }}
          >
            <ActionIcon $accent={a.accent}>
              <a.icon />
            </ActionIcon>
            <ActionBody>
              <ActionTitleRow>
                <ActionTitle>{a.title}</ActionTitle>
                <ActionArrow>
                  <ArrowUpRightIcon />
                </ActionArrow>
              </ActionTitleRow>
              <ActionDescription>{a.description}</ActionDescription>
              {a.metric && (
                <ActionFooter>
                  <MetricBadge $tone={a.metric.tone ?? 'neutral'}>
                    <MetricValue $tone={a.metric.tone ?? 'neutral'}>{a.metric.value}</MetricValue>
                    <MetricLabel>{a.metric.label}</MetricLabel>
                  </MetricBadge>
                </ActionFooter>
              )}
            </ActionBody>
          </ActionCard>
        ))}
      </ActionsGrid>
    </SectionGroup>
  );

  return (
    <PageShell>
      <PageContainer>
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
                ? 'Обзор на платформата — оферти, кешбек и проверки за измами.'
                : 'An overview of the platform — offers, cashback, and fraud review at a glance.'}
            </Subtitle>
          </HeaderLeft>
          <DateChip>
            <DateLabel>{bg ? 'Днес' : 'Today'}</DateLabel>
            <DateValue>{today}</DateValue>
          </DateChip>
        </PageHeader>

        <StatsGrid>
          <StatCard
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <StatTop>
              <StatLabel>{bg ? 'Общо Оферти' : 'Total Offers'}</StatLabel>
              <StatIconBox>
                <ChartBarIcon />
              </StatIconBox>
            </StatTop>
            <div>
              <StatValue>{totalOffers}</StatValue>
              <StatChange>{bg ? 'Всички оферти' : 'All offers'}</StatChange>
            </div>
          </StatCard>

          <StatCard
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <StatTop>
              <StatLabel>{bg ? 'Топ Оферти' : 'Featured'}</StatLabel>
              <StatIconBox $tone="accent">
                <StarIcon />
              </StatIconBox>
            </StatTop>
            <div>
              <StatValue>{featuredOffers}</StatValue>
              <StatChange>
                {bg ? `${featuredRate}% от всички` : `${featuredRate}% of all offers`}
              </StatChange>
            </div>
          </StatCard>

          <StatCard
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <StatTop>
              <StatLabel>{bg ? 'Активни Оферти' : 'Active Offers'}</StatLabel>
              <StatIconBox $tone="success">
                <CheckCircleIcon />
              </StatIconBox>
            </StatTop>
            <div>
              <StatValue>{activeOffers}</StatValue>
              <StatChange $positive>
                {bg ? 'Видими за клиенти' : 'Visible to customers'}
              </StatChange>
            </div>
          </StatCard>

          <StatCard
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <StatTop>
              <StatLabel>{bg ? 'Очакван Кешбек' : 'Pending Cashback'}</StatLabel>
              <StatIconBox>
                <BanknotesIcon />
              </StatIconBox>
            </StatTop>
            <div>
              <StatValue>
                {pendingCashback === '—' ? '—' : `${pendingCashback} ${bg ? 'лв.' : 'BGN'}`}
              </StatValue>
              <StatChange>{bg ? 'Неплатен от партньори' : 'Unpaid by partners'}</StatChange>
            </div>
          </StatCard>

          <StatCard
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <StatTop>
              <StatLabel>{bg ? 'Просрочени' : 'Overdue Partners'}</StatLabel>
              <StatIconBox $tone={overdueCount && overdueCount > 0 ? 'danger' : 'neutral'}>
                <ExclamationTriangleIcon />
              </StatIconBox>
            </StatTop>
            <div>
              <StatValue $danger={!!overdueCount && overdueCount > 0}>
                {overdueCount !== null ? overdueCount : '—'}
              </StatValue>
              <StatChange $warning={!!overdueCount && overdueCount > 0}>
                {overdueCount && overdueCount > 0
                  ? bg
                    ? 'Нуждаят се от внимание'
                    : 'Require attention'
                  : bg
                    ? 'Всички са актуални'
                    : 'All current'}
              </StatChange>
            </div>
          </StatCard>
        </StatsGrid>

        {renderSection(
          bg ? 'Партньори' : 'Partners',
          bg ? 'Акаунти, типове и въвеждане' : 'Accounts, types, and onboarding',
          partnerActions,
        )}

        {renderSection(
          bg ? 'Съдържание' : 'Content',
          bg ? 'Оферти и одобрения' : 'Offers and approvals',
          contentActions,
        )}

        {renderSection(
          bg ? 'Кешбек и Бележки' : 'Cashback & Receipts',
          bg ? 'Прегледи, плащания и ставки' : 'Reviews, payments, and rates',
          cashbackActions,
        )}

        {renderSection(
          bg ? 'Измами и Съответствие' : 'Fraud & Compliance',
          bg ? 'Търговци, прагове и проверки' : 'Merchants, thresholds, and verification',
          fraudActions,
        )}
      </PageContainer>
    </PageShell>
  );
};

export default AdminDashboardPage;
