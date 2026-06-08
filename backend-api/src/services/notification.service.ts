import { prisma } from '../lib/prisma';
import { emailService } from './email.service';
import { emitNotification } from '../lib/socket';
import { sendWebPushToUser } from '../lib/webPush';
import { sendExpoPushToUser } from '../lib/expoPush';
import { logger } from '../utils/logger';
import { detach } from '../utils/detach';

type NotificationSeverity = 'info' | 'warning' | 'critical';

/**
 * Minimal HTML escaper — prevents admin email content injection when
 * partner-controlled values (businessName, category, etc.) are interpolated
 * into the notifyAdminOps critical-severity email body.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

export class NotificationService {
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
        messageBg: `Вашата касова бележка от ${merchantName} е одобрена. Спечелихте ${cashbackAmount.toFixed(2).replace('.', ',')} лв. кешбек!`,
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
        title: 'Кешбек одобрен!',
        body: `Спечелихте ${cashbackAmount.toFixed(2).replace('.', ',')} лв. кешбек от ${merchantName}`,
        data: { receiptId, type: 'receipt_approved' },
      });

      logger.info(`Approval notification sent for receipt ${receiptId}`);
    } catch (error) {
      logger.error('Error sending approval notification:', error);
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
        messageBg: `Посещението ви в ${venueName} е потвърдено. Спечелихте ${cashbackAmount.toFixed(2).replace('.', ',')} лв. кешбек!`,
        data: {
          scanId,
          venueName,
          cashbackAmount,
        },
        priority: 'high',
      });

      await this.sendPushNotification({
        userId,
        title: 'Спечелихте кешбек!',
        body: `+${cashbackAmount.toFixed(2).replace('.', ',')} лв. от ${venueName}`,
        data: { scanId, type: 'sticker_scan_approved' },
      });
    } catch (error) {
      logger.error('Error sending sticker scan approved notification:', error);
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

      logger.info(`Rejection notification sent for receipt ${receiptId}`);
    } catch (error) {
      logger.error('Error sending rejection notification:', error);
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

      logger.info(`Manual review notification sent for receipt ${receiptId}`);
    } catch (error) {
      logger.error('Error sending review notification:', error);
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
        messageBg: `${amount.toFixed(2).replace('.', ',')} лв. са добавени към акаунта ви. Нов баланс: ${newBalance.toFixed(2).replace('.', ',')} лв.`,
        data: {
          amount,
          newBalance,
        },
        priority: 'high',
      });

      await this.sendPushNotification({
        userId,
        title: 'Кешбек кредитиран!',
        body: `+${amount.toFixed(2).replace('.', ',')} лв. добавени към акаунта ви`,
        data: { amount, type: 'cashback_credited' },
      });

      logger.info(`Cashback notification sent to user ${userId}`);
    } catch (error) {
      logger.error('Error sending cashback notification:', error);
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
          // r2h B5: fraudScore and fraudReasons omitted from persisted data payload.
          // getNotifications/getUnreadNotifications return all rows for a userId with no
          // notification-type filter, so a user with both admin and partner roles could
          // receive fraud data via those endpoints (spec §11.3, Clash 5.1).
          // The full detail is available in the message text above (admin-only channel).
          data: {
            receiptId,
            userId,
          },
          priority: 'high',
        });
      }

      // Also send email to each admin
      for (const admin of admins) {
        if (admin.email) {
          detach(emailService.sendFraudAlertEmail(admin.email, {
            receiptId,
            userId,
            fraudScore,
            fraudReasons,
          }), (err) => {
            logger.error('Error sending fraud alert email:', err);
          });
        }
      }

      logger.warn(`Fraud alert sent for receipt ${receiptId} (score: ${fraudScore})`);
    } catch (error) {
      logger.error('Error sending fraud alert:', error);
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

      logger.info(`Daily summary sent to ${user.email}`);
    } catch (error) {
      logger.error('Error sending daily summary:', error);
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
      logger.error('Error sending menu approved notification:', error);
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
      logger.error('Error sending menu rejected notification:', error);
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
      logger.error('Error sending review received notification:', error);
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
        messageBg: `Плащането ви от ${amount.toFixed(2).replace('.', ',')} ${currency} не можа да бъде обработено. Моля, актуализирайте метода си на плащане, за да избегнете прекъсване на услугата.`,
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
          logger.error('Error sending payment-failed email:', err);
        });
      }
    } catch (error) {
      logger.error('Error sending payment-failed notification:', error);
    }
  }

  async notifyPaymentSuccess(params: {
    userId: string;
    amount: number;
    currency?: string;
    context: 'SUBSCRIPTION' | 'WALLET_TOPUP';
  }): Promise<void> {
    const { userId, amount, currency = 'BGN', context } = params;
    try {
      const titleEn = context === 'SUBSCRIPTION' ? 'Subscription Activated' : 'Wallet Topped Up';
      const titleBg = context === 'SUBSCRIPTION' ? 'Абонаментът е активиран' : 'Портфейлът е зареден';
      const messageEn = context === 'SUBSCRIPTION'
        ? `Your subscription has been activated. Payment of ${amount.toFixed(2)} ${currency} was received.`
        : `Your wallet has been topped up with ${amount.toFixed(2)} ${currency}.`;
      const messageBg = context === 'SUBSCRIPTION'
        ? `Абонаментът ви е активиран. Получено плащане от ${amount.toFixed(2).replace('.', ',')} ${currency}.`
        : `Портфейлът ви е зареден с ${amount.toFixed(2).replace('.', ',')} ${currency}.`;

      await this.createNotification({
        userId,
        type: 'PAYMENT_SUCCESS' as any,
        title: titleEn,
        titleBg,
        message: messageEn,
        messageBg,
        data: { amount, currency, context },
        priority: 'medium',
      });
    } catch (error) {
      logger.error('Error sending payment-success notification:', error);
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
        // Spec §11.3 Clash 10.6: cashbackAmount is internal — show only billAmount
        message: `A customer just scanned at ${venue.venueName} — ${params.billAmount.toFixed(2)} BGN.`,
        messageBg: `Клиент току-що сканира в ${venue.venueName} — сметка ${params.billAmount.toFixed(2).replace('.', ',')} лв.`,
        priority: 'low',
        actionUrl: '/analytics',
        actionText: 'View analytics',
        actionTextBg: 'Виж анализа',
        relatedEntityType: 'sticker_scan',
        relatedEntityId: params.scanId,
        data: { venueId: params.venueId, scanId: params.scanId, billAmount: params.billAmount },
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
        // Spec §11.3 Clash 10.6: cashbackAmount is internal — show only totalAmount to partner
        message: `A customer submitted a ${params.totalAmount.toFixed(2)} BGN receipt at ${venue.venueName}.`,
        messageBg: `Клиент качи касова бележка за ${params.totalAmount.toFixed(2).replace('.', ',')} лв. в ${venue.venueName}.`,
        priority: 'low',
        actionUrl: '/analytics',
        actionText: 'View analytics',
        actionTextBg: 'Виж анализа',
        relatedEntityType: 'receipt',
        relatedEntityId: params.receiptId,
        data: { venueId: params.venueId, receiptId: params.receiptId, totalAmount: params.totalAmount },
      });
    } catch (error) {
      logger.error('❌ Error sending partner receipt notification:', error);
    }
  }

  /**
   * Spec §9.1 canonical template #6 — Status Changes.
   * Notify a partner in-app when their partner_account_status changes.
   * Clash 6.6: "Partners ARE notified of account status changes (operational requirement)".
   * Called alongside email.service.sendPartnerStatusChangeEmail from partner
   * status-change routes so both channels fire on every transition.
   */
  async notifyPartnerStatusChange(params: {
    partnerUserId: string;
    businessName: string;
    fromStatus: string;
    toStatus: string;
  }): Promise<void> {
    const { partnerUserId, businessName, fromStatus, toStatus } = params;

    // Spec §1.1: canonical enum has exactly three values — ACTIVE, INACTIVE, ARCHIVED.
    // SUSPENDED/PAUSED are UI labels that map to INACTIVE at the DB level; they must
    // never appear in notification copy. REJECTED/PENDING belong to partner_application_status.
    // Guard: log and return early if a non-canonical value slips through (r2h B1).
    const canonicalStatuses = new Set(['ACTIVE', 'INACTIVE', 'ARCHIVED']);
    if (!canonicalStatuses.has(toStatus)) {
      logger.warn(
        `[notifyPartnerStatusChange] Non-canonical toStatus "${toStatus}" received — skipping notification. ` +
        `Caller must map to ACTIVE | INACTIVE | ARCHIVED before calling this function.`,
      );
      return;
    }
    // Defence-in-depth: fromStatus is informational only, but it is echoed into the
    // notification data payload below. Coerce any non-canonical value (PAUSED/SUSPENDED/
    // PENDING/REJECTED) to the canonical INACTIVE so internal sub-statuses never reach
    // the partner, even if a future caller forgets to canonicalize it (ARCHIVED/ACTIVE
    // pass through unchanged).
    const canonicalFromStatus = canonicalStatuses.has(fromStatus) ? fromStatus : 'INACTIVE';

    // Canonical status → human-readable labels (spec §1.8: status labels must be consistent).
    // r2h B1: restricted to canonical three values only.
    const statusLabelBg: Record<string, string> = {
      ACTIVE: 'Активен',
      INACTIVE: 'Неактивен',
      ARCHIVED: 'Архивиран',
    };
    // r2h B2: English label map so the English message shows "Active/Inactive/Archived"
    // rather than the raw enum value (spec §1.8 consistency across all notification copy).
    const statusLabelEn: Record<string, string> = {
      ACTIVE: 'Active',
      INACTIVE: 'Inactive',
      ARCHIVED: 'Archived',
    };
    const toLabelBg = statusLabelBg[toStatus] ?? toStatus;
    const toLabelEn = statusLabelEn[toStatus] ?? toStatus;

    // Priority escalates to 'high' only for the terminal ARCHIVED status.
    // INACTIVE partners can still log in (spec §1.2), so it is not a blocking event.
    // r2h B1: REJECTED/SUSPENDED removed — neither is a canonical partner_account_status.
    const highPriorityStatuses = new Set(['ARCHIVED']);
    const priority: 'low' | 'medium' | 'high' = highPriorityStatuses.has(toStatus) ? 'high' : 'medium';

    try {
      await this.createNotification({
        userId: partnerUserId,
        type: 'SYSTEM',
        title: 'Account status changed',
        titleBg: 'Статусът на акаунта е променен',
        // r2h B2: use human-readable English label, not the raw enum value.
        message: `Your partner account status for ${businessName} has changed to ${toLabelEn}.`,
        messageBg: `Статусът на партньорския ви акаунт за ${businessName} е променен на ${toLabelBg}.`,
        priority,
        actionUrl: '/partners/profile',
        actionText: 'View profile',
        actionTextBg: 'Виж профила',
        data: { businessName, fromStatus: canonicalFromStatus, toStatus },
      });
    } catch (error) {
      logger.error('❌ Error sending partner status change notification:', error);
    }
  }

  /**
   * Spec §9.1 canonical template #8 — Marketing (campaigns, feature updates,
   * product news). Respects the marketingConsentEmail gate (GDPR, spec §6.3).
   * Returns without sending if the partner has not given marketing consent.
   */
  async notifyPartnerMarketing(params: {
    partnerUserId: string;
    title: string;
    titleBg?: string;
    message: string;
    messageBg?: string;
    actionUrl?: string;
    actionText?: string;
    actionTextBg?: string;
    data?: Record<string, any>;
  }): Promise<void> {
    const { partnerUserId } = params;

    try {
      // GDPR consent gate — must check before any send (spec §6.3, Clash 6.1 template #8).
      // r2h B4: use channel-agnostic marketingConsent for in-app; marketingConsentEmail
      // for email. Over-blocking in-app/push because email consent is absent conflicts
      // with spec §5.4 which defines a single channel-neutral marketing consent toggle.
      const user = await prisma.user.findUnique({
        where: { id: partnerUserId },
        select: { marketingConsent: true, marketingConsentEmail: true },
      });

      if (!user?.marketingConsent) {
        logger.info(`[notifyPartnerMarketing] Skipping in-app — user ${partnerUserId} has not given marketing consent.`);
        return;
      }

      await this.createNotification({
        userId: partnerUserId,
        type: 'SYSTEM',
        title: params.title,
        titleBg: params.titleBg,
        message: params.message,
        messageBg: params.messageBg,
        priority: 'low',
        actionUrl: params.actionUrl,
        actionText: params.actionText,
        actionTextBg: params.actionTextBg,
        data: params.data,
      });
    } catch (error) {
      logger.error('❌ Error sending partner marketing notification:', error);
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
   *
   * Spec §11.3 / LOW S5: fraudScore and reasons are intentionally NOT accepted
   * as parameters to eliminate any risk of a future maintainer accidentally
   * exposing them in the message or data payload. Callers can log them
   * separately without passing them into this function.
   */
  async notifyPartnerFraudFlag(params: {
    venueId: string;
    receiptId: string;
  }): Promise<void> {
    try {
      const venue = await this.getVenuePartnerOwner(params.venueId);
      if (!venue) return;
      await this.createNotification({
        userId: venue.partnerUserId,
        type: 'FRAUD_ALERT',
        title: 'Suspicious receipt at your venue',
        titleBg: 'Подозрителна касова бележка',
        // Spec §11.3: fraudScore and reasons are internal-only — never expose to partner
        message: `A receipt at ${venue.venueName} is under manual review. Our team will verify before cashback is credited.`,
        messageBg: `Касова бележка в ${venue.venueName} е на ръчна проверка. Екипът ни ще я прегледа преди начисление.`,
        priority: 'medium',
        relatedEntityType: 'receipt',
        relatedEntityId: params.receiptId,
        data: { venueId: params.venueId, receiptId: params.receiptId },
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
          detach(emailService.sendEmail({
            to: user.email,
            subject: `Welcome to BoomCard, ${params.businessName}`,
            html: `
              <p>Hi ${user.firstName || params.businessName},</p>
              <p>Your BoomCard partner account for <strong>${params.businessName}</strong> has been set up by our team.</p>
              <p>Use the link below to set your password and sign in. The link is valid for 72 hours.</p>
              <p>Sign in at <a href="${process.env.PARTNER_DASHBOARD_URL || 'https://partners.boomcard.bg'}">the partner dashboard</a> to complete your profile, upload your menu, and start earning from BoomCard members.</p>
              <p>— The BoomCard Team</p>
            `,
          }), (err) => logger.error('Failed to send partner welcome email:', err));
        }
      }
    } catch (error) {
      logger.error('❌ Error sending partner welcome notification:', error);
    }
  }

  /**
   * Audit L1 — Spec §11.2 "Profile created" → Transactional notification (mandatory).
   * The welcome EMAIL is already sent from auth.routes.ts; this adds the in-app
   * transactional notification record so the trigger is consistent with every other
   * transactional event (cashback approved, transaction rejected, QR session), all of
   * which create an in-app record. Transactional category → not opt-out gated.
   */
  async notifyProfileCreated(userId: string): Promise<void> {
    try {
      await this.createNotification({
        userId,
        type: 'SYSTEM',
        title: 'Welcome to BoomCard',
        titleBg: 'Добре дошли в BoomCard',
        message: 'Your BoomCard profile is ready. Scan a venue QR sticker to start earning cashback.',
        messageBg: 'Профилът ви в BoomCard е готов. Сканирайте QR стикер в обект, за да започнете да печелите кешбек.',
        priority: 'medium',
        actionUrl: '/dashboard',
        actionText: 'Open dashboard',
        actionTextBg: 'Към таблото',
        data: { type: 'profile_created' },
      });
    } catch (error) {
      logger.error('[notifyProfileCreated] failed:', error);
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
        messageBg: `Наличният ви баланс (${params.availableBalance.toFixed(2).replace('.', ',')} лв.) надвишава прага (${params.threshold.toFixed(2).replace('.', ',')} лв.). Можете да заявите изплащане.`,
        priority: 'medium',
        actionUrl: '/wallet',
        actionText: 'Cash out',
        actionTextBg: 'Изтегли',
        data: { availableBalance: params.availableBalance, threshold: params.threshold },
      });
      await this.sendPushNotification({
        userId: params.userId,
        title: 'Можете да изтеглите',
        body: `${params.availableBalance.toFixed(2).replace('.', ',')} лв. са готови за изтегляне.`,
        data: { type: 'payout_ready', url: '/wallet' },
      });

      // Spec §8.3 — payout threshold reached requires Email + in-app + push.
      const user = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { email: true, firstName: true },
      });
      if (user?.email) {
        const balanceFmt = params.availableBalance.toFixed(2).replace('.', ',');
        const thresholdFmt = params.threshold.toFixed(2).replace('.', ',');
        const greeting = user.firstName ? `Здравейте, ${user.firstName}!` : 'Здравейте!';
        detach(emailService.sendEmail({
          to: user.email,
          subject: 'Готови за изтегляне — BoomCard',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#fff;">
              <h2 style="color:#1a1a1a;margin-bottom:8px;">Можете да изтеглите средствата си</h2>
              <p style="color:#555;margin-bottom:16px;">${greeting}</p>
              <p style="color:#555;margin-bottom:16px;">
                Наличният ви баланс е <strong>${balanceFmt} лв.</strong>, което надвишава прага за изплащане от <strong>${thresholdFmt} лв.</strong>
              </p>
              <p style="color:#555;margin-bottom:24px;">Можете да поискате изплащане по всяко време от секция <strong>Портфейл</strong>.</p>
              <p style="text-align:center;margin-bottom:0;">
                <a href="${process.env.APP_URL || 'https://mobile.boomcard.bg'}/wallet"
                   style="display:inline-block;background:#10b981;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
                  Изтегли
                </a>
              </p>
            </div>`,
        }), (err) => logger.error('[notifyPayoutReady] email send failed:', err));
      }
    } catch (error) {
      logger.error('❌ Error sending payout-ready notification:', error);
    }
  }

  // Spec §3.7 — payout threshold reached but no IBAN on file.
  // User must add bank details before a payout can proceed.
  // Spec §3.2: IBAN is not required at registration but is required before payout.
  async notifyPayoutHeldNoIban(params: {
    userId: string;
    availableBalance: number;
    threshold: number;
  }): Promise<void> {
    try {
      await this.createNotification({
        userId: params.userId,
        type: 'CASHBACK_CREDITED',
        title: 'Add your IBAN to receive payout',
        titleBg: 'Добавете IBAN за изплащане',
        message: `Your available balance (${params.availableBalance.toFixed(2)} BGN) has reached the payout threshold. Please add your bank account (IBAN) to receive your funds.`,
        messageBg: `Наличният ви баланс (${params.availableBalance.toFixed(2).replace('.', ',')} лв.) достигна прага за изплащане. Добавете банкова сметка (IBAN), за да получите средствата си.`,
        priority: 'high',
        actionUrl: '/profile/bank',
        actionText: 'Add bank account',
        actionTextBg: 'Добавете сметка',
        data: { availableBalance: params.availableBalance, threshold: params.threshold, reason: 'no_iban' },
      });
      // Email notification
      const user = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { email: true, firstName: true },
      });
      if (user?.email) {
        const balanceFmt = params.availableBalance.toFixed(2).replace('.', ',');
        const greeting = user.firstName ? `Здравейте, ${user.firstName}!` : 'Здравейте!';
        detach(emailService.sendEmail({
          to: user.email,
          subject: 'Добавете IBAN за изплащане — BoomCard',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#fff;">
              <h2 style="color:#1a1a1a;margin-bottom:8px;">Добавете банкова сметка</h2>
              <p style="color:#555;margin-bottom:16px;">${greeting}</p>
              <p style="color:#555;margin-bottom:16px;">
                Наличният ви баланс е <strong>${balanceFmt} лв.</strong> — достатъчно за изплащане.
                За да получите средствата, трябва да добавите банкова сметка (IBAN) в профила си.
              </p>
              <p style="text-align:center;margin-bottom:0;">
                <a href="${process.env.APP_URL || 'https://mobile.boomcard.bg'}/profile/bank"
                   style="display:inline-block;background:#10b981;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
                  Добавете IBAN
                </a>
              </p>
            </div>`,
        }), (err) => logger.error('[notifyPayoutHeldNoIban] email send failed:', err));
      }
    } catch (error) {
      logger.error('[notifyPayoutHeldNoIban] Error sending no-IBAN notification:', error);
    }
  }

  // Spec §8.3 — subscription expiry reminder in-app channel (Email + in-app).
  // Called by the renewal-reminders job alongside the email send.
  async notifySubscriptionExpiringSoon(params: {
    userId: string;
    bucket: '3d' | '1d' | 'dayOf';
    periodEnd: Date;
  }): Promise<void> {
    const dateStr = params.periodEnd.toLocaleDateString('bg-BG', { timeZone: 'Europe/Sofia' });
    const { title, titleBg, message, messageBg } = {
      '3d': {
        title: 'Subscription expiring in 3 days',
        titleBg: 'Абонаментът изтича след 3 дни',
        message: `Your BoomCard subscription expires on ${dateStr}. Auto-renewal is off — renew manually to keep access.`,
        messageBg: `Абонаментът ви BoomCard изтича на ${dateStr} (след 3 дни). Автоматичното подновяване е изключено.`,
      },
      '1d': {
        title: 'Subscription expiring tomorrow',
        titleBg: 'Абонаментът изтича утре',
        message: `Your BoomCard subscription expires tomorrow (${dateStr}). Renew now to avoid interruption.`,
        messageBg: `Абонаментът ви BoomCard изтича утре, ${dateStr}.`,
      },
      'dayOf': {
        title: 'Subscription expires today',
        titleBg: 'Абонаментът изтича днес',
        message: `Your BoomCard subscription expires today (${dateStr}). Renew now to keep access.`,
        messageBg: `Абонаментът ви BoomCard изтича днес, ${dateStr}.`,
      },
    }[params.bucket];

    await this.createNotification({
      userId: params.userId,
      type: 'SUBSCRIPTION_EXPIRING',
      title,
      titleBg,
      message,
      messageBg,
      priority: params.bucket === 'dayOf' ? 'high' : 'medium',
      actionUrl: '/subscription',
      actionText: 'Renew',
      actionTextBg: 'Поднови',
    });

    // §13 — push mirrors the in-app notification on mobile/web.
    // Non-fatal: a push failure must not prevent the bitmask update
    // in the caller (renewal-reminders job).
    await this.sendPushNotification({
      userId: params.userId,
      title: titleBg,
      body: messageBg,
      data: { type: 'subscription_expiring', bucket: params.bucket, url: '/subscription' },
    }).catch((err) =>
      logger.error('[notifySubscriptionExpiringSoon] push failed:', err),
    );
  }

  /**
   * §10 — Subscription went ACTIVE → PAUSED (auto-renew OFF, period elapsed,
   * 7-day grace window now open). Fires alongside the expiry-notice email in
   * paysera-renewal.ts. Sends in-app + push so the user sees it even without
   * opening email.
   */
  async notifySubscriptionPaused(params: {
    userId: string;
    pauseEndsAt: Date;
  }): Promise<void> {
    try {
      const dateStr = params.pauseEndsAt.toLocaleDateString('bg-BG', { timeZone: 'Europe/Sofia' });
      await this.createNotification({
        userId: params.userId,
        type: 'SUBSCRIPTION_EXPIRING',
        title: 'Subscription paused',
        titleBg: 'Абонаментът е спрян',
        message: `Your BoomCard subscription has been paused. Renew before ${dateStr} to avoid cancellation.`,
        messageBg: `Абонаментът ви BoomCard е спрян. Подновете до ${dateStr}, за да избегнете отмяна.`,
        priority: 'high',
        actionUrl: '/subscription',
        actionText: 'Renew',
        actionTextBg: 'Поднови',
        data: { type: 'subscription_paused', pauseEndsAt: params.pauseEndsAt.toISOString() },
      });
      await this.sendPushNotification({
        userId: params.userId,
        title: 'Абонаментът е спрян',
        body: `Подновете до ${dateStr}, за да избегнете отмяна.`,
        data: { type: 'subscription_paused', url: '/subscription' },
      }).catch((err) =>
        logger.error('[notifySubscriptionPaused] push failed:', err),
      );
    } catch (error) {
      logger.error('[notifySubscriptionPaused] failed:', error);
    }
  }

  /**
   * Audit L2 — Spec §11.2 "Payment method updated" → Payment notification (mandatory).
   * Paysera already sends a payment confirmation on card update; the Stripe card
   * paths did not. Payment-category (PAYMENT_SUCCESS) in-app notification so it is
   * exempt from opt-out, mirroring the other Payment-category notifications.
   */
  async notifyPaymentMethodUpdated(userId: string): Promise<void> {
    try {
      await this.createNotification({
        userId,
        type: 'PAYMENT_SUCCESS',
        title: 'Payment method updated',
        titleBg: 'Платежният метод е обновен',
        message: 'Your payment method has been updated. Future subscription charges will use this card.',
        messageBg: 'Платежният ви метод е обновен. Бъдещите такси за абонамент ще използват тази карта.',
        priority: 'medium',
        actionUrl: '/subscription',
        actionText: 'View subscription',
        actionTextBg: 'Виж абонамент',
        data: { type: 'payment_method_updated' },
      });
    } catch (error) {
      logger.error('[notifyPaymentMethodUpdated] failed:', error);
    }
  }

  /**
   * §11 — Payout status changed (approved / completed / rejected / held /
   * released / failed). Sends in-app notification + push alongside the email
   * already dispatched by adminPayouts.routes.ts.
   */
  async notifyPayoutEvent(params: {
    userId: string;
    payoutId: string;
    event: 'approved' | 'completed' | 'rejected' | 'held' | 'released' | 'failed';
    amount: number;
    currency: string;
  }): Promise<void> {
    try {
      const amt = params.amount.toFixed(2);
      type EventMap = Record<typeof params.event, { title: string; titleBg: string; message: string; messageBg: string }>;
      const copy: EventMap = {
        approved: {
          title: `Payout of ${amt} ${params.currency} approved`,
          titleBg: `Плащането от ${amt} ${params.currency} е одобрено`,
          message: 'Your payout request has been approved and is being processed.',
          messageBg: 'Заявката ви за плащане е одобрена и се обработва.',
        },
        completed: {
          title: `Payout of ${amt} ${params.currency} sent`,
          titleBg: `Плащането от ${amt} ${params.currency} е изпратено`,
          message: 'Your payout has been sent. Funds will arrive within 1–3 business days.',
          messageBg: 'Плащането ви е изпратено. Средствата ще постъпят в рамките на 1–3 работни дни.',
        },
        rejected: {
          title: `Payout of ${amt} ${params.currency} rejected`,
          titleBg: `Плащането от ${amt} ${params.currency} е отхвърлено`,
          message: 'Your payout request was rejected and your balance has been restored.',
          messageBg: 'Заявката ви за плащане е отхвърлена. Балансът ви е възстановен.',
        },
        held: {
          title: `Payout of ${amt} ${params.currency} on hold`,
          titleBg: `Плащането от ${amt} ${params.currency} е задържано`,
          message: 'Your payout has been placed on hold for review.',
          messageBg: 'Плащането ви е задържано за проверка.',
        },
        released: {
          title: `Payout of ${amt} ${params.currency} released`,
          titleBg: `Плащането от ${amt} ${params.currency} е освободено`,
          message: 'Your held payout has been released and will be processed normally.',
          messageBg: 'Задържаното плащане е освободено и ще се обработи нормално.',
        },
        failed: {
          title: `Payout of ${amt} ${params.currency} failed`,
          titleBg: `Плащането от ${amt} ${params.currency} не беше успешно`,
          message: 'Your payout could not be processed. Your balance has been restored.',
          messageBg: 'Плащането не беше успешно. Балансът ви е възстановен.',
        },
      };
      const { title, titleBg, message, messageBg } = copy[params.event];
      const priority = params.event === 'completed' || params.event === 'rejected' || params.event === 'failed'
        ? 'high'
        : 'medium';

      await this.createNotification({
        userId: params.userId,
        type: 'PAYMENT_SUCCESS',
        title,
        titleBg,
        message,
        messageBg,
        priority,
        actionUrl: '/wallet',
        actionText: 'View wallet',
        actionTextBg: 'Виж портфейл',
        relatedEntityType: 'payout',
        relatedEntityId: params.payoutId,
        data: { type: `payout_${params.event}`, payoutId: params.payoutId, amount: params.amount, currency: params.currency },
      });

      await this.sendPushNotification({
        userId: params.userId,
        title: titleBg,
        body: messageBg,
        data: { type: `payout_${params.event}`, payoutId: params.payoutId, url: '/wallet' },
      }).catch((err) =>
        logger.error(`[notifyPayoutEvent:${params.event}] push failed:`, err),
      );
    } catch (error) {
      logger.error('[notifyPayoutEvent] failed:', error);
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
        // Spec §11.3: cashbackOwedBGN is internal — omit from partner notifications
        message: `${params.scans} scan${params.scans === 1 ? '' : 's'}, ${params.receipts} receipt${params.receipts === 1 ? '' : 's'}, ${params.redemptions} redemption${params.redemptions === 1 ? '' : 's'} — ${params.revenueBGN.toFixed(2)} BGN tracked.`,
        messageBg: `${params.scans} сканирания, ${params.receipts} бележки, ${params.redemptions} използвания — ${params.revenueBGN.toFixed(2).replace('.', ',')} лв. оборот.`,
        priority: 'low',
        actionUrl: '/analytics',
        actionText: 'View analytics',
        actionTextBg: 'Виж анализа',
        data: { partnerUserId: params.partnerUserId, businessName: params.businessName, scans: params.scans, receipts: params.receipts, redemptions: params.redemptions, revenueBGN: params.revenueBGN },
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
        // Spec §11.3: cashbackOwedBGN is internal — omit from partner notification
        message: `${params.businessName}: ${params.receipts} receipts, ${params.revenueBGN.toFixed(2)} BGN tracked revenue.`,
        messageBg: `${params.businessName}: ${params.receipts} бележки, ${params.revenueBGN.toFixed(2).replace('.', ',')} лв. оборот.`,
        priority: 'medium',
        actionUrl: '/partners/billing',
        actionText: 'View statement',
        actionTextBg: 'Виж отчета',
        data: { partnerUserId: params.partnerUserId, businessName: params.businessName, month: params.month, receipts: params.receipts, revenueBGN: params.revenueBGN },
      });

      const user = await prisma.user.findUnique({
        where: { id: params.partnerUserId },
        select: { email: true, firstName: true },
      });
      if (user?.email) {
        // Spec §7.4 / §11.3 / Clash 10.6: cashbackOwedBGN is the cashback
        // component of the internal business formula split and MUST NOT appear
        // in any partner-facing channel including email.
        detach(emailService.sendEmail({
          to: user.email,
          subject: `${params.businessName} — ${params.month} statement`,
          html: `
            <p>Hi ${user.firstName || params.businessName},</p>
            <p>Your BoomCard statement for <strong>${params.month}</strong> is available.</p>
            <ul>
              <li>Receipts processed: <strong>${params.receipts}</strong></li>
              <li>Tracked revenue: <strong>${params.revenueBGN.toFixed(2)} BGN</strong></li>
            </ul>
            <p>Open the <a href="${process.env.PARTNER_DASHBOARD_URL || 'https://partners.boomcard.bg'}/partners/billing">billing page</a> to view the breakdown.</p>
          `,
        }), (err) => logger.error('Failed to send partner monthly statement email:', err));
      }
    } catch (error) {
      logger.error('❌ Error sending partner monthly statement:', error);
    }
  }

  /**
   * Spec §9.1 canonical template #5 — Request Updates.
   * In-app notification when the status of a partner's help request or change
   * request changes. Spec §9.1 / Clash 6.1: this is one of exactly 8 canonical
   * partner notification templates. Previously absent (r2h B3 / r2i F3).
   *
   * Callers: adminHelp.routes.ts ticket-status-change handler.
   * IMPORTANT: do NOT include internal fields (cashback%, fraudScore, etc.)
   * in the data payload — spec §11.3.
   */
  async notifyPartnerRequestUpdate(params: {
    partnerUserId: string;
    ticketId: string;
    subject: string;
    fromStatus: string;
    toStatus: string;
  }): Promise<void> {
    try {
      await this.createNotification({
        userId: params.partnerUserId,
        type: 'SYSTEM',
        title: 'Your request has been updated',
        titleBg: 'Вашата заявка е актуализирана',
        message: `Your request "${params.subject}" has moved from ${params.fromStatus} to ${params.toStatus}.`,
        messageBg: `Вашата заявка „${params.subject}" е преминала от статус ${params.fromStatus} на ${params.toStatus}.`,
        priority: 'medium',
        actionUrl: `/partners/help`,
        actionText: 'View request',
        actionTextBg: 'Виж заявката',
        relatedEntityType: 'help_ticket',
        relatedEntityId: params.ticketId,
        data: { ticketId: params.ticketId, subject: params.subject, fromStatus: params.fromStatus, toStatus: params.toStatus },
      });
    } catch (error) {
      logger.error('❌ Error sending partner request-update notification:', error);
    }
  }

  /**
   * Spec §9.1 canonical template #7 — Contract Changes.
   * In-app notification when a commission rate or contract term changes.
   * Previously email-only; in-app channel was absent (r2i F4).
   *
   * CRITICAL spec §11.3 / Clash 10.6: the old and new values of cashback%,
   * discountRate, or marginAmount must NEVER be included in any partner-facing
   * payload. Only the name of the changed field is disclosed.
   */
  async notifyPartnerContractChange(params: {
    partnerUserId: string;
    businessName: string;
    fieldChanged: string;
  }): Promise<void> {
    try {
      await this.createNotification({
        userId: params.partnerUserId,
        type: 'SYSTEM',
        title: 'Your contract terms have changed',
        titleBg: 'Условията на договора ви са променени',
        message: `The ${params.fieldChanged} for ${params.businessName} has been updated. Please review your contract.`,
        messageBg: `${params.fieldChanged} за ${params.businessName} е актуализирано. Моля, прегледайте договора си.`,
        priority: 'high',
        actionUrl: '/partners/profile',
        actionText: 'View contract',
        actionTextBg: 'Виж договора',
        // fieldChanged only — old/new cashback%/margin% values are internal-only (spec §11.3).
        data: { businessName: params.businessName, fieldChanged: params.fieldChanged },
      });
    } catch (error) {
      logger.error('❌ Error sending partner contract-change notification:', error);
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
        detach(emailService.sendEmail({
          to: user.email,
          subject: 'Your BoomCard subscription has ended',
          html: `
            <p>Hi ${user.firstName || 'there'},</p>
            <p>Your <strong>${params.planName}</strong> BoomCard subscription has ended because we were unable to collect payment after multiple attempts.</p>
            <p>You can reactivate your subscription at any time from the <a href="${process.env.PARTNER_DASHBOARD_URL || 'https://partners.boomcard.bg'}/dashboard/subscription">billing page</a>.</p>
            <p>— The BoomCard Team</p>
          `,
        }), (err) => logger.error('Failed to send subscription-access-ended email:', err));
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
    /** Skip creating a new notification if one with the same opsType was already
     *  created within the last N hours. Prevents cron-driven alerts from flooding
     *  the bell when the underlying condition persists across multiple runs. */
    cooldownHours?: number;
  }): Promise<void> {
    if (params.cooldownHours) {
      const since = new Date(Date.now() - params.cooldownHours * 3_600_000);
      // Use a word-boundary-safe JSON string match to avoid substring collisions
      // (e.g. 'partner_signup' must NOT suppress 'partner_signup_bulk').
      // We match '"opsType":"<value>",' with a trailing comma or closing brace so
      // 'partner_signup' cannot match 'partner_signup_bulk'.
      // Two patterns cover both "last key" (no trailing comma) and "non-last key" forms.
      const exactPattern1 = `"opsType":"${params.opsType}",`;  // non-last key
      const exactPattern2 = `"opsType":"${params.opsType}"}`;  // last key before }
      const recent = await prisma.notification.findFirst({
        where: {
          OR: [
            { data: { contains: exactPattern1 }, createdAt: { gte: since } },
            { data: { contains: exactPattern2 }, createdAt: { gte: since } },
          ],
        },
        select: { id: true },
      });
      if (recent) {
        logger.info(`[admin-ops] Cooldown active for opsType=${params.opsType} — skipping duplicate notification.`);
        return;
      }
    }

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
        // Escape all partner-controlled values before embedding in HTML to
        // prevent content injection (MEDIUM F2 — businessName/category from
        // registration form may contain HTML markup).
        const fieldLines = (params.fields ?? [])
          .map((f) => `<li><strong>${escapeHtml(f.label)}:</strong> ${escapeHtml(f.value)}</li>`)
          .join('');
        const html = `
          <p><strong>${escapeHtml(params.title)}</strong></p>
          <p>${escapeHtml(params.message)}</p>
          ${fieldLines ? `<ul>${fieldLines}</ul>` : ''}
          ${params.actionUrl ? `<p><a href="${escapeHtml(params.actionUrl)}">Open in dashboard</a></p>` : ''}
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
    // Derive a PER-JOB opsType so each distinct scheduled job owns its own
    // cooldown slot. A single fixed 'scheduler_failure' opsType meant the FIRST
    // job to fail in a 24h window occupied the only cooldown slot, silently
    // swallowing genuine failures of every OTHER job that day (cross-job alert
    // suppression). The dedup/cooldown match in notifyAdminOps keys on the full
    // opsType string, so per-job keys give each job an independent slot while
    // repeated failures of the SAME job within the window are still deduped.
    // Sanitize jobName to a stable key (lowercase, non-alphanumerics → '_') so
    // it forms a safe, collision-free dedup token.
    const jobKey = params.jobName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return this.notifyAdminOps({
      opsType: `scheduler_failure_${jobKey}`,
      title: `Scheduled job failed: ${params.jobName}`,
      message: `The ${params.jobName} job errored during its scheduled run. Investigate before the next run.`,
      severity: 'warning',
      fields: [
        { label: 'Job', value: params.jobName },
        { label: 'Error', value: params.errorMessage.slice(0, 500) },
      ],
      // Defense-in-depth: a flapping cron must not page every admin on every run.
      // The first failure still alerts immediately (cooldown only dedupes repeats
      // within the window); matches the cooldown of sibling ops alerts (ocr_backlog).
      cooldownHours: 24,
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
      cooldownHours: 24,
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
      }).catch((err) => logger.error('[notification.service] sendWebPushToUser failed', err)),

      sendExpoPushToUser(params.userId, {
        title: params.title,
        body: params.body,
        data: params.data as Record<string, unknown> | undefined,
      }).catch((err) => logger.error('[notification.service] sendExpoPushToUser failed', err)),
    ]);
  }

  /**
   * Get active admin users for fraud alerts and operational notifications.
   * Filters to ACTIVE status only (LOW S4) — Inactive/deleted admins should
   * not receive operational emails or in-app notifications.
   */
  private async getAdminUsers(): Promise<Array<{ id: string; email: string }>> {
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'SUPER_ADMIN'] as any[] },
        status: 'ACTIVE' as any,
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
                  ${escapeHtml(r.merchantName || 'Unknown Merchant')}
                  <span class="receipt-status status-${escapeHtml(r.status.toLowerCase())}">${escapeHtml(r.status)}</span>
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

  // ===== F-018: Three missing notification methods =====

  /**
   * F-018 — Fires when a QR session is opened / receipt upload is confirmed.
   * Lets the user know their scan was received and is being processed.
   * Called from sticker.service.ts after a successful receipt upload.
   */
  async notifyQRSessionOpened(userId: string, stickerId: string): Promise<void> {
    try {
      await this.createNotification({
        userId,
        type: 'SYSTEM',
        title: 'Receipt received',
        titleBg: 'Бележката е получена',
        message: 'Your receipt has been received and is under review. You will be notified when cashback is confirmed.',
        messageBg: 'Вашата бележка е получена и се преглежда. Ще получите известие, когато кешбекът бъде потвърден.',
        priority: 'medium',
        actionUrl: '/wallet',
        actionText: 'View wallet',
        actionTextBg: 'Виж портфейл',
        relatedEntityType: 'sticker_scan',
        relatedEntityId: stickerId,
        data: { stickerId, type: 'qr_session_opened' },
      });
    } catch (error) {
      logger.error('[notifyQRSessionOpened] failed:', error);
    }
  }

  /**
   * F-018 — First payout failure notification requesting IBAN correction.
   * Spec §7.4: On first payout failure, notify the user to correct their IBAN.
   * The user is NOT notified on second+ failures (admin reviews those directly).
   */
  async notifyPayoutFailedInvalidIban(userId: string): Promise<void> {
    try {
      await this.createNotification({
        userId,
        type: 'PAYMENT_FAILED',
        title: 'Payout failed — please update your IBAN',
        titleBg: 'Изплащането не успя — моля, обновете IBAN',
        message: 'Your payout could not be processed. This is often caused by an incorrect IBAN. Please update your bank account details and try again.',
        messageBg: 'Изплащането ви не успя. Причината може да е неверен IBAN. Моля, актуализирайте банковите си данни и опитайте отново.',
        priority: 'high',
        actionUrl: '/profile/bank',
        actionText: 'Update bank account',
        actionTextBg: 'Обнови банкова сметка',
        data: { type: 'payout_failed_invalid_iban', reason: 'IBAN_CORRECTION_REQUIRED' },
      });

      await this.sendPushNotification({
        userId,
        title: 'Изплащането не успя',
        body: 'Моля, проверете и обновете IBAN-а си.',
        data: { type: 'payout_failed_invalid_iban', url: '/profile/bank' },
      }).catch((err) => logger.error('[notifyPayoutFailedInvalidIban] push failed:', err));

      // Also send email so the user has a durable record of the issue.
      const payoutUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true },
      });
      if (payoutUser?.email) {
        detach(emailService.sendEmail({
          to: payoutUser.email,
          subject: 'Action Required: Payout failed — BoomCard',
          html: `
            <p>Hi ${payoutUser.firstName || 'there'},</p>
            <p>Your BoomCard cashback payout could not be processed. This is often caused by an incorrect or invalid IBAN.</p>
            <p>Please open the app and update your bank account details, then your next payout will be processed automatically.</p>
            <p>— The BoomCard Team</p>
          `,
        }), (err) => logger.error('[notifyPayoutFailedInvalidIban] email failed:', err));
      }
    } catch (error) {
      logger.error('[notifyPayoutFailedInvalidIban] failed:', error);
    }
  }

  /**
   * L1 — neutral first-failure payout notification.
   *
   * Used when the payout failure reason does NOT indicate an IBAN / bank-account
   * problem. Mirrors notifyPayoutFailedInvalidIban (in-app + push + email) but
   * with neutral "action may be required" wording instead of IBAN-correction
   * copy, matching the failed_other branch of the admin /fail path's
   * notifySubscriber. This keeps the Paysera auto-fail path and the admin /fail
   * path consistent.
   */
  async notifyPayoutFailedGeneric(userId: string): Promise<void> {
    try {
      await this.createNotification({
        userId,
        type: 'PAYMENT_FAILED',
        title: 'Payout failed — action may be required',
        titleBg: 'Изплащането не успя — възможно е да е необходимо действие',
        message: 'Your payout could not be processed and some action may be required on your side. Your balance has been restored.',
        messageBg: 'Изплащането ви не успя и може да се наложи действие от ваша страна. Балансът ви е възстановен.',
        priority: 'high',
        actionUrl: '/profile/bank',
        actionText: 'Review bank account',
        actionTextBg: 'Прегледай банкова сметка',
        data: { type: 'payout_failed_generic', reason: 'PAYOUT_FAILED' },
      });

      await this.sendPushNotification({
        userId,
        title: 'Изплащането не успя',
        body: 'Може да се наложи действие от ваша страна. Балансът ви е възстановен.',
        data: { type: 'payout_failed_generic', url: '/profile/bank' },
      }).catch((err) => logger.error('[notifyPayoutFailedGeneric] push failed:', err));

      const payoutUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true },
      });
      if (payoutUser?.email) {
        detach(emailService.sendEmail({
          to: payoutUser.email,
          subject: 'Payout failed — BoomCard',
          html: `
            <p>Hi ${payoutUser.firstName || 'there'},</p>
            <p>Your BoomCard cashback payout could not be processed and some action may be required on your side.</p>
            <p>Your balance has been restored. Please open the app to review your payout details and try again.</p>
            <p>— The BoomCard Team</p>
          `,
        }), (err) => logger.error('[notifyPayoutFailedGeneric] email failed:', err));
      }
    } catch (error) {
      logger.error('[notifyPayoutFailedGeneric] failed:', error);
    }
  }

  /**
   * F-018 / Audit M2 — Subscription-cancellation confirmation.
   * Spec §11.1/§11.2: "Subscription cancellation confirmed" is a MANDATORY Payment
   * notification (no opt-out) and must be accompanied by an email. Classified under
   * the Payment category (PAYMENT_SUCCESS) so it is exempt from notification opt-out
   * filtering, and a mandatory confirmation email is sent here so the user gets the
   * email regardless of whether the caller also sends one.
   *
   * Callers (each fires exactly once per cancellation; see each caller's double-fire
   * guard so a single cancellation never produces two notifications):
   *   - subscriptionService.cancelSubscription (user-initiated via our API), and
   *   - stripeService.handleSubscriptionDeleted when finalStatus === 'CANCELLED'
   *     and canceledAt was not already set (i.e. a cancel made directly in the
   *     Stripe customer portal that never passed through cancelSubscription).
   * The Paysera grace-expiry job reaches CANCELLED only for subs already cancelled
   * via cancelSubscription (which already notified), so it intentionally does not
   * re-emit. This is a "cancellation confirmed" event only — EXPIRED / FAILED_PAYMENT
   * (payment-failure) transitions are a different Failed Payment notification (§3.4).
   *
   * @param sendEmail When true (default) this method also sends its own plain
   *   confirmation email — correct for the admin-cancel and Stripe-webhook paths
   *   which have no other cancellation email. cancelSubscription (the user path)
   *   passes false because it already sends a richer templated email via
   *   emailService.sendSubscriptionCancelledEmail (plan name + access-until date +
   *   manage URL); suppressing here avoids double-sending while still creating the
   *   in-app record.
   */
  async notifySubscriptionCancelledInApp(userId: string, sendEmail: boolean = true): Promise<void> {
    try {
      // Payment-category in-app notification (mandatory, no opt-out per §11.1).
      await this.createNotification({
        userId,
        type: 'PAYMENT_SUCCESS',
        title: 'Subscription cancellation confirmed',
        titleBg: 'Отмяната на абонамента е потвърдена',
        message: 'Your BoomCard subscription has been cancelled. You will retain access until the end of your current billing period.',
        messageBg: 'Абонаментът ви BoomCard е отменен. Ще запазите достъп до края на платения период.',
        priority: 'high',
        actionUrl: '/subscription',
        actionText: 'View subscription',
        actionTextBg: 'Виж абонамент',
        data: { type: 'subscription_cancelled' },
      });

      // Mandatory Payment-category email (§11.2). Best-effort send — the in-app
      // record above is the durable record; the email is the second channel.
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true },
      });
      if (sendEmail && user?.email) {
        detach(emailService.sendEmail({
          to: user.email,
          subject: 'Your BoomCard subscription has been cancelled',
          html: `
            <p>Hi ${user.firstName || ''},</p>
            <p>This confirms that your BoomCard subscription has been cancelled.</p>
            <p>You will retain access until the end of your current billing period.</p>
            <p>You can review your subscription status any time on your <a href="${process.env.APP_URL || 'https://mobile.boomcard.bg'}/subscription">subscription page</a>.</p>
          `,
        }), (err) => logger.error('[notifySubscriptionCancelledInApp] confirmation email failed:', err));
      }
    } catch (error) {
      logger.error('[notifySubscriptionCancelledInApp] failed:', error);
    }
  }

  // ===== F-019: Direct cashback expiry warning notification =====

  /**
   * F-019 — Direct cashback expiry warning notification.
   * Spec requires this notification to fire reliably regardless of automation config.
   * Called by the scheduler alongside fireAutomation('cashback.expiring', ...).
   * The automation call remains as belt-and-suspenders but this direct call
   * ensures the mandatory spec notification fires even when automation is inactive.
   */
  async notifyCashbackExpiringSoon(userId: string, expiryDate: Date): Promise<void> {
    try {
      const dateStr = expiryDate.toLocaleDateString('bg-BG', { timeZone: 'Europe/Sofia' });
      await this.createNotification({
        userId,
        type: 'SUBSCRIPTION_EXPIRING',
        title: 'Cashback expiring soon',
        titleBg: 'Кешбекът изтича скоро',
        message: `You have cashback that expires on ${dateStr}. Request a payout now to avoid losing it.`,
        messageBg: `Имате кешбек, който изтича на ${dateStr}. Изтеглете го сега, за да не го загубите.`,
        priority: 'high',
        actionUrl: '/wallet',
        actionText: 'View wallet',
        actionTextBg: 'Виж портфейл',
        data: { type: 'cashback_expiring_soon', expiryDate: expiryDate.toISOString() },
      });

      await this.sendPushNotification({
        userId,
        title: 'Кешбекът изтича!',
        body: `Изтегли кешбека си преди ${dateStr}.`,
        data: { type: 'cashback_expiring_soon', url: '/wallet' },
      }).catch((err) => logger.error('[notifyCashbackExpiringSoon] push failed:', err));
    } catch (error) {
      logger.error('[notifyCashbackExpiringSoon] failed:', error);
    }
  }

  /**
   * Mark notification as read.
   *
   * r2h B8 / r2i S1: userId added to the where-clause to prevent any caller from
   * marking another user's notification as read by guessing a notification ID (IDOR).
   * The update becomes a no-op when the notificationId belongs to a different user,
   * which is the safe failure mode.
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await prisma.notification.update({
      where: { id: notificationId, userId },
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

    logger.info(`Deleted ${result.count} old notifications`);
    return result.count;
  }
}

export const notificationService = new NotificationService();
