/**
 * Integration Tests: §8.2 Contract-Change Email — route wiring
 *
 * Verifies the actual route handlers in partners.routes.ts call
 * emailService.sendPartnerContractChangeEmail after applying or
 * discarding pendingChanges:
 *
 *   A. POST /:id/approve  → approved=true, to partner.email
 *   B. POST /:id/reject   → approved=false
 *   C. POST /:id/approve with partner.email=null → falls back to user.email
 *   D. POST /:id/approve with no pendingChanges  → 400, no email
 */

// ─── Email mock — hoisted before app is loaded ────────────────────────────────

jest.mock('../../src/services/email.service', () => ({
  __esModule: true,
  emailService: {
    sendPartnerContractChangeEmail: jest.fn().mockResolvedValue(undefined),
    sendEmail: jest.fn().mockResolvedValue(undefined),
    sendPartnerApprovalEmail: jest.fn().mockResolvedValue(undefined),
    sendPartnerStatusChangeEmail: jest.fn().mockResolvedValue(undefined),
  },
  EmailService: jest.fn(),
}));

import bcrypt from 'bcrypt';
import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { emailService } from '../../src/services/email.service';
import { genTestPhone } from '../helpers/test-utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const PASSWORD = 'AdminPass999!';
const PENDING_CHANGES = { discountRate: 12 };

// Fixed email used in beforeEach restores; distinct from the partner user's
// account email so we can test the fallback path independently.
const PARTNER_CONTACT_EMAIL = 'partner-s8-contact@example.com';

// ─── Fixture types ────────────────────────────────────────────────────────────

interface Fixtures {
  adminToken: string;
  adminId: string;
  partnerUserId: string;
  partnerUserEmail: string;
  partnerId: string;
}

let fx: Fixtures;

// ─── DB setup / teardown ──────────────────────────────────────────────────────

async function createFixtures(): Promise<Fixtures> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const hash = await bcrypt.hash(PASSWORD, 10);

  const admin = await prisma.user.create({
    data: {
      email: `sa-s8-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      phone: genTestPhone(),
    },
  });

  const partnerUser = await prisma.user.create({
    data: {
      email: `puser-s8-${suffix}@example.com`,
      passwordHash: hash,
      firstName: 'Петър',
      lastName: 'Иванов',
      role: 'PARTNER',
      status: 'ACTIVE',
      emailVerified: true,
      phone: genTestPhone(),
    },
  });

  const partner = await prisma.partner.create({
    data: {
      userId: partnerUser.id,
      businessName: 'Кафе Тест §8',
      category: 'coffee',
      email: PARTNER_CONTACT_EMAIL,
      pendingChanges: PENDING_CHANGES,
      pendingChangesAt: new Date(),
      status: 'PENDING',
    },
  });

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: admin.email, password: PASSWORD, clientType: 'web' });
  if (loginRes.status !== 200) {
    throw new Error(`Admin login failed: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
  }

  return {
    adminToken: loginRes.body.data.accessToken,
    adminId: admin.id,
    partnerUserId: partnerUser.id,
    partnerUserEmail: partnerUser.email,
    partnerId: partner.id,
  };
}

beforeAll(async () => {
  fx = await createFixtures();
});

afterAll(async () => {
  await prisma.partner.deleteMany({ where: { id: fx.partnerId } });
  await prisma.user.deleteMany({ where: { id: { in: [fx.adminId, fx.partnerUserId] } } });
});

// Restore fresh pendingChanges and partner.email before each test.
beforeEach(async () => {
  await prisma.partner.update({
    where: { id: fx.partnerId },
    data: {
      email: PARTNER_CONTACT_EMAIL,
      pendingChanges: PENDING_CHANGES,
      pendingChangesAt: new Date(),
    },
  });
  jest.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('§8.2 contract-change email — route wiring', () => {
  it('A: approve calls sendPartnerContractChangeEmail(approved=true) to partner.email', async () => {
    const res = await request(app)
      .post(`/api/partners/${fx.partnerId}/approve`)
      .set('Authorization', `Bearer ${fx.adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(emailService.sendPartnerContractChangeEmail).toHaveBeenCalledTimes(1);

    const [toArg, dataArg] = (emailService.sendPartnerContractChangeEmail as jest.Mock).mock.calls[0];
    expect(toArg).toBe(PARTNER_CONTACT_EMAIL);
    expect(dataArg).toMatchObject({ approved: true, changes: PENDING_CHANGES });
  });

  it('B: reject calls sendPartnerContractChangeEmail(approved=false)', async () => {
    const res = await request(app)
      .post(`/api/partners/${fx.partnerId}/reject`)
      .set('Authorization', `Bearer ${fx.adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(emailService.sendPartnerContractChangeEmail).toHaveBeenCalledTimes(1);

    const [, dataArg] = (emailService.sendPartnerContractChangeEmail as jest.Mock).mock.calls[0];
    expect(dataArg).toMatchObject({ approved: false, changes: PENDING_CHANGES });
  });

  it('C: approve falls back to user.email when partner.email is null', async () => {
    await prisma.partner.update({
      where: { id: fx.partnerId },
      data: { email: null },
    });

    const res = await request(app)
      .post(`/api/partners/${fx.partnerId}/approve`)
      .set('Authorization', `Bearer ${fx.adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(emailService.sendPartnerContractChangeEmail).toHaveBeenCalledTimes(1);

    const [toArg] = (emailService.sendPartnerContractChangeEmail as jest.Mock).mock.calls[0];
    expect(toArg).toBe(fx.partnerUserEmail);
  });

  it('D: approve returns 400 and sends no email when pendingChanges is null', async () => {
    await prisma.partner.update({
      where: { id: fx.partnerId },
      data: { pendingChanges: null, pendingChangesAt: null },
    });

    await request(app)
      .post(`/api/partners/${fx.partnerId}/approve`)
      .set('Authorization', `Bearer ${fx.adminToken}`)
      .expect(400);

    expect(emailService.sendPartnerContractChangeEmail).not.toHaveBeenCalled();
  });
});
