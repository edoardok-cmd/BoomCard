import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminControlService,
  FraudSignalReceipt,
} from '../../services/adminControl.service';
import FraudReasonTag from '../../components/admin/FraudReasonTag';
import { useLanguage } from '../../contexts/LanguageContext';

// Spec §7.1/§7.2 — Контрол > Преглед на рискови транзакции / Риск и сигурност
// Fraud signals queue: duplicate, QR/location, velocity, receipt quality, suspicious behaviour.
// Audit log moved to its own dedicated page at /admin/control/audit.

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
const PageHeader = styled.div`display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; gap: 1rem; flex-wrap: wrap;`;
const TitleBlock = styled.div``;
const Eyebrow = styled.p`font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${palette.textSubtle}; margin-bottom: 0.25rem;`;
const PageTitle = styled.h1`font-size: 1.75rem; font-weight: 800; color: ${palette.text}; margin: 0 0 0.25rem;`;
const PageSubtitle = styled.p`font-size: 0.9375rem; color: ${palette.textMuted}; margin: 0;`;
const TotalBadge = styled.span`display: inline-flex; align-items: center; justify-content: center; background: ${palette.infoSoft}; color: ${palette.info}; font-size: 0.75rem; font-weight: 700; border-radius: 9999px; padding: 0.125rem 0.6rem; margin-left: 0.5rem;`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem;`;
const FilterRow = styled.div`display: flex; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; align-items: center;`;
const Select = styled.select`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none;`;
const TextInput = styled.input`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; width: 14rem; &::placeholder { color: ${palette.textSubtle}; }`;
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
const SectionDivider = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 1.5rem 0 1rem;
`;
const SectionLabel = styled.div`
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${palette.textSubtle};
  white-space: nowrap;
`;
const SectionLine = styled.div`
  flex: 1;
  height: 1px;
  background: ${palette.border};
`;
const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.75rem;
  margin-bottom: 0.5rem;
`;
const Stat = styled.div<{ $active?: boolean }>`
  background: ${(p) => p.$active ? palette.accentSoft : palette.surface};
  border: 1px solid ${(p) => p.$active ? palette.accent : palette.border};
  border-radius: 0.625rem;
  padding: 0.875rem 1rem;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  &:hover { border-color: ${palette.accent}; }
`;
const StatLabel = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.25rem;`;
const StatValue = styled.div`font-size: 1.375rem; font-weight: 700; color: ${palette.text};`;
const ActionRow = styled.div`display: flex; gap: 0.375rem; margin-top: 0.375rem; flex-wrap: wrap;`;
const BulkBar = styled.div`
  display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
  padding: 0.625rem 1rem; margin-bottom: 0.75rem;
  background: ${palette.infoSoft}; border: 1px solid ${palette.info}40;
  border-radius: 0.625rem; font-size: 0.875rem; color: ${palette.info};
`;
const BulkCount = styled.span`font-weight: 700;`;
const BulkRejectBtn = styled.button`
  padding: 0.3rem 0.875rem; border-radius: 0.375rem; border: 1px solid ${palette.danger};
  font-size: 0.8125rem; font-weight: 600; cursor: pointer;
  background: ${palette.dangerSoft}; color: ${palette.danger};
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;
const ActionBtn = styled.button<{ $variant: 'approve' | 'reject' | 'dispute' }>`
  font-size: 0.75rem; font-weight: 600; padding: 0.2rem 0.6rem;
  border-radius: 0.375rem; border: 1px solid;
  cursor: pointer; transition: opacity 0.15s;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  background: ${(p) => p.$variant === 'approve' ? palette.successSoft : p.$variant === 'reject' ? palette.dangerSoft : palette.warningSoft};
  color: ${(p) => p.$variant === 'approve' ? palette.success : p.$variant === 'reject' ? palette.danger : palette.warning};
  border-color: ${(p) => p.$variant === 'approve' ? palette.success : p.$variant === 'reject' ? palette.danger : palette.warning};
`;

const PAGE_SIZE = 25;

// Spec §7.1: rejection reason = structured category + optional free text. Keep
// codes stable — the backend stores the composed string and the audit log keys
// off these prefixes when summarising rejection causes.
const REJECT_REASON_CODES = [
  'DUPLICATE_RECEIPT',
  'AMOUNT_MISMATCH',
  'LOCATION_MISMATCH',
  'SUSPICIOUS_BEHAVIOUR',
  'INVALID_RECEIPT',
  'OTHER',
] as const;
type RejectReasonCode = typeof REJECT_REASON_CODES[number];

const REJECT_REASON_LABEL: Record<RejectReasonCode, { bg: string; en: string }> = {
  DUPLICATE_RECEIPT:    { bg: 'Дублирана бележка',         en: 'Duplicate receipt' },
  AMOUNT_MISMATCH:      { bg: 'Несъответствие на сума',    en: 'Amount mismatch' },
  LOCATION_MISMATCH:    { bg: 'GPS/локация несъответствие', en: 'Location mismatch' },
  SUSPICIOUS_BEHAVIOUR: { bg: 'Подозрително поведение',    en: 'Suspicious behaviour' },
  INVALID_RECEIPT:      { bg: 'Невалидна бележка',         en: 'Invalid receipt' },
  OTHER:                { bg: 'Друго',                     en: 'Other' },
};

type ActionDraft = {
  id: string;
  type: 'approve' | 'reject';
  text: string;
  verifiedAmount: string;
  rejectCode?: RejectReasonCode;
};
type DisputeDraft = { scanId: string; userId: string; merchantName: string | null };

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

// Real signal codes from fraudDetection.service.ts — must stay in sync with
// RISK_SIGNAL_GROUPS in backend adminControl.routes.ts.
const LOCATION_MISMATCH_SIGNALS = new Set([
  'GPS_FAR_FROM_VENUE', 'GPS_OUTSIDE_RANGE',
]);

const RECEIPT_MATCH_SIGNALS = new Set([
  'LOW_OCR_CONFIDENCE', 'MODERATE_OCR_CONFIDENCE', 'TEMPLATE_MISMATCH',
  'AMOUNT_MISMATCH', 'LARGE_AMOUNT_MISMATCH',
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
  eyebrow:         { en: 'Control',                                             bg: 'Контрол' },
  title:           { en: 'Risk & Security',                                      bg: 'Риск и сигурност' },
  subtitle:        { en: 'Duplicate detection, QR/location mismatch, velocity, receipt quality, suspicious behaviour', bg: 'Дублиране, несъответствие QR/локация, честота, качество на бележка, подозрително поведение' },
  allTiers:        { en: 'All tiers (≥31)',                                     bg: 'Всички нива (≥31)' },
  reviewTier:      { en: 'Review (31–60)',                                      bg: 'Преглед (31–60)' },
  highTier:        { en: 'High risk (61+)',                                     bg: 'Висок риск (61+)' },
  venueFilter:     { en: 'Filter by venue ID…',                                bg: 'Филтър по venue ID…' },
  statDuplicate:   { en: 'Duplicates',                                          bg: 'Дублиране' },
  statQr:          { en: 'QR / Location',                                       bg: 'QR / Локация' },
  statVelocity:    { en: 'Velocity',                                            bg: 'Честота' },
  statReceipt:     { en: 'Receipt quality',                                     bg: 'Качество на бележка' },
  statSuspicious:  { en: 'Suspicious behaviour',                                bg: 'Подозрително поведение' },
  statIban:        { en: 'Users: IBAN changed (7d)',                             bg: 'Потребители: IBAN промяна (7д)' },
  statOther:       { en: 'Other signals',                                       bg: 'Други сигнали' },
  colScore:        { en: 'Risk score',                                          bg: 'Риск оценка' },
  colSubscriber:   { en: 'Subscriber',                                          bg: 'Абонат' },
  colPartner:      { en: 'Partner / Location',                                  bg: 'Партньор / Локация' },
  colReceipt:      { en: 'Receipt',                                             bg: 'Бележка' },
  colSignals:      { en: 'Signals',                                             bg: 'Сигнали' },
  colActions:      { en: 'Actions',                                             bg: 'Действия' },
  userRisk:        { en: 'User risk',                                           bg: 'Риск на абонат' },
  partnerRisk:     { en: 'Partner risk',                                        bg: 'Риск при партньор' },
  locationMatched: { en: 'Location: matched',                                   bg: 'Локация: съвпада' },
  locationMismatch:{ en: 'Location: mismatch',                                 bg: 'Локация: несъответствие' },
  locationNoVenue: { en: 'Location: no venue',                                 bg: 'Локация: без обект' },
  receiptClean:    { en: 'Receipt: clean',                                      bg: 'Бележка: чиста' },
  receiptFlag:     { en: 'Receipt: flagged',                                    bg: 'Бележка: маркирана' },
  noVenue:         { en: 'No venue',                                            bg: 'Без обект' },
  noneSignals:     { en: 'None',                                                bg: 'Няма' },
  emptyMsg:        { en: 'No fraud signals at this tier',                      bg: 'Няма измамни сигнали за това ниво' },
  approve:         { en: 'Approve',                                             bg: 'Одобри' },
  reject:          { en: 'Reject',                                              bg: 'Откажи' },
  riskHigh:        { en: 'High',                                                bg: 'Висок' },
  riskMed:         { en: 'Medium',                                              bg: 'Среден' },
  riskLow:         { en: 'Low',                                                 bg: 'Нисък' },
  globalNote:      { en: 'Global totals for fraudScore ≥31; categories can overlap (one receipt may trigger multiple)', bg: 'Глобални броячи за fraudScore ≥31; категориите могат да се припокриват (една бележка може да попадне в няколко)' },
  reasonLabel:     { en: 'Additional notes (optional)',                        bg: 'Допълнителни бележки (незадължително)' },
  reasonCodeLabel: { en: 'Reason category',                                    bg: 'Категория причина' },
  reasonCodeRequired: { en: 'Pick a reason before rejecting',                  bg: 'Изберете причина преди отказ' },
  notesLabel:      { en: 'Notes (optional)',                                    bg: 'Бележки (незадължително)' },
  verifiedAmountLabel: { en: 'Override amount (BGN, optional)',                bg: 'Коригирана сума (лв., незадължително)' },
  verifiedAmountHint:  { en: 'If set, recalculates cashback and fraud score — shows a warning if score exceeds threshold', bg: 'Ако е зададено, преизчислява кешбек и fraud score — показва предупреждение ако score надвишава прага' },
  cancel:          { en: 'Cancel',                                              bg: 'Отказ' },
  confirm:         { en: 'Confirm',                                             bg: 'Потвърди' },
  openDispute:     { en: 'Open Dispute',                                        bg: 'Отвори спор' },
  approved:        { en: 'Signal approved',                                      bg: 'Сигналът е одобрен' },
  rejected:        { en: 'Signal rejected',                                      bg: 'Сигналът е отхвърлен' },
  errorApprove:    { en: 'Error approving signal',                               bg: 'Грешка при одобряване на сигнала' },
  errorReject:     { en: 'Error rejecting signal',                               bg: 'Грешка при отхвърляне на сигнала' },
  errorDispute:    { en: 'Error opening dispute',                                bg: 'Грешка при отваряне на спор' },
  disputeOpened:   { en: 'Dispute case opened',                                 bg: 'Спорът е открит' },
  disputeExists:   { en: 'Dispute already exists for this receipt',             bg: 'Спор за тази бележка вече съществува' },
  // Bulk-reject (spec §7.2)
  bulkSelected:    { en: 'selected',                                            bg: 'избрани' },
  bulkReject:      { en: 'Bulk reject',                                         bg: 'Масов отказ' },
  bulkError:       { en: 'Some rejections failed — check the console',         bg: 'Грешка при масов отказ — вижте конзолата' },
  clearSelection:  { en: 'Clear',                                               bg: 'Изчисти' },
} as const;

export default function AdminControlSecurityPage() {
  const { language } = useLanguage();
  const lang: 'en' | 'bg' = language === 'bg' ? 'bg' : 'en';
  const t = (key: keyof typeof T) => T[key][lang];
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  // §7.1 and §7.2 share this page component. Adjust the H1 title based on which
  // nav item the user came from so it matches the active tab label.
  const isRiskReviewRoute = location.pathname === '/admin/control/risk';
  const pageTitle = isRiskReviewRoute
    ? (lang === 'bg' ? 'Преглед на рискови транзакции' : 'Risk Transaction Review')
    : t('title');

  const [searchParams] = useSearchParams();

  const [page, setPage] = useState(1);
  const [tier, setTier] = useState<'REVIEW_31_60' | 'HIGH_61_PLUS' | 'all'>('all');
  const [venueIdInput, setVenueIdInput] = useState('');
  const [venueId, setVenueId] = useState('');
  const [signalCategory, setSignalCategory] = useState('');

  // Hydrate filters from alert deep-link URL params (spec §3.2 → §7.1).
  // bucket=HIGH_61_PLUS|REVIEW_31_60 → tier  (risk_transactions / medium_risk_transactions alerts)
  // signalCategory=suspicious         → signalCategory (suspicious_activity / fraud_check_errors alerts)
  // suspicious=true                   → signalCategory (legacy param kept for back-compat)
  // dateFromHours=N                   → dateFrom (suspicious_activity alert time window)
  const [dateFrom, setDateFrom] = useState('');
  useEffect(() => {
    const bucket = searchParams.get('bucket');
    if (bucket === 'HIGH_61_PLUS' || bucket === 'REVIEW_31_60') setTier(bucket);
    const cat = searchParams.get('signalCategory');
    const validCategories = ['duplicate', 'qrMismatch', 'velocity', 'receiptMatch', 'suspicious'];
    if (cat && validCategories.includes(cat)) setSignalCategory(cat);
    else if (searchParams.get('suspicious') === 'true') setSignalCategory('suspicious');
    const hours = parseInt(searchParams.get('dateFromHours') ?? '', 10);
    if (!isNaN(hours) && hours > 0) {
      setDateFrom(new Date(Date.now() - hours * 60 * 60 * 1000).toISOString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [actionDraft, setActionDraft] = useState<ActionDraft | null>(null);
  const [disputeDraft, setDisputeDraft] = useState<DisputeDraft | null>(null);
  const [disputeNote, setDisputeNote] = useState('');

  // §7.2 bulk-reject: multi-select state + modal draft
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRejectDraft, setBulkRejectDraft] = useState<{ rejectCode: RejectReasonCode | ''; text: string } | null>(null);

  const toggleRowSelection = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const toggleSelectAll = (rows: { id: string }[]) =>
    setSelectedIds((prev) =>
      rows.every((r) => prev.has(r.id))
        ? new Set()
        : new Set(rows.map((r) => r.id)),
    );

  // Clear selection on page/filter change so stale IDs from the previous page
  // don't get included in a bulk action.
  useEffect(() => { setSelectedIds(new Set()); }, [page, tier, venueId, signalCategory, dateFrom]);

  const bulkRejectMutation = useMutation({
    mutationFn: ({ scanIds, reason }: { scanIds: string[]; reason?: string }) =>
      adminControlService.bulkRejectRiskSignals(scanIds, reason),
    onSuccess: (result) => {
      const { successCount, errorCount } = result.data;
      if (errorCount > 0) {
        toast.error(t('bulkError'));
        console.error('[bulk-reject] partial failure:', result.data.errors);
      } else {
        toast.success(`${successCount} ${lang === 'bg' ? 'сигнала отхвърлени' : 'signal(s) rejected'}`);
      }
      setBulkRejectDraft(null);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['admin-fraud-signals'] });
      queryClient.invalidateQueries({ queryKey: ['admin-risk-queue-summary'] });
    },
    onError: () => toast.error(t('bulkError')),
  });

  const toggleCategory = (cat: string) => {
    setSignalCategory((prev) => (prev === cat ? '' : cat));
    setPage(1);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['admin-fraud-signals', page, tier, venueId, signalCategory, dateFrom],
    queryFn: () => adminControlService.getFraudSignals({
      page, limit: PAGE_SIZE, tier,
      venueId: venueId || undefined,
      signalCategory: signalCategory || undefined,
      dateFrom: dateFrom || undefined,
    }),
  });

  const { data: summaryData } = useQuery({
    queryKey: ['admin-risk-queue-summary'],
    queryFn: () => adminControlService.getRiskQueueSummary(),
    staleTime: 60_000,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, opts }: { id: string; opts?: { notes?: string; verifiedAmount?: number } }) =>
      adminControlService.approveRiskSignal(id, opts),
    onSuccess: (result) => {
      if (result?.fraudWarning) {
        toast(`⚠ ${result.fraudWarning}`, {
          style: { background: '#d97706', color: '#fff', fontWeight: 600 },
          duration: 6000,
        });
      } else {
        toast.success(t('approved'));
      }
      setActionDraft(null);
      queryClient.invalidateQueries({ queryKey: ['admin-fraud-signals'] });
      queryClient.invalidateQueries({ queryKey: ['admin-risk-queue-summary'] });
    },
    onError: () => toast.error(t('errorApprove')),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      adminControlService.rejectRiskSignal(id, reason),
    onSuccess: () => {
      toast.success(t('rejected'));
      setActionDraft(null);
      queryClient.invalidateQueries({ queryKey: ['admin-fraud-signals'] });
      queryClient.invalidateQueries({ queryKey: ['admin-risk-queue-summary'] });
    },
    onError: () => toast.error(t('errorReject')),
  });

  const openDisputeMutation = useMutation({
    mutationFn: ({ scanId, userId, notes }: { scanId: string; userId: string; notes?: string }) =>
      adminControlService.createDisputeCase({ subjectType: 'CASHBACK', subjectId: scanId, userId, notes }),
    onSuccess: () => {
      toast.success(t('disputeOpened'));
      setDisputeDraft(null);
      setDisputeNote('');
      queryClient.invalidateQueries({ queryKey: ['dispute-cases'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (msg?.includes('already exists')) {
        toast.error(t('disputeExists'));
      } else {
        toast.error(msg ?? t('errorDispute'));
      }
    },
  });

  const isRowMutating = (id: string) =>
    (approveMutation.isPending && approveMutation.variables?.id === id) ||
    (rejectMutation.isPending && rejectMutation.variables?.id === id) ||
    (openDisputeMutation.isPending && openDisputeMutation.variables?.scanId === id);
  const isAnyMutating = approveMutation.isPending || rejectMutation.isPending || openDisputeMutation.isPending;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isAnyMutating) return;
      setActionDraft(null);
      setDisputeDraft(null);
      setBulkRejectDraft(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isAnyMutating]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'bg' ? 'bg-BG' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  const currentPageRows = data?.data ?? [];
  const allPageSelected = currentPageRows.length > 0 && currentPageRows.every((r) => selectedIds.has(r.id));

  const fraudColumns: ColumnDef<FraudSignalReceipt>[] = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={allPageSelected}
          onChange={() => toggleSelectAll(currentPageRows)}
          title={lang === 'bg' ? 'Избери всички на страницата' : 'Select all on this page'}
          style={{ cursor: 'pointer', accentColor: palette.accent }}
        />
      ) as unknown as string,
      render: (row) => (
        <input
          type="checkbox"
          checked={selectedIds.has(row.id)}
          onChange={() => toggleRowSelection(row.id)}
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: 'pointer', accentColor: palette.accent }}
        />
      ),
    },
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
        // Location mismatch: GPS deviation codes from fraudDetection.service.ts.
        const hasLocationMismatch = row.fraudReasons.some((r) => LOCATION_MISMATCH_SIGNALS.has(r));
        const locationLevel: PillLevel = !row.venue ? 'HIGH' : hasLocationMismatch ? 'MEDIUM' : 'LOW';
        const locationLabel = !row.venue
          ? t('locationNoVenue')
          : hasLocationMismatch
            ? t('locationMismatch')
            : t('locationMatched');

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
        // Receipt quality: OCR confidence, template match, amount mismatch codes.
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
            onClick={() => setActionDraft({ id: row.id, type: 'approve', text: '', verifiedAmount: '' })}
          >
            {t('approve')}
          </ActionBtn>
          <ActionBtn
            $variant="reject"
            disabled={isRowMutating(row.id)}
            onClick={() => setActionDraft({ id: row.id, type: 'reject', text: '', verifiedAmount: '' })}
          >
            {t('reject')}
          </ActionBtn>
          <ActionBtn
            $variant="dispute"
            disabled={isRowMutating(row.id)}
            onClick={() => {
              setDisputeDraft({ scanId: row.id, userId: row.user.id, merchantName: row.merchantName });
              setDisputeNote('');
            }}
          >
            {t('openDispute')}
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
            {pageTitle}
            {data && data.meta.total > 0 && (
              <TotalBadge>{data.meta.total.toLocaleString()}</TotalBadge>
            )}
          </PageTitle>
          <PageSubtitle>{t('subtitle')}</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      {/* Alert deep-link time-window banner: shown when navigating from suspicious_activity alert */}
      {dateFrom && (() => {
        const d = new Date(dateFrom);
        return (
          <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: palette.warningSoft, border: `1px solid ${palette.warning}40`, borderRadius: '0.625rem', fontSize: '0.875rem', color: palette.warning, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>
              {lang === 'bg' ? 'Показват се сигнали от' : 'Showing signals from'}
              {' '}{d.toLocaleString(lang === 'bg' ? 'bg-BG' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })}
              {lang === 'bg' ? ' насам' : ' onwards'}
              {data && ` — ${data.meta.total.toLocaleString()} ${lang === 'bg' ? 'резултата' : 'results'}`}
            </span>
            <button onClick={() => setDateFrom('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: palette.warning, fontWeight: 600, fontSize: '0.875rem' }}>
              {lang === 'bg' ? '✕ Покажи всички' : '✕ Show all'}
            </button>
          </div>
        );
      })()}

      {/* §7.2 — Signal monitoring summary */}
      <SectionDivider>
        <SectionLabel>{lang === 'bg' ? 'Мониторинг на сигнали' : 'Signal monitoring'}</SectionLabel>
        <SectionLine />
      </SectionDivider>
      <StatGrid>
            <Stat
              $active={isRiskReviewRoute && signalCategory === 'duplicate'}
              onClick={() => isRiskReviewRoute ? toggleCategory('duplicate') : navigate('/admin/control/risk?signalCategory=duplicate')}
              title={lang === 'bg' ? 'Филтрирай по дублиране' : 'Filter by duplicates'}
            >
              <StatLabel>{t('statDuplicate')}</StatLabel>
              <StatValue>{s?.duplicate ?? '—'}</StatValue>
            </Stat>
            <Stat
              $active={isRiskReviewRoute && signalCategory === 'qrMismatch'}
              onClick={() => isRiskReviewRoute ? toggleCategory('qrMismatch') : navigate('/admin/control/risk?signalCategory=qrMismatch')}
              title={lang === 'bg' ? 'Филтрирай по QR / Локация' : 'Filter by QR/Location'}
            >
              <StatLabel>{t('statQr')}</StatLabel>
              <StatValue>{s?.qrMismatch ?? '—'}</StatValue>
            </Stat>
            <Stat
              $active={isRiskReviewRoute && signalCategory === 'velocity'}
              onClick={() => isRiskReviewRoute ? toggleCategory('velocity') : navigate('/admin/control/risk?signalCategory=velocity')}
              title={lang === 'bg' ? 'Филтрирай по честота' : 'Filter by velocity'}
            >
              <StatLabel>{t('statVelocity')}</StatLabel>
              <StatValue>{s?.velocity ?? '—'}</StatValue>
            </Stat>
            <Stat
              $active={isRiskReviewRoute && signalCategory === 'receiptMatch'}
              onClick={() => isRiskReviewRoute ? toggleCategory('receiptMatch') : navigate('/admin/control/risk?signalCategory=receiptMatch')}
              title={lang === 'bg' ? 'Филтрирай по качество на бележка' : 'Filter by receipt quality'}
            >
              <StatLabel>{t('statReceipt')}</StatLabel>
              <StatValue>{s?.receiptMatch ?? '—'}</StatValue>
            </Stat>
            <Stat
              $active={isRiskReviewRoute && signalCategory === 'suspicious'}
              onClick={() => isRiskReviewRoute ? toggleCategory('suspicious') : navigate('/admin/control/risk?signalCategory=suspicious')}
              title={lang === 'bg' ? 'Филтрирай по подозрително поведение' : 'Filter by suspicious behaviour'}
            >
              <StatLabel>{t('statSuspicious')}</StatLabel>
              <StatValue>{s?.suspicious ?? '—'}</StatValue>
            </Stat>
            <Stat
              onClick={() => {
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                navigate(`/admin/subscribers/all?ibanChangedAfter=${encodeURIComponent(sevenDaysAgo)}`);
              }}
              title={lang === 'bg' ? 'Виж абонатите с IBAN промяна (последните 7 дни)' : 'View subscribers with IBAN change (last 7 days)'}
            >
              <StatLabel>{t('statIban')}</StatLabel>
              <StatValue>{s?.ibanAnomaly ?? '—'}</StatValue>
              <div style={{ fontSize: '.68rem', color: palette.accent, marginTop: '.2rem', fontWeight: 600 }}>
                {lang === 'bg' ? '→ Абонати' : '→ Subscribers'}
              </div>
            </Stat>
            <Stat title={lang === 'bg' ? 'Без филтър — неразпознати сигнали' : 'No filter — unrecognised signals'}>
              <StatLabel>{t('statOther')}</StatLabel>
              <StatValue>{s?.other ?? '—'}</StatValue>
            </Stat>
          </StatGrid>
          <MetaLine style={{ marginBottom: '0' }}>{t('globalNote')}</MetaLine>

          {/* §7.2 monitoring view: prompt to open the queue */}
          {!isRiskReviewRoute && (
            <div style={{ marginTop: '1rem', padding: '.75rem 1rem', background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: '.625rem', fontSize: '.875rem', color: palette.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <span>
                {lang === 'bg'
                  ? 'Щракнете върху сигнал по-горе, за да отворите опашката за преглед, филтрирана по категория.'
                  : 'Click a signal above to open the review queue filtered by that category.'}
              </span>
              <CancelBtn style={{ fontSize: '.8125rem', whiteSpace: 'nowrap' }} onClick={() => navigate('/admin/control/risk')}>
                {lang === 'bg' ? '→ Опашка за преглед' : '→ Review queue'}
              </CancelBtn>
            </div>
          )}

          {/* §7.1 — Review queue (shown only on /risk route) */}
          {isRiskReviewRoute && (
            <>
              <SectionDivider>
                <SectionLabel>{lang === 'bg' ? 'Преглед на рискови транзакции' : 'Risk transaction review'}</SectionLabel>
                <SectionLine />
              </SectionDivider>

              <Card>
                <FilterRow>
                  <Select value={tier} onChange={(e) => { setTier(e.target.value as typeof tier); setPage(1); }}>
                    <option value="all">{t('allTiers')}</option>
                    <option value="REVIEW_31_60">{t('reviewTier')}</option>
                    <option value="HIGH_61_PLUS">{t('highTier')}</option>
                  </Select>
                  <TextInput
                    placeholder={t('venueFilter')}
                    value={venueIdInput}
                    onChange={(e) => setVenueIdInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { setVenueId(venueIdInput.trim()); setPage(1); }
                      if (e.key === 'Escape') { setVenueIdInput(''); setVenueId(''); setPage(1); }
                    }}
                    onBlur={() => {
                      if (venueIdInput.trim() !== venueId) {
                        setVenueId(venueIdInput.trim());
                        setPage(1);
                      }
                    }}
                  />
                  {signalCategory && (
                    <CancelBtn
                      style={{ fontSize: '.8125rem' }}
                      onClick={() => { setSignalCategory(''); setPage(1); }}
                    >
                      {lang === 'bg' ? '✕ Изчисти категорията' : '✕ Clear category'}
                    </CancelBtn>
                  )}
                </FilterRow>

                {/* §7.2 bulk-reject bar — appears when ≥1 rows are selected */}
                {selectedIds.size > 0 && (
                  <BulkBar>
                    <BulkCount>{selectedIds.size}</BulkCount>
                    {t('bulkSelected')}
                    <BulkRejectBtn
                      disabled={bulkRejectMutation.isPending}
                      onClick={() => setBulkRejectDraft({ rejectCode: '', text: '' })}
                    >
                      {t('bulkReject')}
                    </BulkRejectBtn>
                    <CancelBtn
                      style={{ fontSize: '.8125rem' }}
                      onClick={() => setSelectedIds(new Set())}
                    >
                      {t('clearSelection')}
                    </CancelBtn>
                  </BulkBar>
                )}

                <DataTable
                  columns={fraudColumns}
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
            </>
          )}

      {actionDraft && (
        <Overlay onClick={() => !isAnyMutating && setActionDraft(null)}>
          <Dialog onClick={(e) => e.stopPropagation()}>
            <DialogTitle>
              {actionDraft.type === 'approve' ? t('approve') : t('reject')}
            </DialogTitle>
            {actionDraft.type === 'approve' && (
              <>
                <TextInput
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={t('verifiedAmountLabel')}
                  value={actionDraft.verifiedAmount}
                  onChange={(e) => setActionDraft({ ...actionDraft, verifiedAmount: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', marginBottom: '0.5rem' }}
                  autoFocus
                />
                <div style={{ fontSize: '0.75rem', color: palette.textSubtle, marginBottom: '0.5rem' }}>
                  {t('verifiedAmountHint')}
                </div>
              </>
            )}
            {actionDraft.type === 'reject' && (
              <>
                <div style={{ fontSize: '0.75rem', color: palette.textSubtle, marginBottom: '0.25rem' }}>
                  {t('reasonCodeLabel')}
                </div>
                <select
                  value={actionDraft.rejectCode ?? ''}
                  onChange={(e) => setActionDraft({ ...actionDraft, rejectCode: (e.target.value || undefined) as RejectReasonCode | undefined })}
                  style={{
                    width: '100%', boxSizing: 'border-box', marginBottom: '0.5rem',
                    padding: '0.4rem 0.6rem', border: `1px solid ${palette.border}`,
                    borderRadius: '0.5rem', fontSize: '0.875rem', background: palette.bg,
                    color: palette.text,
                  }}
                  autoFocus
                >
                  <option value="">— {t('reasonCodeLabel')} —</option>
                  {REJECT_REASON_CODES.map((code) => (
                    <option key={code} value={code}>
                      {REJECT_REASON_LABEL[code][language as 'en' | 'bg']}
                    </option>
                  ))}
                </select>
              </>
            )}
            <DialogTextarea
              placeholder={actionDraft.type === 'reject' ? t('reasonLabel') : t('notesLabel')}
              value={actionDraft.text}
              onChange={(e) => setActionDraft({ ...actionDraft, text: e.target.value })}
            />
            <DialogFooter>
              <CancelBtn disabled={isAnyMutating} onClick={() => setActionDraft(null)}>
                {t('cancel')}
              </CancelBtn>
              <ConfirmBtn
                $variant={actionDraft.type}
                disabled={isAnyMutating || (actionDraft.type === 'reject' && !actionDraft.rejectCode)}
                onClick={() => {
                  const txt = actionDraft.text.trim();
                  if (actionDraft.type === 'approve') {
                    const amount = parseFloat(actionDraft.verifiedAmount);
                    approveMutation.mutate({
                      id: actionDraft.id,
                      opts: {
                        notes: txt || undefined,
                        verifiedAmount: !isNaN(amount) && amount > 0 ? amount : undefined,
                      },
                    });
                  } else {
                    if (!actionDraft.rejectCode) {
                      toast.error(t('reasonCodeRequired'));
                      return;
                    }
                    const codeLabel = REJECT_REASON_LABEL[actionDraft.rejectCode].bg;
                    const composed = txt
                      ? `[${actionDraft.rejectCode}] ${codeLabel} — ${txt}`
                      : `[${actionDraft.rejectCode}] ${codeLabel}`;
                    rejectMutation.mutate({ id: actionDraft.id, reason: composed });
                  }
                }}
              >
                {t('confirm')}
              </ConfirmBtn>
            </DialogFooter>
          </Dialog>
        </Overlay>
      )}

      {disputeDraft && (
        <Overlay onClick={() => !isAnyMutating && setDisputeDraft(null)}>
          <Dialog onClick={(e) => e.stopPropagation()}>
            <DialogTitle>{t('openDispute')}</DialogTitle>
            {disputeDraft.merchantName && (
              <div style={{ fontSize: '.8125rem', color: palette.textMuted, marginBottom: '.75rem' }}>
                {disputeDraft.merchantName}
              </div>
            )}
            <DialogTextarea
              placeholder={t('notesLabel')}
              value={disputeNote}
              onChange={(e) => setDisputeNote(e.target.value)}
              autoFocus
            />
            <DialogFooter>
              <CancelBtn disabled={isAnyMutating} onClick={() => setDisputeDraft(null)}>
                {t('cancel')}
              </CancelBtn>
              <ConfirmBtn
                $variant="approve"
                disabled={isAnyMutating}
                onClick={() =>
                  openDisputeMutation.mutate({
                    scanId: disputeDraft.scanId,
                    userId: disputeDraft.userId,
                    notes: disputeNote.trim() || undefined,
                  })
                }
              >
                {openDisputeMutation.isPending ? '…' : t('confirm')}
              </ConfirmBtn>
            </DialogFooter>
          </Dialog>
        </Overlay>
      )}

      {/* §7.2 bulk-reject modal — backend caps at 25 IDs/request; caller chunks */}
      {bulkRejectDraft && (
        <Overlay onClick={() => !bulkRejectMutation.isPending && setBulkRejectDraft(null)}>
          <Dialog onClick={(e) => e.stopPropagation()}>
            <DialogTitle>
              {t('bulkReject')} ({selectedIds.size})
            </DialogTitle>
            <div style={{ fontSize: '0.75rem', color: palette.textSubtle, marginBottom: '0.25rem' }}>
              {t('reasonCodeLabel')}
            </div>
            <select
              value={bulkRejectDraft.rejectCode}
              onChange={(e) => setBulkRejectDraft({ ...bulkRejectDraft, rejectCode: (e.target.value || '') as RejectReasonCode | '' })}
              style={{
                width: '100%', boxSizing: 'border-box', marginBottom: '0.5rem',
                padding: '0.4rem 0.6rem', border: `1px solid ${palette.border}`,
                borderRadius: '0.5rem', fontSize: '0.875rem', background: palette.bg,
                color: palette.text,
              }}
              autoFocus
            >
              <option value="">— {t('reasonCodeLabel')} —</option>
              {REJECT_REASON_CODES.map((code) => (
                <option key={code} value={code}>
                  {REJECT_REASON_LABEL[code][lang]}
                </option>
              ))}
            </select>
            <DialogTextarea
              placeholder={t('reasonLabel')}
              value={bulkRejectDraft.text}
              onChange={(e) => setBulkRejectDraft({ ...bulkRejectDraft, text: e.target.value })}
            />
            <DialogFooter>
              <CancelBtn disabled={bulkRejectMutation.isPending} onClick={() => setBulkRejectDraft(null)}>
                {t('cancel')}
              </CancelBtn>
              <ConfirmBtn
                $variant="reject"
                disabled={bulkRejectMutation.isPending || !bulkRejectDraft.rejectCode}
                onClick={() => {
                  if (!bulkRejectDraft.rejectCode) { toast.error(t('reasonCodeRequired')); return; }
                  const codeLabel = REJECT_REASON_LABEL[bulkRejectDraft.rejectCode].bg;
                  const txt = bulkRejectDraft.text.trim();
                  const composed = txt
                    ? `[${bulkRejectDraft.rejectCode}] ${codeLabel} — ${txt}`
                    : `[${bulkRejectDraft.rejectCode}] ${codeLabel}`;
                  // Backend caps at 25 IDs — chunk client-side for larger selections.
                  const ids = [...selectedIds];
                  const CHUNK = 25;
                  const chunks: string[][] = [];
                  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
                  // Fire chunks sequentially to avoid overwhelming the backend.
                  (async () => {
                    let totalSuccess = 0;
                    let totalError = 0;
                    for (const chunk of chunks) {
                      try {
                        const r = await adminControlService.bulkRejectRiskSignals(chunk, composed);
                        totalSuccess += r.data.successCount;
                        totalError += r.data.errorCount;
                      } catch {
                        totalError += chunk.length;
                      }
                    }
                    if (totalError > 0) {
                      toast.error(t('bulkError'));
                    } else {
                      toast.success(`${totalSuccess} ${lang === 'bg' ? 'сигнала отхвърлени' : 'signal(s) rejected'}`);
                    }
                    setBulkRejectDraft(null);
                    setSelectedIds(new Set());
                    queryClient.invalidateQueries({ queryKey: ['admin-fraud-signals'] });
                    queryClient.invalidateQueries({ queryKey: ['admin-risk-queue-summary'] });
                  })();
                }}
              >
                {bulkRejectMutation.isPending ? '…' : t('confirm')}
              </ConfirmBtn>
            </DialogFooter>
          </Dialog>
        </Overlay>
      )}
    </PageShell>
  );
}
