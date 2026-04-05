import { Sticker, StickerScan, StickerLocation, VenueStickerConfig, ScanStatus, StickerStatus, LocationType, TransactionStatus, TransactionType, PaymentMethod, SubscriptionStatus, WalletTransactionType } from '@prisma/client';
import QRCode from 'qrcode';
import { prisma } from '../lib/prisma';
import { walletService } from './wallet.service';
import { logger } from '../utils/logger';
import { partnerTypeService } from './partnerType.service';
import { fraudDetectionService } from './fraudDetection.service';

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

export interface CreateSessionData {
  userId: string;
  stickerId: string;
  cardId?: string; // Optional — resolved from userId when omitted
  latitude?: number;
  longitude?: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface ScanStickerData {
  userId: string;
  stickerId: string;
  cardId?: string; // Optional — resolved from userId when omitted
  billAmount: number;
  latitude?: number;
  longitude?: number;
  ipAddress?: string;
  userAgent?: string;
  /** If provided, complete an existing SESSION_ACTIVE session rather than creating a new scan. */
  sessionId?: string;
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

    // Store the QR payload (JSON string) — the client renders the QR image from this.
    // We intentionally do NOT store a base64 PNG: the unique index on qrCode has a
    // 2704-byte limit in Postgres BTREE, which a base64-encoded PNG easily exceeds.
    const qrCodePayload = JSON.stringify(qrData);

    // Create sticker record
    const sticker = await prisma.sticker.create({
      data: {
        venueId: location.venueId,
        locationId: location.id,
        stickerId,
        qrCode: qrCodePayload,
        locationType: location.locationType,
        status: StickerStatus.PENDING,
        metadata: JSON.stringify({ stickerId }),
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
   * Get a guaranteed-unique venue code.
   *
   * Uses the first 8 characters of the venue's UUID (hex).
   * This is collision-free because UUIDs are unique per venue.
   * Name-based codes were intentionally removed: two venues with the
   * same name prefix (e.g., two "McDonald's" branches) would produce
   * the same code, causing sticker ID collisions.
   */
  private async getVenueCode(venueId: string): Promise<string> {
    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) throw new Error('Venue not found');
    // Strip hyphens from UUID and take the first 8 hex characters → always unique
    return venue.id.replace(/-/g, '').substring(0, 8).toUpperCase();
  }

  /**
   * Look up a sticker by its short ID and return lightweight validation info.
   * Used by the pre-scan validate endpoint — does not initiate a scan or
   * perform fraud / subscription checks.
   */
  async validateStickerById(stickerId: string): Promise<{
    valid: boolean;
    venueId?: string;
    venueName?: string;
    cashbackPercent?: number;
    message?: string;
  }> {
    const sticker = await prisma.sticker.findUnique({
      where: { stickerId },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            stickerConfig: true,
            partner: { select: { id: true, discountRate: true, partnerType: { select: { maxDiscountRate: true } } } },
          },
        },
      },
    });

    if (!sticker) {
      return { valid: false, message: 'Sticker not found' };
    }

    if (sticker.status !== StickerStatus.ACTIVE) {
      return { valid: false, message: `Sticker is ${sticker.status.toLowerCase()}` };
    }

    // Show the best-case cashback % for this venue (Premium tier at partner's discount level).
    // The actual % at scan time depends on the user's card tier.
    const { cashbackPercent } = await fraudDetectionService.calculateCashback({
      venueId: sticker.venue.partner?.id,
      amount: 100, // dummy amount — we only need the percent
      cardTier: 'PREMIUM', // show maximum possible
    });

    return {
      valid: true,
      venueId: sticker.venueId,
      venueName: sticker.venue.name,
      cashbackPercent,
      message: 'Valid BOOM sticker',
    };
  }

  /**
   * Register a BOOM session when the user scans the QR sticker.
   *
   * Per BOOM_Card_Master_Functionality §6, Step 3: "Scans QR code on the table/venue →
   * Create active BOOM session; record time, table, venue, device, and location."
   *
   * This runs subscription + GPS validation immediately so the server knows the exact
   * scan time. The receipt (+ bill amount) are attached later via scanSticker(sessionId).
   */
  async createSession(data: CreateSessionData): Promise<StickerScan> {
    const { userId, latitude, longitude, ipAddress, userAgent } = data;
    let { stickerId, cardId } = data;

    // 1. Validate sticker
    const sticker = await prisma.sticker.findUnique({
      where: { stickerId },
      include: {
        venue: { include: { stickerConfig: true } },
        location: true,
      },
    });

    if (!sticker) throw new Error('Invalid sticker code');
    if (sticker.status !== StickerStatus.ACTIVE) throw new Error('Sticker is not active');

    // 2. Resolve card
    if (!cardId) {
      const userCard = await prisma.card.findFirst({ where: { userId } });
      if (!userCard) throw new Error('No card found for your account. Please create a card first.');
      cardId = userCard.id;
    }
    const card = await prisma.card.findUnique({ where: { id: cardId }, include: { user: true } });
    if (!card) throw new Error('Card not found');
    if (card.userId !== userId) throw new Error('Card does not belong to user');
    if (card.status !== 'ACTIVE') throw new Error(`Card is ${card.status.toLowerCase()}`);

    // 3. Subscription / partner access check
    const partner = await prisma.partner.findFirst({
      where: { venues: { some: { id: sticker.venueId } } },
      select: { id: true, partnerTypeId: true },
    });

    if (partner?.partnerTypeId) {
      const userSubscription = await prisma.subscription.findFirst({
        where: { userId, status: SubscriptionStatus.ACTIVE },
        orderBy: { currentPeriodEnd: 'desc' },
      });
      const redeemableTypeIds = await partnerTypeService.getRedeemableTypeIdsForPlan(
        userSubscription?.plan ?? null
      );
      if (!redeemableTypeIds.includes(partner.partnerTypeId)) {
        throw new Error(
          'Your current subscription does not include access to this partner. ' +
          'Upgrade your plan to scan this venue.'
        );
      }
    }

    // 4. GPS check
    const config = sticker.venue.stickerConfig || (await this.getOrCreateVenueConfig(sticker.venueId));
    let distance: number | undefined;
    if (latitude !== undefined && longitude !== undefined) {
      distance = this.calculateDistance(latitude, longitude, sticker.venue.latitude, sticker.venue.longitude);
    }

    if (config.gpsVerificationEnabled) {
      if (distance === undefined) {
        throw new Error('Location access is required to scan at this venue. Please enable GPS and try again.');
      }
      if (distance > config.gpsRadiusMeters) {
        throw new Error(
          `You must be within ${config.gpsRadiusMeters}m of the venue to scan. ` +
          `You are currently ${Math.round(distance)}m away.`
        );
      }
    }

    // 5. Create SESSION_ACTIVE record (no bill amount yet)
    const session = await prisma.stickerScan.create({
      data: {
        userId,
        stickerId: sticker.id,
        venueId: sticker.venueId,
        cardId,
        billAmount: 0,
        cashbackPercent: 0,
        cashbackAmount: 0,
        sessionStartedAt: new Date(),
        status: ScanStatus.SESSION_ACTIVE,
        latitude,
        longitude,
        distance,
        fraudScore: 0,
        ipAddress,
        userAgent,
      },
      include: {
        sticker: { include: { venue: true, location: true } },
        card: true,
      },
    });

    // Update sticker last-scanned timestamp
    await prisma.sticker.update({
      where: { id: sticker.id },
      data: { lastScannedAt: new Date() },
    });

    logger.info(`Session created: ${session.id} for sticker ${stickerId} by user ${userId}`);
    return session;
  }

  /**
   * Validate and initiate a sticker scan
   */
  async scanSticker(data: ScanStickerData): Promise<StickerScan> {
    const { userId, billAmount, latitude, longitude, ipAddress, userAgent, sessionId } = data;

    // ── Path A: complete an existing SESSION_ACTIVE session ──────────────────
    if (sessionId) {
      const existing = await prisma.stickerScan.findUnique({
        where: { id: sessionId },
        include: {
          sticker: { include: { venue: { include: { stickerConfig: true } }, location: true } },
          card: true,
        },
      });

      if (!existing) throw new Error('Session not found');
      if (existing.userId !== userId) throw new Error('Session does not belong to user');
      if (existing.status !== ScanStatus.SESSION_ACTIVE) {
        throw new Error('Session has already been submitted or is no longer active');
      }

      const config = existing.sticker.venue.stickerConfig ||
        await this.getOrCreateVenueConfig(existing.venueId);

      if (billAmount < config.minBillAmount) {
        throw new Error(`Minimum bill amount is ${config.minBillAmount} BGN`);
      }

      const partner = await prisma.partner.findFirst({
        where: { venues: { some: { id: existing.venueId } } },
        select: { id: true },
      });

      const { cashbackAmount, cashbackPercent } = await fraudDetectionService.calculateCashback({
        venueId: partner?.id,
        amount: billAmount,
        cardTier: existing.card.type as 'LIGHT' | 'BASIC' | 'PREMIUM',
      });

      const fraudCheck = await this.performFraudCheck({
        userId,
        venueId: existing.venueId,
        billAmount,
        distance: existing.distance ?? undefined,
        config,
      });

      const updated = await prisma.stickerScan.update({
        where: { id: sessionId },
        data: {
          billAmount,
          cashbackPercent,
          cashbackAmount,
          fraudScore: fraudCheck.fraudScore,
          fraudReasons: JSON.stringify(fraudCheck.fraudReasons),
          status: ScanStatus.PENDING,
          // Keep original GPS from session start; update only if re-submitted
          ...(latitude !== undefined && { latitude }),
          ...(longitude !== undefined && { longitude }),
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          sticker: { include: { venue: true, location: true } },
          card: true,
        },
      });

      await prisma.sticker.update({
        where: { id: existing.stickerId },
        data: { totalScans: { increment: 1 } },
      });

      return updated;
    }

    // ── Path B: legacy — create scan + session in one call (no sessionId) ────
    let { stickerId, cardId } = data;

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

    // 2. Resolve and validate the user's card
    let resolvedCardId = cardId;
    if (!resolvedCardId) {
      const userCard = await prisma.card.findFirst({ where: { userId } });
      if (!userCard) {
        throw new Error('No card found for your account. Please create a card first.');
      }
      resolvedCardId = userCard.id;
    }

    const card = await prisma.card.findUnique({
      where: { id: resolvedCardId },
      include: { user: true },
    });

    if (!card) throw new Error('Card not found');
    if (card.userId !== userId) throw new Error('Card does not belong to user');
    if (card.status !== 'ACTIVE') throw new Error(`Card is ${card.status.toLowerCase()}`);

    // 3. Subscription check
    const partner = await prisma.partner.findFirst({
      where: { venues: { some: { id: sticker.venueId } } },
      select: { id: true, partnerTypeId: true, status: true },
    });

    if (partner && partner.partnerTypeId) {
      const userSubscription = await prisma.subscription.findFirst({
        where: { userId, status: SubscriptionStatus.ACTIVE },
        orderBy: { currentPeriodEnd: 'desc' },
      });

      const userPlan = userSubscription?.plan ?? null;
      const redeemableTypeIds = await partnerTypeService.getRedeemableTypeIdsForPlan(userPlan);

      if (!redeemableTypeIds.includes(partner.partnerTypeId)) {
        throw new Error(
          `Your current subscription does not include access to this partner. ` +
          `Upgrade your plan to scan this venue.`,
        );
      }
    }

    // 4. Config + bill amount validation
    const config = sticker.venue.stickerConfig || await this.getOrCreateVenueConfig(sticker.venueId);

    if (billAmount < config.minBillAmount) {
      throw new Error(`Minimum bill amount is ${config.minBillAmount} BGN`);
    }

    // 5. Cashback calculation
    const { cashbackAmount, cashbackPercent } = await fraudDetectionService.calculateCashback({
      venueId: partner?.id,
      amount: billAmount,
      cardTier: card.type as 'LIGHT' | 'BASIC' | 'PREMIUM',
    });

    // 6. GPS distance
    let distance: number | undefined;
    if (latitude !== undefined && longitude !== undefined) {
      distance = this.calculateDistance(latitude, longitude, sticker.venue.latitude, sticker.venue.longitude);
    }

    if (config.gpsVerificationEnabled) {
      if (distance === undefined) {
        throw new Error('Location access is required to scan at this venue. Please enable GPS and try again.');
      }
      if (distance > config.gpsRadiusMeters) {
        throw new Error(
          `You must be within ${config.gpsRadiusMeters}m of the venue to scan. You are currently ${Math.round(distance)}m away.`
        );
      }
    }

    // 7. Fraud check
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
        cardId: resolvedCardId,
        billAmount,
        cashbackPercent,
        cashbackAmount,
        sessionStartedAt: new Date(), // legacy path: session starts and completes together
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
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        sticker: { include: { venue: true, location: true } },
        card: true,
      },
    });

    await prisma.sticker.update({
      where: { id: sticker.id },
      data: { totalScans: { increment: 1 }, lastScannedAt: new Date() },
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
        sticker: {
          include: {
            venue: true,
            location: true,
          },
        },
      },
    });

    if (!scan) {
      throw new Error('Scan not found');
    }

    if (scan.status === ScanStatus.APPROVED) {
      throw new Error('Scan has already been approved');
    }

    if (scan.cashbackAmount <= 0) {
      throw new Error('Scan cashback amount must be positive');
    }

    // Save original state so rollback can restore precisely.
    const oldStatus = scan.status;
    const oldProcessedAt = scan.processedAt;

    // Atomic claim — prevents concurrent double-approval.
    // Two simultaneous calls both see status !== APPROVED above, but only one
    // updateMany can match the { status: { not: APPROVED } } condition.
    const claimResult = await prisma.stickerScan.updateMany({
      where: { id: scanId, status: { not: ScanStatus.APPROVED } },
      data: { status: ScanStatus.APPROVED, processedAt: new Date() },
    });

    if (claimResult.count === 0) {
      throw new Error('Scan has already been approved');
    }

    const locationName = scan.sticker?.location?.name ?? 'location';

    // All post-claim writes are inside a single try/catch so ANY failure — including
    // transaction.create or stickerScan.update — rolls back the claim. Without this,
    // a DB error on those steps would leave the scan permanently APPROVED with no
    // cashback and no retry path (both guards throw "already approved" on re-entry).
    let transactionId: string | null = null;
    let updated: StickerScan | null = null;

    try {
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
      transactionId = transaction.id;

      updated = await prisma.stickerScan.update({
        where: { id: scanId },
        data: { transactionId: transaction.id },
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
      }) as unknown as StickerScan;

      await walletService.credit({
        userId: scan.userId,
        amount: scan.cashbackAmount,
        type: WalletTransactionType.CASHBACK_CREDIT,
        description: `Cashback from sticker scan at ${locationName}`,
        stickerScanId: scan.id,
        metadata: {
          venueId: scan.venueId,
          locationName,
          billAmount: scan.billAmount,
          cardTier: scan.card?.type || 'LIGHT',
        },
      });

      logger.info(`Credited ${scan.cashbackAmount} BGN cashback for scan ${scanId}`);
    } catch (error) {
      logger.error(`Failed to process scan ${scanId} after claim, rolling back:`, error);
      // Each rollback step is independent so a failure on one doesn't prevent the other.
      try {
        await prisma.stickerScan.update({
          where: { id: scanId },
          data: { status: oldStatus, transactionId: null, processedAt: oldProcessedAt },
        });
      } catch (rollbackError) {
        logger.error(`CRITICAL: Failed to restore scan status for ${scanId}. Manual intervention required.`, rollbackError);
      }
      if (transactionId) {
        try {
          await prisma.transaction.delete({ where: { id: transactionId } });
        } catch (rollbackError) {
          logger.error(`CRITICAL: Failed to delete orphaned transaction ${transactionId} for scan ${scanId}. Manual intervention required.`, rollbackError);
        }
      }
      throw new Error('Failed to process scan. Scan approval has been rolled back — please retry.');
    }

    // TODO: Send notification to user (implement in next phase)

    return updated!;
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
