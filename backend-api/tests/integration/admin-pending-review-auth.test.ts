/**
 * INV-RDM-036: GET /api/stickers/admin/pending-review requires ADMIN/SUPER_ADMIN role.
 *
 * BC-REDEMPTION-RDM-036-3
 *
 * Spec §3 / §7: admin review endpoints are restricted to ADMIN and SUPER_ADMIN roles.
 *
 * Verifies:
 *   - No Authorization header                     → 401
 *   - Authenticated as USER role                  → 403
 *   - Authenticated as ADMIN role                 → 200
 *   - Authenticated as SUPER_ADMIN role           → 200
 *
 * Uses the real app + boomcard_test DB (NODE_ENV=test). The pending-review endpoint
 * queries stickerScan rows; in the empty test DB it returns { data: [] }, giving a
 * clean 200 for the positive cases without any stub data.
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { createTestUser, cleanupTestUser } from '../helpers/test-utils';

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: (_opts: any) => Promise.resolve() },
}));

jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: {
    uploadImage: jest.fn(async () => ({
      url: 'https://cdn.example.com/test.jpg',
      key: 'test-key',
      size: 1024,
    })),
  },
}));

let adminToken: string;
let adminUserId: string;
let superAdminToken: string;
let superAdminUserId: string;
let userToken: string;
let userUserId: string;

beforeAll(async () => {
  // ADMIN
  const adminReg = await createTestUser();
  adminUserId = adminReg.user.id;
  await prisma.user.update({
    where: { id: adminUserId },
    data: { role: 'ADMIN', status: 'ACTIVE' },
  });
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: adminReg.email, password: adminReg.password, clientType: 'web' });
  if (adminLogin.status !== 200) {
    throw new Error(`Admin login failed (${adminLogin.status}): ${JSON.stringify(adminLogin.body)}`);
  }
  adminToken = adminLogin.body.data.accessToken;

  // SUPER_ADMIN
  const saReg = await createTestUser();
  superAdminUserId = saReg.user.id;
  await prisma.user.update({
    where: { id: superAdminUserId },
    data: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
  });
  const saLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: saReg.email, password: saReg.password, clientType: 'web' });
  if (saLogin.status !== 200) {
    throw new Error(`SUPER_ADMIN login failed (${saLogin.status}): ${JSON.stringify(saLogin.body)}`);
  }
  superAdminToken = saLogin.body.data.accessToken;

  // USER
  const userReg = await createTestUser();
  userUserId = userReg.user.id;
  await prisma.user.update({
    where: { id: userUserId },
    data: { role: 'USER', status: 'ACTIVE' },
  });
  const userLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: userReg.email, password: userReg.password, clientType: 'mobile' });
  if (userLogin.status !== 200) {
    throw new Error(`User login failed (${userLogin.status}): ${JSON.stringify(userLogin.body)}`);
  }
  userToken = userLogin.body.data.accessToken;
}, 30_000);

afterAll(async () => {
  try { await cleanupTestUser(adminUserId); } catch {}
  try { await cleanupTestUser(superAdminUserId); } catch {}
  try { await cleanupTestUser(userUserId); } catch {}
}, 30_000);

describe('INV-RDM-036 — GET /api/stickers/admin/pending-review auth gate', () => {
  const ENDPOINT = '/api/stickers/admin/pending-review';

  it('[AUTH] no Authorization header → 401', async () => {
    const res = await request(app).get(ENDPOINT);
    expect(res.status).toBe(401);
  });

  it('[AUTH] USER role → 403', async () => {
    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it('[POSITIVE] ADMIN role → 200 with success response', async () => {
    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('[POSITIVE] SUPER_ADMIN role → 200 with success response', async () => {
    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
