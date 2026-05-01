import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminControlService,
  FraudSignalReceipt,
} from '../../services/adminControl.service';
import FraudReasonTag from '../../components/admin/FraudReasonTag';
import { useLanguage } from '../../contexts/LanguageContext';

// Spec §7.2 — Контрол > Сигурност
// Surfaces fraud signals per spec §7.2: duplicate detection, QR/receipt mismatch,
// velocity, IBAN anomalies, receipt template match, and partner risk.

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

type PillLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'LOW_0_30' | 'REVIEW_31_60' | 'HIGH_61_PLUS' | '—';
const VALID_PILL_LEVELS = new Set<PillLevel>([
  'LOW', 'MEDIUM', 'HIGH', 'LOW_0_30', 'REVIEW_31_60', 'HIGH_61_PLUS', '—',
]);
function toPillLevel(value: string | null | undefined): PillLevel {
  return value && VALID_PILL_LEVELS.has(value as PillLevel) ? (value as PillLevel) : '—';
}
function pillTone(level: PillLevel): 'success' | 'warning' | 'danger' | 'neutral' {
  if (level === 'HIGH' || level === 'HIGH_61_PLUS') return 'danger';
  if (level === 'MEDIUM' || level === 'REVIEW_31_60') return 'warning';
  if (level === 'LOW' || level === 'LOW_0_30') return 'success';
  return 'neutral';
}
const RiskPill = styled.span<{ $level: PillLevel }>`
  display: inline-flex; font-size: 0.75rem; font-weight: 600; padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  background: ${(p) => {
    const tone = pillTone(p.$level);
    return tone === 'danger' ? palette.dangerSoft :
           tone === 'warning' ? palette.warningSoft :
           tone === 'success' ? palette.successSoft :
           palette.bg;
  }};
  color: ${(p) => {
    const tone = pillTone(p.$level);
    return tone === 'danger' ? palette.danger :
           tone === 'warning' ? palette.warning :
           tone === 'success' ? palette.success :
           palette.textSubtle;
  }};
`;
const ReasonStack = styled.div`display: flex; flex-wrap: wrap; gap: 0.25rem; max-width: 22rem;`;
const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.75rem;
  margin-bottom: 0.5rem;
`;
const Stat = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.625rem;
  padding: 0.875rem 1rem;
`;
const StatLabel = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.25rem;`;
const StatValue = styled.div`font-size: 1.375rem; font-weight: 700; color: ${palette.text};`;
const ActionRow = styled.div`display: flex; gap: 0.375rem; margin-top: 0.375rem; flex-wrap: wrap;`;
const ActionBtn = styled.button<{ $variant: 'approve' | 'reject' }>`
  font-size: 0.75rem; font-weight: 600; padding: 0.2rem 0.6rem;
  border-radius: 0.375rem; border: 1px solid;
  cursor: pointer; transition: opacity 0.15s;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  background: ${(p) => p.$variant === 'approve' ? palette.successSoft : palette.dangerSoft};
  color: ${(p) => p.$variant === 'approve' ? palette.success : palette.danger};
  border-color: ${(p) => p.$variant === 'approve' ? palette.success : palette.danger};
`;

const PAGE_SIZE = 25;

type ActionDraft = { id: string; type: 'approve' | 'reject'; text: string };

const Overlay = styled.div`
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
`;
const Dialog = styled.div`
  background: ${palette.surface}; border: 1px solid ${palette.border};
  border-radius: 0.75rem; padding: 1.5rem; width: 100%; max-width: 28rem;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
`;
const DialogTitle = styled.h3`font-size: 1rem; font-weight: 700; color: ${palette.text}; margin: 0 0 0.75rem;`;
const DialogTextarea = styled.textarea`
  width: 100%; min-height: 5rem; padding: 0.5rem 0.75rem;
  border: 1px solid ${palette.border}; border-radius: 0.5rem;
  font-size: 0.875rem; color: ${palette.text}; background: ${palette.bg};
  resize: vertical; outline: none; box-sizing: border-box; font-family: inherit;
  &:focus { border-color: ${palette.accent}; }
`;
const DialogFooter = styled.div`display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem;`;
const CancelBtn = styled.button`
  padding: 0.4rem 1rem; border-radius: 0.375rem; border: 1px solid ${palette.border};
  font-size: 0.875rem; font-weight: 600; cursor: pointer;
  background: ${palette.surface}; color: ${palette.text};
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;
const ConfirmBtn = styled.button<{ $variant: 'approve' | 'reject' }>`
  padding: 0.4rem 1rem; border-radius: 0.375rem; border: 1px solid;
  font-size: 0.875rem; font-weight: 600; cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  background: ${(p) => p.$variant === 'approve' ? palette.successSoft : palette.dangerSoft};
  color: ${(p) => p.$variant === 'approve' ? palette.success : palette.danger};
  border-color: ${(p) => p.$variant === 'approve' ? palette.success : palette.danger};
`;

// Signal codes that indicate a receipt template / OCR match failure (spec §7.2 "Съвпадение с шаблон").
// Duplicate-category codes (DUPLICATE_RECEIPT, EXACT_DUPLICATE, etc.) belong to a separate spec
// category and must NOT be included here — see backend RISK_SIGNAL_GROUPS.receiptMatch.
const RECEIPT_MATCH_SIGNALS = new Set([
  'LOW_OCR_CONFIDENCE', 'RECEIPT_TEMPLATE_MISMATCH',
]);

// Signal codes that indicate a QR/location mismatch (spec §7.2 "Съвпадение с QR локация").
const LOCATION_MISMATCH_SIGNALS = new Set([
  'QR_MISMATCH', 'QR_VENUE_MISMATCH', 'NO_QR_SESSION',
]);

function tierFromScore(score: number): 'low' | 'med' | 'high' {
  if (score >= 61) return 'high';
  if (score >= 31) return 'med';
  return 'low';
}

function bucketLabel(bucket: string | null | undefined, lang: 'en' | 'bg'): string {
  if (bucket === 'LOW_0_30')      return lang === 'bg' ? 'Авто (0–30)'      : 'Auto (0–30)';
  if (bucket === 'REVIEW_31_60')  return lang === 'bg' ? 'Преглед (31–60)'  : 'Review (31–60)';
  if (bucket === 'HIGH_61_PLUS')  return lang === 'bg' ? 'Висок риск (61+)' : 'High risk (61+)';
  return lang === 'bg' ? 'неизвестен' : 'unknown';
}

const T = {
  eyebrow:         { en: 'Control',                                          bg: 'Контрол' },
  title:           { en: 'Security & Fraud Signals',                         bg: 'Сигурност и Измамни сигнали' },
  subtitle:        { en: 'Duplicate detection, QR/receipt mismatch, velocity, IBAN anomalies', bg: 'Дублирани записи, несъответствие QR/бележка, честота, IBAN аномалии' },
  allTiers:        { en: 'All tiers (≥31)',                                  bg: 'Всички нива (≥31)' },
  reviewTier:      { en: 'Review (31–60)',                                   bg: 'Преглед (31–60)' },
  highTier:        { en: 'High risk (61+)',                                   bg: 'Висок риск (61+)' },
  statDuplicate:   { en: 'Duplicates',                                        bg: 'Дублиране' },
  statQr:          { en: 'QR / Mismatch',                                    bg: 'QR / Несъответствие' },
  statVelocity:    { en: 'High velocity',                                     bg: 'Висока честота' },
  statIban:        { en: 'IBAN anomalies',                                    bg: 'IBAN аномалии' },
  statReceipt:     { en: 'Receipt match',                                     bg: 'Съвпадение с шаблон' },
  statOther:       { en: 'Other signals',                                     bg: 'Други сигнали' },
  colScore:        { en: 'Risk score',                                        bg: 'Риск оценка' },
  colSubscriber:   { en: 'Subscriber',                                        bg: 'Абонат' },
  colPartner:      { en: 'Partner / Location',                               bg: 'Партньор / Локация' },
  colReceipt:      { en: 'Receipt',                                           bg: 'Бележка' },
  colSignals:      { en: 'Signals',                                           bg: 'Сигнали' },
  colActions:      { en: 'Actions',                                           bg: 'Действия' },
  userRisk:        { en: 'User risk',                                         bg: 'Риск на абонат' },
  partnerRisk:     { en: 'Partner risk',                                      bg: 'Риск при партньор' },
  locationMatched: { en: 'Location: matched',                                 bg: 'Локация: съвпада' },
  locationMismatch:{ en: 'Location: mismatch',                               bg: 'Локация: несъответствие' },
  locationNoVenue: { en: 'Location: no venue',                               bg: 'Локация: без обект' },
  receiptClean:    { en: 'Receipt: clean',                                    bg: 'Бележка: чиста' },
  receiptFlag:     { en: 'Receipt: flagged',                                  bg: 'Бележка: маркирана' },
  noVenue:         { en: 'No venue',                                          bg: 'Без обект' },
  noneSignals:     { en: 'None',                                              bg: 'Няма' },
  emptyMsg:        { en: 'No fraud signals at this tier',                    bg: 'Няма измамни сигнали за това ниво' },
  approve:         { en: 'Approve',                                           bg: 'Одобри' },
  reject:          { en: 'Reject',                                            bg: 'Откажи' },
  riskHigh:        { en: 'High',                                              bg: 'Висок' },
  riskMed:         { en: 'Medium',                                            bg: 'Среден' },
  riskLow:         { en: 'Low',                                               bg: 'Нисък' },
  globalNote:      { en: 'Global totals across all pages',                   bg: 'Глобални броячи за всички страници' },
  reasonLabel:     { en: 'Reason for rejection (optional)',                  bg: 'Причина за отказ (незадължително)' },
  notesLabel:      { en: 'Notes (optional)',                                  bg: 'Бележки (незадължително)' },
  cancel:          { en: 'Cancel',                                            bg: 'Отказ' },
  confirm:         { en: 'Confirm',                                           bg: 'Потвърди' },
} as const;

export default function AdminControlSecurityPage() {
  const { language } = useLanguage();
  const [page, setPage] = useState(1);
  const [tier, setTier] = useState<'REVIEW_31_60' | 'HIGH_61_PLUS' | 'all'>('all');
  const [actionDraft, setActionDraft] = useState<ActionDraft | null>(null);
  const lang: 'en' | 'bg' = language === 'bg' ? 'bg' : 'en';
  const t = (key: keyof typeof T) => T[key][lang];
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-fraud-signals', page, tier],
    queryFn: () => adminControlService.getFraudSignals({ page, limit: PAGE_SIZE, tier }),
  });

  // Gap 5: global signal counts from dedicated summary endpoint — not page-scoped.
  const { data: summaryData } = useQuery({
    queryKey: ['admin-risk-queue-summary'],
    queryFn: () => adminControlService.getRiskQueueSummary(),
    staleTime: 60_000,
  });

  // Row-scoped mutations: each carries { id, notes|reason } so isPending can be checked per row.
  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      adminControlService.approveRiskSignal(id, notes),
    onSuccess: () => {
      setActionDraft(null);
      queryClient.invalidateQueries({ queryKey: ['admin-fraud-signals'] });
      queryClient.invalidateQueries({ queryKey: ['admin-risk-queue-summary'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      adminControlService.rejectRiskSignal(id, reason),
    onSuccess: () => {
      setActionDraft(null);
      queryClient.invalidateQueries({ queryKey: ['admin-fraud-signals'] });
      queryClient.invalidateQueries({ queryKey: ['admin-risk-queue-summary'] });
    },
  });

  // Row-scoped: only the row being processed shows a disabled state.
  const isRowMutating = (id: string) =>
    (approveMutation.isPending && approveMutation.variables?.id === id) ||
    (rejectMutation.isPending && rejectMutation.variables?.id === id);
  const isAnyMutating = approveMutation.isPending || rejectMutation.isPending;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isAnyMutating) return;
      setActionDraft(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isAnyMutating]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  const columns: ColumnDef<FraudSignalReceipt>[] = [
    {
      key: 'score',
      header: t('colScore'),
      render: (row) => (
        <span>
          <ScoreBadge $tier={tierFromScore(row.fraudScore)}>{row.fraudScore.toFixed(0)}</ScoreBadge>
          <MetaLine>{row.status}</MetaLine>
        </span>
      ),
    },
    {
      key: 'subscriber',
      header: t('colSubscriber'),
      render: (row) => (
        <span>
          <PrimaryLine>
            {row.user.firstName || row.user.lastName
              ? `${row.user.firstName ?? ''} ${row.user.lastName ?? ''}`.trim()
              : '—'}
          </PrimaryLine>
          <MetaLine>{row.user.email}</MetaLine>
          <div style={{ marginTop: 4 }}>
            <RiskPill $level={toPillLevel(row.user.riskBucket)}>
              {t('userRisk')}: {bucketLabel(row.user.riskBucket, lang)}
            </RiskPill>
          </div>
        </span>
      ),
    },
    {
      key: 'partner',
      header: t('colPartner'),
      render: (row) => {
        // Bug 3 fix: location match based on QR mismatch signal codes, not venue presence.
        const hasLocationMismatch = row.fraudReasons.some((r) => LOCATION_MISMATCH_SIGNALS.has(r));
        const locationLevel: PillLevel = !row.venue ? 'HIGH' : hasLocationMismatch ? 'MEDIUM' : 'LOW';
        const locationLabel = !row.venue
          ? t('locationNoVenue')
          : hasLocationMismatch
            ? t('locationMismatch')
            : t('locationMatched');

        // Gap 4: partner risk bucket derived by backend from all-venue receipt counts.
        const pRisk = row.venue?.partnerRiskBucket;
        const pRiskLabel = pRisk === 'HIGH' ? t('riskHigh') : pRisk === 'MEDIUM' ? t('riskMed') : t('riskLow');

        return (
          <span>
            <PrimaryLine>{row.venue?.partner?.businessName ?? '—'}</PrimaryLine>
            <MetaLine>
              {row.venue?.name ?? t('noVenue')}
              {row.venue?.id && ` · ${row.venue.id.slice(0, 6)}`}
            </MetaLine>
            <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <RiskPill $level={locationLevel}>{locationLabel}</RiskPill>
              {pRisk && (
                <RiskPill $level={toPillLevel(pRisk)}>
                  {t('partnerRisk')}: {pRiskLabel}
                </RiskPill>
              )}
            </div>
          </span>
        );
      },
    },
    {
      key: 'receipt',
      header: t('colReceipt'),
      render: (row) => {
        // Bug 2 fix: receipt match uses OCR/template signal codes only, not all fraud reasons.
        const hasReceiptIssue = row.fraudReasons.some((r) => RECEIPT_MATCH_SIGNALS.has(r));
        return (
          <span>
            <PrimaryLine>{row.merchantName ?? '—'}</PrimaryLine>
            <MetaLine>
              {row.totalAmount != null ? `${row.totalAmount.toFixed(2)} лв` : '—'}
              {' · '}
              {fmt(row.createdAt)}
            </MetaLine>
            <div style={{ marginTop: 4 }}>
              <RiskPill $level={hasReceiptIssue ? 'MEDIUM' : 'LOW'}>
                {hasReceiptIssue ? t('receiptFlag') : t('receiptClean')}
              </RiskPill>
            </div>
          </span>
        );
      },
    },
    {
      key: 'reasons',
      header: t('colSignals'),
      render: (row) => (
        <ReasonStack>
          {row.fraudReasons.length === 0
            ? <MetaLine>{t('noneSignals')}</MetaLine>
            : row.fraudReasons.map((r) => (
                <FraudReasonTag key={r} reason={r} language={language as 'en' | 'bg'} />
              ))}
        </ReasonStack>
      ),
    },
    {
      key: 'actions',
      header: t('colActions'),
      render: (row) => (
        <ActionRow>
          <ActionBtn
            $variant="approve"
            disabled={isRowMutating(row.id)}
            onClick={() => setActionDraft({ id: row.id, type: 'approve', text: '' })}
          >
            {t('approve')}
          </ActionBtn>
          <ActionBtn
            $variant="reject"
            disabled={isRowMutating(row.id)}
            onClick={() => setActionDraft({ id: row.id, type: 'reject', text: '' })}
          >
            {t('reject')}
          </ActionBtn>
        </ActionRow>
      ),
    },
  ];

  const s = summaryData?.data;

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <PageTitle>
            {t('title')}
            {data && data.meta.total > 0 && <TotalBadge>{data.meta.total.toLocaleString()}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>{t('subtitle')}</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      {/* Gap 5 fix: 6 stat tiles fed from the summary endpoint (global, not page-scoped).
          Bug 1 fix: "other signals" tile catches any signal code outside the 4 main categories. */}
      <StatGrid>
        <Stat>
          <StatLabel>{t('statDuplicate')}</StatLabel>
          <StatValue>{s?.duplicate ?? '—'}</StatValue>
        </Stat>
        <Stat>
          <StatLabel>{t('statQr')}</StatLabel>
          <StatValue>{s?.qrMismatch ?? '—'}</StatValue>
        </Stat>
        <Stat>
          <StatLabel>{t('statVelocity')}</StatLabel>
          <StatValue>{s?.velocity ?? '—'}</StatValue>
        </Stat>
        <Stat>
          <StatLabel>{t('statIban')}</StatLabel>
          <StatValue>{s?.ibanAnomaly ?? '—'}</StatValue>
        </Stat>
        <Stat>
          <StatLabel>{t('statReceipt')}</StatLabel>
          <StatValue>{s?.receiptMatch ?? '—'}</StatValue>
        </Stat>
        <Stat>
          <StatLabel>{t('statOther')}</StatLabel>
          <StatValue>{s?.other ?? '—'}</StatValue>
        </Stat>
      </StatGrid>
      <MetaLine style={{ marginBottom: '1.25rem' }}>{t('globalNote')}</MetaLine>

      <Card>
        <FilterRow>
          <Select value={tier} onChange={(e) => { setTier(e.target.value as typeof tier); setPage(1); }}>
            <option value="all">{t('allTiers')}</option>
            <option value="REVIEW_31_60">{t('reviewTier')}</option>
            <option value="HIGH_61_PLUS">{t('highTier')}</option>
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyMessage={t('emptyMsg')}
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.meta.total}
          onPageChange={setPage}
        />
      </Card>
      {actionDraft && (
        <Overlay onClick={() => !isAnyMutating && setActionDraft(null)}>
          <Dialog onClick={(e) => e.stopPropagation()}>
            <DialogTitle>
              {actionDraft.type === 'approve' ? t('approve') : t('reject')}
            </DialogTitle>
            <DialogTextarea
              placeholder={actionDraft.type === 'reject' ? t('reasonLabel') : t('notesLabel')}
              value={actionDraft.text}
              onChange={(e) => setActionDraft({ ...actionDraft, text: e.target.value })}
              autoFocus
            />
            <DialogFooter>
              <CancelBtn disabled={isAnyMutating} onClick={() => setActionDraft(null)}>
                {t('cancel')}
              </CancelBtn>
              <ConfirmBtn
                $variant={actionDraft.type}
                disabled={isAnyMutating}
                onClick={() => {
                  const txt = actionDraft.text.trim() || undefined;
                  if (actionDraft.type === 'approve') {
                    approveMutation.mutate({ id: actionDraft.id, notes: txt });
                  } else {
                    rejectMutation.mutate({ id: actionDraft.id, reason: txt });
                  }
                }}
              >
                {t('confirm')}
              </ConfirmBtn>
            </DialogFooter>
          </Dialog>
        </Overlay>
      )}
    </PageShell>
  );
}
