/**
 * Receipt Types
 * TypeScript interfaces for receipt data matching backend models
 *
 * IMPORTANT — spec §11.3, §7.4, Clash 5.1, Clash 10.6:
 * The following fields are INTERNAL-ONLY and must NEVER be surfaced in any
 * partner-facing view, export, or UI component:
 *   - fraudScore        (internal risk score — Clash 5.1)
 *   - fraudReasons      (internal risk detail)
 *   - cashbackPercent   (business formula component — Clash 10.6)
 *   - ocrConfidence / confidence  (internal OCR quality metric)
 *   - ocrRawText / rawText        (raw OCR output — internal only)
 *   - imageKey / imageHash        (internal storage keys)
 *   - reviewedBy / reviewNotes    (internal admin review metadata)
 *   - latitude / longitude        (raw GPS — internal verification data)
 *   - userId                      (internal user reference)
 *
 * Partner-facing pages must use PartnerReceipt (see below) instead of the
 * full Receipt type. The full Receipt type is for admin-only pages.
 */

export enum ReceiptStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  VALIDATING = 'VALIDATING',
  VALIDATED = 'VALIDATED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
  CASHBACK_APPLIED = 'CASHBACK_APPLIED',
  EXPIRED = 'EXPIRED'
}

export interface ReceiptItem {
  name: string;
  price?: number;
  quantity?: number;
}

/**
 * Partner-safe receipt type — contains only fields permitted under spec §11.3,
 * §7.1, and §6 (Transactions view). Use this in all partner-facing pages and
 * export utilities. Internal-only fields are intentionally absent.
 *
 * LOW-3 fix (r2s): partner-facing components should accept PartnerReceipt
 * instead of Receipt to enforce the type-system guardrail at design time.
 */
export interface PartnerReceipt {
  id: string;
  transactionId?: string;
  venueId?: string;

  // Partner-visible data
  totalAmount?: number;
  merchantName?: string;
  receiptDate?: string;
  date?: string; // Alias for receiptDate
  items?: ReceiptItem[];

  // Receipt image (public URL only — no imageKey or imageHash)
  imageUrl: string;

  // Cashback amount (permitted) — cashbackPercent is NOT included (§11.3, Clash 10.6)
  cashbackAmount: number;

  // Status and rejection reason (partner may see why a receipt was rejected)
  status: ReceiptStatus;
  rejectionReason?: string;

  // Metadata
  createdAt: string;
  updatedAt: string;
}

/**
 * Full receipt type — admin-only. Contains all backend fields including
 * internal-only data. Must NOT be used in partner-facing components.
 * @internal
 */
export interface Receipt {
  id: string;
  userId: string;
  transactionId?: string;
  venueId?: string;
  offerId?: string;

  // OCR Extracted Data
  totalAmount?: number;
  verifiedAmount?: number;
  merchantName?: string;
  receiptDate?: string;
  date?: string; // Alias for receiptDate
  items?: ReceiptItem[];
  ocrRawText?: string;
  rawText?: string; // Alias for ocrRawText
  ocrData?: string;
  ocrConfidence: number;
  confidence?: number; // Alias for ocrConfidence

  // Receipt Image
  imageUrl: string;
  imageKey?: string;
  imageHash: string;

  // Cashback
  cashbackPercent: number;
  cashbackAmount: number;

  // Fraud Detection
  fraudScore: number;
  fraudReasons?: string | string[]; // Support both formats

  // GPS Verification
  latitude?: number;
  longitude?: number;

  // Validation & Processing
  reviewedBy?: string;
  reviewedAt?: string;
  status: ReceiptStatus;
  rejectionReason?: string;
  reviewNotes?: string;

  // Metadata
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;

  // Relations
  user?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
  transaction?: {
    id: string;
    amount: number;
    status: string;
    cashbackAmount?: number;
    createdAt: string;
  };
}

export interface CreateReceiptDTO {
  // OCR Data
  totalAmount?: number;
  merchantName?: string;
  date?: string | Date;
  items?: ReceiptItem[];
  rawText: string;
  confidence: number;

  // Image data
  imageUrl?: string;
  imageKey?: string;
  imageData?: string; // Base64 or buffer for hash calculation

  // Optional metadata
  metadata?: Record<string, unknown>;
  transactionId?: string;
}

export interface UpdateReceiptDTO {
  totalAmount?: number;
  merchantName?: string;
  date?: string | Date;
  items?: ReceiptItem[];
  rawText?: string;
  metadata?: Record<string, unknown>;
}

export interface ReceiptFilters {
  status?: ReceiptStatus;
  merchantName?: string;
  minAmount?: number;
  maxAmount?: number;
  startDate?: Date | string;
  endDate?: Date | string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'totalAmount' | 'date';
  sortOrder?: 'asc' | 'desc';
}

export interface ReceiptStats {
  totalReceipts: number;
  validatedReceipts: number;
  rejectedReceipts: number;
  pendingReceipts: number;
  totalAmount: number;
  averageAmount: number;
}

// Partner/user list endpoint returns PartnerReceipt[] — no internal fields.
// Admin list endpoints must use their own response type with Receipt[].
export interface ReceiptListResponse {
  success: boolean;
  data: PartnerReceipt[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * @internal — admin use only.
 * Wraps the full Receipt type which contains fields prohibited for partner
 * access (fraudScore, cashbackPercent, ocrConfidence, imageKey, reviewedBy…).
 * Partner-facing code MUST use PartnerReceiptResponse instead.
 *
 * LOW-2 fix (r2ad): annotation added so developers see the admin-only warning
 * in autocomplete alongside the partner-safe alternatives defined in this file.
 */
export interface ReceiptResponse {
  success: boolean;
  data: Receipt;
}

/**
 * Partner-safe single-receipt response type.
 * Use this in all partner-facing detail pages instead of ReceiptResponse.
 * spec §11.3, F1 fix (r2t).
 */
export interface PartnerReceiptResponse {
  success: boolean;
  data: PartnerReceipt;
}

/**
 * @internal — admin use only.
 * Used by admin receipt-review flows; contains the full Receipt type including
 * fraudWarning and other internal fields. Must not be imported by partner pages.
 *
 * LOW-2 fix (r2ad): annotation added.
 */
export interface ReviewReceiptResponse {
  success: boolean;
  receipt: Receipt;
  message: string;
  fraudWarning?: string;
}

export interface ReceiptStatsResponse {
  success: boolean;
  data: ReceiptStats;
}
