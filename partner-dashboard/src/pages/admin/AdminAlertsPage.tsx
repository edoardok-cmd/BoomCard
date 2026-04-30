import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import {
  BellAlertIcon,
  CheckCircleIcon,
  ArrowUpRightIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  adminAlertsService,
  AdminAlert,
  AdminAlertsResult,
  AlertSeverity,
  AlertTier,
} from '../../services/adminAlerts.service';

/* ─── Palette (matches admin dashboard) ───────────────────────────────────── */
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

/* ─── Styled components ────────────────────────────────────────────────────── */
const Shell = styled.div`
  padding: 2rem 0 4rem;
`;

const RefreshRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-bottom: 1.5rem;
`;

const RefreshBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: ${palette.textMuted};
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  transition: color 180ms ease, background 180ms ease;

  svg {
    width: 0.875rem;
    height: 0.875rem;
  }

  &:hover {
    color: ${palette.text};
    background: ${palette.surfaceAlt};
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const Timestamp = styled.span`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-right: 0.75rem;
`;

const TierSection = styled.div`
  & + & {
    margin-top: 2rem;
  }
`;

const TierHeading = styled.h3`
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

const AlertList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
`;

const AlertRow = styled(motion(Link))<{ $severity: AlertSeverity }>`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
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
      p.$severity === 'danger'
        ? 'rgba(181,67,39,0.4)'
        : p.$severity === 'warning'
          ? 'rgba(181,128,58,0.4)'
          : '#3a3732'};
    border-left-color: ${p =>
      p.$severity === 'danger'
        ? '#e27d5f'
        : p.$severity === 'warning'
          ? '#d4a165'
          : palette.accent};
  }

  &:hover {
    box-shadow: 0 4px 16px -8px rgba(20, 20, 19, 0.1);
    transform: translateY(-1px);
  }
`;

const AlertIconBox = styled.div<{ $severity: AlertSeverity }>`
  flex-shrink: 0;
  width: 2.25rem;
  height: 2.25rem;
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
    width: 1.125rem;
    height: 1.125rem;
    stroke-width: 1.75;
  }
`;

const AlertContent = styled.div`
  flex: 1 1 auto;
  min-width: 0;
`;

const AlertTitle = styled.p`
  font-size: 0.9375rem;
  font-weight: 600;
  color: ${palette.text};
  margin: 0;
  line-height: 1.3;

  [data-theme='dark'] & {
    color: #f5f3ec;
  }
`;

const AlertRight = styled.div`
  display: flex;
  align-items: center;
  gap: 0.875rem;
  flex-shrink: 0;
`;

const CountBadge = styled.span<{ $severity: AlertSeverity }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.5rem;
  border-radius: 999px;
  font-size: 0.875rem;
  font-weight: 700;
  font-feature-settings: 'tnum';
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

const ArrowIcon = styled.div`
  color: ${palette.textSubtle};
  display: flex;
  align-items: center;

  svg {
    width: 1rem;
    height: 1rem;
    stroke-width: 1.8;
  }
`;

const AllClearCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.875rem;
  padding: 4rem 2rem;
  background: ${palette.successSoft};
  border: 1px solid #b8d8c0;
  border-radius: 1rem;
  color: ${palette.success};
  text-align: center;

  [data-theme='dark'] & {
    background: rgba(74, 124, 89, 0.1);
    border-color: rgba(74, 124, 89, 0.25);
    color: #79b090;
  }

  svg {
    width: 2.5rem;
    height: 2.5rem;
    opacity: 0.7;
  }
`;

const AllClearTitle = styled.h3`
  font-family: 'Tiempos Headline', 'Copernicus', 'Georgia', serif;
  font-size: 1.5rem;
  font-weight: 400;
  margin: 0;
  letter-spacing: -0.01em;
`;

const AllClearBody = styled.p`
  font-size: 0.9375rem;
  margin: 0;
  opacity: 0.8;
`;

const LoadingCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  padding: 4rem 2rem;
  color: ${palette.textMuted};
  font-size: 0.9375rem;

  svg {
    width: 1.125rem;
    height: 1.125rem;
  }
`;

const ErrorCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.875rem;
  padding: 4rem 2rem;
  background: ${palette.dangerSoft};
  border: 1px solid #e8b8ad;
  border-radius: 1rem;
  color: ${palette.danger};
  text-align: center;

  [data-theme='dark'] & {
    background: rgba(181, 67, 39, 0.1);
    border-color: rgba(181, 67, 39, 0.3);
    color: #e27d5f;
  }

  svg {
    width: 2.5rem;
    height: 2.5rem;
    opacity: 0.7;
  }
`;

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
function tierToSeverity(tier: AlertTier): AlertSeverity {
  if (tier === 'critical') return 'danger';
  if (tier === 'operational') return 'warning';
  return 'info';
}

function tierLabel(tier: AlertTier, bg: boolean): string {
  if (tier === 'critical') return bg ? 'Критични' : 'Critical';
  if (tier === 'operational') return bg ? 'Оперативни' : 'Operational';
  return bg ? 'Информационни' : 'Informational';
}

/* ─── Component ────────────────────────────────────────────────────────────── */
const AdminAlertsPage: React.FC = () => {
  const { language } = useLanguage();
  const [result, setResult] = useState<AdminAlertsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bg = language === 'bg';

  const load = () => {
    setLoading(true);
    setError(null);
    adminAlertsService
      .getAlerts()
      .then(r => setResult(r))
      .catch(() => {
        setResult(null);
        setError(bg ? 'Неуспешно зареждане на сигналите.' : 'Failed to load alerts.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generatedAt = result?.generatedAt
    ? new Date(result.generatedAt).toLocaleTimeString(bg ? 'bg-BG' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const tiers: { tier: AlertTier; items: AdminAlert[] }[] = result
    ? [
        { tier: 'critical' as AlertTier, items: result.critical },
        { tier: 'operational' as AlertTier, items: result.operational },
        { tier: 'informational' as AlertTier, items: result.informational },
      ].filter(t => t.items.length > 0)
    : [];

  return (
    <Shell>
      <RefreshRow>
        {generatedAt && (
          <Timestamp>
            {bg ? `Обновено в ${generatedAt}` : `Updated at ${generatedAt}`}
          </Timestamp>
        )}
        <RefreshBtn onClick={load} disabled={loading}>
          <ArrowPathIcon style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
          {bg ? 'Обнови' : 'Refresh'}
        </RefreshBtn>
      </RefreshRow>

      {loading && !result && (
        <LoadingCard>
          <ArrowPathIcon style={{ animation: 'spin 1s linear infinite' }} />
          <span>{bg ? 'Зареждане…' : 'Loading…'}</span>
        </LoadingCard>
      )}

      {!loading && error && (
        <ErrorCard>
          <BellAlertIcon />
          <div>
            <AllClearTitle>{bg ? 'Грешка' : 'Error'}</AllClearTitle>
            <AllClearBody>{error}</AllClearBody>
          </div>
        </ErrorCard>
      )}

      {!loading && !error && result?.totalCount === 0 && (
        <AllClearCard>
          <CheckCircleIcon />
          <div>
            <AllClearTitle>{bg ? 'Всичко е наред' : 'All Clear'}</AllClearTitle>
            <AllClearBody>
              {bg
                ? 'Няма елементи, изискващи незабавно внимание.'
                : 'No items require immediate attention.'}
            </AllClearBody>
          </div>
        </AllClearCard>
      )}

      {tiers.map(({ tier, items }) => (
        <TierSection key={tier}>
          <TierHeading>{tierLabel(tier, bg)}</TierHeading>
          <AlertList>
            {items.map((alert, idx) => {
              const severity = tierToSeverity(alert.tier);
              return (
                <AlertRow
                  key={alert.id}
                  to={alert.link}
                  $severity={severity}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * idx, duration: 0.25 }}
                >
                  <AlertIconBox $severity={severity}>
                    <BellAlertIcon />
                  </AlertIconBox>
                  <AlertContent>
                    <AlertTitle>{alert.title}</AlertTitle>
                  </AlertContent>
                  <AlertRight>
                    <CountBadge $severity={severity}>{alert.count}</CountBadge>
                    <ArrowIcon>
                      <ArrowUpRightIcon />
                    </ArrowIcon>
                  </AlertRight>
                </AlertRow>
              );
            })}
          </AlertList>
        </TierSection>
      ))}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </Shell>
  );
};

export default AdminAlertsPage;
