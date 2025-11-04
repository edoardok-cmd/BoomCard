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
}

// Export singleton instance
export const emailService = new EmailService();
