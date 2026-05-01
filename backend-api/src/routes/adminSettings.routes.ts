/**
 * Admin Settings Routes
 *
 * GET    /api/admin/settings/cashback-rates                          — current effective rate matrix
 * POST   /api/admin/settings/cashback-rates                          — save new rate set (versioned)
 * GET    /api/admin/settings/payout-thresholds                       — current payout threshold per plan
 * PUT    /api/admin/settings/payout-thresholds                       — update thresholds (versioned)
 * GET    /api/admin/settings/payout-thresholds/history               — recent threshold history
 * GET    /api/admin/settings/system                                  — all key/value system settings
 * PUT    /api/admin/settings/system                                  — upsert one or many settings
 * GET    /api/admin/settings/mobile-app                              — structured mobile app settings
 * PUT    /api/admin/settings/mobile-app                              — update mobile app settings
 * GET    /api/admin/settings/mobile-errors                           — last 50 mobile error log entries
 * DELETE /api/admin/settings/mobile-errors                           — clear all mobile error log entries
 * GET    /api/admin/settings/fraud-rules                             — list fraud rules (filterable)
 * POST   /api/admin/settings/fraud-rules                             — create fraud rule
 * PATCH  /api/admin/settings/fraud-rules/:id                         — update fraud rule
 * DELETE /api/admin/settings/fraud-rules/:id                         — soft-deactivate fraud rule
 * GET    /api/admin/settings/fraud-rules/:id/overrides               — list overrides for a rule
 * POST   /api/admin/settings/fraud-rules/:id/overrides               — add override to a rule
 * DELETE /api/admin/settings/fraud-rules/:id/overrides/:overId       — remove an override
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
import { invalidateSystemSettingCache } from '../utils/systemSettings';
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
    const now = new Date();
    const allRates = await prisma.cashbackRate.findMany({
      where: { effectiveFrom: { lte: now } },
      orderBy: { effectiveFrom: 'desc' },
      take: 50,
    });

    // Latest effective rate per discount step (past/present only — excludes future-scheduled rows)
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
    const rows = await Promise.all(
      plans.map((plan) =>
        prisma.payoutThreshold.findFirst({ where: { plan }, orderBy: { createdAt: 'desc' } })
      )
    );

    const current: Record<string, { minAmount: number; notes: string | null; updatedAt: string | null }> = {};
    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      const row = rows[i];
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
      if (typeof amount !== 'number' || isNaN(amount) || amount < 0 || amount > 10000) {
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
  'from_email',
  'sender_name',
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

    const ALLOWED_CURRENCIES = new Set(['BGN', 'EUR']);
    const ALLOWED_LANGUAGES = new Set(['bg', 'en']);
    for (const [key, value] of entries) {
      if (key === 'currency' && !ALLOWED_CURRENCIES.has(value)) {
        return res.status(400).json({ success: false, error: `currency must be one of: ${[...ALLOWED_CURRENCIES].join(', ')}` });
      }
      if (key === 'language' && !ALLOWED_LANGUAGES.has(value)) {
        return res.status(400).json({ success: false, error: `language must be one of: ${[...ALLOWED_LANGUAGES].join(', ')}` });
      }
    }

    // Simple RFC 5321-compatible email check (not exhaustive, but catches common mistakes).
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const [key, value] of entries) {
      if ((key === 'from_email' || key === 'reply_to_email') && value !== '') {
        if (!EMAIL_RE.test(value)) {
          return res.status(400).json({
            success: false,
            error: `${key} must be a valid email address`,
          });
        }
      }
    }

    const INTEGER_RANGE_KEYS: Record<string, { min: number; max: number }> = {
      cashback_expiry_days:    { min: 1,   max: 3650 },
      offer_validity_days:     { min: 1,   max: 3650 },
      max_fraud_score:         { min: 0,   max: 100  },
      // auto_approve_threshold is a fraud-score warning threshold (0–100), not a monetary amount.
      // receipt.service.ts emits a warning when recomputed fraud score exceeds this value after
      // an admin corrects a receipt amount.
      auto_approve_threshold:  { min: 0,   max: 100  },
      daily_scan_limit_default:{ min: 1,   max: 10000 },
      // min: 1 intentionally excludes 0 — storing 0 would zero-cap all cashback for every user.
      // Send '' to remove the cap (delete the row) — the service falls back to DEFAULT_MAX_CASHBACK_PER_MONTH.
      max_cashback_per_month:  { min: 1,   max: 100000 },
    };
    // These keys must be whole numbers (counts, days, or integer scores).
    const INTEGER_ONLY_KEYS = new Set([
      'cashback_expiry_days',
      'offer_validity_days',
      'daily_scan_limit_default',
      'max_fraud_score',
      'auto_approve_threshold',
    ]);
    // Sending '' for these keys deletes the DB row so services fall back to hardcoded defaults.
    const CLEARABLE_KEYS = new Set([
      'cashback_expiry_days',
      'offer_validity_days',
      'daily_scan_limit_default',
      'max_cashback_per_month',
    ]);
    for (const [key, value] of entries) {
      if (key === 'maintenance_mode' && value !== 'true' && value !== 'false') {
        return res.status(400).json({ success: false, error: 'maintenance_mode must be "true" or "false"' });
      }
      // Empty string on a clearable key means "delete the row" — skip numeric validation.
      if (CLEARABLE_KEYS.has(key) && value === '') continue;
      const range = INTEGER_RANGE_KEYS[key];
      if (range) {
        const parsed = parseFloat(value);
        if (!Number.isFinite(parsed) || parsed < range.min || parsed > range.max) {
          return res.status(400).json({
            success: false,
            error: `${key} must be a number between ${range.min} and ${range.max}`,
          });
        }
        if (INTEGER_ONLY_KEYS.has(key) && !Number.isInteger(parsed)) {
          return res.status(400).json({
            success: false,
            error: `${key} must be a whole number`,
          });
        }
      }
    }

    // Split entries: clearable keys with '' value are deleted; everything else is upserted.
    const toDelete = entries.filter(([k, v]) => CLEARABLE_KEYS.has(k) && v === '').map(([k]) => k);
    const toUpsert = entries.filter(([k, v]) => !(CLEARABLE_KEYS.has(k) && v === ''));

    await prisma.$transaction([
      ...(toDelete.length ? [prisma.systemSetting.deleteMany({ where: { key: { in: toDelete } } })] : []),
      ...toUpsert.map(([key, value]) =>
        prisma.systemSetting.upsert({
          where: { key },
          create: { key, value, updatedBy: req.user!.id },
          update: { value, updatedBy: req.user!.id },
        })
      ),
    ]);

    for (const [key] of entries) invalidateSystemSettingCache(key);

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
const SEMVER_RE = /^\d+\.\d+(\.\d+)?$/;
const VERSION_MOBILE_KEYS = new Set(['mobile_app.min_ios_version', 'mobile_app.min_android_version']);
const PLATFORM_STATUS_VALUES = new Set(['active', 'maintenance', 'deprecated']);
const PLATFORM_STATUS_KEYS = new Set(['mobile_app.ios_status', 'mobile_app.android_status']);
const BOOL_MOBILE_KEYS = new Set([
  'mobile_app.feature_receipt_scan',
  'mobile_app.feature_sticker_scan',
  'mobile_app.feature_partner_map',
  'mobile_app.push_notifications_enabled',
]);

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
    for (const [key, value] of entries) {
      if (!MOBILE_APP_KEYS.includes(key as MobileAppKey)) {
        return res.status(400).json({
          success: false,
          error: `Unknown mobile-app setting key: "${key}". Allowed: ${MOBILE_APP_KEYS.join(', ')}`,
        });
      }
      if (VERSION_MOBILE_KEYS.has(key) && value !== '' && !SEMVER_RE.test(value)) {
        return res.status(400).json({
          success: false,
          error: `${key} must be a version string like "2.1.0" or empty (no minimum)`,
        });
      }
      if (PLATFORM_STATUS_KEYS.has(key) && !PLATFORM_STATUS_VALUES.has(value)) {
        return res.status(400).json({
          success: false,
          error: `${key} must be one of: ${[...PLATFORM_STATUS_VALUES].join(', ')}`,
        });
      }
      if (BOOL_MOBILE_KEYS.has(key) && value !== 'true' && value !== 'false') {
        return res.status(400).json({
          success: false,
          error: `${key} must be "true" or "false"`,
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

    for (const [key] of entries) invalidateSystemSettingCache(key);

    res.json({ success: true, message: 'Mobile app settings saved' });
  })
);

/* ─── Mobile Error Logs (spec §9 "основни грешки") ─────────────────────── */

/**
 * GET /api/admin/settings/mobile-errors
 * Returns the 50 most recent mobile error log entries for admin review.
 */
router.get(
  '/mobile-errors',
  requirePermission('settings.read'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const errors = await prisma.mobileErrorLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        platform: true,
        appVersion: true,
        errorType: true,
        message: true,
        stack: true,
        createdAt: true,
      },
    });

    res.json({ success: true, data: errors });
  })
);

/**
 * DELETE /api/admin/settings/mobile-errors
 * Clears all mobile error log entries (truncate).
 */
router.delete(
  '/mobile-errors',
  requirePermission('settings.write'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const { count } = await prisma.mobileErrorLog.deleteMany({});
    res.json({ success: true, message: `Cleared ${count} error log entries` });
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
