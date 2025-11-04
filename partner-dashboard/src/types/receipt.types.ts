/**
 * Receipt Types
 * TypeScript interfaces for receipt data matching backend models
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
  metadata?: Record<string, any>;
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
  metadata?: Record<string, any>;
  transactionId?: string;
}

export interface UpdateReceiptDTO {
  totalAmount?: number;
  merchantName?: string;
  date?: string | Date;
  items?: ReceiptItem[];
  rawText?: string;
  metadata?: Record<string, any>;
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

export interface ReceiptListResponse {
  success: boolean;
  data: Receipt[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ReceiptResponse {
  success: boolean;
  data: Receipt;
}

export interface ReceiptStatsResponse {
  success: boolean;
  data: ReceiptStats;
}
