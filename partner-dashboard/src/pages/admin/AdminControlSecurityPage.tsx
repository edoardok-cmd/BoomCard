import { useState } from 'react';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import { adminControlService, FraudSignalReceipt } from '../../services/adminControl.service';
import FraudReasonTag from '../../components/admin/FraudReasonTag';
import { useLanguage } from '../../contexts/LanguageContext';

// Spec §7.2 — Контрол > Сигурност
// Surfaces fraud signals: duplicate detection, QR/receipt mismatch, velocity,
// IBAN-change anomalies, and per-row User risk / Receipt-match / Location-match.

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
  danger: '#b54327', dangerSoft: '#f4dcd2',
  warning: '#b5803a', warningSoft: '#f5ead2',
  info: '#2563eb', infoSoft: '#dbeafe',
  purple: '#7c3aed', purpleSoft: '#ede9fe',
};

const PageShell = styled.div`background: ${palette.bg}; min-height: calc(100vh - 4rem); padding: 2rem 2.5rem;`;
const PageHeader = styled.div`display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; gap: 1rem; flex-wrap: wrap;`;
const TitleBlock = styled.div``;
const Eyebrow = styled.p`font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${palette.textSubtle}; margin-bottom: 0.25rem;`;
const PageTitle = styled.h1`font-size: 1.75rem; font-weight: 800; color: ${palette.text}; margin: 0 0 0.25rem;`;
const PageSubtitle = styled.p`font-size: 0.9375rem; color: ${palette.textMuted}; margin: 0;`;
const TotalBadge = styled.span`display: inline-flex; align-items: center; justify-content: center; background: ${palette.infoSoft}; color: ${palette.info}; font-size: 0.75rem; font-weight: 700; border-radius: 9999px; padding: 0.125rem 0.6rem; margin-left: 0.5rem;`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem;`;
const FilterRow = styled.div`display: flex; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; align-items: center;`;
const Select = styled.select`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none;`;
const PrimaryLine = styled.div`font-weight: 600; color: ${palette.text};`;
const MetaLine = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.125rem;`;
const ScoreBadge = styled.span<{ $tier: 'low' | 'med' | 'high' }>`
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 0.8125rem; font-weight: 700; padding: 0.125rem 0.5rem;
  border-radius: 0.375rem; min-width: 2.5rem;
  background: ${(p) => p.$tier === 'high' ? palette.dangerSoft : p.$tier === 'med' ? palette.warningSoft : palette.successSoft};
  color: ${(p) => p.$tier === 'high' ? palette.danger : p.$tier === 'med' ? palette.warning : palette.success};
`;
const RiskPill = styled.span<{ $level: string }>`
  display: inline-flex; font-size: 0.75rem; font-weight: 600; padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  background: ${(p) =>
    p.$level === 'HIGH' ? palette.dangerSoft :
    p.$level === 'MEDIUM' ? palette.warningSoft :
    p.$level === 'LOW' ? palette.successSoft :
    palette.bg};
  color: ${(p) =>
    p.$level === 'HIGH' ? palette.danger :
    p.$level === 'MEDIUM' ? palette.warning :
    p.$level === 'LOW' ? palette.success :
    palette.textSubtle};
`;
const ReasonStack = styled.div`display: flex; flex-wrap: wrap; gap: 0.25rem; max-width: 22rem;`;
const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.25rem;
`;
const Stat = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.625rem;
  padding: 0.875rem 1rem;
`;
const StatLabel = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.25rem;`;
const StatValue = styled.div`font-size: 1.375rem; font-weight: 700; color: ${palette.text};`;

const PAGE_SIZE = 25;

// Mapping of fraud-reason codes to spec §7.2 signal categories.
const SIGNAL_CATEGORIES = {
  duplicate: ['DUPLICATE_RECEIPT', 'EXACT_DUPLICATE', 'PERCEPTUAL_DUPLICATE', 'IMAGE_HASH_DUPLICATE'],
  qrMismatch: ['QR_MISMATCH', 'QR_VENUE_MISMATCH', 'NO_QR_SESSION'],
  velocity: ['HIGH_VELOCITY', 'RATE_LIMIT', 'DAILY_LIMIT', 'TOO_MANY_RECEIPTS'],
  ibanAnomaly: ['IBAN_CHANGE', 'IBAN_RECENTLY_CHANGED', 'PAYOUT_RISK'],
};

function categorize(reasons: string[]) {
  return {
    duplicate: reasons.some((r) => SIGNAL_CATEGORIES.duplicate.includes(r)),
    qrMismatch: reasons.some((r) => SIGNAL_CATEGORIES.qrMismatch.includes(r)),
    velocity: reasons.some((r) => SIGNAL_CATEGORIES.velocity.includes(r)),
    ibanAnomaly: reasons.some((r) => SIGNAL_CATEGORIES.ibanAnomaly.includes(r)),
  };
}

function tierFromScore(score: number): 'low' | 'med' | 'high' {
  if (score >= 61) return 'high';
  if (score >= 31) return 'med';
  return 'low';
}

export default function AdminControlSecurityPage() {
  const { language } = useLanguage();
  const [page, setPage] = useState(1);
  const [tier, setTier] = useState<'AUTO_0_30' | 'REVIEW_31_60' | 'HIGH_61_PLUS' | 'all'>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-fraud-signals', page, tier],
    queryFn: () =>
      adminControlService.getFraudSignals({ page, limit: PAGE_SIZE, tier }),
  });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  // Aggregate counts on the current page (cheap client-side; spec wants visibility)
  const aggregates = (data?.data ?? []).reduce(
    (acc, row) => {
      const cat = categorize(row.fraudReasons);
      if (cat.duplicate) acc.duplicate++;
      if (cat.qrMismatch) acc.qrMismatch++;
      if (cat.velocity) acc.velocity++;
      if (cat.ibanAnomaly) acc.ibanAnomaly++;
      return acc;
    },
    { duplicate: 0, qrMismatch: 0, velocity: 0, ibanAnomaly: 0 }
  );

  const columns: ColumnDef<FraudSignalReceipt>[] = [
    {
      key: 'score',
      header: 'Risk score',
      render: (row) => (
        <span>
          <ScoreBadge $tier={tierFromScore(row.fraudScore)}>{row.fraudScore.toFixed(0)}</ScoreBadge>
          <MetaLine>{row.status}</MetaLine>
        </span>
      ),
    },
    {
      key: 'subscriber',
      header: 'Subscriber',
      render: (row) => (
        <span>
          <PrimaryLine>
            {row.user.firstName || row.user.lastName
              ? `${row.user.firstName ?? ''} ${row.user.lastName ?? ''}`.trim()
              : '—'}
          </PrimaryLine>
          <MetaLine>{row.user.email}</MetaLine>
          <div style={{ marginTop: 4 }}>
            <RiskPill $level={row.user.riskBucket ?? '—'}>
              User risk: {row.user.riskBucket ?? 'unknown'}
            </RiskPill>
          </div>
        </span>
      ),
    },
    {
      key: 'partner',
      header: 'Partner / Location',
      render: (row) => (
        <span>
          <PrimaryLine>{row.venue?.partner?.businessName ?? '—'}</PrimaryLine>
          <MetaLine>
            {row.venue?.name ?? 'No venue'}
            {row.venue?.id && ` · ${row.venue.id.slice(0, 6)}`}
          </MetaLine>
          <div style={{ marginTop: 4 }}>
            <RiskPill $level={row.venue ? 'LOW' : 'HIGH'}>
              Location match: {row.venue ? 'matched' : 'missing'}
            </RiskPill>
          </div>
        </span>
      ),
    },
    {
      key: 'receipt',
      header: 'Receipt',
      render: (row) => (
        <span>
          <PrimaryLine>{row.merchantName ?? '—'}</PrimaryLine>
          <MetaLine>
            {row.totalAmount != null ? `${row.totalAmount.toFixed(2)} лв` : '—'}
            {' · '}
            {fmt(row.createdAt)}
          </MetaLine>
          <div style={{ marginTop: 4 }}>
            <RiskPill $level={row.fraudReasons.length === 0 ? 'LOW' : 'MEDIUM'}>
              Receipt match: {row.fraudReasons.length === 0 ? 'clean' : `${row.fraudReasons.length} flag${row.fraudReasons.length === 1 ? '' : 's'}`}
            </RiskPill>
          </div>
        </span>
      ),
    },
    {
      key: 'reasons',
      header: 'Signals',
      render: (row) => (
        <ReasonStack>
          {row.fraudReasons.length === 0
            ? <MetaLine>None</MetaLine>
            : row.fraudReasons.map((r) => (
                <FraudReasonTag key={r} reason={r} language={language as 'en' | 'bg'} />
              ))}
        </ReasonStack>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Control</Eyebrow>
          <PageTitle>
            Security & Fraud Signals
            {data && data.meta.total > 0 && <TotalBadge>{data.meta.total.toLocaleString()}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>
            Duplicate detection, QR/receipt mismatch, velocity, IBAN anomalies — per spec §7.2
          </PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <StatGrid>
        <Stat>
          <StatLabel>Duplicates (page)</StatLabel>
          <StatValue>{aggregates.duplicate}</StatValue>
        </Stat>
        <Stat>
          <StatLabel>QR / Receipt mismatch</StatLabel>
          <StatValue>{aggregates.qrMismatch}</StatValue>
        </Stat>
        <Stat>
          <StatLabel>High velocity</StatLabel>
          <StatValue>{aggregates.velocity}</StatValue>
        </Stat>
        <Stat>
          <StatLabel>IBAN anomalies</StatLabel>
          <StatValue>{aggregates.ibanAnomaly}</StatValue>
        </Stat>
      </StatGrid>

      <Card>
        <FilterRow>
          <Select value={tier} onChange={(e) => { setTier(e.target.value as typeof tier); setPage(1); }}>
            <option value="all">All tiers</option>
            <option value="AUTO_0_30">Auto-approve (0–30)</option>
            <option value="REVIEW_31_60">Review (31–60)</option>
            <option value="HIGH_61_PLUS">High risk (61+)</option>
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyMessage="No fraud signals at this tier"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.meta.total}
          onPageChange={setPage}
        />
      </Card>
    </PageShell>
  );
}
