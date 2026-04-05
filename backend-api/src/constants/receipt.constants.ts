/**
 * Receipt & Fraud Detection Constants
 *
 * All configurable thresholds and limits used across the receipt
 * redemption workflow. Change values here — never inline them.
 */

// ── File Upload ────────────────────────────────────────────────────────────────
export const MAX_RECEIPT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_RECEIPT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

// ── Rate Limiting ──────────────────────────────────────────────────────────────
export const DEFAULT_DAILY_SUBMISSION_LIMIT = 10;
export const DEFAULT_MONTHLY_SUBMISSION_LIMIT = 100;

// ── Fraud Score Thresholds ─────────────────────────────────────────────────────
/** Receipts at or below this score are auto-approved. */
export const DEFAULT_AUTO_APPROVE_THRESHOLD = 30;
/** Receipts above this score are auto-rejected; in-between → manual review. */
export const DEFAULT_AUTO_REJECT_THRESHOLD = 60;
/** Fraud score at which admin fraud-alert notifications are sent. */
export const FRAUD_ALERT_SCORE_THRESHOLD = 60;

// ── GPS Proximity ──────────────────────────────────────────────────────────────
/** Distance (meters) above which a receipt is considered far from the venue. */
export const GPS_FAR_THRESHOLD_M = 500;
/** Distance (meters) above which a receipt triggers a GPS warning. */
export const GPS_WARNING_THRESHOLD_M = 200;

// ── OCR Confidence ─────────────────────────────────────────────────────────────
/** OCR confidence below this is flagged as low (adds fraud points). */
export const OCR_LOW_CONFIDENCE_THRESHOLD = 50;
/** OCR confidence below this (but above low) is flagged as moderate. */
export const OCR_MODERATE_CONFIDENCE_THRESHOLD = 70;

// ── Amount Mismatch ────────────────────────────────────────────────────────────
/** % difference between OCR and user-entered amount considered a large mismatch. */
export const AMOUNT_LARGE_MISMATCH_PCT = 50;
/** % difference considered a moderate mismatch. */
export const AMOUNT_MODERATE_MISMATCH_PCT = 20;

// ── Rapid Submission Detection ─────────────────────────────────────────────────
/** Time window (ms) for counting rapid submissions. */
export const RAPID_SUBMISSION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
/** Number of submissions within the window that triggers the rapid flag. */
export const RAPID_SUBMISSION_COUNT_THRESHOLD = 3;

// ── Suspicious Time Window ─────────────────────────────────────────────────────
/** Hour (0-23, inclusive) when the suspicious-time window starts. */
export const UNUSUAL_HOUR_START = 2;
/** Hour (0-23, exclusive) when the suspicious-time window ends. */
export const UNUSUAL_HOUR_END = 6;

// ── Cashback Matrix (partner discount % → user cashback %) ────────────────────
// Source of truth: BOOM_Card_Master_Functionality.docx — Section 2
// Basic plan has a hard 10% cap regardless of partner discount.
// Premium/Light plans scale up to 24% at 30% partner discount.
export const CASHBACK_MATRIX: Record<number, { basic: number; premium: number }> = {
  5:  { basic: 5,  premium: 5  },
  10: { basic: 5,  premium: 8  },
  15: { basic: 8,  premium: 12 },
  20: { basic: 10, premium: 16 },
  25: { basic: 10, premium: 20 },
  30: { basic: 10, premium: 24 },
};
/** Ordered discount steps used to find the nearest row in CASHBACK_MATRIX. */
export const CASHBACK_MATRIX_STEPS = [5, 10, 15, 20, 25, 30] as const;
/** Hard cap for Basic plan cashback (%). Premium has no separate cap — matrix governs. */
export const BASIC_MAX_CASHBACK_PCT = 10;

// ── Payout Thresholds (EUR) ────────────────────────────────────────────────────
// Cashback is not paid out until the balance reaches the plan's minimum threshold.
export const PAYOUT_THRESHOLD_BASIC_EUR = 20;
export const PAYOUT_THRESHOLD_PREMIUM_WEEKLY_EUR = 10;
export const PAYOUT_THRESHOLD_PREMIUM_MONTHLY_EUR = 15;

// ── Cashback Validity ──────────────────────────────────────────────────────────
/** Cashback earned from each approved transaction expires after this many days. */
export const CASHBACK_VALIDITY_DAYS = 60;

export const DEFAULT_MAX_CASHBACK_PER_SCAN = 50.0;
export const DEFAULT_MIN_BILL_AMOUNT = 10;

// ── Cashback Crediting ─────────────────────────────────────────────────────────
/** Days after approval when cashback is estimated to land in the wallet. */
export const CASHBACK_ESTIMATED_CREDIT_DAYS = 7;

// ── Currency ───────────────────────────────────────────────────────────────────
/** Fixed BGN/EUR rate (Bulgaria currency board). 1 EUR = 1.95583 BGN. */
export const EUR_TO_BGN_RATE = 1.95583;

// ── Upgrade Credit Rates ───────────────────────────────────────────────────────
/** Premium Weekly → Premium Monthly: full remaining value credited to wallet. */
export const UPGRADE_CREDIT_WEEKLY_TO_MONTHLY = 1.00;
/** Basic → Premium: 60% of remaining value credited to wallet (anti-abuse). */
export const UPGRADE_CREDIT_BASIC_TO_PREMIUM = 0.60;

// ── Default Card Tier ──────────────────────────────────────────────────────────
export const DEFAULT_CARD_TIER = 'LIGHT' as const;

// ── Receipt Template Comparison ────────────────────────────────────────────────
/** Side length of the dHash resize grid (16×16 pixels). */
export const DHASH_GRID_SIZE = 16;
/** Total comparison bits: DHASH_GRID_SIZE × (DHASH_GRID_SIZE − 1) = 240. */
export const DHASH_BITS = 240;
/** Stored hex string length: DHASH_BITS / 4 = 60 chars. */
export const DHASH_HEX_LENGTH = 60;

export const DEFAULT_TEMPLATE_MATCH_ENABLED      = false;
export const DEFAULT_TEMPLATE_VISUAL_WEIGHT       = 0.5;
export const DEFAULT_TEMPLATE_MERCHANT_WEIGHT     = 0.3;
export const DEFAULT_TEMPLATE_KEYWORD_WEIGHT      = 0.2;
export const DEFAULT_TEMPLATE_MIN_SIMILARITY      = 0.6;
export const DEFAULT_TEMPLATE_FRAUD_POINTS        = 35;
export const DEFAULT_TEMPLATE_MERCHANT_THRESHOLD  = 0.8;
