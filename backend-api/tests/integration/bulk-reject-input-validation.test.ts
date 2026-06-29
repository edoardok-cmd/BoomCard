/**
 * INV-RDM-026: POST /api/stickers/admin/bulk-reject — scanIds + reason both required; max 500 items
 *
 * BC-REDEMPTION-RDM-026-2
 *
 * Validates that the POST /api/stickers/admin/bulk-reject endpoint:
 *   - Returns 400 when scanIds is missing
 *   - Returns 400 when scanIds is an empty array
 *   - Returns 400 when scanIds contains non-string elements
 *   - Returns 400 when scanIds.length > 500
 *   - Returns 400 when reason is missing
 *   - Returns 400 when reason is an empty string
 *   - Returns 400 when reason is whitespace-only
 *   - Returns 200 with success: true for a valid request (non-existent UUIDs
 *     cause per-scan errors internally; the route still responds 200)
 *
 * Runtime: backend on :3025 (NODE_ENV=test, DATABASE_URL=boomcard_test).
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { createTestUser, cleanupTestUser } from '../helpers/test-utils';

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: (_opts: any) => Promise.resolve() },
}));

let adminToken: string;
let adminUserId: string;

const VALID_SCAN_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

beforeAll(async () => {
  const registered = await createTestUser();
  adminUserId = registered.user.id;

  await prisma.user.update({
    where: { id: adminUserId },
    data: { role: 'ADMIN', status: 'ACTIVE' },
  });

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: registered.email, password: registered.password, clientType: 'web' });

  if (loginRes.status !== 200) {
    throw new Error(`Admin login failed (${loginRes.status}): ${JSON.stringify(loginRes.body)}`);
  }

  adminToken = loginRes.body.data.accessToken;
}, 30_000);

afterAll(async () => {
  try { await cleanupTestUser(adminUserId); } catch {}
}, 30_000);

describe('INV-RDM-026 — POST /api/stickers/admin/bulk-reject: scanIds + reason both required; max 500 items', () => {
  it('[INPUT] missing scanIds → 400', async () => {
    const res = await request(app)
      .post('/api/stickers/admin/bulk-reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'fraud' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] empty scanIds array → 400', async () => {
    const res = await request(app)
      .post('/api/stickers/admin/bulk-reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scanIds: [], reason: 'fraud' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] scanIds contains non-strings → 400', async () => {
    const res = await request(app)
      .post('/api/stickers/admin/bulk-reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scanIds: [123, true], reason: 'fraud' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] scanIds.length > 500 → 400', async () => {
    const res = await request(app)
      .post('/api/stickers/admin/bulk-reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scanIds: Array(501).fill('aaaaaaaa-0000-0000-0000-000000000000'), reason: 'fraud' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] missing reason → 400', async () => {
    const res = await request(app)
      .post('/api/stickers/admin/bulk-reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scanIds: [VALID_SCAN_ID] });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] empty reason string → 400', async () => {
    const res = await request(app)
      .post('/api/stickers/admin/bulk-reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scanIds: [VALID_SCAN_ID], reason: '' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] whitespace-only reason → 400', async () => {
    const res = await request(app)
      .post('/api/stickers/admin/bulk-reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scanIds: [VALID_SCAN_ID], reason: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[POSITIVE] valid scanIds + reason → 200', async () => {
    const res = await request(app)
      .post('/api/stickers/admin/bulk-reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scanIds: [VALID_SCAN_ID], reason: 'fraud' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
