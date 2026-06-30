/**
 * Mobile App Config Routes — public, no auth required.
 *
 * GET  /api/config/mobile  — current feature flags, platform status, min versions
 * POST /api/mobile/errors  — client-side error ingest from the native/web app
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import { asyncHandler } from '../middleware/error.middleware';

const configRouter = Router();
const errorsRouter = Router();

// Keys exposed publicly (subset of mobile_app.*).
// error_log_url is intentionally public so the app can forward errors to an
// external service (Sentry/Datadog) configured by the admin.
const PUBLIC_MOBILE_KEYS = [
  'mobile_app.min_ios_version',
  'mobile_app.min_android_version',
  'mobile_app.ios_status',
  'mobile_app.android_status',
  'mobile_app.feature_receipt_scan',
  'mobile_app.feature_sticker_scan',
  'mobile_app.feature_partner_map',
  'mobile_app.push_notifications_enabled',
  'mobile_app.error_log_url',
] as const;

/**
 * GET /api/config/mobile
 * Returns mobile app config for consumption by the Expo app.
 * No authentication required — cached aggressively by CDN.
 */
configRouter.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: [...PUBLIC_MOBILE_KEYS] } },
    });

    const map: Record<string, string | null> = {};
    for (const key of PUBLIC_MOBILE_KEYS) {
      map[key] = rows.find((r) => r.key === key)?.value ?? null;
    }

    const data = {
      versions: {
        minIos:     map['mobile_app.min_ios_version'],
        minAndroid: map['mobile_app.min_android_version'],
      },
      status: {
        ios:     map['mobile_app.ios_status']     ?? 'active',
        android: map['mobile_app.android_status'] ?? 'active',
      },
      features: {
        receiptScan: map['mobile_app.feature_receipt_scan']  !== 'false',
        stickerScan: map['mobile_app.feature_sticker_scan']  !== 'false',
        partnerMap:  map['mobile_app.feature_partner_map']   !== 'false',
      },
      pushEnabled: map['mobile_app.push_notifications_enabled'] !== 'false',
      // null means external error forwarding is not configured
      errorLogUrl: map['mobile_app.error_log_url'] || null,
    };

    // Allow CDN / proxy caching for 60 s; stale-while-revalidate 300 s
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ success: true, data });
  })
);

// Strict rate-limit on error ingest to prevent abuse
const errorIngestLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many error reports. Please slow down.' },
  skip: () => process.env.NODE_ENV === 'development',
});

const VALID_PLATFORMS = new Set(['ios', 'android', 'web']);
const VALID_ERROR_TYPES = new Set(['crash', 'api_error', 'render_error', 'network_error', 'unknown']);

/**
 * POST /api/mobile/errors
 * Body: { platform, appVersion?, errorType, message, stack? }
 * Stores the error for admin review at /admin/settings/mobile.
 */
errorsRouter.post(
  '/',
  errorIngestLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { platform, appVersion, errorType, message, stack } = req.body as {
      platform?: string;
      appVersion?: string;
      errorType?: string;
      message?: string;
      stack?: string;
    };

    if (!platform || !VALID_PLATFORMS.has(platform)) {
      return res.status(400).json({
        success: false,
        error: `platform must be one of: ${[...VALID_PLATFORMS].join(', ')}`,
      });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }
    // Null bytes cause pg 22021 DriverAdapterError — reject early as 400.
    if (message.includes('\x00')) {
      return res.status(400).json({ success: false, error: 'Invalid characters in message' });
    }
    // Optional fields are stringified below (.trim()/.slice); a truthy non-string
    // would throw TypeError → unmapped 500 + stack leak. Reject as 400 (malformed
    // client input → 4xx, never 5xx). undefined/null stays allowed (optional).
    if (appVersion !== undefined && appVersion !== null && typeof appVersion !== 'string') {
      return res.status(400).json({ success: false, error: 'appVersion must be a string' });
    }
    if (stack !== undefined && stack !== null && typeof stack !== 'string') {
      return res.status(400).json({ success: false, error: 'stack must be a string' });
    }
    const resolvedType = errorType && VALID_ERROR_TYPES.has(errorType) ? errorType : 'unknown';

    await prisma.mobileErrorLog.create({
      data: {
        platform,
        appVersion: appVersion?.trim().slice(0, 64) || null,
        errorType: resolvedType,
        message: message.trim().slice(0, 2000),
        stack: stack ? stack.trim().slice(0, 10_000) : null,
      },
    });

    res.status(201).json({ success: true });
  })
);

export { configRouter as mobileConfigRouter, errorsRouter as mobileErrorsRouter };
