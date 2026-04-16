/**
 * Integration Tests: POST /api/receipts/ocr
 *
 * The direct OCR endpoint has been retired as part of fraud hardening.
 * OCR processing now happens within the sticker scan flow.
 * These tests verify the retirement response is correct.
 */

import request from 'supertest';
import { app } from '../../src/server';
import { createTestUser, cleanupTestUser, authRequest } from '../helpers/test-utils';

describe('POST /api/receipts/ocr', () => {
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    const testData = await createTestUser();
    accessToken = testData.accessToken;
    userId = testData.user.id;
  });

  afterAll(async () => {
    await cleanupTestUser(userId);
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app)
      .post('/api/receipts/ocr')
      .send({});

    expect(res.status).toBe(401);
  });

  it('returns 410 GONE — endpoint retired', async () => {
    const res = await authRequest(accessToken)
      .post('/api/receipts/ocr')
      .send({});

    expect(res.status).toBe(410);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.code).toBe('ENDPOINT_RETIRED');
  });
});
