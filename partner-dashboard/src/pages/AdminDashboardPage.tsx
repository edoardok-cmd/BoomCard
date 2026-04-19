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
  ArrowRightIcon,
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

const PageContainer = styled.div`
  max-width: 80rem;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
  min-height: calc(100vh - 4rem);
`;

const PageHeader = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 2rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--color-border, #e5e7eb);

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
`;

const Eyebrow = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-secondary, #6b7280);

  &::before {
    content: '';
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
  }
`;

const Title = styled.h1`
  font-size: 1.875rem;
  font-weight: 700;
  color: var(--color-text-primary, #0f172a);
  margin: 0;
  letter-spacing: -0.02em;

  @media (max-width: 640px) {
    font-size: 1.5rem;
  }
`;

const Subtitle = styled.p`
  font-size: 0.9375rem;
  color: var(--color-text-secondary, #64748b);
  margin: 0;
`;

const HeaderMeta = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary, #64748b);

  @media (max-width: 640px) {
    align-items: flex-start;
  }
`;

const MetaLabel = styled.span`
  font-weight: 600;
  color: var(--color-text-primary, #0f172a);
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.875rem;
  margin-bottom: 2.5rem;
`;

const StatCard = styled(motion.div)<{ $accent?: string }>`
  position: relative;
  background: var(--color-background, #ffffff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 0.75rem;
  padding: 1.25rem 1.25rem 1.125rem;
  transition: border-color 150ms ease, box-shadow 150ms ease;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: ${p => p.$accent || '#0f172a'};
    opacity: 0.9;
  }

  &:hover {
    border-color: var(--color-text-tertiary, #cbd5e1);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.06);
  }
`;

const StatTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
`;

const StatLabel = styled.p`
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0;
`;

const StatIconBox = styled.div<{ $color?: string; $bg?: string }>`
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${p => p.$bg || 'var(--color-background-tertiary, #f1f5f9)'};
  color: ${p => p.$color || 'var(--color-text-secondary, #475569)'};

  svg {
    width: 1rem;
    height: 1rem;
  }
`;

const StatValue = styled.h3<{ $danger?: boolean }>`
  font-size: 1.875rem;
  font-weight: 700;
  color: ${p => (p.$danger ? '#dc2626' : 'var(--color-text-primary, #0f172a)')};
  margin: 0 0 0.25rem 0;
  letter-spacing: -0.025em;
  font-feature-settings: 'tnum';
`;

const StatChange = styled.p<{ $positive?: boolean; $warning?: boolean }>`
  font-size: 0.8125rem;
  color: ${p =>
    p.$positive ? '#059669' : p.$warning ? '#d97706' : 'var(--color-text-secondary, #64748b)'};
  font-weight: 500;
  margin: 0;
`;

const SectionGroup = styled.section`
  margin-bottom: 2rem;
`;

const SectionHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.875rem;
`;

const SectionTitle = styled.h2`
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-text-secondary, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0;
`;

const SectionHint = styled.span`
  font-size: 0.75rem;
  color: var(--color-text-tertiary, #94a3b8);
  text-align: right;

  @media (max-width: 640px) {
    display: none;
  }
`;

const ActionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
  gap: 0.75rem;
`;

const ActionCard = styled(Link)`
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  background: var(--color-background, #ffffff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 0.625rem;
  padding: 0.875rem 1rem;
  text-decoration: none;
  transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;

  &:hover {
    border-color: #94a3b8;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.06);

    .arrow {
      opacity: 1;
      transform: translateX(0);
    }
  }
`;

const ActionIcon = styled.div<{ $tint?: string }>`
  flex-shrink: 0;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${p => p.$tint || 'var(--color-background-tertiary, #f1f5f9)'};
  color: ${p => (p.$tint ? '#ffffff' : 'var(--color-text-secondary, #475569)')};

  svg {
    width: 1.125rem;
    height: 1.125rem;
  }
`;

const ActionBody = styled.div`
  flex: 1;
  min-width: 0;
`;

const ActionTitle = styled.h3`
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text-primary, #0f172a);
  margin: 0 0 0.1875rem 0;
  line-height: 1.3;
`;

const ActionDescription = styled.p`
  font-size: 0.8125rem;
  color: var(--color-text-secondary, #64748b);
  margin: 0;
  line-height: 1.45;
`;

const ActionArrow = styled.div.attrs({ className: 'arrow' })`
  flex-shrink: 0;
  align-self: center;
  color: var(--color-text-tertiary, #94a3b8);
  opacity: 0;
  transform: translateX(-4px);
  transition: all 150ms ease;

  svg {
    width: 1rem;
    height: 1rem;
  }
`;

const MetricBadge = styled.div<{ $tone?: 'neutral' | 'warning' | 'danger' | 'success' }>`
  flex-shrink: 0;
  align-self: center;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.125rem;
  padding: 0.3125rem 0.625rem;
  border-radius: 0.5rem;
  min-width: 3rem;
  background: ${p =>
    p.$tone === 'warning'
      ? '#fffbeb'
      : p.$tone === 'danger'
        ? '#fef2f2'
        : p.$tone === 'success'
          ? '#ecfdf5'
          : 'var(--color-background-tertiary, #f1f5f9)'};
  border: 1px solid
    ${p =>
      p.$tone === 'warning'
        ? '#fde68a'
        : p.$tone === 'danger'
          ? '#fecaca'
          : p.$tone === 'success'
            ? '#a7f3d0'
            : 'var(--color-border, #e5e7eb)'};
`;

const MetricValue = styled.span<{ $tone?: 'neutral' | 'warning' | 'danger' | 'success' }>`
  font-size: 1rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.01em;
  font-feature-settings: 'tnum';
  color: ${p =>
    p.$tone === 'warning'
      ? '#b45309'
      : p.$tone === 'danger'
        ? '#b91c1c'
        : p.$tone === 'success'
          ? '#047857'
          : 'var(--color-text-primary, #0f172a)'};
`;

const MetricLabel = styled.span`
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1;
  color: var(--color-text-secondary, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

type MetricTone = 'neutral' | 'warning' | 'danger' | 'success';

type ActionDef = {
  to: string;
  title: string;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  tint?: string;
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
      tint: '#0f172a',
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
      tint: '#ea580c',
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
      tint: '#0891b2',
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
      tint: '#059669',
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
        {actions.map(a => (
          <ActionCard key={a.to} to={a.to}>
            <ActionIcon $tint={a.tint}>
              <a.icon />
            </ActionIcon>
            <ActionBody>
              <ActionTitle>{a.title}</ActionTitle>
              <ActionDescription>{a.description}</ActionDescription>
            </ActionBody>
            {a.metric && (
              <MetricBadge $tone={a.metric.tone ?? 'neutral'}>
                <MetricValue $tone={a.metric.tone ?? 'neutral'}>{a.metric.value}</MetricValue>
                <MetricLabel>{a.metric.label}</MetricLabel>
              </MetricBadge>
            )}
            <ActionArrow>
              <ArrowRightIcon />
            </ActionArrow>
          </ActionCard>
        ))}
      </ActionsGrid>
    </SectionGroup>
  );

  return (
    <PageContainer>
      <PageHeader>
        <HeaderLeft>
          <Eyebrow>{bg ? 'Администрация' : 'Administration'}</Eyebrow>
          <Title>{bg ? 'Администраторски Панел' : 'Admin Dashboard'}</Title>
          <Subtitle>
            {bg
              ? `Добре дошли обратно, ${user?.firstName || 'Admin'}. Ето обзор на платформата.`
              : `Welcome back, ${user?.firstName || 'Admin'}. Here's an overview of the platform.`}
          </Subtitle>
        </HeaderLeft>
        <HeaderMeta>
          <MetaLabel>{bg ? 'Днес' : 'Today'}</MetaLabel>
          <span>{today}</span>
        </HeaderMeta>
      </PageHeader>

      <StatsGrid>
        <StatCard
          $accent="#0f172a"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <StatTop>
            <StatLabel>{bg ? 'Общо Оферти' : 'Total Offers'}</StatLabel>
            <StatIconBox $bg="rgba(15,23,42,0.06)" $color="var(--color-text-primary, #0f172a)">
              <ChartBarIcon />
            </StatIconBox>
          </StatTop>
          <StatValue>{totalOffers}</StatValue>
          <StatChange>{bg ? 'Всички оферти' : 'All offers'}</StatChange>
        </StatCard>

        <StatCard
          $accent="#ea580c"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <StatTop>
            <StatLabel>{bg ? 'Топ Оферти' : 'Featured'}</StatLabel>
            <StatIconBox $bg="#fff7ed" $color="#ea580c">
              <StarIcon />
            </StatIconBox>
          </StatTop>
          <StatValue>{featuredOffers}</StatValue>
          <StatChange $positive>
            {bg ? `${featuredRate}% от всички оферти` : `${featuredRate}% of all offers`}
          </StatChange>
        </StatCard>

        <StatCard
          $accent="#059669"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <StatTop>
            <StatLabel>{bg ? 'Активни Оферти' : 'Active Offers'}</StatLabel>
            <StatIconBox $bg="#ecfdf5" $color="#059669">
              <CheckCircleIcon />
            </StatIconBox>
          </StatTop>
          <StatValue>{activeOffers}</StatValue>
          <StatChange $positive>{bg ? 'Видими за клиенти' : 'Visible to customers'}</StatChange>
        </StatCard>

        <StatCard
          $accent="#0891b2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <StatTop>
            <StatLabel>{bg ? 'Очакван Кешбек' : 'Pending Cashback'}</StatLabel>
            <StatIconBox $bg="#ecfeff" $color="#0891b2">
              <BanknotesIcon />
            </StatIconBox>
          </StatTop>
          <StatValue>
            {pendingCashback === '—' ? '—' : `${pendingCashback} ${bg ? 'лв.' : 'BGN'}`}
          </StatValue>
          <StatChange>{bg ? 'Неплатен от партньори' : 'Unpaid by partners'}</StatChange>
        </StatCard>

        <StatCard
          $accent={overdueCount && overdueCount > 0 ? '#dc2626' : '#64748b'}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <StatTop>
            <StatLabel>{bg ? 'Просрочени Партньори' : 'Overdue Partners'}</StatLabel>
            <StatIconBox
              $bg={overdueCount && overdueCount > 0 ? '#fef2f2' : 'var(--color-background-tertiary, #f1f5f9)'}
              $color={overdueCount && overdueCount > 0 ? '#dc2626' : 'var(--color-text-secondary, #64748b)'}
            >
              <ExclamationTriangleIcon />
            </StatIconBox>
          </StatTop>
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
  );
};

export default AdminDashboardPage;
