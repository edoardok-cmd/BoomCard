/**
 * BC-ADMIN-SPEC-REAUDIT9-BULKIMPORT-MIME-500-1
 *
 * Covers two fixes:
 *
 * INV-IMPORT-003/007 (MEDIUM): fileFilter was calling cb(new Error(...)) — a plain
 * Error that the error middleware did not match, falling through to the default 500.
 * Fix: use AppError(msg, 400) so the errorHandler's AppError branch returns 400.
 *
 * LOW: importFromSpreadsheet passed `description: undefined` to Prisma when
 * offer_description was absent, leaking a raw PrismaClientValidationError message.
 * Fix: validate before Prisma and push a clean human-readable error.
 */

import express from 'express';
import multer from 'multer';
import request from 'supertest';
import * as XLSX from 'xlsx';

// ── Auth mock (must be before route import) ──────────────────────────────────

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'admin-user-1', role: 'ADMIN' };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));

// ── Prisma + service mocks ────────────────────────────────────────────────────

const mockOfferCreate = jest.fn();
const mockPartnerFindUnique = jest.fn();
const mockUserFindFirst = jest.fn();
const mockUserCreate = jest.fn();
const mockPartnerCreate = jest.fn();

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    offer: { create: (...a: unknown[]) => mockOfferCreate(...a) },
    partner: {
      findUnique: (...a: unknown[]) => mockPartnerFindUnique(...a),
      create: (...a: unknown[]) => mockPartnerCreate(...a),
    },
    user: {
      findFirst: (...a: unknown[]) => mockUserFindFirst(...a),
      create: (...a: unknown[]) => mockUserCreate(...a),
    },
  },
}));

jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: { uploadImage: jest.fn() },
}));

jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyAdminBulkImportComplete: jest.fn().mockResolvedValue(undefined),
    notifyPartnerWelcome: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
}));

jest.mock('@prisma/client', () => ({
  OfferStatus: { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE', SCHEDULED: 'SCHEDULED', EXPIRED: 'EXPIRED', DRAFT: 'DRAFT' },
  OfferType: { DISCOUNT: 'DISCOUNT', CASHBACK: 'CASHBACK', POINTS: 'POINTS', COMBO: 'COMBO' },
  PartnerStatus: { ACTIVE: 'ACTIVE', PENDING: 'PENDING', SUSPENDED: 'SUSPENDED', INACTIVE: 'INACTIVE', REJECTED: 'REJECTED' },
}));

jest.mock('../../src/constants/receipt.constants', () => ({
  CASHBACK_MATRIX_STEPS: [5, 10, 15, 20, 25, 30],
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import bulkImportRouter from '../../src/routes/bulkImport.routes';
import { errorHandler } from '../../src/middleware/error.middleware';
import { importFromSpreadsheet } from '../../src/services/bulkImport.service';

// ── Test app ──────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use('/api/admin/bulk-import', bulkImportRouter);
  app.use(errorHandler);
  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeXlsxBuffer(headers: string[], rows: string[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

const OFFER_HEADERS = [
  'partner_name_bg', 'partner_category', 'partner_categories',
  'partner_description', 'partner_description_bg',
  'partner_website', 'partner_phone', 'partner_email',
  'partner_address', 'partner_city', 'partner_region',
  'partner_latitude', 'partner_longitude',
  'partner_opening_hours', 'partner_discount_rate', 'partner_type_name', 'partner_status',
  'offer_title', 'offer_title_bg', 'offer_description', 'offer_description_bg',
  'offer_type', 'offer_discount_percent', 'offer_discount_amount',
  'offer_cashback_percent', 'offer_points_multiplier',
  'offer_min_purchase', 'offer_max_discount',
  'offer_terms', 'offer_terms_bg', 'offer_tags',
  'offer_status', 'offer_is_featured', 'offer_start_date', 'offer_end_date', 'offer_usage_limit',
];

function makeOfferRow(overrides: Record<string, string> = {}): string[] {
  const defaults: Record<string, string> = {
    partner_name_bg: 'Тест Партньор',
    partner_category: 'RESTAURANT',
    partner_categories: '',
    partner_description: 'Good food',
    partner_description_bg: '',
    partner_website: '',
    partner_phone: '+359 88 000 0000',
    partner_email: 'partner@test.com',
    partner_address: '1 Main St',
    partner_city: 'Sofia',
    partner_region: '',
    partner_latitude: '',
    partner_longitude: '',
    partner_opening_hours: '',
    partner_discount_rate: '10',
    partner_type_name: '',
    partner_status: 'ACTIVE',
    offer_title: 'Test Offer',
    offer_title_bg: '',
    offer_description: '20% off',
    offer_description_bg: '',
    offer_type: 'DISCOUNT',
    offer_discount_percent: '20',
    offer_discount_amount: '',
    offer_cashback_percent: '',
    offer_points_multiplier: '',
    offer_min_purchase: '',
    offer_max_discount: '',
    offer_terms: '',
    offer_terms_bg: '',
    offer_tags: '',
    offer_status: 'ACTIVE',
    offer_is_featured: 'false',
    offer_start_date: '2026-01-01',
    offer_end_date: '2026-12-31',
    offer_usage_limit: '',
  };
  const merged = { ...defaults, ...overrides };
  return OFFER_HEADERS.map((h) => merged[h] ?? '');
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests: MIME type rejection → 400, not 500 ─────────────────────────────────

describe('INV-IMPORT-003/007: unsupported MIME type → 400 (not 500)', () => {
  let app: express.Express;
  beforeAll(() => { app = buildApp(); });

  it('POST /api/admin/bulk-import — application/json file → 400', async () => {
    const res = await request(app)
      .post('/api/admin/bulk-import')
      .attach('spreadsheet', Buffer.from('{}'), {
        filename: 'import.json',
        contentType: 'application/json',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unsupported file type/i);
    // Must never be a 500
    expect(res.status).not.toBe(500);
  });

  it('POST /api/admin/bulk-import/partners — application/json file → 400', async () => {
    const res = await request(app)
      .post('/api/admin/bulk-import/partners')
      .attach('spreadsheet', Buffer.from('{}'), {
        filename: 'import.json',
        contentType: 'application/json',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unsupported file type/i);
    expect(res.status).not.toBe(500);
  });

  it('application/octet-stream is accepted (CSV fallback MIME)', async () => {
    // Sending a minimal XLSX as octet-stream must NOT be rejected by fileFilter
    const xlsxBuf = makeXlsxBuffer(OFFER_HEADERS, [makeOfferRow()]);
    // Mock partner/user so import can proceed
    mockUserFindFirst.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({ id: 'u1' });
    mockPartnerFindUnique.mockResolvedValue(null);
    mockPartnerCreate.mockResolvedValue({ id: 'p1' });
    mockOfferCreate.mockResolvedValue({ id: 'o1' });

    const res = await request(app)
      .post('/api/admin/bulk-import')
      .attach('spreadsheet', xlsxBuf, {
        filename: 'TestPartner.xlsx',
        contentType: 'application/octet-stream',
      });

    // The multer filter must pass the file; import proceeds → 200 (one offer created)
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── Tests: offer_description validation → clean error, no Prisma raw message ──

describe('LOW fix: missing offer_description → clean error, no raw Prisma message', () => {
  function makeSpreadsheetFile(rows: string[][]): { buffer: Buffer; originalname: string; mimetype: string } {
    return {
      buffer: makeXlsxBuffer(OFFER_HEADERS, rows),
      originalname: 'TestPartner.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  function setupImportMocks() {
    mockUserFindFirst.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({ id: 'u1' });
    mockPartnerFindUnique.mockResolvedValue(null);
    mockPartnerCreate.mockResolvedValue({ id: 'p1' });
    mockOfferCreate.mockResolvedValue({ id: 'o1' });
  }

  it('row with missing offer_description is skipped with a human-readable error', async () => {
    setupImportMocks();
    const file = makeSpreadsheetFile([makeOfferRow({ offer_description: '' })]);

    const result = await importFromSpreadsheet(file, [], 'admin-1');

    expect(result.offersSkipped).toBe(1);
    expect(result.offersCreated).toBe(0);
    // Error message must be human-readable, NOT a raw Prisma error string
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/offer_description/i);
    expect(result.errors[0]).not.toMatch(/Argument/);           // Prisma validation leak
    expect(result.errors[0]).not.toMatch(/PrismaClient/);       // Prisma class name leak
    // Prisma.offer.create must NOT have been called for this row
    expect(mockOfferCreate).not.toHaveBeenCalled();
  });

  it('row with present offer_description proceeds to Prisma normally', async () => {
    setupImportMocks();
    const file = makeSpreadsheetFile([makeOfferRow({ offer_description: '20% off' })]);

    const result = await importFromSpreadsheet(file, [], 'admin-1');

    expect(result.offersCreated).toBe(1);
    expect(result.offersSkipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockOfferCreate).toHaveBeenCalledTimes(1);
    // description must be the value from the spreadsheet, not undefined
    const callArg = mockOfferCreate.mock.calls[0][0];
    expect(callArg.data.description).toBe('20% off');
  });
});
