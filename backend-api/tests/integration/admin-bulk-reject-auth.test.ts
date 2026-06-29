/**
 * INV-RDM-039: POST /api/stickers/admin/bulk-reject requires ADMIN/SUPER_ADMIN role
 *
 * BC-REDEMPTION-RDM-039-3
 *
 * Runtime-verifies the AUTH gate on POST /api/stickers/admin/bulk-reject:
 *   - 401 when no Authorization header is present
 *   - 403 when caller has USER role (not ADMIN/SUPER_ADMIN)
 *   - 200 when caller has ADMIN role (stickerService.bulkReject mocked)
 *   - 200 when caller has SUPER_ADMIN role (stickerService.bulkReject mocked)
 *
 * Runtime: backend against boomcard_test DB (NODE_ENV=test).
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { createTestUser, cleanupTestUser } from '../helpers/test-utils';

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../../src/services/sticker.service', () => {
  const original = jest.requireActual('../../src/services/sticker.service');
  return {
    ...original,
    stickerService: {
      ...original.stickerService,
      bulkReject: jest.fn(async (scanIds: string[], _reason: string, _actor: string | null) => ({
        successCount: scanIds.length,
        errorCount: 0,
        errors: [],
      })),
    },
  };
});

jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: {
    uploadImage: jest.fn(async (_params: any) => ({
      url: `https://cdn.example.com/test-image.jpg`,
      key: 'test-key',
      size: 1024,
    })),
  },
}));

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: (_opts: any) => Promise.resolve() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let adminToken: string;
let adminUserId: string;
let superAdminToken: string;
let superAdminUserId: string;
let userToken: string;
let userUserId: string;

const VALID_PAYLOAD = {
  scanIds: ['aaaaaaaa-0000-0000-0000-000000000001'],
  reason: 'fraud detected',
};

const ENDPOINT = '/api/stickers/admin/bulk-reject';

beforeAll(async () => {
  // ADMIN user
  const adminReg = await createTestUser();
  adminUserId = adminReg.user.id;
  await prisma.user.update({ where: { id: adminUserId }, data: { role: 'ADMIN', status: 'ACTIVE' } });
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: adminReg.email, password: adminReg.password, clientType: 'web' });
  if (adminLogin.status !== 200) {
    throw new Error(`ADMIN login failed (${adminLogin.status}): ${JSON.stringify(adminLogin.body)}`);
  }
  adminToken = adminLogin.body.data.accessToken;

  // SUPER_ADMIN user
  const saReg = await createTestUser();
  superAdminUserId = saReg.user.id;
  await prisma.user.update({ where: { id: superAdminUserId }, data: { role: 'SUPER_ADMIN', status: 'ACTIVE' } });
  const saLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: saReg.email, password: saReg.password, clientType: 'web' });
  if (saLogin.status !== 200) {
    throw new Error(`SUPER_ADMIN login failed (${saLogin.status}): ${JSON.stringify(saLogin.body)}`);
  }
  superAdminToken = saLogin.body.data.accessToken;

  // USER (non-admin)
  const userReg = await createTestUser();
  userUserId = userReg.user.id;
  await prisma.user.update({ where: { id: userUserId }, data: { role: 'USER', status: 'ACTIVE' } });
  const userLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: userReg.email, password: userReg.password, clientType: 'mobile' });
  if (userLogin.status !== 200) {
    throw new Error(`USER login failed (${userLogin.status}): ${JSON.stringify(userLogin.body)}`);
  }
  userToken = userLogin.body.data.accessToken;
}, 30_000);

afterAll(async () => {
  try { await cleanupTestUser(adminUserId); } catch {}
  try { await cleanupTestUser(superAdminUserId); } catch {}
  try { await cleanupTestUser(userUserId); } catch {}
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('INV-RDM-039 — POST /api/stickers/admin/bulk-reject ADMIN/SUPER_ADMIN auth gate', () => {
  it('[AUTH] no Authorization header → 401', async () => {
    const res = await request(app).post(ENDPOINT).send(VALID_PAYLOAD);
    expect(res.status).toBe(401);
  });

  it('[AUTH] USER role (not ADMIN/SUPER_ADMIN) → 403', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${userToken}`)
      .send(VALID_PAYLOAD);
    expect(res.status).toBe(403);
  });

  it('[AUTH] ADMIN role → 200', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(VALID_PAYLOAD);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('[AUTH] SUPER_ADMIN role → 200', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send(VALID_PAYLOAD);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
