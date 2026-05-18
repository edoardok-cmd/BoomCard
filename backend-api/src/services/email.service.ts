/**
 * Email Service using Resend
 * Handles transactional emails for BoomCard platform
 * Documentation: https://resend.com/docs
 */

import { Resend } from 'resend';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';
import { getSystemSettingStr } from '../utils/systemSettings';

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
  // Spec §9.5 — per-audience reply-to: 'partner' → partner_reply_to_email (office@boomcard.bg),
  // 'subscriber' → reply_to_email (support@boomcard.bg). Explicit replyTo always wins.
  audience?: 'subscriber' | 'partner';
  // Spec §11.2 — ticket threading via custom + standard RFC 5322 headers.
  // Includes X-BoomCard-Ticket-ID, Message-ID, In-Reply-To, References.
  headers?: Record<string, string>;
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

export interface CompleteProfileData {
  planName: string;
  planNameBg?: string;
  completeProfileUrl: string;
  language?: 'bg' | 'en';
}

export interface SubscriptionCancelledData {
  customerName: string;
  planName: string;
  planNameBg: string;
  /** Set when cancel_at_period_end — user retains access until this date. Null for immediate. */
  accessUntil: Date | null;
  manageUrl: string;
  language: 'en' | 'bg';
}

export interface TrialRefundPendingData {
  customerName: string;
  planName: string;
  amount: number;
  currency: string;
  subscriptionId: string;
  userId: string;
  payseraOrderId?: string | null;
  language: 'en' | 'bg';
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

export interface MenuApprovedData {
  partnerName: string;
  venueName: string;
  menuUrl: string;
  dashboardUrl?: string;
}

export interface MenuRejectedData {
  partnerName: string;
  venueName: string;
  rejectedUrl: string;
  reason: string;
  dashboardUrl?: string;
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

  // ============================================
  // i18n String Dictionaries
  // ============================================

  private static readonly STRINGS = {
    bg: {
      paymentSuccess: 'Плащането е успешно!',
      paymentSuccessBody: 'Вашето плащане беше обработено успешно.',
      amountPaid: 'Платена сума:',
      orderId: 'Номер на поръчка:',
      date: 'Дата:',
      viewWallet: 'Виж портфейла',
      welcome: 'Добре дошли в BoomCard!',
      welcomeBody: 'Вашият акаунт е активен. Започнете да събирате кешбек от любимите си места.',
      goToDashboard: 'Към таблото',
      receiptReceived: 'Бележката е получена!',
      receiptBody: 'Вашата бележка от {merchant} беше изпратена успешно.',
      youEarned: 'Спечелихте',
      cashback: 'Кешбек',
      merchant: 'Обект:',
      purchaseAmount: 'Сума на покупката:',
      submissionDate: 'Дата на изпращане:',
      viewReceipts: 'Виж всички бележки',
      walletTopUp: 'Портфейлът е зареден',
      walletDeducted: 'Актуализация на портфейла',
      walletBody: 'Балансът на вашия портфейл е актуализиран.',
      newBalance: 'Нов баланс:',
      change: 'Промяна:',
      viewWalletTx: 'Виж транзакциите',
      subActivated: 'Абонаментът е активиран!',
      subActivatedBody: 'Вашият {plan} абонамент е активен. Наслаждавайте се на пълните предимства!',
      subscriptionPlan: 'Абонаментен план:',
      viewDashboard: 'Към таблото',
      receiptApproved: 'Кешбекът е одобрен! ✓',
      receiptApprovedBody: 'Вашата бележка от {merchant} е одобрена.',
      cashbackCredited: 'Кешбекът е добавен към портфейла ви.',
      receiptRejected: 'Бележката е отхвърлена',
      receiptRejectedBody: 'Бележката ви от {merchant} беше отхвърлена.',
      reason: 'Причина:',
      contactSupport: 'Свържете се с поддръжка',
      paymentFailed: 'Проблем с плащането',
      paymentFailedBody: 'Не успяхме да обработим вашето плащане.',
      retryPayment: 'Опитайте отново',
      expiryReminder: 'Абонаментът ви изтича скоро',
      expiryReminderBody: 'Вашият {plan} абонамент изтича на {date}. Подновете, за да продължите да ползвате BoomCard.',
      renewNow: 'Поднови сега',
      subCancelled: 'Абонаментът е отменен',
      subCancelledImmediate: 'Вашият абонамент беше незабавно отменен.',
      subCancelledPeriodEnd: 'Вашият абонамент ще бъде отменен на {date}. До тогава запазвате пълен достъп.',
      trialRefundPending: 'Заявката за възстановяване е получена',
      trialRefundPendingBody: 'Получихме заявката ви за пълно възстановяване на сумата за абонамент {plan}. Тъй като плащането е обработено чрез Paysera, ще бъдете възстановени ръчно в рамките на 3–5 работни дни.',
      copyright: '© {year} BoomCard. Всички права запазени.',
      questions: 'Въпроси? Пишете ни на',
    },
    en: {
      paymentSuccess: 'Payment Successful!',
      paymentSuccessBody: 'Your payment has been processed successfully.',
      amountPaid: 'Amount Paid:',
      orderId: 'Order ID:',
      date: 'Date:',
      viewWallet: 'View Wallet',
      welcome: 'Welcome to BoomCard!',
      welcomeBody: 'Your account is now active. Start earning cashback at your favourite places.',
      goToDashboard: 'Go to Dashboard',
      receiptReceived: 'Receipt Received!',
      receiptBody: 'Your receipt from {merchant} was submitted successfully.',
      youEarned: 'You Earned',
      cashback: 'Cashback',
      merchant: 'Merchant:',
      purchaseAmount: 'Purchase Amount:',
      submissionDate: 'Submission Date:',
      viewReceipts: 'View All Receipts',
      walletTopUp: 'Wallet Topped Up',
      walletDeducted: 'Wallet Updated',
      walletBody: 'Your wallet balance has been updated.',
      newBalance: 'New Balance:',
      change: 'Change:',
      viewWalletTx: 'View Transactions',
      subActivated: 'Subscription Activated!',
      subActivatedBody: 'Your {plan} subscription is now active. Enjoy the full benefits!',
      subscriptionPlan: 'Subscription Plan:',
      viewDashboard: 'Go to Dashboard',
      receiptApproved: 'Cashback Approved! ✓',
      receiptApprovedBody: 'Your receipt from {merchant} has been approved.',
      cashbackCredited: 'Cashback has been added to your wallet.',
      receiptRejected: 'Receipt Rejected',
      receiptRejectedBody: 'Your receipt from {merchant} was rejected.',
      reason: 'Reason:',
      contactSupport: 'Contact Support',
      paymentFailed: 'Payment Problem',
      paymentFailedBody: 'We could not process your payment.',
      retryPayment: 'Retry Payment',
      expiryReminder: 'Your subscription expires soon',
      expiryReminderBody: 'Your {plan} subscription expires on {date}. Renew to continue using BoomCard.',
      renewNow: 'Renew Now',
      subCancelled: 'Subscription Cancelled',
      subCancelledImmediate: 'Your subscription has been cancelled immediately.',
      subCancelledPeriodEnd: 'Your subscription will be cancelled on {date}. You retain full access until then.',
      trialRefundPending: 'Refund Request Received',
      trialRefundPendingBody: 'We have received your full refund request for the {plan} subscription. Since the payment was processed via Paysera, the refund will be issued manually within 3–5 business days.',
      copyright: '© {year} BoomCard. All rights reserved.',
      questions: 'Questions? Contact us at',
    },
  } as const;

  /**
   * Resolve the user's preferred language from their DB record. Falls back to 'bg'.
   * Spec §9.5: partners and admins are always 'bg' (no toggle for MVP).
   * Only subscribers with an explicit 'en' preference receive English emails.
   */
  async getUserLanguage(userId: string): Promise<'bg' | 'en'> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferredLanguage: true, role: true },
    });
    if (!user) return 'bg';
    if (user.role === 'PARTNER' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return 'bg';
    return user.preferredLanguage === 'en' ? 'en' : 'bg';
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

      const fromEmail = await getSystemSettingStr('from_email', this.fromEmail);
      const fromName = await getSystemSettingStr('sender_name', this.fromName);
      // Spec §9.5 — per-audience reply-to:
      //   partner emails → partner_reply_to_email (office@boomcard.bg)
      //   subscriber/generic emails → reply_to_email (support@boomcard.bg)
      // An explicit options.replyTo always takes precedence over the DB setting.
      const replyToKey = options.audience === 'partner' ? 'partner_reply_to_email' : 'reply_to_email';
      const dbReplyTo = await getSystemSettingStr(replyToKey, '');
      const { data, error } = await this.resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
        cc: options.cc,
        bcc: options.bcc,
        replyTo: options.replyTo || (dbReplyTo || undefined),
        ...(options.headers ? { headers: options.headers } : {}),
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
    data: PaymentConfirmationData,
    language: 'bg' | 'en' = 'bg'
  ): Promise<{ success: boolean }> {
    const html = this.generatePaymentConfirmationEmail(data, language);
    const text = this.generatePaymentConfirmationText(data, language);
    const subject = language === 'bg'
      ? `Потвърждение за плащане - ${data.orderId}`
      : `Payment Confirmation - ${data.orderId}`;

    return this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  /**
   * Send receipt submission confirmation
   */
  async sendReceiptConfirmation(
    email: string,
    data: ReceiptSubmissionData,
    language: 'bg' | 'en' = 'bg'
  ): Promise<{ success: boolean }> {
    const html = this.generateReceiptConfirmationEmail(data, language);
    const text = this.generateReceiptConfirmationText(data, language);
    const subject = language === 'bg'
      ? `Бележката е получена - ${data.cashbackAmount.toFixed(2)} BGN кешбек спечелен!`
      : `Receipt Submitted - ${data.cashbackAmount.toFixed(2)} BGN Cashback Earned!`;

    return this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  /**
   * Send wallet update notification
   */
  async sendWalletUpdate(
    email: string,
    data: WalletUpdateData,
    language: 'bg' | 'en' = 'bg'
  ): Promise<{ success: boolean }> {
    const html = this.generateWalletUpdateEmail(data, language);
    const text = this.generateWalletUpdateText(data, language);
    const S = EmailService.STRINGS[language];
    const subject = data.transactionType === 'credit' ? S.walletTopUp : S.walletDeducted;

    return this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(
    email: string,
    data: WelcomeEmailData,
    language: 'bg' | 'en' = 'bg'
  ): Promise<{ success: boolean }> {
    const html = this.generateWelcomeEmail(data, language);
    const text = this.generateWelcomeText(data, language);
    const subject = language === 'bg'
      ? 'Добре дошли в BoomCard!'
      : 'Welcome to BoomCard! 🎉';

    return this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  /**
   * Send password reset OTP email
   */
  async sendPasswordResetEmail(data: { customerName: string; email: string; otp: string; accountLabel?: string; language?: 'bg' | 'en' }): Promise<{ success: boolean }> {
    const isBg = data.language !== 'en';
    // accountLabel is set only when the same email backs more than one account,
    // so the recipient can tell which OTP belongs to which account.
    const labelHtml = data.accountLabel
      ? `<p style="color:#1a1a1a;margin-bottom:16px;font-weight:600;">${isBg ? 'За' : 'For'}: ${data.accountLabel}</p>`
      : '';
    const labelText = data.accountLabel ? `${isBg ? 'За' : 'For'}: ${data.accountLabel}\n\n` : '';
    const subject = data.accountLabel
      ? (isBg ? `Вашият BoomCard код за смяна на парола (${data.accountLabel})` : `Your BoomCard password reset code (${data.accountLabel})`)
      : (isBg ? 'Вашият BoomCard код за смяна на парола' : 'Your BoomCard password reset code');

    const heading = isBg ? 'Смяна на парола' : 'Reset your password';
    const body = isBg
      ? `Здравейте, ${data.customerName}! Използвайте кода по-долу, за да смените паролата си в BoomCard. Кодът изтича след <strong>15 минути</strong>.`
      : `Hi ${data.customerName}, use the code below to reset your BoomCard password. It expires in <strong>15 minutes</strong>.`;
    const ignoreText = isBg
      ? 'Ако не сте поискали смяна на парола, просто игнорирайте този имейл.'
      : "If you didn't request this, you can safely ignore this email.";

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff;">
        <h2 style="color:#1a1a1a;margin-bottom:8px;">${heading}</h2>
        ${labelHtml}
        <p style="color:#555;margin-bottom:24px;">${body}</p>
        <div style="background:#f5f5f5;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#1a1a1a;">${data.otp}</span>
        </div>
        <p style="color:#999;font-size:13px;">${ignoreText}</p>
      </div>`;

    const textBody = isBg
      ? `${labelText}Вашият BoomCard код за смяна на парола е: ${data.otp}\n\nИзтича след 15 минути.\n\n${ignoreText}`
      : `${labelText}Your BoomCard password reset code is: ${data.otp}\n\nIt expires in 15 minutes.\n\nIf you didn't request this, ignore this email.`;

    return this.sendEmail({ to: data.email, subject, html, text: textBody });
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

  private generatePaymentConfirmationEmail(data: PaymentConfirmationData, language: 'bg' | 'en' = 'bg'): string {
    const S = EmailService.STRINGS[language];
    const hi = language === 'bg' ? 'Здравейте' : 'Hi';
    const year = new Date().getFullYear();
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${S.paymentSuccess}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">${S.paymentSuccess}</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px;">${hi} ${data.customerName},</p>

              <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                ${S.paymentSuccessBody}
              </p>

              <!-- Payment Details -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8f9fa; border-radius: 6px; padding: 20px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 10px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0;">${S.amountPaid}</td>
                        <td align="right" style="color: #333333; font-size: 18px; font-weight: bold; padding: 8px 0;">
                          ${data.amount.toFixed(2)} ${data.currency}
                        </td>
                      </tr>
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0; border-top: 1px solid #dee2e6;">${S.orderId}</td>
                        <td align="right" style="color: #333333; font-size: 14px; font-family: monospace; padding: 8px 0; border-top: 1px solid #dee2e6;">
                          ${data.orderId}
                        </td>
                      </tr>
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0;">${S.date}</td>
                        <td align="right" style="color: #333333; font-size: 14px; padding: 8px 0;">
                          ${data.date.toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
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
                      ${S.viewWallet}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; color: #999999; font-size: 14px; line-height: 1.6;">
                ${S.questions} <a href="mailto:office@boomcard.bg" style="color: #667eea; text-decoration: none;">office@boomcard.bg</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #999999; font-size: 12px;">
                ${S.copyright.replace('{year}', String(year))}
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

  private generateReceiptConfirmationEmail(data: ReceiptSubmissionData, language: 'bg' | 'en' = 'bg'): string {
    const S = EmailService.STRINGS[language];
    const hi = language === 'bg' ? 'Здравейте' : 'Hi';
    const year = new Date().getFullYear();
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${S.receiptReceived}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">🎉 ${S.receiptReceived}</h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px;">${hi} ${data.customerName},</p>

              <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                ${S.receiptBody.replace('{merchant}', `<strong>${data.merchantName}</strong>`)}
              </p>

              <!-- Cashback Amount (Highlighted) -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                <tr>
                  <td align="center" style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 30px; border-radius: 8px;">
                    <p style="margin: 0 0 10px; color: #ffffff; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">${S.youEarned}</p>
                    <p style="margin: 0; color: #ffffff; font-size: 36px; font-weight: bold;">
                      ${data.cashbackAmount.toFixed(2)} BGN
                    </p>
                    <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">${S.cashback}</p>
                  </td>
                </tr>
              </table>

              <!-- Receipt Details -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8f9fa; border-radius: 6px; padding: 20px; margin: 30px 0;">
                <tr>
                  <td>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0;">${S.merchant}</td>
                        <td align="right" style="color: #333333; font-size: 14px; font-weight: 600; padding: 8px 0;">${data.merchantName}</td>
                      </tr>
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0;">${S.purchaseAmount}</td>
                        <td align="right" style="color: #333333; font-size: 14px; padding: 8px 0;">${data.amount.toFixed(2)} BGN</td>
                      </tr>
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0;">${S.submissionDate}</td>
                        <td align="right" style="color: #333333; font-size: 14px; padding: 8px 0;">
                          ${data.submissionDate.toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB')}
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
                      ${S.viewReceipts}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #999999; font-size: 12px;">
                ${S.copyright.replace('{year}', String(year))}
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

  private generateWalletUpdateEmail(data: WalletUpdateData, language: 'bg' | 'en' = 'bg'): string {
    const S = EmailService.STRINGS[language];
    const isCredit = data.transactionType === 'credit';
    const hi = language === 'bg' ? 'Здравейте' : 'Hi';
    const year = new Date().getFullYear();
    const gradient = isCredit
      ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
    const changeLabel = language === 'bg'
      ? (isCredit ? 'Добавена сума:' : 'Похарчена сума:')
      : (isCredit ? 'Amount Added:' : 'Amount Spent:');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isCredit ? S.walletTopUp : S.walletDeducted}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: ${gradient}; padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">
                ${isCredit ? S.walletTopUp : S.walletDeducted}
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px;">${hi} ${data.customerName},</p>

              <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                ${data.description}
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8f9fa; border-radius: 6px; padding: 20px; margin: 30px 0;">
                <tr>
                  <td>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0;">
                          ${changeLabel}
                        </td>
                        <td align="right" style="color: ${isCredit ? '#10b981' : '#ef4444'}; font-size: 18px; font-weight: bold; padding: 8px 0;">
                          ${isCredit ? '+' : '-'}${Math.abs(data.changeAmount).toFixed(2)} BGN
                        </td>
                      </tr>
                      <tr>
                        <td style="color: #666666; font-size: 14px; padding: 8px 0; border-top: 1px solid #dee2e6;">
                          ${S.newBalance}
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
                      ${S.viewWallet}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #999999; font-size: 12px;">
                ${S.copyright.replace('{year}', String(year))}
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

  private generateWelcomeEmail(data: WelcomeEmailData, language: 'bg' | 'en' = 'bg'): string {
    const S = EmailService.STRINGS[language];
    const hi = language === 'bg' ? 'Здравейте' : 'Hi';
    const year = new Date().getFullYear();
    const features = language === 'bg' ? [
      { icon: '📸', title: 'Сканирайте бележки', desc: 'Просто снимайте бележката си и спечелете незабавен кешбек' },
      { icon: '💳', title: 'Дигитален портфейл', desc: 'Следете спестяванията си и използвайте баланса си в партньорски обекти' },
      { icon: '🎁', title: 'Ексклузивни оферти', desc: 'Получавайте персонализирани оферти от любимите си места' },
    ] : [
      { icon: '📸', title: 'Scan Receipts', desc: 'Simply snap a photo of your receipt and earn instant cashback' },
      { icon: '💳', title: 'Digital Wallet', desc: 'Track your savings and use your balance at partner venues' },
      { icon: '🎁', title: 'Exclusive Offers', desc: 'Get personalized deals from your favorite places' },
    ];
    const subtitle = language === 'bg'
      ? 'Вашата смарт карта за отстъпки в български заведения'
      : 'Your smart discount card for Bulgarian venues';
    const needHelp = language === 'bg'
      ? 'Нужна помощ? Свържете се с нас на'
      : "Need help? We're here for you at";

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${S.welcome}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 50px 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0 0 10px; color: #ffffff; font-size: 32px; font-weight: bold;">${S.welcome} 🎉</h1>
              <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 16px;">${subtitle}</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px;">${hi} ${data.customerName},</p>

              <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                ${S.welcomeBody}
              </p>

              <!-- Features -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                ${features.map((f, i) => `
                <tr>
                  <td style="padding: 20px; background-color: #f8f9fa; border-radius: 6px;">
                    <p style="margin: 0 0 8px; color: #667eea; font-size: 18px; font-weight: bold;">${f.icon} ${f.title}</p>
                    <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.5;">${f.desc}</p>
                  </td>
                </tr>${i < features.length - 1 ? '<tr><td style="height: 15px;"></td></tr>' : ''}`).join('')}
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 40px 0;">
                <tr>
                  <td align="center">
                    <a href="${data.dashboardUrl}"
                       style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 18px;">
                      ${S.goToDashboard}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; color: #999999; font-size: 14px; line-height: 1.6; text-align: center;">
                ${needHelp} <a href="mailto:office@boomcard.bg" style="color: #667eea; text-decoration: none;">office@boomcard.bg</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #999999; font-size: 12px;">
                ${S.copyright.replace('{year}', String(year))}
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
                <a href="mailto:office@boomcard.bg" style="color: #667eea; text-decoration: none;">office@boomcard.bg</a>
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

  private generatePaymentConfirmationText(data: PaymentConfirmationData, language: 'bg' | 'en' = 'bg'): string {
    const S = EmailService.STRINGS[language];
    const hi = language === 'bg' ? 'Здравейте' : 'Hi';
    const year = new Date().getFullYear();
    const sectionHeader = language === 'bg' ? 'ДЕТАЙЛИ ЗА ПЛАЩАНЕТО:' : 'PAYMENT DETAILS:';
    return `
${hi} ${data.customerName},

${S.paymentSuccessBody}

${sectionHeader}
- ${S.amountPaid} ${data.amount.toFixed(2)} ${data.currency}
- ${S.orderId} ${data.orderId}
- ${S.date} ${data.date.toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB')}

${S.viewWallet}: https://boomcard.bg/wallet

${S.questions} office@boomcard.bg

${S.copyright.replace('{year}', String(year))}
    `.trim();
  }

  private generateReceiptConfirmationText(data: ReceiptSubmissionData, language: 'bg' | 'en' = 'bg'): string {
    const S = EmailService.STRINGS[language];
    const hi = language === 'bg' ? 'Здравейте' : 'Hi';
    const year = new Date().getFullYear();
    const sectionHeader = language === 'bg' ? 'ДЕТАЙЛИ НА БЕЛЕЖКАТА:' : 'RECEIPT DETAILS:';
    const earned = language === 'bg'
      ? `СПЕЧЕЛИХТЕ: ${data.cashbackAmount.toFixed(2)} BGN ${S.cashback}`
      : `YOU EARNED: ${data.cashbackAmount.toFixed(2)} BGN ${S.cashback}`;
    return `
${hi} ${data.customerName},

🎉 ${S.receiptReceived}

${S.receiptBody.replace('{merchant}', data.merchantName)}

${earned}

${sectionHeader}
- ${S.merchant} ${data.merchantName}
- ${S.purchaseAmount} ${data.amount.toFixed(2)} BGN
- ${S.submissionDate} ${data.submissionDate.toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB')}

${S.viewReceipts}: https://boomcard.bg/receipts

${S.copyright.replace('{year}', String(year))}
    `.trim();
  }

  private generateWalletUpdateText(data: WalletUpdateData, language: 'bg' | 'en' = 'bg'): string {
    const S = EmailService.STRINGS[language];
    const isCredit = data.transactionType === 'credit';
    const hi = language === 'bg' ? 'Здравейте' : 'Hi';
    const year = new Date().getFullYear();
    const changeLabel = language === 'bg'
      ? (isCredit ? 'Добавена сума' : 'Похарчена сума')
      : (isCredit ? 'Amount Added' : 'Amount Spent');
    return `
${hi} ${data.customerName},

${data.description}

${changeLabel}: ${isCredit ? '+' : '-'}${Math.abs(data.changeAmount).toFixed(2)} BGN
${S.newBalance} ${data.newBalance.toFixed(2)} BGN

${S.viewWallet}: https://boomcard.bg/wallet

${S.copyright.replace('{year}', String(year))}
    `.trim();
  }

  private generateWelcomeText(data: WelcomeEmailData, language: 'bg' | 'en' = 'bg'): string {
    const S = EmailService.STRINGS[language];
    const hi = language === 'bg' ? 'Здравейте' : 'Hi';
    const year = new Date().getFullYear();
    const features = language === 'bg'
      ? '📸 Сканирайте бележки - Просто снимайте бележката си и спечелете незабавен кешбек\n💳 Дигитален портфейл - Следете спестяванията си и използвайте баланса си в партньорски обекти\n🎁 Ексклузивни оферти - Получавайте персонализирани оферти от любимите си места'
      : '📸 Scan Receipts - Simply snap a photo of your receipt and earn instant cashback\n💳 Digital Wallet - Track your savings and use your balance at partner venues\n🎁 Exclusive Offers - Get personalized deals from your favorite places';
    const needHelp = language === 'bg'
      ? 'Нужна помощ? Свържете се с нас на office@boomcard.bg'
      : "Need help? We're here for you at office@boomcard.bg";
    return `
${S.welcome} 🎉

${hi} ${data.customerName},

${S.welcomeBody}

${features}

${S.goToDashboard}: ${data.dashboardUrl}

${needHelp}

${S.copyright.replace('{year}', String(year))}
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

Въпроси? Свържете се с нас на office@boomcard.bg

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

Questions? Contact us at office@boomcard.bg

© ${new Date().getFullYear()} BoomCard. All rights reserved.
    `.trim();
  }

  /**
   * Send subscription expiry notice to users whose auto-renewal is OFF and subscription is about
   * to expire (or has entered the Paysera grace period). Subject line deliberately says "expires"
   * rather than "renews" because the charge is NOT automatic.
   */
  async sendExpiryNotice(
    email: string,
    data: RenewalReminderData
  ): Promise<{ success: boolean }> {
    const isBg = data.language === 'bg';
    const planName = isBg ? data.planNameBg : data.planName;

    // This email is sent to users who have turned auto-renewal OFF — remind them their subscription is expiring
    const subject = isBg
      ? `Вашият BoomCard абонамент изтича на ${data.renewalDate}`
      : `Your BoomCard subscription expires on ${data.renewalDate}`;

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
              <h1 style="margin: 0; color: #ffffff; font-size: 24px;">${isBg ? 'Абонаментът ви изтича' : 'Subscription Expiring'}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px; color: #333; font-size: 16px;">${isBg ? 'Здравейте' : 'Hi'} ${data.customerName},</p>
              <p style="margin: 0 0 20px; color: #666; font-size: 16px; line-height: 1.6;">
                ${isBg
                  ? `Вашият абонамент <strong>${planName}</strong> ще изтече на <strong>${data.renewalDate}</strong>. Автоматичното подновяване е изключено.`
                  : `Your <strong>${planName}</strong> subscription will expire on <strong>${data.renewalDate}</strong>. Auto-renewal is currently turned off.`}
              </p>
              <p style="margin: 0 0 20px; color: #666; font-size: 16px; line-height: 1.6;">
                ${isBg
                  ? 'За да запазите достъпа си, моля подновете абонамента преди датата на изтичане.'
                  : 'To keep your access, please renew your subscription before it expires.'}
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

${isBg ? 'Въпроси? Свържете се с нас на' : 'Questions? Contact us at'} office@boomcard.bg`;

    return this.sendEmail({ to: email, subject, html, text });
  }
  /**
   * Send receipt approved email to user
   */
  async sendReceiptApprovedEmail(
    email: string,
    data: ReceiptApprovedData,
    language: 'bg' | 'en' = 'bg'
  ): Promise<{ success: boolean }> {
    const S = EmailService.STRINGS[language];
    const hi = language === 'bg' ? 'Здравейте' : 'Hi';
    const year = new Date().getFullYear();
    const approvedBody = language === 'bg'
      ? `Страхотна новина! Вашата бележка от <strong>${data.merchantName}</strong> е одобрена и кешбекът е добавен към портфейла ви.`
      : `Great news! Your receipt from <strong>${data.merchantName}</strong> has been approved and your cashback has been credited to your wallet.`;
    const receiptAmountLabel = language === 'bg' ? 'Сума на бележката:' : 'Receipt Amount:';
    const cashbackEarnedLabel = language === 'bg' ? 'Спечелен кешбек:' : 'Cashback Earned:';
    const viewWalletLabel = language === 'bg' ? 'Виж портфейла' : 'View My Wallet';
    const subject = language === 'bg'
      ? `Кешбекът е одобрен – +${data.cashbackAmount.toFixed(2)} BGN добавени!`
      : `Receipt Approved – +${data.cashbackAmount.toFixed(2)} BGN Cashback Credited!`;
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <div style="font-size:48px;margin-bottom:8px;">✅</div>
          <h1 style="margin:0;color:#fff;font-size:28px;">${S.receiptApproved}</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;">${hi} ${data.customerName},</p>
          <p style="margin:0 0 30px;color:#666;font-size:16px;line-height:1.6;">${approvedBody}</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f9fa;border-radius:6px;padding:20px;margin-bottom:30px;">
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;">${S.merchant}</td>
              <td align="right" style="color:#333;font-size:14px;font-weight:bold;padding:8px 0;">${data.merchantName}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #dee2e6;">${receiptAmountLabel}</td>
              <td align="right" style="color:#333;font-size:14px;padding:8px 0;border-top:1px solid #dee2e6;">${data.amount.toFixed(2)} BGN</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #dee2e6;">${cashbackEarnedLabel}</td>
              <td align="right" style="color:#22c55e;font-size:20px;font-weight:bold;padding:8px 0;border-top:1px solid #dee2e6;">+${data.cashbackAmount.toFixed(2)} BGN</td>
            </tr>
          </table>
          ${data.walletUrl ? `<div style="text-align:center;margin-bottom:30px;"><a href="${data.walletUrl}" style="display:inline-block;background:#22c55e;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:bold;">${viewWalletLabel}</a></div>` : ''}
          <p style="color:#999;font-size:13px;margin:0;">${S.questions} <a href="mailto:office@boomcard.bg" style="color:#667eea;">office@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">${S.copyright.replace('{year}', String(year))}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `${hi} ${data.customerName},\n\n${S.receiptApprovedBody.replace('{merchant}', data.merchantName)}\n\n${receiptAmountLabel} ${data.amount.toFixed(2)} BGN\n${cashbackEarnedLabel} +${data.cashbackAmount.toFixed(2)} BGN\n\n${S.cashbackCredited}\n\n${S.questions} office@boomcard.bg`;
    return this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  /**
   * Send receipt rejected email to user
   */
  async sendReceiptRejectedEmail(
    email: string,
    data: ReceiptRejectedData,
    language: 'bg' | 'en' = 'bg'
  ): Promise<{ success: boolean }> {
    const S = EmailService.STRINGS[language];
    const hi = language === 'bg' ? 'Здравейте' : 'Hi';
    const year = new Date().getFullYear();
    const rejectedBody = language === 'bg'
      ? `За съжаление вашата бележка от <strong>${data.merchantName}</strong> не може да бъде одобрена.`
      : `Unfortunately, your receipt from <strong>${data.merchantName}</strong> could not be approved.`;
    const mistakeNote = language === 'bg'
      ? 'Ако смятате, че това е грешка, моля свържете се с нашия екип за поддръжка с детайлите на бележката.'
      : 'If you believe this is a mistake, please contact our support team with your receipt details.';
    const amountLabel = language === 'bg' ? 'Сума:' : 'Amount:';
    const subject = language === 'bg'
      ? `Актуализация на бележката – ${data.merchantName}`
      : `Receipt Update – Your receipt from ${data.merchantName}`;
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <div style="font-size:48px;margin-bottom:8px;">❌</div>
          <h1 style="margin:0;color:#fff;font-size:28px;">${S.receiptRejected}</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;">${hi} ${data.customerName},</p>
          <p style="margin:0 0 30px;color:#666;font-size:16px;line-height:1.6;">${rejectedBody}</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff5f5;border:1px solid #fecaca;border-radius:6px;padding:20px;margin-bottom:30px;">
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;">${S.merchant}</td>
              <td align="right" style="color:#333;font-size:14px;font-weight:bold;padding:8px 0;">${data.merchantName}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #fecaca;">${amountLabel}</td>
              <td align="right" style="color:#333;font-size:14px;padding:8px 0;border-top:1px solid #fecaca;">${data.amount.toFixed(2)} BGN</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #fecaca;">${S.reason}</td>
              <td align="right" style="color:#ef4444;font-size:14px;padding:8px 0;border-top:1px solid #fecaca;">${data.reason}</td>
            </tr>
          </table>
          <p style="color:#666;font-size:14px;line-height:1.6;">${mistakeNote}</p>
          ${data.supportUrl ? `<div style="text-align:center;margin-bottom:30px;"><a href="${data.supportUrl}" style="display:inline-block;background:#ef4444;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:bold;">${S.contactSupport}</a></div>` : ''}
          <p style="color:#999;font-size:13px;margin:0;">${S.questions} <a href="mailto:office@boomcard.bg" style="color:#667eea;">office@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">${S.copyright.replace('{year}', String(year))}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `${hi} ${data.customerName},\n\n${S.receiptRejectedBody.replace('{merchant}', data.merchantName)}\n\n${amountLabel} ${data.amount.toFixed(2)} BGN\n${S.reason} ${data.reason}\n\n${mistakeNote}\n${S.questions} office@boomcard.bg`;
    return this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  /**
   * Send payment failed/cancelled email to user
   */
  async sendPaymentFailedEmail(
    email: string,
    data: PaymentFailedData,
    language: 'bg' | 'en' = 'bg'
  ): Promise<{ success: boolean }> {
    const S = EmailService.STRINGS[language];
    const hi = language === 'bg' ? 'Здравейте' : 'Hi';
    const year = new Date().getFullYear();
    const isCancelled = data.reason === 'cancelled';
    const title = language === 'bg'
      ? (isCancelled ? 'Плащането е отменено' : S.paymentFailed)
      : (isCancelled ? 'Payment Cancelled' : 'Payment Failed');
    const body = language === 'bg'
      ? (isCancelled ? 'Вашето плащане беше отменено и няма начислена сума по сметката ви.' : `${S.paymentFailedBody} Не е начислена сума по сметката ви.`)
      : (isCancelled ? 'Your payment was cancelled and no charge was made to your account.' : 'We were unable to process your payment. No charge was made to your account.');
    const amountLabel = language === 'bg' ? 'Сума:' : 'Amount:';
    const statusLabel = language === 'bg' ? 'Статус:' : 'Status:';
    const retryLabel = language === 'bg' ? S.retryPayment : 'Try Again';
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
          <p style="margin:0 0 20px;color:#333;font-size:16px;">${hi} ${data.customerName},</p>
          <p style="margin:0 0 30px;color:#666;font-size:16px;line-height:1.6;">${body}</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:20px;margin-bottom:30px;">
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;">${S.orderId}</td>
              <td align="right" style="color:#333;font-size:14px;font-family:monospace;padding:8px 0;">${data.orderId}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #fde68a;">${amountLabel}</td>
              <td align="right" style="color:#333;font-size:14px;padding:8px 0;border-top:1px solid #fde68a;">${data.amount.toFixed(2)} ${data.currency}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #fde68a;">${statusLabel}</td>
              <td align="right" style="color:#f59e0b;font-size:14px;font-weight:bold;padding:8px 0;border-top:1px solid #fde68a;">${title}</td>
            </tr>
          </table>
          ${data.retryUrl ? `<div style="text-align:center;margin-bottom:30px;"><a href="${data.retryUrl}" style="display:inline-block;background:#667eea;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:bold;">${retryLabel}</a></div>` : ''}
          <p style="color:#999;font-size:13px;margin:0;">${S.questions} <a href="mailto:office@boomcard.bg" style="color:#667eea;">office@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">${S.copyright.replace('{year}', String(year))}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `${hi} ${data.customerName},\n\n${body}\n\n${S.orderId} ${data.orderId}\n${amountLabel} ${data.amount.toFixed(2)} ${data.currency}\n\n${data.retryUrl ? `${retryLabel}: ${data.retryUrl}\n\n` : ''}${S.questions} office@boomcard.bg`;
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
    data: SubscriptionActivatedData,
    language: 'bg' | 'en' = 'bg'
  ): Promise<{ success: boolean }> {
    const S = EmailService.STRINGS[language];
    const hi = language === 'bg' ? 'Здравейте' : 'Hi';
    const year = new Date().getFullYear();
    const activatedBody = language === 'bg'
      ? `Вашият <strong>${data.planName}</strong> абонамент е активен. Можете да започнете да събирате кешбек от всичките си бележки веднага!`
      : `Your <strong>${data.planName}</strong> subscription is now active. You can start earning cashback on all your receipts right away!`;
    const planLabel = language === 'bg' ? 'План:' : 'Plan:';
    const nextBillingLabel = language === 'bg' ? 'Следващо таксуване:' : 'Next Billing Date:';
    const subject = language === 'bg'
      ? `Вашият BoomCard ${data.planName} абонамент е активен!`
      : `Your BoomCard ${data.planName} Subscription is Active!`;
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#667eea,#764ba2);padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <div style="font-size:48px;margin-bottom:8px;">🎉</div>
          <h1 style="margin:0;color:#fff;font-size:28px;">${S.subActivated}</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;">${hi} ${data.customerName},</p>
          <p style="margin:0 0 30px;color:#666;font-size:16px;line-height:1.6;">${activatedBody}</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f9fa;border-radius:6px;padding:20px;margin-bottom:30px;">
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;">${planLabel}</td>
              <td align="right" style="color:#333;font-size:14px;font-weight:bold;padding:8px 0;">${data.planName}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #dee2e6;">${S.orderId}</td>
              <td align="right" style="color:#333;font-size:14px;font-family:monospace;padding:8px 0;border-top:1px solid #dee2e6;">${data.orderId}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #dee2e6;">${S.amountPaid}</td>
              <td align="right" style="color:#333;font-size:18px;font-weight:bold;padding:8px 0;border-top:1px solid #dee2e6;">${data.amount.toFixed(2)} ${data.currency}</td>
            </tr>
            ${data.nextBillingDate ? `
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #dee2e6;">${nextBillingLabel}</td>
              <td align="right" style="color:#333;font-size:14px;padding:8px 0;border-top:1px solid #dee2e6;">${data.nextBillingDate.toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB')}</td>
            </tr>` : ''}
          </table>
          ${data.dashboardUrl ? `<div style="text-align:center;margin-bottom:30px;"><a href="${data.dashboardUrl}" style="display:inline-block;background:#667eea;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:bold;">${S.viewDashboard}</a></div>` : ''}
          <p style="color:#999;font-size:13px;margin:0;">${S.questions} <a href="mailto:office@boomcard.bg" style="color:#667eea;">office@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">${S.copyright.replace('{year}', String(year))}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `${hi} ${data.customerName},\n\n${S.subActivated}\n\n${planLabel} ${data.planName}\n${S.orderId} ${data.orderId}\n${S.amountPaid} ${data.amount.toFixed(2)} ${data.currency}${data.nextBillingDate ? `\n${nextBillingLabel} ${data.nextBillingDate.toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB')}` : ''}\n\n${S.questions} office@boomcard.bg`;
    return this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  /**
   * Notify user that their Paysera subscription was cancelled after the 7-day grace period.
   */
  async sendSubscriptionExpiredEmail(
    email: string,
    data: { customerName: string; planName: string; renewUrl: string },
    language: 'bg' | 'en' = 'bg'
  ): Promise<{ success: boolean }> {
    const hi = language === 'bg' ? 'Здравейте' : 'Hi';
    const year = new Date().getFullYear();
    const title = language === 'bg' ? 'Абонаментът е прекратен' : 'Subscription Cancelled';
    const body = language === 'bg'
      ? `Вашият <strong>${data.planName}</strong> абонамент беше прекратен след изтичане на 7-дневния гратисен период. Вашият достъп до BoomCard Premium функции е спрян.`
      : `Your <strong>${data.planName}</strong> subscription has been cancelled after the 7-day grace period expired. Your access to BoomCard Premium features has ended.`;
    const renewLabel = language === 'bg' ? 'Поднови абонамента' : 'Renew Subscription';
    const questionsLine = language === 'bg' ? 'Въпроси? Пишете ни на' : 'Questions? Contact us at';
    const copyright = language === 'bg'
      ? `© ${year} BoomCard. Всички права запазени.`
      : `© ${year} BoomCard. All rights reserved.`;
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#6b7280,#374151);padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <div style="font-size:48px;margin-bottom:8px;">⚠️</div>
          <h1 style="margin:0;color:#fff;font-size:28px;">${title}</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;">${hi} ${data.customerName},</p>
          <p style="margin:0 0 30px;color:#666;font-size:16px;line-height:1.6;">${body}</p>
          <div style="text-align:center;margin-bottom:30px;">
            <a href="${data.renewUrl}" style="display:inline-block;background:#667eea;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:bold;">${renewLabel}</a>
          </div>
          <p style="color:#999;font-size:13px;margin:0;">${questionsLine} <a href="mailto:office@boomcard.bg" style="color:#667eea;">office@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">${copyright}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `${hi} ${data.customerName},\n\n${title}\n\n${body.replace(/<[^>]+>/g, '')}\n\n${renewLabel}: ${data.renewUrl}\n\n${questionsLine} office@boomcard.bg`;
    return this.sendEmail({
      to: email,
      subject: `BoomCard – ${title}`,
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
          <p style="color:#999;font-size:13px;margin:0;">Questions? Contact us at <a href="mailto:office@boomcard.bg" style="color:#667eea;">office@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `Hi ${data.customerName},\n\nYour receipt export (${data.receipts.length} receipts):\n\n${data.receipts.map(r => `${r.merchantName} | ${r.date} | ${Number(r.amount).toFixed(2)} BGN | Cashback: +${Number(r.cashbackAmount).toFixed(2)} BGN | ${r.status}`).join('\n')}\n\nTotal Cashback: +${data.totalCashback.toFixed(2)} BGN\n\nQuestions? Contact office@boomcard.bg`;
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
          <p style="color:#555;">For questions, contact us at <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>.</p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `Dear ${data.partnerName},\n\nYour cashback payment for ${data.month} of ${data.amount.toFixed(2)} BGN is outstanding.\n\nPlease contact office@boomcard.bg for questions.`;
    return this.sendEmail({ to: email, subject, html, text });
  }

  async sendMenuApprovedEmail(
    email: string,
    data: MenuApprovedData
  ): Promise<{ success: boolean }> {
    const dashboardLink = data.dashboardUrl ?? 'https://partners.boomcard.bg';
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <div style="font-size:48px;margin-bottom:8px;">✅</div>
          <h1 style="margin:0;color:#fff;font-size:28px;">Menu Approved!</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;">Hi ${data.partnerName},</p>
          <p style="margin:0 0 30px;color:#666;font-size:16px;line-height:1.6;">
            Great news! The menu you submitted for <strong>${data.venueName}</strong> has been approved and is now live for BoomCard users.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f9fa;border-radius:6px;padding:20px;margin-bottom:30px;">
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;">Venue:</td>
              <td align="right" style="color:#333;font-size:14px;font-weight:bold;padding:8px 0;">${data.venueName}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #dee2e6;">Menu URL:</td>
              <td align="right" style="font-size:14px;padding:8px 0;border-top:1px solid #dee2e6;word-break:break-all;"><a href="${data.menuUrl}" style="color:#22c55e;">${data.menuUrl}</a></td>
            </tr>
          </table>
          <div style="text-align:center;margin-bottom:30px;"><a href="${dashboardLink}" style="display:inline-block;background:#22c55e;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:bold;">View Partner Dashboard</a></div>
          <p style="color:#999;font-size:13px;margin:0;">Questions? Contact us at <a href="mailto:office@boomcard.bg" style="color:#667eea;">office@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `Hi ${data.partnerName},\n\nYour menu for ${data.venueName} has been approved and is now live for BoomCard users.\n\nMenu URL: ${data.menuUrl}\n\nView your dashboard: ${dashboardLink}\n\nQuestions? Contact office@boomcard.bg`;
    return this.sendEmail({
      to: email,
      subject: `Menu Approved – ${data.venueName} is now live`,
      html,
      text,
    });
  }

  async sendMenuRejectedEmail(
    email: string,
    data: MenuRejectedData
  ): Promise<{ success: boolean }> {
    const dashboardLink = data.dashboardUrl ?? 'https://partners.boomcard.bg';
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <div style="font-size:48px;margin-bottom:8px;">❌</div>
          <h1 style="margin:0;color:#fff;font-size:28px;">Menu Not Approved</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;">Hi ${data.partnerName},</p>
          <p style="margin:0 0 30px;color:#666;font-size:16px;line-height:1.6;">
            Unfortunately, the menu you submitted for <strong>${data.venueName}</strong> could not be approved.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff5f5;border:1px solid #fecaca;border-radius:6px;padding:20px;margin-bottom:30px;">
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;">Venue:</td>
              <td align="right" style="color:#333;font-size:14px;font-weight:bold;padding:8px 0;">${data.venueName}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #fecaca;">Submitted URL:</td>
              <td align="right" style="font-size:14px;padding:8px 0;border-top:1px solid #fecaca;word-break:break-all;">${data.rejectedUrl}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #fecaca;">Reason:</td>
              <td align="right" style="color:#ef4444;font-size:14px;padding:8px 0;border-top:1px solid #fecaca;">${data.reason}</td>
            </tr>
          </table>
          <p style="color:#666;font-size:14px;line-height:1.6;">You can update your submission and resubmit from your partner dashboard.</p>
          <div style="text-align:center;margin-bottom:30px;"><a href="${dashboardLink}" style="display:inline-block;background:#ef4444;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:bold;">Resubmit Menu</a></div>
          <p style="color:#999;font-size:13px;margin:0;">Questions? Contact us at <a href="mailto:office@boomcard.bg" style="color:#667eea;">office@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `Hi ${data.partnerName},\n\nYour menu for ${data.venueName} was not approved.\n\nSubmitted URL: ${data.rejectedUrl}\nReason: ${data.reason}\n\nYou can resubmit from your partner dashboard: ${dashboardLink}\n\nQuestions? Contact office@boomcard.bg`;
    return this.sendEmail({
      to: email,
      subject: `Menu Update – ${data.venueName}`,
      html,
      text,
    });
  }

  async sendPartnerApplicationConfirmation(
    email: string,
    data: { firstName: string; businessName: string }
  ): Promise<{ success: boolean }> {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#f5a623,#e8890c);padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <div style="font-size:48px;margin-bottom:8px;">🎉</div>
          <h1 style="margin:0;color:#fff;font-size:28px;">Application Received!</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;">Hi ${data.firstName},</p>
          <p style="margin:0 0 20px;color:#666;font-size:16px;line-height:1.6;">
            Thank you for applying to join the <strong>BOOM Card partner network</strong>. We've received your application for <strong>${data.businessName}</strong> and our team will review it shortly.
          </p>
          <p style="margin:0 0 30px;color:#666;font-size:16px;line-height:1.6;">
            Once approved, you'll receive another email with instructions to log in to your partner dashboard and start managing your discounts and offers.
          </p>
          <p style="color:#999;font-size:13px;margin:0;">Questions? Reach us at <a href="mailto:office@boomcard.bg" style="color:#f5a623;">office@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `Hi ${data.firstName},\n\nThank you for applying to join the BOOM Card partner network. We've received your application for ${data.businessName} and our team will review it shortly.\n\nOnce approved, you'll receive another email with login instructions.\n\nQuestions? Contact office@boomcard.bg`;
    return this.sendEmail({
      to: email,
      subject: 'We received your BoomCard partner application',
      html,
      text,
      audience: 'partner',
    });
  }

  /**
   * Audit-pass [4.2]: plain-user email verification template. Used for any
   * User whose role !== 'PARTNER'. The partner template was previously sent
   * to USERs too with businessName='', rendering "BOOM Card partner network
   * with <strong></strong>" and copy about an application review — confusing
   * for a normal user just confirming their address.
   */
  async sendUserEmailVerification(
    email: string,
    data: { firstName: string; verificationUrl: string }
  ): Promise<{ success: boolean }> {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#f5a623,#e8890c);padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <div style="font-size:48px;margin-bottom:8px;">✉️</div>
          <h1 style="margin:0;color:#fff;font-size:28px;">Потвърдете имейла си</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;">Здравейте ${data.firstName},</p>
          <p style="margin:0 0 20px;color:#666;font-size:16px;line-height:1.6;">
            Благодарим, че се регистрирахте в <strong>BoomCard</strong>. Моля, потвърдете имейл адреса си, за да активирате акаунта си.
          </p>
          <p style="margin:0 0 30px;color:#666;font-size:16px;line-height:1.6;">
            Натиснете бутона по-долу. Линкът изтича след <strong>24 часа</strong>.
          </p>
          <div style="text-align:center;margin-bottom:30px;">
            <a href="${data.verificationUrl}" style="display:inline-block;background:#f5a623;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:bold;">Потвърждаване</a>
          </div>
          <p style="color:#999;font-size:12px;margin:0;">Ако не сте се регистрирали в BoomCard, можете да игнорирате този имейл.<br>Въпроси? <a href="mailto:office@boomcard.bg" style="color:#f5a623;">office@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. Всички права запазени.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `Здравейте ${data.firstName},\n\nБлагодарим, че се регистрирахте в BoomCard. Моля, потвърдете имейл адреса си:\n${data.verificationUrl}\n\nЛинкът изтича след 24 часа.\n\nАко не сте се регистрирали, игнорирайте този имейл.\n\nВъпроси? office@boomcard.bg`;
    return this.sendEmail({
      to: email,
      subject: 'Потвърдете имейла си – BoomCard',
      html,
      text,
    });
  }

  async sendPartnerEmailVerification(
    email: string,
    data: { firstName: string; businessName: string; verificationUrl: string }
  ): Promise<{ success: boolean }> {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#f5a623,#e8890c);padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <div style="font-size:48px;margin-bottom:8px;">✉️</div>
          <h1 style="margin:0;color:#fff;font-size:28px;">Confirm your email</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;">Hi ${data.firstName},</p>
          <p style="margin:0 0 20px;color:#666;font-size:16px;line-height:1.6;">
            Thank you for applying to the <strong>BOOM Card partner network</strong> with <strong>${data.businessName}</strong>.
          </p>
          <p style="margin:0 0 30px;color:#666;font-size:16px;line-height:1.6;">
            Please confirm your email address by clicking the button below. This link expires in <strong>24 hours</strong>.
          </p>
          <div style="text-align:center;margin-bottom:30px;">
            <a href="${data.verificationUrl}" style="display:inline-block;background:#f5a623;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:bold;">Verify Email Address</a>
          </div>
          <p style="margin:0 0 20px;color:#666;font-size:14px;line-height:1.6;">
            Once your email is confirmed, our team will review your application and get back to you within 24 hours.
          </p>
          <p style="color:#999;font-size:12px;margin:0;">If you did not apply for a BOOM Card partner account, you can safely ignore this email.<br>Questions? <a href="mailto:office@boomcard.bg" style="color:#f5a623;">office@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `Hi ${data.firstName},\n\nThank you for applying to the BOOM Card partner network with ${data.businessName}.\n\nPlease verify your email address by visiting:\n${data.verificationUrl}\n\nThis link expires in 24 hours.\n\nOnce confirmed, our team will review your application.\n\nQuestions? Contact office@boomcard.bg`;
    return this.sendEmail({
      to: email,
      subject: 'Verify your email – BOOM Card partner application',
      html,
      text,
      audience: 'partner',
    });
  }

  /**
   * Spec §5.1 v1.1 — external acknowledgement email sent right after the
   * partner form is submitted. The body MUST contain the "до 2 работни дни"
   * promise (changelog row 2). This is independent of the email-verification
   * link (which the partner clicks to confirm ownership of the address); we
   * deliberately send both so the partner has the promised SLA copy as a
   * standalone message even if they ignore the verification link.
   */
  async sendPartnerApplicationAck(
    email: string,
    data: { firstName: string; businessName: string },
  ): Promise<{ success: boolean }> {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:#0f766e;padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <div style="font-size:48px;margin-bottom:8px;">📬</div>
          <h1 style="margin:0;color:#fff;font-size:26px;">Получихме Вашата заявка</h1>
        </td></tr>
        <tr><td style="padding:40px;color:#333;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 16px;">Здравейте ${data.firstName},</p>
          <p style="margin:0 0 16px;">
            Благодарим Ви за заявката за партньорство с <strong>${data.businessName}</strong>.
          </p>
          <p style="margin:0 0 16px;">
            Нашият екип ще се свърже с Вас <strong>до 2 работни дни</strong> на този имейл.
            Ако имате допълнителни въпроси междувременно, пишете ни на
            <a href="mailto:office@boomcard.bg" style="color:#0f766e;">office@boomcard.bg</a>.
          </p>
          <p style="margin:0;color:#666;font-size:13px;">— Екипът на BoomCard</p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. Всички права запазени.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `Здравейте ${data.firstName},\n\nБлагодарим Ви за заявката за партньорство с ${data.businessName}.\n\nНашият екип ще се свърже с Вас до 2 работни дни на този имейл.\n\nЗа допълнителни въпроси: office@boomcard.bg\n\n— Екипът на BoomCard`;
    return this.sendEmail({
      to: email,
      subject: `BoomCard – получихме Вашата заявка (${data.businessName})`,
      html,
      text,
      audience: 'partner',
    });
  }

  async sendPartnerApplicationAdminNotification(data: {
    applicantName: string;
    applicantEmail: string;
    businessName: string;
    businessCategory: string;
    partnerId: string;
  }): Promise<{ success: boolean }> {
    const adminUrl = `https://boomcard.bg/admin/partners`;
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#667eea,#764ba2);padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <div style="font-size:48px;margin-bottom:8px;">📋</div>
          <h1 style="margin:0;color:#fff;font-size:28px;">New Partner Application</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;">A new partner has applied to join BoomCard:</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f9fa;border-radius:6px;padding:20px;margin-bottom:30px;">
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;">Name:</td>
              <td align="right" style="color:#333;font-size:14px;font-weight:bold;padding:8px 0;">${data.applicantName}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #eee;">Email:</td>
              <td align="right" style="color:#333;font-size:14px;padding:8px 0;border-top:1px solid #eee;">${data.applicantEmail}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #eee;">Business:</td>
              <td align="right" style="color:#333;font-size:14px;font-weight:bold;padding:8px 0;border-top:1px solid #eee;">${data.businessName}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:8px 0;border-top:1px solid #eee;">Category:</td>
              <td align="right" style="color:#333;font-size:14px;padding:8px 0;border-top:1px solid #eee;">${data.businessCategory}</td>
            </tr>
          </table>
          <div style="text-align:center;margin-bottom:30px;">
            <a href="${adminUrl}" style="display:inline-block;background:#667eea;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:bold;">Review in Admin Dashboard</a>
          </div>
          <p style="color:#999;font-size:13px;margin:0;">Filter by "Pending" in Manage Partners to find this application.</p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `New partner application received.\n\nName: ${data.applicantName}\nEmail: ${data.applicantEmail}\nBusiness: ${data.businessName}\nCategory: ${data.businessCategory}\n\nReview at: ${adminUrl}\n(Filter by "Pending" in Manage Partners)`;
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@boomcard.bg';
    return this.sendEmail({
      to: adminEmail,
      subject: `New partner application: ${data.businessName}`,
      html,
      text,
    });
  }

  /**
   * Spec §8.2 v1.1 — partner status-change notification.
   * Sent automatically when an admin moves a partner between Active /
   * Inactive / Suspended / Archived. The body explains the operational
   * impact of the new status so the partner knows what (if anything) they
   * need to do.
   */
  async sendPartnerStatusChangeEmail(
    email: string,
    data: {
      firstName: string;
      businessName: string;
      fromStatus: string;
      toStatus: string;
      reason?: string | null;
    }
  ): Promise<{ success: boolean }> {
    const labelBg: Record<string, string> = {
      ACTIVE: 'Активен', INACTIVE: 'Неактивен', SUSPENDED: 'Спрян',
      ARCHIVED: 'Архивиран', PAUSED: 'Спрян', PENDING: 'Изчакващ',
    };
    const explanationBg: Record<string, string> = {
      ACTIVE:
        'Вашият акаунт работи в пълен оперативен режим — QR кодовете на вашите обекти приемат сканирания и новите транзакции се одобряват.',
      INACTIVE:
        'Вашият акаунт е в режим само за четене. Достъпът до партньорския панел остава, но QR кодовете не приемат нови транзакции и обектите ви не са видими публично.',
      SUSPENDED:
        'Вашият акаунт е временно спрян. Достъпът до партньорския панел може да е ограничен. За да обсъдите случая, свържете се с office@boomcard.bg.',
      PAUSED:
        'Вашият акаунт е временно спрян. Достъпът до партньорския панел може да е ограничен. За да обсъдите случая, свържете се с office@boomcard.bg.',
      ARCHIVED:
        'Вашият акаунт е архивиран и достъпът до партньорския панел е прекратен. За въпроси относно архивирането, пишете на office@boomcard.bg.',
    };

    const fromLabel = labelBg[data.fromStatus] ?? data.fromStatus;
    const toLabel = labelBg[data.toStatus] ?? data.toStatus;
    const explanation = explanationBg[data.toStatus] ?? '';

    // Spec §5.3 — when restored to ACTIVE from a state where QR was disabled
    // (Inactive/Suspended/Archived/Paused), call out the automatic QR
    // re-activation so the partner knows scans will resume without manual
    // intervention on their end.
    //
    // Audit-pass [8.1]: keep the QR note as its own paragraph so it doesn't
    // run on with the status explanation as a wall of text.
    const QR_DEACTIVATING_STATES = new Set(['INACTIVE', 'SUSPENDED', 'PAUSED', 'ARCHIVED']);
    const qrReactivationNote =
      data.toStatus === 'ACTIVE' && QR_DEACTIVATING_STATES.has(data.fromStatus)
        ? 'Всички QR кодове на вашите обекти бяха реактивирани автоматично — не е нужно да генерирате нови или да предприемате действия.'
        : '';
    const qrReactivationHtml = qrReactivationNote
      ? `<p style="margin:0 0 24px;color:#1f2937;font-size:14px;line-height:1.6;background:#ecfdf5;border-left:3px solid #10b981;padding:12px 16px;border-radius:4px;">${qrReactivationNote}</p>`
      : '';

    const reasonBlock = data.reason?.trim()
      ? `<p style="margin:0 0 16px;color:#555;"><strong>Причина:</strong> ${data.reason.trim()}</p>`
      : '';

    const subject = `Промяна на статуса на партньорския акаунт — ${data.businessName}`;
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
      <tr><td style="background:#1f2937;padding:32px;text-align:center;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;color:#fff;font-size:22px;">Промяна на статуса</h1>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 16px;color:#111;font-size:16px;">Здравейте, ${data.firstName},</p>
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6;">
          Статусът на партньорския ви акаунт за <strong>${data.businessName}</strong> беше променен.
        </p>
        <table cellpadding="6" style="margin:0 0 16px;font-size:14px;color:#333;">
          <tr><td><strong>Предишен статус:</strong></td><td>${fromLabel}</td></tr>
          <tr><td><strong>Нов статус:</strong></td><td><strong>${toLabel}</strong></td></tr>
        </table>
        ${reasonBlock}
        <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6;">${explanation}</p>
        ${qrReactivationHtml}
        <p style="color:#999;font-size:13px;margin:0;">Въпроси? Пишете на <a href="mailto:office@boomcard.bg" style="color:#1f2937;">office@boomcard.bg</a></p>
      </td></tr>
      <tr><td style="background:#f8f9fa;padding:18px;text-align:center;border-radius:0 0 8px 8px;">
        <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
    const text =
      `Здравейте, ${data.firstName},\n\n` +
      `Статусът на партньорския ви акаунт за ${data.businessName} беше променен.\n\n` +
      `Предишен статус: ${fromLabel}\n` +
      `Нов статус: ${toLabel}\n` +
      (data.reason?.trim() ? `Причина: ${data.reason.trim()}\n` : '') +
      `\n${explanation}\n` +
      (qrReactivationNote ? `\n${qrReactivationNote}\n` : '') +
      `\nВъпроси? office@boomcard.bg`;

    return this.sendEmail({ to: email, subject, html, text, audience: 'partner' });
  }

  async sendPartnerApprovalEmail(
    email: string,
    data: { firstName: string; businessName: string }
  ): Promise<{ success: boolean }> {
    const loginUrl = 'https://boomcard.bg/login';
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <div style="font-size:48px;margin-bottom:8px;">✅</div>
          <h1 style="margin:0;color:#fff;font-size:28px;">You're Approved!</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;">Hi ${data.firstName},</p>
          <p style="margin:0 0 20px;color:#666;font-size:16px;line-height:1.6;">
            Great news! Your BoomCard partner application for <strong>${data.businessName}</strong> has been approved. Your account is now active.
          </p>
          <p style="margin:0 0 30px;color:#666;font-size:16px;line-height:1.6;">
            Log in to your partner dashboard to set up your discounts, manage venues, and start reaching BoomCard members.
          </p>
          <div style="text-align:center;margin-bottom:30px;">
            <a href="${loginUrl}" style="display:inline-block;background:#22c55e;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:bold;">Log In to Dashboard</a>
          </div>
          <p style="color:#999;font-size:13px;margin:0;">Questions? Reach us at <a href="mailto:office@boomcard.bg" style="color:#22c55e;">office@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `Hi ${data.firstName},\n\nGreat news! Your BoomCard partner application for ${data.businessName} has been approved.\n\nLog in to your partner dashboard: ${loginUrl}\n\nQuestions? Contact office@boomcard.bg`;
    return this.sendEmail({
      to: email,
      subject: `Your BoomCard partner application is approved – ${data.businessName}`,
      html,
      text,
      audience: 'partner',
    });
  }


  /**
   * §7.2: Standalone payment receipt email — sent at payment time only.
   * A separate welcome/complete-profile email follows after profile creation.
   */
  async sendPaymentReceiptEmail(
    email: string,
    data: { planName: string; planNameBg?: string; orderId?: string; amount?: number; currency?: string },
    language: 'bg' | 'en' = 'bg'
  ): Promise<{ success: boolean }> {
    const isBg = language !== 'en';
    const planName = isBg ? (data.planNameBg || data.planName) : data.planName;
    const subject = isBg
      ? `Плащането е потвърдено — план ${planName}`
      : `Payment confirmed — ${planName} plan`;
    const heading = isBg ? 'Плащането е потвърдено!' : 'Payment Confirmed!';
    const body = isBg
      ? `Получихме вашето плащане за план <strong>${planName}</strong>. Ще получите отделен имейл с инструкции за завършване на профила ви.`
      : `We received your payment for the <strong>${planName}</strong> plan. You will receive a separate email with instructions to complete your profile.`;
    const amountLine = data.amount
      ? (isBg ? `<p style="color:#555;margin-bottom:8px;"><strong>Сума:</strong> ${data.amount.toFixed(2)} ${data.currency || 'EUR'}</p>` : `<p style="color:#555;margin-bottom:8px;"><strong>Amount:</strong> ${data.amount.toFixed(2)} ${data.currency || 'EUR'}</p>`)
      : '';
    const orderLine = data.orderId
      ? (isBg ? `<p style="color:#555;margin-bottom:16px;"><strong>Поръчка №:</strong> ${data.orderId}</p>` : `<p style="color:#555;margin-bottom:16px;"><strong>Order #:</strong> ${data.orderId}</p>`)
      : '';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
      <tr><td style="background:linear-gradient(135deg,#10B981,#059669);padding:32px;text-align:center;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;color:#fff;font-size:26px;">${heading}</h1>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="color:#1a1a1a;margin-bottom:16px;">${body}</p>
        ${amountLine}${orderLine}
        <p style="color:#888;font-size:13px;">${isBg ? 'Благодарим, че избрахте BOOM Card!' : 'Thank you for choosing BOOM Card!'}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
    return this.sendEmail({ to: email, subject, html, text: `${heading}\n\n${body.replace(/<[^>]+>/g, '')}` });
  }

  async sendCompleteProfileEmail(
    email: string,
    data: CompleteProfileData
  ): Promise<{ success: boolean }> {
    const isBg = data.language !== 'en';
    const planName = isBg ? (data.planNameBg || data.planName) : data.planName;
    const subject = isBg ? 'Завършете настройката на вашия BoomCard акаунт' : 'Complete your BoomCard account setup';
    const heading = isBg ? 'Завършете настройката на акаунта си' : 'Complete Your Account Setup';
    const subheading = isBg ? 'Плащането беше успешно — направете последната стъпка' : 'Payment successful — one last step';
    const greeting = isBg ? 'Здравейте,' : 'Hi there,';
    const body = isBg
      ? `Абонаментът ви за план <strong>${planName}</strong> е активен. Кликнете на бутона по-долу, за да зададете паролата си и да влезете в своя BoomCard акаунт.`
      : `Your <strong>${planName}</strong> subscription is active. Click the button below to set your password and access your BoomCard account.`;
    const btnLabel = isBg ? 'Завършете настройката' : 'Complete Account Setup';
    const expiry = isBg
      ? 'Връзката е валидна <strong>30 минути</strong>. Ако изтече, свържете се с нас за нова.'
      : "This link expires in <strong>30 minutes</strong>. If it expires, contact us and we'll send a new one.";
    const questions = isBg ? 'Въпроси?' : 'Questions?';

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#667eea,#764ba2);padding:40px;text-align:center;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;color:#fff;font-size:28px;">${heading}</h1>
          <p style="margin:12px 0 0;color:rgba(255,255,255,0.85);font-size:16px;">${subheading}</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 20px;color:#333;font-size:16px;">${greeting}</p>
          <p style="margin:0 0 20px;color:#666;font-size:16px;line-height:1.6;">${body}</p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${data.completeProfileUrl}" style="display:inline-block;background:#667eea;color:#fff;text-decoration:none;padding:16px 40px;border-radius:6px;font-size:16px;font-weight:bold;">${btnLabel}</a>
          </div>
          <p style="color:#999;font-size:13px;margin:0 0 8px;">${expiry}</p>
          <p style="color:#999;font-size:13px;margin:0;">${questions} <a href="mailto:office@boomcard.bg" style="color:#667eea;">office@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = isBg
      ? `Завършете настройката на акаунта си за план ${planName} (връзката е валидна 30 мин):\n${data.completeProfileUrl}\n\nВъпроси? office@boomcard.bg`
      : `Complete your ${planName} account setup (link expires in 30 min):\n${data.completeProfileUrl}\n\nQuestions? office@boomcard.bg`;
    return this.sendEmail({ to: email, subject, html, text });
  }

  async sendSubscriptionCancelledEmail(
    email: string,
    data: SubscriptionCancelledData
  ): Promise<{ success: boolean }> {
    const isBg = data.language === 'bg';
    const S = EmailService.STRINGS[data.language];
    const planName = isBg ? data.planNameBg : data.planName;
    const hi = isBg ? 'Здравейте' : 'Hi';
    const accessLine = data.accessUntil
      ? (isBg
          ? S.subCancelledPeriodEnd.replace('{date}', data.accessUntil.toLocaleDateString('bg-BG', { day: '2-digit', month: 'long', year: 'numeric' }))
          : S.subCancelledPeriodEnd.replace('{date}', data.accessUntil.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })))
      : S.subCancelledImmediate;
    const subject = isBg
      ? `BoomCard абонамент отменен — ${planName}`
      : `BoomCard subscription cancelled — ${planName}`;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#6b7280,#374151);padding:30px;text-align:center;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;color:#fff;font-size:24px;">${S.subCancelled}</h1>
        </td></tr>
        <tr><td style="padding:30px;">
          <p style="margin:0 0 15px;color:#333;font-size:16px;">${hi} ${data.customerName},</p>
          <p style="margin:0 0 20px;color:#666;font-size:16px;line-height:1.6;">${accessLine}</p>
          ${data.accessUntil ? `<p style="margin:0 0 20px;color:#666;font-size:16px;line-height:1.6;">${isBg ? 'Ако промените решението си, можете да се абонирате отново по всяко време.' : 'If you change your mind, you can subscribe again at any time.'}</p>` : ''}
          <div style="text-align:center;margin:24px 0;">
            <a href="${data.manageUrl}" style="display:inline-block;background:#667eea;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:bold;">${isBg ? 'Управление на абонамента' : 'Manage Subscription'}</a>
          </div>
          <p style="color:#999;font-size:13px;margin:0;">${S.questions} <a href="mailto:office@boomcard.bg" style="color:#667eea;">office@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = `${hi} ${data.customerName},\n\n${accessLine}\n\n${data.accessUntil ? (isBg ? 'Ако промените решението си, можете да се абонирате отново по всяко време.' : 'If you change your mind, you can subscribe again at any time.') + '\n\n' : ''}${isBg ? 'Управление на абонамента' : 'Manage subscription'}: ${data.manageUrl}\n\n${S.questions} office@boomcard.bg`;

    return this.sendEmail({ to: email, subject, html, text });
  }

  async sendTrialRefundPendingEmail(
    email: string,
    data: TrialRefundPendingData
  ): Promise<{ success: boolean }> {
    const isBg = data.language === 'bg';
    const S = EmailService.STRINGS[data.language];
    const hi = isBg ? 'Здравейте' : 'Hi';
    const subject = isBg
      ? `Заявката ви за възстановяване е получена — ${data.planName}`
      : `Your refund request has been received — ${data.planName}`;
    const body = S.trialRefundPendingBody.replace('{plan}', isBg ? data.planName : data.planName);

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:30px;text-align:center;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;color:#fff;font-size:24px;">${S.trialRefundPending}</h1>
        </td></tr>
        <tr><td style="padding:30px;">
          <p style="margin:0 0 15px;color:#333;font-size:16px;">${hi} ${data.customerName},</p>
          <p style="margin:0 0 20px;color:#666;font-size:16px;line-height:1.6;">${body}</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f9fa;border-radius:6px;padding:16px;margin-bottom:24px;">
            <tr>
              <td style="color:#666;font-size:14px;padding:6px 0;">${isBg ? 'Сума:' : 'Amount:'}</td>
              <td align="right" style="color:#333;font-size:14px;font-weight:bold;padding:6px 0;">${data.amount.toFixed(2)} ${data.currency}</td>
            </tr>
            <tr>
              <td style="color:#666;font-size:14px;padding:6px 0;border-top:1px solid #dee2e6;">${isBg ? 'Очакван срок:' : 'Expected timeline:'}</td>
              <td align="right" style="color:#333;font-size:14px;padding:6px 0;border-top:1px solid #dee2e6;">${isBg ? '3–5 работни дни' : '3–5 business days'}</td>
            </tr>
          </table>
          <p style="color:#999;font-size:13px;margin:0;">${S.questions} <a href="mailto:office@boomcard.bg" style="color:#667eea;">office@boomcard.bg</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = `${hi} ${data.customerName},\n\n${body}\n\n${isBg ? 'Сума' : 'Amount'}: ${data.amount.toFixed(2)} ${data.currency}\n${isBg ? 'Очакван срок' : 'Expected timeline'}: ${isBg ? '3–5 работни дни' : '3–5 business days'}\n\n${S.questions} office@boomcard.bg`;

    return this.sendEmail({ to: email, subject, html, text });
  }

  async sendAdminTrialRefundAlert(data: TrialRefundPendingData): Promise<{ success: boolean }> {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@boomcard.bg';
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff;">
  <h2 style="color:#d97706;margin-bottom:16px;">⚠️ Manual Paysera Refund Required</h2>
  <p style="color:#555;margin-bottom:20px;">A user has requested a trial refund for a Paysera subscription. This requires a manual refund in the Paysera merchant portal.</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
    <tr><td style="padding:8px;background:#f9f9f9;border:1px solid #eee;font-weight:bold;">User ID</td><td style="padding:8px;border:1px solid #eee;font-family:monospace;">${data.userId}</td></tr>
    <tr><td style="padding:8px;background:#f9f9f9;border:1px solid #eee;font-weight:bold;">Subscription ID</td><td style="padding:8px;border:1px solid #eee;font-family:monospace;">${data.subscriptionId}</td></tr>
    ${data.payseraOrderId ? `<tr><td style="padding:8px;background:#f9f9f9;border:1px solid #eee;font-weight:bold;">Paysera Order ID</td><td style="padding:8px;border:1px solid #eee;font-family:monospace;">${data.payseraOrderId}</td></tr>` : ''}
    <tr><td style="padding:8px;background:#f9f9f9;border:1px solid #eee;font-weight:bold;">Plan</td><td style="padding:8px;border:1px solid #eee;">${data.planName}</td></tr>
    <tr><td style="padding:8px;background:#f9f9f9;border:1px solid #eee;font-weight:bold;">Refund Amount</td><td style="padding:8px;border:1px solid #eee;font-weight:bold;">${data.amount.toFixed(2)} ${data.currency}</td></tr>
  </table>
  <p style="color:#d97706;font-size:14px;margin:0;">Action required: Process refund in Paysera dashboard and update the subscription record.</p>
</body>
</html>`;
    const text = `Manual Paysera Refund Required\n\nUser ID: ${data.userId}\nSubscription ID: ${data.subscriptionId}${data.payseraOrderId ? `\nPaysera Order ID: ${data.payseraOrderId}` : ''}\nPlan: ${data.planName}\nAmount: ${data.amount.toFixed(2)} ${data.currency}\n\nProcess the refund in the Paysera merchant portal.`;
    return this.sendEmail({
      to: adminEmail,
      subject: `[Action Required] Paysera trial refund — ${data.amount.toFixed(2)} ${data.currency} — user ${data.userId}`,
      html,
      text,
    });
  }
  async sendRenewalReminder(email: string, data: RenewalReminderData): Promise<{ success: boolean }> {
    const isBg = data.language === 'bg';
    const subject = isBg
      ? `BoomCard – Предстоящо подновяване на абонамент`
      : `BoomCard – Upcoming subscription renewal`;
    const heading = isBg ? 'Предстоящо подновяване' : 'Upcoming Renewal';
    const planLabel = isBg ? 'План' : 'Plan';
    const renewalLabel = isBg ? 'Дата на подновяване' : 'Renewal date';
    const priceLabel = isBg ? 'Сума' : 'Amount';
    const manageLabel = isBg ? 'Управление на абонамент' : 'Manage subscription';
    const planName = isBg ? data.planNameBg : data.planName;
    const bodyText = isBg
      ? `Здравейте, ${data.customerName}! Вашият абонамент ${planName} ще бъде подновен автоматично на ${data.renewalDate} за ${data.price} BGN.`
      : `Hi ${data.customerName}, your ${planName} subscription will automatically renew on ${data.renewalDate} for ${data.price}.`;
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#dc2626,#ea580c);padding:32px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">${heading}</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="color:#333;margin-top:0;">${bodyText}</p>
          <table width="100%" style="background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0;border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#555;">${planLabel}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#111;">${planName}</td></tr>
            <tr><td style="padding:6px 0;color:#555;">${renewalLabel}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#111;">${data.renewalDate}</td></tr>
            <tr><td style="padding:6px 0;color:#555;">${priceLabel}</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#dc2626;font-size:18px;">${data.price}</td></tr>
          </table>
          <p style="text-align:center;margin:28px 0 0;">
            <a href="${data.manageUrl}" style="background:#dc2626;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;display:inline-block;">${manageLabel}</a>
          </p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px;text-align:center;">
          <p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} BoomCard. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `${bodyText}\n\n${planLabel}: ${planName}\n${renewalLabel}: ${data.renewalDate}\n${priceLabel}: ${data.price}\n\n${manageLabel}: ${data.manageUrl}`;
    return this.sendEmail({ to: email, subject, html, text });
  }

  // Spec §8.2 — "Промяна на договорни параметри": notify the partner when an
  // admin approves or rejects their pending contract-parameter change request.
  async sendPartnerContractChangeEmail(
    email: string,
    data: {
      firstName: string;
      businessName: string;
      approved: boolean;
      changes: Record<string, unknown>;
    },
  ): Promise<{ success: boolean }> {
    const fieldLabels: Record<string, string> = {
      discountRate: 'Процент отстъпка',
      commissionRate: 'Комисионна',
      businessName: 'Бизнес имe',
      description: 'Описание',
      address: 'Адрес',
      city: 'Град',
      phone: 'Телефон',
      email: 'Имейл',
      website: 'Уебсайт',
      categories: 'Категории',
      isVisible: 'Видимост',
    };

    const changeRows = Object.entries(data.changes)
      .map(([key, value]) => {
        const label = fieldLabels[key] ?? key;
        const display = Array.isArray(value) ? value.join(', ') : String(value ?? '—');
        return `<tr>
          <td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap;">${label}</td>
          <td style="padding:6px 0;color:#111;font-weight:600;">${display}</td>
        </tr>`;
      })
      .join('');

    const approved = data.approved;
    const accentColor = approved ? '#10b981' : '#ef4444';
    const headingText = approved ? 'Заявката е одобрена' : 'Заявката е отхвърлена';
    const bodyText = approved
      ? `Промените по-долу бяха одобрени и вече са активни в партньорския ви профил за <strong>${data.businessName}</strong>.`
      : `Промените по-долу бяха отхвърлени и не са приложени към партньорския ви профил. Свържете се с нас на office@boomcard.bg за повече информация.`;

    const subject = approved
      ? `Промяната е одобрена — ${data.businessName}`
      : `Промяната е отхвърлена — ${data.businessName}`;

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
      <tr><td style="background:${accentColor};padding:32px;text-align:center;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;color:#fff;font-size:22px;">${headingText}</h1>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 16px;color:#111;font-size:16px;">Здравейте, ${data.firstName},</p>
        <p style="margin:0 0 20px;color:#444;font-size:15px;line-height:1.6;">${bodyText}</p>
        ${changeRows ? `<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;font-size:14px;">${changeRows}</table>` : ''}
        <p style="margin:0;color:#999;font-size:12px;">Поздрави,<br/>Екипът на BoomCard &mdash; <a href="mailto:office@boomcard.bg" style="color:#6b7280;">office@boomcard.bg</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

    const changesText = Object.entries(data.changes)
      .map(([k, v]) => `${fieldLabels[k] ?? k}: ${Array.isArray(v) ? v.join(', ') : String(v ?? '—')}`)
      .join('\n');
    const text = `Здравейте, ${data.firstName},\n\n${approved ? 'Промяната е одобрена' : 'Промяната е отхвърлена'} за ${data.businessName}.\n\n${changesText}\n\nПоздрави,\nЕкипът на BoomCard`;

    return this.sendEmail({ to: email, subject, html, text, audience: 'partner' });
  }

  /**
   * Spec §9.5 — alert sent to all SUPER_ADMINs when an admin account triggers
   * repeated password-reset requests within a short window.
   */
  async sendAdminPasswordResetAlert(data: {
    targetEmail: string;
    targetName: string;
    resetCount: number;
    windowHours: number;
    recipientEmails: string[];
  }): Promise<{ success: boolean }> {
    const subject = `⚠ Повторни заявки за смяна на парола — ${data.targetName}`;
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="580" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;border:2px solid #f59e0b;">
        <tr><td style="background:#f59e0b;padding:28px 32px;border-radius:6px 6px 0 0;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">⚠ Сигнал за сигурност</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Повторни заявки за смяна на парола</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 20px;color:#111;font-size:15px;line-height:1.6;">
            Администраторски акаунт <strong>${data.targetName}</strong>
            (<code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;">${data.targetEmail}</code>)
            е инициирал <strong>${data.resetCount} заявки за нулиране на парола</strong>
            в рамките на последните ${data.windowHours} часа.
          </p>
          <p style="margin:0 0 24px;color:#444;font-size:14px;line-height:1.6;">
            Ако не разпознавате тези заявки, акаунтът може да е обект на атака.
            Проверете историята на акаунта и при необходимост деактивирайте достъпа.
          </p>
          <p style="margin:0;color:#999;font-size:12px;">
            Изпратено автоматично от BoomCard Security Monitor &bull; ${new Date().toISOString()}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `Сигнал за сигурност — BoomCard\n\nАдминистраторски акаунт ${data.targetName} (${data.targetEmail}) е инициирал ${data.resetCount} заявки за нулиране на парола в последните ${data.windowHours} часа.\n\nАко не разпознавате тези заявки, проверете историята на акаунта.\n\n${new Date().toISOString()}`;

    return this.sendEmail({
      to: data.recipientEmails,
      subject,
      html,
      text,
    });
  }
}

// Export singleton instance
export const emailService = new EmailService();
