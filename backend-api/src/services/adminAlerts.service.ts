import { ScanStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

// Spec 3.2: Критични / Оперативни / Информационни
export type AlertTier = 'CRITICAL' | 'OPERATIONAL' | 'INFORMATIONAL';

export interface AlertItem {
  id: string;
  type: string;
  tier: AlertTier;
  title: string;
  count: number;
  link: string;
  // Drill-down filter values that the backend computed (thresholds, time windows, etc.).
  // The frontend uses these to (a) interpolate display strings — e.g. "(≥50 лв)" — without
  // baking them into the i18n title, and (b) preserve the alert's exact filter when
  // a focus banner forwards the user to a deep-linked page.
  meta?: Record<string, string | number>;
}

export interface AdminAlertsResult {
  critical: AlertItem[];
  operational: AlertItem[];
  informational: AlertItem[];
  totalCount: number;
  generatedAt: string;
}

// Suspicious-activity reason codes (spec §3.2 / §7.2). The live cashback pipeline
// is StickerScan (per adminCashback.service.ts comment — direct Receipt submission
// is retired), but StickerScan.fraudReasons is populated from two sources:
//
//   1. fraudDetection.service.ts — exact-match codes (DUPLICATE_IMAGE, etc.).
//      Also written to Receipt rows for the legacy flow.
//   2. sticker.service.ts validateScan / merchant-mismatch enrichment — codes
//      with payload suffixes ("MERCHANT_MISMATCH: receipt=… vs venue=…",
//      "RAPID_SCANNING: 5 scans in 30 minutes", "MAX_SCANS_PER_DAY: 12/10").
//      hasSome cannot match these — they need a prefix probe via raw SQL.
//
// Spec §7.2 explicitly cites: duplicate detection, QR/receipt mismatch,
// "много транзакции за кратко време" (rapid velocity), странни IBAN промени,
// подозрително поведение. The exact-match list mirrors that mapping.
//
// These constants are also imported by the admin sticker-review route to
// power the ?suspicious=true page filter — same reason-code set on both sides.
// The 24h window is forwarded separately via ?dateFromHours so the page count
// matches the alert (see SUSPICIOUS_ACTIVITY_WINDOW_HOURS below).
export const SUSPICIOUS_EXACT_CODES = [
  // duplicate detection
  'DUPLICATE_IMAGE',
  'DUPLICATE_IMAGE_HASH',
  'DUPLICATE_IMAGE_HASH_RACE',
  'PERCEPTUAL_DUPLICATE_CLOSE',
  'PERCEPTUAL_DUPLICATE_MODERATE',
  // QR / receipt / location mismatch
  'TEMPLATE_MISMATCH',
  'AMOUNT_MISMATCH',
  'LARGE_AMOUNT_MISMATCH',
  'GPS_FAR_FROM_VENUE',
  // velocity (fraudDetection)
  'RAPID_SUBMISSIONS',
  'DAILY_LIMIT_EXCEEDED',
  'MONTHLY_LIMIT_EXCEEDED',
  // merchant trust
  'MERCHANT_BLACKLISTED',
  // device anomalies (multi-device only — single NEW_DEVICE is too noisy)
  'NEW_DEVICE_MULTI_DEVICE_USER',
  'RARE_DEVICE_MULTI_DEVICE_USER',
] as const;

// Sticker-flow codes that include payload suffixes — matched via prefix in raw SQL.
// HIGH_BILL_AMOUNT (sticker.service.ts:1463, 15 fraud points) is the canonical
// "подозрително поведение" lone signal from spec §7.2: 15 pts on its own places
// the scan in AUTO_0_30, so it would otherwise never surface in any alert.
export const SUSPICIOUS_PREFIX_CODES = [
  'MERCHANT_MISMATCH',
  'RAPID_SCANNING',
  'MAX_SCANS_PER_DAY',
  'MAX_SCANS_PER_MONTH',
  'HIGH_BILL_AMOUNT',
] as const;

// Statuses that mean "still requires admin attention" — used by every risk-tier
// count so the alert doesn't include APPROVED/REJECTED rows that are already resolved.
// Exported and consumed by the admin sticker-review route as the ?status=active
// alias, so alert counts and page contents stay in lock-step. Typed as ScanStatus[]
// so callers can pass it straight to Prisma's `in:` without unsafe casts.
export const ACTIVE_SCAN_STATUSES: ScanStatus[] = [
  ScanStatus.PENDING,
  ScanStatus.VALIDATING,
  ScanStatus.MANUAL_REVIEW,
];

// Time window (hours) for the suspicious-activity alert. The deep-link forwards
// this value to the page so the page filter mirrors the alert count exactly.
export const SUSPICIOUS_ACTIVITY_WINDOW_HOURS = 24;

export async function getAlerts(): Promise<AdminAlertsResult> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const suspiciousWindowStart = new Date(
    now.getTime() - SUSPICIOUS_ACTIVITY_WINDOW_HOURS * 60 * 60 * 1000,
  );

  // Read thresholds from settings, fall back to safe defaults.
  // Guard against malformed values: parseFloat can yield NaN, which would
  // silently break the Prisma `gte` comparisons below.
  const [payoutThresholdSetting, largeTxThresholdSetting] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: 'payout_threshold' } }),
    prisma.systemSetting.findUnique({ where: { key: 'large_tx_threshold' } }),
  ]);
  const parseSetting = (raw: string | undefined, fallback: number): number => {
    if (!raw) return fallback;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const PAYOUT_THRESHOLD = parseSetting(payoutThresholdSetting?.value, 50);
  const LARGE_TX_THRESHOLD = parseSetting(largeTxThresholdSetting?.value, 500);

  // Suspicious activity probe runs against StickerScan with mixed exact-match
  // and prefix-match codes. Prisma's hasSome can't do prefix matching on TEXT[]
  // elements, so we use a raw query. Single round-trip; status filter pushed down.
  const exactCodes: readonly string[] = SUSPICIOUS_EXACT_CODES;
  const prefixPatterns = SUSPICIOUS_PREFIX_CODES.map(p => `${p}:%`);
  const suspiciousQuery = prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "StickerScan" s
    WHERE s."createdAt" >= ${suspiciousWindowStart}
      AND s.status::text IN ('PENDING', 'VALIDATING', 'MANUAL_REVIEW')
      AND EXISTS (
        SELECT 1 FROM unnest(s."fraudReasons") AS r
        WHERE r = ANY(${exactCodes}::text[])
           OR r LIKE ANY(${prefixPatterns}::text[])
      )
  `;

  const [
    partnerRequests,
    receiptReviews,
    partnerInvoicesOverdue,
    openPeriods,
    openDisputes,
    pastDueSubscriptions,
    unpaidSubscriptions,
    // Spec risk tiers: 61+ = CRITICAL, 31-60 = OPERATIONAL.
    // Both queries hit StickerScan (the live pipeline that AdminScanReviewPage
    // shows) — counting Receipt rows produced an alert ↔ landing-page mismatch.
    highRiskScans,
    mediumRiskScans,
    failedTransactions,
    // Suspicious activity (spec §3.2 / §7.2): IBAN changes
    recentIbanChanges,
    suspiciousScanRows,
    // System errors split into payout pipeline vs. fraud-check pipeline so each
    // links somewhere useful (see usage below).
    failedWalletPayouts,
    fraudCheckErrorScans,
    walletsAtThreshold,
    largePendingTx,
    newRegistrations,
    activatedPartners,
    completedOnboarding,
  ] = await Promise.all([
    prisma.partner.count({ where: { status: 'PENDING' } }),
    prisma.stickerScan.count({ where: { status: 'MANUAL_REVIEW' } }),
    prisma.partnerCashbackPayment.count({ where: { status: 'OVERDUE' } }),
    prisma.reportingPeriod.count({ where: { status: 'FOR_REVIEW' } }),
    prisma.dispute.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
    prisma.subscription.count({ where: { status: 'PAST_DUE' } }),
    prisma.subscription.count({ where: { status: 'UNPAID' } }),
    prisma.stickerScan.count({
      where: {
        fraudScore: { gte: 61 },
        status: { in: ACTIVE_SCAN_STATUSES },
      },
    }),
    prisma.stickerScan.count({
      where: {
        fraudScore: { gte: 31, lt: 61 },
        status: { in: ACTIVE_SCAN_STATUSES },
      },
    }),
    prisma.transaction.count({
      where: { status: 'FAILED', createdAt: { gte: oneDayAgo } },
    }),
    // Spec §7.2 "странни IBAN промени": only users with a non-zero wallet balance
    // are operationally interesting — a user switching banks with no cashback to
    // collect is not a fraud signal. The wallet balance filter drops legitimate
    // bank-account changes and prevents alert fatigue.
    prisma.user.count({
      where: {
        ibanLastChangedAt: { gte: oneDayAgo },
        wallet: { balance: { gt: 0 } },
      },
    }),
    suspiciousQuery,
    // System-error probe A: WITHDRAWAL/payout failures from the wallet ledger.
    // A healthy system has near-zero of these — every one means a user payout
    // failed (Paysera webhook, IBAN issue, etc.). Restricted to type=WITHDRAWAL
    // so the count matches the title ("Неуспешни изплащания") even if other
    // wallet-tx flows ever start producing FAILED rows.
    prisma.walletTransaction.count({
      where: {
        type: 'WITHDRAWAL',
        status: 'FAILED',
        createdAt: { gte: oneDayAgo },
      },
    }),
    // System-error probe B: fraud-check pipeline errors. fraudDetection.service.ts
    // tags affected scans with FRAUD_CHECK_ERROR (exact-match) when the engine throws.
    // Restricted to active statuses so the alert and the linked page show the
    // same set — admin-resolved scans (APPROVED/REJECTED) drop off the alert.
    prisma.stickerScan.count({
      where: {
        createdAt: { gte: oneDayAgo },
        fraudReasons: { has: 'FRAUD_CHECK_ERROR' },
        status: { in: ACTIVE_SCAN_STATUSES },
      },
    }),
    prisma.wallet.count({
      where: { balance: { gte: PAYOUT_THRESHOLD }, isLocked: false },
    }),
    // Restrict to type=WITHDRAWAL so the alert specifically targets large pending
    // payout requests (not CASHBACK_CREDIT or ADJUSTMENT rows that happen to be
    // large). Matches the link destination (/admin/finance/payouts) and the alert
    // title "Чакащи изплащания над лимита".
    prisma.walletTransaction.count({
      where: { type: 'WITHDRAWAL', status: 'PENDING', amount: { gte: LARGE_TX_THRESHOLD } },
    }),
    prisma.user.count({
      where: { createdAt: { gte: oneDayAgo }, status: { not: 'DELETED' }, role: 'USER' },
    }),
    prisma.partner.count({
      where: { status: 'ACTIVE', verifiedAt: { gte: oneDayAgo } },
    }),
    prisma.partner.count({
      where: { onboardingCompletedAt: { gte: oneDayAgo } },
    }),
  ]);

  const suspiciousScans = Number(suspiciousScanRows[0]?.count ?? 0n);

  const critical: AlertItem[] = [];
  const operational: AlertItem[] = [];
  const informational: AlertItem[] = [];

  // ── Critical ────────────────────────────────────────────────────────────────
  if (receiptReviews > 0) {
    critical.push({
      id: 'receipt_review',
      type: 'RECEIPT_REVIEW',
      tier: 'CRITICAL',
      title: 'Касови бележки за ръчен преглед',
      count: receiptReviews,
      link: '/admin/control/risk?status=MANUAL_REVIEW',
    });
  }
  if (partnerInvoicesOverdue > 0) {
    // Per spec §6.2, partners are invoiced by BoomCard for cashback owed to
    // subscribers (totalCashbackOwed = partner→BoomCard receivable).
    // PartnerCashbackPayment.OVERDUE = partner hasn't paid BoomCard.
    critical.push({
      id: 'partner_invoices_overdue',
      type: 'PARTNER_INVOICES_OVERDUE',
      tier: 'CRITICAL',
      title: 'Просрочени фактури от партньори',
      count: partnerInvoicesOverdue,
      link: '/admin/finance/invoices?status=OVERDUE',
    });
  }
  // Spec §3.2: critical alerts must lead to Контрол or Финанси. Subscription
  // billing data lives under Абонати > Subscriptions, so we route the alert to
  // Финанси > Справки with a focus param; the reports page renders a banner
  // with the count + a deep-link to the subscription list for drill-down.
  if (pastDueSubscriptions > 0) {
    critical.push({
      id: 'failed_payments',
      type: 'FAILED_PAYMENTS',
      tier: 'CRITICAL',
      title: 'Неуспешни плащания',
      count: pastDueSubscriptions,
      link: '/admin/finance/reports?focus=failed_payments',
    });
  }
  if (unpaidSubscriptions > 0) {
    critical.push({
      id: 'unpaid_subscriptions',
      type: 'UNPAID_SUBSCRIPTIONS',
      tier: 'CRITICAL',
      title: 'Неплатени абонаменти',
      count: unpaidSubscriptions,
      link: '/admin/finance/reports?focus=unpaid_subscriptions',
    });
  }
  // Spec §3.2 lists "рискови транзакции" as a single critical category. We
  // intentionally split into three emitters (receipt_review, risk_transactions,
  // medium_risk_transactions) because the action surfaces are distinct
  // (manual-review queue vs. fraud-score buckets) and admins benefit from
  // seeing them broken out — see /admin/control/risk for the unified queue.
  if (highRiskScans > 0) {
    critical.push({
      id: 'risk_transactions',
      type: 'RISK_TRANSACTIONS',
      tier: 'CRITICAL',
      title: 'Рискови транзакции (висок риск 61+)',
      count: highRiskScans,
      link: '/admin/control/risk?bucket=HIGH_61_PLUS&status=active',
    });
  }
  // Spec §3.2: both HIGH (61+) and REVIEW (31–60) score bands are listed as
  // critical "рискови транзакции" — they route to the same admin/control/risk
  // page, just different bucket filters. Keeping them as two separate alerts so
  // the admin sees the split count in the badge.
  if (mediumRiskScans > 0) {
    critical.push({
      id: 'medium_risk_transactions',
      type: 'MEDIUM_RISK_TRANSACTIONS',
      tier: 'CRITICAL',
      title: 'Транзакции за преглед (31–60)',
      count: mediumRiskScans,
      link: '/admin/control/risk?bucket=REVIEW_31_60&status=active',
    });
  }
  if (failedTransactions > 0) {
    critical.push({
      id: 'failed_transactions',
      type: 'FAILED_TRANSACTIONS',
      tier: 'CRITICAL',
      title: 'Неуспешни транзакции (последните 24ч)',
      count: failedTransactions,
      link: '/admin/finance/reports?focus=failed_transactions',
      // Carries the alert's 24h window so the focus-banner drill-down filters
      // the business transactions list to the same set the alert counted.
      meta: { dateFrom: oneDayAgo.toISOString() },
    });
  }
  // Spec §3.2: спорове fall under control. Categorised as critical so the
  // tier→destination rule (Контрол/Финанси) holds.
  if (openDisputes > 0) {
    critical.push({
      id: 'open_disputes',
      type: 'OPEN_DISPUTES',
      tier: 'CRITICAL',
      title: 'Активни спорове',
      count: openDisputes,
      link: '/admin/control/disputes',
    });
  }
  // System errors split — combining both sources into one alert would have to
  // link to a heterogeneous "system errors" view we don't have.
  if (failedWalletPayouts > 0) {
    // Spec §3.2: critical alerts route to Контрол or Финанси. Payouts live under
    // Финанси > Плащания абонати — AdminPayoutsPage reads ?status from the URL.
    critical.push({
      id: 'failed_payouts_pipeline',
      type: 'FAILED_PAYOUTS_PIPELINE',
      tier: 'CRITICAL',
      title: 'Неуспешни изплащания (последните 24ч)',
      count: failedWalletPayouts,
      link: '/admin/finance/payouts?status=FAILED',
    });
  }
  if (fraudCheckErrorScans > 0) {
    critical.push({
      id: 'fraud_check_errors',
      type: 'FRAUD_CHECK_ERRORS',
      tier: 'CRITICAL',
      title: 'Грешки в проверката за измами (последните 24ч)',
      count: fraudCheckErrorScans,
      // B1 fix: link directly to the FRAUD_CHECK_ERROR reason filter with status=active
      // so the page count matches the badge (only active scans, only this reason code).
      link: '/admin/control/risk?reasons=FRAUD_CHECK_ERROR&status=active',
    });
  }
  if (recentIbanChanges > 0) {
    critical.push({
      id: 'suspicious_iban_changes',
      type: 'SUSPICIOUS_IBAN_CHANGES',
      tier: 'CRITICAL',
      title: 'Промени на IBAN (последните 24ч)',
      count: recentIbanChanges,
      // Deep-link to subscriber list pre-filtered to users who changed IBAN in
      // the counted window. ibanChangedAfter is handled by the subscribers route
      // and by AdminSubscribersAllPage's URL-param hydration.
      link: `/admin/subscribers/all?ibanChangedAfter=${oneDayAgo.toISOString()}`,
      meta: { dateFrom: oneDayAgo.toISOString() },
    });
  }
  if (suspiciousScans > 0) {
    // The deep-link must carry the same time window the alert counted, otherwise
    // the page (which has no implicit window) shows lifetime suspicious scans
    // and the count won't match the badge. dateFromHours is honoured by the
    // sticker-review route's ?suspicious=true branch.
    critical.push({
      id: 'suspicious_activity',
      type: 'SUSPICIOUS_ACTIVITY',
      tier: 'CRITICAL',
      title: 'Подозрителна активност (последните 24ч)',
      count: suspiciousScans,
        // B-A1 fix: suspicious=true + status=active scopes the page to active scans
      // in the suspicious signal group; dateFromHours pins the same window the alert
      // counted so the badge number matches the page count.
      link: `/admin/control/risk?suspicious=true&status=active&dateFromHours=${SUSPICIOUS_ACTIVITY_WINDOW_HOURS}`,
      meta: { windowHours: SUSPICIOUS_ACTIVITY_WINDOW_HOURS, dateFrom: suspiciousWindowStart.toISOString() },
    });
  }

  // ── Operational ─────────────────────────────────────────────────────────────
  if (partnerRequests > 0) {
    operational.push({
      id: 'partner_requests',
      type: 'PARTNER_REQUESTS',
      tier: 'OPERATIONAL',
      title: 'Нови партньорски заявки',
      count: partnerRequests,
      link: '/admin/partners/requests',
    });
  }
  if (openPeriods > 0) {
    operational.push({
      id: 'periods_for_review',
      type: 'PERIODS_FOR_REVIEW',
      tier: 'OPERATIONAL',
      title: 'Периоди за проверка',
      count: openPeriods,
      link: '/admin/finance/periods',
    });
  }
  if (walletsAtThreshold > 0) {
    operational.push({
      id: 'payout_threshold',
      type: 'PAYOUT_THRESHOLD',
      tier: 'OPERATIONAL',
      // Static title — threshold value is rendered by the frontend from meta.threshold
      // so EN and BG see the same number and the strings live next to their translations.
      title: 'Абонати достигнали праг за изплащане',
      count: walletsAtThreshold,
      link: '/admin/finance/payouts',
      meta: { threshold: PAYOUT_THRESHOLD },
    });
  }
  if (largePendingTx > 0) {
    operational.push({
      id: 'large_pending_payouts',
      type: 'LARGE_PENDING_PAYOUTS',
      tier: 'OPERATIONAL',
      title: 'Чакащи изплащания над лимита',
      count: largePendingTx,
      // minAmount mirrors the alert's amount filter so the landing page row count
      // matches the badge — without it the user lands on ALL pending wallet TXs.
      link: `/admin/subscribers/transactions?view=wallet&status=PENDING&minAmount=${LARGE_TX_THRESHOLD}`,
      meta: { threshold: LARGE_TX_THRESHOLD },
    });
  }

  // ── Informational ────────────────────────────────────────────────────────────
  if (newRegistrations > 0) {
    informational.push({
      id: 'new_registrations',
      type: 'NEW_REGISTRATIONS',
      tier: 'INFORMATIONAL',
      title: 'Нови регистрации (последните 24ч)',
      count: newRegistrations,
      // dateFrom param pre-filters the subscriber list to the 24h window so the
      // landing page count matches the badge. Handled by AdminSubscribersAllPage
      // URL-param hydration (dateFrom → account creation date filter).
      link: `/admin/subscribers/all?dateFrom=${oneDayAgo.toISOString()}`,
    });
  }
  if (activatedPartners > 0) {
    informational.push({
      id: 'activated_partners',
      type: 'ACTIVATED_PARTNERS',
      tier: 'INFORMATIONAL',
      title: 'Активирани партньори (последните 24ч)',
      count: activatedPartners,
      // verifiedAfter pre-filters the active partners list to partners activated
      // within the counted window. Handled by AdminPartnersPage URL-param hydration.
      link: `/admin/partners/active?verifiedAfter=${oneDayAgo.toISOString()}`,
    });
  }
  if (completedOnboarding > 0) {
    informational.push({
      id: 'completed_onboarding',
      type: 'COMPLETED_ONBOARDING',
      tier: 'INFORMATIONAL',
      title: 'Завършен онбординг (последните 24ч)',
      count: completedOnboarding,
      // Distinct destination from activated_partners. onboardingCompletedAfter
      // filters the active partners list to the counted window.
      link: `/admin/partners/active?onboardingCompletedAfter=${oneDayAgo.toISOString()}`,
    });
  }

  const totalCount =
    [...critical, ...operational, ...informational].reduce((sum, a) => sum + a.count, 0);

  return {
    critical,
    operational,
    informational,
    totalCount,
    generatedAt: new Date().toISOString(),
  };
}
