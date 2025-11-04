/**
 * Fraud Detection Utilities for Receipt Scanning
 *
 * Implements:
 * - Image hashing for duplicate detection
 * - Amount validation
 * - Rate limiting checks
 * - Merchant validation
 * - GPS verification
 */

export interface FraudCheckResult {
  fraudScore: number; // 0-100, higher = more suspicious
  fraudReasons: string[];
  isApproved: boolean;
  requiresManualReview: boolean;
}

export interface ReceiptValidation {
  imageHash: string;
  isValid: boolean;
  errors: string[];
}

/**
 * Generate SHA-256 hash for image using Web Crypto API (browser-compatible)
 */
export async function generateImageHash(imageBlob: Blob): Promise<string> {
  const arrayBuffer = await imageBlob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Generate hash from base64 string
 */
export async function generateImageHashFromBase64(base64: string): Promise<string> {
  // Remove data URL prefix if present
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');

  // Convert base64 to binary
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Hash the binary data
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Check if receipt amount is within acceptable threshold
 */
export function validateAmount(
  ocrAmount: number | undefined,
  userAmount: number | undefined,
  threshold: number = 10 // 10% difference allowed
): { isValid: boolean; difference: number } {
  if (!ocrAmount || !userAmount) {
    return { isValid: false, difference: 0 };
  }

  const difference = Math.abs(ocrAmount - userAmount);
  const percentDifference = (difference / Math.max(ocrAmount, userAmount)) * 100;

  return {
    isValid: percentDifference <= threshold,
    difference: percentDifference,
  };
}

/**
 * Calculate fraud score based on various factors
 */
export function calculateFraudScore(params: {
  isDuplicate?: boolean;
  amountMismatch?: boolean;
  amountDifferencePercent?: number;
  isOutsideGeoFence?: boolean;
  distanceFromVenue?: number;
  ocrConfidence?: number;
  submissionCount?: number;
  userDailyScans?: number;
  maxDailyScans?: number;
  merchantBlacklisted?: boolean;
  merchantWhitelisted?: boolean;
  suspiciousPattern?: boolean;
}): FraudCheckResult {
  let score = 0;
  const reasons: string[] = [];

  // Duplicate image (high risk)
  if (params.isDuplicate) {
    score += 40;
    reasons.push('DUPLICATE_IMAGE');
  }

  // Amount mismatch
  if (params.amountMismatch) {
    const mismatch = params.amountDifferencePercent || 0;
    if (mismatch > 50) {
      score += 30;
      reasons.push('LARGE_AMOUNT_MISMATCH');
    } else if (mismatch > 20) {
      score += 15;
      reasons.push('AMOUNT_MISMATCH');
    }
  }

  // GPS verification
  if (params.isOutsideGeoFence) {
    const distance = params.distanceFromVenue || 0;
    if (distance > 500) {
      score += 25;
      reasons.push('GPS_FAR_FROM_VENUE');
    } else if (distance > 200) {
      score += 15;
      reasons.push('GPS_OUTSIDE_RANGE');
    }
  }

  // OCR confidence (low confidence is suspicious)
  if (params.ocrConfidence !== undefined && params.ocrConfidence < 50) {
    score += 20;
    reasons.push('LOW_OCR_CONFIDENCE');
  }

  // Multiple submissions
  if (params.submissionCount && params.submissionCount > 1) {
    score += params.submissionCount * 5;
    reasons.push('MULTIPLE_SUBMISSIONS');
  }

  // Rate limiting
  if (params.userDailyScans && params.maxDailyScans) {
    if (params.userDailyScans >= params.maxDailyScans) {
      score += 30;
      reasons.push('DAILY_LIMIT_EXCEEDED');
    } else if (params.userDailyScans >= params.maxDailyScans * 0.8) {
      score += 10;
      reasons.push('APPROACHING_DAILY_LIMIT');
    }
  }

  // Merchant validation
  if (params.merchantBlacklisted) {
    score += 50;
    reasons.push('MERCHANT_BLACKLISTED');
  } else if (params.merchantWhitelisted === false) {
    score += 10;
    reasons.push('MERCHANT_NOT_WHITELISTED');
  }

  // Suspicious patterns
  if (params.suspiciousPattern) {
    score += 15;
    reasons.push('SUSPICIOUS_PATTERN');
  }

  // Cap score at 100
  score = Math.min(100, score);

  // Determine approval status
  // Score 0-30: Auto-approve
  // Score 31-60: Manual review
  // Score 61+: Auto-reject
  const isApproved = score <= 30;
  const requiresManualReview = score > 30 && score <= 60;

  return {
    fraudScore: score,
    fraudReasons: reasons,
    isApproved,
    requiresManualReview,
  };
}

/**
 * Calculate distance between two GPS coordinates (Haversine formula)
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Verify GPS location is within acceptable radius
 */
export function verifyGPSLocation(
  userLat: number | null,
  userLon: number | null,
  venueLat: number,
  venueLon: number,
  radiusMeters: number = 100
): { isValid: boolean; distance: number | null } {
  if (userLat === null || userLon === null) {
    return { isValid: false, distance: null };
  }

  const distance = calculateDistance(userLat, userLon, venueLat, venueLon);

  return {
    isValid: distance <= radiusMeters,
    distance,
  };
}

/**
 * Validate receipt age (receipts should be recent)
 */
export function validateReceiptAge(
  receiptDate: Date | null,
  maxAgeDays: number = 7
): { isValid: boolean; ageDays: number | null } {
  if (!receiptDate) {
    return { isValid: false, ageDays: null };
  }

  const now = new Date();
  const ageMs = now.getTime() - receiptDate.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  return {
    isValid: ageDays <= maxAgeDays,
    ageDays,
  };
}

/**
 * Check for suspicious patterns in submission behavior
 */
export function detectSuspiciousPattern(params: {
  submissionsLast24h: number;
  submissionsLastHour: number;
  averageTimeBetweenSubmissions: number; // in seconds
  sameVenueCount: number;
  sameMerchantCount: number;
}): boolean {
  // Too many submissions in short time
  if (params.submissionsLastHour > 5) {
    return true;
  }

  // Rapid-fire submissions (less than 1 minute apart on average)
  if (params.averageTimeBetweenSubmissions < 60) {
    return true;
  }

  // Too many from same venue
  if (params.sameVenueCount > 10) {
    return true;
  }

  // All submissions from same merchant
  if (params.sameMerchantCount === params.submissionsLast24h && params.sameMerchantCount > 5) {
    return true;
  }

  return false;
}

/**
 * Validate receipt image quality
 */
export function validateImageQuality(params: {
  width: number;
  height: number;
  fileSize: number;
  format: string;
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Minimum dimensions
  if (params.width < 400 || params.height < 400) {
    errors.push('Image resolution too low (minimum 400x400)');
  }

  // Maximum dimensions (prevent huge images)
  if (params.width > 4096 || params.height > 4096) {
    errors.push('Image resolution too high (maximum 4096x4096)');
  }

  // File size limits
  const maxSizeMB = 10;
  const sizeMB = params.fileSize / (1024 * 1024);
  if (sizeMB > maxSizeMB) {
    errors.push(`File size too large (maximum ${maxSizeMB}MB)`);
  }

  // Supported formats
  const supportedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!supportedFormats.includes(params.format.toLowerCase())) {
    errors.push('Unsupported image format (use JPG, PNG, or WebP)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate cashback amount based on receipt and offer
 */
export function calculateCashback(params: {
  amount: number;
  baseCashbackPercent: number;
  cardType?: 'STANDARD' | 'PREMIUM' | 'PLATINUM';
  premiumBonus?: number;
  platinumBonus?: number;
  maxCashbackPerTransaction?: number;
  offerDiscount?: number;
}): { cashbackPercent: number; cashbackAmount: number } {
  let cashbackPercent = params.baseCashbackPercent;

  // Add card tier bonuses
  if (params.cardType === 'PREMIUM' && params.premiumBonus) {
    cashbackPercent += params.premiumBonus;
  } else if (params.cardType === 'PLATINUM' && params.platinumBonus) {
    cashbackPercent += params.platinumBonus;
  }

  // Add offer discount if applicable
  if (params.offerDiscount) {
    cashbackPercent += params.offerDiscount;
  }

  // Calculate cashback amount
  let cashbackAmount = (params.amount * cashbackPercent) / 100;

  // Apply max cashback limit
  if (params.maxCashbackPerTransaction && cashbackAmount > params.maxCashbackPerTransaction) {
    cashbackAmount = params.maxCashbackPerTransaction;
  }

  // Round to 2 decimal places
  cashbackAmount = Math.round(cashbackAmount * 100) / 100;

  return {
    cashbackPercent,
    cashbackAmount,
  };
}

/**
 * Rate limiting: Check if user has exceeded submission limits
 */
export interface RateLimitCheck {
  isAllowed: boolean;
  reason?: string;
  currentCount: number;
  limit: number;
  resetAt?: Date;
}

export function checkRateLimit(
  currentCount: number,
  limit: number,
  period: 'hour' | 'day' | 'month'
): RateLimitCheck {
  const isAllowed = currentCount < limit;

  // Calculate reset time
  const now = new Date();
  const resetAt = new Date();

  switch (period) {
    case 'hour':
      resetAt.setHours(now.getHours() + 1, 0, 0, 0);
      break;
    case 'day':
      resetAt.setDate(now.getDate() + 1);
      resetAt.setHours(0, 0, 0, 0);
      break;
    case 'month':
      resetAt.setMonth(now.getMonth() + 1, 1);
      resetAt.setHours(0, 0, 0, 0);
      break;
  }

  return {
    isAllowed,
    reason: isAllowed ? undefined : `${period}ly limit of ${limit} receipts exceeded`,
    currentCount,
    limit,
    resetAt,
  };
}
