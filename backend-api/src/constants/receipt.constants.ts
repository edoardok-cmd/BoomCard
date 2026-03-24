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

// ── Cashback Defaults (used when no venue config exists) ───────────────────────
export const DEFAULT_CASHBACK_PERCENT = 5.0;
export const DEFAULT_BASIC_TIER_BONUS = 2.0;
export const DEFAULT_PREMIUM_TIER_BONUS = 5.0;
export const DEFAULT_MAX_CASHBACK_PER_SCAN = 50.0;
export const DEFAULT_MIN_BILL_AMOUNT = 10;

// ── Cashback Crediting ─────────────────────────────────────────────────────────
/** Days after approval when cashback is estimated to land in the wallet. */
export const CASHBACK_ESTIMATED_CREDIT_DAYS = 7;

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
