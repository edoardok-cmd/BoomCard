/**
 * Email Service for Transactional Emails
 * Supports multiple providers: SendGrid, Mailgun, AWS SES
 */

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType: string;
  }>;
}

export interface EmailProvider {
  send(options: EmailOptions): Promise<boolean>;
}

/**
 * SendGrid Email Provider
 */
class SendGridProvider implements EmailProvider {
  private apiKey: string;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.apiKey = import.meta.env.VITE_SENDGRID_API_KEY || '';
    this.fromEmail = import.meta.env.VITE_EMAIL_FROM || 'noreply@boomcard.bg';
    this.fromName = import.meta.env.VITE_EMAIL_FROM_NAME || 'BoomCard';
  }

  async send(options: EmailOptions): Promise<boolean> {
    if (!this.apiKey) {
      console.error('[Email] SendGrid API key not configured');
      return false;
    }

    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: Array.isArray(options.to)
                ? options.to.map(email => ({ email }))
                : [{ email: options.to }],
              subject: options.subject,
            },
          ],
          from: {
            email: options.from || this.fromEmail,
            name: this.fromName,
          },
          content: [
            {
              type: 'text/plain',
              value: options.text || '',
            },
            {
              type: 'text/html',
              value: options.html || '',
            },
          ],
          reply_to: options.replyTo
            ? { email: options.replyTo }
            : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[Email] SendGrid error:', error);
        return false;
      }

      console.log('[Email] Sent successfully via SendGrid');
      return true;
    } catch (error) {
      console.error('[Email] Failed to send:', error);
      return false;
    }
  }
}

/**
 * Email Service Manager
 */
class EmailService {
  private provider: EmailProvider;

  constructor() {
    const providerType = import.meta.env.VITE_EMAIL_PROVIDER || 'sendgrid';
    
    switch (providerType) {
      case 'sendgrid':
        this.provider = new SendGridProvider();
        break;
      default:
        this.provider = new SendGridProvider();
    }
  }

  /**
   * Send a generic email
   */
  async send(options: EmailOptions): Promise<boolean> {
    return this.provider.send(options);
  }

  /**
   * Send welcome email to new user
   */
  async sendWelcomeEmail(to: string, name: string): Promise<boolean> {
    return this.send({
      to,
      subject: 'Welcome to BoomCard!',
      html: this.getWelcomeEmailTemplate(name),
      text: `Welcome to BoomCard, ${name}! Start saving at Bulgaria's finest venues.`,
    });
  }

  /**
   * Send email verification
   */
  async sendVerificationEmail(to: string, verificationUrl: string): Promise<boolean> {
    return this.send({
      to,
      subject: 'Verify your BoomCard email',
      html: this.getVerificationEmailTemplate(verificationUrl),
      text: `Please verify your email: ${verificationUrl}`,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
    return this.send({
      to,
      subject: 'Reset your BoomCard password',
      html: this.getPasswordResetTemplate(resetUrl),
      text: `Reset your password: ${resetUrl}`,
    });
  }

  /**
   * Send transaction notification
   */
  async sendTransactionNotification(
    to: string,
    amount: number,
    venue: string,
    discount: number
  ): Promise<boolean> {
    return this.send({
      to,
      subject: `BoomCard used at ${venue}`,
      html: this.getTransactionNotificationTemplate(amount, venue, discount),
      text: `You saved ${discount}% at ${venue}! Amount: ${amount} BGN`,
    });
  }

  /**
   * Send invoice email
   */
  async sendInvoiceEmail(
    to: string,
    invoiceNumber: string,
    amount: number,
    pdfAttachment?: Buffer
  ): Promise<boolean> {
    const options: EmailOptions = {
      to,
      subject: `Invoice ${invoiceNumber} from BoomCard`,
      html: this.getInvoiceEmailTemplate(invoiceNumber, amount),
      text: `Your invoice ${invoiceNumber} for ${amount} BGN is attached.`,
    };

    if (pdfAttachment) {
      options.attachments = [
        {
          filename: `invoice-${invoiceNumber}.pdf`,
          content: pdfAttachment,
          contentType: 'application/pdf',
        },
      ];
    }

    return this.send(options);
  }

  // Email Templates

  private getWelcomeEmailTemplate(name: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000; color: #fff; padding: 30px; text-align: center; }
            .content { padding: 30px; background: #f9f9f9; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: #fff; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to BoomCard!</h1>
            </div>
            <div class="content">
              <p>Hi ${name},</p>
              <p>Welcome to BoomCard - your key to exclusive discounts at Bulgaria's finest venues!</p>
              <p>Get started by exploring our partner venues and start saving today.</p>
              <a href="https://boomcard.bg/categories" class="button">Explore Venues</a>
              <p>Happy saving!<br/>The BoomCard Team</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private getVerificationEmailTemplate(verificationUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <body>
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
            <h2>Verify Your Email</h2>
            <p>Please click the button below to verify your email address:</p>
            <a href="${verificationUrl}" style="display: inline-block; padding: 12px 30px; background: #667eea; color: #fff; text-decoration: none; border-radius: 5px;">Verify Email</a>
            <p>Or copy and paste this link: ${verificationUrl}</p>
            <p>This link will expire in 24 hours.</p>
          </div>
        </body>
      </html>
    `;
  }

  private getPasswordResetTemplate(resetUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <body>
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
            <h2>Reset Your Password</h2>
            <p>Click the button below to reset your password:</p>
            <a href="${resetUrl}" style="display: inline-block; padding: 12px 30px; background: #ef4444; color: #fff; text-decoration: none; border-radius: 5px;">Reset Password</a>
            <p>Or copy and paste this link: ${resetUrl}</p>
            <p>This link will expire in 1 hour. If you didn't request this, please ignore this email.</p>
          </div>
        </body>
      </html>
    `;
  }

  private getTransactionNotificationTemplate(amount: number, venue: string, discount: number): string {
    return `
      <!DOCTYPE html>
      <html>
        <body>
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
            <h2>🎉 BoomCard Used!</h2>
            <p>You just saved <strong>${discount}%</strong> at <strong>${venue}</strong>!</p>
            <p><strong>Amount:</strong> ${amount.toFixed(2)} BGN</p>
            <p><strong>Savings:</strong> ${(amount * discount / 100).toFixed(2)} BGN</p>
            <p>Keep using your BoomCard to unlock more savings!</p>
          </div>
        </body>
      </html>
    `;
  }

  private getInvoiceEmailTemplate(invoiceNumber: string, amount: number): string {
    return `
      <!DOCTYPE html>
      <html>
        <body>
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
            <h2>Your Invoice</h2>
            <p>Thank you for your payment!</p>
            <p><strong>Invoice Number:</strong> ${invoiceNumber}</p>
            <p><strong>Amount:</strong> ${amount.toFixed(2)} BGN</p>
            <p>Your invoice is attached to this email.</p>
            <p>Questions? Contact us at support@boomcard.bg</p>
          </div>
        </body>
      </html>
    `;
  }
}

// Export singleton instance
export const emailService = new EmailService();

export default emailService;
