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
  UsersIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { adminDashboardService, AdminDashboardStats } from '../../services/adminDashboard.service';
import { adminAlertsService, AdminAlertsResult, AlertTier } from '../../services/adminAlerts.service';
import { palette } from '../../styles/adminTheme';
import {
  ALERT_ICON_BY_ID,
  ALERT_FALLBACK_ICON,
  getAlertTitle,
} from '../../utils/adminAlertCatalog';

// Spec §3 framing — dashboard is for at-a-glance situational awareness.
// 60s matches AdminAlertsPage so badge counts stay in sync between pages.
const REFRESH_INTERVAL_MS = 60_000;

const fmt2 = (n: number | undefined | null): string =>
  typeof n === 'number' && Number.isFinite(n) ? n.toFixed(2) : '—';

// Format an ISO timestamp as "HH:MM" 24-hour. Guards against Invalid Date
// (empty/malformed strings past the truthy check) so a bad payload doesn't
// render "Updated Invalid Date" on the dashboard.
const fmtClock = (iso: string | undefined | null, locale: string): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
};

// Tile destination permission keys mirror AdminNav.ts. Used to hide tiles
// from users with `dashboard.read` but missing the destination perm — clicking
// would otherwise navigate to a page they can't render.
const TILE_PERMS = {
  subscribers: 'subscribers.read',
  transactions: 'transactions.read',
  cashback: 'cashback.read',
  partners: 'partners.read',
  payouts: 'finance.payouts.read',
} as const;

/* ─── Palette ─────────────────────────────────────────────────────────────── */

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
  flex-wrap: wrap;
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

const AlertHeadLeft = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
`;

const AlertHeadRight = styled.div`
  display: flex;
  align-items: center;
  gap: 0.875rem;
`;

const TotalCountPill = styled.span<{ $hasCritical: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.75rem;
  height: 1.5rem;
  padding: 0 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  font-feature-settings: 'tnum';
  background: ${p => (p.$hasCritical ? palette.dangerSoft : palette.surfaceAlt)};
  color: ${p => (p.$hasCritical ? palette.danger : palette.textMuted)};

  [data-theme='dark'] & {
    background: ${p => (p.$hasCritical ? 'rgba(181,67,39,0.25)' : '#3a3732')};
    color: ${p => (p.$hasCritical ? '#e27d5f' : '#b8b0a3')};
  }
`;

const UpdatedAt = styled.span`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  font-feature-settings: 'tnum';

  [data-theme='dark'] & {
    color: #9a948a;
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

const ForbiddenBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 1rem 1.25rem;
  background: ${palette.surfaceAlt};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  color: ${palette.textMuted};

  [data-theme='dark'] & {
    background: #252320;
    border-color: #3a3732;
    color: #b8b0a3;
  }

  svg {
    width: 1.125rem;
    height: 1.125rem;
    flex-shrink: 0;
  }
`;

const ErrorBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 1rem 1.25rem;
  background: ${palette.warningSoft};
  border: 1px solid #e8d8ad;
  border-radius: 0.75rem;
  color: ${palette.warning};

  [data-theme='dark'] & {
    background: rgba(181, 128, 58, 0.12);
    border-color: rgba(181, 128, 58, 0.3);
    color: #d4a165;
  }

  svg {
    width: 1.125rem;
    height: 1.125rem;
    flex-shrink: 0;
  }
`;

const BannerText = styled.p`
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0;
`;

/* ─── Stats Grid ───────────────────────────────────────────────────────────── */
const StatsSectionHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.25rem;
`;

const StatsSectionTitle = styled.h2`
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

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13.5rem, 1fr));
  gap: 1rem;
`;

const StatCard = styled(motion(Link))`
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
  text-decoration: none;
  color: inherit;
  cursor: pointer;

  [data-theme='dark'] & {
    background: #252320;
    border-color: #3a3732;
  }

  &:hover {
    border-color: ${palette.borderStrong};
    box-shadow: 0 1px 2px rgba(20, 20, 19, 0.04), 0 8px 24px -16px rgba(20, 20, 19, 0.08);
    transform: translateY(-1px);

    [data-theme='dark'] & {
      border-color: #4a453e;
    }
  }

  &:focus-visible {
    outline: 2px solid ${palette.accent};
    outline-offset: 2px;
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
  const [statsGeneratedAt, setStatsGeneratedAt] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AdminAlertsResult | null>(null);
  // Tracks whether the most recent alerts fetch errored. Used to dim the
  // "Updated HH:MM" indicator so a mid-session failure doesn't silently
  // present stale counts as fresh.
  const [alertsStale, setAlertsStale] = useState<boolean>(false);
  // alertsForbidden: first load returned 403 — admin lacks control.risk.read.
  // alertsLoadError: first load failed for any other reason (network, 5xx, etc.).
  // Both are reset to false when a subsequent auto-refresh succeeds so that a
  // transient failure during later polls doesn't leave the panel permanently broken.
  const [alertsForbidden, setAlertsForbidden] = useState<boolean>(false);
  const [alertsLoadError, setAlertsLoadError] = useState<boolean>(false);

  const permissions: string[] = user?.permissions ?? [];
  const isSuperAdmin = user?.rawRole === 'SUPER_ADMIN';
  // Permission gate for tile destinations. When no user is loaded (the
  // /admin-preview route renders without auth; SSR has no user during first
  // pass), default-open so the dashboard isn't empty — the destination page
  // enforces its own permissions anyway.
  const can = (key: string): boolean =>
    !user || isSuperAdmin || permissions.includes(key);

  const bg = language === 'bg';

  // Shared auto-refresh: fires immediately on mount (force=true so the very
  // first load populates even if the tab opens hidden), then on a timer that's
  // paused while the tab is hidden (the browser still pings the API on hidden
  // tabs for hours of an open admin session — that's load with no benefit).
  // A visibility listener triggers a catch-up fetch when the tab returns.
  // Returns the cleanup function each useEffect can return directly.
  function startAutoRefresh(load: () => void): () => void {
    const isMounted = { current: true };
    const safeLoad = (force = false) => {
      if (!isMounted.current) return;
      if (!force && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      load();
    };
    safeLoad(true);
    const id = setInterval(() => safeLoad(false), REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') safeLoad(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      isMounted.current = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }

  useEffect(() => {
    const mounted = { current: true };
    const cleanup = startAutoRefresh(() => {
      adminDashboardService
        .getStatsWithMeta()
        .then(env => {
          if (!mounted.current) return;
          setDashStats(env.data);
          setStatsGeneratedAt(env.generatedAt);
        })
        // Silent failure preserves the last-known good values + timestamp.
        // Staleness is surfaced to the user via the "Updated HH:MM" indicator.
        .catch(() => {});
    });
    return () => {
      mounted.current = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const emptyAlerts: AdminAlertsResult = {
      critical: [],
      operational: [],
      informational: [],
      totalCount: 0,
      generatedAt: '',
    };
    const mounted = { current: true };
    let isFirstLoad = true;
    const cleanup = startAutoRefresh(() => {
      adminAlertsService
        .getAlerts()
        .then(result => {
          if (!mounted.current) return;
          setAlerts(result);
          setAlertsStale(false);
          setAlertsForbidden(false);
          setAlertsLoadError(false);
          isFirstLoad = false;
        })
        .catch((err: unknown) => {
          // Only blank the panel on the very first load failure. Later transient
          // failures (network blip during a 60s auto-refresh tick) must NOT wipe
          // the previously-shown alerts — otherwise the user briefly sees an
          // "All clear" banner that isn't true. Mark stale so the timestamp
          // chip flips to "Stale HH:MM" and the user knows counts aren't fresh.
          if (!mounted.current) return;
          if (isFirstLoad) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            setAlerts(emptyAlerts);
            if (status === 403) {
              setAlertsForbidden(true);
            } else {
              setAlertsLoadError(true);
            }
            isFirstLoad = false;
          } else {
            setAlertsStale(true);
          }
        });
    });
    return () => {
      mounted.current = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dateLocale = bg ? 'bg-BG' : 'en-GB';
  const alertsUpdatedAt = fmtClock(alerts?.generatedAt, dateLocale);
  const statsUpdatedAt = fmtClock(statsGeneratedAt, dateLocale);

  // Header pill: number of distinct alert *categories* currently firing
  // (more digestible than `totalCount` which sums underlying entities and
  // could read as e.g. "47 alerts" when really it's "3 alerts with 47 items").
  const alertCategoryCount = alerts
    ? alerts.critical.length + alerts.operational.length + alerts.informational.length
    : 0;

  // "Транзакции днес" tile deep-links to the transactions list with dateFrom
  // set to today's local midnight so the landing-page count matches the tile.
  // Recomputed per render (cheap) — previously memoised against statsGeneratedAt,
  // but if the stats API errored at midnight the link would stay frozen on the
  // previous day's date until a successful poll.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartIso = todayStart.toISOString();

  const today = new Date().toLocaleDateString(dateLocale, {
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
            <AlertHeadLeft>
              <AlertSectionTitle>
                {bg ? 'Сигнали и известия' : 'Alerts & Notices'}
              </AlertSectionTitle>
              {alerts && alertCategoryCount > 0 && (
                <TotalCountPill
                  $hasCritical={alerts.critical.length > 0}
                  title={
                    bg
                      ? `${alertCategoryCount} категории сигнали изискват внимание`
                      : `${alertCategoryCount} alert categories need attention`
                  }
                >
                  {alertCategoryCount}
                </TotalCountPill>
              )}
            </AlertHeadLeft>
            <AlertHeadRight>
              {alertsUpdatedAt && (
                <UpdatedAt
                  title={
                    alertsStale
                      ? bg
                        ? 'Последното обновяване е неуспешно — показват се по-стари данни.'
                        : 'Latest refresh failed — showing previously-loaded data.'
                      : undefined
                  }
                  style={alertsStale ? { color: palette.warning } : undefined}
                >
                  {alertsStale
                    ? bg
                      ? `⚠ Стари данни от ${alertsUpdatedAt}`
                      : `⚠ Stale since ${alertsUpdatedAt}`
                    : bg
                      ? `Актуализирано ${alertsUpdatedAt}`
                      : `Updated ${alertsUpdatedAt}`}
                </UpdatedAt>
              )}
              {!alertsForbidden && !alertsLoadError && (
                <AlertSectionLink to="/admin/dashboard/alerts">
                  {bg ? 'Виж всички →' : 'View all →'}
                </AlertSectionLink>
              )}
            </AlertHeadRight>
          </AlertSectionHead>

          {alerts === null ? null : alertsForbidden ? (
            <ForbiddenBanner>
              <LockClosedIcon />
              <BannerText>
                {bg
                  ? 'Нямате право за преглед на сигналите. Свържете се с администратор за достъп.'
                  : 'You do not have permission to view alerts. Contact an administrator to request access.'}
              </BannerText>
            </ForbiddenBanner>
          ) : alertsLoadError ? (
            <ErrorBanner>
              <ExclamationTriangleIcon />
              <BannerText>
                {bg
                  ? 'Грешка при зареждане на сигналите. Опитайте да опресните страницата.'
                  : 'Failed to load alerts. Try refreshing the page.'}
              </BannerText>
            </ErrorBanner>
          ) : (alerts.totalCount ?? 0) === 0 ? (
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
              {(
                [
                  // Tier key is stable across language toggles — using the translated
                  // label as React key would remount the whole section and replay
                  // framer-motion animations every time the user switches BG↔EN.
                  ['critical', alerts.critical, bg ? 'Критични' : 'Critical', true],
                  ['operational', alerts.operational, bg ? 'Оперативни' : 'Operational', true],
                  ['informational', alerts.informational, bg ? 'Информационни' : 'Informational', false],
                ] as const
              ).map(([tierKey, items, label, withGap]) =>
                items.length === 0 ? null : (
                  <React.Fragment key={tierKey}>
                    <TierLabel>{label}</TierLabel>
                    <AlertGrid style={withGap ? { marginBottom: '1.25rem' } : undefined}>
                      {items.map((alert, idx) => {
                        const sev = tierToSeverity(alert.tier);
                        const Icon = ALERT_ICON_BY_ID[alert.id] ?? ALERT_FALLBACK_ICON;
                        const baseTitle = getAlertTitle(alert.id, alert.title, bg ? 'bg' : 'en');
                        const threshold = alert.meta?.['threshold'];
                        const title =
                          typeof threshold === 'number' || typeof threshold === 'string'
                            ? `${baseTitle} (≥${threshold} ${bg ? 'лв' : 'BGN'})`
                            : baseTitle;
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
                              <Icon />
                            </AlertIconBox>
                            <AlertBody>
                              <AlertTitle>{title}</AlertTitle>
                            </AlertBody>
                            <AlertCount $severity={sev}>{alert.count}</AlertCount>
                          </AlertCard>
                        );
                      })}
                    </AlertGrid>
                  </React.Fragment>
                ),
              )}
            </>
          )}
        </AlertSection>

        {/* Обзор — spec §3.1 */}
        <StatsSectionHead>
          <StatsSectionTitle>{bg ? 'Обзор' : 'Overview'}</StatsSectionTitle>
          {statsUpdatedAt && (
            <UpdatedAt>
              {bg ? `Актуализирано ${statsUpdatedAt}` : `Updated ${statsUpdatedAt}`}
            </UpdatedAt>
          )}
        </StatsSectionHead>
        <StatsGrid>
          {can(TILE_PERMS.subscribers) && (
            <StatCard
              to="/admin/subscribers/all?status=ACTIVE&accountStatus=ACTIVE&activeStat=active"
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
          )}

          {can(TILE_PERMS.transactions) && (
            <StatCard
              to={`/admin/subscribers/transactions?dateFrom=${todayStartIso}`}
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
                    {bg ? 'общ оборот (за всички времена)' : 'lifetime turnover'}
                  </StatSub>
                </StatSubs>
              </div>
            </StatCard>
          )}

          {can(TILE_PERMS.cashback) && (
            <StatCard
              to="/admin/subscribers/cashback"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <StatTop>
                <StatLabel>{bg ? 'Кешбек — начислен' : 'Cashback — accrued'}</StatLabel>
                <StatIconBox>
                  <BanknotesIcon />
                </StatIconBox>
              </StatTop>
              <div>
                <StatValue>
                  {`${fmt2(dashStats?.cashback.accrued)} ${bg ? 'лв.' : 'BGN'}`}
                </StatValue>
                <StatSubs>
                  <StatSub>
                    <strong>{fmt2(dashStats?.cashback.approved)}</strong>{' '}
                    {bg ? 'одобрен' : 'approved'}
                  </StatSub>
                  <StatSub>
                    <strong>{fmt2(dashStats?.cashback.pending)}</strong>{' '}
                    {bg ? 'изчакващ' : 'pending'}
                  </StatSub>
                  <StatSub>
                    <strong>{fmt2(dashStats?.cashback.expiringSoon)}</strong>{' '}
                    {bg ? 'изтичащ (7 дни)' : 'expiring (7d)'}
                  </StatSub>
                </StatSubs>
              </div>
            </StatCard>
          )}

          {can(TILE_PERMS.partners) && (
            <StatCard
              to="/admin/partners/active"
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
          )}

          {can(TILE_PERMS.payouts) && (
            <StatCard
              to="/admin/finance/payouts"
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
          )}
        </StatsGrid>
      </PageContainer>
    </PageShell>
  );
};

export default AdminDashboardPage;
