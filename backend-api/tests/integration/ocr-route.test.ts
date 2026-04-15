/**
 * Integration Tests: POST /api/receipts/ocr
 *
 * Verifies the route contract: auth, file validation, and response shape.
 * Uses the real Tesseract OCR worker — no mocks. Language data is downloaded
 * on first run and cached by tesseract.js; subsequent runs are fast.
 */

import request from 'supertest';
import path from 'path';
import { app } from '../../src/server';
import { createTestUser, cleanupTestUser, authRequest } from '../helpers/test-utils';

// Real Tesseract can take up to 60 s on first run (language-data download + worker init)
jest.setTimeout(120_000);

const FIXTURE_PNG = path.join(__dirname, '../fixtures/test-receipt.png');

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

  // ─── Auth ─────────────────────────────────────────────────────

  it('returns 401 without authentication', async () => {
    const res = await request(app)
      .post('/api/receipts/ocr')
      .attach('image', FIXTURE_PNG);

    expect(res.status).toBe(401);
  });

  // ─── File validation ──────────────────────────────────────────

  it('returns 400 when no file is provided', async () => {
    const res = await authRequest(accessToken)
      .post('/api/receipts/ocr')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.message).toMatch(/no image file/i);
  });

  // ─── Response contract ─────────────────────────────────────────

  it('returns OCR data with correct response shape', async () => {
    const res = await authRequest(accessToken)
      .post('/api/receipts/ocr')
      .attach('image', FIXTURE_PNG);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);

    const data = res.body.data;

    // Required fields — always present regardless of image content
    expect(typeof data.rawText).toBe('string');
    expect(typeof data.confidence).toBe('number');
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.currency).toBe('string');

    // Optional fields — only set when OCR detects the relevant content
    if ('merchantName' in data) expect(typeof data.merchantName).toBe('string');
    if ('totalAmount' in data) expect(typeof data.totalAmount).toBe('number');
    if ('receiptDate' in data) expect(typeof data.receiptDate).toBe('string');
  });

  // ─── Mobile client contract (OCRResult shape) ─────────────────

  it('response data matches the mobile OCRResult interface', async () => {
    const res = await authRequest(accessToken)
      .post('/api/receipts/ocr')
      .attach('image', FIXTURE_PNG);

    const data = res.body.data;

    // Mobile boomcard-mobile/src/services/ocr.service.ts parseOCRResponse() expects:
    // rawText (string), confidence (number), items (array), currency (string),
    // and optionally merchantName, totalAmount, receiptDate when detectable.
    expect(typeof data.rawText).toBe('string');
    expect(typeof data.confidence).toBe('number');
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.currency).toBe('string');

    if ('merchantName' in data) expect(typeof data.merchantName).toBe('string');
    if ('totalAmount' in data) expect(typeof data.totalAmount).toBe('number');
    if ('receiptDate' in data) expect(typeof data.receiptDate).toBe('string');
  });
});
