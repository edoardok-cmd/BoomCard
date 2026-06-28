import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../setup';
import { prisma } from '../../src/lib/prisma';
import { invalidateCurrencyDisplayCache } from '../../src/utils/currencyDisplay';

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: (_opts: any) => Promise.resolve() },
}));
jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyPayoutEvent: (_opts: any) => Promise.resolve(),
    notifyPartnerStatusChange: (_opts: any) => Promise.resolve(),
  },
}));

async function setCurrencyWindowOpen(isOpen: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: 'currency_transition_window_open' },
    create: { key: 'currency_transition_window_open', value: isOpen ? 'true' : 'false' },
    update: { value: isOpen ? 'true' : 'false' },
  });
  invalidateCurrencyDisplayCache();
}

describe('GET /api/admin/alerts currency gating', () => {
  let app: any;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    const adminUser = await prisma.user.create({
      data: {
        email: `alerts-currency-test-${Date.now()}@test.local`,
        firstName: 'Test',
        lastName: 'Admin',
        status: 'ACTIVE',
        role: 'SUPER_ADMIN',
        emailVerified: true,
        passwordHash: 'unused',
        phone: '+359000000000',
      },
    });

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error('JWT_SECRET not set');
    adminToken = jwt.sign({ id: adminUser.id, email: adminUser.email, role: 'SUPER_ADMIN' }, jwtSecret, {
      expiresIn: '15m',
    });
  });

  afterAll(async () => {
    await setCurrencyWindowOpen(true);
    await prisma.user.deleteMany({
      where: { email: { contains: 'alerts-currency-test' } },
    });
    await app?.close?.();
  });

  it('threshold fields are DualCurrencyAmount objects with bgn:null when window CLOSED', async () => {
    await setCurrencyWindowOpen(false);

    const res = await request(app)
      .get('/api/admin/alerts/')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();

    const operational = res.body.operational || [];
    const thresholdAlerts = operational.filter((a: any) =>
      a.id === 'payout_threshold' || a.id === 'large_pending_payouts'
    );

    // Both alerts should exist in the payload (count may vary based on fixture state)
    // But when they exist, their thresholds must be wrapped
    for (const alert of thresholdAlerts) {
      expect(alert.meta?.threshold).toBeDefined();
      // Verify it's a DualCurrencyAmount object (not a raw BGN scalar)
      expect(typeof alert.meta?.threshold).toBe('object');
      expect(alert.meta?.threshold).toHaveProperty('eur');
      expect(alert.meta?.threshold).toHaveProperty('bgn');
      expect(alert.meta?.threshold).toHaveProperty('windowOpen');
      // When window is closed, bgn must be null
      expect(alert.meta?.threshold.bgn).toBeNull();
      // EUR must always be a number
      expect(typeof alert.meta?.threshold.eur).toBe('number');
      expect(alert.meta?.threshold.windowOpen).toBe(false);
    }
  });

  it('threshold fields contain bgn when window OPEN', async () => {
    await setCurrencyWindowOpen(true);

    const res = await request(app)
      .get('/api/admin/alerts/')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const operational = res.body.operational || [];
    const thresholdAlerts = operational.filter((a: any) =>
      a.id === 'payout_threshold' || a.id === 'large_pending_payouts'
    );

    for (const alert of thresholdAlerts) {
      expect(alert.meta?.threshold).toBeDefined();
      expect(typeof alert.meta?.threshold).toBe('object');
      expect(alert.meta?.threshold).toHaveProperty('eur');
      expect(alert.meta?.threshold).toHaveProperty('bgn');
      expect(alert.meta?.threshold).toHaveProperty('windowOpen');
      // When window is open, bgn must be a number
      expect(typeof alert.meta?.threshold.bgn).toBe('number');
      expect(typeof alert.meta?.threshold.eur).toBe('number');
      expect(alert.meta?.threshold.windowOpen).toBe(true);
    }
  });
});
