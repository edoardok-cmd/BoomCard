/**
 * BC-PARTNER-SPEC-REAUDIT-2-PUT-GUARD-DISCOUNTRATE
 *
 * Invariant INV-ROLE-002 (spec §11.1 / §11.4): a partner authenticated as the
 * owner of their own partner record may NOT, via PUT /api/partners/:id, change
 * the commission % (`discountRate`) or any other admin-only contract / lifecycle
 * field (status, isVisible, partnerTypeId, verifiedAt). Those attempts must be
 * rejected 403 PARTNER_USE_CHANGE_REQUEST — never silently dropped with a fake
 * "pending approval" success, and never written to pendingChanges.
 *
 * The ONLY fields a partner may stage as a pending change are the public-content
 * display fields: description, descriptionBg, openingHours, amenities. A PUT that
 * supplies none of those (empty body / only non-editable fields) must return 400
 * NO_EDITABLE_FIELDS and must NOT create a phantom empty pendingChanges record.
 *
 * This file does NOT edit any src/** code beyond the route already fixed.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../setup';
import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/services/email.service', () => ({ emailService: { sendEmail: (_o: any) => Promise.resolve() } }));
jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyPayoutEvent: (_o: any) => Promise.resolve(),
    notifyPartnerStatusChange: (_o: any) => Promise.resolve(),
  },
}));

const RUN_TAG = `partner-putguard-${Date.now()}`;

function tok(userId: string, role: string): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET not set');
  return jwt.sign({ id: userId, email: `${RUN_TAG}-${userId}@test.local`, role }, s, { expiresIn: '15m' });
}

describe('PUT /api/partners/:id — partner cannot change discountRate / admin-only fields (INV-ROLE-002)', () => {
  let app: any;
  let userId: string;
  let partnerId: string;
  let partnerTypeId: string;
  let token: string;
  const ORIGINAL_RATE = 10;

  beforeAll(async () => {
    app = await createTestApp();

    const ptype = await prisma.partnerType.create({
      data: { name: `${RUN_TAG}-type`, maxDiscountRate: 50 },
    });
    partnerTypeId = ptype.id;

    const user = await prisma.user.create({
      data: {
        email: `${RUN_TAG}-owner@test.local`,
        firstName: 'Owner',
        lastName: 'P',
        phone: `+359900${Math.floor(Math.random() * 1000000)}`,
        status: 'ACTIVE',
        role: 'PARTNER',
        emailVerified: true,
        passwordHash: 'unused',
      },
    });
    userId = user.id;

    const partner = await prisma.partner.create({
      data: {
        userId: user.id,
        businessName: `${RUN_TAG}-Biz`,
        category: 'RESTAURANT',
        status: 'ACTIVE',
        verifiedAt: new Date(),
        discountRate: ORIGINAL_RATE,
        isVisible: true,
      },
    });
    partnerId = partner.id;
    token = tok(userId, 'PARTNER');
  });

  afterAll(async () => {
    try {
      await prisma.partner.deleteMany({ where: { user: { email: { startsWith: RUN_TAG } } } });
      await prisma.user.deleteMany({ where: { email: { startsWith: RUN_TAG } } });
      await prisma.partnerType.deleteMany({ where: { name: { startsWith: RUN_TAG } } });
    } catch {
      /* best-effort */
    }
    await app?.close?.();
  });

  // Re-read the partner's persisted commission + pendingChanges from the DB.
  async function freshPartner() {
    return prisma.partner.findUnique({
      where: { id: partnerId },
      select: { discountRate: true, status: true, isVisible: true, partnerTypeId: true, pendingChanges: true },
    });
  }

  it('rejects {discountRate:99} with 403 PARTNER_USE_CHANGE_REQUEST; commission unchanged; no pendingChanges written', async () => {
    const res = await request(app)
      .put(`/api/partners/${partnerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ discountRate: 99 });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PARTNER_USE_CHANGE_REQUEST');

    const after = await freshPartner();
    expect(after?.discountRate).toBe(ORIGINAL_RATE);
    expect(after?.pendingChanges == null).toBe(true);
  });

  it.each([
    ['status', { status: 'SUSPENDED' }],
    ['isVisible', { isVisible: false }],
    ['partnerTypeId', () => ({ partnerTypeId })],
    ['verifiedAt', { verifiedAt: new Date().toISOString() }],
  ])('rejects admin-only field %s with 403 PARTNER_USE_CHANGE_REQUEST', async (_name, bodyOrFn) => {
    const body = typeof bodyOrFn === 'function' ? (bodyOrFn as () => any)() : bodyOrFn;
    const res = await request(app)
      .put(`/api/partners/${partnerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PARTNER_USE_CHANGE_REQUEST');

    const after = await freshPartner();
    expect(after?.pendingChanges == null).toBe(true);
  });

  it('still 403s the already-covered identity field {businessName}', async () => {
    const res = await request(app)
      .put(`/api/partners/${partnerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ businessName: 'Renamed Inc' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PARTNER_USE_CHANGE_REQUEST');
  });

  it('returns 400 NO_EDITABLE_FIELDS for an empty body and writes NO pendingChanges record', async () => {
    const res = await request(app)
      .put(`/api/partners/${partnerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_EDITABLE_FIELDS');

    const after = await freshPartner();
    expect(after?.pendingChanges == null).toBe(true);
  });

  it('happy path: {description} stages a pending change with 200 {pending:true}', async () => {
    const res = await request(app)
      .put(`/api/partners/${partnerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'A brand new description' });

    expect(res.status).toBe(200);
    expect(res.body.pending).toBe(true);

    const after = await freshPartner();
    expect(after?.pendingChanges).toMatchObject({ description: 'A brand new description' });
    // Allowed display edit must NOT touch the commission.
    expect(after?.discountRate).toBe(ORIGINAL_RATE);
  });
});
