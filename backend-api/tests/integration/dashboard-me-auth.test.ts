/**
 * INV-RDM-040: GET /api/dashboard/me requires authentication — 401 without token
 *
 * BC-REDEMPTION-RDM-040-3
 *
 * Runtime-verifies the AUTH gate on GET /api/dashboard/me:
 *   - 401 when no Authorization header is present
 *   - 200 when caller has USER role (authenticated; services return empty-state data)
 *
 * Runtime: backend against boomcard_test DB (NODE_ENV=test).
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { createTestUser, cleanupTestUser } from '../helpers/test-utils';

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: {
    uploadImage: jest.fn(async (_params: any) => ({
      url: 'https://cdn.example.com/test-image.jpg',
      key: 'test-key',
      size: 1024,
    })),
  },
}));

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: (_opts: any) => Promise.resolve() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let userToken: string;
let userId: string;

const ENDPOINT = '/api/dashboard/me';

beforeAll(async () => {
  const reg = await createTestUser();
  userId = reg.user.id;
  await prisma.user.update({ where: { id: userId }, data: { role: 'USER', status: 'ACTIVE' } });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: reg.email, password: reg.password, clientType: 'mobile' });
  if (login.status !== 200) {
    throw new Error(`USER login failed (${login.status}): ${JSON.stringify(login.body)}`);
  }
  userToken = login.body.data.accessToken;
}, 30_000);

afterAll(async () => {
  try { await cleanupTestUser(userId); } catch {}
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('INV-RDM-040 — GET /api/dashboard/me authentication gate', () => {
  it('[AUTH] no Authorization header → 401', async () => {
    const res = await request(app).get(ENDPOINT);
    expect(res.status).toBe(401);
  });

  it('[AUTH] valid USER token → 200', async () => {
    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('wallet');
    expect(res.body).toHaveProperty('receipts');
    expect(Array.isArray(res.body.receipts)).toBe(true);
  });
});
