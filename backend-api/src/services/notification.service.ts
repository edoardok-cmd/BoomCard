import { prisma } from '../lib/prisma';
import { emailService } from './email.service';
import { emitNotification } from '../lib/socket';
import { sendWebPushToUser } from '../lib/webPush';
import { sendExpoPushToUser } from '../lib/expoPush';
import { logger } from '../utils/logger';

type NotificationSeverity = 'info' | 'warning' | 'critical';

/**
 * Notification Service
 *
 * Sends notifications to users about receipt processing events
 * - Receipt approved/rejected notifications
 * - Cashback credited notifications
 * - Fraud alert notifications
 * - Daily/weekly summary emails
 *
 * Supports multiple notification channels:
 * - In-app (DB row + socket event to the bell)
 * - Web Push (browser push via VAPID)
 * - Email (via SMTP)
 */

interface NotificationParams {
  userId: string;
  type: string;
  title: string;
  titleBg?: string;
  message: string;
  messageBg?: string;
  data?: Record<string, any>;
  // Lowercase to match the DB column (`String @default("medium")`) and the
  // frontend NotificationPriority union. 'urgent' drives elevated toast UX.
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  actionUrl?: string;
  actionText?: string;
  actionTextBg?: string;
  imageUrl?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  expiresAt?: Date;
}

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class NotificationService {
  // NOTE: Any marketing email sends MUST check user.marketingConsentEmail before proceeding.
  // See Spec §6.3. Use the marketingConsentEmail field on the User model.

  /**
   * Send receipt approved notification
   */
  async notifyReceiptApproved(params: {
    userId: string;
    receiptId: string;
    merchantName: string;
    cashbackAmount: number;
  }): Promise<void> {
    const { userId, receiptId, merchantName, cashbackAmount } = params;

    try {
      // Create in-app notification
      await this.createNotification({
        userId,
        type: 'RECEIPT_APPROVED',
        title: 'Receipt Approved!',
        titleBg: 'Касовата бележка е одобрена!',
        message: `Your receipt from ${merchantName} was approved. You earned ${cashbackAmount.toFixed(2)} BGN cashback!`,
        messageBg: `Вашата касова бележка от ${merchantName} е одобрена. Спечелихте ${cashbackAmount.toFixed(2)} лв. кешбек!`,
        data: {
          receiptId,
          merchantName,
          cashbackAmount,
        },
        priority: 'high',
      });

      // Send push notification
      await this.sendPushNotification({
        userId,
        title: 'Receipt Approved!',
        body: `You earned ${cashbackAmount.toFixed(2)} BGN cashback from ${merchantName}`,
        data: { receiptId, type: 'receipt_approved' },
      });

      console.log(`✅ Approval notification sent for receipt ${receiptId}`);
    } catch (error) {
      console.error('❌ Error sending approval notification:', error);
    }
  }

  /**
   * Send sticker scan approved notification.
   * Separate from notifyReceiptApproved so the message is scan-specific
   * and the notification type is distinct for client-side routing.
   */
  async notifyStickerScanApproved(params: {
    userId: string;
    scanId: string;
    venueName: string;
    cashbackAmount: number;
  }): Promise<void> {
    const { userId, scanId, venueName, cashbackAmount } = params;

    try {
      await this.createNotification({
        userId,
        type: 'STICKER_SCAN_APPROVED',
        title: 'Cashback Earned!',
        titleBg: 'Спечелихте кешбек!',
        message: `Your visit to ${venueName} was confirmed. You earned ${cashbackAmount.toFixed(2)} BGN cashback!`,
        messageBg: `Посещението ви в ${venueName} е потвърдено. Спечелихте ${cashbackAmount.toFixed(2)} лв. кешбек!`,
        data: {
          scanId,
          venueName,
          cashbackAmount,
        },
        priority: 'high',
      });

      await this.sendPushNotification({
        userId,
        title: 'Cashback Earned!',
        body: `+${cashbackAmount.toFixed(2)} BGN from ${venueName}`,
        data: { scanId, type: 'sticker_scan_approved' },
      });
    } catch (error) {
      console.error('❌ Error sending sticker scan approved notification:', error);
    }
  }

  /**
   * Send receipt rejected notification
   */
  async notifyReceiptRejected(params: {
    userId: string;
    receiptId: string;
    merchantName: string;
    reason: string;
  }): Promise<void> {
    const { userId, receiptId, merchantName, reason } = params;

    try {
      await this.createNotification({
        userId,
        type: 'RECEIPT_REJECTED',
        title: 'Receipt Not Approved',
        titleBg: 'Касовата бележка не е одобрена',
        message: `Your receipt from ${merchantName} was not approved. Reason: ${reason}`,
        messageBg: `Вашата касова бележка от ${merchantName} не е одобрена. Причина: ${reason}`,
        data: {
          receiptId,
          merchantName,
          reason,
        },
        priority: 'medium',
      });

      await this.sendPushNotification({
        userId,
        title: 'Receipt Not Approved',
        body: `Your receipt from ${merchantName} was not approved`,
        data: { receiptId, type: 'receipt_rejected' },
      });

      console.log(`📧 Rejection notification sent for receipt ${receiptId}`);
    } catch (error) {
      console.error('❌ Error sending rejection notification:', error);
    }
  }

  /**
   * Send manual review required notification
   */
  async notifyManualReviewRequired(params: {
    userId: string;
    receiptId: string;
    merchantName: string;
    estimatedReviewTime?: string;
  }): Promise<void> {
    const { userId, receiptId, merchantName, estimatedReviewTime } = params;

    try {
      await this.createNotification({
        userId,
        type: 'RECEIPT_MANUAL_REVIEW',
        title: 'Receipt Under Review',
        titleBg: 'Касовата бележка се преглежда',
        message: `Your receipt from ${merchantName} requires manual verification. ${estimatedReviewTime || 'This usually takes 24-48 hours.'}`,
        messageBg: `Вашата касова бележка от ${merchantName} изисква ръчна проверка. ${estimatedReviewTime || 'Обикновено отнема 24-48 часа.'}`,
        data: {
          receiptId,
          merchantName,
        },
        priority: 'low',
      });

      console.log(`🔍 Review notification sent for receipt ${receiptId}`);
    } catch (error) {
      console.error('❌ Error sending review notification:', error);
    }
  }

  /**
   * Send cashback credited notification
   */
  async notifyCashbackCredited(params: {
    userId: string;
    amount: number;
    newBalance: number;
  }): Promise<void> {
    const { userId, amount, newBalance } = params;

    try {
      await this.createNotification({
        userId,
        type: 'CASHBACK_CREDITED',
        title: 'Cashback Credited',
        titleBg: 'Кешбек е кредитиран',
        message: `${amount.toFixed(2)} BGN has been added to your account. New balance: ${newBalance.toFixed(2)} BGN`,
        messageBg: `${amount.toFixed(2)} лв. са добавени към акаунта ви. Нов баланс: ${newBalance.toFixed(2)} лв.`,
        data: {
          amount,
          newBalance,
        },
        priority: 'high',
      });

      await this.sendPushNotification({
        userId,
        title: 'Cashback Credited',
        body: `+${amount.toFixed(2)} BGN added to your account`,
        data: { amount, type: 'cashback_credited' },
      });

      console.log(`💰 Cashback notification sent to user ${userId}`);
    } catch (error) {
      console.error('❌ Error sending cashback notification:', error);
    }
  }

  /**
   * Send fraud alert notification to admins
   */
  async notifyFraudAlert(params: {
    receiptId: string;
    userId: string;
    fraudScore: number;
    fraudReasons: string[];
  }): Promise<void> {
    const { receiptId, userId, fraudScore, fraudReasons } = params;

    try {
      // Send to admin users
      const admins = await this.getAdminUsers();

      for (const admin of admins) {
        await this.createNotification({
          userId: admin.id,
          type: 'FRAUD_ALERT',
          title: 'High Fraud Score Detected',
          titleBg: 'Засечен е висок риск от измама',
          message: `Receipt ${receiptId} from user ${userId} has fraud score ${fraudScore}. Reasons: ${fraudReasons.join(', ')}`,
          messageBg: `Касова бележка ${receiptId} от потребител ${userId} с риск ${fraudScore}. Причини: ${fraudReasons.join(', ')}`,
          data: {
            receiptId,
            userId,
            fraudScore,
            fraudReasons,
          },
          priority: 'high',
        });
      }

      // Also send email to each admin
      for (const admin of admins) {
        if (admin.email) {
          emailService.sendFraudAlertEmail(admin.email, {
            receiptId,
            userId,
            fraudScore,
            fraudReasons,
          }).catch((err) => {
            console.error('❌ Error sending fraud alert email:', err);
          });
        }
      }

      console.log(`🚨 Fraud alert sent for receipt ${receiptId} (score: ${fraudScore})`);
    } catch (error) {
      console.error('❌ Error sending fraud alert:', error);
    }
  }

  /**
   * Send daily receipt summary email
   */
  async sendDailySummary(userId: string): Promise<void> {
    try {
      // Get today's receipts
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const receipts = await prisma.receipt.findMany({
        where: {
          userId,
          createdAt: { gte: today },
        },
      });

      if (receipts.length === 0) {
        return; // No receipts today, skip email
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true },
      });

      if (!user || !user.email) return;

      const totalCashback = receipts
        .filter((r) => r.status === 'APPROVED')
        .reduce((sum, r) => sum + r.cashbackAmount, 0);

      const approved = receipts.filter((r) => r.status === 'APPROVED').length;
      const pending = receipts.filter((r) =>
        ['PENDING', 'MANUAL_REVIEW', 'PROCESSING'].includes(r.status)
      ).length;

      await emailService.sendEmail({
        to: user.email,
        subject: `Your Daily Receipt Summary - ${receipts.length} receipts`,
        html: this.generateDailySummaryHTML({
          firstName: user.firstName || 'User',
          receiptsCount: receipts.length,
          approved,
          pending,
          totalCashback,
          receipts,
        }),
      });

      console.log(`📨 Daily summary sent to ${user.email}`);
    } catch (error) {
      console.error('❌ Error sending daily summary:', error);
    }
  }

  /**
   * Notify a partner that their submitted menu URL was approved.
   * Uses SYSTEM type (no dedicated enum value) until the NotificationType
   * enum gets MENU_APPROVED — the icon bucket falls through to 'info' which
   * is fine for this event.
   */
  async notifyMenuApproved(params: {
    partnerUserId: string;
    venueId: string;
    venueName: string;
    menuUrl: string;
  }): Promise<void> {
    const { partnerUserId, venueId, venueName, menuUrl } = params;

    try {
      await this.createNotification({
        userId: partnerUserId,
        type: 'SYSTEM',
        title: 'Menu Approved',
        titleBg: 'Менюто е одобрено',
        message: `Your menu for ${venueName} is now live.`,
        messageBg: `Менюто за ${venueName} вече е публикувано.`,
        priority: 'medium',
        actionUrl: '/partners/menus',
        actionText: 'View menu',
        actionTextBg: 'Прегледай',
        relatedEntityType: 'venue',
        relatedEntityId: venueId,
        data: { venueId, venueName, menuUrl },
      });

      await this.sendPushNotification({
        userId: partnerUserId,
        title: 'Menu Approved',
        body: `Your menu for ${venueName} is now live.`,
        data: { venueId, type: 'menu_approved', url: '/partners/menus' },
      });
    } catch (error) {
      console.error('❌ Error sending menu approved notification:', error);
    }
  }

  /**
   * Notify a partner that their submitted menu URL was rejected.
   * Partner keeps the rejected URL visible in-app so they can edit; the
   * notification surfaces the reason so they know what to change.
   */
  async notifyMenuRejected(params: {
    partnerUserId: string;
    venueId: string;
    venueName: string;
    reason: string;
  }): Promise<void> {
    const { partnerUserId, venueId, venueName, reason } = params;

    try {
      await this.createNotification({
        userId: partnerUserId,
        type: 'SYSTEM',
        title: 'Menu Rejected',
        titleBg: 'Менюто е отхвърлено',
        message: `Your menu for ${venueName} was rejected: ${reason}`,
        messageBg: `Менюто за ${venueName} беше отхвърлено: ${reason}`,
        priority: 'high',
        actionUrl: '/partners/menus',
        actionText: 'Update menu',
        actionTextBg: 'Обнови менюто',
        relatedEntityType: 'venue',
        relatedEntityId: venueId,
        data: { venueId, venueName, reason },
      });

      await this.sendPushNotification({
        userId: partnerUserId,
        title: 'Menu Rejected',
        body: `Your menu for ${venueName} was rejected. Tap to update.`,
        data: { venueId, type: 'menu_rejected', url: '/partners/menus' },
      });
    } catch (error) {
      console.error('❌ Error sending menu rejected notification:', error);
    }
  }

  /**
   * Notify a partner that a customer review was approved and is now live.
   * Fires from reviewsService.approveReview so partners don't get pinged for
   * reviews still in moderation (or later rejected).
   */
  async notifyReviewReceived(params: {
    partnerUserId: string;
    reviewId: string;
    rating: number;
    reviewerName?: string;
  }): Promise<void> {
    const { partnerUserId, reviewId, rating, reviewerName } = params;
    const who = reviewerName?.trim() || 'A customer';
    const whoBg = reviewerName?.trim() || 'Клиент';

    try {
      await this.createNotification({
        userId: partnerUserId,
        type: 'REVIEW_RECEIVED',
        title: 'New review',
        titleBg: 'Ново ревю',
        message: `${who} left a ${rating}-star review.`,
        messageBg: `${whoBg} остави ревю с ${rating} звезди.`,
        priority: rating <= 2 ? 'high' : 'medium',
        actionUrl: '/analytics',
        actionText: 'View reviews',
        actionTextBg: 'Виж ревютата',
        relatedEntityType: 'review',
        relatedEntityId: reviewId,
        data: { reviewId, rating, reviewerName },
      });

      await this.sendPushNotification({
        userId: partnerUserId,
        title: 'New review',
        body: `${who} left a ${rating}-star review.`,
        data: { reviewId, type: 'review_received', url: '/analytics' },
      });
    } catch (error) {
      console.error('❌ Error sending review received notification:', error);
    }
  }

  /**
   * Notify user that a payment or subscription renewal failed.
   * Prompts them to update their payment method.
   */
  async notifyPaymentFailed(params: {
    userId: string;
    paymentIntentId: string;
    amount: number;
    currency: string;
  }): Promise<void> {
    const { userId, paymentIntentId, amount, currency } = params;

    try {
      await this.createNotification({
        userId,
        type: 'PAYMENT_FAILED',
        title: 'Payment Failed',
        titleBg: 'Плащането не успя',
        message: `Your payment of ${amount.toFixed(2)} ${currency} could not be processed. Please update your payment method to avoid service interruption.`,
        messageBg: `Плащането ви от ${amount.toFixed(2)} ${currency} не можа да бъде обработено. Моля, актуализирайте метода си на плащане, за да избегнете прекъсване на услугата.`,
        data: { paymentIntentId, amount, currency },
        priority: 'high',
      });

      // Send email notification
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true },
      });

      if (user?.email) {
        await emailService.sendEmail({
          to: user.email,
          subject: 'Action Required: Payment Failed',
          html: `
            <p>Hi ${user.firstName || 'there'},</p>
            <p>Your payment of <strong>${amount.toFixed(2)} ${currency}</strong> could not be processed.</p>
            <p>Please update your payment method in the app to avoid any interruption to your subscription.</p>
            <p>— The BoomCard Team</p>
          `,
        }).catch((err) => {
          console.error('Error sending payment-failed email:', err);
        });
      }
    } catch (error) {
      console.error('Error sending payment-failed notification:', error);
    }
  }

  // ===== Partner-facing event notifications =====

  /**
   * Notify a venue's partner owner that a customer just had a cashback
   * sticker scan approved at their venue. Fires alongside the existing
   * customer-facing notifyStickerScanApproved so both sides learn about
   * the event in real time.
   */
  async notifyPartnerScanAtVenue(params: {
    venueId: string;
    scanId: string;
    billAmount: number;
    cashbackAmount: number;
  }): Promise<void> {
    try {
      const venue = await this.getVenuePartnerOwner(params.venueId);
      if (!venue) return;
      await this.createNotification({
        userId: venue.partnerUserId,
        type: 'SYSTEM',
        title: 'New scan at your venue',
        titleBg: 'Ново сканиране във вашия обект',
        message: `A customer just scanned at ${venue.venueName} — ${params.billAmount.toFixed(2)} BGN bill, ${params.cashbackAmount.toFixed(2)} BGN cashback.`,
        messageBg: `Клиент току-що сканира в ${venue.venueName} — сметка ${params.billAmount.toFixed(2)} лв., кешбек ${params.cashbackAmount.toFixed(2)} лв.`,
        priority: 'low',
        actionUrl: '/analytics',
        actionText: 'View analytics',
        actionTextBg: 'Виж анализа',
        relatedEntityType: 'sticker_scan',
        relatedEntityId: params.scanId,
        data: { venueId: params.venueId, scanId: params.scanId, billAmount: params.billAmount, cashbackAmount: params.cashbackAmount },
      });
    } catch (error) {
      logger.error('❌ Error sending partner scan notification:', error);
    }
  }

  /**
   * Notify a venue's partner owner that a customer's uploaded receipt
   * (classic OCR flow, not sticker) at their venue was approved.
   */
  async notifyPartnerReceiptAtVenue(params: {
    venueId: string;
    receiptId: string;
    totalAmount: number;
    cashbackAmount: number;
  }): Promise<void> {
    try {
      const venue = await this.getVenuePartnerOwner(params.venueId);
      if (!venue) return;
      await this.createNotification({
        userId: venue.partnerUserId,
        type: 'SYSTEM',
        title: 'New receipt at your venue',
        titleBg: 'Нова касова бележка във вашия обект',
        message: `A customer submitted a ${params.totalAmount.toFixed(2)} BGN receipt at ${venue.venueName}. ${params.cashbackAmount.toFixed(2)} BGN cashback credited.`,
        messageBg: `Клиент качи касова бележка за ${params.totalAmount.toFixed(2)} лв. в ${venue.venueName}. Кешбек: ${params.cashbackAmount.toFixed(2)} лв.`,
        priority: 'low',
        actionUrl: '/analytics',
        actionText: 'View analytics',
        actionTextBg: 'Виж анализа',
        relatedEntityType: 'receipt',
        relatedEntityId: params.receiptId,
        data: { venueId: params.venueId, receiptId: params.receiptId, totalAmount: params.totalAmount, cashbackAmount: params.cashbackAmount },
      });
    } catch (error) {
      logger.error('❌ Error sending partner receipt notification:', error);
    }
  }

  /**
   * Notify the partner that owns an offer that a customer just redeemed it.
   */
  async notifyPartnerOfferRedeemed(params: {
    offerId: string;
    userName?: string;
    code: string;
  }): Promise<void> {
    try {
      const offer = await prisma.offer.findUnique({
        where: { id: params.offerId },
        select: {
          title: true,
          partner: { select: { businessName: true, user: { select: { id: true } } } },
        },
      });
      const partnerUserId = offer?.partner?.user?.id;
      if (!partnerUserId) return;
      const who = params.userName?.trim() || 'A customer';
      const whoBg = params.userName?.trim() || 'Клиент';
      await this.createNotification({
        userId: partnerUserId,
        type: 'SYSTEM',
        title: 'Offer redeemed',
        titleBg: 'Офертата е използвана',
        message: `${who} just redeemed "${offer?.title || 'your offer'}" — code ${params.code}.`,
        messageBg: `${whoBg} използва "${offer?.title || 'вашата оферта'}" — код ${params.code}.`,
        priority: 'medium',
        actionUrl: '/partners/offers',
        actionText: 'View offers',
        actionTextBg: 'Виж офертите',
        relatedEntityType: 'offer',
        relatedEntityId: params.offerId,
        data: { offerId: params.offerId, code: params.code, userName: params.userName },
      });

      await this.sendPushNotification({
        userId: partnerUserId,
        title: 'Offer redeemed',
        body: `${who} redeemed your offer.`,
        data: { offerId: params.offerId, type: 'offer_redeemed', url: '/partners/offers' },
      });
    } catch (error) {
      logger.error('❌ Error sending offer redeemed notification:', error);
    }
  }

  /**
   * Notify the partner when a receipt at their venue was flagged for high
   * fraud score. Distinct from notifyFraudAlert (admins only) — partners
   * don't see the user identity, only the venue/receipt context so they
   * can follow up in person if needed.
   */
  async notifyPartnerFraudFlag(params: {
    venueId: string;
    receiptId: string;
    fraudScore: number;
    reasons: string[];
  }): Promise<void> {
    try {
      const venue = await this.getVenuePartnerOwner(params.venueId);
      if (!venue) return;
      await this.createNotification({
        userId: venue.partnerUserId,
        type: 'FRAUD_ALERT',
        title: 'Suspicious receipt at your venue',
        titleBg: 'Подозрителна касова бележка',
        message: `A receipt at ${venue.venueName} was flagged (score ${params.fraudScore}). Our team will review before cashback is credited.`,
        messageBg: `Касова бележка в ${venue.venueName} е маркирана (риск ${params.fraudScore}). Екипът ни ще я прегледа преди начисление.`,
        priority: 'medium',
        relatedEntityType: 'receipt',
        relatedEntityId: params.receiptId,
        data: { venueId: params.venueId, receiptId: params.receiptId, fraudScore: params.fraudScore, reasons: params.reasons },
      });
    } catch (error) {
      logger.error('❌ Error sending partner fraud flag notification:', error);
    }
  }

  /**
   * Welcome a freshly-created partner — covers both self-signup and admin
   * bulk import. Writes an in-app notification the partner sees the first
   * time they log in plus an email when we have one.
   */
  async notifyPartnerWelcome(params: {
    partnerUserId: string;
    businessName: string;
    temporaryPassword?: string;
    isBulkImport?: boolean;
  }): Promise<void> {
    try {
      const source = params.isBulkImport ? 'our team' : 'you';
      await this.createNotification({
        userId: params.partnerUserId,
        type: 'SYSTEM',
        title: 'Welcome to BoomCard',
        titleBg: 'Добре дошли в BoomCard',
        message: `${params.businessName} has been set up by ${source}. Complete your profile to start earning from BoomCard members.`,
        messageBg: `${params.businessName} е добавен. Довършете профила, за да започнете да печелите от BoomCard членове.`,
        priority: 'high',
        actionUrl: '/partners/profile',
        actionText: 'Complete profile',
        actionTextBg: 'Довърши профила',
        data: { businessName: params.businessName, isBulkImport: !!params.isBulkImport },
      });

      // Only email for bulk-imported partners. Self-signups are already receiving
      // a dedicated verification email (sendPartnerEmailVerification) and their
      // account is PENDING admin review — a "your account is ready" note here
      // would be premature and duplicative.
      if (params.isBulkImport) {
        const user = await prisma.user.findUnique({
          where: { id: params.partnerUserId },
          select: { email: true, firstName: true },
        });
        if (user?.email) {
          emailService.sendEmail({
            to: user.email,
            subject: `Welcome to BoomCard, ${params.businessName}`,
            html: `
              <p>Hi ${user.firstName || params.businessName},</p>
              <p>Your BoomCard partner account for <strong>${params.businessName}</strong> has been set up by our team.</p>
              ${params.temporaryPassword ? `<p>Temporary password: <code>${params.temporaryPassword}</code> — please change it on first login.</p>` : ''}
              <p>Sign in at <a href="${process.env.PARTNER_DASHBOARD_URL || 'https://partners.boomcard.bg'}">the partner dashboard</a> to complete your profile, upload your menu, and start earning from BoomCard members.</p>
              <p>— The BoomCard Team</p>
            `,
          }).catch((err) => logger.error('Failed to send partner welcome email:', err));
        }
      }
    } catch (error) {
      logger.error('❌ Error sending partner welcome notification:', error);
    }
  }

  /**
   * Cashback payout threshold reached — fires reactively from wallet credit
   * whenever availableBalance crosses the plan's payout threshold on that
   * specific credit (pre-credit below → post-credit at/above). Users who
   * spend below threshold and re-cross later will be notified again, which
   * is intentional: each crossing is a distinct "can cash out now" event.
   */
  async notifyPayoutReady(params: {
    userId: string;
    availableBalance: number;
    threshold: number;
  }): Promise<void> {
    try {
      await this.createNotification({
        userId: params.userId,
        type: 'CASHBACK_CREDITED',
        title: 'You can cash out',
        titleBg: 'Можете да изтеглите',
        message: `Your available balance (${params.availableBalance.toFixed(2)} BGN) is above the payout threshold (${params.threshold.toFixed(2)} BGN). Request your payout anytime.`,
        messageBg: `Наличният ви баланс (${params.availableBalance.toFixed(2)} лв.) надвишава прага (${params.threshold.toFixed(2)} лв.). Можете да заявите изплащане.`,
        priority: 'medium',
        actionUrl: '/wallet',
        actionText: 'Cash out',
        actionTextBg: 'Изтегли',
        data: { availableBalance: params.availableBalance, threshold: params.threshold },
      });
      await this.sendPushNotification({
        userId: params.userId,
        title: 'You can cash out',
        body: `${params.availableBalance.toFixed(2)} BGN ready to withdraw.`,
        data: { type: 'payout_ready', url: '/wallet' },
      });
    } catch (error) {
      logger.error('❌ Error sending payout-ready notification:', error);
    }
  }

  /**
   * Alert the partner that one of their offers is nearly out of capacity
   * (usageCount / usageLimit). Fires once per offer; partner dashboard
   * should show it so they can raise the limit or launch a replacement.
   */
  async notifyPartnerOfferLowCapacity(params: {
    partnerUserId: string;
    offerId: string;
    offerTitle: string;
    remaining: number;
    usageLimit: number;
  }): Promise<void> {
    try {
      await this.createNotification({
        userId: params.partnerUserId,
        type: 'OFFER_EXPIRING',
        title: 'Offer nearly used up',
        titleBg: 'Офертата почти се изчерпа',
        message: `"${params.offerTitle}" has ${params.remaining} redemption${params.remaining === 1 ? '' : 's'} left (of ${params.usageLimit}). Consider raising the limit.`,
        messageBg: `"${params.offerTitle}" има ${params.remaining} оставащи използвания (от ${params.usageLimit}).`,
        priority: 'medium',
        actionUrl: '/partners/offers',
        actionText: 'Edit offer',
        actionTextBg: 'Редактирай',
        relatedEntityType: 'offer',
        relatedEntityId: params.offerId,
        data: { offerId: params.offerId, remaining: params.remaining, usageLimit: params.usageLimit },
      });
    } catch (error) {
      logger.error('❌ Error sending partner low-capacity notification:', error);
    }
  }

  /**
   * Nudge a partner whose profile is missing critical fields (logo, menu,
   * description). Scheduled daily; each nudge only fires when at least one
   * required field is still empty.
   */
  async notifyPartnerOnboardingIncomplete(params: {
    partnerUserId: string;
    businessName: string;
    missing: string[];
  }): Promise<void> {
    try {
      if (params.missing.length === 0) return;
      await this.createNotification({
        userId: params.partnerUserId,
        type: 'SYSTEM',
        title: 'Finish setting up your venue',
        titleBg: 'Довършете профила на обекта си',
        message: `${params.businessName} is still missing: ${params.missing.join(', ')}. Complete these to go live on BoomCard.`,
        messageBg: `${params.businessName} все още няма: ${params.missing.join(', ')}. Довършете ги, за да бъдете активни в BoomCard.`,
        priority: 'medium',
        actionUrl: '/partners/profile',
        actionText: 'Finish setup',
        actionTextBg: 'Довърши',
        data: { missing: params.missing, businessName: params.businessName },
      });
    } catch (error) {
      logger.error('❌ Error sending onboarding-incomplete notification:', error);
    }
  }

  /**
   * Daily digest of venue activity for a partner. Non-fatal: skipped
   * silently when the partner had no activity yesterday.
   */
  async notifyPartnerDailyDigest(params: {
    partnerUserId: string;
    businessName: string;
    scans: number;
    receipts: number;
    redemptions: number;
    revenueBGN: number;
    cashbackOwedBGN: number;
  }): Promise<void> {
    try {
      if (params.scans + params.receipts + params.redemptions === 0) return;
      await this.createNotification({
        userId: params.partnerUserId,
        type: 'SYSTEM',
        title: `${params.businessName}: yesterday's activity`,
        titleBg: `${params.businessName}: активност за вчера`,
        message: `${params.scans} scan${params.scans === 1 ? '' : 's'}, ${params.receipts} receipt${params.receipts === 1 ? '' : 's'}, ${params.redemptions} redemption${params.redemptions === 1 ? '' : 's'} — ${params.revenueBGN.toFixed(2)} BGN tracked, ${params.cashbackOwedBGN.toFixed(2)} BGN cashback.`,
        messageBg: `${params.scans} сканирания, ${params.receipts} бележки, ${params.redemptions} използвания — ${params.revenueBGN.toFixed(2)} лв. оборот, ${params.cashbackOwedBGN.toFixed(2)} лв. кешбек.`,
        priority: 'low',
        actionUrl: '/analytics',
        actionText: 'View analytics',
        actionTextBg: 'Виж анализа',
        data: params,
      });
    } catch (error) {
      logger.error('❌ Error sending partner daily digest:', error);
    }
  }

  /**
   * Monthly statement — fires on the 1st of the month with last month's
   * totals and the amount owed in cashback. The link takes the partner to
   * the settlement view where they can mark it paid.
   */
  async notifyPartnerMonthlyStatement(params: {
    partnerUserId: string;
    businessName: string;
    month: string; // "YYYY-MM"
    receipts: number;
    revenueBGN: number;
    cashbackOwedBGN: number;
  }): Promise<void> {
    try {
      await this.createNotification({
        userId: params.partnerUserId,
        type: 'SYSTEM',
        title: `${params.month} statement available`,
        titleBg: `Отчет за ${params.month}`,
        message: `${params.businessName}: ${params.receipts} receipts, ${params.revenueBGN.toFixed(2)} BGN tracked revenue, ${params.cashbackOwedBGN.toFixed(2)} BGN cashback owed.`,
        messageBg: `${params.businessName}: ${params.receipts} бележки, ${params.revenueBGN.toFixed(2)} лв. оборот, ${params.cashbackOwedBGN.toFixed(2)} лв. дължим кешбек.`,
        priority: 'medium',
        actionUrl: '/partners/billing',
        actionText: 'View statement',
        actionTextBg: 'Виж отчета',
        data: params,
      });

      const user = await prisma.user.findUnique({
        where: { id: params.partnerUserId },
        select: { email: true, firstName: true },
      });
      if (user?.email) {
        emailService.sendEmail({
          to: user.email,
          subject: `${params.businessName} — ${params.month} statement`,
          html: `
            <p>Hi ${user.firstName || params.businessName},</p>
            <p>Your BoomCard statement for <strong>${params.month}</strong> is available.</p>
            <ul>
              <li>Receipts processed: <strong>${params.receipts}</strong></li>
              <li>Tracked revenue: <strong>${params.revenueBGN.toFixed(2)} BGN</strong></li>
              <li>Cashback owed: <strong>${params.cashbackOwedBGN.toFixed(2)} BGN</strong></li>
            </ul>
            <p>Open the <a href="${process.env.PARTNER_DASHBOARD_URL || 'https://partners.boomcard.bg'}/partners/billing">billing page</a> to view the breakdown.</p>
          `,
        }).catch((err) => logger.error('Failed to send partner monthly statement email:', err));
      }
    } catch (error) {
      logger.error('❌ Error sending partner monthly statement:', error);
    }
  }

  /**
   * Partner subscription renewal reminder — the existing standalone job
   * fires the email; this wraps the same logic in an in-app notification
   * so partners who live in the dashboard see it too.
   */
  async notifyPartnerRenewalUpcoming(params: {
    userId: string;
    planName: string;
    renewalDate: Date;
    price: string;
  }): Promise<void> {
    try {
      await this.createNotification({
        userId: params.userId,
        type: 'SYSTEM',
        title: 'Subscription renewing soon',
        titleBg: 'Абонаментът ви се подновява скоро',
        message: `Your ${params.planName} subscription renews on ${params.renewalDate.toLocaleDateString('en-GB')} for ${params.price}.`,
        messageBg: `Абонаментът ${params.planName} се подновява на ${params.renewalDate.toLocaleDateString('bg-BG')} за ${params.price}.`,
        priority: 'medium',
        actionUrl: '/dashboard/subscription',
        actionText: 'Manage',
        actionTextBg: 'Управлявай',
        data: { planName: params.planName, price: params.price, renewalDate: params.renewalDate.toISOString() },
      });
    } catch (error) {
      logger.error('❌ Error sending renewal reminder notification:', error);
    }
  }

  async notifySubscriptionAccessEnded(params: {
    userId: string;
    planName: string;
  }): Promise<void> {
    try {
      await this.createNotification({
        userId: params.userId,
        type: 'PAYMENT_FAILED',
        title: 'Subscription ended — payment not received',
        titleBg: 'Абонаментът е прекратен — плащането не е получено',
        message: `Your ${params.planName} subscription has ended because we could not collect payment. Reactivate at any time from the billing page.`,
        messageBg: `Абонаментът ви ${params.planName} е прекратен, тъй като не успяхме да получим плащане. Можете да го активирате отново от страницата за фактуриране.`,
        priority: 'urgent',
        actionUrl: '/dashboard/subscription',
        actionText: 'Reactivate',
        actionTextBg: 'Активирай отново',
        data: params,
      });

      const user = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { email: true, firstName: true },
      });
      if (user?.email) {
        emailService.sendEmail({
          to: user.email,
          subject: 'Your BoomCard subscription has ended',
          html: `
            <p>Hi ${user.firstName || 'there'},</p>
            <p>Your <strong>${params.planName}</strong> BoomCard subscription has ended because we were unable to collect payment after multiple attempts.</p>
            <p>You can reactivate your subscription at any time from the <a href="${process.env.PARTNER_DASHBOARD_URL || 'https://partners.boomcard.bg'}/dashboard/subscription">billing page</a>.</p>
            <p>— The BoomCard Team</p>
          `,
        }).catch((err) => logger.error('Failed to send subscription-access-ended email:', err));
      }
    } catch (error) {
      logger.error('❌ Error sending subscription access-ended notification:', error);
    }
  }

  // ===== Admin-ops notifications =====

  /**
   * Central admin-ops notification sink. Fans out to:
   *   1. In-app notification rows for every admin/super-admin user.
   *   2. Email to each admin for 'critical' severity only.
   *
   * Caller passes a *type* key (e.g. 'partner_signup', 'chargeback') so the
   * frontend can still filter in the bell icon UI even though the DB column
   * is SYSTEM. Include a concise message + labeled fields to render in the
   * in-app notification detail view.
   */
  async notifyAdminOps(params: {
    opsType: string;
    title: string;
    message: string;
    severity?: NotificationSeverity;
    fields?: Array<{ label: string; value: string }>;
    actionUrl?: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
  }): Promise<void> {
    const severity = params.severity ?? 'info';
    // Map severity to notification priority — admin dashboards escalate 'high'/'urgent'.
    const priority: 'low' | 'medium' | 'high' | 'urgent' =
      severity === 'critical' ? 'urgent' : severity === 'warning' ? 'high' : 'medium';

    try {
      const admins = await this.getAdminUsers();

      await Promise.all(
        admins.map((admin) =>
          this.createNotification({
            userId: admin.id,
            type: 'SYSTEM',
            title: params.title,
            message: params.message,
            priority,
            actionUrl: params.actionUrl,
            relatedEntityType: params.relatedEntityType,
            relatedEntityId: params.relatedEntityId,
            data: { opsType: params.opsType, severity, fields: params.fields },
          }).catch((err) => logger.error(`[admin-ops] In-app notify failed for admin ${admin.id}:`, err))
        )
      );

      // Email only for critical — floods otherwise. Caller can bump severity
      // when an event really needs to page someone.
      if (severity === 'critical') {
        const fieldLines = (params.fields ?? []).map((f) => `<li><strong>${f.label}:</strong> ${f.value}</li>`).join('');
        const html = `
          <p><strong>${params.title}</strong></p>
          <p>${params.message}</p>
          ${fieldLines ? `<ul>${fieldLines}</ul>` : ''}
          ${params.actionUrl ? `<p><a href="${params.actionUrl}">Open in dashboard</a></p>` : ''}
        `;
        await Promise.all(
          admins
            .filter((a) => a.email)
            .map((admin) =>
              emailService
                .sendEmail({ to: admin.email!, subject: `[BoomCard admin] ${params.title}`, html })
                .catch((err) => logger.error(`[admin-ops] Email to ${admin.email} failed:`, err))
            )
        );
      }
    } catch (error) {
      logger.error('❌ Error in notifyAdminOps:', error);
    }
  }

  /** New partner self-signup — admin should verify and activate. */
  async notifyAdminPartnerSignup(params: {
    partnerId: string;
    businessName: string;
    email: string;
    category: string;
  }): Promise<void> {
    return this.notifyAdminOps({
      opsType: 'partner_signup',
      title: 'New partner signup',
      message: `${params.businessName} (${params.category}) applied to join — waiting for verification.`,
      severity: 'info',
      fields: [
        { label: 'Business', value: params.businessName },
        { label: 'Email', value: params.email },
        { label: 'Category', value: params.category },
      ],
      actionUrl: `${process.env.PARTNER_DASHBOARD_URL || ''}/admin/partners/${params.partnerId}`,
      relatedEntityType: 'partner',
      relatedEntityId: params.partnerId,
    });
  }

  /** Bulk import batch completed — summary of created/skipped/errored rows. */
  async notifyAdminBulkImportComplete(params: {
    kind: 'partners' | 'offers';
    created: number;
    skipped: number;
    errorCount: number;
    importedBy: string;
  }): Promise<void> {
    const severity: NotificationSeverity = params.errorCount > 0 ? 'warning' : 'info';
    return this.notifyAdminOps({
      opsType: 'bulk_import_complete',
      title: `Bulk ${params.kind} import complete`,
      message: `${params.created} created, ${params.skipped} skipped, ${params.errorCount} error${params.errorCount === 1 ? '' : 's'}.`,
      severity,
      fields: [
        { label: 'Kind', value: params.kind },
        { label: 'Created', value: String(params.created) },
        { label: 'Skipped', value: String(params.skipped) },
        { label: 'Errors', value: String(params.errorCount) },
        { label: 'Imported by', value: params.importedBy },
      ],
    });
  }

  /**
   * Stripe chargeback — urgent. Stripe gives ~7 days to respond; delay
   * means losing the dispute by default.
   */
  async notifyAdminChargeback(params: {
    chargeId: string;
    disputeId: string;
    amountCents: number;
    currency: string;
    reason?: string;
  }): Promise<void> {
    return this.notifyAdminOps({
      opsType: 'stripe_chargeback',
      title: 'Stripe chargeback opened',
      message: `A customer disputed ${(params.amountCents / 100).toFixed(2)} ${params.currency.toUpperCase()}. Respond via Stripe dashboard within 7 days.`,
      severity: 'critical',
      fields: [
        { label: 'Dispute', value: params.disputeId },
        { label: 'Charge', value: params.chargeId },
        { label: 'Amount', value: `${(params.amountCents / 100).toFixed(2)} ${params.currency.toUpperCase()}` },
        ...(params.reason ? [{ label: 'Reason', value: params.reason }] : []),
      ],
      actionUrl: `https://dashboard.stripe.com/disputes/${params.disputeId}`,
    });
  }

  /** Scheduler job failed — operational signal so nightly runs can't die silently. */
  async notifyAdminSchedulerFailure(params: {
    jobName: string;
    errorMessage: string;
  }): Promise<void> {
    return this.notifyAdminOps({
      opsType: 'scheduler_failure',
      title: `Scheduled job failed: ${params.jobName}`,
      message: `The ${params.jobName} job errored during its scheduled run. Investigate before the next run.`,
      severity: 'warning',
      fields: [
        { label: 'Job', value: params.jobName },
        { label: 'Error', value: params.errorMessage.slice(0, 500) },
      ],
    });
  }

  /**
   * Cashback expiry ran bigger than normal — alert if more than X wallets
   * touched or total deducted exceeds a threshold. Hints at a bug (runaway
   * expiry) or a legitimate bulk expiry the team should be aware of.
   */
  async notifyAdminCashbackExpiryAnomaly(params: {
    walletsAffected: number;
    totalExpiredBGN: number;
  }): Promise<void> {
    return this.notifyAdminOps({
      opsType: 'cashback_expiry_anomaly',
      title: 'Unusually large cashback expiry',
      message: `Nightly expiry deducted ${params.totalExpiredBGN.toFixed(2)} BGN from ${params.walletsAffected} wallets — above the alert threshold.`,
      severity: 'warning',
      fields: [
        { label: 'Wallets', value: String(params.walletsAffected) },
        { label: 'Total BGN', value: params.totalExpiredBGN.toFixed(2) },
      ],
    });
  }

  /** Payment-failure rate spike — aggregate alert over a rolling window. */
  async notifyAdminPaymentFailureSpike(params: {
    failures: number;
    successes: number;
    windowMinutes: number;
  }): Promise<void> {
    const total = params.failures + params.successes;
    const rate = total === 0 ? 0 : (params.failures / total) * 100;
    return this.notifyAdminOps({
      opsType: 'payment_failure_spike',
      title: 'Payment failure rate spike',
      message: `${params.failures} failures out of ${total} attempts (${rate.toFixed(1)}%) in the last ${params.windowMinutes} minutes.`,
      severity: 'critical',
      fields: [
        { label: 'Failures', value: String(params.failures) },
        { label: 'Successes', value: String(params.successes) },
        { label: 'Rate', value: `${rate.toFixed(1)}%` },
        { label: 'Window', value: `${params.windowMinutes}m` },
      ],
    });
  }

  /** OCR manual-review backlog is growing — alerts when queue exceeds threshold. */
  async notifyAdminOcrBacklog(params: {
    pendingCount: number;
    oldestAgeHours: number;
  }): Promise<void> {
    return this.notifyAdminOps({
      opsType: 'ocr_backlog',
      title: 'OCR manual-review backlog growing',
      message: `${params.pendingCount} receipts waiting for review. Oldest is ${params.oldestAgeHours.toFixed(1)}h old.`,
      severity: params.oldestAgeHours > 48 ? 'warning' : 'info',
      fields: [
        { label: 'Pending', value: String(params.pendingCount) },
        { label: 'Oldest age', value: `${params.oldestAgeHours.toFixed(1)}h` },
      ],
      actionUrl: `${process.env.PARTNER_DASHBOARD_URL || ''}/admin/receipts`,
    });
  }

  // Auth-lockout spike detection intentionally omitted: there is no LoginAttempt
  // audit table yet, so the detector would have no data source. Adding one is a
  // separate, larger piece of work (schema migration + failed-login instrumentation
  // + spike thresholds + rate-limit interplay). Add the helper back when the
  // audit model lands.

  // ===== Internal helpers for partner lookup =====

  /**
   * Look up the partner owner (User.id) and business context for a venueId.
   * Returns null if the venue has no owning partner — we treat that as a
   * silent no-op so callers don't need to null-check.
   */
  private async getVenuePartnerOwner(venueId: string): Promise<{ partnerUserId: string; venueName: string; businessName: string } | null> {
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        name: true,
        partner: { select: { businessName: true, userId: true } },
      },
    });
    if (!venue?.partner?.userId) return null;
    return {
      partnerUserId: venue.partner.userId,
      venueName: venue.name,
      businessName: venue.partner.businessName,
    };
  }

  // ===== Internal Methods =====

  /**
   * Create in-app notification record AND push it over the realtime channel.
   *
   * Single source of truth for notification creation — anything that needs to
   * surface in the bell-icon dropdown should call this so both the DB row and
   * the live WebSocket broadcast happen together. The realtime payload uses the
   * same shape the REST endpoints serialize (lowercase type, status string,
   * iso timestamps) so the frontend can drop it straight into TanStack Query
   * cache without re-fetching.
   */
  private async createNotification(params: NotificationParams): Promise<void> {
    const created = await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type as any,
        priority: params.priority || 'medium',
        title: params.title,
        titleBg: params.titleBg,
        message: params.message,
        messageBg: params.messageBg,
        data: params.data ? JSON.stringify(params.data) : null,
        actionUrl: params.actionUrl,
        actionText: params.actionText,
        actionTextBg: params.actionTextBg,
        imageUrl: params.imageUrl,
        relatedEntityType: params.relatedEntityType,
        relatedEntityId: params.relatedEntityId,
        expiresAt: params.expiresAt,
        isRead: false,
      },
    });

    emitNotification(params.userId, {
      id: created.id,
      userId: created.userId,
      type: created.type.toLowerCase(),
      priority: created.priority,
      status: 'unread' as const,
      title: created.title,
      titleBg: created.titleBg ?? created.title,
      message: created.message,
      messageBg: created.messageBg ?? created.message,
      actionUrl: created.actionUrl ?? undefined,
      actionText: created.actionText ?? undefined,
      actionTextBg: created.actionTextBg ?? undefined,
      relatedEntityType: created.relatedEntityType ?? undefined,
      relatedEntityId: created.relatedEntityId ?? undefined,
      imageUrl: created.imageUrl ?? undefined,
      metadata: params.data,
      createdAt: created.createdAt.toISOString(),
      expiresAt: created.expiresAt?.toISOString(),
    });
  }

  /**
   * Send push notification to all active channels for a user:
   *   1. Web Push (VAPID) for browser subscriptions
   *   2. Expo Push (FCM/APNs) for iOS/Android native tokens
   *
   * Failures never throw — push is a best-effort side channel on top of the
   * in-app notification record that has already been written to the DB.
   */
  private async sendPushNotification(params: {
    userId: string;
    title: string;
    body: string;
    data?: Record<string, any>;
  }): Promise<void> {
    await Promise.allSettled([
      sendWebPushToUser(params.userId, {
        title: params.title,
        body: params.body,
        data: params.data,
        url: typeof params.data?.url === 'string' ? params.data.url : undefined,
      }).catch((err) => console.error('[notification.service] sendWebPushToUser failed', err)),

      sendExpoPushToUser(params.userId, {
        title: params.title,
        body: params.body,
        data: params.data as Record<string, unknown> | undefined,
      }).catch((err) => console.error('[notification.service] sendExpoPushToUser failed', err)),
    ]);
  }

  /**
   * Send email via SMTP
   */
  private async sendEmail(params: EmailParams): Promise<void> {
    // TODO: Integrate with email service (Nodemailer, SendGrid, etc.)
    // Example using Nodemailer:
    /*
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: '"BOOM Card" <noreply@boomcard.com>',
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    */

    console.log(`📧 Email queued to ${params.to}: ${params.subject}`);
  }

  /**
   * Get admin users for fraud alerts
   */
  private async getAdminUsers(): Promise<Array<{ id: string; email: string }>> {
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'SUPER_ADMIN'] as any[] },
      },
      select: {
        id: true,
        email: true,
      },
    });

    return admins;
  }

  /**
   * Generate HTML for daily summary email
   */
  private generateDailySummaryHTML(data: {
    firstName: string;
    receiptsCount: number;
    approved: number;
    pending: number;
    totalCashback: number;
    receipts: any[];
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Daily Receipt Summary</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .container {
            background: white;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          h1 {
            color: #10b981;
            margin-bottom: 10px;
          }
          .stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin: 30px 0;
          }
          .stat-card {
            background: #f9fafb;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
          }
          .stat-value {
            font-size: 28px;
            font-weight: bold;
            color: #10b981;
          }
          .stat-label {
            font-size: 12px;
            color: #6b7280;
            text-transform: uppercase;
            margin-top: 5px;
          }
          .receipt-list {
            margin-top: 30px;
          }
          .receipt-item {
            border-left: 3px solid #10b981;
            padding: 12px;
            margin-bottom: 10px;
            background: #f9fafb;
            border-radius: 4px;
          }
          .receipt-merchant {
            font-weight: 600;
            color: #111827;
          }
          .receipt-status {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            margin-left: 10px;
          }
          .status-approved {
            background: #d1fae5;
            color: #065f46;
          }
          .status-pending {
            background: #fef3c7;
            color: #92400e;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Hi ${data.firstName}!</h1>
          <p>Here's your receipt summary for today:</p>

          <div class="stats">
            <div class="stat-card">
              <div class="stat-value">${data.receiptsCount}</div>
              <div class="stat-label">Total Receipts</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${data.approved}</div>
              <div class="stat-label">Approved</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${data.totalCashback.toFixed(2)} BGN</div>
              <div class="stat-label">Cashback Earned</div>
            </div>
          </div>

          ${
            data.pending > 0
              ? `<p style="color: #f59e0b;">⏳ You have ${data.pending} receipts pending review.</p>`
              : ''
          }

          <div class="receipt-list">
            <h3>Today's Receipts:</h3>
            ${data.receipts
              .map(
                (r) => `
              <div class="receipt-item">
                <div class="receipt-merchant">
                  ${r.merchantName || 'Unknown Merchant'}
                  <span class="receipt-status status-${r.status.toLowerCase()}">${r.status}</span>
                </div>
                <div style="font-size: 14px; color: #6b7280; margin-top: 5px;">
                  Amount: ${r.totalAmount?.toFixed(2) || '0.00'} BGN
                  ${r.status === 'APPROVED' ? `• Cashback: ${r.cashbackAmount.toFixed(2)} BGN` : ''}
                </div>
              </div>
            `
              )
              .join('')}
          </div>

          <div class="footer">
            <p>Keep scanning receipts to earn more cashback!</p>
            <p style="margin-top: 15px;">
              <a href="https://boomcard.com/receipts" style="color: #10b981; text-decoration: none;">View All Receipts</a>
            </p>
            <p style="margin-top: 20px; font-size: 12px;">
              You're receiving this email because you submitted receipts today.
              <a href="https://boomcard.com/settings/notifications" style="color: #6b7280;">Manage preferences</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  /**
   * Get user's unread notifications
   */
  async getUnreadNotifications(userId: string) {
    return prisma.notification.findMany({
      where: {
        userId,
        isRead: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });
  }

  /**
   * Get all user notifications (paginated)
   */
  async getNotifications(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: { userId } }),
    ]);

    return {
      notifications,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * Delete old notifications (cleanup job)
   */
  async deleteOldNotifications(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await prisma.notification.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        isRead: true,
      },
    });

    console.log(`🗑️  Deleted ${result.count} old notifications`);
    return result.count;
  }
}

export const notificationService = new NotificationService();
