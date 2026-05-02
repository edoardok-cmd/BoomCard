/**
 * Fraud Management Types
 * Types for merchant whitelist, venue fraud config, receipt templates,
 * and human-readable fraud reason labels.
 */

export type WhitelistStatus = 'APPROVED' | 'BLOCKED' | 'PENDING';

export interface MerchantWhitelistEntry {
  id: string;
  merchantName: string;
  nameBg?: string;
  taxId?: string;
  status: WhitelistStatus;
  addedBy?: string;
  reason?: string;
  metadata?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VenueFraudConfig {
  id: string;
  venueId?: string;
  partnerId?: string;
  cashbackPercent: number;
  premiumBonus: number;
  platinumBonus: number;
  minBillAmount: number;
  maxBillAmount?: number | null;
  maxCashbackPerScan?: number;
  maxScansPerDay: number;
  maxScansPerMonth: number;
  gpsVerificationEnabled: boolean;
  gpsRadiusMeters: number;
  ocrVerificationEnabled: boolean;
  autoApproveThreshold: number;
  autoRejectThreshold: number;
  templateMatchEnabled: boolean;
  templateVisualWeight: number;
  templateMerchantWeight: number;
  templateKeywordWeight: number;
  templateMinSimilarity: number;
  templateFraudPoints: number;
  templateMerchantThreshold: number;
  isActive: boolean;
  metadata?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptTemplate {
  id: string;
  venueId: string;
  merchantName: string;
  description?: string;
  expectedKeywords: string[];
  imageUrl: string;
  imageKey: string;
  perceptualHash: string;
  isActive: boolean;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FraudReasonInfo {
  label: string;
  labelBg: string;
  severity: 'low' | 'medium' | 'high';
}

export const FRAUD_REASON_LABELS: Record<string, FraudReasonInfo> = {
  DUPLICATE_IMAGE:               { label: 'Duplicate image previously submitted', labelBg: 'Дублирано изображение', severity: 'high' },
  PERCEPTUAL_DUPLICATE_CLOSE:    { label: 'Near-identical image to previous submission', labelBg: 'Почти идентично изображение', severity: 'high' },
  PERCEPTUAL_DUPLICATE_MODERATE: { label: 'Visually similar to previous submission', labelBg: 'Визуално сходно изображение', severity: 'medium' },
  LARGE_AMOUNT_MISMATCH:         { label: 'Large mismatch: OCR vs user-entered amount', labelBg: 'Голямо разминаване в сумата', severity: 'high' },
  AMOUNT_MISMATCH:               { label: 'Moderate mismatch: OCR vs user amount', labelBg: 'Умерено разминаване в сумата', severity: 'medium' },
  GPS_FAR_FROM_VENUE:            { label: 'User location far from venue', labelBg: 'Потребителят е далеч от обекта', severity: 'high' },
  GPS_OUTSIDE_RANGE:             { label: 'User outside recommended GPS range', labelBg: 'Потребителят е извън препоръчителния обхват', severity: 'medium' },
  LOW_OCR_CONFIDENCE:            { label: 'Low OCR confidence score', labelBg: 'Ниска увереност на OCR', severity: 'medium' },
  MODERATE_OCR_CONFIDENCE:       { label: 'Moderate OCR confidence', labelBg: 'Умерена увереност на OCR', severity: 'low' },
  DAILY_LIMIT_EXCEEDED:          { label: 'Daily submission limit exceeded', labelBg: 'Дневен лимит надвишен', severity: 'high' },
  MONTHLY_LIMIT_EXCEEDED:        { label: 'Monthly submission limit exceeded', labelBg: 'Месечен лимит надвишен', severity: 'high' },
  MERCHANT_BLACKLISTED:          { label: 'Merchant is blacklisted', labelBg: 'Търговецът е в черния списък', severity: 'high' },
  RAPID_SUBMISSIONS:             { label: 'Rapid successive submissions detected', labelBg: 'Бързи последователни подавания', severity: 'medium' },
  UNUSUAL_TIME:                  { label: 'Submitted at unusual hour', labelBg: 'Подадена в необичайно време', severity: 'low' },
  AMOUNT_TOO_LOW:                { label: 'Receipt amount below minimum', labelBg: 'Сумата е под минимума', severity: 'low' },
  AMOUNT_EXCEEDS_VENUE_MAX:      { label: 'Amount exceeds venue maximum', labelBg: 'Сумата надвишава максимума за обекта', severity: 'medium' },
  TEMPLATE_MISMATCH:             { label: 'Receipt does not match venue templates', labelBg: 'Бележката не отговаря на шаблоните', severity: 'medium' },
  FRAUD_CHECK_ERROR:             { label: 'Fraud check failed — manual review required', labelBg: 'Грешка при проверка за измама', severity: 'medium' },
  NEW_DEVICE:                    { label: 'First submission from this device', labelBg: 'Първо подаване от това устройство', severity: 'low' },
  NEW_DEVICE_MULTI_DEVICE_USER:  { label: 'New device on multi-device user', labelBg: 'Ново устройство при потребител с много устройства', severity: 'high' },
  RARE_DEVICE_MULTI_DEVICE_USER: { label: 'Rarely-used device on multi-device user', labelBg: 'Рядко използвано устройство', severity: 'medium' },
  MERCHANT_MISMATCH:             { label: 'Receipt merchant does not match venue', labelBg: 'Търговецът не съвпада с обекта', severity: 'medium' },
  DUPLICATE_IMAGE_HASH:          { label: 'Duplicate receipt image (exact SHA-256 match)', labelBg: 'Дублирано изображение (точно съвпадение)', severity: 'high' },
  DUPLICATE_IMAGE_HASH_RACE:     { label: 'Duplicate receipt caught by unique constraint', labelBg: 'Дублирано изображение (уникално ограничение)', severity: 'high' },
  HIGH_VELOCITY:                 { label: 'High transaction velocity', labelBg: 'Висока честота на транзакции', severity: 'high' },
  DUPLICATE_RECEIPT:             { label: 'Duplicate receipt', labelBg: 'Дублирана бележка', severity: 'high' },
  HIGH_BILL_AMOUNT:              { label: 'Unusually high bill amount', labelBg: 'Необичайно висока сума', severity: 'medium' },
  RAPID_SCANNING:                { label: 'Rapid QR scanning detected', labelBg: 'Открито бързо сканиране', severity: 'medium' },
  MAX_SCANS_PER_DAY:             { label: 'Daily scan limit reached', labelBg: 'Достигнат дневен лимит', severity: 'high' },
  MAX_SCANS_PER_MONTH:           { label: 'Monthly scan limit reached', labelBg: 'Достигнат месечен лимит', severity: 'high' },
};
