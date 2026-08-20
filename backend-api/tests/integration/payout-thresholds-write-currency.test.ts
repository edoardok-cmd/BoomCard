/**
 * BC-QA-031 round 6, A1 — PUT /api/admin/settings/payout-thresholds write unit.
 *
 * The read/write unit asymmetry this pins:
 *   GET  /payout-thresholds returns `minAmount: bgnToEur(stored)`  → EUR
 *   PUT  /payout-thresholds used to persist the submitted number verbatim → BGN
 *
 * The admin editor (AdminSettingsThresholdsPage) seeds its inputs from that GET
 * and posts the same numbers back, so saving an UNTOUCHED form rewrote every
 * payout threshold to ~51% of its previous value — and the next GET halved the
 * already-halved figure again on the following save.
 *
 * These assertions check the PERSISTED row, not just the response body: the
 * response echoes whatever was written, so a response-only assertion would pass
 * against the defect.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { genTestPhone } from '../helpers/test-utils';
import { bgnToEur, eurToBgn } from '../../src/utils/currency';

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: (_o: any) => Promise.resolve() },
}));

function tokenFor(userId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');
  return jwt.sign({ id: userId, email: `${userId}@test.local`, role: 'SUPER_ADMIN' }, secret, {
    expiresIn: '15m',
  });
}

describe('PUT /api/admin/settings/payout-thresholds — write unit (BC-QA-031 A1)', () => {
  let adminToken: string;
  let adminId: string;
  const createdThresholdIds: string[] = [];

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `admin-thresh-write-${Date.now()}@test.local`,
        firstName: 'Thresh',
        lastName: 'Writer',
        status: 'ACTIVE',
        role: 'SUPER_ADMIN',
        emailVerified: true,
        passwordHash: 'unused',
        phone: genTestPhone(),
      },
    });
    adminId = admin.id;
    adminToken = tokenFor(admin.id);
  });

  afterAll(async () => {
    if (createdThresholdIds.length) {
      await prisma.payoutThreshold
        .deleteMany({ where: { id: { in: createdThresholdIds } } })
        .catch(() => {});
    }
    await prisma.payoutThreshold.deleteMany({ where: { createdBy: adminId } }).catch(() => {});
    await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
  });

  it('persists the submitted EUR amount as its BGN equivalent, not verbatim', async () => {
    // 20.00 EUR is the BASIC default; its BGN storage value is 39.12.
    const res = await request(app)
      .put('/api/admin/settings/payout-thresholds')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ thresholds: { BASIC: 20.0 }, notes: 'A1 write-unit test' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const row = await prisma.payoutThreshold.findFirst({
      where: { plan: 'BASIC', createdBy: adminId },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).toBeTruthy();
    createdThresholdIds.push(row!.id);

    // THE assertion: storage is BGN. Persisting the EUR figure verbatim (20.00)
    // is the defect — it would show as 10.22 EUR on the next GET.
    expect(row!.minAmount).toBeCloseTo(eurToBgn(20.0), 2);
    expect(row!.minAmount).toBeCloseTo(39.12, 2);
    expect(row!.minAmount).not.toBeCloseTo(20.0, 2);
  });

  it('round-trips: GET after PUT returns the same EUR figure that was submitted', async () => {
    const submitted = 15.0;

    const put = await request(app)
      .put('/api/admin/settings/payout-thresholds')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ thresholds: { PREMIUM_MONTHLY: submitted }, notes: 'A1 round-trip test' });
    expect(put.status).toBe(200);

    const row = await prisma.payoutThreshold.findFirst({
      where: { plan: 'PREMIUM_MONTHLY', createdBy: adminId },
      orderBy: { createdAt: 'desc' },
    });
    if (row) createdThresholdIds.push(row.id);

    const get = await request(app)
      .get('/api/admin/settings/payout-thresholds')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(get.status).toBe(200);

    // This is the property the admin actually experiences: save the form, reload
    // the page, see the same number. Pre-fix it read back as ~7.67.
    expect(get.body.data.PREMIUM_MONTHLY.minAmount).toBeCloseTo(submitted, 2);
    expect(get.body.data.PREMIUM_MONTHLY.minAmount).not.toBeCloseTo(bgnToEur(submitted), 2);
  });

  it('saving an untouched form is idempotent — the threshold does not drift', async () => {
    // The exact failure mode: seed the form from GET, submit it back unchanged,
    // repeat. Pre-fix each save halved the value.
    const first = await request(app)
      .put('/api/admin/settings/payout-thresholds')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ thresholds: { PREMIUM_WEEKLY: 10.0 } });
    expect(first.status).toBe(200);

    for (let i = 0; i < 3; i++) {
      const get = await request(app)
        .get('/api/admin/settings/payout-thresholds')
        .set('Authorization', `Bearer ${adminToken}`);
      const seeded = get.body.data.PREMIUM_WEEKLY.minAmount;

      const put = await request(app)
        .put('/api/admin/settings/payout-thresholds')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ thresholds: { PREMIUM_WEEKLY: seeded } });
      expect(put.status).toBe(200);
    }

    const finalGet = await request(app)
      .get('/api/admin/settings/payout-thresholds')
      .set('Authorization', `Bearer ${adminToken}`);

    // After 3 no-op saves the value must still be 10.00 EUR. Pre-fix: 1.25.
    expect(finalGet.body.data.PREMIUM_WEEKLY.minAmount).toBeCloseTo(10.0, 2);

    const rows = await prisma.payoutThreshold.findMany({
      where: { plan: 'PREMIUM_WEEKLY', createdBy: adminId },
    });
    rows.forEach((r) => createdThresholdIds.push(r.id));
  });

  it('accepts the three SubscriptionPlan keys the admin editor sends', async () => {
    // The editor previously posted BASIC/PREMIUM/LIGHT; PREMIUM and LIGHT are not
    // in the route's validPlans set, so every save 400'd and no threshold could be
    // edited at all. Pins the contract the page was corrected to match.
    const res = await request(app)
      .put('/api/admin/settings/payout-thresholds')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ thresholds: { BASIC: 20, PREMIUM_MONTHLY: 15, PREMIUM_WEEKLY: 10 } });

    expect(res.status).toBe(200);

    const legacy = await request(app)
      .put('/api/admin/settings/payout-thresholds')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ thresholds: { PREMIUM: 15 } });
    expect(legacy.status).toBe(400);

    const rows = await prisma.payoutThreshold.findMany({ where: { createdBy: adminId } });
    rows.forEach((r) => createdThresholdIds.push(r.id));
  });
});
