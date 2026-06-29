/**
 * INV-RDM-025: POST /api/stickers/admin/bulk-approve — scanIds must be a
 * non-empty string array; max 500 items.
 *
 * BC-REDEMPTION-RDM-025
 *
 * Validates that the POST /api/stickers/admin/bulk-approve endpoint:
 *   - Returns 401 when no Authorization header is present
 *   - Returns 400 when scanIds is missing (no body)
 *   - Returns 400 when scanIds is null
 *   - Returns 400 when scanIds is a string (not an array)
 *   - Returns 400 when scanIds is an empty array
 *   - Returns 400 when scanIds contains non-string elements
 *   - Returns 400 when scanIds.length > 500
 *   - Returns 200 for a valid request with exactly 500 string IDs
 *   - Returns 200 for a valid request with 1 string ID
 *
 * stickerService.bulkApprove is mocked so the positive-case tests do not
 * require real scan records in the DB.
 *
 * Runtime: backend against boomcard_test DB (NODE_ENV=test).
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { createTestUser, cleanupTestUser } from '../helpers/test-utils';

// ─── Module mocks (must be top-level, before any imports that load the module) ─

jest.mock('../../src/services/sticker.service', () => {
  const original = jest.requireActual('../../src/services/sticker.service');
  return {
    ...original,
    stickerService: {
      ...original.stickerService,
      bulkApprove: jest.fn(async (_scanIds: string[], _actor: string | null) => ({
        successCount: _scanIds.length,
        errorCount: 0,
        errors: [],
      })),
    },
  };
});

jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: {
    uploadImage: jest.fn(async (_params: any) => ({
      url: `https://cdn.example.com/test-${Math.random().toString(36).slice(2)}.jpg`,
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
let userToken: string;
let userUserId: string;

beforeAll(async () => {
  const adminRegistered = await createTestUser();
  adminUserId = adminRegistered.user.id;

  await prisma.user.update({
    where: { id: adminUserId },
    data: { role: 'ADMIN', status: 'ACTIVE' },
  });

  const adminLoginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: adminRegistered.email, password: adminRegistered.password, clientType: 'web' });

  if (adminLoginRes.status !== 200) {
    throw new Error(`Admin login failed (${adminLoginRes.status}): ${JSON.stringify(adminLoginRes.body)}`);
  }

  adminToken = adminLoginRes.body.data.accessToken;

  const userRegistered = await createTestUser();
  userUserId = userRegistered.user.id;

  await prisma.user.update({
    where: { id: userUserId },
    data: { role: 'USER', status: 'ACTIVE' },
  });

  const userLoginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: userRegistered.email, password: userRegistered.password, clientType: 'mobile' });

  if (userLoginRes.status !== 200) {
    throw new Error(`User login failed (${userLoginRes.status}): ${JSON.stringify(userLoginRes.body)}`);
  }

  userToken = userLoginRes.body.data.accessToken;
}, 30_000);

afterAll(async () => {
  try { await cleanupTestUser(adminUserId); } catch {}
  try { await cleanupTestUser(userUserId); } catch {}
}, 30_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('INV-RDM-025 — POST /api/stickers/admin/bulk-approve input validation', () => {
  const ENDPOINT = '/api/stickers/admin/bulk-approve';

  // Helper: build a string array of `n` fake scan IDs
  const fakeScanIds = (n: number): string[] =>
    Array.from({ length: n }, (_, i) =>
      `aaaaaaaa-0000-0000-0000-${String(i).padStart(12, '0')}`,
    );

  // ── AUTH guard ──────────────────────────────────────────────────────────────

  it('[AUTH] no Authorization header → 401', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .send({ scanIds: ['aaaaaaaa-0000-0000-0000-000000000001'] });
    expect(res.status).toBe(401);
  });

  it('[AUTH] authenticated USER role (not ADMIN/SUPER_ADMIN) → 403', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ scanIds: ['aaaaaaaa-0000-0000-0000-000000000001'] });
    expect(res.status).toBe(403);
  });

  // ── INPUT rejections ────────────────────────────────────────────────────────

  it('[INPUT] no body (scanIds missing) → 400', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] scanIds is null → 400', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scanIds: null });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] scanIds is a string (not an array) → 400', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scanIds: 'aaaaaaaa-0000-0000-0000-000000000001' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] scanIds is an empty array → 400', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scanIds: [] });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] scanIds contains non-string elements → 400', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scanIds: [1, 2, 3] });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] scanIds has 501 items (exceeds 500 limit) → 400', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scanIds: fakeScanIds(501) });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // ── POSITIVE cases ──────────────────────────────────────────────────────────

  it('[POSITIVE] scanIds has exactly 500 items (boundary) → 200', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scanIds: fakeScanIds(500) });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.successCount).toBe(500);
    expect(res.body.errorCount).toBe(0);
  });

  it('[POSITIVE] scanIds has 1 valid string item → 200', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scanIds: ['aaaaaaaa-0000-0000-0000-000000000001'] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.successCount).toBe(1);
    expect(res.body.errorCount).toBe(0);
  });
});
