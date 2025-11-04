import { Sticker, StickerScan, StickerLocation, VenueStickerConfig, CardType, ScanStatus, StickerStatus, LocationType, TransactionStatus, TransactionType, PaymentMethod } from '@prisma/client';
import QRCode from 'qrcode';
import { prisma } from '../lib/prisma';
import { walletService } from './wallet.service';
import { logger } from '../utils/logger';

// ============================================
// Interfaces
// ============================================

export interface StickerQRData {
  type: 'BOOM_STICKER';
  venueId: string;
  locationId: string;
  stickerId: string; // Format: "BAR32-MASA04"
  locationType: LocationType;
  version: string;
}

export interface CreateStickerLocationData {
  venueId: string;
  name: string;
  nameBg?: string;
  locationType: LocationType;
  locationNumber: string;
  capacity?: number;
  floor?: string;
  section?: string;
  metadata?: any;
}

export interface ScanStickerData {
  userId: string;
  stickerId: string;
  cardId: string;
  billAmount: number;
  latitude?: number;
  longitude?: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface UploadReceiptData {
  scanId: string;
  userId?: string;
  receiptImageUrl: string;
  imageKey?: string;
  ocrData?: {
    amount?: number;
    date?: string;
    merchantName?: string;
    items?: string[];
    total?: number;
    currency?: string;
    confidence?: number;
  };
}

export interface FraudCheckResult {
  fraudScore: number; // 0-100
  fraudReasons: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  shouldAutoApprove: boolean;
  requiresManualReview: boolean;
}

// ============================================
// Sticker Service Class
// ============================================

class StickerService {
  /**
   * Create a new sticker location for a venue
   */
  async createStickerLocation(data: CreateStickerLocationData): Promise<StickerLocation> {
    return prisma.stickerLocation.create({
      data,
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            partner: {
              select: {
                id: true,
                businessName: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Create multiple sticker locations at once (bulk)
   */
  async createStickerLocationsBulk(locations: CreateStickerLocationData[]): Promise<StickerLocation[]> {
    const created: StickerLocation[] = [];
    for (const location of locations) {
      const result = await this.createStickerLocation(location);
      created.push(result);
    }
    return created;
  }

  /**
   * Generate a sticker with QR code for a location
   */
  async generateSticker(locationId: string): Promise<Sticker> {
    const location = await prisma.stickerLocation.findUnique({
      where: { id: locationId },
      include: { venue: true },
    });

    if (!location) {
      throw new Error('Location not found');
    }

    // Generate sticker ID: e.g., "BAR32-MASA04"
    const venueCode = await this.getVenueCode(location.venueId);
    const stickerId = `${venueCode}-${location.locationNumber}`;

    // Check if sticker already exists
    const existing = await prisma.sticker.findUnique({
      where: { stickerId },
    });

    if (existing) {
      throw new Error(`Sticker ${stickerId} already exists`);
    }

    // Generate QR code data
    const qrData: StickerQRData = {
      type: 'BOOM_STICKER',
      venueId: location.venueId,
      locationId: location.id,
      stickerId,
      locationType: location.locationType,
      version: '1.0',
    };

    // Generate QR code image (base64)
    const qrCodeImage = await QRCode.toDataURL(JSON.stringify(qrData), {
      errorCorrectionLevel: 'H',
      width: 512,
      margin: 2,
    });

    // Create sticker record
    const sticker = await prisma.sticker.create({
      data: {
        venueId: location.venueId,
        locationId: location.id,
        stickerId,
        qrCode: qrCodeImage,
        locationType: location.locationType,
        status: StickerStatus.PENDING,
        metadata: JSON.stringify({ qrData }),
      },
      include: {
        venue: true,
        location: true,
      },
    });

    return sticker;
  }

  /**
   * Generate multiple stickers at once
   */
  async generateStickersBulk(locationIds: string[]): Promise<Sticker[]> {
    const stickers: Sticker[] = [];
    for (const locationId of locationIds) {
      try {
        const sticker = await this.generateSticker(locationId);
        stickers.push(sticker);
      } catch (error) {
        console.error(`Failed to generate sticker for location ${locationId}:`, error);
      }
    }
    return stickers;
  }

  /**
   * Mark sticker as printed and active
   */
  async activateSticker(stickerId: string): Promise<Sticker> {
    return prisma.sticker.update({
      where: { stickerId },
      data: {
        status: StickerStatus.ACTIVE,
        printedAt: new Date(),
        activatedAt: new Date(),
      },
    });
  }

  /**
   * Get venue code from venue ID (simplified for now)
   */
  private async getVenueCode(venueId: string): Promise<string> {
    // In production, you might want to store a short code for each venue
    // For now, using a simple hash of the venue ID
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
    });

    if (!venue) {
      throw new Error('Venue not found');
    }

    // Generate a simple code based on name or ID
    // You can customize this logic
    const code = venue.name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 6);

    return code || venueId.substring(0, 6).toUpperCase();
  }

  /**
   * Validate and initiate a sticker scan
   */
  async scanSticker(data: ScanStickerData): Promise<StickerScan> {
    const { userId, stickerId, cardId, billAmount, latitude, longitude, ipAddress, userAgent } = data;

    // 1. Validate sticker exists and is active
    const sticker = await prisma.sticker.findUnique({
      where: { stickerId },
      include: {
        venue: {
          include: {
            stickerConfig: true,
          },
        },
        location: true,
      },
    });

    if (!sticker) {
      throw new Error('Invalid sticker code');
    }

    if (sticker.status !== StickerStatus.ACTIVE) {
      throw new Error('Sticker is not active');
    }

    // 2. Validate card exists and is active
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: { user: true },
    });

    if (!card) {
      throw new Error('Card not found');
    }

    if (card.userId !== userId) {
      throw new Error('Card does not belong to user');
    }

    if (card.status !== 'ACTIVE') {
      throw new Error(`Card is ${card.status.toLowerCase()}`);
    }

    // 3. Get venue sticker config
    const config = sticker.venue.stickerConfig || await this.getOrCreateVenueConfig(sticker.venueId);

    // 4. Validate bill amount
    if (billAmount < config.minBillAmount) {
      throw new Error(`Minimum bill amount is ${config.minBillAmount} BGN`);
    }

    // 5. Calculate cashback
    const cashbackPercent = this.calculateCashbackPercent(card.type, config);
    let cashbackAmount = (billAmount * cashbackPercent) / 100;

    // Apply max cashback limit if set
    if (config.maxCashbackPerScan && cashbackAmount > config.maxCashbackPerScan) {
      cashbackAmount = config.maxCashbackPerScan;
    }

    // 6. Calculate distance from venue if GPS provided
    let distance: number | undefined;
    if (latitude && longitude) {
      distance = this.calculateDistance(
        latitude,
        longitude,
        sticker.venue.latitude,
        sticker.venue.longitude
      );
    }

    // 7. Run fraud checks
    const fraudCheck = await this.performFraudCheck({
      userId,
      venueId: sticker.venueId,
      billAmount,
      distance,
      config,
    });

    // 8. Create scan record
    const scan = await prisma.stickerScan.create({
      data: {
        userId,
        stickerId: sticker.id,
        venueId: sticker.venueId,
        cardId,
        billAmount,
        cashbackPercent,
        cashbackAmount,
        latitude,
        longitude,
        distance,
        fraudScore: fraudCheck.fraudScore,
        fraudReasons: JSON.stringify(fraudCheck.fraudReasons),
        status: ScanStatus.PENDING,
        ipAddress,
        userAgent,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        sticker: {
          include: {
            venue: true,
            location: true,
          },
        },
        card: true,
      },
    });

    // 9. Update sticker stats
    await prisma.sticker.update({
      where: { id: sticker.id },
      data: {
        totalScans: { increment: 1 },
        lastScannedAt: new Date(),
      },
    });

    return scan;
  }

  /**
   * Upload receipt image and OCR data for a scan
   */
  async uploadReceipt(data: UploadReceiptData): Promise<StickerScan> {
    const { scanId, receiptImageUrl, ocrData } = data;

    const scan = await prisma.stickerScan.findUnique({
      where: { id: scanId },
      include: {
        venue: {
          include: {
            stickerConfig: true,
          },
        },
      },
    });

    if (!scan) {
      throw new Error('Scan not found');
    }

    const verifiedAmount = ocrData?.amount || ocrData?.total;

    // Update scan with receipt data
    const updated = await prisma.stickerScan.update({
      where: { id: scanId },
      data: {
        receiptImageUrl,
        ocrData: ocrData as any,
        verifiedAmount,
        status: ScanStatus.VALIDATING,
      },
    });

    // Auto-process if fraud score is low
    const config = scan.venue.stickerConfig;
    if (config && scan.fraudScore < config.autoApproveThreshold) {
      await this.approveScan(scanId);
    } else {
      // Flag for manual review
      await prisma.stickerScan.update({
        where: { id: scanId },
        data: { status: ScanStatus.MANUAL_REVIEW },
      });
    }

    return updated;
  }

  /**
   * Approve a scan and credit cashback
   */
  async approveScan(scanId: string): Promise<StickerScan> {
    const scan = await prisma.stickerScan.findUnique({
      where: { id: scanId },
      include: {
        user: true,
        venue: true,
        card: true,
      },
    });

    if (!scan) {
      throw new Error('Scan not found');
    }

    // Create transaction record
    const transaction = await prisma.transaction.create({
      data: {
        userId: scan.userId,
        venueId: scan.venueId,
        cardId: scan.cardId,
        type: TransactionType.PURCHASE,
        paymentMethod: PaymentMethod.CARD,
        amount: scan.billAmount,
        discount: scan.cashbackPercent,
        discountAmount: scan.cashbackAmount,
        finalAmount: scan.billAmount - scan.cashbackAmount,
        currency: 'BGN',
        status: TransactionStatus.COMPLETED,
        metadata: JSON.stringify({
          scanId: scan.id,
          stickerId: scan.stickerId,
          source: 'STICKER_SCAN',
        }),
      },
    });

    // Update scan status and link to transaction
    const updated = await prisma.stickerScan.update({
      where: { id: scanId },
      data: {
        status: ScanStatus.APPROVED,
        transactionId: transaction.id,
        processedAt: new Date(),
      },
      include: {
        transaction: true,
        user: true,
        sticker: {
          include: {
            venue: true,
            location: true,
          },
        },
      },
    });

    // Credit cashback to wallet
    try {
      await walletService.credit({
        userId: scan.userId,
        amount: scan.cashbackAmount,
        type: 'CASHBACK_CREDIT',
        description: `Cashback from sticker scan at ${updated.sticker.location.name}`,
        stickerScanId: scan.id,
        metadata: {
          venueId: scan.venueId,
          locationName: updated.sticker.location.name,
          billAmount: scan.billAmount,
          cardTier: scan.card?.type || 'STANDARD',
        },
      });

      logger.info(`Credited ${scan.cashbackAmount} BGN cashback for scan ${scanId}`);
    } catch (error) {
      logger.error(`Failed to credit cashback for scan ${scanId}:`, error);
      // Continue even if wallet credit fails - scan is still approved
    }

    // TODO: Send notification to user (implement in next phase)

    return updated;
  }

  /**
   * Reject a scan
   */
  async rejectScan(scanId: string, reason: string): Promise<StickerScan> {
    return prisma.stickerScan.update({
      where: { id: scanId },
      data: {
        status: ScanStatus.REJECTED,
        rejectionReason: reason,
        processedAt: new Date(),
      },
    });
  }

  /**
   * Get or create venue sticker configuration
   */
  async getOrCreateVenueConfig(venueId: string): Promise<VenueStickerConfig> {
    let config = await prisma.venueStickerConfig.findUnique({
      where: { venueId },
    });

    if (!config) {
      config = await prisma.venueStickerConfig.create({
        data: { venueId },
      });
    }

    return config;
  }

  /**
   * Update venue sticker configuration
   */
  async updateVenueConfig(venueId: string, data: Partial<VenueStickerConfig>): Promise<VenueStickerConfig> {
    return prisma.venueStickerConfig.upsert({
      where: { venueId },
      update: data,
      create: { venueId, ...data },
    });
  }

  /**
   * Calculate cashback percentage based on card type and venue config
   */
  private calculateCashbackPercent(cardType: CardType, config: VenueStickerConfig): number {
    let cashback = config.cashbackPercent;

    switch (cardType) {
      case CardType.PREMIUM:
        cashback += config.premiumBonus;
        break;
      case CardType.PLATINUM:
        cashback += config.platinumBonus;
        break;
      default:
        // STANDARD card gets base cashback
        break;
    }

    return cashback;
  }

  /**
   * Calculate distance between two GPS coordinates (Haversine formula)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth's radius in meters
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
   * Perform fraud detection checks
   */
  private async performFraudCheck(params: {
    userId: string;
    venueId: string;
    billAmount: number;
    distance?: number;
    config: VenueStickerConfig;
  }): Promise<FraudCheckResult> {
    const { userId, venueId, billAmount, distance, config } = params;

    let fraudScore = 0;
    const fraudReasons: string[] = [];

    // 1. GPS verification
    if (config.gpsVerificationEnabled && distance !== undefined) {
      if (distance > config.gpsRadiusMeters) {
        fraudScore += 30;
        fraudReasons.push(`GPS_MISMATCH: ${Math.round(distance)}m from venue`);
      }
    }

    // 2. Check for duplicate scans (same user, same venue, same day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const scansToday = await prisma.stickerScan.count({
      where: {
        userId,
        venueId,
        createdAt: { gte: today },
      },
    });

    if (scansToday >= config.maxScansPerDay) {
      fraudScore += 40;
      fraudReasons.push(`MAX_SCANS_PER_DAY: ${scansToday}/${config.maxScansPerDay}`);
    }

    // 3. Check scans this month
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const scansThisMonth = await prisma.stickerScan.count({
      where: {
        userId,
        venueId,
        createdAt: { gte: thisMonth },
      },
    });

    if (scansThisMonth >= config.maxScansPerMonth) {
      fraudScore += 50;
      fraudReasons.push(`MAX_SCANS_PER_MONTH: ${scansThisMonth}/${config.maxScansPerMonth}`);
    }

    // 4. Unusual bill amount (very high)
    if (billAmount > 1000) {
      fraudScore += 15;
      fraudReasons.push(`HIGH_BILL_AMOUNT: ${billAmount} BGN`);
    }

    // 5. Check for rapid successive scans (within 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const recentScans = await prisma.stickerScan.count({
      where: {
        userId,
        createdAt: { gte: thirtyMinutesAgo },
      },
    });

    if (recentScans > 3) {
      fraudScore += 25;
      fraudReasons.push(`RAPID_SCANNING: ${recentScans} scans in 30 minutes`);
    }

    // Determine risk level
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    if (fraudScore < 10) {
      riskLevel = 'LOW';
    } else if (fraudScore < 30) {
      riskLevel = 'MEDIUM';
    } else if (fraudScore < 60) {
      riskLevel = 'HIGH';
    } else {
      riskLevel = 'CRITICAL';
    }

    return {
      fraudScore,
      fraudReasons,
      riskLevel,
      shouldAutoApprove: fraudScore < config.autoApproveThreshold,
      requiresManualReview: fraudScore >= config.autoApproveThreshold,
    };
  }

  /**
   * Get sticker scans by user
   */
  async getScansByUser(userId: string, limit: number = 50): Promise<StickerScan[]> {
    return prisma.stickerScan.findMany({
      where: { userId },
      include: {
        sticker: {
          include: {
            venue: true,
            location: true,
          },
        },
        transaction: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get sticker scans by venue
   */
  async getScansByVenue(venueId: string, limit: number = 100): Promise<StickerScan[]> {
    return prisma.stickerScan.findMany({
      where: { venueId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        sticker: {
          include: {
            location: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get stickers for a venue
   */
  async getStickersByVenue(venueId: string): Promise<Sticker[]> {
    return prisma.sticker.findMany({
      where: { venueId },
      include: {
        location: true,
        scans: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get pending scans for manual review
   */
  async getPendingReviewScans(limit: number = 50): Promise<StickerScan[]> {
    return prisma.stickerScan.findMany({
      where: {
        status: ScanStatus.MANUAL_REVIEW,
      },
      include: {
        user: true,
        sticker: {
          include: {
            venue: true,
            location: true,
          },
        },
        card: true,
      },
      orderBy: [
        { fraudScore: 'desc' },
        { createdAt: 'asc' },
      ],
      take: limit,
    });
  }

  /**
   * Get venue sticker analytics
   */
  async getVenueAnalytics(venueId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const scans = await prisma.stickerScan.findMany({
      where: {
        venueId,
        createdAt: { gte: startDate },
      },
      include: {
        sticker: {
          include: {
            location: true,
          },
        },
      },
    });

    const totalScans = scans.length;
    const approvedScans = scans.filter(s => s.status === ScanStatus.APPROVED).length;
    const rejectedScans = scans.filter(s => s.status === ScanStatus.REJECTED).length;
    const pendingScans = scans.filter(s => s.status === ScanStatus.PENDING || s.status === ScanStatus.VALIDATING).length;

    const totalRevenue = scans
      .filter(s => s.status === ScanStatus.APPROVED)
      .reduce((sum, s) => sum + s.billAmount, 0);

    const totalCashback = scans
      .filter(s => s.status === ScanStatus.APPROVED)
      .reduce((sum, s) => sum + s.cashbackAmount, 0);

    const avgBillAmount = totalScans > 0 ? totalRevenue / approvedScans : 0;
    const avgCashback = approvedScans > 0 ? totalCashback / approvedScans : 0;

    return {
      period: {
        days,
        startDate,
        endDate: new Date(),
      },
      scans: {
        total: totalScans,
        approved: approvedScans,
        rejected: rejectedScans,
        pending: pendingScans,
        approvalRate: totalScans > 0 ? (approvedScans / totalScans) * 100 : 0,
      },
      revenue: {
        total: totalRevenue,
        average: avgBillAmount,
      },
      cashback: {
        total: totalCashback,
        average: avgCashback,
        percentage: totalRevenue > 0 ? (totalCashback / totalRevenue) * 100 : 0,
      },
    };
  }

  /**
   * Get admin review statistics
   */
  async getAdminStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get counts for different statuses
    const pending = await prisma.stickerScan.count({
      where: {
        status: ScanStatus.MANUAL_REVIEW,
      },
    });

    const approvedToday = await prisma.stickerScan.count({
      where: {
        status: ScanStatus.APPROVED,
        updatedAt: { gte: today },
      },
    });

    const rejectedToday = await prisma.stickerScan.count({
      where: {
        status: ScanStatus.REJECTED,
        updatedAt: { gte: today },
      },
    });

    // Calculate average fraud score for pending scans
    const pendingScans = await prisma.stickerScan.findMany({
      where: {
        status: ScanStatus.MANUAL_REVIEW,
      },
      select: {
        fraudScore: true,
      },
    });

    const avgFraudScore = pendingScans.length > 0
      ? pendingScans.reduce((sum, scan) => sum + scan.fraudScore, 0) / pendingScans.length
      : 0;

    return {
      pending,
      approved: approvedToday,
      rejected: rejectedToday,
      avgFraudScore,
    };
  }
}

export const stickerService = new StickerService();
