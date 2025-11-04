import { prisma } from '../lib/prisma';

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
 * - Push notifications (via FCM/APNS)
 * - Email (via SMTP)
 * - SMS (via Twilio)
 * - In-app notifications
 */

interface NotificationParams {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class NotificationService {
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
        message: `Your receipt from ${merchantName} was approved. You earned ${cashbackAmount.toFixed(2)} BGN cashback!`,
        data: {
          receiptId,
          merchantName,
          cashbackAmount,
        },
        priority: 'HIGH',
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
        message: `Your receipt from ${merchantName} was not approved. Reason: ${reason}`,
        data: {
          receiptId,
          merchantName,
          reason,
        },
        priority: 'MEDIUM',
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
        type: 'RECEIPT_UNDER_REVIEW',
        title: 'Receipt Under Review',
        message: `Your receipt from ${merchantName} requires manual verification. ${estimatedReviewTime || 'This usually takes 24-48 hours.'}`,
        data: {
          receiptId,
          merchantName,
        },
        priority: 'LOW',
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
        message: `${amount.toFixed(2)} BGN has been added to your account. New balance: ${newBalance.toFixed(2)} BGN`,
        data: {
          amount,
          newBalance,
        },
        priority: 'HIGH',
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
          message: `Receipt ${receiptId} from user ${userId} has fraud score ${fraudScore}. Reasons: ${fraudReasons.join(', ')}`,
          data: {
            receiptId,
            userId,
            fraudScore,
            fraudReasons,
          },
          priority: 'HIGH',
        });
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

      await this.sendEmail({
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

  // ===== Internal Methods =====

  /**
   * Create in-app notification record
   */
  private async createNotification(params: NotificationParams): Promise<void> {
    await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type as any,
        title: params.title,
        message: params.message,
        data: params.data ? JSON.stringify(params.data) : null,
        isRead: false,
      },
    });
  }

  /**
   * Send push notification via FCM/APNS
   */
  private async sendPushNotification(params: {
    userId: string;
    title: string;
    body: string;
    data?: Record<string, any>;
  }): Promise<void> {
    // Get user's push tokens
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true },
    });

    if (!user) {
      return; // User doesn't exist
    }

    // TODO: Add pushToken field to User model or create separate PushToken table
    // For now, skip push notification sending

    // TODO: Integrate with FCM (Firebase Cloud Messaging)
    // Example using firebase-admin:
    /*
    const admin = require('firebase-admin');
    await admin.messaging().send({
      token: userPushToken,
      notification: {
        title: params.title,
        body: params.body,
      },
      data: params.data || {},
    });
    */

    console.log(`📱 Push notification queued for user ${params.userId}`);
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
        role: 'ADMIN',
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
