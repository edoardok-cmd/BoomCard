/**
 * Email Service using Resend
 * Handles transactional emails for BoomCard platform
 * Documentation: https://resend.com/docs
 */

import { Resend } from 'resend';
import { logger } from '../utils/logger';

// ============================================
// Types & Interfaces
// ============================================

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
}

export interface PaymentConfirmationData {
  customerName: string;
  orderId: string;
  amount: number;
  currency: string;
  date: Date;
  receiptUrl?: string;
}

export interface ReceiptSubmissionData {
  customerName: string;
  merchantName: string;
  amount: number;
  cashbackAmount: number;
  submissionDate: Date;
  receiptUrl?: string;
}

export interface WalletUpdateData {
  customerName: string;
  newBalance: number;
  changeAmount: number;
  transactionType: 'credit' | 'debit';
  description: string;
  date: Date;
}

export interface WelcomeEmailData {
  customerName: string;
  email: string;
  dashboardUrl: string;
}

export interface PendingPaymentReminderData {
  customerName: string;
  planName: string;
  planNameBg: string;
  price: string;
  billingPeriod: string;
  billingPeriodBg: string;
  reminderType: '1h' | '24h' | '7d';
  paymentUrl: string;
  language: 'en' | 'bg';
}

export interface RenewalReminderData {
  customerName: string;
  planName: string;
  planNameBg: string;
  price: string;
  renewalDate: string;
  manageUrl: string;
  language: 'en' | 'bg';
}

export interface ReceiptApprovedData {
  customerName: string;
  merchantName: string;
  amount: number;
  cashbackAmount: number;
  receiptDate?: Date;
  walletUrl?: string;
}

export interface ReceiptRejectedData {
  customerName: string;
  merchantName: string;
  amount: number;
  reason: string;
  supportUrl?: string;
}

export interface PaymentFailedData {
  customerName: string;
  orderId: string;
  amount: number;
  currency: string;
  reason: 'failed' | 'cancelled';
  retryUrl?: string;
}

export interface SubscriptionActivatedData {
  customerName: string;
  planName: string;
  orderId: string;
  amount: number;
  currency: string;
  nextBillingDate?: Date;
  dashboardUrl?: string;
}

export interface FraudAlertData {
  receiptId: string;
  userId: string;
  fraudScore: number;
  fraudReasons: string[];
  reviewUrl?: string;
}

export interface ReceiptExportData {
  customerName: string;
  receipts: Array<{
    merchantName: string;
    amount: number;
    cashbackAmount: number;
    date: string;
    status: string;
  }>;
  totalCashback: number;
  exportDate: Date;
}

// ============================================
// Email Service Class
// ============================================

export class EmailService {
  private resend: Resend;
  private fromEmail: string;
  private fromName: string;
  private enabled: boolean;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@boomcard.bg';
    this.fromName = process.env.EMAIL_FROM_NAME || 'BoomCard';
    this.enabled = !!apiKey && process.env.NODE_ENV === 'production';

    if (!apiKey) {
      logger.warn('⚠️  Resend API key not configured. Emails will be logged only.');
      // Create dummy instance
      this.resend = null as any;
    } else {
      this.resend = new Resend(apiKey);
      logger.info('✅ Email Service initialized with Resend');
    }
  }

  /**
   * Send generic email
   */
  async sendEmail(options: EmailOptions): Promise<{ success: boolean; id?: string }> {
    try {
      if (!this.enabled) {
        logger.info(`📧 [EMAIL DISABLED] Would send email to: ${options.to}`);
        logger.info(`   Subject: ${options.subject}`);
        return { success: true, id: 'disabled-mode' };
      }

      const { data, error } = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
        cc: options.cc,
        bcc: options.bcc,
        replyTo: options.replyTo,
      });

      if (error) {
        logger.error('❌ Error sending email:', error);
        return { success: false };
      }

      logger.info(`✅ Email sent successfully: ${data?.id}`);
      return { success: true, id: data?.id };
    } catch (error: any) {
      logger.error('❌ Email service error:', error);
      return { success: false };
    }
  }

  /**
   * Send payment confirmation email
   */
  async sendPaymentConfirmation(
    email: string,
    data: PaymentConfirmationData
  ): Promise<{ success: boolean }> {
    const html = this.generatePaymentConfirmationEmail(data);
    const text = this.generatePaymentConfirmationText(data);

    return this.sendEmail({
      to: email,
      subject: `Payment Confirmation - ${data.orderId}`,
      html,
      text,
    });
  }

  /**
   * Send receipt submission confirmation
   */
  async sendReceiptConfirmation(
    email: string,
    data: ReceiptSubmissionData
  ): Promise<{ success: boolean }> {
    const html = this.generateReceiptConfirmationEmail(data);
    const text = this.generateReceiptConfirmationText(data);

    return this.sendEmail({
      to: email,
      subject: `Receipt Submitted - ${data.cashbackAmount.toFixed(2)} BGN Cashback Earned!`,
      html,
      text,
    });
  }

  /**
   * Send wallet update notification
   */
  async sendWalletUpdate(
    email: string,
    data: WalletUpdateData
  ): Promise<{ success: boolean }> {
    const html = this.generateWalletUpdateEmail(data);
    const text = this.generateWalletUpdateText(data);

    return this.sendEmail({
      to: email,
      subject: `Wallet ${data.transactionType === 'credit' ? 'Topped Up' : 'Updated'}`,
      html,
      text,
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(
    email: string,
    data: WelcomeEmailData
  ): Promise<{ success: boolean }> {
    const html = this.generateWelcomeEmail(data);
    const text = this.generateWelcomeText(data);

    return this.sendEmail({
      to: email,
      subject: 'Welcome to BoomCard! 🎉',
      html,
      text,
    });
  }

  /**
   * Send password reset OTP email
   */
  async sendPasswordResetEmail(data: { customerName: string; email: string; otp: string }): Promise<{ success: boolean }> {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff;">
        <h2 style="color:#1a1a1a;margin-bottom:8px;">Reset your password</h2>
        <p style="color:#555;margin-bottom:24px;">Hi ${data.customerName}, use the code below to reset your BoomCard password. It expires in <strong>15 minutes</strong>.</p>
        <div style="background:#f5f5f5;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#1a1a1a;">${data.otp}</span>
        </div>
        <p style="color:#999;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
      </div>`;

    return this.sendEmail({
      to: data.email,
      subject: 'Your BoomCard password reset code',
      html,
      text: `Your BoomCard password reset code is: ${data.otp}\n\nIt expires in 15 minutes.\n\nIf you didn't request this, ignore this email.`,
    });
  }

  /**
   * Send pending payment reminder email
   */
  async sendPendingPaymentReminder(
    email: string,
    data: PendingPaymentReminderData
  ): Promise<{ success: boolean }> {
    const html = this.generatePendingPaymentReminderEmail(data);
    const text = this.generatePendingPaymentReminderText(data);

    const subjects = {
      '1h': {
        en: 'Complete Your BoomCard Subscription',
        bg: 'Завършете своя BoomCard абонамент',
      },
      '24h': {
        en: 'Don\'t Miss Out on BoomCard Premium Benefits!',
        bg: 'Не изпускайте BoomCard Premium предимствата!',
      },
      '7d': {
        en: 'Last Chance: Activate Your BoomCard Premium',
        bg: 'Последен шанс: Активирайте BoomCard Premium',
      },
    };

    return this.sendEmail({
      to: email,
      subject: subjects[data.reminderType][data.language],
      html,
      text,
    });
  }

  // ============================================
  // HTML Email Templates
  // ============================================

  private generatePaymentConfirmationEmail(data: PaymentConfirmationData): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Payment Successful!</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px;">Hi ${data.customerName},</p>

              <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                Your payment has been processed successfully. Your wallet has been topped up!
              </p>

              <!-- Payment Details -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8f9fa; border-radius: 6px; padding: 20px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 10px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0;">Amount Paid:</td>
                        <td align="right" style="color: #333333; font-size: 18px; font-weight: bold; padding: 8px 0;">
                          ${data.amount.toFixed(2)} ${data.currency}
                        </td>
                      </tr>
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0; border-top: 1px solid #dee2e6;">Order ID:</td>
                        <td align="right" style="color: #333333; font-size: 14px; font-family: monospace; padding: 8px 0; border-top: 1px solid #dee2e6;">
                          ${data.orderId}
                        </td>
                      </tr>
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0;">Date:</td>
                        <td align="right" style="color: #333333; font-size: 14px; padding: 8px 0;">
                          ${data.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="https://boomcard.bg/wallet"
                       style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                      View Wallet
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; color: #999999; font-size: 14px; line-height: 1.6;">
                Questions? Contact us at <a href="mailto:support@boomcard.bg" style="color: #667eea; text-decoration: none;">support@boomcard.bg</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #999999; font-size: 12px;">
                © ${new Date().getFullYear()} BoomCard. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  private generateReceiptConfirmationEmail(data: ReceiptSubmissionData): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt Confirmed</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">🎉 Cashback Earned!</h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px;">Hi ${data.customerName},</p>

              <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                Your receipt from <strong>${data.merchantName}</strong> has been submitted successfully!
              </p>

              <!-- Cashback Amount (Highlighted) -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                <tr>
                  <td align="center" style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 30px; border-radius: 8px;">
                    <p style="margin: 0 0 10px; color: #ffffff; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">You Earned</p>
                    <p style="margin: 0; color: #ffffff; font-size: 36px; font-weight: bold;">
                      ${data.cashbackAmount.toFixed(2)} BGN
                    </p>
                    <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Cashback</p>
                  </td>
                </tr>
              </table>

              <!-- Receipt Details -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8f9fa; border-radius: 6px; padding: 20px; margin: 30px 0;">
                <tr>
                  <td>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0;">Merchant:</td>
                        <td align="right" style="color: #333333; font-size: 14px; font-weight: 600; padding: 8px 0;">${data.merchantName}</td>
                      </tr>
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0;">Purchase Amount:</td>
                        <td align="right" style="color: #333333; font-size: 14px; padding: 8px 0;">${data.amount.toFixed(2)} BGN</td>
                      </tr>
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0;">Submission Date:</td>
                        <td align="right" style="color: #333333; font-size: 14px; padding: 8px 0;">
                          ${data.submissionDate.toLocaleDateString('en-GB')}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="https://boomcard.bg/receipts"
                       style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                      View All Receipts
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #999999; font-size: 12px;">
                © ${new Date().getFullYear()} BoomCard. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  private generateWalletUpdateEmail(data: WalletUpdateData): string {
    const isCredit = data.transactionType === 'credit';
    const gradient = isCredit
      ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wallet Update</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: ${gradient}; padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">
                Wallet ${isCredit ? 'Topped Up' : 'Updated'}
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px;">Hi ${data.customerName},</p>

              <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                ${data.description}
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8f9fa; border-radius: 6px; padding: 20px; margin: 30px 0;">
                <tr>
                  <td>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0;">
                          ${isCredit ? 'Amount Added:' : 'Amount Spent:'}
                        </td>
                        <td align="right" style="color: ${isCredit ? '#10b981' : '#ef4444'}; font-size: 18px; font-weight: bold; padding: 8px 0;">
                          ${isCredit ? '+' : '-'}${Math.abs(data.changeAmount).toFixed(2)} BGN
                        </td>
                      </tr>
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0; border-top: 1px solid #dee2e6;">
                          New Balance:
                        </td>
                        <td align="right" style="color: #333333; font-size: 20px; font-weight: bold; padding: 8px 0; border-top: 1px solid #dee2e6;">
                          ${data.newBalance.toFixed(2)} BGN
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="https://boomcard.bg/wallet"
                       style="display: inline-block; padding: 14px 32px; background: ${gradient}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                      View Wallet
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #999999; font-size: 12px;">
                © ${new Date().getFullYear()} BoomCard. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  private generateWelcomeEmail(data: WelcomeEmailData): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to BoomCard</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 50px 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0 0 10px; color: #ffffff; font-size: 32px; font-weight: bold;">Welcome to BoomCard! 🎉</h1>
              <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 16px;">Your smart discount card for Bulgarian venues</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px;">Hi ${data.customerName},</p>

              <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                We're excited to have you on board! BoomCard gives you instant access to exclusive discounts and cashback at hundreds of restaurants, hotels, and venues across Bulgaria.
              </p>

              <!-- Features -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                <tr>
                  <td style="padding: 20px; background-color: #f8f9fa; border-radius: 6px; margin-bottom: 15px;">
                    <p style="margin: 0 0 8px; color: #667eea; font-size: 18px; font-weight: bold;">📸 Scan Receipts</p>
                    <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.5;">
                      Simply snap a photo of your receipt and earn instant cashback
                    </p>
                  </td>
                </tr>
                <tr><td style="height: 15px;"></td></tr>
                <tr>
                  <td style="padding: 20px; background-color: #f8f9fa; border-radius: 6px;">
                    <p style="margin: 0 0 8px; color: #667eea; font-size: 18px; font-weight: bold;">💳 Digital Wallet</p>
                    <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.5;">
                      Track your savings and use your balance at partner venues
                    </p>
                  </td>
                </tr>
                <tr><td style="height: 15px;"></td></tr>
                <tr>
                  <td style="padding: 20px; background-color: #f8f9fa; border-radius: 6px;">
                    <p style="margin: 0 0 8px; color: #667eea; font-size: 18px; font-weight: bold;">🎁 Exclusive Offers</p>
                    <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.5;">
                      Get personalized deals from your favorite places
                    </p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 40px 0;">
                <tr>
                  <td align="center">
                    <a href="${data.dashboardUrl}"
                       style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 18px;">
                      Get Started
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; color: #999999; font-size: 14px; line-height: 1.6; text-align: center;">
                Need help? We're here for you at <a href="mailto:support@boomcard.bg" style="color: #667eea; text-decoration: none;">support@boomcard.bg</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #999999; font-size: 12px;">
                © ${new Date().getFullYear()} BoomCard. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  private generatePendingPaymentReminderEmail(data: PendingPaymentReminderData): string {
    const isBg = data.language === 'bg';
    const planName = isBg ? data.planNameBg : data.planName;
    const billingPeriod = isBg ? data.billingPeriodBg : data.billingPeriod;

    const content = {
      '1h': {
        en: {
          title: 'Complete Your Subscription',
          subtitle: 'You\'re just one step away!',
          message: 'You started signing up for BoomCard Premium but didn\'t complete your payment. Complete your subscription now to unlock exclusive discounts and cashback.',
          cta: 'Complete Payment',
        },
        bg: {
          title: 'Завършете абонамента си',
          subtitle: 'Само една стъпка ви дели!',
          message: 'Започнахте регистрация за BoomCard Premium, но не завършихте плащането. Завършете абонамента си сега, за да отключите ексклузивни отстъпки и кешбек.',
          cta: 'Завърши плащането',
        },
      },
      '24h': {
        en: {
          title: 'Don\'t Miss Your Benefits!',
          subtitle: 'Your Premium subscription is waiting',
          message: 'It\'s been a day since you started signing up for BoomCard Premium. Don\'t miss out on up to 20% discounts at hundreds of partner venues across Bulgaria!',
          cta: 'Activate Now',
        },
        bg: {
          title: 'Не изпускайте предимствата!',
          subtitle: 'Вашият Premium абонамент ви очаква',
          message: 'Измина ден, откакто започнахте регистрация за BoomCard Premium. Не изпускайте до 20% отстъпки в стотици партньорски обекти в България!',
          cta: 'Активирай сега',
        },
      },
      '7d': {
        en: {
          title: 'Last Chance!',
          subtitle: 'Your pending subscription expires soon',
          message: 'It\'s been a week since you signed up for BoomCard. This is your last reminder to complete your Premium subscription and start saving at restaurants, hotels, and more.',
          cta: 'Complete Payment Now',
        },
        bg: {
          title: 'Последен шанс!',
          subtitle: 'Вашият чакащ абонамент изтича скоро',
          message: 'Измина седмица, откакто се регистрирахте за BoomCard. Това е последното ви напомняне да завършите Premium абонамента си и да започнете да спестявате в ресторанти, хотели и други.',
          cta: 'Завърши плащането сега',
        },
      },
    };

    const c = content[data.reminderType][data.language];
    const urgencyColors = {
      '1h': '#667eea',
      '24h': '#f59e0b',
      '7d': '#ef4444',
    };
    const urgencyColor = urgencyColors[data.reminderType];

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${c.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${urgencyColor} 0%, #764ba2 100%); padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0 0 10px; color: #ffffff; font-size: 28px; font-weight: bold;">${c.title}</h1>
              <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 16px;">${c.subtitle}</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px;">
                ${isBg ? 'Здравейте' : 'Hi'} ${data.customerName},
              </p>

              <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                ${c.message}
              </p>

              <!-- Plan Details -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8f9fa; border-radius: 6px; padding: 20px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 10px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0;">
                          ${isBg ? 'Избран план' : 'Selected Plan'}:
                        </td>
                        <td align="right" style="color: #333333; font-size: 16px; font-weight: bold; padding: 8px 0;">
                          ${planName}
                        </td>
                      </tr>
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0; border-top: 1px solid #dee2e6;">
                          ${isBg ? 'Период' : 'Billing Period'}:
                        </td>
                        <td align="right" style="color: #333333; font-size: 14px; padding: 8px 0; border-top: 1px solid #dee2e6;">
                          ${billingPeriod}
                        </td>
                      </tr>
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0; border-top: 1px solid #dee2e6;">
                          ${isBg ? 'Цена' : 'Price'}:
                        </td>
                        <td align="right" style="color: ${urgencyColor}; font-size: 20px; font-weight: bold; padding: 8px 0; border-top: 1px solid #dee2e6;">
                          ${data.price}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${data.paymentUrl}"
                       style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, ${urgencyColor} 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 18px;">
                      ${c.cta}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; color: #999999; font-size: 14px; line-height: 1.6; text-align: center;">
                ${isBg ? 'Въпроси? Свържете се с нас на' : 'Questions? Contact us at'}
                <a href="mailto:support@boomcard.bg" style="color: #667eea; text-decoration: none;">support@boomcard.bg</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #999999; font-size: 12px;">
                © ${new Date().getFullYear()} BoomCard. ${isBg ? 'Всички права запазени.' : 'All rights reserved.'}
              </p>
              <p style="margin: 10px 0 0; color: #cccccc; font-size: 11px;">
                ${isBg
                  ? 'Получавате този имейл, защото се регистрирахте за BoomCard.'
                  : 'You received this email because you signed up for BoomCard.'}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  // ============================================
  // Plain Text Templates (fallback)
  // ============================================

  private generatePaymentConfirmationText(data: PaymentConfirmationData): string {
    return `
Hi ${data.customerName},

Your payment has been processed successfully. Your wallet has been topped up!

PAYMENT DETAILS:
- Amount Paid: ${data.amount.toFixed(2)} ${data.currency}
- Order ID: ${data.orderId}
- Date: ${data.date.toLocaleDateString('en-GB')}

View your wallet: https://boomcard.bg/wallet

Questions? Contact us at support@boomcard.bg

© ${new Date().getFullYear()} BoomCard. All rights reserved.
    `.trim();
  }

  private generateReceiptConfirmationText(data: ReceiptSubmissionData): string {
    return `
Hi ${data.customerName},

🎉 Cashback Earned!

Your receipt from ${data.merchantName} has been submitted successfully!

YOU EARNED: ${data.cashbackAmount.toFixed(2)} BGN Cashback

RECEIPT DETAILS:
- Merchant: ${data.merchantName}
- Purchase Amount: ${data.amount.toFixed(2)} BGN
- Submission Date: ${data.submissionDate.toLocaleDateString('en-GB')}

View all receipts: https://boomcard.bg/receipts

© ${new Date().getFullYear()} BoomCard. All rights reserved.
    `.trim();
  }

  private generateWalletUpdateText(data: WalletUpdateData): string {
    const isCredit = data.transactionType === 'credit';
    return `
Hi ${data.customerName},

${data.description}

${isCredit ? 'Amount Added' : 'Amount Spent'}: ${isCredit ? '+' : '-'}${Math.abs(data.changeAmount).toFixed(2)} BGN
New Balance: ${data.newBalance.toFixed(2)} BGN

View wallet: https://boomcard.bg/wallet

© ${new Date().getFullYear()} BoomCard. All rights reserved.
    `.trim();
  }

  private generateWelcomeText(data: WelcomeEmailData): string {
    return `
Welcome to BoomCard! 🎉

Hi ${data.customerName},

We're excited to have you on board! BoomCard gives you instant access to exclusive discounts and cashback at hundreds of restaurants, hotels, and venues across Bulgaria.

FEATURES:
📸 Scan Receipts - Simply snap a photo of your receipt and earn instant cashback
💳 Digital Wallet - Track your savings and use your balance at partner venues
🎁 Exclusive Offers - Get personalized deals from your favorite places

Get started: ${data.dashboardUrl}

Need help? We're here for you at support@boomcard.bg

© ${new Date().getFullYear()} BoomCard. All rights reserved.
    `.trim();
  }

  private generatePendingPaymentReminderText(data: PendingPaymentReminderData): string {
    const isBg = data.language === 'bg';
    const planName = isBg ? data.planNameBg : data.planName;
    const billingPeriod = isBg ? data.billingPeriodBg : data.billingPeriod;

    const content = {
      '1h': {
        en: 'You started signing up for BoomCard Premium but didn\'t complete your payment. Complete your subscription now to unlock exclusive discounts and cashback.',
        bg: 'Започнахте регистрация за BoomCard Premium, но не завършихте плащането. Завършете абонамента си сега, за да отключите ексклузивни отстъпки и кешбек.',
      },
      '24h': {
        en: 'It\'s been a day since you started signing up for BoomCard Premium. Don\'t miss out on up to 20% discounts at hundreds of partner venues across Bulgaria!',
        bg: 'Измина ден, откакто започнахте регистрация за BoomCard Premium. Не изпускайте до 20% отстъпки в стотици партньорски обекти в България!',
      },
      '7d': {
        en: 'It\'s been a week since you signed up for BoomCard. This is your last reminder to complete your Premium subscription and start saving.',
        bg: 'Измина седмица, откакто се регистрирахте за BoomCard. Това е последното ви напомняне да завършите Premium абонамента си.',
      },
    };

    if (isBg) {
      return `
Здравейте ${data.customerName},

${content[data.reminderType].bg}

ДЕТАЙЛИ ЗА АБОНАМЕНТА:
- План: ${planName}
- Период: ${billingPeriod}
- Цена: ${data.price}

Завършете плащането: ${data.paymentUrl}

Въпроси? Свържете се с нас на support@boomcard.bg

© ${new Date().getFullYear()} BoomCard. Всички права запазени.
      `.trim();
    }

    return `
Hi ${data.customerName},

${content[data.reminderType].en}

SUBSCRIPTION DETAILS:
- Plan: ${planName}
- Billing Period: ${billingPeriod}
- Price: ${data.price}

Complete your payment: ${data.paymentUrl}

Questions? Contact us at support@boomcard.bg

© ${new Date().getFullYear()} BoomCard. All rights reserved.
    `.trim();
  }

  /**
   * Send subscription renewal reminder email (7 days before renewal)
   */
  async sendRenewalReminder(
    email: string,
    data: RenewalReminderData
  ): Promise<{ success: boolean }> {
    const isBg = data.language === 'bg';
    const planName = isBg ? data.planNameBg : data.planName;

    const subject = isBg
      ? `Напомняне: Вашият BoomCard абонамент се подновява на ${data.renewalDate}`
      : `Reminder: Your BoomCard subscription renews on ${data.renewalDate}`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px;">${isBg ? 'Напомняне за подновяване' : 'Renewal Reminder'}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px; color: #333; font-size: 16px;">${isBg ? 'Здравейте' : 'Hi'} ${data.customerName},</p>
              <p style="margin: 0 0 20px; color: #666; font-size: 16px; line-height: 1.6;">
                ${isBg
                  ? `Вашият абонамент <strong>${planName}</strong> ще бъде автоматично подновен на <strong>${data.renewalDate}</strong> за <strong>${data.price}</strong>.`
                  : `Your <strong>${planName}</strong> subscription will automatically renew on <strong>${data.renewalDate}</strong> for <strong>${data.price}</strong>.`}
              </p>
              <p style="margin: 0 0 20px; color: #666; font-size: 16px; line-height: 1.6;">
                ${isBg
                  ? 'Ако не желаете подновяване, можете да отмените абонамента си преди датата на подновяване.'
                  : 'If you do not wish to renew, you can cancel your subscription before the renewal date.'}
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.manageUrl}" style="background: linear-gradient(135deg, #667eea, #764ba2); color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">
                  ${isBg ? 'Управление на абонамента' : 'Manage Subscription'}
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #999; font-size: 12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

    const text = `${isBg ? 'Здравейте' : 'Hi'} ${data.customerName},

${isBg
  ? `Вашият абонамент ${planName} ще бъде автоматично подновен на ${data.renewalDate} за ${data.price}.`
  : `Your ${planName} subscription will automatically renew on ${data.renewalDate} for ${data.price}.`}

${isBg ? 'Управление на абонамента' : 'Manage your subscription'}: ${data.manageUrl}

${isBg ? 'Въпроси? Свържете се с нас на' : 'Questions? Contact us at'} support@boomcard.bg`;

    return this.sendEmail({ to: email, subject, html, text });
  }
  /**
   * Send receipt approved email to user
   */
  async sendReceiptApprovedEmail(
    email: string,
    data: ReceiptApprovedData
  ): Promise<{ success: boolean }> {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <div style="font-size:48px;margin-bottom:8px;">✅</div>
          <h1 style="margin:0;color:#fff;font-size:28px;">Receipt Approved!</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;">Hi ${data.customerName},</p>
          <p style="margin:0 0 30px;color:#666;font-size:16px;line-height:1.6;">
            Great news! Your receipt from <strong>${data.merchantName}</strong> has been approved and your cashback has been credited to your wallet.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f9fa;border-radius:6px;padding:20px;margin-bottom:30px;">
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;">Merchant:</td>
              <td align="right" style="color:#333;font-size:14px;font-weight:bold;padding:8px 0;">${data.merchantName}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #dee2e6;">Receipt Amount:</td>
              <td align="right" style="color:#333;font-size:14px;padding:8px 0;border-top:1px solid #dee2e6;">${data.amount.toFixed(2)} BGN</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #dee2e6;">Cashback Earned:</td>
              <td align="right" style="color:#22c55e;font-size:20px;font-weight:bold;padding:8px 0;border-top:1px solid #dee2e6;">+${data.cashbackAmount.toFixed(2)} BGN</td>
            </tr>
          </table>
          ${data.walletUrl ? `<div style="text-align:center;margin-bottom:30px;"><a href="${data.walletUrl}" style="display:inline-block;background:#22c55e;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:bold;">View My Wallet</a></div>` : ''}
          <p style="color:#999;font-size:13px;margin:0;">Questions? Contact us at <a href="mailto:support@boomcard.bg" style="color:#667eea;">support@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `Hi ${data.customerName},\n\nYour receipt from ${data.merchantName} has been approved!\n\nReceipt Amount: ${data.amount.toFixed(2)} BGN\nCashback Earned: +${data.cashbackAmount.toFixed(2)} BGN\n\nThe cashback has been credited to your wallet.\n\nQuestions? Contact support@boomcard.bg`;
    return this.sendEmail({
      to: email,
      subject: `Receipt Approved – +${data.cashbackAmount.toFixed(2)} BGN Cashback Credited!`,
      html,
      text,
    });
  }

  /**
   * Send receipt rejected email to user
   */
  async sendReceiptRejectedEmail(
    email: string,
    data: ReceiptRejectedData
  ): Promise<{ success: boolean }> {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <div style="font-size:48px;margin-bottom:8px;">❌</div>
          <h1 style="margin:0;color:#fff;font-size:28px;">Receipt Not Approved</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;">Hi ${data.customerName},</p>
          <p style="margin:0 0 30px;color:#666;font-size:16px;line-height:1.6;">
            Unfortunately, your receipt from <strong>${data.merchantName}</strong> could not be approved.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff5f5;border:1px solid #fecaca;border-radius:6px;padding:20px;margin-bottom:30px;">
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;">Merchant:</td>
              <td align="right" style="color:#333;font-size:14px;font-weight:bold;padding:8px 0;">${data.merchantName}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #fecaca;">Amount:</td>
              <td align="right" style="color:#333;font-size:14px;padding:8px 0;border-top:1px solid #fecaca;">${data.amount.toFixed(2)} BGN</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #fecaca;">Reason:</td>
              <td align="right" style="color:#ef4444;font-size:14px;padding:8px 0;border-top:1px solid #fecaca;">${data.reason}</td>
            </tr>
          </table>
          <p style="color:#666;font-size:14px;line-height:1.6;">If you believe this is a mistake, please contact our support team with your receipt details.</p>
          ${data.supportUrl ? `<div style="text-align:center;margin-bottom:30px;"><a href="${data.supportUrl}" style="display:inline-block;background:#ef4444;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:bold;">Contact Support</a></div>` : ''}
          <p style="color:#999;font-size:13px;margin:0;">Questions? Contact us at <a href="mailto:support@boomcard.bg" style="color:#667eea;">support@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `Hi ${data.customerName},\n\nYour receipt from ${data.merchantName} (${data.amount.toFixed(2)} BGN) was not approved.\n\nReason: ${data.reason}\n\nIf you believe this is a mistake, please contact support@boomcard.bg`;
    return this.sendEmail({
      to: email,
      subject: `Receipt Update – Your receipt from ${data.merchantName}`,
      html,
      text,
    });
  }

  /**
   * Send payment failed/cancelled email to user
   */
  async sendPaymentFailedEmail(
    email: string,
    data: PaymentFailedData
  ): Promise<{ success: boolean }> {
    const isCancelled = data.reason === 'cancelled';
    const title = isCancelled ? 'Payment Cancelled' : 'Payment Failed';
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <div style="font-size:48px;margin-bottom:8px;">${isCancelled ? '⚠️' : '❗'}</div>
          <h1 style="margin:0;color:#fff;font-size:28px;">${title}</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;">Hi ${data.customerName},</p>
          <p style="margin:0 0 30px;color:#666;font-size:16px;line-height:1.6;">
            ${isCancelled ? 'Your payment was cancelled and no charge was made to your account.' : 'We were unable to process your payment. No charge was made to your account.'}
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:20px;margin-bottom:30px;">
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;">Order ID:</td>
              <td align="right" style="color:#333;font-size:14px;font-family:monospace;padding:8px 0;">${data.orderId}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #fde68a;">Amount:</td>
              <td align="right" style="color:#333;font-size:14px;padding:8px 0;border-top:1px solid #fde68a;">${data.amount.toFixed(2)} ${data.currency}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #fde68a;">Status:</td>
              <td align="right" style="color:#f59e0b;font-size:14px;font-weight:bold;padding:8px 0;border-top:1px solid #fde68a;">${title}</td>
            </tr>
          </table>
          ${data.retryUrl ? `<div style="text-align:center;margin-bottom:30px;"><a href="${data.retryUrl}" style="display:inline-block;background:#667eea;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:bold;">Try Again</a></div>` : ''}
          <p style="color:#999;font-size:13px;margin:0;">Questions? Contact us at <a href="mailto:support@boomcard.bg" style="color:#667eea;">support@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `Hi ${data.customerName},\n\n${isCancelled ? 'Your payment was cancelled.' : 'Your payment failed.'}\n\nOrder ID: ${data.orderId}\nAmount: ${data.amount.toFixed(2)} ${data.currency}\n\n${data.retryUrl ? `Try again: ${data.retryUrl}\n\n` : ''}Questions? Contact support@boomcard.bg`;
    return this.sendEmail({
      to: email,
      subject: `BoomCard – ${title}`,
      html,
      text,
    });
  }

  /**
   * Send subscription activated email to user
   */
  async sendSubscriptionActivatedEmail(
    email: string,
    data: SubscriptionActivatedData
  ): Promise<{ success: boolean }> {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#667eea,#764ba2);padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <div style="font-size:48px;margin-bottom:8px;">🎉</div>
          <h1 style="margin:0;color:#fff;font-size:28px;">Subscription Activated!</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;">Hi ${data.customerName},</p>
          <p style="margin:0 0 30px;color:#666;font-size:16px;line-height:1.6;">
            Your <strong>${data.planName}</strong> subscription is now active. You can start earning cashback on all your receipts right away!
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f9fa;border-radius:6px;padding:20px;margin-bottom:30px;">
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;">Plan:</td>
              <td align="right" style="color:#333;font-size:14px;font-weight:bold;padding:8px 0;">${data.planName}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #dee2e6;">Order ID:</td>
              <td align="right" style="color:#333;font-size:14px;font-family:monospace;padding:8px 0;border-top:1px solid #dee2e6;">${data.orderId}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #dee2e6;">Amount Paid:</td>
              <td align="right" style="color:#333;font-size:18px;font-weight:bold;padding:8px 0;border-top:1px solid #dee2e6;">${data.amount.toFixed(2)} ${data.currency}</td>
            </tr>
            ${data.nextBillingDate ? `
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #dee2e6;">Next Billing Date:</td>
              <td align="right" style="color:#333;font-size:14px;padding:8px 0;border-top:1px solid #dee2e6;">${data.nextBillingDate.toLocaleDateString('en-GB')}</td>
            </tr>` : ''}
          </table>
          ${data.dashboardUrl ? `<div style="text-align:center;margin-bottom:30px;"><a href="${data.dashboardUrl}" style="display:inline-block;background:#667eea;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:bold;">Go to Dashboard</a></div>` : ''}
          <p style="color:#999;font-size:13px;margin:0;">Questions? Contact us at <a href="mailto:support@boomcard.bg" style="color:#667eea;">support@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `Hi ${data.customerName},\n\nYour ${data.planName} subscription is now active!\n\nOrder ID: ${data.orderId}\nAmount Paid: ${data.amount.toFixed(2)} ${data.currency}${data.nextBillingDate ? `\nNext Billing: ${data.nextBillingDate.toLocaleDateString('en-GB')}` : ''}\n\nQuestions? Contact support@boomcard.bg`;
    return this.sendEmail({
      to: email,
      subject: `Your BoomCard ${data.planName} Subscription is Active!`,
      html,
      text,
    });
  }

  /**
   * Send fraud alert email to admin
   */
  async sendFraudAlertEmail(
    email: string,
    data: FraudAlertData
  ): Promise<{ success: boolean }> {
    const riskLevel = data.fraudScore >= 80 ? 'CRITICAL' : data.fraudScore >= 61 ? 'HIGH' : 'MEDIUM';
    const riskColor = data.fraudScore >= 80 ? '#dc2626' : data.fraudScore >= 61 ? '#ef4444' : '#f59e0b';
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#dc2626,#991b1b);padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <div style="font-size:48px;margin-bottom:8px;">🚨</div>
          <h1 style="margin:0;color:#fff;font-size:28px;">Fraud Alert – ${riskLevel} Risk</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;">A receipt with a high fraud score has been flagged for review.</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff5f5;border:1px solid #fecaca;border-radius:6px;padding:20px;margin-bottom:30px;">
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;">Receipt ID:</td>
              <td align="right" style="color:#333;font-size:14px;font-family:monospace;padding:8px 0;">${data.receiptId}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #fecaca;">User ID:</td>
              <td align="right" style="color:#333;font-size:14px;font-family:monospace;padding:8px 0;border-top:1px solid #fecaca;">${data.userId}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #fecaca;">Fraud Score:</td>
              <td align="right" style="color:${riskColor};font-size:20px;font-weight:bold;padding:8px 0;border-top:1px solid #fecaca;">${data.fraudScore} / 100 (${riskLevel})</td>
            </tr>
          </table>
          <h3 style="color:#333;font-size:16px;margin:0 0 12px;">Fraud Indicators:</h3>
          <ul style="margin:0 0 30px;padding-left:20px;color:#666;font-size:14px;line-height:1.8;">
            ${data.fraudReasons.map(r => `<li>${r}</li>`).join('')}
          </ul>
          ${data.reviewUrl ? `<div style="text-align:center;margin-bottom:30px;"><a href="${data.reviewUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:bold;">Review Receipt</a></div>` : ''}
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">BoomCard Admin Alert – Do not reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `FRAUD ALERT – ${riskLevel} Risk\n\nReceipt ID: ${data.receiptId}\nUser ID: ${data.userId}\nFraud Score: ${data.fraudScore}/100\n\nIndicators:\n${data.fraudReasons.map(r => `- ${r}`).join('\n')}${data.reviewUrl ? `\n\nReview: ${data.reviewUrl}` : ''}`;
    return this.sendEmail({
      to: email,
      subject: `[BoomCard Admin] Fraud Alert – Score ${data.fraudScore}/100 (${riskLevel})`,
      html,
      text,
    });
  }

  /**
   * Send receipt export email to user
   */
  async sendReceiptExportEmail(
    email: string,
    data: ReceiptExportData
  ): Promise<{ success: boolean }> {
    const rows = data.receipts.map(r => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #dee2e6;color:#333;font-size:14px;">${r.merchantName}</td>
        <td style="padding:10px;border-bottom:1px solid #dee2e6;color:#333;font-size:14px;">${r.date}</td>
        <td style="padding:10px;border-bottom:1px solid #dee2e6;color:#333;font-size:14px;text-align:right;">${Number(r.amount).toFixed(2)} BGN</td>
        <td style="padding:10px;border-bottom:1px solid #dee2e6;color:#22c55e;font-size:14px;text-align:right;font-weight:bold;">+${Number(r.cashbackAmount).toFixed(2)} BGN</td>
        <td style="padding:10px;border-bottom:1px solid #dee2e6;font-size:13px;text-align:center;">
          <span style="background:${r.status === 'APPROVED' ? '#dcfce7' : r.status === 'REJECTED' ? '#fee2e2' : '#fef9c3'};color:${r.status === 'APPROVED' ? '#166534' : r.status === 'REJECTED' ? '#991b1b' : '#854d0e'};padding:2px 8px;border-radius:4px;">${r.status}</span>
        </td>
      </tr>`).join('');
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="700" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#667eea,#764ba2);padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;color:#fff;font-size:28px;">Your Receipt Export</h1>
          <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">Exported on ${data.exportDate.toLocaleDateString('en-GB')}</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;">Hi ${data.customerName},</p>
          <p style="margin:0 0 30px;color:#666;font-size:16px;line-height:1.6;">
            Here is your receipt export summary (${data.receipts.length} receipt${data.receipts.length !== 1 ? 's' : ''}).
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #dee2e6;border-radius:6px;overflow:hidden;margin-bottom:30px;">
            <thead>
              <tr style="background:#f8f9fa;">
                <th style="padding:12px;text-align:left;font-size:13px;color:#666;font-weight:600;border-bottom:2px solid #dee2e6;">Merchant</th>
                <th style="padding:12px;text-align:left;font-size:13px;color:#666;font-weight:600;border-bottom:2px solid #dee2e6;">Date</th>
                <th style="padding:12px;text-align:right;font-size:13px;color:#666;font-weight:600;border-bottom:2px solid #dee2e6;">Amount</th>
                <th style="padding:12px;text-align:right;font-size:13px;color:#666;font-weight:600;border-bottom:2px solid #dee2e6;">Cashback</th>
                <th style="padding:12px;text-align:center;font-size:13px;color:#666;font-weight:600;border-bottom:2px solid #dee2e6;">Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr style="background:#f0fdf4;">
                <td colspan="3" style="padding:12px;font-size:14px;font-weight:bold;color:#333;">Total Cashback</td>
                <td style="padding:12px;text-align:right;font-size:18px;font-weight:bold;color:#22c55e;">+${data.totalCashback.toFixed(2)} BGN</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <p style="color:#999;font-size:13px;margin:0;">Questions? Contact us at <a href="mailto:support@boomcard.bg" style="color:#667eea;">support@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `Hi ${data.customerName},\n\nYour receipt export (${data.receipts.length} receipts):\n\n${data.receipts.map(r => `${r.merchantName} | ${r.date} | ${Number(r.amount).toFixed(2)} BGN | Cashback: +${Number(r.cashbackAmount).toFixed(2)} BGN | ${r.status}`).join('\n')}\n\nTotal Cashback: +${data.totalCashback.toFixed(2)} BGN\n\nQuestions? Contact support@boomcard.bg`;
    return this.sendEmail({
      to: email,
      subject: `Your BoomCard Receipt Export – ${data.receipts.length} receipt${data.receipts.length !== 1 ? 's' : ''}`,
      html,
      text,
    });
  }

  /**
   * Send cashback payment reminder to a partner
   */
  async sendCashbackReminder(
    email: string,
    data: { partnerName: string; month: string; amount: number; adminDashboardUrl?: string }
  ): Promise<{ success: boolean }> {
    const subject = `BoomCard – Cashback Payment Reminder for ${data.month}`;
    const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#dc2626,#ea580c);padding:30px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">BoomCard Cashback Reminder</h1>
        </td></tr>
        <tr><td style="padding:30px;">
          <p style="color:#333;">Dear <strong>${data.partnerName}</strong>,</p>
          <p style="color:#555;">This is a reminder that your cashback payment for <strong>${data.month}</strong> is outstanding.</p>
          <table width="100%" style="background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0;">
            <tr><td><strong>Month:</strong></td><td style="text-align:right;">${data.month}</td></tr>
            <tr><td><strong>Amount Owed:</strong></td><td style="text-align:right;color:#dc2626;font-size:20px;font-weight:bold;">${data.amount.toFixed(2)} BGN</td></tr>
          </table>
          <p style="color:#555;">Please arrange payment at your earliest convenience. If you have already made this payment, please disregard this email.</p>
          <p style="color:#555;">For questions, contact us at <a href="mailto:support@boomcard.bg">support@boomcard.bg</a>.</p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `Dear ${data.partnerName},\n\nYour cashback payment for ${data.month} of ${data.amount.toFixed(2)} BGN is outstanding.\n\nPlease contact support@boomcard.bg for questions.`;
    return this.sendEmail({ to: email, subject, html, text });
  }
}

// Export singleton instance
export const emailService = new EmailService();
