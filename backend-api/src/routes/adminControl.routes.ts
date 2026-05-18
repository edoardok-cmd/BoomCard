/**
 * Admin Control Routes
 *
 * GET  /api/admin/control/security                    — security-focused AuditLog viewer
 * GET  /api/admin/control/disputes                    — receipts in MANUAL_REVIEW status
 * POST /api/admin/control/disputes/:id/approve        — approve a disputed receipt
 * POST /api/admin/control/disputes/:id/reject         — reject a disputed receipt
 * GET  /api/admin/control/risk-queue                  — G4: receipts by fraudScore risk tier
 * GET  /api/admin/control/dispute-cases               — G5: dispute case list
 * POST /api/admin/control/dispute-cases               — G5: create dispute case from receipt
 * GET  /api/admin/control/dispute-cases/:id           — G5: dispute case detail
 * PATCH /api/admin/control/dispute-cases/:id          — G5: advance status / set decision
 * POST  /api/admin/control/dispute-cases/:id/notes    — G5: add note to dispute
 * GET   /api/admin/control/dispute-cases/:id/notes    — G5: list notes on dispute
 * GET  /api/admin/control/receipt-templates           — G6: list VenueReceiptTemplates
 * POST /api/admin/control/receipt-templates           — G6: create template
 * PATCH /api/admin/control/receipt-templates/:id      — G6: update template metadata
 * DELETE /api/admin/control/receipt-templates/:id     — G6: deactivate template
 */

import { Router, Response } from 'express';
import { DisputeStatus, DisputeSubjectType, ScanStatus } from '@prisma/client';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.middleware';
import { auditMiddleware, writeAudit } from '../middleware/audit.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { prisma } from '../lib/prisma';
import { receiptService } from '../services/receipt.service';
import { stickerService } from '../services/sticker.service';
import { ACTIVE_SCAN_STATUSES } from '../services/adminAlerts.service';
import { DEFAULT_CORRECTION_WARNING_THRESHOLD } from '../constants/receipt.constants';
import { getSystemSettingFloat } from '../utils/systemSettings';

const router = Router();

router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

/* ─── Security Audit Log ─────────────────────────────────────────────────── */

// Prefixes must match the objectType strings that deriveActionAndObject() actually writes to
// the DB — i.e. post-normalisation values from OBJECT_TYPE_NORMALIZE in audit.middleware.ts.
// Plurals ('admins', 'disputes', …) and hyphenated keys ('dispute-cases', 'risk-queue', …)
// are all normalised before the action string is persisted, so the prefixes here use the
// normalised forms.
const SECURITY_ACTION_PREFIXES = [
  'auth.',             // login / logout / 2FA events (written by writeAudit in auth.routes.ts)
  'admin.',            // admin create / update / approve / delete  ('admins' → 'admin')
  'partner.',          // partner approve / reject / suspend        ('partners' → 'partner')
  'subscriber.',       // subscriber update / delete                ('subscribers' → 'subscriber')
  'subscription.',     // subscription cancel / reactivate / resume / auto-renewal
  'risk.',             // risk-queue approve / reject               ('risk-queue' → 'risk')
  'dispute.',          // disputes + dispute-cases lifecycle        ('disputes'/'dispute-cases' → 'dispute')
  'receipt-template.', // template create / update / deactivate    ('receipt-templates' → 'receipt-template')
  'payout.',           // payout process / hold / release           ('payouts' → 'payout')
  'ticket.',           // ticket assign / reject / update / reply   ('help' router)
];

/**
 * GET /api/admin/control/security
 * Query: page, limit, action, actorId, from, to
 */
router.get(
  '/security',
  requirePermission('admins.audit.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const skip = (page - 1) * limit;
    const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';
    const actorId = typeof req.query.actorId === 'string' ? req.query.actorId.trim() : '';
    const fromParam = req.query.from as string;
    const toParam = req.query.to as string;

    const where: Parameters<typeof prisma.auditLog.findMany>[0]['where'] = {};

    if (action) {
      where.action = { contains: action, mode: 'insensitive' };
    } else {
      // Default: show only security-relevant actions
      where.OR = SECURITY_ACTION_PREFIXES.map((prefix) => ({
        action: { startsWith: prefix },
      }));
    }

    if (actorId) where.actorUserId = actorId;
    if (fromParam) {
      const d = new Date(fromParam + 'T00:00:00+02:00');
      if (!isNaN(d.getTime())) where.createdAt = { ...((where.createdAt as object) ?? {}), gte: d };
    }
    if (toParam) {
      const d = new Date(toParam + 'T23:59:59.999+02:00');
      if (!isNaN(d.getTime())) where.createdAt = { ...((where.createdAt as object) ?? {}), lte: d };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: {
            select: { id: true, email: true, firstName: true, lastName: true, role: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: logs,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  })
);

/* ─── Disputes (Manual Review Receipts) ──────────────────────────────────── */

/**
 * GET /api/admin/control/disputes
 * Query: page, limit, status (MANUAL_REVIEW|PROCESSING), venueId
 *
 * @deprecated Receipt-based manual-review flow. Use /risk-queue (StickerScan fraud
 * queue, spec §7.1) and /dispute-cases (Dispute ticket model, spec §7.3) instead.
 */
router.get(
  '/disputes',
  requirePermission('control.disputes.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const skip = (page - 1) * limit;
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : 'MANUAL_REVIEW';
    const venueId = typeof req.query.venueId === 'string' ? req.query.venueId.trim() : '';

    const where: Parameters<typeof prisma.receipt.findMany>[0]['where'] = {
      status: status as never,
    };
    if (venueId) where.venueId = venueId;

    const [receipts, total] = await Promise.all([
      prisma.receipt.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          venue: {
            select: {
              id: true, name: true, city: true,
              partner: { select: { id: true, businessName: true } },
            },
          },
        },
      }),
      prisma.receipt.count({ where }),
    ]);

    res.json({
      success: true,
      data: receipts,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  })
);

/**
 * POST /api/admin/control/disputes/:id/approve
 * Body: { verifiedAmount?: number; notes?: string }
 * Approves a manual-review receipt via receiptService.reviewReceipt(), which
 * calculates cashback, credits the user's wallet, records reviewedBy, and
 * rolls back on failure. Do NOT bypass this with a raw Prisma update.
 */
router.post(
  '/disputes/:id/approve',
  requirePermission('control.disputes.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const verifiedAmount = typeof req.body?.verifiedAmount === 'number' ? req.body.verifiedAmount : undefined;
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : undefined;

    const before = await prisma.receipt.findUnique({
      where: { id },
      select: { status: true, totalAmount: true, fraudScore: true },
    });

    const result = await receiptService.reviewReceipt({
      receiptId: id,
      action: 'APPROVE',
      reviewedBy: req.user!.id,
      verifiedAmount,
      notes,
    });
    const { fraudWarning, ...rest } = result;

    req.skipAudit = true;
    writeAudit({
      actorUserId: req.user!.id,
      action: 'dispute.approve',
      objectType: 'dispute',
      objectId: id,
      before: before ? { status: before.status, totalAmount: before.totalAmount, fraudScore: before.fraudScore } : null,
      after: { status: 'APPROVED', verifiedAmount: verifiedAmount ?? null, notes: notes ?? null },
    }).catch(() => {});

    res.json({ success: true, data: rest, message: 'Receipt approved', ...(fraudWarning && { fraudWarning }) });
  })
);

/**
 * POST /api/admin/control/disputes/:id/reject
 * Body: { reason?: string; notes?: string } — accepts either key
 */
router.post(
  '/disputes/:id/reject',
  requirePermission('control.disputes.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const rejectionReason =
      typeof req.body?.reason === 'string' ? req.body.reason.trim() :
      typeof req.body?.notes  === 'string' ? req.body.notes.trim()  : undefined;

    const before = await prisma.receipt.findUnique({
      where: { id },
      select: { status: true, totalAmount: true, fraudScore: true },
    });

    const updated = await receiptService.reviewReceipt({
      receiptId: id,
      action: 'REJECT',
      reviewedBy: req.user!.id,
      rejectionReason,
    });

    req.skipAudit = true;
    writeAudit({
      actorUserId: req.user!.id,
      action: 'dispute.reject',
      objectType: 'dispute',
      objectId: id,
      before: before ? { status: before.status, totalAmount: before.totalAmount, fraudScore: before.fraudScore } : null,
      after: { status: 'REJECTED', reason: rejectionReason ?? null },
    }).catch(() => {});

    res.json({ success: true, data: updated, message: 'Receipt rejected' });
  })
);

/* ─── G4: Risk Queue (Spec §7.1 / §7.2) ─────────────────────────────────── */

// Signal codes grouped by spec §7.2 category — shared by list and summary endpoints.
// Both exact-match codes (from fraudDetection.service.ts → Receipt.fraudReasons) and
// sticker-service codes (DUPLICATE_IMAGE_HASH, DAILY_LIMIT_EXCEEDED, RAPID_SUBMISSIONS, etc.
// from sticker.service.ts → StickerScan.fraudReasons) are included.
// Prefix-payload codes (MERCHANT_MISMATCH:...) cannot be matched with Prisma hasSome
// and are therefore captured in the 'other' bucket via the knownCount diff.
const RISK_SIGNAL_GROUPS = {
  duplicate:    ['DUPLICATE_IMAGE', 'DUPLICATE_RECEIPT', 'DUPLICATE_IMAGE_HASH',
                 'DUPLICATE_IMAGE_HASH_RACE', 'PERCEPTUAL_DUPLICATE_CLOSE', 'PERCEPTUAL_DUPLICATE_MODERATE'],
  qrMismatch:   ['GPS_FAR_FROM_VENUE', 'GPS_OUTSIDE_RANGE'],
  // RAPID_SUBMISSIONS / DAILY_LIMIT_EXCEEDED / MONTHLY_LIMIT_EXCEEDED are exact codes written by
  // performFraudCheck() in sticker.service.ts. hasSome can match them without a payload suffix.
  velocity:     ['RAPID_SUBMISSIONS', 'DAILY_LIMIT_EXCEEDED', 'MONTHLY_LIMIT_EXCEEDED'],
  receiptMatch: ['LOW_OCR_CONFIDENCE', 'MODERATE_OCR_CONFIDENCE', 'TEMPLATE_MISMATCH',
                 'AMOUNT_MISMATCH', 'LARGE_AMOUNT_MISMATCH', 'AMOUNT_TOO_LOW', 'AMOUNT_EXCEEDS_VENUE_MAX',
                 'HIGH_BILL_AMOUNT'],
  // Spec §7.2 "подозрително поведение" — device anomalies, blacklisted merchants, etc.
  suspicious:   ['MERCHANT_BLACKLISTED', 'NEW_DEVICE_MULTI_DEVICE_USER',
                 'RARE_DEVICE_MULTI_DEVICE_USER', 'UNUSUAL_TIME', 'NEW_DEVICE', 'FRAUD_CHECK_ERROR'],
} as const;

const ALL_KNOWN_SIGNALS = [
  ...RISK_SIGNAL_GROUPS.duplicate,
  ...RISK_SIGNAL_GROUPS.qrMismatch,
  ...RISK_SIGNAL_GROUPS.velocity,
  ...RISK_SIGNAL_GROUPS.receiptMatch,
  ...RISK_SIGNAL_GROUPS.suspicious,
];

// Active statuses that require admin attention — scans already resolved drop off the queue.
// Mirrors ACTIVE_SCAN_STATUSES from adminAlerts.service.ts so alert badges and queue counts match.
const QUEUE_ACTIVE_STATUSES = ACTIVE_SCAN_STATUSES;

function partnerRiskBucket(riskScanCount: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (riskScanCount >= 5) return 'HIGH';
  if (riskScanCount >= 2) return 'MEDIUM';
  return 'LOW';
}

/**
 * GET /api/admin/control/risk-queue/summary
 * Returns global signal counts across all non-resolved sticker scans (not page-scoped).
 * Must be registered before /risk-queue/:id routes to avoid param capture.
 */
router.get(
  '/risk-queue/summary',
  requirePermission('control.risk.read'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    // Mirror the list endpoint: only count scans with fraudScore >= 31 so the
    // tile totals match what's actionable in the queue (0-30 items auto-approve and
    // don't appear in the list, so they should not inflate the summary tiles either).
    const baseWhere = {
      fraudScore: { gte: 31 },
      status: { in: QUEUE_ACTIVE_STATUSES },
      fraudReasons: { isEmpty: false },
    };

    // Spec §7.2 "странни IBAN промени": count users who changed IBAN within the last 7 days.
    // userRisk.service.ts applies RECENT_IBAN_CHANGE (+10) for changes within 7 days;
    // we use the same 7-day window here so the tile tracks the same cohort.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [total, duplicate, qrMismatch, velocity, receiptMatch, suspicious, knownCount, ibanAnomaly] =
      await Promise.all([
        prisma.stickerScan.count({ where: baseWhere }),
        prisma.stickerScan.count({ where: { ...baseWhere, fraudReasons: { hasSome: [...RISK_SIGNAL_GROUPS.duplicate] } } }),
        prisma.stickerScan.count({ where: { ...baseWhere, fraudReasons: { hasSome: [...RISK_SIGNAL_GROUPS.qrMismatch] } } }),
        prisma.stickerScan.count({ where: { ...baseWhere, fraudReasons: { hasSome: [...RISK_SIGNAL_GROUPS.velocity] } } }),
        prisma.stickerScan.count({ where: { ...baseWhere, fraudReasons: { hasSome: [...RISK_SIGNAL_GROUPS.receiptMatch] } } }),
        prisma.stickerScan.count({ where: { ...baseWhere, fraudReasons: { hasSome: [...RISK_SIGNAL_GROUPS.suspicious] } } }),
        prisma.stickerScan.count({ where: { ...baseWhere, fraudReasons: { hasSome: ALL_KNOWN_SIGNALS } } }),
        prisma.user.count({ where: { ibanLastChangedAt: { gte: sevenDaysAgo } } }),
      ]);

    res.json({
      success: true,
      data: {
        total,
        duplicate,
        qrMismatch,
        velocity,
        receiptMatch,
        suspicious,
        other: total - knownCount,
        ibanAnomaly,
      },
    });
  })
);

/**
 * GET /api/admin/control/risk-queue
 * Query: tier (REVIEW_31_60 | HIGH_61_PLUS | all), page, limit, venueId, signalCategory, dateFrom
 * Returns sticker scans filtered by fraudScore risk tier for the review queue.
 * Each row includes partnerRiskBucket derived from active risk-scan count across all partner venues.
 * dateFrom (ISO string) narrows results to scans created at or after that timestamp — used by
 * the suspicious_activity alert deep-link so the page count matches the 24h badge count.
 */
router.get(
  '/risk-queue',
  requirePermission('control.risk.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const skip = (page - 1) * limit;
    const tier = typeof req.query.tier === 'string' ? req.query.tier.trim() : 'all';
    const venueId = typeof req.query.venueId === 'string' ? req.query.venueId.trim() : '';
    const signalCategory = typeof req.query.signalCategory === 'string' ? req.query.signalCategory.trim() : '';
    const dateFromRaw = typeof req.query.dateFrom === 'string' ? req.query.dateFrom.trim() : '';

    // Spec §7.1 buckets: 0-30 auto-approve (not surfaced for review), 31-60 review, 61+ high.
    // AUTO_0_30 is intentionally excluded — those scans auto-approve.
    // 'all' and any unknown tier value default to all review-relevant items (≥31).
    let fraudScoreFilter: { gte?: number; lt?: number } = { gte: 31 };
    if (tier === 'REVIEW_31_60') fraudScoreFilter = { gte: 31, lt: 61 };
    else if (tier === 'HIGH_61_PLUS') fraudScoreFilter = { gte: 61 };

    // When a signal category is provided, restrict to scans carrying at least one signal
    // from that category (hasSome implicitly means isEmpty: false).
    const fraudReasonsFilter =
      signalCategory && signalCategory in RISK_SIGNAL_GROUPS
        ? { hasSome: [...RISK_SIGNAL_GROUPS[signalCategory as keyof typeof RISK_SIGNAL_GROUPS]] }
        : { isEmpty: false };

    const where: Parameters<typeof prisma.stickerScan.findMany>[0]['where'] = {
      fraudScore: fraudScoreFilter,
      fraudReasons: fraudReasonsFilter,
      status: { in: QUEUE_ACTIVE_STATUSES },
    };
    if (venueId) where.venueId = venueId;
    if (dateFromRaw) {
      const dateFrom = new Date(dateFromRaw);
      if (!isNaN(dateFrom.getTime())) where.createdAt = { gte: dateFrom };
    }

    const [scans, total] = await Promise.all([
      prisma.stickerScan.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ fraudScore: 'desc' }, { createdAt: 'asc' }],
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true, riskBucket: true } },
          venue: {
            select: {
              id: true,
              name: true,
              partnerId: true,
              partner: { select: { id: true, businessName: true } },
            },
          },
        },
      }),
      prisma.stickerScan.count({ where }),
    ]);

    // Spec §7.2 "Риск при партньор": derive partner risk from count of active risk scans
    // across ALL venues of each partner (not just the ones visible on this page).
    const partnerIds = Array.from(
      new Set(scans.map((s) => s.venue?.partner?.id).filter((x): x is string => !!x))
    );
    const partnerRiskMap = new Map<string, 'LOW' | 'MEDIUM' | 'HIGH'>();
    if (partnerIds.length) {
      const allPartnerVenues = await prisma.venue.findMany({
        where: { partnerId: { in: partnerIds } },
        select: { id: true, partnerId: true },
      });
      const allPartnerVenueIds = allPartnerVenues.map((v) => v.id);
      const venueToPartner = new Map(allPartnerVenues.map((v) => [v.id, v.partnerId]));

      const riskCountsByVenue = await prisma.stickerScan.groupBy({
        by: ['venueId'],
        where: {
          venueId: { in: allPartnerVenueIds },
          fraudScore: { gte: 31 },
          status: { in: QUEUE_ACTIVE_STATUSES },
        },
        _count: { _all: true },
      });

      const partnerCountMap = new Map<string, number>();
      for (const row of riskCountsByVenue) {
        const pid = venueToPartner.get(row.venueId);
        if (!pid) continue;
        partnerCountMap.set(pid, (partnerCountMap.get(pid) ?? 0) + row._count._all);
      }
      for (const pid of partnerIds) {
        partnerRiskMap.set(pid, partnerRiskBucket(partnerCountMap.get(pid) ?? 0));
      }
    }

    // Map StickerScan shape to the FraudSignalReceipt contract the frontend expects.
    // billAmount → totalAmount; merchantName derived from venue.partner.businessName.
    const enriched = scans.map((s) => {
      const pRisk = s.venue?.partner?.id ? (partnerRiskMap.get(s.venue.partner.id) ?? 'LOW') : null;
      return {
        ...s,
        totalAmount: s.billAmount,
        merchantName: s.venue?.partner?.businessName ?? null,
        venue: s.venue ? { ...s.venue, partnerRiskBucket: pRisk } : null,
      };
    });

    res.json({
      success: true,
      data: enriched,
      meta: { total, page, limit, pages: Math.ceil(total / limit), tier, signalCategory: signalCategory || null },
    });
  })
);

/**
 * POST /api/admin/control/risk-queue/:id/approve
 * Approve a flagged sticker scan from the risk queue (calculates cashback, credits wallet).
 */
router.post(
  '/risk-queue/:id/approve',
  requirePermission('control.risk.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const verifiedAmount = typeof req.body?.verifiedAmount === 'number' ? req.body.verifiedAmount : undefined;
    const notes = typeof req.body?.notes === 'string' && req.body.notes.trim() ? req.body.notes.trim() : undefined;

    const scanBefore = await prisma.stickerScan.findUnique({
      where: { id: req.params.id },
      select: { status: true, fraudScore: true, fraudReasons: true, billAmount: true },
    });

    const scan = await stickerService.approveScan(req.params.id, {
      verifiedAmount,
      adminUserId: req.user!.id,
      notes,
    });

    req.skipAudit = true;
    writeAudit({
      actorUserId: req.user!.id,
      action: 'risk.approve',
      objectType: 'risk',
      objectId: req.params.id,
      before: scanBefore ? { status: scanBefore.status, fraudScore: scanBefore.fraudScore, fraudReasons: scanBefore.fraudReasons, billAmount: scanBefore.billAmount } : null,
      after: { status: scan.status, verifiedAmount: verifiedAmount ?? null, notes: notes ?? null },
    }).catch(() => {});

    let fraudWarning: string | undefined;
    if (verifiedAmount !== undefined) {
      const threshold = await getSystemSettingFloat('correction_warning_threshold', DEFAULT_CORRECTION_WARNING_THRESHOLD);
      if (scan.fraudScore >= threshold) {
        fraudWarning = `Fraud score (${scan.fraudScore.toFixed(0)}) exceeds the correction warning threshold (${threshold}). Amount override applied.`;
      }
    }

    res.json({ success: true, data: scan, message: 'Signal approved', ...(fraudWarning && { fraudWarning }) });
  })
);

/**
 * POST /api/admin/control/risk-queue/:id/reject
 * Reject a flagged sticker scan from the risk queue.
 */
router.post(
  '/risk-queue/:id/reject',
  requirePermission('control.risk.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) {
      return res.status(400).json({ error: 'reason is required' });
    }

    const scanBefore = await prisma.stickerScan.findUnique({
      where: { id: req.params.id },
      select: { status: true, fraudScore: true, fraudReasons: true, billAmount: true },
    });

    // Spec §7.1 v1.1 — actorUserId threads into cashbackLifecycleService so the
    // Voided ghost record carries `voidedByUserId` for the audit trail.
    const scan = await stickerService.rejectScan(req.params.id, reason, req.user?.id ?? null);

    req.skipAudit = true;
    writeAudit({
      actorUserId: req.user?.id ?? null,
      action: 'risk.reject',
      objectType: 'risk',
      objectId: req.params.id,
      before: scanBefore ? { status: scanBefore.status, fraudScore: scanBefore.fraudScore, fraudReasons: scanBefore.fraudReasons, billAmount: scanBefore.billAmount } : null,
      after: { status: scan.status, reason },
    }).catch(() => {});

    res.json({ success: true, data: scan, message: 'Signal rejected' });
  })
);

/**
 * POST /api/admin/control/risk-queue/bulk-reject
 * Body: { scanIds: string[]; reason?: string }
 *
 * Bulk-reject sticker scans from the risk queue with a shared reason. Each
 * scan's PENDING cashback row transitions to VOIDED with the same audit
 * trail as the single-scan endpoint. Failures are isolated per-scan so one
 * bad row doesn't kill the batch.
 */
router.post(
  '/risk-queue/bulk-reject',
  requirePermission('control.risk.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const scanIds = Array.isArray(req.body?.scanIds)
      ? req.body.scanIds.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    if (scanIds.length === 0) {
      return res.status(400).json({ error: 'scanIds array is required' });
    }
    // Audit-pass [7.1]: lower the per-request cap from 100 → 25 since each
    // scan triggers a wallet write + audit row (~5 DB round-trips × 100 =
    // ~500 round-trips that block the HTTP request for many seconds). For
    // batches > 25, frontends should chunk and call the endpoint multiple
    // times; each call is independent and idempotent at the cashback layer.
    if (scanIds.length > 25) {
      return res.status(400).json({ error: 'bulk-reject batch limited to 25 scans per request (chunk larger sets client-side)' });
    }
    // De-duplicate IDs so a client that accidentally repeats one doesn't
    // double-spend audit rows.
    const uniqueIds: string[] = Array.from(new Set(scanIds));
    const reason =
      typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) {
      return res.status(400).json({ error: 'reason is required' });
    }

    const scansBefore = await prisma.stickerScan.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, status: true, fraudScore: true, fraudReasons: true, billAmount: true },
    });
    const beforeMap = new Map(scansBefore.map((s) => [s.id, s]));

    const result = await stickerService.bulkReject(uniqueIds, reason, req.user?.id ?? null);

    req.skipAudit = true;
    for (const scanId of uniqueIds) {
      const b = beforeMap.get(scanId);
      writeAudit({
        actorUserId: req.user?.id ?? null,
        action: 'risk.reject',
        objectType: 'risk',
        objectId: scanId,
        before: b ? { status: b.status, fraudScore: b.fraudScore, fraudReasons: b.fraudReasons, billAmount: b.billAmount } : null,
        after: { status: 'REJECTED', reason, bulk: true },
      }).catch(() => {});
    }

    res.json({ success: true, data: result, message: 'Bulk reject completed' });
  })
);

/* ─── G5: Dispute Cases (Spec §7.3) ─────────────────────────────────────── */

const DISPUTE_STATUS_ORDER: DisputeStatus[] = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED'];

/**
 * GET /api/admin/control/dispute-cases
 * Query: status, assignedTo, page, limit
 */
router.get(
  '/dispute-cases',
  requirePermission('control.disputes.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const skip = (page - 1) * limit;
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const assignedTo = typeof req.query.assignedTo === 'string' ? req.query.assignedTo.trim() : '';
    const subjectType = typeof req.query.subjectType === 'string' ? req.query.subjectType.trim() : '';

    const where: Parameters<typeof prisma.dispute.findMany>[0]['where'] = {};
    if (status && Object.values(DisputeStatus).includes(status as DisputeStatus)) {
      where.status = status as DisputeStatus;
    }
    if (assignedTo) where.assignedTo = assignedTo;
    if (subjectType && Object.values(DisputeSubjectType).includes(subjectType as DisputeSubjectType)) {
      where.subjectType = subjectType as DisputeSubjectType;
    }

    const [cases, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          assignee: { select: { id: true, email: true, firstName: true, lastName: true } },
          receipt: { select: { id: true, merchantName: true, totalAmount: true, fraudScore: true, status: true } },
          _count: { select: { notes: true } },
        },
      }),
      prisma.dispute.count({ where }),
    ]);

    res.json({
      success: true,
      data: cases,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  })
);

/**
 * POST /api/admin/control/dispute-cases
 * Body: { subjectType?, receiptId?, subjectId?, userId?, notes?, ticketId?, assignedTo? }
 *
 * subjectType defaults to RECEIPT. When RECEIPT, receiptId is required and userId
 * is resolved from the receipt. For CASHBACK / PAYOUT / INVOICE, both subjectId
 * and userId are required (no DB FK validation — those models may not exist yet).
 *
 * assignedTo (optional): ID of the ADMIN or SUPER_ADMIN to assign. Defaults to the
 * requesting admin when omitted.
 *
 * ticketId (optional, §11.6): links this dispute to a DISPUTE-type HelpTicket.
 * The ticket must exist and have requestType=DISPUTE; rejected otherwise.
 */
router.post(
  '/dispute-cases',
  requirePermission('control.disputes.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const {
      subjectType: rawSubjectType,
      receiptId,
      subjectId,
      userId: bodyUserId,
      notes,
      ticketId,
      assignedTo: bodyAssignedTo,
    } = req.body as {
      subjectType?: string;
      receiptId?: string;
      subjectId?: string;
      userId?: string;
      notes?: string;
      ticketId?: string;
      assignedTo?: string;
    };

    // §11.6 — validate the linked ticket if provided
    if (ticketId?.trim()) {
      const linkedTicket = await prisma.helpTicket.findUnique({
        where: { id: ticketId.trim() },
        select: { id: true, requestType: true },
      });
      if (!linkedTicket) {
        return res.status(404).json({ success: false, error: 'Linked help ticket not found' });
      }
      if (linkedTicket.requestType !== 'DISPUTE') {
        return res.status(400).json({ success: false, error: 'Linked ticket must have requestType=DISPUTE' });
      }
    }

    const subjectType: DisputeSubjectType =
      rawSubjectType && Object.values(DisputeSubjectType).includes(rawSubjectType as DisputeSubjectType)
        ? (rawSubjectType as DisputeSubjectType)
        : 'RECEIPT';

    let resolvedUserId: string;
    let resolvedReceiptId: string | undefined;

    if (subjectType === 'RECEIPT') {
      if (!receiptId) {
        return res.status(400).json({ success: false, error: 'receiptId is required for RECEIPT disputes' });
      }
      const receipt = await prisma.receipt.findUnique({
        where: { id: receiptId },
        select: { id: true, userId: true },
      });
      if (!receipt) return res.status(404).json({ success: false, error: 'Receipt not found' });

      const existing = await prisma.dispute.findFirst({
        where: { receiptId, status: { notIn: ['CLOSED'] } },
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'An open dispute case already exists for this receipt',
          disputeId: existing.id,
        });
      }

      resolvedUserId = receipt.userId;
      resolvedReceiptId = receiptId;
    } else {
      if (!subjectId?.trim()) {
        return res.status(400).json({ success: false, error: 'subjectId is required for non-receipt disputes' });
      }
      if (!bodyUserId?.trim()) {
        return res.status(400).json({ success: false, error: 'userId is required for non-receipt disputes' });
      }

      const [userRecord, existing] = await Promise.all([
        prisma.user.findUnique({ where: { id: bodyUserId.trim() }, select: { id: true } }),
        prisma.dispute.findFirst({
          where: { subjectType, subjectId: subjectId.trim(), status: { notIn: ['CLOSED'] } },
        }),
      ]);

      if (!userRecord) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      if (existing) {
        return res.status(409).json({
          success: false,
          error: `An open dispute case already exists for this ${subjectType.toLowerCase()}`,
          disputeId: existing.id,
        });
      }

      resolvedUserId = bodyUserId.trim();
    }

    // §7.3 — resolve assignee: explicit override must exist and be an admin-level user.
    let resolvedAssignedTo: string = req.user!.id;
    if (bodyAssignedTo?.trim()) {
      const assignee = await prisma.user.findUnique({
        where: { id: bodyAssignedTo.trim() },
        select: { id: true, role: true },
      });
      if (!assignee) {
        return res.status(404).json({ success: false, error: 'Assignee not found' });
      }
      if (assignee.role !== 'ADMIN' && assignee.role !== 'SUPER_ADMIN') {
        return res.status(400).json({ success: false, error: 'assignedTo must be an ADMIN or SUPER_ADMIN user' });
      }
      resolvedAssignedTo = assignee.id;
    }

    const disputeCase = await prisma.$transaction(async (tx) => {
      const created = await tx.dispute.create({
        data: {
          subjectType,
          receiptId: resolvedReceiptId ?? null,
          subjectId: subjectType !== 'RECEIPT' ? subjectId!.trim() : null,
          userId: resolvedUserId,
          assignedTo: resolvedAssignedTo,
          status: 'OPEN',
          ticketId: ticketId?.trim() || null,
        },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          receipt: { select: { id: true, merchantName: true, totalAmount: true, fraudScore: true, status: true } },
          ticket: { select: { id: true, subject: true, requestType: true } },
        },
      });

      if (notes?.trim()) {
        await tx.disputeNote.create({
          data: {
            disputeId: created.id,
            authorId: req.user!.id,
            body: notes.trim(),
            isAdmin: true,
          },
        });
      }

      return created;
    });

    res.status(201).json({ success: true, data: disputeCase });
  })
);

/**
 * GET /api/admin/control/dispute-cases/:id
 */
router.get(
  '/dispute-cases/:id',
  requirePermission('control.disputes.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const disputeCase = await prisma.dispute.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, email: true, firstName: true, lastName: true } },
        receipt: {
          select: {
            id: true, merchantName: true, totalAmount: true, verifiedAmount: true,
            fraudScore: true, fraudReasons: true, status: true, imageUrl: true,
            ocrData: true, createdAt: true,
          },
        },
        notes: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
      },
    });

    if (!disputeCase) return res.status(404).json({ success: false, error: 'Dispute case not found' });

    res.json({ success: true, data: disputeCase });
  })
);

/**
 * PATCH /api/admin/control/dispute-cases/:id
 * Body: { status?, assignedTo?, decision? }
 * Status must advance forward in: OPEN → IN_REVIEW → RESOLVED → CLOSED
 */
router.patch(
  '/dispute-cases/:id',
  requirePermission('control.disputes.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { status, assignedTo, decision } = req.body as {
      status?: string;
      assignedTo?: string | null;
      decision?: string | null;
    };

    const disputeCase = await prisma.dispute.findUnique({ where: { id: req.params.id } });
    if (!disputeCase) return res.status(404).json({ success: false, error: 'Dispute case not found' });
    if (disputeCase.status === 'CLOSED') {
      return res.status(400).json({ success: false, error: 'Cannot modify a closed dispute case' });
    }

    const data: Parameters<typeof prisma.dispute.update>[0]['data'] = {};

    if (status) {
      if (!Object.values(DisputeStatus).includes(status as DisputeStatus)) {
        return res.status(400).json({ success: false, error: `status must be one of: ${DISPUTE_STATUS_ORDER.join(', ')}` });
      }
      const currentIdx = DISPUTE_STATUS_ORDER.indexOf(disputeCase.status);
      const newIdx = DISPUTE_STATUS_ORDER.indexOf(status as DisputeStatus);
      if (newIdx !== currentIdx + 1) {
        return res.status(400).json({ success: false, error: `Status must advance one step at a time: ${disputeCase.status} → ${DISPUTE_STATUS_ORDER[currentIdx + 1] ?? '(none)'}` });
      }
      // Spec §7.3: a decision must be recorded before a case can be resolved.
      // Accept the decision either from this request body OR from a prior PATCH.
      if (status === 'RESOLVED') {
        const effectiveDecision = decision !== undefined ? decision : disputeCase.decision;
        if (!effectiveDecision?.trim()) {
          return res.status(400).json({
            success: false,
            error: 'A non-empty decision is required to resolve a dispute case',
          });
        }
        data.resolvedAt = new Date();
        req.auditAction = 'dispute.resolve';
      }
      if (status === 'IN_REVIEW') { req.auditAction = 'dispute.in-review'; }
      if (status === 'CLOSED')    { data.closedAt = new Date(); req.auditAction = 'dispute.close'; }
      data.status = status as DisputeStatus;
    }

    if (assignedTo !== undefined) {
      if (assignedTo) {
        // §7.3 — assignee must exist and be an admin-level user.
        const assignee = await prisma.user.findUnique({
          where: { id: assignedTo },
          select: { id: true, role: true },
        });
        if (!assignee) {
          return res.status(404).json({ success: false, error: 'Assignee not found' });
        }
        if (assignee.role !== 'ADMIN' && assignee.role !== 'SUPER_ADMIN') {
          return res.status(400).json({ success: false, error: 'assignedTo must be an ADMIN or SUPER_ADMIN user' });
        }
      }
      data.assignedTo = assignedTo || null;
    }
    // decision="" or decision=null clears a previously-stored draft decision. This is intentional:
    // admins can retract a draft while still in IN_REVIEW. The RESOLVED guard above already
    // blocks transitions that would leave the case without a decision.
    if (decision !== undefined) data.decision = decision || null;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    const updated = await prisma.dispute.update({
      where: { id: req.params.id },
      data,
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    res.json({ success: true, data: updated });
  })
);

/**
 * POST /api/admin/control/dispute-cases/:id/notes
 * Body: { body }
 */
router.post(
  '/dispute-cases/:id/notes',
  requirePermission('control.disputes.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { body } = req.body as { body?: string };
    if (!body?.trim()) {
      return res.status(400).json({ success: false, error: 'Note body is required' });
    }

    const disputeCase = await prisma.dispute.findUnique({ where: { id: req.params.id } });
    if (!disputeCase) return res.status(404).json({ success: false, error: 'Dispute case not found' });
    if (disputeCase.status === 'CLOSED') {
      return res.status(400).json({ success: false, error: 'Cannot add notes to a closed dispute case' });
    }

    const note = await prisma.disputeNote.create({
      data: {
        disputeId: req.params.id,
        authorId: req.user!.id,
        body: body.trim(),
        isAdmin: true,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    res.status(201).json({ success: true, data: note });
  })
);

/**
 * GET /api/admin/control/dispute-cases/:id/notes
 */
router.get(
  '/dispute-cases/:id/notes',
  requirePermission('control.disputes.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const disputeCase = await prisma.dispute.findUnique({ where: { id: req.params.id } });
    if (!disputeCase) return res.status(404).json({ success: false, error: 'Dispute case not found' });

    const notes = await prisma.disputeNote.findMany({
      where: { disputeId: req.params.id },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    res.json({ success: true, data: notes });
  })
);

/* ─── G6: VenueReceiptTemplate CRUD (Spec §5.5) ─────────────────────────── */

/**
 * GET /api/admin/control/receipt-templates
 * Query: venueId, active (true|false), page, limit
 */
router.get(
  '/receipt-templates',
  requirePermission('control.risk.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const skip = (page - 1) * limit;
    const venueId = typeof req.query.venueId === 'string' ? req.query.venueId.trim() : '';
    const activeParam = req.query.active as string;

    const where: Parameters<typeof prisma.venueReceiptTemplate.findMany>[0]['where'] = {};
    if (venueId) where.venueId = venueId;
    if (activeParam !== undefined) where.isActive = activeParam !== 'false';

    const [templates, total] = await Promise.all([
      prisma.venueReceiptTemplate.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.venueReceiptTemplate.count({ where }),
    ]);

    res.json({
      success: true,
      data: templates,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  })
);

/**
 * POST /api/admin/control/receipt-templates
 * Body: { venueId, merchantName, imageUrl, imageKey, perceptualHash, description?, expectedKeywords? }
 */
router.post(
  '/receipt-templates',
  requirePermission('control.risk.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { venueId, merchantName, imageUrl, imageKey, perceptualHash, description, expectedKeywords } =
      req.body as {
        venueId?: string;
        merchantName?: string;
        imageUrl?: string;
        imageKey?: string;
        perceptualHash?: string;
        description?: string;
        expectedKeywords?: string[];
      };

    if (!venueId) return res.status(400).json({ success: false, error: 'venueId is required' });
    if (!merchantName?.trim()) return res.status(400).json({ success: false, error: 'merchantName is required' });
    if (!imageUrl?.trim()) return res.status(400).json({ success: false, error: 'imageUrl is required' });
    if (!imageKey?.trim()) return res.status(400).json({ success: false, error: 'imageKey is required' });
    if (!perceptualHash?.trim()) return res.status(400).json({ success: false, error: 'perceptualHash is required' });

    const venueExists = await prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } });
    if (!venueExists) return res.status(404).json({ success: false, error: 'Venue not found' });

    const template = await prisma.venueReceiptTemplate.create({
      data: {
        venueId,
        merchantName: merchantName.trim(),
        imageUrl: imageUrl.trim(),
        imageKey: imageKey.trim(),
        perceptualHash: perceptualHash.trim(),
        description: description?.trim() ?? null,
        expectedKeywords: expectedKeywords ?? [],
        uploadedBy: req.user!.id,
      },
    });

    res.status(201).json({ success: true, data: template });
  })
);

/**
 * PATCH /api/admin/control/receipt-templates/:id
 * Body: { merchantName?, description?, expectedKeywords?, isActive? }
 * Image fields are intentionally excluded — re-upload via POST if image changes.
 */
router.patch(
  '/receipt-templates/:id',
  requirePermission('control.risk.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { merchantName, description, expectedKeywords, isActive } = req.body as {
      merchantName?: string;
      description?: string | null;
      expectedKeywords?: string[] | null;
      isActive?: boolean;
    };

    const template = await prisma.venueReceiptTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ success: false, error: 'Receipt template not found' });

    const data: Parameters<typeof prisma.venueReceiptTemplate.update>[0]['data'] = {};
    if (merchantName !== undefined) data.merchantName = merchantName.trim();
    if (description !== undefined) data.description = description;
    if (expectedKeywords !== undefined) data.expectedKeywords = expectedKeywords ?? [];
    if (isActive !== undefined) data.isActive = isActive;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    const updated = await prisma.venueReceiptTemplate.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ success: true, data: updated });
  })
);

/**
 * DELETE /api/admin/control/receipt-templates/:id
 * Soft-deactivates the template (preserves audit trail).
 */
router.delete(
  '/receipt-templates/:id',
  requirePermission('control.risk.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const template = await prisma.venueReceiptTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ success: false, error: 'Receipt template not found' });

    await prisma.venueReceiptTemplate.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    res.json({ success: true, message: 'Template deactivated' });
  })
);

export default router;
