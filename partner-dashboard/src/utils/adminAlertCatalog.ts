import type React from 'react';
import {
  BellAlertIcon,
  UserPlusIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  UserGroupIcon,
  BuildingStorefrontIcon,
  CheckBadgeIcon,
  DocumentMagnifyingGlassIcon,
  ReceiptPercentIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  CommandLineIcon,
  KeyIcon,
  ChatBubbleBottomCenterTextIcon,
} from '@heroicons/react/24/outline';

// Spec §3.2 — title translations keyed by alert.id from adminAlerts.service.ts.
// Backend ships canonical Bulgarian in `title`; UI overrides per language. Any
// unknown id falls back to the backend `title`, so a new server signal still renders.
export const ALERT_TITLE_I18N: Record<string, { bg: string; en: string }> = {
  receipt_review: { bg: 'Касови бележки за ръчен преглед', en: 'Receipts pending manual review' },
  partner_invoices_overdue: { bg: 'Просрочени фактури от партньори', en: 'Overdue partner invoices' },
  failed_payments: { bg: 'Неуспешни плащания', en: 'Failed subscription payments' },
  unpaid_subscriptions: { bg: 'Неплатени абонаменти', en: 'Unpaid subscriptions' },
  risk_transactions: { bg: 'Рискови транзакции (Висок риск 61+)', en: 'High-risk transactions (61+)' },
  medium_risk_transactions: { bg: 'Транзакции за преглед (31–60)', en: 'Transactions for review (31–60)' },
  failed_transactions: { bg: 'Неуспешни транзакции (последните 24ч)', en: 'Failed transactions (last 24h)' },
  failed_payouts_pipeline: { bg: 'Неуспешни изплащания (последните 24ч)', en: 'Failed payouts (last 24h)' },
  fraud_check_errors: { bg: 'Грешки в проверката за измами (последните 24ч)', en: 'Fraud-check errors (last 24h)' },
  suspicious_iban_changes: { bg: 'Промени на IBAN (последните 24ч)', en: 'IBAN changes (last 24h)' },
  suspicious_activity: { bg: 'Подозрителна активност (последните 24ч)', en: 'Suspicious activity (last 24h)' },
  open_disputes: { bg: 'Активни спорове', en: 'Active disputes' },
  partner_requests: { bg: 'Нови партньорски заявки', en: 'New partner requests' },
  periods_for_review: { bg: 'Периоди за проверка', en: 'Periods for review' },
  payout_threshold: { bg: 'Абонати достигнали праг за изплащане', en: 'Subscribers reached payout threshold' },
  large_pending_payouts: { bg: 'Чакащи изплащания над лимита', en: 'Pending payouts above limit' },
  new_registrations: { bg: 'Нови регистрации (последните 24ч)', en: 'New registrations (last 24h)' },
  activated_partners: { bg: 'Активирани партньори (последните 24ч)', en: 'Activated partners (last 24h)' },
  completed_onboarding: { bg: 'Завършен онбординг (последните 24ч)', en: 'Onboarding completed (last 24h)' },
};

export const ALERT_ICON_BY_ID: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  receipt_review: DocumentMagnifyingGlassIcon,
  partner_invoices_overdue: ReceiptPercentIcon,
  failed_payments: CreditCardIcon,
  unpaid_subscriptions: CreditCardIcon,
  risk_transactions: ExclamationTriangleIcon,
  medium_risk_transactions: ExclamationTriangleIcon,
  failed_transactions: XCircleIcon,
  failed_payouts_pipeline: BanknotesIcon,
  fraud_check_errors: CommandLineIcon,
  suspicious_iban_changes: KeyIcon,
  suspicious_activity: BellAlertIcon,
  open_disputes: ChatBubbleBottomCenterTextIcon,
  partner_requests: UserPlusIcon,
  periods_for_review: CalendarDaysIcon,
  payout_threshold: BanknotesIcon,
  large_pending_payouts: BanknotesIcon,
  new_registrations: UserGroupIcon,
  activated_partners: BuildingStorefrontIcon,
  completed_onboarding: CheckBadgeIcon,
};

export const ALERT_FALLBACK_ICON = BellAlertIcon;

export function getAlertTitle(
  id: string,
  serverTitle: string,
  language: 'bg' | 'en',
): string {
  const entry = ALERT_TITLE_I18N[id];
  if (!entry) return serverTitle;
  return language === 'en' ? entry.en : entry.bg;
}
