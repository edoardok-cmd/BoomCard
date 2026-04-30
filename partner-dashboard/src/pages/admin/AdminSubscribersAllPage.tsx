import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef, RowAction } from '../../components/admin/DataTable/DataTable';
import {
  adminSubscribersService,
  AdminSubscriber,
  AdminSubscriberDetail,
  SubscriptionPlan,
  SubscriptionStatus,
  UserAccountStatus,
  AccountStatusFilter,
  RiskLevelFilter,
} from '../../services/adminSubscribers.service';
import { adminTransactionsService, AdminTransaction } from '../../services/adminTransactions.service';
import {
  planLabel,
  subStatusLabel as sharedSubStatusLabel,
  userStatusLabel as sharedUserStatusLabel,
  riskLabel,
} from '../../utils/planLabels';

/* ─── i18n table (page-local; spec is in BG) ───────────────────────────── */
type Lang = 'en' | 'bg';
const I18N = {
  eyebrow:        { en: 'Subscribers',     bg: 'Абонати' },
  pageTitle:      { en: 'All subscribers', bg: 'Всички абонати' },
  pageSubtitle:   { en: 'All subscriber profiles, including soft-deleted accounts', bg: 'Всички профили на абонати, включително меко изтритите' },
  exportCsv:      { en: '↓ Export CSV',    bg: '↓ Изтегли CSV' },
  exporting:      { en: 'Exporting…',      bg: 'Изтегляне…' },
  noToExport:     { en: 'No subscribers to export', bg: 'Няма абонати за изтегляне' },
  exportFail:     { en: 'Failed to export subscribers', bg: 'Неуспешно изтегляне' },
  // Bulgarian has three plural forms (one / few / other). Rather than
  // pick between "абонат / абоната / абонати", use a count-neutral phrasing
  // ("subscribers exported: N") that reads correctly for any N.
  exportedN:      { en: 'Exported {n} subscriber(s)', bg: 'Изтеглени абонати: {n}' },
  searchPh:       { en: 'Search by name, email, phone or IBAN…', bg: 'Търси по име, имейл, телефон или IBAN…' },
  allAccounts:    { en: 'All accounts',    bg: 'Всички акаунти' },
  allPlans:       { en: 'All plans',       bg: 'Всички планове' },
  allStatuses:    { en: 'All statuses',    bg: 'Всички статуси' },
  allRisk:        { en: 'All risk',        bg: 'Всички рискове' },
  active:         { en: 'Active',          bg: 'Активен' },
  suspended:      { en: 'Suspended',       bg: 'Спрян' },
  deleted:        { en: 'Deleted',         bg: 'Изтрит' },
  trialing:       { en: 'Trialing',        bg: 'Пробен' },
  pastDue:        { en: 'Failed payment',  bg: 'Неуспешно плащане' },
  unpaid:         { en: 'Unpaid',          bg: 'Неплатен' },
  paused:         { en: 'Paused',          bg: 'На пауза' },
  // CANCELLED uses 'Отказан' (not spec's "спрян") to disambiguate from user
  // account status 'Спрян' (§4.1) which appears in the same table.
  cancelled:      { en: 'Cancelled',       bg: 'Отказан' },
  incomplete:     { en: 'Incomplete',      bg: 'Незавършен' },
  incompleteExpired: { en: 'Incomplete expired', bg: 'Незавършен (изтекъл)' },
  expired:        { en: 'Expired',         bg: 'Изтекъл' },
  riskAutoFilter:   { en: 'Auto-approve (0-30)', bg: 'Авто (0-30)' },
  riskReviewFilter: { en: 'Review (31-60)',      bg: 'Преглед (31-60)' },
  riskHighFilter:   { en: 'High risk (61+)',     bg: 'Висок риск (61+)' },
  colSubscriber:  { en: 'Subscriber',      bg: 'Абонат' },
  colUserId:      { en: 'User ID',         bg: 'User ID' },
  colUserStatus:  { en: 'User status',     bg: 'Статус' },
  colRisk:        { en: 'Risk',            bg: 'Риск' },
  colLastActivity:{ en: 'Last activity',   bg: 'Последна активност' },
  colPlan:        { en: 'Plan',            bg: 'План' },
  colSubStatus:   { en: 'Sub status',      bg: 'Статус абонамент' },
  colCashback:    { en: 'Cashback',        bg: 'Кешбек' },
  colPeriodEnds:  { en: 'Period ends',     bg: 'Изтича на' },
  colAutoRenew:   { en: 'Auto-renew',      bg: 'Подновяване' },
  colJoined:      { en: 'Joined',          bg: 'Регистриран' },
  yes:            { en: 'Yes',             bg: 'Да' },
  no:             { en: 'No',              bg: 'Не' },
  never:          { en: 'Never',           bg: 'Никога' },
  noSubsFound:    { en: 'No subscribers found', bg: 'Няма открити абонати' },
  pendingShort:   { en: 'pending',         bg: 'изчакващи' },
  viewHistory:    { en: 'View history',    bg: 'История' },
  changePlan:     { en: 'Change plan',     bg: 'Смени плана' },
  cancelSub:      { en: 'Cancel subscription', bg: 'Отказ на абонамент' },
  refund:         { en: 'Refund',          bg: 'Възстановяване' },
  suspendAcct:    { en: 'Suspend account', bg: 'Спри акаунт' },
  activateAcct:   { en: 'Activate account', bg: 'Активирай акаунт' },
  forceLogout:    { en: 'Force logout',    bg: 'Принудителен изход' },
  deleteAcct:     { en: 'Delete account',  bg: 'Изтрий акаунт' },
  restoreAcct:    { en: 'Restore account', bg: 'Възстанови акаунт' },
  cancelTitle:    { en: 'Cancel subscription?', bg: 'Отказ на абонамент?' },
  cancelBody:     { en: 'The subscription for {name} will be cancelled at the end of the current billing period. No refund will be issued.', bg: 'Абонаментът на {name} ще бъде отказан в края на текущия период. Сума няма да бъде възстановена.' },
  keepActive:     { en: 'Keep active',     bg: 'Запази' },
  yesCancel:      { en: 'Yes, cancel',     bg: 'Да, откажи' },
  cancelling:     { en: 'Cancelling…',     bg: 'Отказване…' },
  cancelledToast: { en: 'Subscription cancelled', bg: 'Абонаментът е отказан' },
  cancelFail:     { en: 'Failed to cancel subscription', bg: 'Неуспешен отказ' },
  changePlanTitle:{ en: 'Change plan',     bg: 'Смяна на план' },
  changePlanBody: { en: 'Select a new plan for {name}.', bg: 'Избери нов план за {name}.' },
  currentPlan:    { en: 'Current plan:',   bg: 'Текущ план:' },
  newPlanLabel:   { en: 'New plan',        bg: 'Нов план' },
  saveChange:     { en: 'Save change',     bg: 'Запази' },
  saving:         { en: 'Saving…',         bg: 'Запазване…' },
  cancelBtn:      { en: 'Cancel',          bg: 'Отказ' },
  planUpdated:    { en: 'Plan updated',    bg: 'Планът е обновен' },
  planFail:       { en: 'Failed to update plan', bg: 'Неуспешно обновяване' },
  deleteTitle:    { en: 'Delete account?', bg: 'Изтриване на акаунт?' },
  deleteBody:     { en: '{name} will be soft-deleted. History, payments and transactions are preserved and the account can be restored later.', bg: '{name} ще бъде меко изтрит. Историята, плащанията и транзакциите се запазват и акаунтът може да бъде възстановен.' },
  reasonOpt:      { en: 'Reason (optional)', bg: 'Причина (опционално)' },
  reasonPh:       { en: 'e.g. user request, fraud', bg: 'напр. заявка от потребителя, измама' },
  yesDelete:      { en: 'Yes, delete',     bg: 'Да, изтрий' },
  deleting:       { en: 'Deleting…',       bg: 'Изтриване…' },
  acctDeleted:    { en: 'Account deleted', bg: 'Акаунтът е изтрит' },
  deleteFail:     { en: 'Failed to delete account', bg: 'Неуспешно изтриване' },
  restoreTitle:   { en: 'Restore account?', bg: 'Възстановяване на акаунт?' },
  restoreBody:    { en: "{name}'s account will be restored and set back to ACTIVE.", bg: 'Акаунтът на {name} ще бъде възстановен и активиран.' },
  yesRestore:     { en: 'Yes, restore',    bg: 'Да, възстанови' },
  restoring:      { en: 'Restoring…',      bg: 'Възстановяване…' },
  acctRestored:   { en: 'Account restored', bg: 'Акаунтът е възстановен' },
  restoreFail:    { en: 'Failed to restore account', bg: 'Неуспешно възстановяване' },
  forceLogoutTitle:{ en: 'Force logout?', bg: 'Принудителен изход?' },
  forceLogoutBody: { en: 'All active sessions for {name} will be revoked. They will need to sign in again on every device.', bg: 'Всички активни сесии на {name} ще бъдат прекратени. Ще трябва да влезе отново от всяко устройство.' },
  yesRevoke:      { en: 'Yes, revoke',     bg: 'Да, прекрати' },
  revoking:       { en: 'Revoking…',       bg: 'Прекратяване…' },
  // Same plural-form issue as exportedN — count-neutral form ("sessions revoked: N").
  revokedN:       { en: 'Revoked {n} session(s)', bg: 'Прекратени сесии: {n}' },
  revokeFail:     { en: 'Failed to revoke sessions', bg: 'Неуспешно прекратяване' },
  refundTitle:    { en: 'Issue refund',    bg: 'Възстанови сума' },
  refundBody:     { en: 'Refund the latest Stripe payment for {name}. Leave amount empty to refund the full charge.', bg: 'Възстанови последното Stripe плащане на {name}. Остави сумата празна, за да възстановиш цялата.' },
  amountLabel:    { en: 'Amount',          bg: 'Сума' },
  amountLabelCcy: { en: 'Amount ({currency})', bg: 'Сума ({currency})' },
  fullAmountPh:   { en: 'Full amount',     bg: 'Цяла сума' },
  refundMaxHint:  { en: 'Max refundable: {amount} {currency}', bg: 'Максимум за възстановяване: {amount} {currency}' },
  refundNoStripeSub:    { en: 'No Stripe subscription on file — nothing to refund.', bg: 'Няма Stripe абонамент — няма какво да се възстанови.' },
  refundNoPaymentId:    { en: 'No payment on file for this subscription — nothing to refund.', bg: 'Няма регистрирано плащане за този абонамент — няма какво да се възстанови.' },
  refundNoCapture:      { en: 'No captured payment found — nothing to refund.', bg: 'Не е намерено осъществено плащане — няма какво да се възстанови.' },
  refundAlreadyDone:    { en: 'This charge has already been fully refunded.', bg: 'Това плащане вече е напълно възстановено.' },
  amountTooHigh:  { en: 'Amount exceeds the maximum refundable charge', bg: 'Сумата надвишава максимално възстановимата' },
  reasonLabel:    { en: 'Reason',          bg: 'Причина' },
  reasonRequested:{ en: 'Requested by customer', bg: 'По заявка на клиента' },
  reasonDuplicate:{ en: 'Duplicate charge', bg: 'Дублирано плащане' },
  reasonFraud:    { en: 'Fraudulent',      bg: 'Измама' },
  refundCta:      { en: 'Issue refund',    bg: 'Възстанови' },
  refunding:      { en: 'Refunding…',      bg: 'Възстановяване…' },
  refundedN:      { en: 'Refund of {amount} {currency} issued', bg: 'Възстановена сума {amount} {currency}' },
  refundFail:     { en: 'Failed to issue refund', bg: 'Неуспешно възстановяване' },
  amountPositive: { en: 'Amount must be a positive number', bg: 'Сумата трябва да е положителна' },
  suspendTitle:   { en: 'Suspend account?', bg: 'Спиране на акаунт?' },
  activateTitle:  { en: 'Activate account?', bg: 'Активиране на акаунт?' },
  suspendBody:    { en: '{name} will be suspended and will no longer be able to log in.', bg: '{name} ще бъде спрян и няма да може повече да влиза.' },
  activateBody:   { en: "{name}'s account will be reactivated.", bg: 'Акаунтът на {name} ще бъде активиран.' },
  yesSuspend:     { en: 'Yes, suspend',    bg: 'Да, спри' },
  yesActivate:    { en: 'Yes, activate',   bg: 'Да, активирай' },
  acctSuspended:  { en: 'Account suspended', bg: 'Акаунтът е спрян' },
  acctActivated:  { en: 'Account activated', bg: 'Акаунтът е активиран' },
  statusFail:     { en: 'Failed to update account status', bg: 'Неуспешно обновяване на статус' },
  ibanLabel:      { en: 'IBAN:',           bg: 'IBAN:' },
  ibanCopied:     { en: 'IBAN copied',     bg: 'IBAN копиран' },
  ibanCopy:       { en: 'Copy',            bg: 'Копирай' },
  ibanNone:       { en: 'Not provided',    bg: 'Липсва' },
  drawerSubtitle: { en: 'Last 5 wallet transactions', bg: 'Последни 5 транзакции' },
  drawerSubsTitle:{ en: 'Subscription history', bg: 'История на абонаменти' },
  drawerEmpty:    { en: 'No transactions found', bg: 'Няма транзакции' },
  drawerLoading:  { en: 'Loading…',        bg: 'Зареждане…' },
  drawerNoSubs:   { en: 'No subscriptions yet', bg: 'Няма абонаменти' },
} as const;

type I18NKey = keyof typeof I18N;
function tr(key: I18NKey, lang: Lang, vars?: Record<string, string | number>): string {
  let s: string = I18N[key]?.[lang] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/* ─── Palette ─────────────────────────────────────────────────────────────── */
const palette = {
  bg: '#faf9f5',
  surface: '#ffffff',
  border: '#e8e5dc',
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
  info: '#2563eb',
  infoSoft: '#dbeafe',
  purple: '#7c3aed',
  purpleSoft: '#ede9fe',
  teal: '#0f766e',
  tealSoft: '#ccfbf1',
  amber: '#92400e',
  amberSoft: '#fef3c7',
};

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

  &::placeholder {
    color: ${palette.textSubtle};
  }
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

const Btn = styled.button<{ $variant?: 'primary' | 'ghost' | 'danger' }>`
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

  ${({ $variant = 'ghost' }) => {
    if ($variant === 'primary')
      return `background: ${palette.accent}; color: #fff; border-color: ${palette.accent};
        &:hover { background: #b55a3b; }`;
    if ($variant === 'danger')
      return `background: ${palette.dangerSoft}; color: ${palette.danger}; border-color: ${palette.danger};
        &:hover { background: #ebb8a8; }`;
    return `background: ${palette.surface}; color: ${palette.textMuted}; border-color: ${palette.border};
      &:hover { background: ${palette.bg}; color: ${palette.text}; }`;
  }}
`;

/* ─── Cell helpers ─────────────────────────────────────────────────────────── */
const MetaLine = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-top: 0.125rem;
`;

// Mirrors AdminSubscriptionsPage PlanBadge so the same plan renders the same
// colour across all three admin screens. Amber = Premium Monthly,
// teal = Premium Weekly (LIGHT), info-blue = Basic.
const PlanBadge = styled.span<{ $plan: SubscriptionPlan }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;
  white-space: nowrap;

  ${({ $plan }) => {
    switch ($plan) {
      case 'PREMIUM':
        return `background: ${palette.amberSoft}; color: ${palette.amber};`;
      case 'BASIC':
        return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'LIGHT':
        return `background: ${palette.tealSoft}; color: ${palette.teal};`;
      default:
        return `background: #f3f4f6; color: #6b7280;`;
    }
  }}
`;

// Mirrors StatusBadge in AdminSubscriptionsPage and SubStatusBadge in
// AdminSubscriberDetailPage so the same record reads the same color across all
// three admin screens. CANCELLED → grey (terminal user-initiated, not error);
// EXPIRED → purple (natural lapse per spec §4.2); INCOMPLETE_EXPIRED → danger
// (failed onboarding).
const StatusBadge = styled.span<{ $status: SubscriptionStatus }>`
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
      case 'ACTIVE':
      case 'TRIALING':
        return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'PAST_DUE':
      case 'UNPAID':
        return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'INCOMPLETE':
        return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'INCOMPLETE_EXPIRED':
        return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      case 'EXPIRED':
        return `background: ${palette.purpleSoft}; color: ${palette.purple};`;
      case 'PAUSED':
        return `background: #f3f4f6; color: #374151;`;
      case 'CANCELLED':
      default:
        return `background: #f3f4f6; color: #6b7280;`;
    }
  }}
`;

const BalanceCell = styled.div`
  font-variant-numeric: tabular-nums;
  font-size: 0.875rem;
  color: ${palette.textMuted};
`;

/* ─── Modal ────────────────────────────────────────────────────────────────── */
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
  max-width: 28rem;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
`;

const ModalTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 0.5rem;
`;

const ModalBody = styled.p`
  font-size: 0.9375rem;
  color: ${palette.textMuted};
  margin: 0 0 1.5rem;
  line-height: 1.5;
`;

const ModalActions = styled.div`
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
`;

const ModalLabel = styled.label`
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${palette.textMuted};
  margin-bottom: 0.375rem;
`;

const ModalSelect = styled.select`
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  margin-bottom: 1.5rem;

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }
`;

const ModalInput = styled.input`
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  margin-bottom: 1.5rem;
  box-sizing: border-box;

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }
`;

/* ─── History Drawer ───────────────────────────────────────────────────────── */
const Drawer = styled.div<{ $open: boolean }>`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 28rem;
  max-width: 100vw;
  background: ${palette.surface};
  border-left: 1px solid ${palette.border};
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.1);
  z-index: 90;
  transform: ${({ $open }) => ($open ? 'translateX(0)' : 'translateX(100%)')};
  transition: transform 220ms ease;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const DrawerBackdrop = styled.div<{ $open: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.2);
  z-index: 89;
  opacity: ${({ $open }) => ($open ? 1 : 0)};
  pointer-events: ${({ $open }) => ($open ? 'auto' : 'none')};
  transition: opacity 220ms ease;
`;

const DrawerHeader = styled.div`
  padding: 1.5rem;
  border-bottom: 1px solid ${palette.border};
`;

const DrawerTitle = styled.h3`
  font-size: 1rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 0.25rem;
`;

const DrawerSubtitle = styled.p`
  font-size: 0.8125rem;
  color: ${palette.textSubtle};
  margin: 0;
`;

const DrawerClose = styled.button`
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  color: ${palette.textSubtle};
  line-height: 1;
  padding: 0.25rem;

  &:hover { color: ${palette.text}; }
`;

const DrawerBody = styled.div`
  padding: 1.25rem 1.5rem;
  flex: 1;
`;

const TxRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid ${palette.border};

  &:last-child { border-bottom: none; }
`;

const TxAmount = styled.div<{ $negative?: boolean }>`
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 0.9375rem;
  color: ${({ $negative }) => ($negative ? palette.danger : palette.success)};
  white-space: nowrap;
`;

const TxMeta = styled.div`
  flex: 1;
`;

const TxType = styled.div`
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${palette.text};
  text-transform: capitalize;
`;

const TxDate = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-top: 0.125rem;
`;

const TxNote = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-top: 0.125rem;
  font-style: italic;
`;

const EmptyDrawer = styled.p`
  color: ${palette.textSubtle};
  font-size: 0.875rem;
  text-align: center;
  padding: 2rem 0;
`;

const IbanRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
`;

const IbanValue = styled.span`
  font-size: 0.8125rem;
  color: ${palette.text};
  font-weight: 500;
  font-family: monospace;
  letter-spacing: 0.04em;
`;

const CopyBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  &:hover { background: ${palette.border}; color: ${palette.text}; }
`;

const SubscriberName = styled(Link)`
  font-weight: 600;
  color: ${palette.text};
  text-decoration: none;

  &:hover {
    color: ${palette.accent};
    text-decoration: underline;
  }
`;

const MonoId = styled.span`
  font-family: 'Menlo', 'Consolas', 'Monaco', monospace;
  font-size: 0.75rem;
  color: ${palette.textMuted};
  letter-spacing: 0.03em;
`;

const UserStatusBadge = styled.span<{ $status: UserAccountStatus | 'DELETED' }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;

  ${({ $status }) => {
    if ($status === 'ACTIVE') return `background: ${palette.successSoft}; color: ${palette.success};`;
    if ($status === 'SUSPENDED') return `background: ${palette.warningSoft}; color: ${palette.warning};`;
    return `background: #f3f4f6; color: #6b7280;`;
  }}
`;

const RiskPill = styled.span<{ $level: 'low' | 'medium' | 'high' }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 9999px;
  padding: 0.125rem 0.5rem;

  ${({ $level }) => {
    if ($level === 'low') return `background: ${palette.successSoft}; color: ${palette.success};`;
    if ($level === 'medium') return `background: ${palette.warningSoft}; color: ${palette.warning};`;
    return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
  }}
`;

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function riskLevelOf(score: number): 'low' | 'medium' | 'high' {
  if (score <= 30) return 'low';
  if (score <= 60) return 'medium';
  return 'high';
}

function displayName(row: AdminSubscriber): string {
  return row.firstName || row.lastName
    ? `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim()
    : row.email;
}

/* ─── CSV helper ────────────────────────────────────────────────────────────── */
function downloadCSV(rows: AdminSubscriber[], locale: string) {
  // Spec §4.4 — cashback is entry-based with five buckets. Available is one
  // axis only; rename so the column header doesn't claim to be the full
  // cashback picture (Locked/Expired/etc. live in Кешбек screen).
  const headers = ['ID', 'First name', 'Last name', 'Email', 'Phone', 'Account status', 'Plan', 'Sub status', 'Available cashback (BGN)', 'Pending cashback (BGN)', 'Period ends', 'Auto-renew', 'Last activity', 'Joined'];
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.id,
        r.firstName ?? '',
        r.lastName ?? '',
        r.email,
        r.phone ?? '',
        r.deletedAt ? 'DELETED' : r.status,
        r.subscription?.plan ?? '',
        r.subscription?.status ?? '',
        r.wallet?.availableBalance.toFixed(2) ?? '',
        r.wallet?.pendingBalance.toFixed(2) ?? '',
        r.subscription?.currentPeriodEnd ? fmt(r.subscription.currentPeriodEnd) : '',
        // Spec §4.1 — auto-renew is meaningless without a subscription.
        // Emit empty rather than misleading "No" when subscription is null.
        r.subscription ? (r.subscription.autoRenewal ? 'Yes' : 'No') : '',
        r.lastActivityAt ? fmt(r.lastActivityAt) : '',
        fmt(r.createdAt),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Component ───────────────────────────────────────────────────────────── */
const PAGE_SIZE = 20;
const NEGATIVE_TX_TYPES = ['WITHDRAWAL', 'PURCHASE'];

const STATUS_OPTIONS: Array<{ value: SubscriptionStatus | ''; key: I18NKey }> = [
  { value: '', key: 'allStatuses' },
  { value: 'ACTIVE', key: 'active' },
  { value: 'TRIALING', key: 'trialing' },
  { value: 'PAST_DUE', key: 'pastDue' },
  { value: 'UNPAID', key: 'unpaid' },
  { value: 'PAUSED', key: 'paused' },
  { value: 'CANCELLED', key: 'cancelled' },
  { value: 'EXPIRED', key: 'expired' },
  { value: 'INCOMPLETE', key: 'incomplete' },
  { value: 'INCOMPLETE_EXPIRED', key: 'incompleteExpired' },
];

const ACCOUNT_STATUS_OPTIONS: Array<{ value: AccountStatusFilter | ''; key: I18NKey }> = [
  { value: '', key: 'allAccounts' },
  { value: 'ACTIVE', key: 'active' },
  { value: 'SUSPENDED', key: 'suspended' },
  { value: 'DELETED', key: 'deleted' },
];

// Spec §7.1 — three risk tiers framed as "auto / review / high".
const RISK_OPTIONS: Array<{ value: RiskLevelFilter | ''; key: I18NKey }> = [
  { value: '', key: 'allRisk' },
  { value: 'low', key: 'riskAutoFilter' },
  { value: 'medium', key: 'riskReviewFilter' },
  { value: 'high', key: 'riskHighFilter' },
];

const PLAN_CHOICES: SubscriptionPlan[] = ['LIGHT', 'BASIC', 'PREMIUM'];

type RefundReason = 'duplicate' | 'fraudulent' | 'requested_by_customer';
const REFUND_REASONS: Array<{ value: RefundReason; key: I18NKey }> = [
  { value: 'requested_by_customer', key: 'reasonRequested' },
  { value: 'duplicate', key: 'reasonDuplicate' },
  { value: 'fraudulent', key: 'reasonFraud' },
];

export default function AdminSubscribersAllPage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const locale = language === 'bg' ? 'bg-BG' : 'en-GB';
  const lang: Lang = language === 'bg' ? 'bg' : 'en';
  const T = (key: I18NKey, vars?: Record<string, string | number>) => tr(key, lang, vars);
  // Render a translated string with literal "{name}" replaced by <strong>{name}</strong>.
  // Helper only knows about {name} — if a translation grows another placeholder
  // ({count}, {plan}) it would render as literal text. Dev-mode warning surfaces
  // that loudly instead of silently shipping broken UI.
  const withName = (key: I18NKey, name: string): React.ReactNode => {
    const raw = I18N[key]?.[lang] ?? key;
    const parts = raw.split('{name}');
    if (process.env.NODE_ENV !== 'production') {
      const stray = parts.join('').match(/\{[a-zA-Z]+\}/);
      if (stray) {
        // eslint-disable-next-line no-console
        console.warn(
          `[withName] i18n key '${key}' contains placeholder ${stray[0]} that withName cannot substitute — use tr() instead`,
        );
      }
    }
    return (
      <>
        {parts[0]}
        <strong>{name}</strong>
        {parts.slice(1).join('{name}')}
      </>
    );
  };

  /* ── Filters ── */
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState<SubscriptionPlan | ''>('');
  const [status, setStatus] = useState<SubscriptionStatus | ''>('');
  const [accountStatus, setAccountStatus] = useState<AccountStatusFilter | ''>('');
  const [riskLevel, setRiskLevel] = useState<RiskLevelFilter | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  /* ── Modal state ── */
  const [confirmCancel, setConfirmCancel] = useState<AdminSubscriber | null>(null);
  const [confirmPlan, setConfirmPlan] = useState<AdminSubscriber | null>(null);
  const [newPlan, setNewPlan] = useState<SubscriptionPlan>('BASIC');
  const [confirmSuspend, setConfirmSuspend] = useState<{
    row: AdminSubscriber;
    targetStatus: 'ACTIVE' | 'SUSPENDED';
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminSubscriber | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [confirmRestore, setConfirmRestore] = useState<AdminSubscriber | null>(null);
  const [confirmForceLogout, setConfirmForceLogout] = useState<AdminSubscriber | null>(null);
  const [refundTarget, setRefundTarget] = useState<AdminSubscriber | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState<RefundReason>('requested_by_customer');
  const [exporting, setExporting] = useState(false);

  /* ── Drawer state ── */
  const [drawerSub, setDrawerSub] = useState<AdminSubscriber | null>(null);

  /* ── Data ── */
  const filters = {
    search: search || undefined,
    plan,
    status,
    accountStatus,
    riskLevel,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };
  const queryKey = ['admin-subscribers', page, search, plan, status, accountStatus, riskLevel, dateFrom, dateTo];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => adminSubscribersService.list({ page, limit: PAGE_SIZE, ...filters }),
  });

  const { data: drawerTxData, isLoading: drawerTxLoading } = useQuery({
    queryKey: ['subscriber-tx-history', drawerSub?.id],
    queryFn: () =>
      adminTransactionsService.list({ userId: drawerSub!.id, limit: 5, page: 1 }),
    enabled: !!drawerSub,
  });

  const { data: drawerDetail } = useQuery<AdminSubscriberDetail>({
    queryKey: ['subscriber-detail', drawerSub?.id],
    queryFn: () => adminSubscribersService.getSubscriber(drawerSub!.id),
    enabled: !!drawerSub,
  });

  // Pre-fetch the latest Stripe charge so the refund modal shows the actual
  // currency and refundable max instead of letting the admin type a number
  // blind. Cached by user id; invalidated when the modal opens for a new user.
  const { data: refundPreview, isLoading: refundPreviewLoading } = useQuery({
    queryKey: ['subscriber-refund-preview', refundTarget?.id],
    queryFn: () => adminSubscribersService.refundPreview(refundTarget!.id),
    enabled: !!refundTarget,
    staleTime: 60_000,
  });

  /* ── Mutations ── */
  const cancelMutation = useMutation({
    mutationFn: (id: string) => adminSubscribersService.cancelSubscription(id),
    onSuccess: () => {
      toast.success(T('cancelledToast'));
      queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] });
      setConfirmCancel(null);
    },
    onError: () => toast.error(T('cancelFail')),
  });

  const planMutation = useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: SubscriptionPlan }) =>
      adminSubscribersService.changePlan(id, plan),
    onSuccess: () => {
      toast.success(T('planUpdated'));
      queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] });
      setConfirmPlan(null);
    },
    onError: () => toast.error(T('planFail')),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, targetStatus }: { id: string; targetStatus: 'ACTIVE' | 'SUSPENDED' }) =>
      adminSubscribersService.suspendSubscriber(id, targetStatus),
    onSuccess: (_, vars) => {
      toast.success(T(vars.targetStatus === 'SUSPENDED' ? 'acctSuspended' : 'acctActivated'));
      queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] });
      setConfirmSuspend(null);
    },
    onError: () => toast.error(T('statusFail')),
  });

  const forceLogoutMutation = useMutation({
    mutationFn: (id: string) => adminSubscribersService.forceLogout(id),
    onSuccess: (res) => {
      toast.success(T('revokedN', { n: res.revokedCount }));
      setConfirmForceLogout(null);
    },
    onError: () => toast.error(T('revokeFail')),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      adminSubscribersService.deleteAccount(id, reason),
    onSuccess: () => {
      toast.success(T('acctDeleted'));
      queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] });
      setConfirmDelete(null);
      setDeleteReason('');
    },
    onError: () => toast.error(T('deleteFail')),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => adminSubscribersService.restoreAccount(id),
    onSuccess: () => {
      toast.success(T('acctRestored'));
      queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] });
      setConfirmRestore(null);
    },
    onError: () => toast.error(T('restoreFail')),
  });

  const refundMutation = useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount?: number; reason: RefundReason }) =>
      adminSubscribersService.refund(id, { amount, reason }),
    onSuccess: (res) => {
      toast.success(T('refundedN', { amount: res.amount.toFixed(2), currency: res.currency.toUpperCase() }));
      queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] });
      setRefundTarget(null);
      setRefundAmount('');
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error ?? T('refundFail')),
  });

  /* ── Escape key close ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setConfirmCancel(null);
      setConfirmPlan(null);
      setConfirmSuspend(null);
      setConfirmDelete(null);
      setConfirmRestore(null);
      setConfirmForceLogout(null);
      setRefundTarget(null);
      setDrawerSub(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  /* ── CSV export handler ── */
  const handleExportCSV = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await adminSubscribersService.exportAll(filters);
      if (!res.subscribers.length) {
        toast.error(T('noToExport'));
        return;
      }
      downloadCSV(res.subscribers, locale);
      toast.success(T('exportedN', { n: res.subscribers.length }));
    } catch {
      toast.error(T('exportFail'));
    } finally {
      setExporting(false);
    }
  };

  /* ── Handlers ── */
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { setSearch(searchInput); setPage(1); }
  };

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  const userStatusLabel = (s: UserAccountStatus | 'DELETED'): string =>
    sharedUserStatusLabel(s, lang);

  const subStatusLabel = (s: SubscriptionStatus): string =>
    sharedSubStatusLabel(s, lang);

  /* ── Columns ── */
  const columns: ColumnDef<AdminSubscriber>[] = [
    {
      key: 'firstName',
      header: T('colSubscriber'),
      render: (row) => (
        <div>
          <SubscriberName to={`/admin/subscribers/${row.id}`}>
            {displayName(row)}
          </SubscriberName>
          <MetaLine>{row.email}</MetaLine>
          {row.phone && <MetaLine>{row.phone}</MetaLine>}
        </div>
      ),
    },
    {
      key: 'userId',
      header: T('colUserId'),
      render: (row) => <MonoId>{row.id.slice(0, 8)}</MonoId>,
    },
    {
      key: 'accountStatus',
      header: T('colUserStatus'),
      render: (row) => {
        const s = (row.deletedAt ? 'DELETED' : row.status) as UserAccountStatus | 'DELETED';
        return <UserStatusBadge $status={s}>{userStatusLabel(s)}</UserStatusBadge>;
      },
    },
    {
      key: 'risk',
      header: T('colRisk'),
      render: (row) =>
        row.riskScore == null ? (
          <span style={{ color: palette.textSubtle }}>—</span>
        ) : (
          <RiskPill $level={riskLevelOf(row.riskScore)}>{riskLabel(row.riskScore, lang)}</RiskPill>
        ),
    },
    {
      key: 'lastActivity',
      header: T('colLastActivity'),
      render: (row) => {
        // Spec §4.1 — fall back to lastLoginAt only when no richer activity
        // signal exists yet (legacy users). Once the auth middleware has
        // touched lastActivityAt, that becomes the source of truth.
        const ts = row.lastActivityAt ?? row.lastLoginAt;
        return (
          <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>
            {ts ? fmt(ts) : T('never')}
          </span>
        );
      },
    },
    {
      key: 'plan',
      header: T('colPlan'),
      render: (row) =>
        row.subscription ? (
          <PlanBadge $plan={row.subscription.plan}>
            {planLabel(row.subscription.plan, lang)}
          </PlanBadge>
        ) : (
          <span style={{ color: palette.textSubtle }}>—</span>
        ),
    },
    {
      key: 'subscriptionStatus',
      header: T('colSubStatus'),
      render: (row) =>
        row.subscription ? (
          <StatusBadge $status={row.subscription.status}>
            {subStatusLabel(row.subscription.status)}
          </StatusBadge>
        ) : (
          <span style={{ color: palette.textSubtle }}>—</span>
        ),
    },
    {
      key: 'wallet',
      header: T('colCashback'),
      render: (row) =>
        row.wallet ? (
          <BalanceCell>
            {row.wallet.availableBalance.toFixed(2)} BGN
            {row.wallet.pendingBalance > 0 && (
              <MetaLine>+{row.wallet.pendingBalance.toFixed(2)} {T('pendingShort')}</MetaLine>
            )}
          </BalanceCell>
        ) : (
          <span style={{ color: palette.textSubtle }}>—</span>
        ),
    },
    {
      key: 'currentPeriodEnd',
      header: T('colPeriodEnds'),
      sortable: true,
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>
          {row.subscription?.currentPeriodEnd ? fmt(row.subscription.currentPeriodEnd) : '—'}
        </span>
      ),
    },
    {
      key: 'autoRenewal',
      header: T('colAutoRenew'),
      // Spec §4.1 — auto-renew is an attribute of a subscription. With no
      // subscription the previous render produced "No", which incorrectly
      // implied a cancelled renewal. Show '—' instead.
      render: (row) => {
        if (!row.subscription) {
          return <span style={{ color: palette.textSubtle }}>—</span>;
        }
        return (
          <span
            style={{
              fontSize: '0.8125rem',
              color: row.subscription.autoRenewal ? palette.success : palette.textSubtle,
              fontWeight: 600,
            }}
          >
            {row.subscription.autoRenewal ? T('yes') : T('no')}
          </span>
        );
      },
    },
    {
      key: 'createdAt',
      header: T('colJoined'),
      sortable: true,
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>
          {fmt(row.createdAt)}
        </span>
      ),
    },
  ];

  const rowActions: RowAction<AdminSubscriber>[] = [
    {
      label: T('viewHistory'),
      onClick: (row) => setDrawerSub(row),
    },
    {
      label: T('changePlan'),
      onClick: (row) => {
        setNewPlan(row.subscription?.plan ?? 'BASIC');
        setConfirmPlan(row);
      },
      hidden: (row) =>
        !row.subscription ||
        row.subscription.status === 'CANCELLED' ||
        row.subscription.status === 'EXPIRED' ||
        row.subscription.status === 'INCOMPLETE_EXPIRED' ||
        !!row.deletedAt,
    },
    {
      label: T('cancelSub'),
      danger: true,
      onClick: (row) => setConfirmCancel(row),
      hidden: (row) =>
        !row.subscription ||
        row.subscription.status === 'CANCELLED' ||
        row.subscription.status === 'EXPIRED' ||
        row.subscription.status === 'INCOMPLETE_EXPIRED' ||
        !!row.deletedAt,
    },
    {
      label: T('refund'),
      danger: true,
      onClick: (row) => {
        setRefundAmount('');
        setRefundReason('requested_by_customer');
        setRefundTarget(row);
      },
      hidden: (row) => !row.subscription || !!row.deletedAt,
    },
    {
      label: T('suspendAcct'),
      danger: true,
      onClick: (row) => setConfirmSuspend({ row, targetStatus: 'SUSPENDED' }),
      hidden: (row) => row.status === 'SUSPENDED' || !!row.deletedAt,
    },
    {
      label: T('activateAcct'),
      onClick: (row) => setConfirmSuspend({ row, targetStatus: 'ACTIVE' }),
      hidden: (row) => row.status === 'ACTIVE' || !!row.deletedAt,
    },
    {
      label: T('forceLogout'),
      onClick: (row) => setConfirmForceLogout(row),
      hidden: (row) => !!row.deletedAt,
    },
    {
      label: T('deleteAcct'),
      danger: true,
      onClick: (row) => {
        setDeleteReason('');
        setConfirmDelete(row);
      },
      hidden: (row) => !!row.deletedAt,
    },
    {
      label: T('restoreAcct'),
      onClick: (row) => setConfirmRestore(row),
      hidden: (row) => !row.deletedAt,
    },
  ];

  return (
    <PageShell>
      {/* Cancel confirm modal */}
      {confirmCancel && (
        <Overlay onClick={() => !cancelMutation.isPending && setConfirmCancel(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{T('cancelTitle')}</ModalTitle>
            <ModalBody>
              {withName('cancelBody', displayName(confirmCancel))}
            </ModalBody>
            <ModalActions>
              <Btn onClick={() => setConfirmCancel(null)}>{T('keepActive')}</Btn>
              <Btn
                $variant="danger"
                onClick={() => cancelMutation.mutate(confirmCancel.id)}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? T('cancelling') : T('yesCancel')}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* Change plan modal */}
      {confirmPlan && (
        <Overlay onClick={() => setConfirmPlan(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{T('changePlanTitle')}</ModalTitle>
            <ModalBody>
              {withName('changePlanBody', displayName(confirmPlan))}
              {confirmPlan.subscription && (
                <> {T('currentPlan')}{' '}
                  <PlanBadge $plan={confirmPlan.subscription.plan}>
                    {planLabel(confirmPlan.subscription.plan, lang)}
                  </PlanBadge>
                </>
              )}
            </ModalBody>
            <div>
              <ModalLabel>{T('newPlanLabel')}</ModalLabel>
              <ModalSelect
                value={newPlan}
                onChange={(e) => setNewPlan(e.target.value as SubscriptionPlan)}
              >
                {PLAN_CHOICES.map((p) => (
                  <option key={p} value={p}>
                    {planLabel(p, lang)}
                  </option>
                ))}
              </ModalSelect>
            </div>
            <ModalActions>
              <Btn onClick={() => setConfirmPlan(null)}>{T('cancelBtn')}</Btn>
              <Btn
                $variant="primary"
                onClick={() => planMutation.mutate({ id: confirmPlan.id, plan: newPlan })}
                disabled={planMutation.isPending || newPlan === confirmPlan.subscription?.plan}
              >
                {planMutation.isPending ? T('saving') : T('saveChange')}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <Overlay onClick={() => !deleteMutation.isPending && setConfirmDelete(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{T('deleteTitle')}</ModalTitle>
            <ModalBody>{withName('deleteBody', displayName(confirmDelete))}</ModalBody>
            <div>
              <ModalLabel>{T('reasonOpt')}</ModalLabel>
              <ModalInput
                type="text"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder={T('reasonPh')}
              />
            </div>
            <ModalActions>
              <Btn onClick={() => setConfirmDelete(null)}>{T('cancelBtn')}</Btn>
              <Btn
                $variant="danger"
                onClick={() =>
                  deleteMutation.mutate({ id: confirmDelete.id, reason: deleteReason || undefined })
                }
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? T('deleting') : T('yesDelete')}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* Restore confirm modal */}
      {confirmRestore && (
        <Overlay onClick={() => !restoreMutation.isPending && setConfirmRestore(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{T('restoreTitle')}</ModalTitle>
            <ModalBody>{withName('restoreBody', displayName(confirmRestore))}</ModalBody>
            <ModalActions>
              <Btn onClick={() => setConfirmRestore(null)}>{T('cancelBtn')}</Btn>
              <Btn
                $variant="primary"
                onClick={() => restoreMutation.mutate(confirmRestore.id)}
                disabled={restoreMutation.isPending}
              >
                {restoreMutation.isPending ? T('restoring') : T('yesRestore')}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* Force logout confirm modal */}
      {confirmForceLogout && (
        <Overlay onClick={() => !forceLogoutMutation.isPending && setConfirmForceLogout(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{T('forceLogoutTitle')}</ModalTitle>
            <ModalBody>{withName('forceLogoutBody', displayName(confirmForceLogout))}</ModalBody>
            <ModalActions>
              <Btn onClick={() => setConfirmForceLogout(null)}>{T('cancelBtn')}</Btn>
              <Btn
                $variant="danger"
                onClick={() => forceLogoutMutation.mutate(confirmForceLogout.id)}
                disabled={forceLogoutMutation.isPending}
              >
                {forceLogoutMutation.isPending ? T('revoking') : T('yesRevoke')}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* Refund modal */}
      {refundTarget && (
        <Overlay onClick={() => !refundMutation.isPending && setRefundTarget(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{T('refundTitle')}</ModalTitle>
            <ModalBody>{withName('refundBody', displayName(refundTarget))}</ModalBody>
            {refundPreview && refundPreview.refundable === false && (
              <ModalBody style={{ color: palette.danger }}>
                {T(
                  refundPreview.reason === 'no_stripe_subscription' ? 'refundNoStripeSub'
                    : refundPreview.reason === 'no_payment_intent_id' ? 'refundNoPaymentId'
                    : refundPreview.reason === 'already_refunded' ? 'refundAlreadyDone'
                    : 'refundNoCapture',
                )}
              </ModalBody>
            )}
            <div>
              <ModalLabel>
                {refundPreview && refundPreview.refundable
                  ? T('amountLabelCcy', { currency: refundPreview.currency })
                  : T('amountLabel')}
              </ModalLabel>
              <ModalInput
                type="number"
                step="0.01"
                min="0"
                max={refundPreview && refundPreview.refundable ? refundPreview.amount : undefined}
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder={T('fullAmountPh')}
                disabled={refundPreviewLoading || (refundPreview?.refundable === false)}
              />
              {refundPreview && refundPreview.refundable && (
                <div style={{ fontSize: '0.75rem', color: palette.textSubtle, marginTop: '-1.25rem', marginBottom: '1.5rem' }}>
                  {T('refundMaxHint', { amount: refundPreview.amount.toFixed(2), currency: refundPreview.currency })}
                </div>
              )}
            </div>
            <div>
              <ModalLabel>{T('reasonLabel')}</ModalLabel>
              <ModalSelect
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value as RefundReason)}
              >
                {REFUND_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{T(r.key)}</option>
                ))}
              </ModalSelect>
            </div>
            <ModalActions>
              <Btn onClick={() => setRefundTarget(null)}>{T('cancelBtn')}</Btn>
              <Btn
                $variant="danger"
                onClick={() => {
                  const parsed = refundAmount ? parseFloat(refundAmount) : undefined;
                  if (parsed !== undefined && (!Number.isFinite(parsed) || parsed <= 0)) {
                    toast.error(T('amountPositive'));
                    return;
                  }
                  if (
                    parsed !== undefined &&
                    refundPreview?.refundable &&
                    parsed > refundPreview.amount
                  ) {
                    toast.error(T('amountTooHigh'));
                    return;
                  }
                  refundMutation.mutate({
                    id: refundTarget.id,
                    amount: parsed,
                    reason: refundReason,
                  });
                }}
                disabled={refundMutation.isPending || refundPreview?.refundable === false}
              >
                {refundMutation.isPending ? T('refunding') : T('refundCta')}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* Suspend / Activate confirm modal */}
      {confirmSuspend && (
        <Overlay onClick={() => !suspendMutation.isPending && setConfirmSuspend(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>
              {T(confirmSuspend.targetStatus === 'SUSPENDED' ? 'suspendTitle' : 'activateTitle')}
            </ModalTitle>
            <ModalBody>
              {withName(
                confirmSuspend.targetStatus === 'SUSPENDED' ? 'suspendBody' : 'activateBody',
                displayName(confirmSuspend.row),
              )}
            </ModalBody>
            <ModalActions>
              <Btn onClick={() => setConfirmSuspend(null)}>{T('cancelBtn')}</Btn>
              <Btn
                $variant={confirmSuspend.targetStatus === 'SUSPENDED' ? 'danger' : 'primary'}
                onClick={() =>
                  suspendMutation.mutate({
                    id: confirmSuspend.row.id,
                    targetStatus: confirmSuspend.targetStatus,
                  })
                }
                disabled={suspendMutation.isPending}
              >
                {suspendMutation.isPending
                  ? T('saving')
                  : T(confirmSuspend.targetStatus === 'SUSPENDED' ? 'yesSuspend' : 'yesActivate')}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* History drawer */}
      <DrawerBackdrop $open={!!drawerSub} onClick={() => setDrawerSub(null)} />
      <Drawer $open={!!drawerSub}>
        {drawerSub && (
          <>
            <DrawerHeader style={{ position: 'relative' }}>
              <DrawerClose onClick={() => setDrawerSub(null)}>✕</DrawerClose>
              <DrawerTitle>{displayName(drawerSub)}</DrawerTitle>
              <DrawerSubtitle>{T('drawerSubtitle')}</DrawerSubtitle>
              <IbanRow>
                <span style={{ fontSize: '0.75rem', color: palette.textSubtle }}>{T('ibanLabel')}</span>
                {drawerDetail?.iban ? (
                  <>
                    <IbanValue>{drawerDetail.iban}</IbanValue>
                    <CopyBtn
                      title={T('ibanCopy')}
                      onClick={() => {
                        navigator.clipboard.writeText(drawerDetail.iban!);
                        toast.success(T('ibanCopied'));
                      }}
                    >
                      {T('ibanCopy')}
                    </CopyBtn>
                  </>
                ) : (
                  <span style={{ fontSize: '0.8125rem', color: palette.textSubtle }}>{T('ibanNone')}</span>
                )}
              </IbanRow>
            </DrawerHeader>
            <DrawerBody>
              {drawerTxLoading ? (
                <EmptyDrawer>{T('drawerLoading')}</EmptyDrawer>
              ) : !drawerTxData?.transactions.length ? (
                <EmptyDrawer>{T('drawerEmpty')}</EmptyDrawer>
              ) : (
                drawerTxData.transactions.map((tx: AdminTransaction) => (
                  <TxRow key={tx.id}>
                    <TxMeta>
                      <TxType>{tx.type.replace(/_/g, ' ').toLowerCase()}</TxType>
                      {tx.description && <TxNote>{tx.description}</TxNote>}
                      <TxDate>
                        {fmt(tx.createdAt)} {fmtTime(tx.createdAt)}
                      </TxDate>
                    </TxMeta>
                    <div>
                      <TxAmount $negative={NEGATIVE_TX_TYPES.includes(tx.type)}>
                        {NEGATIVE_TX_TYPES.includes(tx.type) ? '−' : '+'}
                        {tx.amount.toFixed(2)} {tx.currency}
                      </TxAmount>
                      <MetaLine style={{ textAlign: 'right' }}>
                        {tx.balanceBefore.toFixed(2)} → {tx.balanceAfter.toFixed(2)}
                      </MetaLine>
                    </div>
                  </TxRow>
                ))
              )}

              {/* Spec §4.2 — profile and subscription are separate layers and
                  the user can have history of multiple subscriptions over
                  time. Surface that history right next to the wallet log. */}
              {drawerDetail && (
                <div style={{ marginTop: '1.5rem' }}>
                  <h4 style={{
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    color: palette.textMuted,
                    margin: '0 0 0.5rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}>
                    {T('drawerSubsTitle')}
                  </h4>
                  {drawerDetail.subscriptions.length === 0 ? (
                    <EmptyDrawer>{T('drawerNoSubs')}</EmptyDrawer>
                  ) : (
                    drawerDetail.subscriptions.map((s) => (
                      <TxRow key={s.id}>
                        <TxMeta>
                          <TxType style={{ textTransform: 'none' }}>
                            <PlanBadge $plan={s.plan}>{planLabel(s.plan, lang)}</PlanBadge>
                            {' '}
                            <StatusBadge $status={s.status}>{subStatusLabel(s.status)}</StatusBadge>
                          </TxType>
                          <TxDate>
                            {fmt(s.createdAt)}
                            {s.canceledAt ? ` → ${fmt(s.canceledAt)}` : s.currentPeriodEnd ? ` → ${fmt(s.currentPeriodEnd)}` : ''}
                          </TxDate>
                        </TxMeta>
                      </TxRow>
                    ))
                  )}
                </div>
              )}
            </DrawerBody>
          </>
        )}
      </Drawer>

      <PageHeader>
        <TitleBlock>
          <Eyebrow>{T('eyebrow')}</Eyebrow>
          <PageTitle>
            {T('pageTitle')}
            {data && <TotalBadge>{data.total.toLocaleString()}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>{T('pageSubtitle')}</PageSubtitle>
        </TitleBlock>
        <HeaderActions>
          <Btn onClick={handleExportCSV} disabled={exporting || !data?.total}>
            {exporting ? T('exporting') : T('exportCsv')}
          </Btn>
        </HeaderActions>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder={T('searchPh')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <Select value={accountStatus} onChange={(e) => { setAccountStatus(e.target.value as AccountStatusFilter | ''); setPage(1); }}>
            {ACCOUNT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{T(o.key)}</option>
            ))}
          </Select>
          <Select value={plan} onChange={(e) => { setPlan(e.target.value as SubscriptionPlan | ''); setPage(1); }}>
            <option value="">{T('allPlans')}</option>
            {PLAN_CHOICES.map((p) => (
              <option key={p} value={p}>{planLabel(p, lang)}</option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => { setStatus(e.target.value as SubscriptionStatus | ''); setPage(1); }}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{T(o.key)}</option>
            ))}
          </Select>
          <Select value={riskLevel} onChange={(e) => { setRiskLevel(e.target.value as RiskLevelFilter | ''); setPage(1); }}>
            {RISK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{T(o.key)}</option>
            ))}
          </Select>
          <DateInput
            type="date"
            value={dateFrom}
            title={T('colJoined')}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          />
          <DateInput
            type="date"
            value={dateTo}
            title={T('colJoined')}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          />
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.subscribers ?? []}
          rowKey={(row) => row.id}
          rowActions={rowActions}
          loading={isLoading}
          emptyMessage={T('noSubsFound')}
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.total}
          onPageChange={setPage}
        />
      </Card>
    </PageShell>
  );
}
