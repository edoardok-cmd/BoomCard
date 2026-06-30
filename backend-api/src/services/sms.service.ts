import twilio from 'twilio';
import { logger } from '../utils/logger';

class SmsService {
  private client: ReturnType<typeof twilio> | null;
  private fromNumber: string;
  private enabled: boolean;

  constructor() {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
    this.enabled = !!sid && !!token && !!this.fromNumber && process.env.NODE_ENV === 'production';

    if (!sid || !token) {
      logger.warn('Twilio credentials not configured. SMS will be logged only.');
      this.client = null;
    } else {
      this.client = twilio(sid, token);
      logger.info('SMS Service initialized with Twilio');
    }
  }

  async sendSms(to: string, body: string): Promise<{ success: boolean; sid?: string }> {
    if (!this.enabled) {
      logger.info(`[SMS DISABLED] Would send SMS to: ${to}`);
      logger.info(`   Body: ${body.slice(0, 100)}`);
      return { success: true, sid: 'disabled-mode' };
    }
    try {
      const msg = await this.client!.messages.create({ from: this.fromNumber, to, body });
      return { success: true, sid: msg.sid };
    } catch (err) {
      logger.error('[sms] Failed to send SMS:', err);
      return { success: false };
    }
  }
}

export const smsService = new SmsService();
