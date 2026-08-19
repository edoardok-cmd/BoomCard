import { Router } from 'express';
import bcrypt from 'bcrypt';
import { AdminRoleKey, UserRole, UserStatus } from '@prisma/client';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { auditMiddleware, writeAudit } from '../middleware/audit.middleware';
import { prisma } from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth.middleware';
import { getClientIp } from '../utils/requestIp';
import { emailService } from '../services/email.service';
import { logger } from '../utils/logger';
import { parsePagination } from '../utils/pagination';
import { detach } from '../utils/detach';
import {
  isValidPermissionKey,
  getPermissionCatalogGrouped,
  resolveUserPermissionBreakdown,
} from '../services/permission.service';
import { isPhoneRoleUniqueViolation } from '../services/auth.service';

const router = Router();
router.use(auditMiddleware);

// GET /api/admin/admins/roles — all AdminRole rows (for create / approve forms)
router.get('/roles', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('admins.read'), async (_req, res, next) => {
  try {
    const roles = await prisma.adminRole.findMany({ orderBy: { key: 'asc' } });
    res.json({ roles });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/admins/audit — paginated audit log
// Query params:
//   search      – free-text across action, objectType, objectId, actor name/email
//   objectType  – exact match on objectType (case-insensitive)
//   action      – prefix match on action (e.g. "admin" matches "admin.create")
//   actorId     – filter to a specific actor User ID
//   dateFrom    – ISO date string, inclusive lower bound on createdAt
//   dateTo      – ISO date string, inclusive upper bound on createdAt (end of day)
//   page / limit
router.get('/audit', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('admins.audit.read'), async (req, res, next) => {
  try {
    const {
      search,
      objectType,
      action: actionFilter,
      actorId,
      dateFrom,
      dateTo,
    } = req.query as Record<string, string>;

    const { skip, take, page: pageNum } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

    const where: Parameters<typeof prisma.auditLog.findMany>[0]['where'] = {};

    if (objectType) where.objectType = { equals: objectType, mode: 'insensitive' };

    if (actionFilter) where.action = { startsWith: actionFilter, mode: 'insensitive' };

    if (actorId) where.actorUserId = actorId;

    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom) : undefined;
      const to = dateTo ? new Date(dateTo + 'T23:59:59.999Z') : undefined;
      if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) {
        return res.status(400).json({ error: 'Invalid dateFrom or dateTo — use ISO date strings (YYYY-MM-DD)' });
      }
      where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    }

    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { objectType: { contains: search, mode: 'insensitive' } },
        { objectId: { contains: search, mode: 'insensitive' } },
        { actor: { OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ]}},
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          objectType: true,
          objectId: true,
          before: true,
          after: true,
          ip: true,
          userAgent: true,
          createdAt: true,
          actor: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ logs, total, page: pageNum, limit: take });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/admins/pending — ADMIN-role users with no assigned AdminRole
// #11 fix: use admins.read (not admins.write) — this is a read-only list
router.get('/pending', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('admins.read'), async (req, res, next) => {
  try {
    const { search } = req.query as Record<string, string>;

    const { skip, take, page: pageNum } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

    // Only surface ADMIN-role users — SUPER_ADMIN users without panel roles
    // are a degenerate state that can't be actioned here (their role is assigned
    // during the double-approval creation flow, not from this page).
    const baseCondition = {
      role: 'ADMIN' as UserRole,
      adminRoles: { none: {} },
    };

    const where: Parameters<typeof prisma.user.findMany>[0]['where'] = search
      ? {
          AND: [
            baseCondition,
            {
              OR: [
                { email: { contains: search, mode: 'insensitive' } },
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
              ],
            },
          ],
        }
      : baseCondition;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page: pageNum, limit: take });
  } catch (error) {
    next(error);
  }
});

// Spec §9: Dual-approval requests expire after 72 hours. Computed once per request
// to give a consistent cutoff across all queries in this handler.
const PENDING_SUPER_ADMIN_TTL_MS = 72 * 60 * 60 * 1000; // 72h in milliseconds

// GET /api/admin/admins/pending-super — list pending SUPER_ADMIN creation requests
// N6 fix: requests older than 72h are excluded from the list (spec §9 expiry).
// #12 fix: use admins.read (not admins.write) — this is a read-only list
router.get('/pending-super', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('admins.read'), async (req, res, next) => {
  try {
    const { skip, take, page: pageNum } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

    // FINDING 1 fix: use persisted expiresAt column instead of recomputing from createdAt + TTL.
    // This ensures that if TTL changes, existing requests still expire at their original scheduled time.
    const now = new Date();
    const where = { expiresAt: { gt: now } };

    const [requests, total] = await Promise.all([
      prisma.pendingSuperAdminRequest.findMany({
        skip,
        take,
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          createdAt: true,
          expiresAt: true,
          requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.pendingSuperAdminRequest.count({ where }),
    ]);

    res.json({ requests, total, page: pageNum, limit: take });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/admins/pending-all — combined view of all pending approval types (§10.3)
// Returns role-assignment-pending admins, pending SUPER_ADMIN creation requests, AND
// pending critical-action requests so dashboards show a unified approvals count.
// PARTNER_MANAGER (admins.actions.read only) receives an empty pendingRoleAssignments and
// pendingSuperAdmins — they should only see critical-action requests they submitted.
router.get('/pending-all', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission(['admins.read', 'admins.actions.read']), async (req: AuthRequest, res, next) => {
  try {
    const hasAdminsRead = req.user!.role === 'SUPER_ADMIN' || (req.user!.permissions ?? []).includes('admins.read');

    // FINDING 1 fix: use persisted expiresAt column instead of recomputing from createdAt + TTL.
    // This ensures that if TTL changes, existing requests still expire at their original scheduled time.
    const now = new Date();

    const [pendingRoleAssignments, pendingSuperAdmins, pendingCriticalActions] = await Promise.all([
      hasAdminsRead
        ? prisma.user.findMany({
            where: { role: 'ADMIN' as UserRole, adminRoles: { none: {} } },
            orderBy: { createdAt: 'desc' },
            select: { id: true, email: true, firstName: true, lastName: true, status: true, createdAt: true },
          })
        : Promise.resolve([]),
      hasAdminsRead
        ? prisma.pendingSuperAdminRequest.findMany({
            where: { expiresAt: { gt: now } },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              createdAt: true,
              expiresAt: true,
              requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          })
        : Promise.resolve([]),
      prisma.criticalActionRequest.findMany({
        where: {
          status: 'PENDING',
          // Callers with only admins.actions.read (e.g. PARTNER_MANAGER) must see
          // only their own submissions — they must not read other roles' payloads
          // (BULK_PAYOUT_OVERRIDE amounts, PARTNER_ARCHIVE targets, etc.).
          // Callers with admins.read (ADMIN) or SUPER_ADMIN see the full queue.
          ...(hasAdminsRead ? {} : { requestedById: req.user!.id }),
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          actionType: true,
          payload: true,
          note: true,
          createdAt: true,
          requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    res.json({
      pendingRoleAssignments,
      pendingSuperAdmins,
      pendingCriticalActions,
      total: pendingRoleAssignments.length + pendingSuperAdmins.length + pendingCriticalActions.length,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/admins/critical-actions — list critical action requests (§10.3)
// Accessible with admins.read (full admin management) OR admins.actions.read (PARTNER_MANAGER:
// lets them see the pending partner changes queue without exposing admin user listings).
const CRITICAL_ACTION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const;
router.get('/critical-actions', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission(['admins.read', 'admins.actions.read']), async (req: AuthRequest, res, next) => {
  try {
    const rawStatus = typeof req.query.status === 'string' ? req.query.status : 'PENDING';
    if (!(CRITICAL_ACTION_STATUSES as readonly string[]).includes(rawStatus)) {
      return res.status(400).json({ error: `status must be one of: ${CRITICAL_ACTION_STATUSES.join(', ')}` });
    }
    const status = rawStatus;
    const { skip, page, limit } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

    // Callers with only admins.actions.read (e.g. PARTNER_MANAGER) must see only
    // their own submissions; admins.read callers and SUPER_ADMIN see the full queue.
    const hasAdminsRead = req.user!.role === 'SUPER_ADMIN' || (req.user!.permissions ?? []).includes('admins.read');
    const scopeFilter = hasAdminsRead ? {} : { requestedById: req.user!.id };
    const where = { ...scopeFilter, ...(status !== 'ALL' ? { status } : {}) };
    const [items, total] = await Promise.all([
      prisma.criticalActionRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          resolvedBy:  { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.criticalActionRequest.count({ where }),
    ]);
    res.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/admins/critical-actions — submit a new critical action request (§10.3)
router.post('/critical-actions', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('admins.write'), async (req: AuthRequest, res, next) => {
  try {
    const { actionType, payload, note } = req.body as { actionType?: string; payload?: unknown; note?: string };
    if (!actionType?.trim()) return res.status(400).json({ error: 'actionType is required' });
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'payload (object) is required' });

    const item = await prisma.criticalActionRequest.create({
      data: {
        actionType: actionType.trim(),
        payload: payload as object,
        note: note?.trim() || null,
        requestedById: req.user!.id,
        status: 'PENDING',
      },
      include: {
        requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    req.skipAudit = true;
    await writeAudit({
      actorUserId: req.user!.id,
      action: 'admin.critical-action.request',
      objectType: 'admin',
      objectId: item.id,
      after: { actionType: item.actionType, note: item.note },
      ip: getClientIp(req) ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });

    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/admins/critical-actions/:id/approve — SUPER_ADMIN approves (§10.3)
router.post('/critical-actions/:id/approve', authenticate, authorize('SUPER_ADMIN'), requirePermission('admins.write'), async (req: AuthRequest, res, next) => {
  try {
    const { note } = req.body as { note?: string };
    const item = await prisma.criticalActionRequest.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Critical action request not found' });
    if (item.status !== 'PENDING') return res.status(400).json({ error: 'Request is no longer pending' });
    if (item.requestedById === req.user!.id) return res.status(400).json({ error: 'Cannot approve your own critical action request' });

    // Block approval if a DISCOUNT_RATE_CHANGE payload is malformed.  The old
    // approach (silent-continue + 200) left the request APPROVED with no actual
    // rate change — an undetectable data inconsistency.  The previous pass
    // hardened this to a 422 but left the request PENDING, creating two
    // operational gaps:
    //   Lock   — a payload with partnerId but no proposedRate matches the 409
    //            duplicate-guard in propose-discount-rate, blocking new proposals
    //            until a second SUPER_ADMIN manually rejects the stuck request.
    //   Orphan — a payload without partnerId skips the 409 duplicate-guard
    //            entirely, leaving the malformed request in PENDING forever.
    // Fix: auto-reject (status → REJECTED) before returning 422.  The request
    // leaves the PENDING queue immediately so a corrected proposal can be
    // re-submitted without manual SUPER_ADMIN intervention.
    //
    // The two checks (non-object payload and missing keys) are merged into a
    // single isPlainObject gate that is evaluated before using the `in` operator.
    // `in` throws TypeError on null/primitive values; `typeof null === 'object'`
    // in JS, so null must be checked explicitly.
    if (item.actionType === 'DISCOUNT_RATE_CHANGE') {
      const raw = item.payload;
      const isPlainObject = raw !== null && typeof raw === 'object' && !Array.isArray(raw);
      if (!isPlainObject || !('partnerId' in (raw as Record<string, unknown>)) || !('proposedRate' in (raw as Record<string, unknown>))) {
        logger.error('[critical-action] DISCOUNT_RATE_CHANGE payload malformed — auto-rejecting', {
          requestId: item.id,
          payload: item.payload,
        });
        const systemNote = 'Auto-rejected: malformed payload (missing partnerId or proposedRate)';
        // Capture a single timestamp so the DB row and the audit log record the
        // identical resolvedAt — two separate new Date() calls across an await
        // would produce millisecond-skewed values that cannot be correlated exactly.
        const now = new Date();
        await prisma.criticalActionRequest.update({
          where: { id: req.params.id },
          data: { status: 'REJECTED', resolvedById: req.user!.id, resolvedAt: now, resolvedNote: systemNote },
        });
        // skipAudit suppresses auditMiddleware's automatic entry for this request.
        // Set synchronously before res.json() so the monkey-patched res.json() in
        // auditMiddleware always observes it — no race is possible in the
        // single-threaded Node.js model.
        req.skipAudit = true;
        // Await the audit write — the auto-reject is a security-sensitive event and
        // its audit record must be committed before responding.  If the write fails,
        // the error is caught, logged, and the 422 is still returned (the DB reject
        // has already committed so the caller must be told).  Ops can investigate via
        // the logger output rather than facing a silent audit gap.
        try {
          await writeAudit({
            actorUserId: req.user!.id,
            action: 'admin.critical-action.auto-reject',
            objectType: 'admin',
            objectId: item.id,
            before: { status: 'PENDING', actionType: item.actionType },
            after: { status: 'REJECTED', resolvedById: req.user!.id, resolvedAt: now.toISOString(), resolvedNote: systemNote },
            ip: getClientIp(req) ?? null,
            userAgent: req.headers['user-agent'] ?? null,
          });
        } catch (auditErr) {
          logger.error('[critical-action] auto-reject audit write failed:', auditErr);
        }
        return res.status(422).json({
          error: 'Malformed DISCOUNT_RATE_CHANGE payload — request automatically rejected. Re-submit with a corrected payload.',
          autoRejected: true,
        });
      }
      const p = raw as { partnerId?: string; proposedRate?: number | null; currentRate?: number | null };
      if (!('currentRate' in p)) {
        logger.warn('[critical-action] DISCOUNT_RATE_CHANGE payload missing currentRate — audit before will be null', {
          requestId: item.id,
        });
      }
    }

    // Execute the status flip and any actionType side-effect atomically so we
    // never end up with a request marked APPROVED but the underlying change not
    // applied (or vice-versa) due to a mid-flight error.
    let discountRateAudit: { partnerId: string; previousRate: number | null; newRate: number | null } | null = null;

    // Capture a single timestamp so the DB row and audit log record the identical
    // resolvedAt — consistent with the same pattern used in the auto-reject path above.
    const approvedAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.criticalActionRequest.update({
        where: { id: req.params.id },
        data: { status: 'APPROVED', resolvedById: req.user!.id, resolvedAt: approvedAt, resolvedNote: note?.trim() || null },
      });

      if (item.actionType === 'DISCOUNT_RATE_CHANGE') {
        // Payload is pre-validated above; types are now narrowed.
        const p = item.payload as { partnerId: string; proposedRate: number | null; currentRate?: number | null };
        await tx.partner.update({
          where: { id: p.partnerId },
          data: { discountRate: p.proposedRate ?? null },
        });
        discountRateAudit = {
          partnerId: p.partnerId,
          previousRate: 'currentRate' in p ? (p.currentRate ?? null) : null,
          newRate: p.proposedRate ?? null,
        };
      }

      return result;
    });

    // Write the partner-rate audit entry outside the transaction (AuditLog
    // writes are fire-and-forget and don't need to be atomic with the rate change).
    if (discountRateAudit) {
      detach(writeAudit({
        actorUserId: req.user!.id,
        action: 'partner.discount-rate.update',
        objectType: 'Partner',
        objectId: discountRateAudit.partnerId,
        before: { discountRate: discountRateAudit.previousRate },
        after: { discountRate: discountRateAudit.newRate, via: 'critical-action', requestId: item.id },
        ip: getClientIp(req) ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      }), (err) => logger.error('[critical-action] discount-rate audit write failed:', err));
    }

    req.skipAudit = true;
    await writeAudit({
      actorUserId: req.user!.id,
      action: 'admin.critical-action.approve',
      objectType: 'admin',
      objectId: item.id,
      before: { status: 'PENDING', actionType: item.actionType },
      after: { status: 'APPROVED', resolvedNote: note?.trim() || null },
      ip: getClientIp(req) ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });

    res.json({ item: updated });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/admins/critical-actions/:id/reject — SUPER_ADMIN rejects (§10.3)
router.post('/critical-actions/:id/reject', authenticate, authorize('SUPER_ADMIN'), requirePermission('admins.write'), async (req: AuthRequest, res, next) => {
  try {
    const { note } = req.body as { note?: string };
    if (!note?.trim()) return res.status(400).json({ error: 'note (rejection reason) is required' });
    const item = await prisma.criticalActionRequest.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Critical action request not found' });
    if (item.status !== 'PENDING') return res.status(400).json({ error: 'Request is no longer pending' });
    if (item.requestedById === req.user!.id) return res.status(400).json({ error: 'Cannot reject your own critical action request' });

    const updated = await prisma.criticalActionRequest.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED', resolvedById: req.user!.id, resolvedAt: new Date(), resolvedNote: note.trim() },
    });

    req.skipAudit = true;
    await writeAudit({
      actorUserId: req.user!.id,
      action: 'admin.critical-action.reject',
      objectType: 'admin',
      objectId: item.id,
      before: { status: 'PENDING', actionType: item.actionType },
      after: { status: 'REJECTED', resolvedNote: note.trim() },
      ip: getClientIp(req) ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });

    res.json({ item: updated });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/admins — list all admin users with their roles
router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('admins.read'), async (req, res, next) => {
  try {
    const { search, roleKey } = req.query as Record<string, string>;

    const { skip, take, page: pageNum } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

    const where: Parameters<typeof prisma.user.findMany>[0]['where'] = {
      role: { in: ['ADMIN', 'SUPER_ADMIN'] as UserRole[] },
    };

    if (roleKey && Object.values(AdminRoleKey).includes(roleKey as AdminRoleKey)) {
      where.adminRoles = { some: { role: { key: roleKey as AdminRoleKey } } };
    }
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [admins, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          mustChangePassword: true,
          totpEnabledAt: true,
          adminRoles: {
            select: {
              id: true,
              grantedAt: true,
              role: { select: { id: true, key: true, label: true } },
              grantedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const result = admins.map(({ totpEnabledAt, ...a }) => ({
      ...a,
      twoFactorEnabled: totpEnabledAt !== null,
    }));

    res.json({ admins: result, total, page: pageNum, limit: take });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/admins — create a new admin user.
// Creating with roleKey=SUPER_ADMIN does NOT immediately create the User — it
// stores a PendingSuperAdminRequest that a second admin must approve.
router.post('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('admins.write'), async (req: AuthRequest, res, next) => {
  try {
    const { email, firstName, lastName, phone, password, roleKey } = req.body as {
      email: string;
      firstName: string;
      lastName: string;
      phone: string;
      password: string;
      roleKey: AdminRoleKey;
    };

    if (!email || !password || !roleKey) {
      return res.status(400).json({ error: 'email, password, and roleKey are required' });
    }
    if (!Object.values(AdminRoleKey).includes(roleKey)) {
      return res.status(400).json({ error: 'Invalid roleKey' });
    }
    const trimmedFirstName = firstName?.trim();
    const trimmedLastName = lastName?.trim();
    const trimmedPhone = phone?.trim();

    if (!trimmedFirstName || !trimmedLastName) {
      return res.status(400).json({ error: 'firstName and lastName are required' });
    }
    if (!trimmedPhone) {
      return res.status(400).json({ error: 'phone is required' });
    }

    if (roleKey === AdminRoleKey.SUPER_ADMIN) {
      // Spec §3.9 step 1 — only a Super Admin may INITIATE a Super-Admin creation
      // request. A Standard Admin holding admins.write can create regular admins but
      // must not be able to start the dual-approval flow for a new Super Admin.
      // (Approval is already SUPER_ADMIN-only on the /approve route.)
      if (req.user!.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Only a Super Admin may initiate a Super Admin creation request' });
      }
      // Double-approval gate: store the request for a second admin to approve.
      // Pre-check: reject immediately if an admin (ADMIN or SUPER_ADMIN) with this email already exists.
      // DEFECT 1 fix: User.email is unique per (email, role), so an email can exist as both ADMIN and SUPER_ADMIN.
      // To prevent same-email ADMIN+SUPER_ADMIN coexistence, check both roles here at initiation.
      const existingUser = await prisma.user.findFirst({
        where: { email, role: { in: ['ADMIN', 'SUPER_ADMIN'] as UserRole[] } },
      });
      if (existingUser) {
        return res.status(409).json({ error: 'An admin (ADMIN or SUPER_ADMIN) with this email already exists' });
      }
      // FINDING 2 fix: scope duplicate guard to live rows only. Expired-but-undeleted
      // requests must not block re-submission of the same email.
      const now = new Date();
      const existing = await prisma.pendingSuperAdminRequest.findFirst({
        where: { email, expiresAt: { gt: now } },
      });
      if (existing) {
        return res.status(409).json({ error: 'A pending SUPER_ADMIN request for this email already exists' });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      let request: { id: string; email: string; firstName: string | null; lastName: string | null; createdAt: Date };
      try {
        request = await prisma.pendingSuperAdminRequest.create({
          data: {
            email,
            firstName: trimmedFirstName,
            lastName: trimmedLastName,
            phone: trimmedPhone,
            passwordHash,
            status: 'PENDING',
            expiresAt: new Date(Date.now() + PENDING_SUPER_ADMIN_TTL_MS),
            requestedBy: { connect: { id: req.user!.id } },
          },
          select: { id: true, email: true, firstName: true, lastName: true, createdAt: true },
        });
      } catch (err: unknown) {
        const isPrismaConflict = typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
        if (isPrismaConflict) {
          // DEFECT 2 fix: check if the colliding row is expired. If so, delete it and retry.
          // This allows re-submission after a pending request expires.
          const now = new Date();
          const expiredCollision = await prisma.pendingSuperAdminRequest.findFirst({
            where: { email, expiresAt: { lte: now } },
          });
          if (expiredCollision) {
            // Delete the expired row and retry the creation
            await prisma.pendingSuperAdminRequest.delete({ where: { id: expiredCollision.id } });
            try {
              request = await prisma.pendingSuperAdminRequest.create({
                data: {
                  email,
                  firstName: trimmedFirstName,
                  lastName: trimmedLastName,
                  phone: trimmedPhone,
                  passwordHash,
                  status: 'PENDING',
                  expiresAt: new Date(Date.now() + PENDING_SUPER_ADMIN_TTL_MS),
                  requestedBy: { connect: { id: req.user!.id } },
                },
                select: { id: true, email: true, firstName: true, lastName: true, createdAt: true },
              });
            } catch (retryErr: unknown) {
              // If retry also fails with P2002, there's a live pending request (not expired)
              return res.status(409).json({ error: 'A pending SUPER_ADMIN request for this email already exists' });
            }
          } else {
            // The collision is not expired; reject with 409
            return res.status(409).json({ error: 'A pending SUPER_ADMIN request for this email already exists' });
          }
        } else {
          throw err;
        }
      }
      req.auditAction = 'admin.super.request';
      req.auditObjectId = request.id;
      return res.status(202).json({ ok: true, pending: true, request });
    }

    const adminRole = await prisma.adminRole.findUnique({ where: { key: roleKey } });
    if (!adminRole) return res.status(400).json({ error: 'Role not found in DB — run seed-permissions first' });

    // Explicit pre-check: User.email is not unique in the schema (multiple accounts may
    // share contact info by design), so P2002 would never fire for a duplicate email.
    // Guard here instead so the error message is accurate and deterministic.
    const existingAdmin = await prisma.user.findFirst({
      where: { email, role: { in: ['ADMIN', 'SUPER_ADMIN'] as UserRole[] } },
    });
    if (existingAdmin) {
      return res.status(409).json({ error: 'An admin with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    let user;
    try {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
          phone: trimmedPhone,
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
          mustChangePassword: true,
          adminRoles: {
            create: { roleId: adminRole.id, grantedById: req.user!.id },
          },
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          createdAt: true,
        },
      });
    } catch (err) {
      // BC-QA-032 — the pre-check above only covers email; a phone collision
      // on the new (phone, role) unique constraint would otherwise fall
      // through to the generic outer catch as an unlabeled 409.
      if (isPhoneRoleUniqueViolation(err)) {
        return res.status(409).json({ error: 'An admin with this phone number already exists', code: 'AUTH_PHONE_ALREADY_REGISTERED' });
      }
      throw err;
    }

    req.auditObjectId = user.id;
    res.status(201).json({ ok: true, user });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/admins/pending-super/:id/approve — second SUPER_ADMIN approves a SUPER_ADMIN creation request.
// Restricted to SUPER_ADMIN so that a regular ADMIN cannot unilaterally grant SUPER_ADMIN access.
// The approver must also be a different person from the original requester.
router.post('/pending-super/:id/approve', authenticate, authorize('SUPER_ADMIN'), requirePermission('admins.write'), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    const request = await prisma.pendingSuperAdminRequest.findUnique({
      where: { id },
      include: { requestedBy: { select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true } } },
    });
    if (!request) return res.status(404).json({ error: 'Pending request not found' });

    // Null-guard: legacy rows may have null firstName/lastName/phone (stored before validation was enforced).
    // Reject with 422 rather than letting tx.user.create hit a DB NOT NULL violation and 500.
    if (!request.firstName || !request.lastName || !request.phone) {
      return res.status(422).json({
        error: 'This pending request is missing required fields (firstName, lastName, or phone). Please cancel it and resubmit with complete details.',
      });
    }

    // FINDING 1 fix: use persisted expiresAt column instead of recomputing from createdAt + TTL.
    // This ensures that if TTL changes, existing requests still expire at their original scheduled time.
    if (request.expiresAt && request.expiresAt.getTime() < Date.now()) {
      return res.status(410).json({
        error: 'This pending SUPER_ADMIN creation request has expired (72h window). ' +
               'Please submit a new request.',
      });
    }

    // Spec §3.9 / Clash 13.3 — anti-self-approval: the initiator cannot approve their own request.
    // Bootstrap exception: the spec wording is "if only one Super Admin EXISTS in the system."
    // H2 fix: the quorum must be computed on TOTAL existing (non-archived) Super Admins, NOT
    // active-only. Counting active-only is a privilege-escalation hole: if every other SA is
    // INACTIVE/SUSPENDED, the sole *active* SA would falsely qualify for the bootstrap
    // self-approval and unilaterally create a new SUPER_ADMIN. An INACTIVE/SUSPENDED SA still
    // EXISTS, can be reactivated, and is a second human party for the 2-of-N protocol — so it
    // counts toward "exists." Only ARCHIVED (decommissioned, terminal, never logs in) is
    // excluded. SUSPENDED is functionally Archived for login but is NOT terminal/decommissioned
    // per §1.5 legacy note, so we conservatively count it as existing.

    const superAdminRole = await prisma.adminRole.upsert({
      where: { key: AdminRoleKey.SUPER_ADMIN },
      update: {},
      create: { key: AdminRoleKey.SUPER_ADMIN, label: 'Super Administrator' },
    });

    // DEFECT 1 fix (pre-check in approval): reject if an admin (ADMIN or SUPER_ADMIN) with this email already exists.
    // This provides a clear error message before the transaction attempt, preventing ambiguous P2002 conflicts.
    const existingAdminAtApproval = await prisma.user.findFirst({
      where: { email: request.email, role: { in: ['ADMIN', 'SUPER_ADMIN'] as UserRole[] } },
    });
    if (existingAdminAtApproval) {
      return res.status(409).json({ error: 'An admin (ADMIN or SUPER_ADMIN) with this email already exists' });
    }

    // DEFECT 3 fix: wrap bootstrap quorum check + user.create in Serializable transaction to prevent TOCTOU race.
    // If only 1 SA exists and two self-approve requests fire concurrently, one can slip through and violate 2-of-N rule.
    // By checking quorum and creating within the same Serializable transaction, we ensure exactly one succeeds.
    // H2 fix: count non-ARCHIVED SAs (not just ACTIVE) to close privilege-escalation hole. Bootstrap exception applies
    // only when 1 non-archived SA exists (whether ACTIVE, INACTIVE, or SUSPENDED).
    //
    // SA-APPROVE-INITIATOR fix: validate that the original initiator is still an active SUPER_ADMIN at approval time.
    // Reload the initiator from the database to re-check role and status, preventing weakening of 2-of-N when the
    // initiator is archived or demoted between initiation and approval.
    let user: { id: string; email: string; firstName: string; lastName: string; role: UserRole; status: UserStatus; createdAt: Date };
    try {
      user = await prisma.$transaction(async (tx) => {
        // Re-check self-approval gate INSIDE transaction with Serializable isolation.
        if (request.requestedById === req.user!.id) {
          const existingSuperAdminCount = await tx.user.count({
            where: { role: 'SUPER_ADMIN', status: { not: 'ARCHIVED' } },
          });
          if (existingSuperAdminCount > 1) {
            throw new Error('FORBIDDEN:The approver must be a different admin from the original requester');
          }
          // Bootstrap exception: only one Super Admin exists (non-archived) → sole SA may self-approve
        } else {
          // Non-self-approval: validate that the original initiator is still an ACTIVE SUPER_ADMIN.
          // If the initiator is archived, demoted, or otherwise ineligible, reject the approval.
          const initiator = await tx.user.findUnique({
            where: { id: request.requestedById },
            select: { role: true, status: true },
          });
          if (!initiator) {
            throw new Error('FORBIDDEN:The original initiator no longer exists');
          }
          if (initiator.role !== 'SUPER_ADMIN') {
            throw new Error('FORBIDDEN:The original initiator is no longer a SUPER_ADMIN (role was revoked or changed)');
          }
          if (initiator.status !== 'ACTIVE') {
            throw new Error('FORBIDDEN:The original initiator is no longer available to approve this request');
          }
        }

        // Create user and delete request atomically within same Serializable transaction.
        const [createdUser] = await tx.$transaction([
          tx.user.create({
            data: {
              email: request.email,
              passwordHash: request.passwordHash,
              firstName: request.firstName,
              lastName: request.lastName,
              phone: request.phone,
              role: 'SUPER_ADMIN',
              status: 'ACTIVE',
              emailVerified: true,
              mustChangePassword: true,
              adminRoles: {
                create: { roleId: superAdminRole.id, grantedById: req.user!.id },
              },
            },
            select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, createdAt: true },
          }),
          tx.pendingSuperAdminRequest.delete({ where: { id } }),
        ]);

        return createdUser;
      }, {
        isolationLevel: 'Serializable',
        timeout: 30000,
      });
    } catch (err: unknown) {
      // Handle guard failures thrown inside transaction
      if (typeof err === 'object' && err !== null && (err as { message?: string }).message?.startsWith('FORBIDDEN:')) {
        const msg = (err as { message: string }).message.replace('FORBIDDEN:', '');
        return res.status(403).json({ error: msg });
      }
      // Serializable isolation can trigger conflicts (P2034)
      if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2034') {
        return res.status(409).json({ error: 'Concurrent modification detected — please retry' });
      }
      // BC-QA-032 — the pre-check above only covers email; a phone collision
      // on the new (phone, role) unique constraint would otherwise be
      // misdiagnosed as an email conflict below. Check phone first.
      if (isPhoneRoleUniqueViolation(err)) {
        return res.status(409).json({ error: 'An admin with this phone number already exists', code: 'AUTH_PHONE_ALREADY_REGISTERED' });
      }
      // Email conflict (P2002) — should not happen due to pre-check, but handle gracefully
      const isPrismaConflict = typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
      if (isPrismaConflict) {
        return res.status(409).json({ error: 'An admin with this email already exists' });
      }
      throw err;
    }

    req.skipAudit = true;
    await writeAudit({
      actorUserId: req.user!.id,
      action: 'admin.super.approve',
      objectType: 'admin',
      objectId: user.id,
      before: { pendingRequestId: id, email: request.email, requestedById: request.requestedById },
      after: { userId: user.id, email: user.email, role: user.role },
      ip: getClientIp(req) ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });

    // Notify the requester so they know their request was approved.
    if (request.requestedBy.email) {
      const requesterName = request.requestedBy.firstName || request.requestedBy.email;
      detach(emailService.sendEmail({
        to: request.requestedBy.email,
        subject: 'SUPER_ADMIN creation request approved — BoomCard',
        html: `<p>Здравей, ${requesterName},</p><p>Вашата заявка за нов SUPER_ADMIN акаунт (<strong>${request.email}</strong>) беше одобрена. Акаунтът е създаден.</p>`,
        text: `Здравей, ${requesterName},\n\nВашата заявка за нов SUPER_ADMIN акаунт (${request.email}) беше одобрена. Акаунтът е създаден.`,
      }), () => {});
    }

    res.status(201).json({ ok: true, user });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/admins/pending-super/:id — cancel/reject a pending SUPER_ADMIN request
// Restricted to SUPER_ADMIN — only the same level that can approve should be able to reject.
router.delete('/pending-super/:id', authenticate, authorize('SUPER_ADMIN'), requirePermission('admins.write'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const request = await prisma.pendingSuperAdminRequest.findUnique({
      where: { id },
      include: { requestedBy: { select: { email: true, firstName: true, lastName: true } } },
    });
    if (!request) return res.status(404).json({ error: 'Pending request not found' });

    // Spec §3.9 step 4 — only the initiating Super Admin may cancel/withdraw their own
    // pending request. The approval path is the separate second-actor action and remains
    // available to other SUPER_ADMINs; cancellation is initiator-restricted.
    if (request.requestedById !== (req as AuthRequest).user!.id) {
      return res.status(403).json({
        error: 'Only the SUPER_ADMIN who initiated this request may cancel it',
      });
    }

    await prisma.pendingSuperAdminRequest.delete({ where: { id } });
    req.skipAudit = true;
    await writeAudit({
      actorUserId: (req as AuthRequest).user!.id,
      action: 'admin.super.reject',
      objectType: 'admin',
      objectId: id,
      before: { pendingRequestId: id, email: request.email, requestedById: request.requestedById },
      after: null,
      ip: getClientIp(req) ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });

    // FINDING 3 fix: suppress email when request has already expired.
    // The requester should not be notified of rejection for an already-expired request.
    const hasExpired = request.expiresAt && request.expiresAt.getTime() <= Date.now();
    if (!hasExpired && request.requestedBy.email) {
      const requesterName = request.requestedBy.firstName || request.requestedBy.email;
      detach(emailService.sendEmail({
        to: request.requestedBy.email,
        subject: 'SUPER_ADMIN creation request rejected — BoomCard',
        html: `<p>Здравей, ${requesterName},</p><p>Вашата заявка за нов SUPER_ADMIN акаунт (<strong>${request.email}</strong>) беше отказана или анулирана.</p>`,
        text: `Здравей, ${requesterName},\n\nВашата заявка за нов SUPER_ADMIN акаунт (${request.email}) беше отказана или анулирана.`,
      }), () => {});
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/admins/:id — individual admin detail (#6)
router.get('/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('admins.read'), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        mustChangePassword: true,
        totpEnabledAt: true,
        adminRoles: {
          select: {
            id: true,
            grantedAt: true,
            role: { select: { id: true, key: true, label: true } },
            grantedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    const { totpEnabledAt, ...rest } = user;
    res.json({ ...rest, twoFactorEnabled: totpEnabledAt !== null });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/admins/:id/status — change an admin account's operational status.
// Spec §1.5 status enum: Active | Inactive | Archived
//
// Implementation mapping (UserStatus enum — ARCHIVED added in schema migration BC-SCHEMA-1):
//   ACTIVE    → spec Active    (full login, full operational rights)
//   INACTIVE  → spec Inactive  (login allowed, read-only only — aro JWT claim enforced in requirePermission)
//   SUSPENDED → legacy blocked (no login; superseded by ARCHIVED for new decommissions)
//   ARCHIVED  → spec Archived  (no login; account decommissioned/departed)
router.patch('/:id/status', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('admins.write'), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body as { status?: string; reason?: string };

    // Spec §1.5: Only a SUPER_ADMIN can change another admin's status.
    if (req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only a SUPER_ADMIN can change an admin\'s status' });
    }

    // L5 — SUSPENDED is legacy-only (spec §1.5: "new decommissions should use
    // ARCHIVED"). Reject it as a NEW input value here so this endpoint cannot
    // mint fresh SUSPENDED writes. Existing SUSPENDED rows are unaffected — this
    // only blocks the write path; reads elsewhere still surface legacy records.
    if (status === 'SUSPENDED') {
      return res.status(400).json({
        error: 'SUSPENDED is a legacy status and can no longer be set. Use ARCHIVED to decommission an admin account (no login), or INACTIVE for read-only access.',
      });
    }

    // Spec §1.5: valid admin statuses are Active, Inactive, Archived.
    // ARCHIVED is the canonical "no login" state (BC-SCHEMA-1).
    const VALID_ADMIN_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
    if (!VALID_ADMIN_STATUSES.includes(status as typeof VALID_ADMIN_STATUSES[number])) {
      return res.status(400).json({
        error: 'status must be one of: ACTIVE (Active), INACTIVE (Inactive — read-only), ARCHIVED (Archived — no login)',
      });
    }
    // Require a reason when deactivating or archiving (INACTIVE or ARCHIVED)
    if ((status === 'INACTIVE' || status === 'ARCHIVED') && !reason?.trim()) {
      return res.status(400).json({ error: 'reason is required when setting an admin account to INACTIVE or ARCHIVED' });
    }

    // Prevent self-demotion
    if (id === req.user!.id) {
      return res.status(400).json({ error: 'You cannot change your own status' });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || (target.role !== 'ADMIN' && target.role !== 'SUPER_ADMIN')) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // L4 — the former "target is SUPER_ADMIN && actor is not SUPER_ADMIN" guard
    // was dead code: line ~911 already 403s any non-SUPER_ADMIN actor before we
    // reach here, so req.user.role is always SUPER_ADMIN at this point. Removed
    // without changing observable behaviour (the cross-privilege protection is
    // fully provided by the earlier actor-role check).

    // DEFECT 1 fix: wrap last-active-SA guard + status update in Serializable transaction to prevent TOCTOU race.
    // Two concurrent archive requests could both see >0 active SAs, both think archiving leaves ≥1 active,
    // both commit, resulting in 0 active SAs. Serializable isolation prevents this by detecting concurrent
    // modifications and forcing retry. Guard is re-checked INSIDE the transaction.
    // §1.5: count only ACTIVE SAs — INACTIVE/SUSPENDED SAs cannot perform write operations and must not
    // count toward the liveness quorum.
    const beforeStatus = target.status;
    let updated: { id: string; status: UserStatus };
    try {
      updated = await prisma.$transaction(async (tx) => {
        // Re-check invariant INSIDE transaction with Serializable isolation.
        // This ensures no other transaction can mutate the guard condition between our check and write.
        if (target.role === 'SUPER_ADMIN' && (status === 'INACTIVE' || status === 'ARCHIVED')) {
          const activeSuperAdmins = await tx.user.count({
            where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: id } },
          });
          if (activeSuperAdmins === 0) {
            throw new Error('GUARD_FAILED:Cannot deactivate the last active SUPER_ADMIN');
          }
        }

        return await tx.user.update({
          where: { id },
          data: {
            status: status as UserStatus,
            // Stamp rolesUpdatedAt whenever status changes to a no-login state so the
            // authenticate middleware invalidates any existing access tokens immediately.
            // L5/LOW-2: SUSPENDED is unreachable here (rejected above + off the whitelist),
            // so only ARCHIVED remains as a settable no-login state.
            ...(status === 'ARCHIVED' ? { rolesUpdatedAt: new Date() } : {}),
          },
          select: { id: true, status: true },
        });
      }, {
        isolationLevel: 'Serializable',
        timeout: 30000,
      });
    } catch (txErr: unknown) {
      // Handle guard failures thrown inside transaction
      if (typeof txErr === 'object' && txErr !== null && (txErr as { message?: string }).message?.startsWith('GUARD_FAILED:')) {
        const msg = (txErr as { message: string }).message.replace('GUARD_FAILED:', '');
        return res.status(409).json({ error: msg });
      }
      // Serializable isolation can trigger conflicts if concurrent mutations race (P2034).
      // Retry the transaction (may succeed if the concurrent mutation resolved the race).
      if (typeof txErr === 'object' && txErr !== null && (txErr as { code?: string }).code === 'P2034') {
        try {
          // Re-fetch target to check for any schema/state changes
          const refreshedTarget = await prisma.user.findUnique({ where: { id } });
          if (!refreshedTarget || (refreshedTarget.role !== 'ADMIN' && refreshedTarget.role !== 'SUPER_ADMIN')) {
            return res.status(404).json({ error: 'Admin not found' });
          }

          try {
            updated = await prisma.$transaction(async (tx) => {
              if (refreshedTarget.role === 'SUPER_ADMIN' && (status === 'INACTIVE' || status === 'ARCHIVED')) {
                const activeSuperAdmins = await tx.user.count({
                  where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: id } },
                });
                if (activeSuperAdmins === 0) {
                  throw new Error('GUARD_FAILED:Cannot deactivate the last active SUPER_ADMIN');
                }
              }

              return await tx.user.update({
                where: { id },
                data: {
                  status: status as UserStatus,
                  ...(status === 'ARCHIVED' ? { rolesUpdatedAt: new Date() } : {}),
                },
                select: { id: true, status: true },
              });
            }, {
              isolationLevel: 'Serializable',
              timeout: 30000,
            });
          } catch (retryErr: unknown) {
            if (typeof retryErr === 'object' && retryErr !== null && (retryErr as { message?: string }).message?.startsWith('GUARD_FAILED:')) {
              const msg = (retryErr as { message: string }).message.replace('GUARD_FAILED:', '');
              return res.status(409).json({ error: msg });
            }
            // If retry transaction also fails with P2034, return 409
            if (typeof retryErr === 'object' && retryErr !== null && (retryErr as { code?: string }).code === 'P2034') {
              return res.status(409).json({ error: 'Concurrent modification detected — please retry' });
            }
            throw retryErr;
          }
        } catch (error) {
          throw error;
        }
      } else {
        throw txErr;
      }
    }

    req.skipAudit = true;
    await writeAudit({
      actorUserId: req.user!.id,
      action: 'admin.status',
      objectType: 'admin',
      objectId: id,
      before: { status: beforeStatus },
      // Spec §1.5: include spec-level label in audit for clarity
      after: {
        status,
        // L5/LOW-2: SUSPENDED is unreachable here (rejected above + off the whitelist),
        // so the SUSPENDED specLabel branch was dead and has been removed. Only
        // ACTIVE / INACTIVE / ARCHIVED can reach this point.
        specLabel: status === 'ACTIVE' ? 'Active' : status === 'INACTIVE' ? 'Inactive (read-only)' : 'Archived (no login)',
        reason: reason?.trim() || null,
      },
      ip: getClientIp(req) ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });

    res.json({ ok: true, ...updated });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/admins/:id/approve — assign a role to a pending admin
// Optional body field: expiresAt (ISO 8601) — creates a time-bounded role assignment
// that is automatically excluded from resolveUserPermissions once it lapses, and
// triggers a forced re-login via the authenticate() expiry guard (Gap 3 fix).
router.post('/:id/approve', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('admins.write'), async (req: AuthRequest, res, next) => {
  try {
    const { roleKey, expiresAt } = req.body as { roleKey: AdminRoleKey; expiresAt?: string };

    if (!roleKey || !Object.values(AdminRoleKey).includes(roleKey)) {
      return res.status(400).json({ error: 'Valid roleKey is required' });
    }
    // Assigning SUPER_ADMIN via this endpoint would create a split state:
    // UserAdminRole=SUPER_ADMIN but user.role=ADMIN (auth middleware checks user.role).
    // SUPER_ADMIN creation must go through the double-approval flow.
    if (roleKey === AdminRoleKey.SUPER_ADMIN) {
      return res.status(400).json({
        error: 'SUPER_ADMIN role cannot be assigned via this endpoint. Use the creation flow: POST /api/admin/admins with roleKey=SUPER_ADMIN.',
      });
    }

    let expiresAtDate: Date | null = null;
    if (expiresAt !== undefined && expiresAt !== null) {
      expiresAtDate = new Date(expiresAt);
      if (isNaN(expiresAtDate.getTime())) {
        return res.status(400).json({ error: 'Invalid expiresAt — use an ISO 8601 date string' });
      }
      if (expiresAtDate <= new Date()) {
        return res.status(400).json({ error: 'expiresAt must be in the future' });
      }
    }

    const [user, adminRole] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.params.id } }),
      prisma.adminRole.findUnique({ where: { key: roleKey } }),
    ]);

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return res.status(400).json({ error: 'User is not an admin' });
    }
    if (!adminRole) return res.status(400).json({ error: 'Role not found — run seed-permissions first' });

    const existingRoles = await prisma.userAdminRole.findMany({
      where: { userId: user.id },
      select: { role: { select: { key: true } } },
    });
    const beforeRoles = existingRoles.map((r) => r.role.key);

    await prisma.userAdminRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
      create: { userId: user.id, roleId: adminRole.id, grantedById: req.user!.id, expiresAt: expiresAtDate },
      update: { grantedById: req.user!.id, grantedAt: new Date(), expiresAt: expiresAtDate },
    });
    // Stamp rolesUpdatedAt so any in-flight JWTs for this user are rejected by
    // authenticate() until the user re-logs in with a fresh permission set.
    await prisma.user.update({ where: { id: user.id }, data: { rolesUpdatedAt: new Date() } });

    req.skipAudit = true;
    await writeAudit({
      actorUserId: req.user!.id,
      action: 'admin.approve',
      objectType: 'admin',
      objectId: user.id,
      before: { roles: beforeRoles },
      after: { addedRole: roleKey, expiresAt: expiresAtDate?.toISOString() ?? null },
      ip: getClientIp(req) ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/admins/:id/reset-2fa — SUPER_ADMIN clears another admin's 2FA.
// BC-ADMIN-2FA-RECOVERY-AND-FRONTEND-FIX-015 (a): recovers an admin who is locked
// out of their authenticator, WITHOUT manual DB surgery. Clears totpSecret,
// totpPendingSecret, totpEnabledAt and any backup recovery codes so the target can
// log in with just their password and re-enrol 2FA from scratch.
//
// Safeguard: a SUPER_ADMIN MUST NOT reset their OWN 2FA via this endpoint — that
// would let a single actor strip the second factor off their own account and defeat
// the whole control. Self-service disable lives on DELETE /api/admin/me/2fa
// (password-gated). Here, target == caller is a hard 403.
router.post('/:id/reset-2fa', authenticate, authorize('SUPER_ADMIN'), requirePermission('admins.write'), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    // Sole safeguard-bypass prevention: cannot reset your own 2FA here.
    if (id === req.user!.id) {
      return res.status(403).json({
        error: 'You cannot reset your own 2FA from here. Use DELETE /api/admin/me/2fa (password required).',
      });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, email: true, totpEnabledAt: true, totpPendingSecret: true },
    });
    if (!target || (target.role !== 'ADMIN' && target.role !== 'SUPER_ADMIN')) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    const wasEnabled = target.totpEnabledAt !== null;
    if (!wasEnabled && !target.totpPendingSecret) {
      return res.status(400).json({ error: 'This admin does not have 2FA enabled or in setup' });
    }

    await prisma.user.update({
      where: { id },
      data: {
        totpSecret: null,
        totpPendingSecret: null,
        totpEnabledAt: null,
        totpRecoveryCodes: [],
      },
    });

    req.skipAudit = true;
    await writeAudit({
      actorUserId: req.user!.id,
      action: 'admin.2fa.reset',
      objectType: 'admin',
      objectId: id,
      before: { twoFactorEnabled: wasEnabled },
      after: { twoFactorEnabled: false, resetBy: req.user!.id },
      ip: getClientIp(req) ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });

    res.json({ ok: true, message: '2FA has been reset for this admin' });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/admins/:id/roles/:roleKey — revoke a role from an admin
router.delete('/:id/roles/:roleKey', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('admins.roles.write'), async (req, res, next) => {
  try {
    const { id, roleKey } = req.params;

    if (!Object.values(AdminRoleKey).includes(roleKey as AdminRoleKey)) {
      return res.status(400).json({ error: 'Invalid roleKey' });
    }

    const adminRole = await prisma.adminRole.findUnique({ where: { key: roleKey as AdminRoleKey } });
    if (!adminRole) return res.status(404).json({ error: 'Role not found' });

    const existingRoles = await prisma.userAdminRole.findMany({
      where: { userId: id },
      select: { role: { select: { key: true } } },
    });
    const beforeRoles = existingRoles.map((r) => r.role.key);

    // DEFECT 2 fix: wrap SUPER_ADMIN role-revoke guard + delete in Serializable transaction to prevent TOCTOU race.
    // Two concurrent revoke requests could both see >0 other ACTIVE SUPER_ADMINs, both think revoking leaves ≥1,
    // both commit, resulting in 0 ACTIVE SUPER_ADMINs. Serializable isolation prevents this.
    // §1.5: count only ACTIVE SAs — INACTIVE/SUSPENDED SAs cannot perform write operations and must not
    // count toward the liveness quorum.
    if (roleKey === AdminRoleKey.SUPER_ADMIN) {
      // Removing SUPER_ADMIN must also downgrade User.role — authorization middleware
      // checks user.role directly, not UserAdminRole, so deleting only the junction row
      // would leave the user with full SUPER_ADMIN access.
      try {
        let deleteResult: { count: number };
        try {
          deleteResult = await prisma.$transaction(async (tx) => {
            // Re-check invariant INSIDE transaction with Serializable isolation.
            const remainingActiveSupers = await tx.user.count({
              where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: id } },
            });
            if (remainingActiveSupers === 0) {
              throw new Error('GUARD_FAILED:Cannot revoke the role of the last active SUPER_ADMIN');
            }

            const result = await tx.userAdminRole.deleteMany({ where: { userId: id, roleId: adminRole.id } });
            if (result.count === 0) {
              throw new Error('NOT_FOUND:Admin does not have this role');
            }

            await tx.user.update({ where: { id }, data: { role: 'ADMIN', rolesUpdatedAt: new Date() } });
            return result;
          }, {
            isolationLevel: 'Serializable',
            timeout: 30000,
          });
        } catch (txErr: unknown) {
          // Serializable conflict on first attempt — retry once
          if (typeof txErr === 'object' && txErr !== null && (txErr as { code?: string }).code === 'P2034') {
            deleteResult = await prisma.$transaction(async (tx) => {
              const remainingActiveSupers = await tx.user.count({
                where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: id } },
              });
              if (remainingActiveSupers === 0) {
                throw new Error('GUARD_FAILED:Cannot revoke the role of the last active SUPER_ADMIN');
              }

              const result = await tx.userAdminRole.deleteMany({ where: { userId: id, roleId: adminRole.id } });
              if (result.count === 0) {
                throw new Error('NOT_FOUND:Admin does not have this role');
              }

              await tx.user.update({ where: { id }, data: { role: 'ADMIN', rolesUpdatedAt: new Date() } });
              return result;
            }, {
              isolationLevel: 'Serializable',
              timeout: 30000,
            });
          } else {
            throw txErr;
          }
        }

        if (deleteResult.count === 0) {
          return res.status(404).json({ error: 'Admin does not have this role' });
        }
      } catch (txErr: unknown) {
        if (typeof txErr === 'object' && txErr !== null) {
          const msg = (txErr as { message?: string }).message || '';
          if (msg.startsWith('GUARD_FAILED:')) {
            return res.status(409).json({ error: msg.replace('GUARD_FAILED:', '') });
          }
          if (msg.startsWith('NOT_FOUND:')) {
            return res.status(404).json({ error: msg.replace('NOT_FOUND:', '') });
          }
          if ((txErr as { code?: string }).code === 'P2034') {
            // Serializable conflict persists even after retry — return 409
            return res.status(409).json({ error: 'Concurrent modification detected — please retry' });
          }
        }
        throw txErr;
      }
    } else {
      const { count } = await prisma.userAdminRole.deleteMany({ where: { userId: id, roleId: adminRole.id } });
      if (count === 0) {
        return res.status(404).json({ error: 'Admin does not have this role' });
      }
      // Stamp rolesUpdatedAt so in-flight JWTs for this user are invalidated.
      await prisma.user.update({ where: { id }, data: { rolesUpdatedAt: new Date() } });
    }

    req.skipAudit = true;
    await writeAudit({
      actorUserId: (req as AuthRequest).user!.id,
      action: 'admin.roles.delete',
      objectType: 'admin',
      objectId: id,
      before: { roles: beforeRoles },
      after: { removedRole: roleKey },
      ip: getClientIp(req) ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// BC-ADMIN-RBAC-ROLES-019 — per-user permission overrides (SUPER_ADMIN only).
//
// These endpoints let a SUPER_ADMIN inspect an admin's effective permissions
// (template-inherited vs per-user override) and toggle individual abilities on
// top of the role template, including the two impersonation capabilities. Every
// override write bumps the target's User.rolesUpdatedAt so the existing
// authenticate() invalidation seam forces the admin's in-flight JWT to refresh
// (otherwise the override would not take effect until the next natural re-login).
//
// Guarded with authorize('SUPER_ADMIN') + requirePermission('admins.roles.write').
// (SUPER_ADMIN bypasses requirePermission, so the authorize() gate is what actually
// restricts these to super-admins; the requirePermission keeps the route consistent
// with the rest of the role-management surface and future-proofs a non-SA grantee.)
// ============================================================================

// GET /api/admin/admins/permissions/catalog — full catalog grouped by category.
router.get(
  '/permissions/catalog',
  authenticate,
  authorize('SUPER_ADMIN'),
  requirePermission('admins.roles.write'),
  async (_req, res, next) => {
    try {
      res.json({ catalog: getPermissionCatalogGrouped() });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/admin/admins/:id/permissions — effective permissions for an admin plus a
// role-vs-override breakdown (for the FE toggle screen).
router.get(
  '/:id/permissions',
  authenticate,
  authorize('SUPER_ADMIN'),
  requirePermission('admins.roles.write'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const target = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true },
      });
      if (!target || (target.role !== 'ADMIN' && target.role !== 'SUPER_ADMIN')) {
        return res.status(404).json({ error: 'Admin not found' });
      }

      const breakdown = await resolveUserPermissionBreakdown(id);
      res.json({
        userId: id,
        role: target.role,
        // SUPER_ADMIN bypasses all permission checks at runtime — surface that so the
        // FE renders the "all permissions" state rather than an empty/role-derived set.
        superAdminBypass: target.role === 'SUPER_ADMIN',
        effective: breakdown.effective,
        roleAllowed: breakdown.roleAllowed,
        roleDenied: breakdown.roleDenied,
        overrides: breakdown.overrides,
        catalog: getPermissionCatalogGrouped(),
      });
    } catch (error) {
      next(error);
    }
  },
);

// PUT /api/admin/admins/:id/permissions/overrides — set or clear a single per-user
// override. Body: { permissionKey: string, allow: true | false | null }.
//   allow=true  → upsert override granting the key (beats role-level deny)
//   allow=false → upsert override denying the key (beats role-level allow)
//   allow=null  → clear any existing override for that key (revert to role template)
router.put(
  '/:id/permissions/overrides',
  authenticate,
  authorize('SUPER_ADMIN'),
  requirePermission('admins.roles.write'),
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      const { permissionKey, allow } = req.body as {
        permissionKey?: unknown;
        allow?: unknown;
      };

      if (typeof permissionKey !== 'string' || !permissionKey.trim()) {
        return res.status(400).json({ error: 'permissionKey is required' });
      }
      if (allow !== true && allow !== false && allow !== null) {
        return res.status(400).json({ error: 'allow must be true, false, or null' });
      }
      // Safe cast: the guard above proved `allow` is exactly true | false | null.
      const allowValue = allow as boolean | null;
      // Validate against the real catalog — reject unknown keys before touching the DB.
      if (!isValidPermissionKey(permissionKey)) {
        return res.status(400).json({ error: `Unknown permission key: ${permissionKey}` });
      }

      const target = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true },
      });
      if (!target || (target.role !== 'ADMIN' && target.role !== 'SUPER_ADMIN')) {
        return res.status(404).json({ error: 'Admin not found' });
      }

      const permission = await prisma.permission.findUnique({ where: { key: permissionKey } });
      if (!permission) {
        // Catalog row not seeded in DB — surface clearly rather than silently no-op.
        return res.status(409).json({ error: `Permission ${permissionKey} is not seeded` });
      }

      const existing = await prisma.userPermissionOverride.findUnique({
        where: { userId_permissionId: { userId: id, permissionId: permission.id } },
        select: { allow: true },
      });
      const before = existing ? { permissionKey, allow: existing.allow } : null;

      let after: { permissionKey: string; allow: boolean } | null;
      if (allowValue === null) {
        // Clear the override (revert to role template). deleteMany is a no-op if absent.
        await prisma.userPermissionOverride.deleteMany({
          where: { userId: id, permissionId: permission.id },
        });
        after = null;
      } else {
        await prisma.userPermissionOverride.upsert({
          where: { userId_permissionId: { userId: id, permissionId: permission.id } },
          update: { allow: allowValue, grantedById: req.user!.id, grantedAt: new Date() },
          create: {
            userId: id,
            permissionId: permission.id,
            allow: allowValue,
            grantedById: req.user!.id,
          },
        });
        after = { permissionKey, allow: allowValue };
      }

      // Bump rolesUpdatedAt so authenticate() invalidates the target's in-flight JWT —
      // the override takes effect on the admin's next request (re-login), matching the
      // existing role-change invalidation behaviour.
      await prisma.user.update({ where: { id }, data: { rolesUpdatedAt: new Date() } });

      req.skipAudit = true;
      await writeAudit({
        actorUserId: req.user!.id,
        action: 'admin.permissions.override',
        objectType: 'admin',
        objectId: id,
        before,
        after,
        ip: getClientIp(req) ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      });

      const breakdown = await resolveUserPermissionBreakdown(id);
      res.json({
        ok: true,
        userId: id,
        effective: breakdown.effective,
        overrides: breakdown.overrides,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
