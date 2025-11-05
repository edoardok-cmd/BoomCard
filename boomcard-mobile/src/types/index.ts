/**
 * TypeScript Type Definitions for BoomCard Mobile App
 * Based on backend Prisma schema
 */

// ==================== Authentication Types ====================

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatar?: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  emailVerifiedAt?: string;
  lastLoginAt?: string;
  stripeCustomerId?: string;
  createdAt: string;
  updatedAt: string;
}

export enum UserRole {
  USER = 'USER',
  PARTNER = 'PARTNER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

// ==================== Receipt Types ====================

export interface Receipt {
  id: string;
  userId: string;
  transactionId?: string;
  venueId?: string;
  offerId?: string;
  cardId?: string;
  imageUrl?: string;
  imageKey?: string;
  imageHash?: string;
  ocrRawText?: string;
  ocrData?: any;
  merchantName?: string;
  totalAmount?: number;
  verifiedAmount?: number;
  receiptDate?: string;
  items?: any;
  cashbackPercent?: number;
  cashbackAmount?: number;
  ocrConfidence?: number;
  fraudScore?: number;
  fraudReasons?: any;
  latitude?: number;
  longitude?: number;
  ipAddress?: string;
  userAgent?: string;
  submissionCount: number;
  status: ReceiptStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export enum ReceiptStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  VALIDATING = 'VALIDATING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
  EXPIRED = 'EXPIRED',
}

export interface ReceiptSubmitRequest {
  merchantName: string;
  totalAmount: number;
  receiptDate: string;
  latitude: number;
  longitude: number;
  venueId?: string;
  offerId?: string;
  cardId?: string;
  ocrData?: any;
  ocrConfidence?: number;
  items?: any;
}

export interface ReceiptStats {
  totalReceipts: number;
  approvedReceipts: number;
  rejectedReceipts: number;
  pendingReceipts: number;
  totalCashback: number;
  totalSpent: number;
  averageReceiptAmount: number;
  topMerchant?: string;
  lastReceiptDate?: string;
  successRate: number;
}

// ==================== Sticker Scan Types ====================

export interface StickerScan {
  id: string;
  userId: string;
  stickerId: string;
  venueId: string;
  cardId?: string;
  billAmount: number;
  verifiedAmount?: number;
  cashbackPercent: number;
  cashbackAmount: number;
  status: StickerScanStatus;
  latitude: number;
  longitude: number;
  distance?: number;
  receiptImageUrl?: string;
  ocrData?: any;
  fraudScore?: number;
  fraudReasons?: any;
  ipAddress?: string;
  userAgent?: string;
  transactionId?: string;
  createdAt: string;
  updatedAt: string;
}

export enum StickerScanStatus {
  PENDING = 'PENDING',
  VALIDATING = 'VALIDATING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
}

export interface StickerScanRequest {
  stickerId: string;
  cardId?: string;
  billAmount: number;
  latitude: number;
  longitude: number;
}

// ==================== Venue Types ====================

export interface Venue {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  region?: string;
  phone?: string;
  email?: string;
  openingHours?: string;
  capacity?: number;
  features?: string[];
  rating?: number;
  reviewCount?: number;
  createdAt: string;
  updatedAt: string;
}

// ==================== Card Types ====================

export interface Card {
  id: string;
  userId: string;
  cardNumber: string;
  type: CardType;
  status: CardStatus;
  qrCode: string;
  validFrom: string;
  validUntil: string;
  createdAt: string;
  updatedAt: string;
}

export enum CardType {
  STANDARD = 'STANDARD',
  PREMIUM = 'PREMIUM',
  PLATINUM = 'PLATINUM',
}

export enum CardStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  SUSPENDED = 'SUSPENDED',
  CANCELED = 'CANCELED',
}

// ==================== Payment Types ====================

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  discount: number;
  discountAmount: number;
  finalAmount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentIntentId?: string;
  stripePaymentId?: string;
  loyaltyPoints?: number;
  cashbackAmount?: number;
  createdAt: string;
  updatedAt: string;
}

export enum TransactionType {
  BOOKING = 'BOOKING',
  PURCHASE = 'PURCHASE',
  WALLET_TOPUP = 'WALLET_TOPUP',
  REFUND = 'REFUND',
  LOYALTY_REDEMPTION = 'LOYALTY_REDEMPTION',
  SUBSCRIPTION = 'SUBSCRIPTION',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentMethod {
  CARD = 'CARD',
  WALLET = 'WALLET',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CASH = 'CASH',
}

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  clientSecret?: string;
  status: string;
}

export interface PaymentCard {
  id: string;
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

// ==================== Wallet Types ====================

export interface Wallet {
  id: string;
  userId: string;
  balance: number;
  availableBalance: number;
  pendingBalance: number;
  currency: string;
  isLocked: boolean;
  lockedReason?: string;
  lockedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: WalletTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  currency: string;
  status: WalletTransactionStatus;
  description?: string;
  metadata?: any;
  transactionId?: string;
  stripePaymentIntentId?: string;
  receiptId?: string;
  stickerScanId?: string;
  createdAt: string;
}

export enum WalletTransactionType {
  TOP_UP = 'TOP_UP',
  WITHDRAWAL = 'WITHDRAWAL',
  CASHBACK_CREDIT = 'CASHBACK_CREDIT',
  PURCHASE = 'PURCHASE',
  REFUND = 'REFUND',
  TRANSFER = 'TRANSFER',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum WalletTransactionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface WalletStatistics {
  totalCashback: number;
  totalTopups: number;
  totalSpent: number;
  totalTransactions: number;
  averageTransactionAmount: number;
}

export interface SavedPaymentMethod {
  id: string;
  userId: string;
  stripePaymentMethodId: string;
  type: string;
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  funding?: string;
  bankName?: string;
  accountLast4?: string;
  isDefault: boolean;
  billingDetails?: any;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

// ==================== Subscription Types ====================

export interface Subscription {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  stripeCustomerId?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  cancelAt?: string;
  canceledAt?: string;
  trialStart?: string;
  trialEnd?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export enum SubscriptionPlan {
  STANDARD = 'STANDARD',
  PREMIUM = 'PREMIUM',
  PLATINUM = 'PLATINUM',
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELLED = 'CANCELLED',
  INCOMPLETE = 'INCOMPLETE',
  INCOMPLETE_EXPIRED = 'INCOMPLETE_EXPIRED',
  TRIALING = 'TRIALING',
  UNPAID = 'UNPAID',
  PAUSED = 'PAUSED',
}

// ==================== Offer Types ====================

export interface Offer {
  id: string;
  partnerId: string;
  title: string;
  titleBg?: string;
  description: string;
  descriptionBg?: string;
  type: OfferType;
  discountPercent?: number;
  discountAmount?: number;
  cashbackPercent?: number;
  minPurchase?: number;
  maxDiscount?: number;
  startDate: string;
  endDate: string;
  usageLimit?: number;
  usageCount: number;
  status: OfferStatus;
  isFeatured: boolean;
  featuredOrder?: number;
  image?: string;
  category?: string;
  city?: string;
  createdAt: string;
  updatedAt: string;
}

export enum OfferType {
  DISCOUNT = 'DISCOUNT',
  CASHBACK = 'CASHBACK',
  POINTS = 'POINTS',
  BUNDLE = 'BUNDLE',
  SEASONAL = 'SEASONAL',
}

export enum OfferStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

// ==================== Loyalty Types ====================

export interface LoyaltyAccount {
  id: string;
  userId: string;
  tier: LoyaltyTier;
  points: number;
  lifetimePoints: number;
  tierProgress: number;
  cashbackBalance: number;
  nextTierPoints?: number;
  createdAt: string;
  updatedAt: string;
}

export enum LoyaltyTier {
  BRONZE = 'BRONZE',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
  DIAMOND = 'DIAMOND',
}

export interface LoyaltyTransaction {
  id: string;
  userId: string;
  type: LoyaltyTransactionType;
  points: number;
  description: string;
  descriptionBg?: string;
  expiresAt?: string;
  createdAt: string;
}

export enum LoyaltyTransactionType {
  EARNED = 'EARNED',
  REDEEMED = 'REDEEMED',
  EXPIRED = 'EXPIRED',
  ADJUSTED = 'ADJUSTED',
  BONUS = 'BONUS',
}

export interface Reward {
  id: string;
  title: string;
  titleBg?: string;
  description: string;
  descriptionBg?: string;
  pointsCost: number;
  cashValue?: number;
  category?: string;
  image?: string;
  stockQuantity?: number;
  status: string;
  createdAt: string;
}

// ==================== Notification Types ====================

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  titleBg?: string;
  message: string;
  messageBg?: string;
  data?: any;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

export enum NotificationType {
  BOOKING_CONFIRMED = 'BOOKING_CONFIRMED',
  PAYMENT_SUCCESS = 'PAYMENT_SUCCESS',
  LOYALTY_POINTS = 'LOYALTY_POINTS',
  RECEIPT_APPROVED = 'RECEIPT_APPROVED',
  RECEIPT_REJECTED = 'RECEIPT_REJECTED',
  CASHBACK_CREDITED = 'CASHBACK_CREDITED',
  OFFER_AVAILABLE = 'OFFER_AVAILABLE',
  STICKER_SCAN_APPROVED = 'STICKER_SCAN_APPROVED',
  STICKER_SCAN_REJECTED = 'STICKER_SCAN_REJECTED',
}

// ==================== API Response Types ====================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: any;
}

// ==================== GPS Location Types ====================

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}

export interface LocationPermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
}

export interface GPSValidationResult {
  isValid: boolean;
  distance: number;
  message: string;
  userLocation: LocationCoordinates;
  venueLocation: { latitude: number; longitude: number };
}
