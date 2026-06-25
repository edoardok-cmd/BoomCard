import { useState } from 'react';
import styled from 'styled-components';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCurrencyDisplay } from '../../contexts/CurrencyDisplayContext';
import { formatMoneyByMode } from '../../utils/helpers';
import {
  adminSubscribersService,
  SubscriptionPlan,
  SubscriptionStatus,
  UserAccountStatus,
} from '../../services/adminSubscribers.service';
import { adminSubscriptionsService } from '../../services/adminSubscriptions.service';
import { adminTransactionsService, type BusinessTransaction } from '../../services/adminTransactions.service';
import { apiService } from '../../services/api.service';
import { planLabel, subStatusLabel, userStatusLabel, riskLabel, getRiskLevel, type RiskLevel, type Lang } from '../../utils/planLabels';
import { formatPhoneBG } from '../../utils/validators';

import { palette } from '../../styles/adminTheme';
/* ─── i18n ─────────────────────────────────────────────────────────────────── */
const I18N = {
  // Header / states
  backAll:          { en: '← All subscribers',          bg: '← Всички абонати' },
  loading:          { en: 'Loading…',                    bg: 'Зарежда…' },
  loadFail:         { en: 'Failed to load subscriber.',  bg: 'Неуспешно зареждане на абоната.' },
  // Profile meta
  joined:           { en: 'Joined',                     bg: 'Регистриран' },
  lastLogin:        { en: 'Last login',                  bg: 'Последен вход' },
  lastActivity:     { en: 'Last activity',               bg: 'Последна активност' },
  risk:             { en: 'Risk',                        bg: 'Риск' },
  // Account actions
  saving:           { en: 'Saving…',                    bg: 'Запазва…' },
  suspendAcct:      { en: 'Suspend account',             bg: 'Спри акаунт' },
  activateAcct:     { en: 'Activate account',            bg: 'Активирай акаунт' },
  forceLogout:      { en: 'Force logout',                bg: 'Принудителен изход' },
  deleteAcct:       { en: 'Delete account',              bg: 'Изтрий акаунт' },
  restoreAcct:      { en: 'Restore account',             bg: 'Възстанови акаунт' },
  // Subscription actions
  cancelSub:        { en: 'Cancel subscription',         bg: 'Откажи абонамент' },
  changePlan:       { en: 'Change plan',                 bg: 'Смени план' },
  refund:           { en: 'Refund',                      bg: 'Възстанови' },
  // Modal — suspend / activate
  suspendTitle:     { en: 'Suspend account?',           bg: 'Спиране на акаунт?' },
  suspendBody:      { en: '{name} will be suspended and will no longer be able to log in.', bg: '{name} ще бъде спрян и няма да може повече да влиза.' },
  yesSuspend:       { en: 'Yes, suspend',               bg: 'Да, спри' },
  suspending:       { en: 'Suspending…',                bg: 'Спиране…' },
  activateTitle:    { en: 'Activate account?',          bg: 'Активиране на акаунт?' },
  activateBody:     { en: "{name}'s account will be reactivated.", bg: 'Акаунтът на {name} ще бъде активиран.' },
  yesActivate:      { en: 'Yes, activate',              bg: 'Да, активирай' },
  activating:       { en: 'Activating…',                bg: 'Активиране…' },
  // Modal — force logout
  forceLogoutTitle: { en: 'Force logout?',              bg: 'Принудителен изход?' },
  forceLogoutBody:  { en: 'All active sessions for {name} will be revoked. They will need to sign in again on every device.', bg: 'Всички активни сесии на {name} ще бъдат прекратени. Ще трябва да влезе отново от всяко устройство.' },
  yesRevoke:        { en: 'Yes, revoke',                bg: 'Да, прекрати' },
  revoking2:        { en: 'Revoking…',                  bg: 'Прекратяване…' },
  // Toasts
  acctSuspended:    { en: 'Account suspended',           bg: 'Акаунтът е спрян' },
  acctActivated:    { en: 'Account activated',           bg: 'Акаунтът е активиран' },
  statusFail:       { en: 'Failed to update account status', bg: 'Неуспешна промяна на статус' },
  revokedN:         { en: 'Revoked {n} session(s)',       bg: 'Отнети сесии: {n}' },
  revokedNone:      { en: 'No active sessions to revoke', bg: 'Няма активни сесии за отнемане' },
  revokeFail:       { en: 'Failed to revoke sessions',   bg: 'Неуспешно отнемане на сесиите' },
  acctDeleted:      { en: 'Account deleted',             bg: 'Акаунтът е изтрит' },
  deleteFail:       { en: 'Failed to delete account',    bg: 'Неуспешно изтриване' },
  acctRestored:     { en: 'Account restored',            bg: 'Акаунтът е възстановен' },
  restoreFail:      { en: 'Failed to restore account',   bg: 'Неуспешно възстановяване' },
  cancelledToast:   { en: 'Subscription cancelled',      bg: 'Абонаментът е отказан' },
  cancelFail:       { en: 'Failed to cancel subscription', bg: 'Неуспешен отказ' },
  planUpdated:      { en: 'Plan updated',                bg: 'Планът е обновен' },
  planFail:         { en: 'Failed to update plan',       bg: 'Неуспешно обновяване' },
  refundedN:        { en: 'Refund of {amount} {currency} issued', bg: 'Възстановена сума {amount} {currency}' },
  refundFail:       { en: 'Failed to issue refund',      bg: 'Неуспешно възстановяване' },
  // Modal — cancel subscription
  cancelTitle:      { en: 'Cancel subscription?',        bg: 'Отказ на абонамент?' },
  cancelBody:       { en: 'The subscription will be cancelled at the end of the current billing period.', bg: 'Абонаментът ще бъде отказан в края на текущия период.' },
  keepActive:       { en: 'Keep active',                 bg: 'Запази' },
  yesCancel:        { en: 'Yes, cancel',                 bg: 'Да, откажи' },
  cancelling:       { en: 'Cancelling…',                 bg: 'Отказване…' },
  // Modal — change plan
  changePlanTitle:  { en: 'Change plan',                 bg: 'Смяна на план' },
  changePlanBody:   { en: 'Select a new plan.',          bg: 'Избери нов план.' },
  currentPlanLabel: { en: 'Current plan:',               bg: 'Текущ план:' },
  newPlanLabel:     { en: 'New plan',                    bg: 'Нов план' },
  saveChange:       { en: 'Save change',                 bg: 'Запази' },
  cancelBtn:        { en: 'Cancel',                      bg: 'Отказ' },
  // Modal — delete
  deleteTitle:      { en: 'Delete account?',             bg: 'Изтриване на акаунт?' },
  deleteBody:       { en: 'The account will be soft-deleted. History and transactions are preserved.', bg: 'Акаунтът ще бъде меко изтрит. Историята и транзакциите се запазват.' },
  reasonOpt:        { en: 'Reason (optional)',           bg: 'Причина (опционално)' },
  reasonPh:         { en: 'e.g. user request, fraud',   bg: 'напр. заявка от потребителя, измама' },
  yesDelete:        { en: 'Yes, delete',                 bg: 'Да, изтрий' },
  deleting:         { en: 'Deleting…',                   bg: 'Изтриване…' },
  // Modal — restore
  restoreTitle:     { en: 'Restore account?',            bg: 'Възстановяване на акаунт?' },
  restoreBody:      { en: 'The account will be restored and set back to ACTIVE.', bg: 'Акаунтът ще бъде възстановен и активиран.' },
  yesRestore:       { en: 'Yes, restore',                bg: 'Да, възстанови' },
  restoring:        { en: 'Restoring…',                  bg: 'Възстановяване…' },
  // Modal — refund
  refundTitle:      { en: 'Issue refund',                bg: 'Възстанови сума' },
  refundBody:       { en: 'Refund the latest Stripe payment. Leave amount empty to refund the full charge.', bg: 'Възстанови последното Stripe плащане. Остави сумата празна за пълно възстановяване.' },
  amountLabel:      { en: 'Amount',                      bg: 'Сума' },
  amountLabelCcy:   { en: 'Amount ({currency})',         bg: 'Сума ({currency})' },
  fullAmountPh:     { en: 'Full amount',                 bg: 'Цяла сума' },
  refundMaxHint:    { en: 'Max: {amount} {currency}',    bg: 'Макс: {amount} {currency}' },
  refundNoStripeSub:   { en: 'No Stripe subscription — nothing to refund.', bg: 'Няма Stripe абонамент — няма какво да се възстанови.' },
  refundNoPaymentId:   { en: 'No payment on file for this subscription — nothing to refund.', bg: 'Няма регистрирано плащане за този абонамент — няма какво да се възстанови.' },
  refundNoPayment:     { en: 'No captured payment found.', bg: 'Не е намерено осъществено плащане.' },
  refundAlreadyDone:   { en: 'Already fully refunded.',    bg: 'Вече е напълно възстановено.' },
  amountTooHigh:    { en: 'Amount exceeds the refundable maximum', bg: 'Сумата надвишава максимума' },
  amountPositive:   { en: 'Amount must be a positive number', bg: 'Сумата трябва да е положителна' },
  reasonLabel:      { en: 'Reason',                      bg: 'Причина' },
  reasonRequested:  { en: 'Requested by customer',       bg: 'По заявка на клиента' },
  reasonDuplicate:  { en: 'Duplicate charge',            bg: 'Дублирано плащане' },
  reasonFraud:      { en: 'Fraudulent',                  bg: 'Измама' },
  refundCta:        { en: 'Issue refund',                bg: 'Възстанови' },
  refunding:        { en: 'Refunding…',                  bg: 'Възстановяване…' },
  // Wallet section
  walletTitle:      { en: 'Wallet',                      bg: 'Портфейл' },
  walletAvailable:  { en: 'Available',                   bg: 'Налично' },
  walletLocked:     { en: 'Locked for payout',           bg: 'Заключен за изплащане' },
  walletTotal:      { en: 'Total balance',               bg: 'Общ баланс' },
  walletPending:    { en: 'Pending',                     bg: 'Изчаква' },
  noWallet:         { en: 'No wallet found',             bg: 'Няма намерен портфейл' },
  // Contact / identity
  ibanLabel:        { en: 'IBAN:',                       bg: 'IBAN:' },
  ibanNone:         { en: 'Not provided',                bg: 'Липсва' },
  // Subscriptions table
  subsTitle:        { en: 'Subscription history',        bg: 'История на абонаменти' },
  noSubs:           { en: 'No subscriptions found',      bg: 'Няма открити абонаменти' },
  colPlan:          { en: 'Plan',                        bg: 'План' },
  colStatus:        { en: 'Status',                      bg: 'Статус' },
  colPeriodEnds:    { en: 'Period ends',                 bg: 'Изтича на' },
  colAutoRenew:     { en: 'Auto-renew',                  bg: 'Подновяване' },
  colCancelled:     { en: 'Cancelled',                   bg: 'Отказан на' },
  colStarted:       { en: 'Started',                     bg: 'Започнат на' },
  yes:              { en: 'Yes',                         bg: 'Да' },
  no:               { en: 'No',                          bg: 'Не' },
  // Payment summary
  paymentsTitle:    { en: 'Payments',                    bg: 'Плащания' },
  payTotal:         { en: 'Total paid',                  bg: 'Общо платено' },
  payCount:         { en: 'Payment count',               bg: 'Брой плащания' },
  payLast:          { en: 'Last payment',                bg: 'Последно плащане' },
  payNone:          { en: 'No subscription payments on record', bg: 'Няма записани плащания' },
  // Cashback summary section (§4.4)
  cashbackTitle:    { en: 'Cashback',                    bg: 'Кешбек' },
  cashbackViewAll:  { en: 'View all entries →',          bg: 'Виж всички записи →' },
  noCashback:       { en: 'No cashback entries',         bg: 'Няма кешбек записи' },
  colEntries:       { en: 'Entries',                     bg: 'Записи' },
  colAmount:        { en: 'Amount',                      bg: 'Сума' },
  statusPending:    { en: 'Pending',                     bg: 'Изчакващ' },
  statusCleared:    { en: 'Cleared',                     bg: 'Одобрен' },
  statusLocked:     { en: 'Locked',                      bg: 'Заключен' },
  statusPaid:       { en: 'Paid',                        bg: 'Платен' },
  statusExpired:    { en: 'Expired',                     bg: 'Изтекъл' },
  statusVoided:     { en: 'Voided',                      bg: 'Анулиран' },
  colVoidReason:    { en: 'Reason',                      bg: 'Причина' },
  voidedEntriesTitle: { en: 'Voided cashback entries',   bg: 'Анулирани кешбек записи' },
  // Payout queue link
  payoutQueueTitle: { en: 'Payout queue',                bg: 'Опашка за изплащане' },
  payoutQueueView:  { en: 'View in payout queue →',      bg: 'Виж в опашка за изплащане →' },
  // Login history section (§4.1 — last activity detail)
  loginHistoryTitle:{ en: 'Login history',               bg: 'История на влизания' },
  colIp:            { en: 'IP address',                  bg: 'IP адрес' },
  colDevice:        { en: 'Device / browser',            bg: 'Устройство / браузър' },
  colResult:        { en: 'Result',                      bg: 'Резултат' },
  colDate:          { en: 'Date',                        bg: 'Дата' },
  loginSuccess:     { en: 'Success',                     bg: 'Успешно' },
  loginFail:        { en: 'Failed',                      bg: 'Неуспешно' },
  noHistory:        { en: 'No login records',            bg: 'Няма записи за влизания' },
  historyShowMore:  { en: 'Show more',                   bg: 'Покажи още' },
  colFailReason:    { en: 'Fail reason',                 bg: 'Причина за грешка' },
  loginHistoryCount:{ en: '{n} records',                 bg: '{n} записа' },
  // Transactions section (§4.3)
  txTitle:          { en: 'Transactions',                 bg: 'Транзакции' },
  txViewAll:        { en: 'View all transactions →',      bg: 'Виж всички транзакции →' },
  noTx:             { en: 'No transactions found',        bg: 'Няма открити транзакции' },
  colTxId:          { en: 'ID',                           bg: 'ID' },
  colPartner:       { en: 'Partner / Location',           bg: 'Партньор / Локация' },
  colCashback:      { en: 'Cashback',                     bg: 'Кешбек' },
  colMargin:        { en: 'Margin',                       bg: 'Марджин' },
  colRisk:          { en: 'Risk',                         bg: 'Риск' },
  colDateTime:      { en: 'Date / Time',                  bg: 'Дата / Час' },
} as const;

type I18NKey = keyof typeof I18N;
function tr(key: I18NKey, lang: Lang, vars?: Record<string, string | number>): string {
  let s: string = I18N[key]?.[lang] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/* ─── Palette ─────────────────────────────────────────────────────────────── */

/* ─── Layout ───────────────────────────────────────────────────────────────── */
const PageShell = styled.div`
  background: ${palette.bg};
  min-height: calc(100vh - 4rem);
  padding: 2rem 2.5rem;
`;

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: ${palette.textMuted};
  text-decoration: none;
  margin-bottom: 1.5rem;

  &:hover { color: ${palette.text}; }
`;

const PageHeader = styled.div`
  margin-bottom: 2rem;
`;

const ProfileCard = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.75rem;
  margin-bottom: 1.5rem;
`;

const ProfileTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
`;

const ProfileInfo = styled.div``;

const FullName = styled.h1`
  font-size: 1.5rem;
  font-weight: 800;
  color: ${palette.text};
  margin: 0 0 0.25rem;
`;

const ContactLine = styled.p`
  font-size: 0.9375rem;
  color: ${palette.textMuted};
  margin: 0.125rem 0;
`;

const BadgeRow = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
  flex-wrap: wrap;
  align-items: center;
`;

const MetaRow = styled.div`
  margin-top: 1rem;
  font-size: 0.8125rem;
  color: ${palette.textSubtle};
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const Btn = styled.button<{ $variant?: 'primary' | 'ghost' | 'danger' | 'warning' }>`
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
      return `background: ${palette.accent}; color: ${palette.onAccent}; border-color: ${palette.accent};
        &:hover { background: #b55a3b; } &:disabled { opacity: 0.55; cursor: not-allowed; }`;
    if ($variant === 'danger')
      return `background: ${palette.dangerSoft}; color: ${palette.danger}; border-color: ${palette.danger};
        &:hover { background: ${palette.dangerBorder}; } &:disabled { opacity: 0.55; cursor: not-allowed; }`;
    if ($variant === 'warning')
      return `background: ${palette.warningSoft}; color: ${palette.warning}; border-color: ${palette.warning};
        &:hover { background: ${palette.warningBorder}; } &:disabled { opacity: 0.55; cursor: not-allowed; }`;
    return `background: ${palette.surface}; color: ${palette.textMuted}; border-color: ${palette.border};
      &:hover { background: ${palette.bg}; color: ${palette.text}; }
      &:disabled { opacity: 0.55; cursor: not-allowed; }`;
  }}
`;

const SectionCard = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
`;

const SectionTitle = styled.h2`
  font-size: 1rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 1.25rem;
`;

const SectionSubtitle = styled.p`
  font-size: 0.8125rem;
  color: ${palette.textSubtle};
  margin: -0.75rem 0 1rem;
`;

const WalletGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
  gap: 1rem;
`;

const WalletItem = styled.div`
  background: ${palette.bg};
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  padding: 0.875rem 1rem;
`;

const WalletLabel = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${palette.textSubtle};
  margin-bottom: 0.25rem;
`;

const WalletValue = styled.div`
  font-size: 1.25rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: ${palette.text};
`;

const WalletUnit = styled.span`
  font-size: 0.75rem;
  font-weight: 500;
  color: ${palette.textSubtle};
  margin-left: 0.25rem;
`;

const SubTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
`;

const Th = styled.th`
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${palette.textSubtle};
  padding: 0 0.75rem 0.75rem;
  border-bottom: 1px solid ${palette.border};

  &:first-child { padding-left: 0; }
`;

const Td = styled.td`
  padding: 0.75rem;
  border-bottom: 1px solid ${palette.border};
  color: ${palette.textMuted};
  vertical-align: middle;

  &:first-child { padding-left: 0; }
`;

const EmptyState = styled.p`
  color: ${palette.textSubtle};
  font-size: 0.875rem;
  text-align: center;
  padding: 2rem 0;
  margin: 0;
`;

const Spinner = styled.div`
  color: ${palette.textSubtle};
  font-size: 0.875rem;
  padding: 3rem 0;
  text-align: center;
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

/* ─── Badges ───────────────────────────────────────────────────────────────── */
const UserStatusBadge = styled.span<{ $status: UserAccountStatus }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.2rem 0.6rem;

  ${({ $status }) => {
    if ($status === 'ACTIVE') return `background: ${palette.successSoft}; color: ${palette.success};`;
    if ($status === 'SUSPENDED') return `background: ${palette.warningSoft}; color: ${palette.warning};`;
    if ($status === 'DELETED') return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
    if ($status === 'PENDING_PAYMENT') return `background: ${palette.infoSoft}; color: ${palette.info};`;
    if ($status === 'PENDING_VERIFICATION') return `background: ${palette.infoSoft}; color: ${palette.info};`;
    return `background: ${palette.surfaceAlt}; color: ${palette.textMuted};`;
  }}
`;

const RiskBadge = styled.span<{ $level: RiskLevel }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 9999px;
  padding: 0.2rem 0.6rem;

  ${({ $level }) => {
    if ($level === 'low') return `background: ${palette.successSoft}; color: ${palette.success};`;
    if ($level === 'medium') return `background: ${palette.warningSoft}; color: ${palette.warning};`;
    return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
  }}
`;

const PlanBadge = styled.span<{ $plan: SubscriptionPlan }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.2rem 0.6rem;
  white-space: nowrap;

  ${({ $plan }) => {
    switch ($plan) {
      case 'PREMIUM': return `background: ${palette.amberSoft}; color: ${palette.amber};`;
      case 'BASIC':   return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'LIGHT':   return `background: ${palette.tealSoft}; color: ${palette.teal};`;
      default:        return `background: ${palette.surfaceAlt}; color: ${palette.textMuted};`;
    }
  }}
`;

const SubStatusBadge = styled.span<{ $status: SubscriptionStatus }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.2rem 0.6rem;
  white-space: nowrap;

  ${({ $status }) => {
    switch ($status) {
      case 'ACTIVE':
      case 'TRIALING':           return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'PAST_DUE':
      case 'UNPAID':             return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'FAILED_PAYMENT':    return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      case 'INCOMPLETE':         return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'INCOMPLETE_EXPIRED': return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      case 'EXPIRED':            return `background: ${palette.purpleSoft}; color: ${palette.purple};`;
      case 'PAUSED':             return `background: ${palette.surfaceAlt}; color: ${palette.text};`;
      case 'CANCELLED':
      default:                   return `background: ${palette.surfaceAlt}; color: ${palette.textMuted};`;
    }
  }}
`;

type RefundReason = 'duplicate' | 'fraudulent' | 'requested_by_customer';
const REFUND_REASONS: Array<{ value: RefundReason; key: I18NKey }> = [
  { value: 'requested_by_customer', key: 'reasonRequested' },
  { value: 'duplicate',             key: 'reasonDuplicate' },
  { value: 'fraudulent',            key: 'reasonFraud' },
];

const PLAN_CHOICES: SubscriptionPlan[] = ['LIGHT', 'BASIC', 'PREMIUM'];

const CASHBACK_STATUSES = ['Pending', 'Cleared', 'Locked', 'Paid', 'Expired', 'Voided'] as const;
type CashbackStatus = typeof CASHBACK_STATUSES[number];

/* ─── Component ───────────────────────────────────────────────────────────── */
export default function AdminSubscriberDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const { language } = useLanguage();
  const { currencyDisplayMode } = useCurrencyDisplay();
  const queryClient = useQueryClient();
  const locale = language === 'bg' ? 'bg-BG' : 'en-GB';
  const lang: 'en' | 'bg' = language === 'bg' ? 'bg' : 'en';

  const T = (key: I18NKey, vars?: Record<string, string | number>) => tr(key, lang, vars);

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Format amount using the current currency display mode
  const fmtAmount = (amount: number) => formatMoneyByMode(amount, currencyDisplayMode, language);

  /* ── Modal state ── */
  const [showCancelSub, setShowCancelSub]         = useState(false);
  const [showChangePlan, setShowChangePlan]       = useState(false);
  const [newPlan, setNewPlan]                     = useState<SubscriptionPlan>('BASIC');
  const [showDelete, setShowDelete]               = useState(false);
  const [deleteReason, setDeleteReason]           = useState('');
  const [showRestore, setShowRestore]             = useState(false);
  const [showRefund, setShowRefund]               = useState(false);
  const [refundAmount, setRefundAmount]           = useState('');
  const [refundReason, setRefundReason]           = useState<RefundReason>('requested_by_customer');
  const [showSuspend, setShowSuspend]             = useState(false);
  const [showActivate, setShowActivate]           = useState(false);
  const [showForceLogout, setShowForceLogout]     = useState(false);
  const [loginHistoryLimit, setLoginHistoryLimit] = useState(20);

  /* ── Data queries ── */
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-subscriber-detail', userId],
    queryFn: () => adminSubscribersService.getSubscriber(userId!),
    enabled: !!userId,
  });

  const { data: historyData } = useQuery({
    queryKey: ['admin-subscription-history', userId],
    queryFn: () => adminSubscriptionsService.getUserHistory(userId!),
    enabled: !!userId,
  });

  const { data: refundPreview, isLoading: refundPreviewLoading } = useQuery({
    queryKey: ['subscriber-refund-preview', userId],
    queryFn: () => adminSubscribersService.refundPreview(userId!),
    enabled: showRefund,
    staleTime: 60_000,
  });

  const { data: loginHistory } = useQuery({
    queryKey: ['subscriber-login-history', userId, loginHistoryLimit],
    queryFn: () => adminSubscribersService.getLoginHistory(userId!, 1, loginHistoryLimit),
    enabled: !!userId,
  });

  // Fetch the latest business transactions for this subscriber (§4.3).
  const { data: subscriberTx } = useQuery({
    queryKey: ['subscriber-transactions', userId],
    queryFn: () => adminTransactionsService.listBusiness({ userId: userId!, limit: 5, page: 1 }),
    enabled: !!userId,
  });

  // Fetch cashback entries for this subscriber via the dedicated endpoint.
  const { data: cashbackEntries } = useQuery({
    queryKey: ['subscriber-cashback-entries', userId],
    queryFn: async () => {
      const res = await apiService.get<{ success: boolean; data: Array<{ status: string; amount: number }>; total: number }>(
        `/admin/subscribers/${userId}/cashback`,
        { page: 1, limit: 100 },
      );
      return res;
    },
    enabled: !!userId,
  });

  /* ── Mutations ── */
  const suspendMutation = useMutation({
    mutationFn: (status: 'ACTIVE' | 'SUSPENDED') =>
      adminSubscribersService.suspendSubscriber(userId!, status),
    onSuccess: (_, status) => {
      toast.success(T(status === 'SUSPENDED' ? 'acctSuspended' : 'acctActivated'));
      setShowSuspend(false);
      setShowActivate(false);
      queryClient.invalidateQueries({ queryKey: ['admin-subscriber-detail', userId] });
      queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] });
    },
    onError: () => toast.error(T('statusFail')),
  });

  const forceLogoutMutation = useMutation({
    mutationFn: () => adminSubscribersService.forceLogout(userId!),
    onSuccess: (res) => {
      setShowForceLogout(false);
      if (res.revokedCount === 0) {
        toast(T('revokedNone'), { icon: 'ℹ️' });
      } else {
        toast.success(T('revokedN', { n: res.revokedCount }));
      }
      queryClient.invalidateQueries({ queryKey: ['subscriber-login-history', userId] });
    },
    onError: () => toast.error(T('revokeFail')),
  });

  const cancelSubMutation = useMutation({
    mutationFn: () => adminSubscribersService.cancelSubscription(userId!),
    onSuccess: () => {
      toast.success(T('cancelledToast'));
      queryClient.invalidateQueries({ queryKey: ['admin-subscriber-detail', userId] });
      queryClient.invalidateQueries({ queryKey: ['admin-subscription-history', userId] });
      queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] });
      setShowCancelSub(false);
    },
    onError: () => toast.error(T('cancelFail')),
  });

  const changePlanMutation = useMutation({
    mutationFn: (plan: SubscriptionPlan) => adminSubscribersService.changePlan(userId!, plan),
    onSuccess: () => {
      toast.success(T('planUpdated'));
      queryClient.invalidateQueries({ queryKey: ['admin-subscriber-detail', userId] });
      queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] });
      setShowChangePlan(false);
    },
    onError: () => toast.error(T('planFail')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminSubscribersService.deleteAccount(userId!, deleteReason || undefined),
    onSuccess: () => {
      toast.success(T('acctDeleted'));
      queryClient.invalidateQueries({ queryKey: ['admin-subscriber-detail', userId] });
      queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] });
      setShowDelete(false);
      setDeleteReason('');
    },
    onError: () => toast.error(T('deleteFail')),
  });

  const restoreMutation = useMutation({
    mutationFn: () => adminSubscribersService.restoreAccount(userId!),
    onSuccess: () => {
      toast.success(T('acctRestored'));
      queryClient.invalidateQueries({ queryKey: ['admin-subscriber-detail', userId] });
      queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] });
      setShowRestore(false);
    },
    onError: () => toast.error(T('restoreFail')),
  });

  const refundMutation = useMutation({
    mutationFn: () => {
      const parsed = refundAmount ? parseFloat(refundAmount) : undefined;
      return adminSubscribersService.refund(userId!, { amount: parsed, reason: refundReason });
    },
    onSuccess: (res) => {
      toast.success(T('refundedN', { amount: res.amount.toFixed(2), currency: res.currency.toUpperCase() }));
      setShowRefund(false);
      setRefundAmount('');
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error ?? T('refundFail')),
  });

  if (isLoading) return <PageShell><Spinner>{T('loading')}</Spinner></PageShell>;
  if (isError || !data) return <PageShell><Spinner>{T('loadFail')}</Spinner></PageShell>;

  const accountStatus: UserAccountStatus = data.deletedAt ? 'DELETED' : data.status;
  const isDeleted = !!data.deletedAt;
  const fullName =
    data.firstName || data.lastName
      ? `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim()
      : data.email;

  const sortedSubs = [...data.subscriptions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Latest non-terminal subscription for action button visibility
  const activeSub = sortedSubs.find(
    (s) => !['CANCELLED', 'EXPIRED', 'INCOMPLETE_EXPIRED'].includes(s.status),
  ) ?? null;

  // Cashback status breakdown
  const cashbackByStatus: Record<CashbackStatus, { count: number; amount: number }> = {
    Pending: { count: 0, amount: 0 },
    Cleared: { count: 0, amount: 0 },
    Locked:  { count: 0, amount: 0 },
    Paid:    { count: 0, amount: 0 },
    Expired: { count: 0, amount: 0 },
    Voided:  { count: 0, amount: 0 },
  };
  // Spec §4.4 v1.1 — surface Voided entries with their reason for transparency/audit.
  const voidedEntries: Array<{ id: string; amount: number; voidedReason: string | null; voidedAt: string | null; createdAt: string }> = [];
  if (cashbackEntries?.data) {
    for (const e of cashbackEntries.data) {
      const s = e.status as CashbackStatus;
      if (cashbackByStatus[s]) {
        cashbackByStatus[s].count++;
        cashbackByStatus[s].amount += e.amount;
      }
      if (s === 'Voided') {
        voidedEntries.push({
          id: (e as any).id,
          amount: e.amount,
          voidedReason: (e as any).voidedReason ?? null,
          voidedAt: (e as any).voidedAt ?? null,
          createdAt: (e as any).createdAt ?? null,
        });
      }
    }
  }
  const hasCashback = cashbackEntries && cashbackEntries.total > 0;

  return (
    <PageShell>
      {/* ── Cancel subscription modal ── */}
      {showCancelSub && (
        <Overlay onClick={() => !cancelSubMutation.isPending && setShowCancelSub(false)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{T('cancelTitle')}</ModalTitle>
            <ModalBody>{T('cancelBody')}</ModalBody>
            <ModalActions>
              <Btn onClick={() => setShowCancelSub(false)}>{T('keepActive')}</Btn>
              <Btn $variant="danger" onClick={() => cancelSubMutation.mutate()} disabled={cancelSubMutation.isPending}>
                {cancelSubMutation.isPending ? T('cancelling') : T('yesCancel')}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* ── Change plan modal ── */}
      {showChangePlan && (
        <Overlay onClick={() => setShowChangePlan(false)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{T('changePlanTitle')}</ModalTitle>
            <ModalBody>
              {T('changePlanBody')}
              {activeSub && (
                <> {T('currentPlanLabel')}{' '}
                  <PlanBadge $plan={activeSub.plan}>{planLabel(activeSub.plan, lang)}</PlanBadge>
                </>
              )}
            </ModalBody>
            <div>
              <ModalLabel>{T('newPlanLabel')}</ModalLabel>
              <ModalSelect value={newPlan} onChange={(e) => setNewPlan(e.target.value as SubscriptionPlan)}>
                {PLAN_CHOICES.map((p) => (
                  <option key={p} value={p}>{planLabel(p, lang)}</option>
                ))}
              </ModalSelect>
            </div>
            <ModalActions>
              <Btn onClick={() => setShowChangePlan(false)}>{T('cancelBtn')}</Btn>
              <Btn
                $variant="primary"
                onClick={() => changePlanMutation.mutate(newPlan)}
                disabled={changePlanMutation.isPending || newPlan === activeSub?.plan}
              >
                {changePlanMutation.isPending ? T('saving') : T('saveChange')}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* ── Delete account modal ── */}
      {showDelete && (
        <Overlay onClick={() => !deleteMutation.isPending && setShowDelete(false)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{T('deleteTitle')}</ModalTitle>
            <ModalBody>{T('deleteBody')}</ModalBody>
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
              <Btn onClick={() => setShowDelete(false)}>{T('cancelBtn')}</Btn>
              <Btn $variant="danger" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? T('deleting') : T('yesDelete')}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* ── Restore account modal ── */}
      {showRestore && (
        <Overlay onClick={() => !restoreMutation.isPending && setShowRestore(false)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{T('restoreTitle')}</ModalTitle>
            <ModalBody>{T('restoreBody')}</ModalBody>
            <ModalActions>
              <Btn onClick={() => setShowRestore(false)}>{T('cancelBtn')}</Btn>
              <Btn $variant="primary" onClick={() => restoreMutation.mutate()} disabled={restoreMutation.isPending}>
                {restoreMutation.isPending ? T('restoring') : T('yesRestore')}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* ── Refund modal ── */}
      {showRefund && (
        <Overlay onClick={() => !refundMutation.isPending && setShowRefund(false)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{T('refundTitle')}</ModalTitle>
            <ModalBody>{T('refundBody')}</ModalBody>
            {refundPreview && !refundPreview.refundable && (
              <ModalBody style={{ color: palette.danger, marginTop: '-1rem' }}>
                {T(
                  refundPreview.reason === 'no_stripe_subscription' ? 'refundNoStripeSub'
                    : refundPreview.reason === 'no_payment_intent_id' ? 'refundNoPaymentId'
                    : refundPreview.reason === 'already_refunded' ? 'refundAlreadyDone'
                    : 'refundNoPayment',
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
                disabled={refundPreviewLoading || refundPreview?.refundable === false}
              />
              {refundPreview && refundPreview.refundable && (
                <div style={{ fontSize: '0.75rem', color: palette.textSubtle, marginTop: '-1.25rem', marginBottom: '1.5rem' }}>
                  {T('refundMaxHint', { amount: refundPreview.amount.toFixed(2), currency: refundPreview.currency })}
                </div>
              )}
            </div>
            <div>
              <ModalLabel>{T('reasonLabel')}</ModalLabel>
              <ModalSelect value={refundReason} onChange={(e) => setRefundReason(e.target.value as RefundReason)}>
                {REFUND_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{T(r.key)}</option>
                ))}
              </ModalSelect>
            </div>
            <ModalActions>
              <Btn onClick={() => setShowRefund(false)}>{T('cancelBtn')}</Btn>
              <Btn
                $variant="danger"
                onClick={() => {
                  const parsed = refundAmount ? parseFloat(refundAmount) : undefined;
                  if (parsed !== undefined && (!Number.isFinite(parsed) || parsed <= 0)) {
                    toast.error(T('amountPositive'));
                    return;
                  }
                  if (parsed !== undefined && refundPreview?.refundable && parsed > refundPreview.amount) {
                    toast.error(T('amountTooHigh'));
                    return;
                  }
                  refundMutation.mutate();
                }}
                disabled={refundMutation.isPending || refundPreview?.refundable === false}
              >
                {refundMutation.isPending ? T('refunding') : T('refundCta')}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* ── Suspend account modal ── */}
      {showSuspend && (
        <Overlay onClick={() => !suspendMutation.isPending && setShowSuspend(false)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{T('suspendTitle')}</ModalTitle>
            <ModalBody>{T('suspendBody', { name: fullName })}</ModalBody>
            <ModalActions>
              <Btn onClick={() => setShowSuspend(false)}>{T('cancelBtn')}</Btn>
              <Btn
                $variant="warning"
                disabled={suspendMutation.isPending}
                onClick={() => suspendMutation.mutate('SUSPENDED')}
              >
                {suspendMutation.isPending ? T('suspending') : T('yesSuspend')}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* ── Activate account modal ── */}
      {showActivate && (
        <Overlay onClick={() => !suspendMutation.isPending && setShowActivate(false)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{T('activateTitle')}</ModalTitle>
            <ModalBody>{T('activateBody', { name: fullName })}</ModalBody>
            <ModalActions>
              <Btn onClick={() => setShowActivate(false)}>{T('cancelBtn')}</Btn>
              <Btn
                $variant="primary"
                disabled={suspendMutation.isPending}
                onClick={() => suspendMutation.mutate('ACTIVE')}
              >
                {suspendMutation.isPending ? T('activating') : T('yesActivate')}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* ── Force logout modal ── */}
      {showForceLogout && (
        <Overlay onClick={() => !forceLogoutMutation.isPending && setShowForceLogout(false)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{T('forceLogoutTitle')}</ModalTitle>
            <ModalBody>{T('forceLogoutBody', { name: fullName })}</ModalBody>
            <ModalActions>
              <Btn onClick={() => setShowForceLogout(false)}>{T('cancelBtn')}</Btn>
              <Btn
                $variant="danger"
                disabled={forceLogoutMutation.isPending}
                onClick={() => forceLogoutMutation.mutate()}
              >
                {forceLogoutMutation.isPending ? T('revoking2') : T('yesRevoke')}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      <PageHeader>
        <BackLink to="/admin/subscribers/all">{T('backAll')}</BackLink>
      </PageHeader>

      {/* ── Profile header ── */}
      <ProfileCard>
        <ProfileTop>
          <ProfileInfo>
            <FullName>{fullName}</FullName>
            <ContactLine>{data.email}</ContactLine>
            {data.phone && <ContactLine>{formatPhoneBG(data.phone)}</ContactLine>}
            <ContactLine>
              <span style={{ color: palette.textSubtle, fontSize: '0.8125rem', fontWeight: 600 }}>{T('ibanLabel')}</span>{' '}
              {data.iban ? (
                <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{data.iban}</span>
              ) : (
                <span style={{ color: palette.textSubtle, fontSize: '0.875rem', fontStyle: 'italic' }}>{T('ibanNone')}</span>
              )}
            </ContactLine>
            <BadgeRow>
              <UserStatusBadge $status={accountStatus}>{userStatusLabel(accountStatus, lang)}</UserStatusBadge>
              {data.riskScore != null && (
                <RiskBadge $level={getRiskLevel(data.riskScore)}>
                  {T('risk')}: {riskLabel(data.riskScore, lang)} ({data.riskScore})
                </RiskBadge>
              )}
            </BadgeRow>
            <MetaRow>
              {T('joined')} {fmt(data.createdAt)}
              {data.lastActivityAt && <> · {T('lastActivity')} {fmt(data.lastActivityAt)}</>}
              {data.lastLoginAt && <> · {T('lastLogin')} {fmt(data.lastLoginAt)}</>}
            </MetaRow>
          </ProfileInfo>

          <ActionButtons>
            {isDeleted ? (
              <Btn $variant="primary" disabled={restoreMutation.isPending} onClick={() => setShowRestore(true)}>
                {T('restoreAcct')}
              </Btn>
            ) : (
              <>
                {/* Subscription actions — only for non-terminal active subscriptions */}
                {activeSub && (
                  <>
                    <Btn
                      $variant="ghost"
                      onClick={() => {
                        setNewPlan(activeSub.plan);
                        setShowChangePlan(true);
                      }}
                    >
                      {T('changePlan')}
                    </Btn>
                    <Btn $variant="ghost" onClick={() => setShowCancelSub(true)}>
                      {T('cancelSub')}
                    </Btn>
                    <Btn $variant="ghost" onClick={() => { setRefundAmount(''); setRefundReason('requested_by_customer'); setShowRefund(true); }}>
                      {T('refund')}
                    </Btn>
                  </>
                )}
                {/* Account status toggle — only for ACTIVE or SUSPENDED */}
                {data.status === 'ACTIVE' ? (
                  <Btn $variant="warning" disabled={suspendMutation.isPending} onClick={() => setShowSuspend(true)}>
                    {T('suspendAcct')}
                  </Btn>
                ) : data.status === 'SUSPENDED' ? (
                  <Btn $variant="primary" disabled={suspendMutation.isPending} onClick={() => setShowActivate(true)}>
                    {T('activateAcct')}
                  </Btn>
                ) : null}
                <Btn $variant="ghost" disabled={forceLogoutMutation.isPending} onClick={() => setShowForceLogout(true)}>
                  {T('forceLogout')}
                </Btn>
                <Btn $variant="danger" onClick={() => setShowDelete(true)}>
                  {T('deleteAcct')}
                </Btn>
              </>
            )}
          </ActionButtons>
        </ProfileTop>
      </ProfileCard>

      {/* ── Wallet ── */}
      <SectionCard>
        <SectionTitle>{T('walletTitle')}</SectionTitle>
        {data.wallet ? (
          <WalletGrid>
            <WalletItem>
              <WalletLabel>{T('walletAvailable')}</WalletLabel>
              <WalletValue>
                {fmtAmount(data.wallet.availableBalance)}
              </WalletValue>
            </WalletItem>
            {(data.wallet.balance - data.wallet.availableBalance) > 0 && (
              <WalletItem>
                <WalletLabel>{T('walletLocked')}</WalletLabel>
                <WalletValue>
                  {fmtAmount(data.wallet.balance - data.wallet.availableBalance)}
                </WalletValue>
              </WalletItem>
            )}
            <WalletItem>
              <WalletLabel>{T('walletPending')}</WalletLabel>
              <WalletValue>
                {fmtAmount(data.wallet.pendingBalance)}
              </WalletValue>
            </WalletItem>
            <WalletItem>
              <WalletLabel>{T('walletTotal')}</WalletLabel>
              <WalletValue>
                {fmtAmount(Math.max(data.wallet.balance, data.wallet.availableBalance) + data.wallet.pendingBalance)}
              </WalletValue>
            </WalletItem>
          </WalletGrid>
        ) : (
          <EmptyState>{T('noWallet')}</EmptyState>
        )}
      </SectionCard>

      {/* ── Payments (§4.2) ── */}
      <SectionCard>
        <SectionTitle>{T('paymentsTitle')}</SectionTitle>
        {historyData?.paymentSummary && historyData.paymentSummary.count > 0 ? (
          <WalletGrid>
            <WalletItem>
              <WalletLabel>{T('payTotal')}</WalletLabel>
              <WalletValue>
                {fmtAmount(historyData.paymentSummary.totalAmount)}
              </WalletValue>
            </WalletItem>
            <WalletItem>
              <WalletLabel>{T('payCount')}</WalletLabel>
              <WalletValue>{historyData.paymentSummary.count}</WalletValue>
            </WalletItem>
            {historyData.paymentSummary.lastPaymentAt && (
              <WalletItem>
                <WalletLabel>{T('payLast')}</WalletLabel>
                <WalletValue style={{ fontSize: '1rem' }}>{fmt(historyData.paymentSummary.lastPaymentAt)}</WalletValue>
              </WalletItem>
            )}
          </WalletGrid>
        ) : (
          <EmptyState>{T('payNone')}</EmptyState>
        )}
      </SectionCard>

      {/* ── Transactions (§4.3) ── */}
      <SectionCard>
        <SectionTitle>{T('txTitle')}</SectionTitle>
        {!subscriberTx ? (
          <EmptyState>…</EmptyState>
        ) : subscriberTx.transactions.length === 0 ? (
          <EmptyState>{T('noTx')}</EmptyState>
        ) : (
          <>
            <SubTable>
              <thead>
                <tr>
                  <Th>{T('colTxId')}</Th>
                  <Th>{T('colPartner')}</Th>
                  <Th style={{ textAlign: 'right' }}>{T('colAmount')}</Th>
                  <Th style={{ textAlign: 'right' }}>{T('colCashback')}</Th>
                  <Th style={{ textAlign: 'right' }}>{T('colMargin')}</Th>
                  <Th style={{ textAlign: 'center' }}>{T('colRisk')}</Th>
                  <Th>{T('colDateTime')}</Th>
                </tr>
              </thead>
              <tbody>
                {subscriberTx.transactions.map((tx: BusinessTransaction) => (
                  <tr key={tx.id}>
                    <Td style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                      {tx.id.slice(0, 8)}…
                    </Td>
                    <Td>
                      {tx.partner ? (
                        <>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: palette.text }}>{tx.partner.businessName}</div>
                          {tx.venue && <div style={{ fontSize: '0.75rem', color: palette.textSubtle }}>{tx.venue.name}</div>}
                        </>
                      ) : '—'}
                    </Td>
                    <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: palette.text }}>
                      {fmtAmount(tx.amount)}
                    </Td>
                    <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: tx.cashbackAmount ? palette.success : palette.textSubtle }}>
                      {tx.cashbackAmount != null ? fmtAmount(tx.cashbackAmount) : '—'}
                    </Td>
                    <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: palette.textMuted }}>
                      {tx.margin != null ? fmtAmount(tx.margin) : '—'}
                    </Td>
                    <Td style={{ textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-flex',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        borderRadius: '9999px',
                        padding: '0.15rem 0.5rem',
                        ...(getRiskLevel(tx.riskScore) === 'low'
                          ? { background: palette.successSoft, color: palette.success }
                          : getRiskLevel(tx.riskScore) === 'medium'
                          ? { background: palette.warningSoft, color: palette.warning }
                          : { background: palette.dangerSoft, color: palette.danger }),
                      }}>
                        {tx.riskScore}
                      </span>
                    </Td>
                    <Td style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                      {fmtDateTime(tx.createdAt)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </SubTable>
            {subscriberTx.total > 5 && (
              <div style={{ marginTop: '1rem' }}>
                <Link
                  to={`/admin/subscribers/transactions?search=${encodeURIComponent(data.email)}`}
                  style={{ color: palette.accent, fontWeight: 600, fontSize: '0.9rem' }}
                >
                  {T('txViewAll')}
                </Link>
              </div>
            )}
          </>
        )}
      </SectionCard>

      {/* ── Cashback summary (§4.4) ── */}
      <SectionCard>
        <SectionTitle>{T('cashbackTitle')}</SectionTitle>
        {cashbackEntries === undefined ? (
          <EmptyState>…</EmptyState>
        ) : !hasCashback ? (
          <EmptyState>{T('noCashback')}</EmptyState>
        ) : (
          <>
            <SubTable>
              <thead>
                <tr>
                  <Th>{T('colStatus')}</Th>
                  <Th style={{ textAlign: 'right' }}>{T('colEntries')}</Th>
                  <Th style={{ textAlign: 'right' }}>{T('colAmount')}</Th>
                </tr>
              </thead>
              <tbody>
                {CASHBACK_STATUSES.map((s) => {
                  const row = cashbackByStatus[s];
                  if (row.count === 0) return null;
                  return (
                    <tr key={s}>
                      <Td>
                        <span style={{
                          display: 'inline-flex',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          borderRadius: '0.375rem',
                          padding: '0.15rem 0.45rem',
                          background: s === 'Cleared' ? palette.successSoft : s === 'Pending' ? palette.infoSoft : s === 'Locked' ? palette.warningSoft : s === 'Paid' ? palette.tealSoft : s === 'Voided' ? palette.dangerSoft : palette.surfaceAlt,
                          color: s === 'Cleared' ? palette.success : s === 'Pending' ? palette.info : s === 'Locked' ? palette.warning : s === 'Paid' ? palette.teal : s === 'Voided' ? palette.danger : palette.textMuted,
                          textDecoration: s === 'Voided' ? 'line-through' : 'none',
                        }}>
                          {T(('status' + s) as I18NKey)}
                        </span>
                      </Td>
                      <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.count}</Td>
                      <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(row.amount)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </SubTable>
            {cashbackEntries.total > 100 && (
              <p style={{ fontSize: '0.8125rem', color: palette.textSubtle, marginTop: '0.75rem', marginBottom: 0 }}>
                Showing first 100 of {cashbackEntries.total} entries.
              </p>
            )}

            {/* Spec §4.4 v1.1 — voided entries get an explicit, transparent
                listing with the reason. Audit trail (decider, timestamp) lives
                in AuditLog; this view is the user-visible summary. */}
            {voidedEntries.length > 0 && (
              <div style={{ marginTop: '1.25rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: palette.text, marginBottom: '0.5rem' }}>
                  {T('voidedEntriesTitle')}
                </div>
                <SubTable>
                  <thead>
                    <tr>
                      <Th>{T('colAmount')}</Th>
                      <Th>{T('colVoidReason')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {voidedEntries.slice(0, 10).map((v) => (
                      <tr key={v.id}>
                        <Td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtAmount(v.amount)}</Td>
                        <Td style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>{v.voidedReason ?? '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </SubTable>
                {voidedEntries.length > 10 && (
                  <p style={{ fontSize: '0.8125rem', color: palette.textSubtle, marginTop: '0.5rem', marginBottom: 0 }}>
                    +{voidedEntries.length - 10}
                  </p>
                )}
              </div>
            )}

            <div style={{ marginTop: '1rem' }}>
              <Link
                to={`/admin/subscribers/cashback?search=${encodeURIComponent(data.email)}`}
                style={{ color: palette.accent, fontWeight: 600, fontSize: '0.9rem' }}
              >
                {T('cashbackViewAll')}
              </Link>
            </div>
          </>
        )}
      </SectionCard>

      {/* ── Payout queue (§6.1) ── */}
      <SectionCard>
        <SectionTitle>{T('payoutQueueTitle')}</SectionTitle>
        <Link
          to={`/admin/finance/payouts?search=${encodeURIComponent(data.email)}`}
          style={{ color: palette.accent, fontWeight: 600, fontSize: '0.9rem' }}
        >
          {T('payoutQueueView')}
        </Link>
      </SectionCard>

      {/* ── Subscription history (§4.2) ── */}
      <SectionCard>
        <SectionTitle>{T('subsTitle')}</SectionTitle>
        {sortedSubs.length === 0 ? (
          <EmptyState>{T('noSubs')}</EmptyState>
        ) : (
          <SubTable>
            <thead>
              <tr>
                <Th>{T('colPlan')}</Th>
                <Th>{T('colStatus')}</Th>
                <Th>{T('colPeriodEnds')}</Th>
                <Th>{T('colAutoRenew')}</Th>
                <Th>{T('colCancelled')}</Th>
                <Th>{T('colStarted')}</Th>
              </tr>
            </thead>
            <tbody>
              {sortedSubs.map((sub) => (
                <tr key={sub.id}>
                  <Td><PlanBadge $plan={sub.plan}>{planLabel(sub.plan, lang)}</PlanBadge></Td>
                  <Td><SubStatusBadge $status={sub.status}>{subStatusLabel(sub.status, lang)}</SubStatusBadge></Td>
                  <Td>{fmt(sub.currentPeriodEnd)}</Td>
                  <Td style={{ color: sub.autoRenewal ? palette.success : palette.textSubtle, fontWeight: 600 }}>
                    {sub.autoRenewal ? T('yes') : T('no')}
                  </Td>
                  <Td>{fmt(sub.canceledAt)}</Td>
                  <Td>{fmt(sub.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </SubTable>
        )}
      </SectionCard>

      {/* ── Login history (§4.1 — last activity detail) ── */}
      <SectionCard>
        <SectionTitle>{T('loginHistoryTitle')}</SectionTitle>
        <SectionSubtitle>
          {loginHistory ? T('loginHistoryCount', { n: loginHistory.total }) : ''}
        </SectionSubtitle>
        {!loginHistory || loginHistory.history.length === 0 ? (
          <EmptyState>{T('noHistory')}</EmptyState>
        ) : (
          <>
            <SubTable>
              <thead>
                <tr>
                  <Th>{T('colDate')}</Th>
                  <Th>{T('colResult')}</Th>
                  <Th>{T('colIp')}</Th>
                  <Th>{T('colDevice')}</Th>
                </tr>
              </thead>
              <tbody>
                {loginHistory.history.map((entry) => (
                  <tr key={entry.id}>
                    <Td style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>{fmtDateTime(entry.createdAt)}</Td>
                    <Td>
                      <span style={{
                        display: 'inline-flex',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        borderRadius: '0.375rem',
                        padding: '0.15rem 0.45rem',
                        background: entry.success ? palette.successSoft : palette.dangerSoft,
                        color: entry.success ? palette.success : palette.danger,
                      }}>
                        {entry.success ? T('loginSuccess') : T('loginFail')}
                      </span>
                      {!entry.success && entry.failReason && (
                        <span style={{ display: 'block', fontSize: '0.7rem', color: palette.textSubtle, marginTop: '0.2rem', fontStyle: 'italic' }}>
                          {entry.failReason}
                        </span>
                      )}
                    </Td>
                    <Td style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>{entry.ip ?? '—'}</Td>
                    <Td style={{ fontSize: '0.8125rem', maxWidth: '14rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.userAgent ?? '—'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </SubTable>
            {loginHistory.total > loginHistoryLimit && (
              <div style={{ marginTop: '1rem' }}>
                <Btn onClick={() => setLoginHistoryLimit((l) => l + 20)}>
                  {T('historyShowMore')}
                </Btn>
              </div>
            )}
          </>
        )}
      </SectionCard>
    </PageShell>
  );
}
