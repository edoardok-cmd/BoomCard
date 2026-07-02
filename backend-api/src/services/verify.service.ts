import twilio from 'twilio';
import { logger } from '../utils/logger';

class VerifyService {
  private client: ReturnType<typeof twilio> | null = null;
  private serviceSid: string;
  private enabled: boolean;

  constructor() {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    this.serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID || '';
    this.enabled = !!sid && !!token && !!this.serviceSid;

    if (this.enabled) {
      this.client = twilio(sid!, token!);
    } else {
      logger.error('Twilio Verify not configured — OTP will be logged only.');
    }
  }

  async sendOtp(phoneNumber: string): Promise<void> {
    if (!this.enabled) {
      logger.info(`[VERIFY DISABLED] Would send OTP to ***${phoneNumber.slice(-4)}`);
      return;
    }
    await this.client!.verify.v2.services(this.serviceSid)
      .verifications.create({ to: phoneNumber, channel: 'sms' });
  }

  async checkOtp(phoneNumber: string, code: string): Promise<boolean> {
    if (!this.enabled) {
      logger.info(`[VERIFY DISABLED] Would check OTP for ***${phoneNumber.slice(-4)}`);
      // Verify disabled: accept any code — ensure TWILIO_VERIFY_SERVICE_SID is set in production
      return true;
    }
    try {
      const result = await this.client!.verify.v2.services(this.serviceSid)
        .verificationChecks.create({ to: phoneNumber, code });
      return result.status === 'approved';
    } catch (err: any) {
      // Twilio returns 404 / code 20404 when the verification does not exist
      // (expired, already used, or never issued). Treat this as a failed check
      // rather than a server error so callers receive false instead of HTTP 500.
      if (err.status === 404 || err.code === 20404) {
        return false;
      }
      throw err;
    }
  }
}

export const verifyService = new VerifyService();
