/**
 * Admin Settings Routes
 *
 * GET  /api/admin/settings/cashback-rates         — current effective rate matrix
 * POST /api/admin/settings/cashback-rates         — save new rate set (versioned)
 * GET  /api/admin/settings/cashback-rates/history — recent rate history
 * GET  /api/admin/settings/system                 — all key/value system settings
 * PUT  /api/admin/settings/system                 — upsert one or many settings
 */

import { Router, Response } from 'express';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

/* ─── Cashback Rates ─────────────────────────────────────────────────────── */

/**
 * GET /api/admin/settings/cashback-rates
 * Returns the latest effective row for each discount step.
 */
router.get(
  '/cashback-rates',
  requirePermission('settings.read'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const allRates = await prisma.cashbackRate.findMany({
      orderBy: { effectiveFrom: 'desc' },
      take: 50,
    });

    // Latest rate per discount step
    const byStep = new Map<number, (typeof allRates)[0]>();
    for (const r of allRates) {
      if (!byStep.has(r.discountStep)) byStep.set(r.discountStep, r);
    }

    const current = [5, 10, 15, 20, 25].map((step) => byStep.get(step) ?? null);

    res.json({ success: true, data: current });
  })
);

/**
 * GET /api/admin/settings/cashback-rates/history
 * Last 20 saved rate snapshots across all steps.
 */
router.get(
  '/cashback-rates/history',
  requirePermission('settings.read'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const history = await prisma.cashbackRate.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ success: true, data: history });
  })
);

/**
 * POST /api/admin/settings/cashback-rates
 * Body: { rates: Array<{ discountStep: number; basic: number; premium: number }>, notes?: string }
 * Saves a new version of the full rate matrix.
 */
router.post(
  '/cashback-rates',
  requirePermission('settings.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { rates, notes } = req.body as {
      rates?: Array<{ discountStep: number; basic: number; premium: number }>;
      notes?: string;
    };

    if (!Array.isArray(rates) || rates.length === 0) {
      return res.status(400).json({ success: false, error: 'rates array is required' });
    }

    const VALID_STEPS = new Set([5, 10, 15, 20, 25]);
    for (const r of rates) {
      if (!VALID_STEPS.has(r.discountStep)) {
        return res.status(400).json({
          success: false,
          error: `Invalid discount step: ${r.discountStep}. Must be 5, 10, 15, 20 or 25.`,
        });
      }
      if (typeof r.basic !== 'number' || r.basic < 0 || r.basic > 100) {
        return res.status(400).json({ success: false, error: 'basic must be 0–100' });
      }
      if (typeof r.premium !== 'number' || r.premium < 0 || r.premium > 100) {
        return res.status(400).json({ success: false, error: 'premium must be 0–100' });
      }
    }

    const now = new Date();
    const created = await prisma.$transaction(
      rates.map((r) =>
        prisma.cashbackRate.create({
          data: {
            discountStep: r.discountStep,
            basic: r.basic,
            premium: r.premium,
            effectiveFrom: now,
            createdBy: req.user!.id,
            notes: notes ?? null,
          },
        })
      )
    );

    res.json({ success: true, data: created, message: 'Cashback rates saved' });
  })
);

/* ─── System Settings ─────────────────────────────────────────────────────── */

const ALLOWED_KEYS = new Set([
  'cashback_expiry_days',
  'offer_validity_days',
  'min_ios_version',
  'min_android_version',
  'maintenance_mode',
  'maintenance_message',
  'max_fraud_score',
  'auto_approve_threshold',
  'daily_scan_limit_default',
  'max_cashback_per_month',
  'support_email',
  'support_phone',
]);

/**
 * GET /api/admin/settings/system
 */
router.get(
  '/system',
  requirePermission('settings.read'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const settings = await prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value;
    res.json({ success: true, data: map });
  })
);

/**
 * PUT /api/admin/settings/system
 * Body: { settings: Record<string, string> }
 */
router.put(
  '/system',
  requirePermission('settings.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { settings } = req.body as { settings?: Record<string, string> };
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: 'settings object is required' });
    }

    const entries = Object.entries(settings);
    for (const [key] of entries) {
      if (!ALLOWED_KEYS.has(key)) {
        return res.status(400).json({ success: false, error: `Unknown setting key: ${key}` });
      }
    }

    await prisma.$transaction(
      entries.map(([key, value]) =>
        prisma.systemSetting.upsert({
          where: { key },
          create: { key, value, updatedBy: req.user!.id },
          update: { value, updatedBy: req.user!.id },
        })
      )
    );

    res.json({ success: true, message: 'Settings saved' });
  })
);

export default router;
