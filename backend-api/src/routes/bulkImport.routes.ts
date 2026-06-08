/**
 * Bulk Import Routes (Admin only)
 *
 * GET  /api/admin/bulk-import/template  — download XLSX template
 * POST /api/admin/bulk-import           — upload spreadsheet + images
 */

import { Router, Response } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { generateTemplate, importFromSpreadsheet, generatePartnersTemplate, importPartnersFromSpreadsheet } from '../services/bulkImport.service';
import { notificationService } from '../services/notification.service';
import { logger } from '../utils/logger';
import { detach } from '../utils/detach';

const router = Router();

// All routes require admin
router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));

// Multer — memory storage, handle both spreadsheet + images in one request
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,   // 50 MB per file
    files: 201,                    // 1 spreadsheet + up to 200 images
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'application/octet-stream', // some CSV uploads use this MIME type
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ────────────────────────────────────────────────────────────
// GET /api/admin/bulk-import/template
// Download the XLSX import template
// ────────────────────────────────────────────────────────────
router.get(
  '/template',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const buffer = generateTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="boomcard-bulk-import-template.xlsx"');
    res.send(buffer);
  }),
);

// ────────────────────────────────────────────────────────────
// POST /api/admin/bulk-import
// Upload spreadsheet + optional images
//
// multipart/form-data fields:
//   spreadsheet  — CSV or XLSX file (required, filename = partner name)
//   images       — image files (optional, multiple)
// ────────────────────────────────────────────────────────────
router.post(
  '/',
  upload.fields([
    { name: 'spreadsheet', maxCount: 1 },
    { name: 'images', maxCount: 200 },
  ]),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;

    const spreadsheetFiles = files?.['spreadsheet'];
    if (!spreadsheetFiles || spreadsheetFiles.length === 0) {
      return res.status(400).json({ success: false, error: 'A spreadsheet file is required (field: spreadsheet)' });
    }

    const spreadsheetFile = spreadsheetFiles[0];
    const imageFiles = (files?.['images'] ?? []).map((f) => ({
      buffer: f.buffer,
      originalname: f.originalname,
      mimetype: f.mimetype,
    }));

    const adminUserId = req.user!.id;

    try {
      const result = await importFromSpreadsheet(
        {
          buffer: spreadsheetFile.buffer,
          originalname: spreadsheetFile.originalname,
          mimetype: spreadsheetFile.mimetype,
        },
        imageFiles,
        adminUserId,
      );

      // Fire-and-forget admin-ops summary so the import outcome reaches the admin
      // bell without blocking the HTTP response. Non-critical; errors are logged only.
      detach(notificationService.notifyAdminBulkImportComplete({
        kind: 'offers',
        created: result.offersCreated,
        skipped: result.offersSkipped,
        errorCount: result.errors.length,
        importedBy: adminUserId,
      }), (err) => logger.error('Failed to post bulk-import ops summary:', err));

      const statusCode = result.errors.length > 0 ? 207 : 200;
      res.status(statusCode).json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }),
);

// ────────────────────────────────────────────────────────────
// GET /api/admin/bulk-import/template/partners
// Download the multi-partner XLSX template
// ────────────────────────────────────────────────────────────
router.get(
  '/template/partners',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const buffer = generatePartnersTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="boomcard-partners-import-template.xlsx"');
    res.send(buffer);
  }),
);

// ────────────────────────────────────────────────────────────
// POST /api/admin/bulk-import/partners
// Import multiple partners from a spreadsheet
//
// multipart/form-data:
//   spreadsheet — CSV or XLSX (required); filename suffix encodes tier: _basic, _gold, _vip
//   images      — partner logo images (optional, multiple)
//                 naming: {slugified_business_name}_1.jpg, etc.
// ────────────────────────────────────────────────────────────
router.post(
  '/partners',
  upload.fields([
    { name: 'spreadsheet', maxCount: 1 },
    { name: 'images', maxCount: 200 },
  ]),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const spreadsheetFiles = files?.['spreadsheet'];
    if (!spreadsheetFiles || spreadsheetFiles.length === 0) {
      return res.status(400).json({ success: false, error: 'A spreadsheet file is required (field: spreadsheet)' });
    }

    const spreadsheetFile = spreadsheetFiles[0];
    const imageFiles = (files?.['images'] ?? []).map((f) => ({
      buffer: f.buffer,
      originalname: f.originalname,
      mimetype: f.mimetype,
    }));

    const adminUserId = req.user!.id;

    try {
      const result = await importPartnersFromSpreadsheet(
        { buffer: spreadsheetFile.buffer, originalname: spreadsheetFile.originalname, mimetype: spreadsheetFile.mimetype },
        imageFiles,
        adminUserId,
      );

      detach(notificationService.notifyAdminBulkImportComplete({
        kind: 'partners',
        created: result.partnersCreated,
        skipped: result.partnersSkipped,
        errorCount: result.errors.length,
        importedBy: adminUserId,
      }), (err) => logger.error('Failed to post bulk-import ops summary:', err));

      const statusCode = result.errors.length > 0 ? 207 : 200;
      res.status(statusCode).json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }),
);

export default router;
