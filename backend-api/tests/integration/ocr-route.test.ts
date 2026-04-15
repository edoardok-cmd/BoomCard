/**
 * Integration Tests: POST /api/receipts/ocr
 *
 * Verifies the route contract: auth, file validation, and response shape.
 * The actual Tesseract worker is mocked to keep tests fast and dependency-free.
 */

import request from 'supertest';
import path from 'path';
import { app } from '../../src/server';
import { createTestUser, cleanupTestUser, authRequest } from '../helpers/test-utils';

const FIXTURE_PNG = path.join(__dirname, '../fixtures/test-receipt.png');

// Mock recognizeReceiptImage so tests don't spin up a real Tesseract worker
jest.mock('../../src/services/ocr.service', () => ({
  recognizeReceiptImage: jest.fn().mockResolvedValue({
    merchantName: 'Test Merchant',
    receiptDate: '2024-01-15',
    totalAmount: 42.5,
    currency: 'BGN',
    items: [{ name: 'Item A', price: 42.5 }],
    confidence: 87,
    rawText: 'Test Merchant\n15.01.2024\nItem A  42,50\nВсичко: 42,50 лв',
  }),
}));

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
    expect(data).toHaveProperty('merchantName');
    expect(data).toHaveProperty('receiptDate');
    expect(data).toHaveProperty('totalAmount');
    expect(data).toHaveProperty('currency');
    expect(data).toHaveProperty('items');
    expect(data).toHaveProperty('confidence');
    expect(data).toHaveProperty('rawText');

    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.confidence).toBe('number');
    expect(typeof data.rawText).toBe('string');
  });

  it('returns the exact OCR values from the service', async () => {
    const res = await authRequest(accessToken)
      .post('/api/receipts/ocr')
      .attach('image', FIXTURE_PNG);

    const data = res.body.data;
    expect(data.merchantName).toBe('Test Merchant');
    expect(data.totalAmount).toBe(42.5);
    expect(data.currency).toBe('BGN');
    expect(data.confidence).toBe(87);
  });

  // ─── Mobile client contract (OCRResult shape) ─────────────────

  it('response data matches the mobile OCRResult interface', async () => {
    const res = await authRequest(accessToken)
      .post('/api/receipts/ocr')
      .attach('image', FIXTURE_PNG);

    const data = res.body.data;

    // Mobile boomcard-mobile/src/services/ocr.service.ts parseOCRResponse() expects:
    // merchantName (string), totalAmount (parseable to float), receiptDate (string),
    // items (array), rawText (string), confidence (parseable to float), currency (string)
    expect(typeof data.merchantName).toBe('string');
    expect(typeof data.totalAmount).toBe('number');
    expect(typeof data.receiptDate).toBe('string');
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.rawText).toBe('string');
    expect(typeof data.confidence).toBe('number');
    expect(typeof data.currency).toBe('string');
  });
});
