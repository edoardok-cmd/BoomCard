import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import { formatMoneyByMode } from '../../utils/helpers';
import {
  adminTransactionsService,
  AdminTransaction,
  BusinessTransaction,
  CashbackEntryStatus,
  EXPORT_ROW_CAP,
  PartnerRiskAggregate,
  WalletTransactionType,
  WalletTransactionStatus,
} from '../../services/adminTransactions.service';
import {
  adminSubscribersService,
  AdminSubscriber,
} from '../../services/adminSubscribers.service';
import { riskBucket, riskLabel, type RiskBucket } from '../../utils/planLabels';
import { csvEscape, fmtDateTime, downloadBlob } from '../../utils/csvExport';
import { formatPhoneBG } from '../../utils/validators';

import { palette } from '../../styles/adminTheme';
/* ─── Palette ─────────────────────────────────────────────────────────────── */

/* ─── Layout ───────────────────────────────────────────────────────────────── */
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

const TotalBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${palette.infoSoft};
  color: ${palette.info};
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 9999px;
  padding: 0.125rem 0.6rem;
  margin-left: 0.5rem;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
`;

const Card = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.5rem;
`;

/* ─── Stats bar ────────────────────────────────────────────────────────────── */
const StatsBar = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

const StatCard = styled.div<{ $accent?: string; $bg?: string }>`
  background: ${({ $bg }) => $bg ?? palette.bg};
  border: 1px solid ${palette.border};
  border-radius: 0.625rem;
  padding: 1rem 1.25rem;
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
  font-size: 1.375rem;
  font-weight: 800;
  color: ${({ $color }) => $color ?? palette.text};
  font-variant-numeric: tabular-nums;
  margin: 0;
`;

/* ─── Filters ──────────────────────────────────────────────────────────────── */
const FilterRow = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  max-width: 20rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }

  &::placeholder { color: ${palette.textSubtle}; }
`;

const DateInput = styled.input`
  padding: 0.5rem 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  cursor: pointer;

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }
`;

const NumericInput = styled.input`
  padding: 0.5rem 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  width: 8rem;

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }
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

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }
`;

const Btn = styled.button<{ $variant?: 'primary' | 'ghost' }>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 100ms;

  ${({ $variant = 'ghost' }) =>
    $variant === 'primary'
      ? `background: ${palette.accent}; color: ${palette.onAccent}; border-color: ${palette.accent};
         &:hover { background: #b55a3b; }`
      : `background: ${palette.surface}; color: ${palette.textMuted}; border-color: ${palette.border};
         &:hover { background: ${palette.bg}; color: ${palette.text}; }`}
`;

/* ─── Cell helpers ─────────────────────────────────────────────────────────── */
const UserCell = styled.div`
  font-weight: 600;
  color: ${palette.text};
`;

const MetaLine = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-top: 0.125rem;
`;

const AmountCell = styled.div<{ $negative?: boolean }>`
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 0.9375rem;
  color: ${({ $negative }) => ($negative ? palette.danger : palette.success)};
`;

const TypeBadge = styled.span<{ $type: WalletTransactionType }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;

  ${({ $type }) => {
    switch ($type) {
      case 'TOP_UP': return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'WITHDRAWAL': return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'CASHBACK_CREDIT': return `background: ${palette.tealSoft}; color: ${palette.teal};`;
      case 'PURCHASE': return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'REFUND': return `background: ${palette.purpleSoft}; color: ${palette.purple};`;
      default: return `background: ${palette.surfaceAlt}; color: ${palette.text};`;
    }
  }}
`;

// Either-view status — wallet enum, business TransactionStatus, or §4.4
// CashbackEntryStatus (Pending/Cleared/Locked/Paid/Expired). The badge styles
// every known value so REFUNDED / Locked / etc. don't fall through to grey.
type AnyStatus =
  | WalletTransactionStatus
  | 'REFUNDED'
  | CashbackEntryStatus;

const StatusBadge = styled.span<{ $status: AnyStatus | string }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;

  ${({ $status }) => {
    switch ($status) {
      case 'PENDING':
      case 'TRIAL_PENDING':
      case 'Pending':
        return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'PROCESSING':
        return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'COMPLETED':
      case 'Cleared':
        return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'Paid':
        return `background: ${palette.tealSoft}; color: ${palette.teal};`;
      case 'FAILED':
      case 'CANCELLED':
        return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      case 'Locked':
        return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      case 'REFUNDED':
        return `background: ${palette.purpleSoft}; color: ${palette.purple};`;
      case 'Expired':
      case 'ANNULLED':
      default:
        return `background: ${palette.surfaceAlt}; color: ${palette.textMuted};`;
    }
  }}
`;

const RiskBadge = styled.span<{ $level: RiskBucket }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;
  min-width: 2.25rem;
  justify-content: center;

  ${({ $level }) => {
    if ($level === 'high') return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
    if ($level === 'review') return `background: ${palette.warningSoft}; color: ${palette.warning};`;
    return `background: ${palette.successSoft}; color: ${palette.success};`;
  }}
`;

/* ─── Adjustment Modal ─────────────────────────────────────────────────────── */
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Modal = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.875rem;
  padding: 1.75rem;
  width: 100%;
  max-width: 32rem;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
`;

const ModalTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 1.25rem;
`;

const ModalField = styled.div`
  margin-bottom: 1rem;
`;

const ModalLabel = styled.label`
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${palette.textMuted};
  margin-bottom: 0.375rem;
`;

const ModalInput = styled.input`
  width: 100%;
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }
`;

const ModalTextarea = styled.textarea`
  width: 100%;
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  resize: vertical;
  min-height: 4rem;
  box-sizing: border-box;
  font-family: inherit;

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }
`;

const ModalActions = styled.div`
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
`;

const UserResultList = styled.ul`
  list-style: none;
  margin: 0.25rem 0 0;
  padding: 0;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  background: ${palette.surface};
  max-height: 12rem;
  overflow-y: auto;
`;

const UserResultItem = styled.li<{ $active?: boolean }>`
  padding: 0.5rem 0.875rem;
  cursor: pointer;
  font-size: 0.875rem;
  background: ${({ $active }) => ($active ? palette.accentSoft : 'transparent')};

  &:hover { background: ${palette.bg}; }
`;

const HintText = styled.p`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin: 0.25rem 0 0;
`;


function downloadWalletCSV(rows: AdminTransaction[], locale: string) {
  const headers = ['ID', 'User email', 'Type', 'Amount', 'Currency', 'Balance before', 'Balance after', 'Status', 'Note', 'Date (ISO)', 'Date'];
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.id,
        r.wallet.user.email,
        r.type,
        r.amount.toFixed(2),
        r.currency,
        r.balanceBefore.toFixed(2),
        r.balanceAfter.toFixed(2),
        r.status,
        r.description ?? '',
        r.createdAt,
        fmtDateTime(r.createdAt, locale),
      ]
        .map(csvEscape)
        .join(',')
    ),
  ];
  downloadBlob(lines.join('\n'), `wallet-transactions-${new Date().toISOString().slice(0, 10)}.csv`);
}

function downloadBusinessCSV(rows: BusinessTransaction[], locale: string) {
  const headers = [
    'Tx ID',
    'Subscriber',
    'Email',
    'Partner',
    'Location',
    'Amount',
    'Cashback',
    'Partner discount %',
    'Margin',
    'Currency',
    'Risk score',
    'User risk',
    'Cashback lifecycle',
    'Status',
    'Payment method',
    'QR session (ISO)',
    'Receipt uploaded (ISO)',
    'Created (ISO)',
    'Created',
  ];
  const fullName = (u: BusinessTransaction['user']) =>
    `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email;
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.id,
        fullName(r.user),
        r.user.email,
        r.partner?.businessName ?? '',
        r.venue?.name ?? '',
        r.amount.toFixed(2),
        (r.cashbackAmount ?? 0).toFixed(2),
        r.partnerDiscountRate != null ? r.partnerDiscountRate.toFixed(2) : '',
        r.margin != null ? r.margin.toFixed(2) : '',
        r.currency,
        r.riskScore,
        r.userRiskScore ?? 0,
        r.cashbackStatus ?? '',
        r.status,
        r.paymentMethod,
        r.sessionStartedAt ?? '',
        r.receiptUploadedAt ?? '',
        r.createdAt,
        fmtDateTime(r.createdAt, locale),
      ]
        .map(csvEscape)
        .join(',')
    ),
  ];
  downloadBlob(lines.join('\n'), `business-transactions-${new Date().toISOString().slice(0, 10)}.csv`);
}

/* ─── Debounce hook (search input) ─────────────────────────────────────────── */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/* ─── i18n strings (BG / EN) ───────────────────────────────────────────────── */
type Lang = 'bg' | 'en';
const T = {
  eyebrow: { bg: 'Абонати', en: 'Subscribers' },
  titleBusiness: { bg: 'Транзакции', en: 'Transactions' },
  titleWallet: { bg: 'Транзакции в портфейл', en: 'Wallet Transactions' },
  subtitleBusiness: {
    bg: 'Транзакции от касови бележки: партньор, локация, кешбек, марджин, риск',
    en: 'Receipt-based: partner, location, cashback, margin, risk score',
  },
  subtitleWallet: {
    bg: 'Пълен журнал на портфейлната активност на абонатите',
    en: 'Full audit log of wallet activity across subscribers',
  },
  tabBusiness: { bg: 'Бизнес изглед', en: 'Business' },
  tabWallet: { bg: 'Портфейл', en: 'Wallet ledger' },
  exportCsv: { bg: '↓ Експорт CSV', en: '↓ Export CSV' },
  adjustWallet: { bg: '+ Корекция в портфейл', en: '+ Adjust wallet' },
  searchPh: {
    bg: 'Търсене по абонат, партньор, локация или ID…',
    en: 'Search by subscriber, partner, venue or ID…',
  },
  allTypes: { bg: 'Всички типове', en: 'All types' },
  allStatuses: { bg: 'Всички статуси', en: 'All statuses' },
  allRisk: { bg: 'Целият риск', en: 'All risk' },
  riskReview: { bg: 'За преглед (21+)', en: 'Review (21+)' },
  riskHigh: { bg: 'Висок (51+)', en: 'High (51+)' },
  // Wallet TYPE dropdown
  typeTopUp: { bg: 'Захранване', en: 'Top-up' },
  typeWithdrawal: { bg: 'Теглене', en: 'Withdrawal' },
  typeCashback: { bg: 'Кешбек начисление', en: 'Cashback credit' },
  typePurchase: { bg: 'Покупка', en: 'Purchase' },
  typeRefund: { bg: 'Възстановяване', en: 'Refund' },
  typeTransfer: { bg: 'Прехвърляне', en: 'Transfer' },
  typeAdjustment: { bg: 'Корекция', en: 'Adjustment' },
  // STATUS dropdown — wallet
  statusPending: { bg: 'В изчакване', en: 'Pending' },
  statusTrialPending: { bg: 'Триал в изчакване', en: 'Trial pending' },
  statusProcessing: { bg: 'В обработка', en: 'Processing' },
  statusCompleted: { bg: 'Завършена', en: 'Completed' },
  statusFailed: { bg: 'Неуспешна', en: 'Failed' },
  statusCancelled: { bg: 'Отменена', en: 'Cancelled' },
  statusAnnulled: { bg: 'Анулирана', en: 'Annulled' },
  statusRefunded: { bg: 'Възстановена', en: 'Refunded' },
  // Cashback lifecycle (§4.4)
  lifecyclePending: { bg: 'В очакване', en: 'Pending' },
  lifecycleCleared: { bg: 'Налично', en: 'Cleared' },
  lifecycleLocked: { bg: 'Блокирано', en: 'Locked' },
  lifecyclePaid: { bg: 'Изплатено', en: 'Paid' },
  lifecycleExpired: { bg: 'Изтекло', en: 'Expired' },
  minAmount: { bg: 'Мин. сума', en: 'Min amount' },
  maxAmount: { bg: 'Макс. сума', en: 'Max amount' },
  createdFrom: { bg: 'Създадени от', en: 'Created from' },
  createdTo: { bg: 'Създадени до', en: 'Created to' },
  // Stat labels
  totalCount: { bg: 'Брой транзакции', en: 'Transactions' },
  todayCount: { bg: 'Днес', en: 'Today' },
  totalVolume: { bg: 'Общ оборот', en: 'Total volume' },
  averageValue: { bg: 'Средна стойност', en: 'Average value' },
  cashbackCredited: { bg: 'Начислен кешбек', en: 'Cashback credited' },
  withdrawals: { bg: 'Тегления', en: 'Withdrawals' },
  // Column headers
  colTxId: { bg: 'ID', en: 'Tx ID' },
  colSubscriber: { bg: 'Абонат', en: 'Subscriber' },
  colPartner: { bg: 'Партньор / Локация', en: 'Partner / Location' },
  colAmount: { bg: 'Сума', en: 'Amount' },
  colCashback: { bg: 'Кешбек', en: 'Cashback' },
  colMargin: { bg: 'Марджин', en: 'Margin' },
  colRisk: { bg: 'Риск', en: 'Risk' },
  colReceipt: { bg: 'Бележка', en: 'Receipt' },
  colStatus: { bg: 'Статус', en: 'Status' },
  colDate: { bg: 'Дата и час', en: 'Date & time' },
  colType: { bg: 'Тип', en: 'Type' },
  colNote: { bg: 'Бележка', en: 'Note' },
  // Empty / footnotes
  emptyBusiness: { bg: 'Няма намерени транзакции', en: 'No business transactions found' },
  emptyWallet: { bg: 'Няма намерени портфейлни транзакции', en: 'No wallet transactions found' },
  noLocation: { bg: 'Без локация', en: 'No location' },
  noReceipt: { bg: 'Няма бележка', en: 'No receipt' },
  viewReceipt: { bg: 'Виж бележка', en: 'View receipt' },
  qrSession: { bg: 'QR сесия', en: 'QR session' },
  receiptUpload: { bg: 'Качване на бележка', en: 'Receipt upload' },
  recordCreated: { bg: 'Запис', en: 'Record' },
  // Drill-through modal
  detailTitle: { bg: 'Детайли за транзакция', en: 'Transaction details' },
  close: { bg: 'Затвори', en: 'Close' },
  cashbackStatus: { bg: 'Статус на кешбек', en: 'Cashback status' },
  riskScore: { bg: 'Риск на транзакция', en: 'Transaction risk' },
  userRiskScore: { bg: 'Риск на абонат', en: 'Subscriber risk' },
  partnerRiskScore: { bg: 'Риск на партньор', en: 'Partner risk' },
  partnerRiskAvg: { bg: 'средно', en: 'avg' },
  partnerRiskMax: { bg: 'макс.', en: 'max' },
  partnerRiskCount: { bg: 'транзакции', en: 'transactions' },
  paymentMethod: { bg: 'Метод на плащане', en: 'Payment method' },
  // Risk review link (in detail modal for risk > 30)
  riskReviewLink: { bg: 'Виж в риск преглед →', en: 'View in Risk Review →' },
  riskReviewLabel: { bg: 'Риск преглед', en: 'Risk review' },
  // Toasts
  toastAdjustmentCreated: { bg: 'Корекцията е създадена', en: 'Adjustment created' },
  toastAdjustmentFailed: { bg: 'Грешка при създаване на корекция', en: 'Failed to create adjustment' },
  toastNonZero: { bg: 'Въведете сума, различна от нула', en: 'Enter a non-zero amount' },
  toastReasonRequired: { bg: 'Причина е задължителна', en: 'Reason is required' },
  toastExportFailed: { bg: 'Грешка при експорт', en: 'Export failed' },
  exportPreparing: { bg: 'Подготовка на експорт…', en: 'Preparing export…' },
  // Surfaced when the result set exceeded the 10 000-row client-side cap so
  // the admin doesn't trust an incomplete CSV.
  toastExportTruncated: {
    bg: 'Експортирани са първите {cap} от {total} реда. Стеснете филтъра.',
    en: 'Exported first {cap} of {total} rows. Narrow the filter to see the rest.',
  },
  // Modal — adjustment
  adjustTitle: { bg: 'Ръчна корекция в портфейл', en: 'Manual wallet adjustment' },
  adjustUser: { bg: 'Абонат', en: 'User' },
  adjustChange: { bg: 'Смени', en: 'Change' },
  adjustSearchPh: { bg: 'Търсене по име или имейл…', en: 'Search by name or email…' },
  adjustNoMatch: { bg: 'Няма намерени абонати', en: 'No subscribers found' },
  adjustHint: { bg: 'Минимум 2 символа за търсене', en: 'Type at least 2 characters to search' },
  adjustAmount: {
    bg: 'Сума (положителна за кредит, отрицателна за дебит)',
    en: 'Amount (positive to credit, negative to debit)',
  },
  adjustReason: { bg: 'Причина', en: 'Reason' },
  adjustReasonPh: {
    bg: 'Опишете причината за корекцията…',
    en: 'Describe the reason for this adjustment…',
  },
  cancel: { bg: 'Отказ', en: 'Cancel' },
  save: { bg: 'Създай корекция', en: 'Create adjustment' },
  saving: { bg: 'Запазване…', en: 'Saving…' },
};
const t = (key: keyof typeof T, lang: Lang) => T[key][lang];

/* ─── Options ──────────────────────────────────────────────────────────────── */
// Labels go through the i18n table; `labelKey` keeps the literal-key narrowing
// strict so a typo would fail compilation.
type TLabelKey = keyof typeof T;
const TYPE_OPTIONS: Array<{ value: WalletTransactionType | ''; labelKey: TLabelKey }> = [
  { value: '', labelKey: 'allTypes' },
  { value: 'TOP_UP', labelKey: 'typeTopUp' },
  { value: 'WITHDRAWAL', labelKey: 'typeWithdrawal' },
  { value: 'CASHBACK_CREDIT', labelKey: 'typeCashback' },
  { value: 'PURCHASE', labelKey: 'typePurchase' },
  { value: 'REFUND', labelKey: 'typeRefund' },
  { value: 'TRANSFER', labelKey: 'typeTransfer' },
  { value: 'ADJUSTMENT', labelKey: 'typeAdjustment' },
];

const STATUS_OPTIONS: Array<{ value: WalletTransactionStatus | ''; labelKey: TLabelKey }> = [
  { value: '', labelKey: 'allStatuses' },
  { value: 'PENDING', labelKey: 'statusPending' },
  { value: 'TRIAL_PENDING', labelKey: 'statusTrialPending' },
  { value: 'PROCESSING', labelKey: 'statusProcessing' },
  { value: 'COMPLETED', labelKey: 'statusCompleted' },
  { value: 'FAILED', labelKey: 'statusFailed' },
  { value: 'CANCELLED', labelKey: 'statusCancelled' },
  { value: 'ANNULLED', labelKey: 'statusAnnulled' },
];

// Business view uses Prisma TransactionStatus enum (no TRIAL_PENDING / ANNULLED + adds REFUNDED).
// Hand-maintained mirror of `enum TransactionStatus` in backend-api/prisma/schema.prisma —
// if you add a value to that enum, add it here too (and to BUSINESS_STATUS_OPTIONS below).
type BusinessTransactionStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

// Either-view status filter. The single `status` state slot is shared by both Selects, so
// it must hold any value either dropdown can produce — narrowing to wallet-only would lie
// about REFUNDED in business view (and vice-versa for TRIAL_PENDING / ANNULLED in wallet).
type TransactionStatusFilter = WalletTransactionStatus | BusinessTransactionStatus;
const BUSINESS_STATUS_OPTIONS: Array<{ value: BusinessTransactionStatus | ''; labelKey: TLabelKey }> = [
  { value: '', labelKey: 'allStatuses' },
  { value: 'PENDING', labelKey: 'statusPending' },
  { value: 'PROCESSING', labelKey: 'statusProcessing' },
  { value: 'COMPLETED', labelKey: 'statusCompleted' },
  { value: 'FAILED', labelKey: 'statusFailed' },
  { value: 'CANCELLED', labelKey: 'statusCancelled' },
  { value: 'REFUNDED', labelKey: 'statusRefunded' },
];

// Lifecycle label lookup (Spec §4.4 — Pending/Cleared/Locked/Paid/Expired)
const lifecycleLabel = (s: CashbackEntryStatus | null | undefined, lang: Lang): string => {
  if (!s) return '—';
  const map: Record<CashbackEntryStatus, TLabelKey> = {
    Pending: 'lifecyclePending',
    Cleared: 'lifecycleCleared',
    Locked: 'lifecycleLocked',
    Paid: 'lifecyclePaid',
    Expired: 'lifecycleExpired',
  };
  return t(map[s], lang);
};

const txTypeLabel = (type: WalletTransactionType | string, lang: Lang): string => {
  const opt = TYPE_OPTIONS.find((o) => o.value === type);
  return opt ? t(opt.labelKey, lang) : String(type).replace(/_/g, ' ');
};

const txStatusLabel = (
  status: WalletTransactionStatus | BusinessTransactionStatus | string,
  lang: Lang,
): string => {
  const opt =
    STATUS_OPTIONS.find((o) => o.value === status) ??
    BUSINESS_STATUS_OPTIONS.find((o) => o.value === status);
  return opt ? t(opt.labelKey, lang) : String(status).replace(/_/g, ' ');
};

// Single source of truth for what counts as a "valid" status when validating
// alert-deep-link query params. Derived from the dropdown options so that any
// new status added to the dropdown is automatically accepted from the URL.
const VALID_WALLET_STATUSES = STATUS_OPTIONS
  .map((o) => o.value)
  .filter((v): v is WalletTransactionStatus => v !== '');
const VALID_BUSINESS_STATUSES = BUSINESS_STATUS_OPTIONS
  .map((o) => o.value)
  .filter((v): v is BusinessTransactionStatus => v !== '');

const NEGATIVE_TYPES: WalletTransactionType[] = ['WITHDRAWAL', 'PURCHASE'];
const PAGE_SIZE = 20;

/* ─── Component ───────────────────────────────────────────────────────────── */
export default function AdminTransactionsPage() {
  const { language } = useLanguage();
  const lang: Lang = language === 'bg' ? 'bg' : 'en';
  const queryClient = useQueryClient();
  const locale = lang === 'bg' ? 'bg-BG' : 'en-GB';

  // Allow deep-links from the alerts page to preselect view + status.
  const [searchParams] = useSearchParams();
  const initialView: 'business' | 'wallet' =
    searchParams.get('view') === 'wallet' ? 'wallet' : 'business';
  // Validate status against whichever enum the active view uses — business has
  // REFUNDED but no TRIAL_PENDING/ANNULLED; wallet is the inverse. The valid
  // lists are module-level and derived from the *_OPTIONS dropdowns so a new
  // status added there is automatically accepted from URL deep-links.
  const initialStatusParam = searchParams.get('status') ?? '';
  const validStatusList: readonly string[] =
    initialView === 'wallet' ? VALID_WALLET_STATUSES : VALID_BUSINESS_STATUSES;
  const initialStatus: TransactionStatusFilter | '' =
    initialStatusParam && validStatusList.includes(initialStatusParam)
      ? (initialStatusParam as TransactionStatusFilter)
      : '';

  // dateFrom: ISO timestamp from alerts (e.g. failed_transactions 24h window) OR
  // a YYYY-MM-DD picker value. We store whichever form arrived, send it to the
  // backend as-is (Date constructor accepts both), and slice to YYYY-MM-DD only
  // for the <input type="date"> display value. This keeps the alert badge ↔
  // page row count in lock-step until the user manually changes the picker —
  // at which point the state collapses to YYYY-MM-DD with day-boundary semantics.
  const initialDateFrom = searchParams.get('dateFrom') ?? '';
  // minAmount: from large_pending_payouts alert link. Validated as a positive number;
  // garbage input is dropped so the page falls back to "no filter" instead of NaN.
  const initialMinAmountRaw = searchParams.get('minAmount');
  const initialMinAmountNum = initialMinAmountRaw ? parseFloat(initialMinAmountRaw) : NaN;
  const initialMinAmount =
    Number.isFinite(initialMinAmountNum) && initialMinAmountNum > 0
      ? String(initialMinAmountNum)
      : '';

  /* ── View toggle (spec §4.3 default = Business / receipt-based) ── */
  const [view, setView] = useState<'business' | 'wallet'>(initialView);

  /* ── Filters ── */
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  // Debounced commit avoids the "press Enter to apply" trap; 300 ms keeps the
  // network polite while still feeling instant when typing pauses.
  const search = useDebouncedValue(searchInput, 300);
  const [type, setType] = useState<WalletTransactionType | ''>('');
  const [status, setStatus] = useState<TransactionStatusFilter | ''>(initialStatus);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState('');
  // <input type="date"> only renders YYYY-MM-DD; slice the ISO for display.
  const dateFromPickerValue = dateFrom.slice(0, 10);
  const [minAmount, setMinAmount] = useState(initialMinAmount);
  const [maxAmount, setMaxAmount] = useState('');
  const [riskTier, setRiskTier] = useState<'' | '31' | '61'>('');

  /* ── Drill-through modal (Spec §4.3 — receipt + cashback + risk) ── */
  const [detailTx, setDetailTx] = useState<BusinessTransaction | null>(null);

  /* ── Adjustment modal state ── */
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjSearch, setAdjSearch] = useState('');
  const [adjUser, setAdjUser] = useState<AdminSubscriber | null>(null);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');

  // Reset to page 1 whenever an *applied* filter changes. dateFrom/dateTo are
  // committed on blur/change (the input itself is type="date" so it emits one
  // event per accepted day) — but if a user types digits one-by-one through
  // the keyboard, react-rendering quirks could fire mid-typing values; we
  // debounce them in lockstep with `search` so partial dates can't churn the page.
  const dateFromCommitted = useDebouncedValue(dateFrom, 250);
  const dateToCommitted = useDebouncedValue(dateTo, 250);
  useEffect(() => {
    setPage(1);
  }, [search, type, status, dateFromCommitted, dateToCommitted, minAmount, maxAmount, riskTier, view]);

  const minAmountNum = minAmount ? parseFloat(minAmount) : NaN;
  const minAmountClean = Number.isFinite(minAmountNum) && minAmountNum > 0 ? minAmountNum : undefined;
  const maxAmountNum = maxAmount ? parseFloat(maxAmount) : NaN;
  const maxAmountClean = Number.isFinite(maxAmountNum) && maxAmountNum > 0 ? maxAmountNum : undefined;
  const minRiskClean = riskTier ? parseInt(riskTier) : undefined;
  // The wallet endpoints accept only WalletTransactionStatus. The view-toggle handlers reset
  // `status` to '' on switch, so at runtime this is a wallet value when view==='wallet'; the
  // narrow keeps the API surface honest if that invariant is ever broken.
  const walletStatus: WalletTransactionStatus | '' = VALID_WALLET_STATUSES.includes(
    status as WalletTransactionStatus,
  )
    ? (status as WalletTransactionStatus)
    : '';
  const filterParams = {
    search: search || undefined,
    type: type || undefined,
    status: walletStatus || undefined,
    dateFrom: dateFromCommitted || undefined,
    dateTo: dateToCommitted || undefined,
    minAmount: minAmountClean,
  };

  /* ── Data ── */
  // Key on the narrowed walletStatus (not raw `status`) so an unexpected
  // business-only value can't fragment the cache while sending status=undefined.
  const { data, isLoading } = useQuery({
    queryKey: ['admin-transactions', page, search, type, walletStatus, dateFromCommitted, dateToCommitted, minAmountClean],
    queryFn: () =>
      adminTransactionsService.list({ page, limit: PAGE_SIZE, ...filterParams }),
    enabled: view === 'wallet',
  });

  // Business / receipt-based transactions (Spec §4.3 — Партньор / Локация / Кешбек / Марджин / Risk score)
  // minRiskClean is part of the cache key — selecting a risk tier must yield a
  // distinct query, since totals/pagination are scoped by it (P0-1 fix).
  const { data: businessData, isLoading: isBusinessLoading } = useQuery({
    queryKey: ['admin-transactions-business', page, search, status, dateFromCommitted, dateToCommitted, minAmountClean, maxAmountClean, minRiskClean],
    queryFn: () =>
      adminTransactionsService.listBusiness({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        status: status || undefined,
        dateFrom: dateFromCommitted || undefined,
        dateTo: dateToCommitted || undefined,
        minAmount: minAmountClean,
        maxAmount: maxAmountClean,
        minRisk: minRiskClean,
      }),
    enabled: view === 'business',
  });

  const { data: stats } = useQuery({
    queryKey: ['admin-transactions-stats', search, type, walletStatus, dateFromCommitted, dateToCommitted, minAmountClean],
    queryFn: () => adminTransactionsService.getStats(filterParams),
    enabled: view === 'wallet',
  });

  // Spec §3.1: count today / total volume / average value for the business view.
  // Includes minRiskClean so the stats bar tracks the risk-tier filter (P0-2 fix).
  const { data: businessStats } = useQuery({
    queryKey: ['admin-transactions-business-stats', search, status, dateFromCommitted, dateToCommitted, minAmountClean, maxAmountClean, minRiskClean],
    queryFn: () =>
      adminTransactionsService.getBusinessStats({
        search: search || undefined,
        status: status || undefined,
        dateFrom: dateFromCommitted || undefined,
        dateTo: dateToCommitted || undefined,
        minAmount: minAmountClean,
        maxAmount: maxAmountClean,
        minRisk: minRiskClean,
      }),
    enabled: view === 'business',
  });

  // Partner risk aggregate — fetched lazily when the drill-through modal opens
  // for a row whose partner is set. Spec §7.2 — partner risk distinct from user risk.
  // Filters mirror the active business view so the modal's reading matches the
  // visible slice (P1-1). Cache key includes every filter to prevent stale data
  // from a previous partner/filter window leaking into the modal (P1-6).
  const partnerRiskFilters = {
    search: search || undefined,
    status: status || undefined,
    dateFrom: dateFromCommitted || undefined,
    dateTo: dateToCommitted || undefined,
    minAmount: minAmountClean,
    maxAmount: maxAmountClean,
  };
  const { data: partnerRiskData } = useQuery<PartnerRiskAggregate>({
    queryKey: ['admin-transactions-partner-risk', detailTx?.partner?.id, partnerRiskFilters],
    queryFn: () => adminTransactionsService.getPartnerRisk(detailTx!.partner!.id, partnerRiskFilters),
    enabled: !!detailTx?.partner?.id,
  });
  // Only serve the aggregate for the partner currently open in the modal.
  // `partnerRiskData &&` short-circuits when no data exists — without it,
  // `undefined === undefined` would satisfy the id check when both sides are null
  // (modal closed) and produce a misleadingly truthy result.
  // The partnerId equality check guards against React Query briefly serving a
  // previous partner's cached data while the new key's fetch is in-flight.
  const partnerRisk =
    partnerRiskData && partnerRiskData.partnerId === detailTx?.partner?.id
      ? partnerRiskData
      : undefined;

  const { data: adjSearchData } = useQuery({
    queryKey: ['adj-user-search', adjSearch],
    queryFn: () => adminSubscribersService.list({ search: adjSearch, limit: 5, page: 1 }),
    enabled: adjSearch.length >= 2,
  });

  const closeAdjustModal = () => {
    setShowAdjust(false);
    setAdjUser(null);
    setAdjSearch('');
    setAdjAmount('');
    setAdjReason('');
  };

  useEffect(() => {
    if (!showAdjust) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAdjustModal(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showAdjust]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Mutations ── */
  const adjustMutation = useMutation({
    mutationFn: adminTransactionsService.adjust,
    onSuccess: () => {
      toast.success(t('toastAdjustmentCreated', lang));
      queryClient.invalidateQueries({ queryKey: ['admin-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-transactions-stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin-transactions-business'] });
      queryClient.invalidateQueries({ queryKey: ['admin-transactions-business-stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin-transactions-partner-risk'] });
      closeAdjustModal();
    },
    onError: () => toast.error(t('toastAdjustmentFailed', lang)),
  });

  /* ── Handlers ── */
  const handleAdjustSubmit = () => {
    if (!adjUser) return;
    const amount = parseFloat(adjAmount);
    if (!amount || amount === 0) { toast.error(t('toastNonZero', lang)); return; }
    if (!adjReason.trim()) { toast.error(t('toastReasonRequired', lang)); return; }
    adjustMutation.mutate({ userId: adjUser.id, amount, reason: adjReason });
  };

  /* ── Full-period CSV export (Spec §6.4) ── */
  // Walks all matching rows via the service's paginated fetcher, so the file
  // reflects the active filter set rather than the visible page.
  const [isExporting, setIsExporting] = useState(false);
  // Helper: emit the truncation warning when the export hit the 10k cap so the
  // admin knows the file is partial (P1-3).
  const warnIfTruncated = (truncated: boolean, total: number) => {
    if (!truncated) return;
    toast(
      t('toastExportTruncated', lang)
        .replace('{cap}', EXPORT_ROW_CAP.toLocaleString(locale))
        .replace('{total}', total.toLocaleString(locale)),
      { duration: 6000 },
    );
  };
  const handleBusinessExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const tid = toast.loading(t('exportPreparing', lang));
    try {
      // Use *Committed dates so the CSV reflects what's actually in the table —
      // not whatever half-typed value sits in the date input (P1-2).
      const { rows, truncated, total } = await adminTransactionsService.fetchAllBusiness({
        search: search || undefined,
        status: status || undefined,
        dateFrom: dateFromCommitted || undefined,
        dateTo: dateToCommitted || undefined,
        minAmount: minAmountClean,
        maxAmount: maxAmountClean,
        minRisk: minRiskClean,
      });
      downloadBusinessCSV(rows, locale);
      toast.dismiss(tid);
      warnIfTruncated(truncated, total);
    } catch {
      toast.dismiss(tid);
      toast.error(t('toastExportFailed', lang));
    } finally {
      setIsExporting(false);
    }
  };
  const handleWalletExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const tid = toast.loading(t('exportPreparing', lang));
    try {
      const { rows, truncated, total } = await adminTransactionsService.fetchAllWallet({
        search: search || undefined,
        type: type || undefined,
        status: walletStatus || undefined,
        dateFrom: dateFromCommitted || undefined,
        dateTo: dateToCommitted || undefined,
        minAmount: minAmountClean,
      });
      downloadWalletCSV(rows, locale);
      toast.dismiss(tid);
      warnIfTruncated(truncated, total);
    } catch {
      toast.dismiss(tid);
      toast.error(t('toastExportFailed', lang));
    } finally {
      setIsExporting(false);
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  // Format amount in EUR-only mode
  const fmtAmount = (amount: number) => formatMoneyByMode(amount, 'eur_only', language);

  // Switch view, scrubbing every filter that is enum-specific to the previous view.
  // Search / dates / minAmount carry over because they have the same semantics in both;
  // status / type / risk are dropped since the dropdown values differ.
  const switchView = (next: 'business' | 'wallet') => {
    setView(next);
    setStatus('');
    setType('');
    setRiskTier('');
    setMaxAmount('');
    setPage(1);
    setDetailTx(null);
  };

  /* ── Wallet ledger columns ── */
  const columns: ColumnDef<AdminTransaction>[] = [
    {
      key: 'user',
      header: t('colSubscriber', lang),
      render: (row) => (
        <UserCell>
          {`${row.wallet.user.firstName ?? ''} ${row.wallet.user.lastName ?? ''}`.trim()
            || row.wallet.user.email}
          <MetaLine>{row.wallet.user.email}</MetaLine>
          {row.wallet.user.phone && <MetaLine>{row.wallet.user.phone}</MetaLine>}
        </UserCell>
      ),
    },
    {
      key: 'type',
      header: t('colType', lang),
      render: (row) => <TypeBadge $type={row.type}>{txTypeLabel(row.type, lang)}</TypeBadge>,
    },
    {
      key: 'amount',
      header: t('colAmount', lang),
      render: (row) => {
        const isNeg = NEGATIVE_TYPES.includes(row.type) || (row.type === 'ADJUSTMENT' && row.amount < 0);
        return (
          <AmountCell $negative={isNeg}>
            {isNeg ? '−' : '+'}{fmtAmount(Math.abs(row.amount))}
            <MetaLine>{fmtAmount(row.balanceBefore)} → {fmtAmount(row.balanceAfter)}</MetaLine>
          </AmountCell>
        );
      },
    },
    {
      key: 'status',
      header: t('colStatus', lang),
      render: (row) => <StatusBadge $status={row.status}>{txStatusLabel(row.status, lang)}</StatusBadge>,
    },
    {
      key: 'description',
      header: t('colNote', lang),
      render: (row) =>
        row.description ? (
          <span style={{ fontSize: '0.8125rem', color: palette.textSubtle }}>{row.description}</span>
        ) : (
          <span style={{ color: palette.textSubtle }}>—</span>
        ),
    },
    {
      key: 'createdAt',
      header: t('colDate', lang),
      sortable: true,
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>
          {fmt(row.createdAt)}
          <MetaLine>{fmtTime(row.createdAt)}</MetaLine>
        </span>
      ),
    },
  ];

  /* ── Business / receipt-based columns (Spec §4.3) ── */
  const businessColumns: ColumnDef<BusinessTransaction>[] = [
    {
      key: 'id',
      header: t('colTxId', lang),
      render: (row) => (
        <span
          style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: palette.textMuted }}
          title={row.id}
        >
          {row.id.slice(0, 8)}…
        </span>
      ),
    },
    {
      key: 'subscriber',
      header: t('colSubscriber', lang),
      render: (row) => (
        <UserCell>
          {row.user.firstName || row.user.lastName
            ? `${row.user.firstName ?? ''} ${row.user.lastName ?? ''}`.trim()
            : '—'}
          <MetaLine>{row.user.email}</MetaLine>
          {row.user.phone && <MetaLine>{formatPhoneBG(row.user.phone)}</MetaLine>}
        </UserCell>
      ),
    },
    {
      key: 'partner',
      header: t('colPartner', lang),
      render: (row) => (
        <UserCell>
          {row.partner?.businessName ?? '—'}
          <MetaLine
            style={
              row.venue
                ? undefined
                : { color: palette.textSubtle, fontStyle: 'italic' }
            }
          >
            {row.venue?.name ?? t('noLocation', lang)}
          </MetaLine>
        </UserCell>
      ),
    },
    {
      key: 'amount',
      header: t('colAmount', lang),
      render: (row) => (
        <AmountCell $negative={false}>
          {fmtAmount(row.amount)}
        </AmountCell>
      ),
    },
    {
      key: 'cashback',
      header: t('colCashback', lang),
      render: (row) => (
        <>
          <div style={{ color: palette.teal, fontWeight: 600 }}>
            {row.cashbackAmount != null ? fmtAmount(row.cashbackAmount) : '—'}
          </div>
          {row.cashbackStatus && (
            <MetaLine>
              <StatusBadge $status={row.cashbackStatus}>
                {lifecycleLabel(row.cashbackStatus, lang)}
              </StatusBadge>
            </MetaLine>
          )}
        </>
      ),
    },
    {
      key: 'margin',
      // Spec §4.3 — BoomCard's commission per accepted receipt. null = partner
      // has neither a discountRate nor a partnerType maxDiscountRate configured;
      // displaying 0 there would be a lie, so render "—" instead.
      header: t('colMargin', lang),
      render: (row) => {
        if (row.margin == null) {
          return <span style={{ color: palette.textSubtle }}>—</span>;
        }
        const color =
          row.margin > 0 ? palette.success : row.margin < 0 ? palette.danger : palette.textSubtle;
        return (
          <span style={{ color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {row.margin >= 0 ? '+' : ''}
            {fmtAmount(row.margin)}
            {row.partnerDiscountRate != null && (
              <MetaLine>{row.partnerDiscountRate.toFixed(0)}%</MetaLine>
            )}
          </span>
        );
      },
    },
    {
      key: 'risk',
      header: t('colRisk', lang),
      render: (row) => (
        <RiskBadge
          $level={riskBucket(row.riskScore)}
          title={`${riskLabel(row.riskScore, lang)} · score ${row.riskScore}`}
        >
          {riskLabel(row.riskScore, lang)}
        </RiskBadge>
      ),
    },
    {
      key: 'receipt',
      header: t('colReceipt', lang),
      render: (row) =>
        row.receipt?.imageUrl ? (
          <a
            href={row.receipt.imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontSize: '0.8125rem',
              color: palette.accent,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {t('viewReceipt', lang)}
          </a>
        ) : (
          <span style={{ fontSize: '0.8125rem', color: palette.textSubtle, fontStyle: 'italic' }}>
            {t('noReceipt', lang)}
          </span>
        ),
    },
    {
      key: 'status',
      header: t('colStatus', lang),
      render: (row) => (
        <StatusBadge $status={row.status}>
          {txStatusLabel(row.status, lang)}
        </StatusBadge>
      ),
    },
    {
      key: 'createdAt',
      // Spec §4.3 expects both QR session and receipt-upload timestamps.
      header: t('colDate', lang),
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>
          {fmt(row.createdAt)}
          <MetaLine>{fmtTime(row.createdAt)}</MetaLine>
          {row.sessionStartedAt && (
            <MetaLine title={t('qrSession', lang)}>
              QR: {fmtTime(row.sessionStartedAt)}
            </MetaLine>
          )}
          {row.receiptUploadedAt && row.receiptUploadedAt !== row.createdAt && (
            <MetaLine title={t('receiptUpload', lang)}>
              {fmtTime(row.receiptUploadedAt)}
            </MetaLine>
          )}
        </span>
      ),
    },
  ];

  const adjUserName = adjUser
    ? `${adjUser.firstName ?? ''} ${adjUser.lastName ?? ''}`.trim() || adjUser.email
    : '';

  return (
    <PageShell>
      {/* Drill-through detail modal — Spec §4.3 receipt + cashback + risk breakdown */}
      {detailTx && (
        <Overlay onClick={() => setDetailTx(null)}>
          <Modal onClick={(e) => e.stopPropagation()} style={{ maxWidth: '40rem' }}>
            <ModalTitle>{t('detailTitle', lang)}</ModalTitle>
            <DetailGrid>
              <DetailRow label={t('colTxId', lang)}>
                <code style={{ fontSize: '0.8125rem' }}>{detailTx.id}</code>
              </DetailRow>
              <DetailRow label={t('colSubscriber', lang)}>
                <a
                  href={`/admin/subscribers/${detailTx.user.id}`}
                  style={{ color: palette.accent, fontWeight: 600, textDecoration: 'none' }}
                >
                  {`${detailTx.user.firstName ?? ''} ${detailTx.user.lastName ?? ''}`.trim() || detailTx.user.email}
                </a>
                <MetaLine>{detailTx.user.email}</MetaLine>
                {detailTx.user.phone && <MetaLine>{formatPhoneBG(detailTx.user.phone)}</MetaLine>}
              </DetailRow>
              <DetailRow label={t('colPartner', lang)}>
                {detailTx.partner ? (
                  <a
                    href={`/admin/partners/${detailTx.partner.id}`}
                    style={{ color: palette.accent, fontWeight: 600, textDecoration: 'none' }}
                  >
                    {detailTx.partner.businessName}
                  </a>
                ) : '—'}
                <MetaLine>
                  {detailTx.venue?.name ?? (
                    <em style={{ color: palette.textSubtle }}>{t('noLocation', lang)}</em>
                  )}
                </MetaLine>
              </DetailRow>
              <DetailRow label={t('colAmount', lang)}>
                <strong>{fmtAmount(detailTx.amount)}</strong>
                <MetaLine>{t('paymentMethod', lang)}: {detailTx.paymentMethod}</MetaLine>
              </DetailRow>
              <DetailRow label={t('colCashback', lang)}>
                <span style={{ color: palette.teal, fontWeight: 600 }}>
                  {detailTx.cashbackAmount != null
                    ? fmtAmount(detailTx.cashbackAmount)
                    : '—'}
                </span>
                {detailTx.cashbackStatus && (
                  <MetaLine>
                    <StatusBadge $status={detailTx.cashbackStatus}>
                      {lifecycleLabel(detailTx.cashbackStatus, lang)}
                    </StatusBadge>
                  </MetaLine>
                )}
              </DetailRow>
              <DetailRow label={t('colMargin', lang)}>
                {detailTx.margin == null ? (
                  <span style={{ color: palette.textSubtle }}>—</span>
                ) : (
                  <>
                    <span
                      style={{
                        color:
                          detailTx.margin > 0
                            ? palette.success
                            : detailTx.margin < 0
                              ? palette.danger
                              : palette.textSubtle,
                        fontWeight: 600,
                      }}
                    >
                      {detailTx.margin >= 0 ? '+' : ''}
                      {fmtAmount(detailTx.margin)}
                    </span>
                    {detailTx.partnerDiscountRate != null && (
                      <MetaLine>
                        ({detailTx.partnerDiscountRate.toFixed(0)}% × {fmtAmount(detailTx.amount)} −{' '}
                        {fmtAmount(detailTx.cashbackAmount ?? 0)})
                      </MetaLine>
                    )}
                  </>
                )}
              </DetailRow>
              <DetailRow label={t('riskScore', lang)}>
                <RiskBadge $level={riskBucket(detailTx.riskScore)}>{detailTx.riskScore}</RiskBadge>
                <MetaLine>
                  {t('userRiskScore', lang)}: {detailTx.userRiskScore ?? 0}
                </MetaLine>
                {partnerRisk && (
                  <MetaLine>
                    {t('partnerRiskScore', lang)}: {partnerRisk.maxFraudScore}{' '}
                    <span style={{ color: palette.textSubtle }}>
                      ({t('partnerRiskAvg', lang)} {partnerRisk.avgFraudScore},{' '}
                      {partnerRisk.signalCount} {t('partnerRiskCount', lang)})
                    </span>
                  </MetaLine>
                )}
              </DetailRow>
              <DetailRow label={t('colStatus', lang)}>
                <StatusBadge $status={detailTx.status}>
                  {txStatusLabel(detailTx.status, lang)}
                </StatusBadge>
              </DetailRow>
              {detailTx.riskScore > 20 && (
                <DetailRow label={t('riskReviewLabel', lang)}>
                  <a
                    href={`/admin/control/risk?bucket=${detailTx.riskScore >= 51 ? 'HIGH_51_PLUS' : detailTx.riskScore >= 21 ? 'MEDIUM_21_50' : 'LOW_0_20'}&status=active`}
                    style={{ color: palette.accent, fontWeight: 600, fontSize: '0.875rem' }}
                  >
                    {t('riskReviewLink', lang)}
                  </a>
                </DetailRow>
              )}
              <DetailRow label={t('colDate', lang)}>
                <div>
                  <span style={{ color: palette.textSubtle, fontSize: '0.75rem' }}>
                    {t('qrSession', lang)}:{' '}
                  </span>
                  {detailTx.sessionStartedAt
                    ? `${fmt(detailTx.sessionStartedAt)} ${fmtTime(detailTx.sessionStartedAt)}`
                    : '—'}
                </div>
                <div>
                  <span style={{ color: palette.textSubtle, fontSize: '0.75rem' }}>
                    {t('receiptUpload', lang)}:{' '}
                  </span>
                  {detailTx.receiptUploadedAt
                    ? `${fmt(detailTx.receiptUploadedAt)} ${fmtTime(detailTx.receiptUploadedAt)}`
                    : <span style={{ fontStyle: 'italic', color: palette.textSubtle }}>{t('noReceipt', lang)}</span>}
                </div>
                <div>
                  <span style={{ color: palette.textSubtle, fontSize: '0.75rem' }}>
                    {t('recordCreated', lang)}:{' '}
                  </span>
                  {fmt(detailTx.createdAt)} {fmtTime(detailTx.createdAt)}
                </div>
              </DetailRow>
              <DetailRow label={t('colReceipt', lang)}>
                {detailTx.receipt?.imageUrl ? (
                  <a
                    href={detailTx.receipt.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: palette.accent, fontWeight: 600 }}
                  >
                    {t('viewReceipt', lang)}
                  </a>
                ) : (
                  <span style={{ fontSize: '0.8125rem', color: palette.textSubtle, fontStyle: 'italic' }}>
                    {t('noReceipt', lang)}
                  </span>
                )}
              </DetailRow>
            </DetailGrid>
            <ModalActions>
              <Btn onClick={() => setDetailTx(null)}>{t('close', lang)}</Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* Adjustment modal */}
      {showAdjust && (
        <Overlay onClick={closeAdjustModal}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{t('adjustTitle', lang)}</ModalTitle>

            <ModalField>
              <ModalLabel>{t('adjustUser', lang)}</ModalLabel>
              {adjUser ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.875rem', color: palette.text, fontWeight: 600 }}>
                    {adjUserName}
                  </span>
                  <button
                    onClick={() => { setAdjUser(null); setAdjSearch(''); }}
                    style={{ fontSize: '0.75rem', color: palette.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                  >
                    {t('adjustChange', lang)}
                  </button>
                </div>
              ) : (
                <>
                  <ModalInput
                    type="text"
                    placeholder={t('adjustSearchPh', lang)}
                    value={adjSearch}
                    onChange={(e) => setAdjSearch(e.target.value)}
                    autoFocus
                  />
                  {adjSearch.length >= 2 && adjSearchData && adjSearchData.subscribers.length > 0 && (
                    <UserResultList>
                      {adjSearchData.subscribers.map((sub) => (
                        <UserResultItem
                          key={sub.id}
                          onClick={() => { setAdjUser(sub); setAdjSearch(''); }}
                        >
                          <strong>
                            {`${sub.firstName ?? ''} ${sub.lastName ?? ''}`.trim() || sub.email}
                          </strong>
                          <span style={{ color: palette.textSubtle, marginLeft: '0.375rem', fontSize: '0.8125rem' }}>
                            {sub.email}
                          </span>
                        </UserResultItem>
                      ))}
                    </UserResultList>
                  )}
                  {adjSearch.length >= 2 && adjSearchData?.subscribers.length === 0 && (
                    <HintText>{t('adjustNoMatch', lang)}</HintText>
                  )}
                  {adjSearch.length < 2 && (
                    <HintText>{t('adjustHint', lang)}</HintText>
                  )}
                </>
              )}
            </ModalField>

            <ModalField>
              <ModalLabel>{t('adjustAmount', lang)}</ModalLabel>
              <ModalInput
                type="number"
                step="0.01"
                placeholder="e.g. 5.00 or -2.50"
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
              />
            </ModalField>

            <ModalField>
              <ModalLabel>{t('adjustReason', lang)}</ModalLabel>
              <ModalTextarea
                placeholder={t('adjustReasonPh', lang)}
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
              />
            </ModalField>

            <ModalActions>
              <Btn onClick={closeAdjustModal}>{t('cancel', lang)}</Btn>
              <Btn
                $variant="primary"
                onClick={handleAdjustSubmit}
                disabled={adjustMutation.isPending || !adjUser || !adjAmount || !adjReason}
              >
                {adjustMutation.isPending ? t('saving', lang) : t('save', lang)}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      <PageHeader>
        <TitleBlock>
          <Eyebrow>{t('eyebrow', lang)}</Eyebrow>
          <PageTitle>
            {view === 'business' ? t('titleBusiness', lang) : t('titleWallet', lang)}
            {view === 'wallet' && data && data.total > 0 && <TotalBadge>{data.total.toLocaleString()}</TotalBadge>}
            {view === 'business' && businessData && businessData.total > 0 && <TotalBadge>{businessData.total.toLocaleString()}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>
            {view === 'business' ? t('subtitleBusiness', lang) : t('subtitleWallet', lang)}
          </PageSubtitle>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <ViewTab $active={view === 'business'} onClick={() => switchView('business')}>
              {t('tabBusiness', lang)}
            </ViewTab>
            <ViewTab $active={view === 'wallet'} onClick={() => switchView('wallet')}>
              {t('tabWallet', lang)}
            </ViewTab>
          </div>
        </TitleBlock>
        <HeaderActions>
          {view === 'business' ? (
            <Btn
              onClick={handleBusinessExport}
              disabled={isExporting || !businessData?.transactions.length}
            >
              {isExporting ? t('exportPreparing', lang) : t('exportCsv', lang)}
            </Btn>
          ) : (
            <>
              <Btn
                onClick={handleWalletExport}
                disabled={isExporting || !data?.transactions.length}
              >
                {isExporting ? t('exportPreparing', lang) : t('exportCsv', lang)}
              </Btn>
              <Btn $variant="primary" onClick={() => setShowAdjust(true)}>
                {t('adjustWallet', lang)}
              </Btn>
            </>
          )}
        </HeaderActions>
      </PageHeader>

      {/* Stats bar */}
      {view === 'wallet' && (
        <StatsBar>
          <StatCard>
            <StatLabel>{t('totalVolume', lang)}</StatLabel>
            <StatValue>{stats ? fmtAmount(stats.totalVolume) : '—'}</StatValue>
          </StatCard>
          <StatCard $bg={palette.tealSoft}>
            <StatLabel>{t('cashbackCredited', lang)}</StatLabel>
            <StatValue $color={palette.teal}>
              {stats ? fmtAmount(stats.totalCashback) : '—'}
            </StatValue>
          </StatCard>
          <StatCard $bg={palette.warningSoft}>
            <StatLabel>{t('withdrawals', lang)}</StatLabel>
            <StatValue $color={palette.warning}>
              {stats ? fmtAmount(stats.totalWithdrawals) : '—'}
            </StatValue>
          </StatCard>
        </StatsBar>
      )}
      {view === 'business' && (
        <StatsBar style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          <StatCard>
            <StatLabel>{t('todayCount', lang)}</StatLabel>
            <StatValue>
              {businessStats ? businessStats.todayCount.toLocaleString(locale) : '—'}
            </StatValue>
          </StatCard>
          <StatCard>
            <StatLabel>{t('totalCount', lang)}</StatLabel>
            <StatValue>
              {businessStats ? businessStats.count.toLocaleString(locale) : '—'}
            </StatValue>
          </StatCard>
          <StatCard>
            <StatLabel>{t('totalVolume', lang)}</StatLabel>
            <StatValue>
              {businessStats ? fmtAmount(businessStats.totalVolume) : '—'}
            </StatValue>
          </StatCard>
          <StatCard $bg={palette.tealSoft}>
            <StatLabel>{t('averageValue', lang)}</StatLabel>
            <StatValue $color={palette.teal}>
              {businessStats ? fmtAmount(businessStats.averageValue) : '—'}
            </StatValue>
          </StatCard>
          <StatCard $bg={palette.accentSoft}>
            <StatLabel>{t('cashbackCredited', lang)}</StatLabel>
            <StatValue $color={palette.accent}>
              {businessStats ? fmtAmount(businessStats.totalCashback) : '—'}
            </StatValue>
          </StatCard>
        </StatsBar>
      )}

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder={t('searchPh', lang)}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {view === 'wallet' && (
            <Select
              value={type}
              aria-label={t('colType', lang)}
              onChange={(e) => setType(e.target.value as WalletTransactionType | '')}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey, lang)}
                </option>
              ))}
            </Select>
          )}
          <Select
            value={status}
            aria-label={t('colStatus', lang)}
            onChange={(e) => setStatus(e.target.value as TransactionStatusFilter | '')}
          >
            {(view === 'business' ? BUSINESS_STATUS_OPTIONS : STATUS_OPTIONS).map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey, lang)}
              </option>
            ))}
          </Select>
          {view === 'business' && (
            <Select value={riskTier} onChange={(e) => setRiskTier(e.target.value as '' | '31' | '61')}>
              <option value="">{t('allRisk', lang)}</option>
              <option value="31">{t('riskReview', lang)}</option>
              <option value="61">{t('riskHigh', lang)}</option>
            </Select>
          )}
          <DateInput
            type="date"
            value={dateFromPickerValue}
            title={t('createdFrom', lang)}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <DateInput
            type="date"
            value={dateTo}
            title={t('createdTo', lang)}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <NumericInput
            type="number"
            min="0"
            step="0.01"
            placeholder={t('minAmount', lang)}
            title={t('minAmount', lang)}
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
          />
          {view === 'business' && (
            <NumericInput
              type="number"
              min="0"
              step="0.01"
              placeholder={t('maxAmount', lang)}
              title={t('maxAmount', lang)}
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
            />
          )}
        </FilterRow>

        {view === 'business' ? (
          <DataTable
            columns={businessColumns}
            data={businessData?.transactions ?? []}
            rowKey={(row) => row.id}
            loading={isBusinessLoading}
            emptyMessage={t('emptyBusiness', lang)}
            page={page}
            pageSize={PAGE_SIZE}
            totalItems={businessData?.total}
            onPageChange={setPage}
            onRowClick={(row) => setDetailTx(row)}
          />
        ) : (
          <DataTable
            columns={columns}
            data={data?.transactions ?? []}
            rowKey={(row) => row.id}
            loading={isLoading}
            emptyMessage={t('emptyWallet', lang)}
            page={page}
            pageSize={PAGE_SIZE}
            totalItems={data?.total}
            onPageChange={setPage}
          />
        )}
      </Card>
    </PageShell>
  );
}

const DetailGrid = styled.div`
  display: grid;
  grid-template-columns: 9rem 1fr;
  gap: 0.75rem 1rem;
  margin-bottom: 1rem;
`;

const DetailRowLabel = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  color: ${palette.textSubtle};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding-top: 0.125rem;
`;

const DetailRowValue = styled.div`
  font-size: 0.875rem;
  color: ${palette.text};
`;

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <DetailRowLabel>{label}</DetailRowLabel>
      <DetailRowValue>{children}</DetailRowValue>
    </>
  );
}

const ViewTab = styled.button<{ $active: boolean }>`
  background: ${(p) => p.$active ? palette.accent : 'transparent'};
  color: ${(p) => p.$active ? '#fff' : palette.textMuted};
  border: 1px solid ${(p) => p.$active ? palette.accent : palette.border};
  padding: 0.375rem 0.875rem;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  &:hover { color: ${(p) => p.$active ? '#fff' : palette.text}; }
`;
