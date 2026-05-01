/**
 * Admin Settings Routes
 *
 * GET  /api/admin/settings/cashback-rates             — current effective rate matrix
 * POST /api/admin/settings/cashback-rates             — save new rate set (versioned)
 * GET  /api/admin/settings/cashback-rates/history     — recent rate history
 * GET  /api/admin/settings/payout-thresholds          — current payout threshold per plan
 * PUT  /api/admin/settings/payout-thresholds          — update thresholds (versioned)
 * GET  /api/admin/settings/payout-thresholds/history  — recent threshold history
 * GET  /api/admin/settings/system                     — all key/value system settings
 * PUT  /api/admin/settings/system                     — upsert one or many settings
 * GET  /api/admin/settings/mobile-app                 — G7: structured mobile app settings
 * PUT  /api/admin/settings/mobile-app                 — G7: update mobile app settings
 */

import { Router, Response } from 'express';
import { FraudRuleTier, SubscriptionPlan } from '@prisma/client';
import {
  PAYOUT_THRESHOLD_BASIC_EUR,
  PAYOUT_THRESHOLD_PREMIUM_WEEKLY_EUR,
  PAYOUT_THRESHOLD_PREMIUM_MONTHLY_EUR,
  EUR_TO_BGN_RATE,
} from '../constants/receipt.constants';
import { invalidatePayoutThresholdCache } from '../utils/payoutThreshold';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

/* ─── Cashback Rates ─────────────────────────────────────────────────────── */

/** Resolve admin name/email for a list of user IDs from createdBy fields. */
async function resolveAdminNames(ids: (string | null | undefined)[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))] as string[];
  if (uniqueIds.length === 0) return new Map<string, { name: string | null; email: string | null }>();
  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  return new Map(
    users.map((u) => [
      u.id,
      {
        name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
        email: u.email,
      },
    ])
  );
}

/**
 * GET /api/admin/settings/cashback-rates
 * Returns the latest effective row for each discount step, with author names resolved.
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

    const rows = [5, 10, 15, 20, 25].map((step) => byStep.get(step) ?? null);
    const adminMap = await resolveAdminNames(rows.map((r) => r?.createdBy));

    const current = rows.map((r) => {
      if (!r) return null;
      const admin = r.createdBy ? adminMap.get(r.createdBy) : undefined;
      return { ...r, createdByName: admin?.name ?? null, createdByEmail: admin?.email ?? null };
    });

    res.json({ success: true, data: current });
  })
);

/**
 * GET /api/admin/settings/cashback-rates/history
 * Last 20 saved rate snapshots across all steps, with author names resolved.
 */
router.get(
  '/cashback-rates/history',
  requirePermission('settings.read'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const history = await prisma.cashbackRate.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const adminMap = await resolveAdminNames(history.map((r) => r.createdBy));
    const data = history.map((r) => {
      const admin = r.createdBy ? adminMap.get(r.createdBy) : undefined;
      return { ...r, createdByName: admin?.name ?? null, createdByEmail: admin?.email ?? null };
    });

    res.json({ success: true, data });
  })
);

/**
 * POST /api/admin/settings/cashback-rates
 * Body: { rates: Array<{ discountStep: number; basic: number; premium: number }>, effectiveFrom?: string, notes?: string }
 * Saves a new version of the full rate matrix.
 */
router.post(
  '/cashback-rates',
  requirePermission('settings.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { rates, notes, effectiveFrom } = req.body as {
      rates?: Array<{ discountStep: number; basic: number; premium: number }>;
      notes?: string;
      effectiveFrom?: string;
    };

    if (!Array.isArray(rates) || rates.length === 0) {
      return res.status(400).json({ success: false, error: 'rates array is required' });
    }

    let effectiveDate: Date;
    if (effectiveFrom) {
      effectiveDate = new Date(effectiveFrom);
      if (isNaN(effectiveDate.getTime())) {
        return res.status(400).json({ success: false, error: 'effectiveFrom must be a valid ISO date string' });
      }
    } else {
      effectiveDate = new Date();
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
      if (r.basic > r.discountStep) {
        return res.status(400).json({
          success: false,
          error: `Step ${r.discountStep}%: basic cashback (${r.basic}%) cannot exceed the partner discount — margin would be negative`,
        });
      }
      if (r.premium > r.discountStep) {
        return res.status(400).json({
          success: false,
          error: `Step ${r.discountStep}%: premium cashback (${r.premium}%) cannot exceed the partner discount — margin would be negative`,
        });
      }
    }

    const created = await prisma.$transaction(
      rates.map((r) =>
        prisma.cashbackRate.create({
          data: {
            discountStep: r.discountStep,
            basic: r.basic,
            premium: r.premium,
            effectiveFrom: effectiveDate,
            createdBy: req.user!.id,
            notes: notes ?? null,
          },
        })
      )
    );

    res.json({ success: true, data: created, message: 'Cashback rates saved' });
  })
);

/* ─── Payout Thresholds ───────────────────────────────────────────────────── */

const PLAN_FALLBACK_BGN: Record<SubscriptionPlan, number> = {
  BASIC:   Math.round(PAYOUT_THRESHOLD_BASIC_EUR * EUR_TO_BGN_RATE * 100) / 100,
  LIGHT:   Math.round(PAYOUT_THRESHOLD_PREMIUM_WEEKLY_EUR * EUR_TO_BGN_RATE * 100) / 100,
  PREMIUM: Math.round(PAYOUT_THRESHOLD_PREMIUM_MONTHLY_EUR * EUR_TO_BGN_RATE * 100) / 100,
};

/**
 * GET /api/admin/settings/payout-thresholds
 * Returns the latest payout threshold for each plan.
 * Falls back to the hardcoded constants if no DB record exists.
 */
router.get(
  '/payout-thresholds',
  requirePermission('settings.read'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const plans: SubscriptionPlan[] = ['BASIC', 'LIGHT', 'PREMIUM'];
    const rows = await prisma.payoutThreshold.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const current: Record<string, { minAmount: number; notes: string | null; updatedAt: string | null }> = {};
    for (const plan of plans) {
      const row = rows.find((r) => r.plan === plan);
      current[plan] = {
        minAmount: row ? row.minAmount : PLAN_FALLBACK_BGN[plan],
        notes: row?.notes ?? null,
        updatedAt: row?.createdAt?.toISOString() ?? null,
      };
    }

    res.json({ success: true, data: current });
  })
);

/**
 * GET /api/admin/settings/payout-thresholds/history
 * Last 30 threshold change records, newest first, with creator email resolved.
 */
router.get(
  '/payout-thresholds/history',
  requirePermission('settings.read'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const history = await prisma.payoutThreshold.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    // Resolve admin email for each row (createdBy is a plain user ID string, no Prisma relation)
    const adminIds = [...new Set(history.map((r) => r.createdBy).filter(Boolean))] as string[];
    const admins = adminIds.length
      ? await prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, email: true, firstName: true, lastName: true } })
      : [];
    const adminMap = new Map(admins.map((u) => [u.id, u]));

    const data = history.map((r) => {
      const admin = r.createdBy ? adminMap.get(r.createdBy) : undefined;
      return {
        ...r,
        createdByEmail: admin?.email ?? null,
        createdByName: admin ? [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.email : null,
      };
    });

    res.json({ success: true, data });
  })
);

/**
 * PUT /api/admin/settings/payout-thresholds
 * Body: { thresholds: { BASIC?: number; LIGHT?: number; PREMIUM?: number }, notes?: string }
 * Creates versioned rows for each plan supplied.
 */
router.put(
  '/payout-thresholds',
  requirePermission('settings.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { thresholds, notes } = req.body as {
      thresholds?: Partial<Record<SubscriptionPlan, number>>;
      notes?: string;
    };

    if (!thresholds || typeof thresholds !== 'object' || Object.keys(thresholds).length === 0) {
      return res.status(400).json({ success: false, error: 'thresholds object with at least one plan is required' });
    }

    const validPlans = new Set<string>(['BASIC', 'LIGHT', 'PREMIUM']);
    const entries = Object.entries(thresholds) as [SubscriptionPlan, number][];
    for (const [plan, amount] of entries) {
      if (!validPlans.has(plan)) {
        return res.status(400).json({ success: false, error: `Invalid plan: ${plan}. Must be BASIC, LIGHT, or PREMIUM.` });
      }
      if (typeof amount !== 'number' || amount < 0 || amount > 10000) {
        return res.status(400).json({ success: false, error: `minAmount for ${plan} must be a number between 0 and 10000` });
      }
    }

    const created = await prisma.$transaction(
      entries.map(([plan, amount]) =>
        prisma.payoutThreshold.create({
          data: {
            plan,
            minAmount: Math.round(amount * 100) / 100,
            createdBy: req.user!.id,
            notes: notes ?? null,
          },
        })
      )
    );

    invalidatePayoutThresholdCache();
    res.json({ success: true, data: created, message: 'Payout thresholds saved' });
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
  // spec §9: системни имейли, език, валута, timezone, reply-to настройки
  'reply_to_email',
  'language',
  'currency',
  'timezone',
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
    if (entries.length === 0) {
      return res.status(400).json({ success: false, error: 'settings object must contain at least one key' });
    }
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

/* ─── Mobile App Settings (Spec §9) ─────────────────────────────────────── */

// Keys scoped under the "mobile_app." namespace in SystemSetting
const MOBILE_APP_KEYS = [
  'mobile_app.min_ios_version',
  'mobile_app.min_android_version',
  'mobile_app.ios_status',       // "active" | "maintenance" | "deprecated"
  'mobile_app.android_status',
  'mobile_app.feature_receipt_scan',
  'mobile_app.feature_sticker_scan',
  'mobile_app.feature_partner_map',
  'mobile_app.push_notifications_enabled',
  'mobile_app.push_vapid_topic',
  'mobile_app.error_log_url',
] as const;

type MobileAppKey = (typeof MOBILE_APP_KEYS)[number];

/**
 * GET /api/admin/settings/mobile-app
 * Returns all mobile-app-scoped SystemSetting rows as a structured object.
 */
router.get(
  '/mobile-app',
  requirePermission('settings.read'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: [...MOBILE_APP_KEYS] } },
    });

    const data: Record<string, string | null> = {};
    for (const key of MOBILE_APP_KEYS) {
      data[key] = rows.find((r) => r.key === key)?.value ?? null;
    }

    res.json({ success: true, data });
  })
);

/**
 * PUT /api/admin/settings/mobile-app
 * Body: { settings: Record<string, string> }
 * Only keys in MOBILE_APP_KEYS are accepted.
 */
router.put(
  '/mobile-app',
  requirePermission('settings.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { settings } = req.body as { settings?: Record<string, string> };
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: 'settings object is required' });
    }

    const entries = Object.entries(settings);
    if (entries.length === 0) {
      return res.status(400).json({ success: false, error: 'settings object must contain at least one key' });
    }
    for (const [key] of entries) {
      if (!MOBILE_APP_KEYS.includes(key as MobileAppKey)) {
        return res.status(400).json({
          success: false,
          error: `Unknown mobile-app setting key: "${key}". Allowed: ${MOBILE_APP_KEYS.join(', ')}`,
        });
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

    res.json({ success: true, message: 'Mobile app settings saved' });
  })
);

/* ─── Fraud Rules (spec 7.4) ─────────────────────────────────────────────── */

const VALID_TIERS = new Set(Object.values(FraudRuleTier));

/**
 * GET /api/admin/settings/fraud-rules
 * Query: tier, targetId, active (true|false)
 */
router.get(
  '/fraud-rules',
  requirePermission('settings.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { tier, targetId, active } = req.query as Record<string, string>;

    const where: Parameters<typeof prisma.fraudRule.findMany>[0]['where'] = {};
    if (tier && VALID_TIERS.has(tier as FraudRuleTier)) where.tier = tier as FraudRuleTier;
    if (targetId) where.targetId = targetId;
    if (active !== undefined) where.isActive = active !== 'false';

    const rules = await prisma.fraudRule.findMany({
      where,
      orderBy: [{ tier: 'asc' }, { createdAt: 'desc' }],
      include: { _count: { select: { overrides: true } } },
    });

    res.json({ success: true, data: rules });
  })
);

/**
 * POST /api/admin/settings/fraud-rules
 * Body: { tier, targetId?, dailyScanLimit?, minTransactionValue?, maxTransactionValue?, autoApproveThreshold?, notes? }
 */
router.post(
  '/fraud-rules',
  requirePermission('settings.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { tier, targetId, dailyScanLimit, minTransactionValue, maxTransactionValue, autoApproveThreshold, notes } =
      req.body as {
        tier?: string;
        targetId?: string;
        dailyScanLimit?: number;
        minTransactionValue?: number;
        maxTransactionValue?: number;
        autoApproveThreshold?: number;
        notes?: string;
      };

    if (!tier || !VALID_TIERS.has(tier as FraudRuleTier)) {
      return res.status(400).json({ success: false, error: `tier must be one of: ${[...VALID_TIERS].join(', ')}` });
    }
    if (tier !== 'SYSTEM' && !targetId) {
      return res.status(400).json({ success: false, error: 'targetId is required for non-SYSTEM tier rules' });
    }

    const rule = await prisma.fraudRule.create({
      data: {
        tier: tier as FraudRuleTier,
        targetId: targetId ?? null,
        dailyScanLimit: dailyScanLimit ?? null,
        minTransactionValue: minTransactionValue ?? null,
        maxTransactionValue: maxTransactionValue ?? null,
        autoApproveThreshold: autoApproveThreshold ?? null,
        notes: notes ?? null,
        createdBy: req.user!.id,
      },
    });

    res.status(201).json({ success: true, data: rule });
  })
);

/**
 * PATCH /api/admin/settings/fraud-rules/:id
 */
router.patch(
  '/fraud-rules/:id',
  requirePermission('settings.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { dailyScanLimit, minTransactionValue, maxTransactionValue, autoApproveThreshold, notes, isActive } =
      req.body as {
        dailyScanLimit?: number | null;
        minTransactionValue?: number | null;
        maxTransactionValue?: number | null;
        autoApproveThreshold?: number | null;
        notes?: string | null;
        isActive?: boolean;
      };

    const rule = await prisma.fraudRule.findUnique({ where: { id: req.params.id } });
    if (!rule) return res.status(404).json({ success: false, error: 'Fraud rule not found' });

    const updated = await prisma.fraudRule.update({
      where: { id: req.params.id },
      data: {
        ...(dailyScanLimit !== undefined && { dailyScanLimit }),
        ...(minTransactionValue !== undefined && { minTransactionValue }),
        ...(maxTransactionValue !== undefined && { maxTransactionValue }),
        ...(autoApproveThreshold !== undefined && { autoApproveThreshold }),
        ...(notes !== undefined && { notes }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json({ success: true, data: updated });
  })
);

/**
 * DELETE /api/admin/settings/fraud-rules/:id
 * Soft-deactivates the rule (does not hard-delete to preserve audit trail).
 */
router.delete(
  '/fraud-rules/:id',
  requirePermission('settings.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const rule = await prisma.fraudRule.findUnique({ where: { id: req.params.id } });
    if (!rule) return res.status(404).json({ success: false, error: 'Fraud rule not found' });

    await prisma.fraudRule.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true, message: 'Fraud rule deactivated' });
  })
);

/**
 * GET /api/admin/settings/fraud-rules/:id/overrides
 */
router.get(
  '/fraud-rules/:id/overrides',
  requirePermission('settings.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const rule = await prisma.fraudRule.findUnique({ where: { id: req.params.id } });
    if (!rule) return res.status(404).json({ success: false, error: 'Fraud rule not found' });

    const overrides = await prisma.fraudRuleOverride.findMany({
      where: { ruleId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: overrides });
  })
);

/**
 * POST /api/admin/settings/fraud-rules/:id/overrides
 * Body: { targetType: "user"|"partner", targetId, override: {...}, reason?, expiresAt? }
 */
router.post(
  '/fraud-rules/:id/overrides',
  requirePermission('settings.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { targetType, targetId, override, reason, expiresAt } = req.body as {
      targetType?: string;
      targetId?: string;
      override?: Record<string, unknown>;
      reason?: string;
      expiresAt?: string;
    };

    if (!targetType || !['user', 'partner'].includes(targetType)) {
      return res.status(400).json({ success: false, error: 'targetType must be "user" or "partner"' });
    }
    if (!targetId) return res.status(400).json({ success: false, error: 'targetId is required' });
    if (!override || typeof override !== 'object') {
      return res.status(400).json({ success: false, error: 'override object is required' });
    }

    const rule = await prisma.fraudRule.findUnique({ where: { id: req.params.id } });
    if (!rule) return res.status(404).json({ success: false, error: 'Fraud rule not found' });

    const created = await prisma.fraudRuleOverride.create({
      data: {
        ruleId: req.params.id,
        targetType,
        targetId,
        override: override as Parameters<typeof prisma.fraudRuleOverride.create>[0]['data']['override'],
        reason: reason ?? null,
        createdBy: req.user!.id,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    res.status(201).json({ success: true, data: created });
  })
);

/**
 * DELETE /api/admin/settings/fraud-rules/:id/overrides/:overId
 */
router.delete(
  '/fraud-rules/:id/overrides/:overId',
  requirePermission('settings.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const ov = await prisma.fraudRuleOverride.findFirst({
      where: { id: req.params.overId, ruleId: req.params.id },
    });
    if (!ov) return res.status(404).json({ success: false, error: 'Override not found' });

    await prisma.fraudRuleOverride.delete({ where: { id: req.params.overId } });
    res.json({ success: true, message: 'Override removed' });
  })
);

export default router;
