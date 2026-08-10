import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import { palette } from '../../styles/adminTheme';
import {
  adminCashbackService,
  CashbackEntry,
  CashbackEntryStatus,
} from '../../services/adminCashback.service';

/* ─── i18n ──────────────────────────────────────────────────────────────────── */
type Lang = 'en' | 'bg';
const I18N = {
  // Page header
  eyebrow:          { en: 'Subscribers',      bg: 'Абонати' },
  pageTitle:        { en: 'Cashback',          bg: 'Кешбек' },
  pageSubtitle:     { en: 'Cashback entries by lifecycle status. Expiring entries are Cleared cashback due within 14 days.',
                      bg: 'Записи по статус. Изтичащите са одобрен кешбек с падеж до 14 дни.' },
  // Stat card labels
  statAccrued:      { en: 'Accrued',           bg: 'Начислен' },
  statCleared:      { en: 'Cleared',           bg: 'Одобрен' },
  statPending:      { en: 'Pending',           bg: 'Изчакващ' },
  statExpiring:     { en: 'Expiring (14 days)', bg: 'Изтичащ (14 дни)' },
  statLocked:       { en: 'Locked',            bg: 'Заключен' },
  statPaid:         { en: 'Paid',              bg: 'Платен' },
  statExpired:      { en: 'Expired',           bg: 'Изтекъл' },
  // Threshold hint
  thresholdHint:    { en: 'Payout thresholds (cleared cashback only):',
                      bg: 'Прагове за изплащане (само одобрен кешбек се брои):' },
  // Filter
  allStatuses:      { en: 'All statuses',      bg: 'Всички статуси' },
  searchPh:         { en: 'Search subscriber (name / email)…', bg: 'Търси абонат (ime / имейл)…' },
  dateFrom:         { en: 'From date',         bg: 'От дата' },
  dateTo:           { en: 'To date',           bg: 'До дата' },
  exportLoading:    { en: 'Loading…',          bg: 'Зарежда…' },
  exportBtn:        { en: '↓ CSV',             bg: '↓ CSV' },
  // Column headers
  colSubscriber:    { en: 'Subscriber',        bg: 'Абонат' },
  colAmount:        { en: 'Amount',            bg: 'Сума' },
  colStatus:        { en: 'Status',            bg: 'Статус' },
  colExpires:       { en: 'Expires',           bg: 'Изтича' },
  colPartner:       { en: 'Partner',           bg: 'Партньор' },
  colNote:          { en: 'Note',              bg: 'Бележка' },
  colCreated:       { en: 'Created',           bg: 'Начислен' },
  // Entry status labels
  sPending:         { en: 'Pending',           bg: 'Изчакващ' },
  sTrialPending:    { en: 'Trial pending',     bg: 'Пробен (изчакващ)' },
  sCleared:         { en: 'Cleared',           bg: 'Одобрен' },
  sLocked:          { en: 'Locked',            bg: 'Заключен' },
  sPaid:            { en: 'Paid',              bg: 'Платен' },
  sExpired:         { en: 'Expired',           bg: 'Изтекъл' },
  sVoided:          { en: 'Voided',            bg: 'Анулиран' },
  statVoided:       { en: 'Voided',            bg: 'Анулиран' },
  statTrialPending: { en: 'Trial pending',     bg: 'Пробен (изчакващ)' },
  // Currency / unit
  bgn:              { en: 'BGN',               bg: 'лв.' },
  days:             { en: 'days',              bg: 'дни' },
  // Empty state
  noEntries:        { en: 'No cashback entries', bg: 'Няма кешбек записи' },
  // Row action labels
  actionApprove:    { en: 'Approve',           bg: 'Одобри' },
  actionLock:       { en: 'Lock',              bg: 'Заключи' },
  actionMarkPaid:   { en: 'Mark as paid',      bg: 'Маркирай платен' },
  actionExpire:     { en: 'Expire',            bg: 'Изтечи' },
  actionVoid:       { en: 'Void…',             bg: 'Анулирай…' },
  confirmVoid:      { en: 'Void cashback for {email}?\nAmount: {amount}\nReason: {reason}\nThe user will see this entry as "Voided" with the reason.',
                      bg: 'Анулирай кешбек за {email}?\nСума: {amount}\nПричина: {reason}\nАбонатът ще види записа като „Анулиран" с причината.' },
  voidedReasonLabel:{ en: 'Voided:',            bg: 'Анулиран:' },
  // Void reason modal labels
  voidModalTitle:   { en: 'Void Cashback Entry', bg: 'Анулирай кешбек запис' },
  voidCategoryLabel:{ en: 'Reason category (required):', bg: 'Категория причина (задължително):' },
  voidNoteLabel:    { en: 'Additional details (optional):', bg: 'Допълнителни детайли (по избор):' },
  voidNotePlaceholder: { en: 'Enter additional notes…', bg: 'Въведи допълнителни бележки…' },
  voidReasonDuplicate: { en: 'DUPLICATE — Duplicate transaction', bg: 'DUPLICATE — Дублиран запис' },
  voidReasonFraud:  { en: 'FRAUD — Fraudulent activity', bg: 'FRAUD — Мошеническа дейност' },
  voidReasonSystemError: { en: 'SYSTEM_ERROR — System error', bg: 'SYSTEM_ERROR — Системна грешка' },
  voidReasonAdminCorrection: { en: 'ADMIN_CORRECTION — Admin correction', bg: 'ADMIN_CORRECTION — Администраторска корекция' },
  voidReasonPartnerDispute: { en: 'PARTNER_DISPUTE — Partner dispute', bg: 'PARTNER_DISPUTE — Спор с партньор' },
  voidReasonOther:  { en: 'OTHER — Other reason', bg: 'OTHER — Друга причина' },
  voidCancel:       { en: 'Cancel',            bg: 'Отмени' },
  voidSubmit:       { en: 'Void Entry',        bg: 'Анулирай запис' },
  // Confirm dialogs
  confirmApprove:   { en: 'Approve cashback entry for {email}?\nAmount: {amount}',
                      bg: 'Одобри кешбек записа за {email}?\nСума: {amount}' },
  confirmLock:      { en: 'Lock cashback entry for {email}?\nAmount: {amount}',
                      bg: 'Заключи кешбек записа за {email}?\nСума: {amount}' },
  confirmPay:       { en: 'Mark cashback as paid for {email}?\nAmount: {amount}\nThis action cannot be undone.',
                      bg: 'Маркирай като платен кешбек за {email}?\nСума: {amount}\nТова действие не може да се отмени.' },
  confirmExpire:    { en: 'Force-expire cashback for {email}?\nAmount: {amount}{warning}\nThis action cannot be undone.',
                      bg: 'Принудително изтичане на кешбек за {email}?\nСума: {amount}{warning}\nТова действие не може да се отмени.' },
  lockedWarning:    { en: '\n⚠ Entry is LOCKED — the amount will NOT be paid.',
                      bg: '\n⚠ Записът е ЗАКЛЮЧЕН — сумата НЯМА да бъде платена.' },
  // Toast messages
  toastApproved:    { en: 'Entry approved',    bg: 'Записът е одобрен' },
  toastApproveErr:  { en: 'Error approving entry', bg: 'Грешка при одобряване' },
  toastLocked:      { en: 'Entry locked',      bg: 'Записът е заключен' },
  toastLockErr:     { en: 'Error locking entry', bg: 'Грешка при заключване' },
  toastPaid:        { en: 'Entry marked as paid', bg: 'Записът е маркиран като платен' },
  toastPayErr:      { en: 'Error marking entry as paid', bg: 'Грешка при маркиране като платен' },
  toastExpired:     { en: 'Entry expired',     bg: 'Записът е изтекъл' },
  toastExpireErr:   { en: 'Error expiring entry', bg: 'Грешка при изтичане' },
  toastVoided:      { en: 'Entry voided',       bg: 'Записът е анулиран' },
  toastVoidErr:     { en: 'Error voiding entry', bg: 'Грешка при анулиране' },
  toastExportWarn:  { en: 'Warning: exported {n} of {total} entries. Narrow the filter for a complete file.',
                      bg: 'Внимание: експортирани са {n} от {total} записа. Приложи по-тесен филтър за пълен извлечен файл.' },
  toastExportErr:   { en: 'Export failed',     bg: 'Грешка при експорт' },
  // Mutating indicator
  updating:         { en: 'Updating…',         bg: 'Обновяване…' },
  // Threshold plan short labels
  planBasic:        { en: 'Basic',             bg: 'Basic' },
  planPremiumWk:    { en: 'Premium wk.',       bg: 'Premium седм.' },
  planPremiumMo:    { en: 'Premium mo.',       bg: 'Premium мес.' },
  // CSV headers
  csvId:            { en: 'ID',                bg: 'ID' },
  csvSubscriber:    { en: 'Subscriber',        bg: 'Абонат' },
  csvEmail:         { en: 'Email',             bg: 'Имейл' },
  csvAmount:        { en: 'Amount (EUR)',       bg: 'Сума (EUR)' },
  csvStatus:        { en: 'Status',            bg: 'Статус' },
  csvExpires:       { en: 'Expires',           bg: 'Изтича' },
  csvPartner:       { en: 'Partner',           bg: 'Партньор' },
  csvNote:          { en: 'Note',              bg: 'Бележка' },
  csvCreated:       { en: 'Created',           bg: 'Начислен' },
};
type I18NKey = keyof typeof I18N;
function tr(key: I18NKey, lang: Lang, vars?: Record<string, string | number>): string {
  let s: string = I18N[key]?.[lang] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/* ─── Palette ──────────────────────────────────────────────────────────────── */

/* ─── Layout ────────────────────────────────────────────────────────────────── */
const PageShell = styled.div`
  background: ${palette.bg};
  min-height: calc(100vh - 4rem);
  padding: 2rem 2.5rem;
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
  gap: 1rem;
  flex-wrap: wrap;
`;

const TitleBlock = styled.div``;

const Eyebrow = styled.p`
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${palette.textSubtle};
  margin-bottom: 0.25rem;
`;

const PageTitle = styled.h1`
  font-size: 1.75rem;
  font-weight: 800;
  color: ${palette.text};
  margin: 0 0 0.25rem;
`;

const PageSubtitle = styled.p`
  font-size: 0.9375rem;
  color: ${palette.textMuted};
  margin: 0;
`;

/* ─── Stat cards ────────────────────────────────────────────────────────────── */
const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

const StatCard = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.25rem 1.5rem;
`;

const StatLabel = styled.p`
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${palette.textSubtle};
  margin: 0 0 0.375rem;
`;

const StatValue = styled.p<{ $color?: string }>`
  font-size: 1.625rem;
  font-weight: 800;
  color: ${({ $color }) => $color ?? palette.text};
  margin: 0;
  line-height: 1;
`;

/* ─── Table card ────────────────────────────────────────────────────────────── */
const Card = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.5rem;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
  align-items: center;
`;

const MonthInput = styled.input`
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;

const SearchInput = styled.input`
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  min-width: 200px;
  &::placeholder { color: ${palette.textSubtle}; }
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;

const Select = styled.select`
  padding: 0.5rem 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  cursor: pointer;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;

const ExportBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: ${palette.textMuted};
  background: ${palette.surface};
  cursor: pointer;
  white-space: nowrap;
  &:hover { border-color: ${palette.accent}; color: ${palette.accent}; }
  &:disabled { opacity: 0.5; cursor: default; }
`;

/* ─── Void reason modal ──────────────────────────────────────────────────── */
const ModalOverlay = styled.div<{ $visible: boolean }>`
  display: ${({ $visible }) => $visible ? 'flex' : 'none'};
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 2rem;
  max-width: 32rem;
  width: 100%;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
`;

const ModalTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 1.5rem;
`;

const FormGroup = styled.div`
  margin-bottom: 1.25rem;
  &:last-child { margin-bottom: 0; }
`;

const FormLabel = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: ${palette.text};
  margin-bottom: 0.5rem;
`;

const FormSelect = styled.select`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  cursor: pointer;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;

const FormTextarea = styled.textarea`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-family: inherit;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  resize: vertical;
  min-height: 5rem;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;

const FormActions = styled.div`
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
`;

const ModalBtn = styled.button<{ $primary?: boolean }>`
  padding: 0.625rem 1.25rem;
  border: 1px solid ${({ $primary }) => $primary ? palette.accent : palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  background: ${({ $primary }) => $primary ? palette.accent : 'transparent'};
  color: ${({ $primary }) => $primary ? palette.surface : palette.text};
  cursor: pointer;
  transition: all 0.2s ease;
  &:hover {
    background: ${({ $primary }) => $primary ? palette.accent : palette.bg};
    border-color: ${({ $primary }) => $primary ? palette.accent : palette.text};
    opacity: ${({ $primary }) => $primary ? 0.9 : 1};
  }
  &:disabled { opacity: 0.5; cursor: default; }
`;

/* ─── Cell helpers ──────────────────────────────────────────────────────────── */
const SubscriberCell = styled(Link)`
  display: block;
  font-weight: 600;
  color: ${palette.text};
  text-decoration: none;
  &:hover { color: ${palette.accent}; text-decoration: underline; }
`;

const MetaLine = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-top: 0.125rem;
`;

const ExpiryWarning = styled.span`
  font-size: 0.7rem;
  font-weight: 700;
  color: ${palette.danger};
`;

const EntryStatusBadge = styled.span<{ $status: CashbackEntryStatus }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;
  white-space: nowrap;
  ${({ $status }) => {
    switch ($status) {
      case 'Cleared':      return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'Paid':         return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'Pending':      return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'TrialPending': return `background: ${palette.warningSoft}; color: ${palette.warning}; font-style: italic;`;
      case 'Locked':       return `background: ${palette.amberSoft}; color: ${palette.amber};`;
      case 'Voided':       return `background: ${palette.dangerSoft}; color: ${palette.danger}; text-decoration: line-through;`;
      case 'Expired':
      default:             return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
    }
  }}
`;

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
function fmtMoney(n: number | null | undefined, locale: string): string {
  return (n ?? 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ─── Void Reason Modal Component ──────────────────────────────────────── */
interface VoidReasonModalProps {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
  lang: Lang;
  triggerButtonRef?: React.RefObject<HTMLButtonElement>;
}

function VoidReasonModal({ visible, onCancel, onSubmit, lang, triggerButtonRef }: VoidReasonModalProps) {
  const T = (key: I18NKey, vars?: Record<string, string | number>) => tr(key, lang, vars);
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const voidCategoryRef = useRef<HTMLSelectElement>(null);

  // Focus trap: focus category dropdown when modal opens, restore focus when it closes
  useEffect(() => {
    if (visible) {
      // Focus the category dropdown on modal open
      voidCategoryRef.current?.focus();
    } else if (triggerButtonRef?.current) {
      // Restore focus to the trigger button on modal close
      triggerButtonRef.current.focus();
    }
  }, [visible, triggerButtonRef]);

  const handleSubmit = () => {
    if (!category) return;
    const reason = note.trim() ? `${category}: ${note.trim()}` : category;
    onSubmit(reason);
    // Reset form
    setCategory('');
    setNote('');
  };

  const handleCancel = () => {
    setCategory('');
    setNote('');
    onCancel();
  };

  return (
    <ModalOverlay $visible={visible}>
      <ModalContent>
        <ModalTitle>{T('voidModalTitle')}</ModalTitle>
        <FormGroup>
          <FormLabel htmlFor="voidCategory">{T('voidCategoryLabel')}</FormLabel>
          <FormSelect
            id="voidCategory"
            ref={voidCategoryRef}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{T('voidCategoryLabel').replace(':*', '')}</option>
            <option value="DUPLICATE">{T('voidReasonDuplicate')}</option>
            <option value="FRAUD">{T('voidReasonFraud')}</option>
            <option value="SYSTEM_ERROR">{T('voidReasonSystemError')}</option>
            <option value="ADMIN_CORRECTION">{T('voidReasonAdminCorrection')}</option>
            <option value="PARTNER_DISPUTE">{T('voidReasonPartnerDispute')}</option>
            <option value="OTHER">{T('voidReasonOther')}</option>
          </FormSelect>
        </FormGroup>
        <FormGroup>
          <FormLabel htmlFor="voidNote">{T('voidNoteLabel')}</FormLabel>
          <FormTextarea
            id="voidNote"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={T('voidNotePlaceholder')}
          />
        </FormGroup>
        <FormActions>
          <ModalBtn onClick={handleCancel}>{T('voidCancel')}</ModalBtn>
          <ModalBtn $primary disabled={!category} onClick={handleSubmit}>
            {T('voidSubmit')}
          </ModalBtn>
        </FormActions>
      </ModalContent>
    </ModalOverlay>
  );
}

/* ─── Component ─────────────────────────────────────────────────────────────── */
export default function AdminCashbackPage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const lang: Lang = language === 'bg' ? 'bg' : 'en';
  const locale = language === 'bg' ? 'bg-BG' : 'en-GB';
  const T = (key: I18NKey, vars?: Record<string, string | number>) => tr(key, lang, vars);

  const [urlParams] = useSearchParams();
  const [entryStatus, setEntryStatus] = useState<CashbackEntryStatus | ''>('');
  const [entryPage, setEntryPage] = useState(1);
  const [searchInput, setSearchInput] = useState(urlParams.get('search') ?? '');
  const [search, setSearch] = useState(urlParams.get('search') ?? '');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [voidModalVisible, setVoidModalVisible] = useState(false);
  const [voidModalEntry, setVoidModalEntry] = useState<CashbackEntry | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voidTriggerRef = useRef<HTMLButtonElement>(null);

  // Debounce subscriber search — server-side across all pages
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setEntryPage(1);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale, {
          day: '2-digit', month: 'short', year: 'numeric',
        })
      : '—';

  const fmt = (n: number | null | undefined) => fmtMoney(n, locale);

  // BC-QA-031: the backend now returns plain EUR numbers (dual-currency
  // display feature removed) — format directly, no {bgn, eur, windowOpen}
  // wrapper to destructure.
  const fmtAmount = (amount: number | null | undefined) =>
    `€${(amount ?? 0).toFixed(2)}`;

  const { data: stats } = useQuery({
    queryKey: ['admin-cashback-stats'],
    queryFn: () => adminCashbackService.getStats(),
  });

  const { data: thresholds } = useQuery({
    queryKey: ['admin-cashback-payout-thresholds'],
    queryFn: () => adminCashbackService.getPayoutThresholds(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: entriesData, isLoading: isEntriesLoading } = useQuery({
    queryKey: ['admin-cashback-entries', entryPage, entryStatus, search, dateFrom, dateTo],
    queryFn: () => adminCashbackService.getEntries({
      page: entryPage,
      limit: 25,
      status: entryStatus || undefined,
      search: search || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
  });

  const approveMutation = useMutation({
    mutationFn: (entryId: string) => adminCashbackService.approveEntry(entryId),
    onSuccess: () => {
      toast.success(T('toastApproved'));
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-entries'] });
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-stats'] });
    },
    onError: () => toast.error(T('toastApproveErr')),
  });

  const lockMutation = useMutation({
    mutationFn: (entryId: string) => adminCashbackService.lockEntry(entryId),
    onSuccess: () => {
      toast.success(T('toastLocked'));
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-entries'] });
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-stats'] });
    },
    onError: () => toast.error(T('toastLockErr')),
  });

  const payMutation = useMutation({
    mutationFn: (entryId: string) => adminCashbackService.payEntry(entryId),
    onSuccess: () => {
      toast.success(T('toastPaid'));
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-entries'] });
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-stats'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? T('toastPayErr')),
  });

  const expireMutation = useMutation({
    mutationFn: (entryId: string) => adminCashbackService.expireEntry(entryId),
    onSuccess: () => {
      toast.success(T('toastExpired'));
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-entries'] });
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-stats'] });
    },
    onError: () => toast.error(T('toastExpireErr')),
  });

  const voidMutation = useMutation({
    mutationFn: (payload: { entryId: string; reason: string }) =>
      adminCashbackService.voidEntry(payload.entryId, payload.reason),
    onSuccess: () => {
      toast.success(T('toastVoided'));
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-entries'] });
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-stats'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? T('toastVoidErr')),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await adminCashbackService.getEntries({
        page: 1,
        limit: 10000,
        status: entryStatus || undefined,
        search: search || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      if (result.total > result.data.length) {
        toast(T('toastExportWarn', { n: result.data.length, total: result.total }), { icon: '⚠️' });
      }
      exportCsv(result.data, lang, locale);
    } catch {
      toast.error(T('toastExportErr'));
    } finally {
      setExporting(false);
    }
  };

  const statusLabels: Record<CashbackEntryStatus, I18NKey> = {
    Pending: 'sPending', TrialPending: 'sTrialPending', Cleared: 'sCleared', Locked: 'sLocked', Paid: 'sPaid', Expired: 'sExpired', Voided: 'sVoided',
  };

  const entryColumns: ColumnDef<CashbackEntry>[] = [
    {
      key: 'subscriber',
      header: T('colSubscriber'),
      render: (row) => {
        const name = row.user.firstName || row.user.lastName
          ? `${row.user.firstName ?? ''} ${row.user.lastName ?? ''}`.trim()
          : row.user.email;
        return (
          <div>
            <SubscriberCell to={`/admin/subscribers/${row.user.id}`}>
              {name}
            </SubscriberCell>
            <MetaLine>{row.user.email}</MetaLine>
          </div>
        );
      },
    },
    {
      key: 'amount',
      header: T('colAmount'),
      render: (row) => (
        <span style={{ fontWeight: 700, color: palette.text }}>
          {fmtAmount(row.amount)}
        </span>
      ),
    },
    {
      key: 'state',
      header: T('colStatus'),
      render: (row) => (
        <div>
          <EntryStatusBadge $status={row.status}>{T(statusLabels[row.status])}</EntryStatusBadge>
          {row.status === 'Voided' && row.voidedReason && (
            <MetaLine title={row.voidedReason} style={{ maxWidth: '14rem' }}>
              {T('voidedReasonLabel')} {row.voidedReason}
            </MetaLine>
          )}
        </div>
      ),
    },
    {
      key: 'expires',
      header: T('colExpires'),
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>
          {row.cashbackExpiresAt ? fmtDate(row.cashbackExpiresAt) : '—'}
          {/* Show countdown for Pending, Cleared, and Locked. TrialPending has no rolling expiry — resolved by scheduler. */}
          {row.daysUntilExpiry != null && (row.status === 'Cleared' || row.status === 'Pending' || row.status === 'Locked') && (
            <MetaLine>
              {row.daysUntilExpiry <= 7
                ? <ExpiryWarning>⚠ {row.daysUntilExpiry} {T('days')}</ExpiryWarning>
                : `${row.daysUntilExpiry} ${T('days')}`}
            </MetaLine>
          )}
        </span>
      ),
    },
    {
      key: 'partner',
      header: T('colPartner'),
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>
          {row.partner?.businessName ?? row.receipt?.merchantName ?? '—'}
          {row.receipt?.totalAmount != null && <MetaLine>{fmt(row.receipt.totalAmount)}</MetaLine>}
        </span>
      ),
    },
    {
      key: 'receipt',
      header: T('colNote'),
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>
          {row.description ?? '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: T('colCreated'),
      render: (row) => <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>{fmtDate(row.createdAt)}</span>,
    },
  ];

  const isMutating =
    approveMutation.isPending || lockMutation.isPending ||
    payMutation.isPending || expireMutation.isPending || voidMutation.isPending;

  // Build threshold hint from backend data; fall back to ellipsis if not yet loaded
  const thresholdHint = thresholds
    ? Object.entries({
        [T('planBasic')]:      thresholds.BASIC,
        [T('planPremiumWk')]:  thresholds.PREMIUM_WEEKLY,
        [T('planPremiumMo')]:  thresholds.PREMIUM,
      })
        .map(([label, val]) => `${label} ${val ? fmtAmount(val) : '—'}`)
        .join(' · ')
    : '…';

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>{T('eyebrow')}</Eyebrow>
          <PageTitle>{T('pageTitle')}</PageTitle>
          <PageSubtitle>{T('pageSubtitle')}</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      {/* Spec §3.1 + §4.4 — начислен / одобрен / изчакващ / изтичащ / заключен / платен */}
      <StatsRow>
        <StatCard>
          <StatLabel>{T('statAccrued')}</StatLabel>
          <StatValue $color={palette.text}>
            {stats ? fmtAmount(stats.totalAccrued) : '—'}
          </StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>{T('statCleared')}</StatLabel>
          <StatValue $color={palette.success}>
            {stats ? fmtAmount(stats.totalCleared) : '—'}
          </StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>{T('statPending')}</StatLabel>
          <StatValue $color={palette.warning}>
            {stats ? fmtAmount(stats.totalPending) : '—'}
          </StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>{T('statExpiring')}</StatLabel>
          <StatValue $color={stats && stats.expiringTotal > 0 ? palette.danger : palette.text}>
            {stats ? fmtAmount(stats.expiringTotal) : '—'}
          </StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>{T('statLocked')}</StatLabel>
          <StatValue $color={stats && stats.totalLocked > 0 ? palette.amber : palette.text}>
            {stats ? fmtAmount(stats.totalLocked) : '—'}
          </StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>{T('statPaid')}</StatLabel>
          <StatValue $color={palette.info}>
            {stats ? fmtAmount(stats.totalPaid) : '—'}
          </StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>{T('statExpired')}</StatLabel>
          <StatValue $color={stats && stats.totalExpired > 0 ? palette.danger : palette.text}>
            {stats ? fmtAmount(stats.totalExpired) : '—'}
          </StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>{T('statVoided')}</StatLabel>
          <StatValue $color={stats && stats.totalVoided > 0 ? palette.danger : palette.text}>
            {stats ? fmtAmount(stats.totalVoided) : '—'}
          </StatValue>
        </StatCard>
      </StatsRow>

      {/* Payout threshold reference — fetched from backend (spec §9 Настройки) */}
      <div style={{ fontSize: '0.8rem', color: palette.textSubtle, marginBottom: '1rem' }}>
        {T('thresholdHint')} {thresholdHint}
      </div>

      <Card>
        <FilterRow>
          <Select
            value={entryStatus}
            onChange={(e) => { setEntryStatus(e.target.value as CashbackEntryStatus | ''); setEntryPage(1); }}
          >
            <option value="">{T('allStatuses')}</option>
            <option value="Pending">{T('sPending')}</option>
            <option value="TrialPending">{T('sTrialPending')}</option>
            <option value="Cleared">{T('sCleared')}</option>
            <option value="Locked">{T('sLocked')}</option>
            <option value="Paid">{T('sPaid')}</option>
            <option value="Expired">{T('sExpired')}</option>
            <option value="Voided">{T('sVoided')}</option>
          </Select>
          <SearchInput
            type="text"
            placeholder={T('searchPh')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <MonthInput
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setEntryPage(1); }}
            title={T('dateFrom')}
          />
          <MonthInput
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setEntryPage(1); }}
            title={T('dateTo')}
          />
          <ExportBtn onClick={handleExport} disabled={exporting}>
            {exporting ? T('exportLoading') : T('exportBtn')}
          </ExportBtn>
        </FilterRow>

        <DataTable
          columns={entryColumns}
          data={entriesData?.data ?? []}
          rowKey={(row) => row.id}
          loading={isEntriesLoading}
          emptyMessage={T('noEntries')}
          page={entryPage}
          pageSize={25}
          totalItems={entriesData?.total}
          onPageChange={setEntryPage}
          rowActions={[
            {
              label: T('actionApprove'),
              hidden: (row) => row.status !== 'Pending',
              onClick: (row) => {
                if (!window.confirm(T('confirmApprove', { email: row.user.email, amount: fmtAmount(row.amount) }))) return;
                approveMutation.mutate(row.id);
              },
            },
            {
              label: T('actionLock'),
              hidden: (row) => row.status !== 'Cleared',
              onClick: (row) => {
                if (!window.confirm(T('confirmLock', { email: row.user.email, amount: fmtAmount(row.amount) }))) return;
                lockMutation.mutate(row.id);
              },
            },
            {
              label: T('actionMarkPaid'),
              hidden: (row) => row.status !== 'Locked' || ['ANNULLED', 'FAILED'].includes(row.rawStatus),
              onClick: (row) => {
                if (!window.confirm(T('confirmPay', { email: row.user.email, amount: fmtAmount(row.amount) }))) return;
                payMutation.mutate(row.id);
              },
            },
            {
              label: T('actionExpire'),
              hidden: (row) => ['Paid', 'Expired', 'Voided'].includes(row.status) || ['ANNULLED', 'FAILED'].includes(row.rawStatus),
              onClick: (row) => {
                const warning = row.status === 'Locked' ? T('lockedWarning') : '';
                if (!window.confirm(T('confirmExpire', { email: row.user.email, amount: fmtAmount(row.amount), warning }))) return;
                expireMutation.mutate(row.id);
              },
            },
            // Spec §4.4 v1.1 — Void requires a visible reason (audit + user-facing).
            // Allowed from Pending, TrialPending, Cleared, or Locked. Paid/Expired/Voided are terminal.
            {
              label: T('actionVoid'),
              hidden: (row) => !['Pending', 'TrialPending', 'Cleared', 'Locked'].includes(row.status),
              onClick: (row) => {
                // Store the void trigger button reference for focus restoration after modal closes
                (voidTriggerRef as React.MutableRefObject<HTMLButtonElement | null>).current = document.activeElement as HTMLButtonElement;
                setVoidModalEntry(row);
                setVoidModalVisible(true);
              },
            },
          ]}
        />

        {isMutating && (
          <div style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.8125rem', color: palette.textSubtle }}>
            {T('updating')}
          </div>
        )}
      </Card>

      <VoidReasonModal
        visible={voidModalVisible}
        onCancel={() => {
          setVoidModalVisible(false);
          setVoidModalEntry(null);
        }}
        onSubmit={(reason) => {
          if (!voidModalEntry) return;
          setVoidModalVisible(false);
          if (!window.confirm(T('confirmVoid', { email: voidModalEntry.user.email, amount: fmtAmount(voidModalEntry.amount), reason }))) {
            setVoidModalEntry(null);
            return;
          }
          voidMutation.mutate({ entryId: voidModalEntry.id, reason });
          setVoidModalEntry(null);
        }}
        lang={lang}
        triggerButtonRef={voidTriggerRef}
      />
    </PageShell>
  );
}

/* ─── CSV export (outside component — lang + locale passed as args) ──────── */
function exportCsv(rows: CashbackEntry[], lang: Lang, locale: string): void {
  const header = [
    tr('csvId', lang), tr('csvSubscriber', lang), tr('csvEmail', lang),
    tr('csvAmount', lang), tr('csvStatus', lang), tr('csvExpires', lang),
    tr('csvPartner', lang), tr('csvNote', lang), tr('csvCreated', lang),
  ];
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    header.join(','),
    ...rows.map(r => [
      escape(r.id),
      escape(`${r.user.firstName ?? ''} ${r.user.lastName ?? ''}`.trim() || r.user.email),
      escape(r.user.email),
      escape(fmtMoney(r.amount, locale)),
      escape(r.status),
      escape(r.cashbackExpiresAt ? new Date(r.cashbackExpiresAt).toLocaleDateString(locale) : ''),
      escape(r.partner?.businessName ?? r.receipt?.merchantName ?? ''),
      escape(r.description ?? ''),
      escape(new Date(r.createdAt).toLocaleDateString(locale)),
    ].join(',')),
  ];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cashback-entries-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
