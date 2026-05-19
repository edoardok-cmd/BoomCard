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
      page = '1',
      limit = '20',
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

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
    const { search, page = '1', limit = '20' } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

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

// GET /api/admin/admins/pending-super — list pending SUPER_ADMIN creation requests
// #12 fix: use admins.read (not admins.write) — this is a read-only list
router.get('/pending-super', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('admins.read'), async (req, res, next) => {
  try {
    const { page = '1', limit = '20' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const [requests, total] = await Promise.all([
      prisma.pendingSuperAdminRequest.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          createdAt: true,
          requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.pendingSuperAdminRequest.count(),
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
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              createdAt: true,
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
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

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
      writeAudit({
        actorUserId: req.user!.id,
        action: 'partner.discount-rate.update',
        objectType: 'Partner',
        objectId: discountRateAudit.partnerId,
        before: { discountRate: discountRateAudit.previousRate },
        after: { discountRate: discountRateAudit.newRate, via: 'critical-action', requestId: item.id },
        ip: getClientIp(req) ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      }).catch((err) => logger.error('[critical-action] discount-rate audit write failed:', err));
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
    const { search, roleKey, page = '1', limit = '20' } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

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
      firstName?: string;
      lastName?: string;
      phone?: string;
      password: string;
      roleKey: AdminRoleKey;
    };

    if (!email || !password || !roleKey) {
      return res.status(400).json({ error: 'email, password, and roleKey are required' });
    }
    if (!Object.values(AdminRoleKey).includes(roleKey)) {
      return res.status(400).json({ error: 'Invalid roleKey' });
    }

    if (roleKey === AdminRoleKey.SUPER_ADMIN) {
      // Double-approval gate: store the request for a second admin to approve.
      // Pre-check: reject immediately if a SUPER_ADMIN with this email already exists as a User.
      const existingUser = await prisma.user.findFirst({ where: { email, role: 'SUPER_ADMIN' } });
      if (existingUser) {
        return res.status(409).json({ error: 'A SUPER_ADMIN with this email already exists' });
      }
      const existing = await prisma.pendingSuperAdminRequest.findFirst({ where: { email } });
      if (existing) {
        return res.status(409).json({ error: 'A pending SUPER_ADMIN request for this email already exists' });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      let request: { id: string; email: string; firstName: string | null; lastName: string | null; createdAt: Date };
      try {
        request = await prisma.pendingSuperAdminRequest.create({
          data: {
            email,
            firstName: firstName ?? null,
            lastName: lastName ?? null,
            phone: phone ?? null,
            passwordHash,
            requestedById: req.user!.id,
          },
          select: { id: true, email: true, firstName: true, lastName: true, createdAt: true },
        });
      } catch (err: unknown) {
        const isPrismaConflict = typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
        if (isPrismaConflict) {
          return res.status(409).json({ error: 'A pending SUPER_ADMIN request for this email already exists' });
        }
        throw err;
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

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        phone: phone ?? null,
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
      include: { requestedBy: { select: { email: true, firstName: true, lastName: true } } },
    });
    if (!request) return res.status(404).json({ error: 'Pending request not found' });

    if (request.requestedById === req.user!.id) {
      return res.status(403).json({ error: 'The approver must be a different admin from the original requester' });
    }

    const superAdminRole = await prisma.adminRole.findUnique({ where: { key: AdminRoleKey.SUPER_ADMIN } });
    if (!superAdminRole) return res.status(500).json({ error: 'SUPER_ADMIN role not found in DB — run seed-permissions first' });

    let user: { id: string; email: string; firstName: string | null; lastName: string | null; role: UserRole; status: UserStatus; createdAt: Date };
    try {
      [user] = await prisma.$transaction([
        prisma.user.create({
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
        prisma.pendingSuperAdminRequest.delete({ where: { id } }),
      ]);
    } catch (err: unknown) {
      const isPrismaConflict = typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
      if (isPrismaConflict) {
        return res.status(409).json({ error: 'A SUPER_ADMIN with this email already exists' });
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
      emailService.sendEmail({
        to: request.requestedBy.email,
        subject: 'SUPER_ADMIN creation request approved — BoomCard',
        html: `<p>Здравей, ${requesterName},</p><p>Вашата заявка за нов SUPER_ADMIN акаунт (<strong>${request.email}</strong>) беше одобрена. Акаунтът е създаден.</p>`,
        text: `Здравей, ${requesterName},\n\nВашата заявка за нов SUPER_ADMIN акаунт (${request.email}) беше одобрена. Акаунтът е създаден.`,
      }).catch(() => {});
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

    // Notify the requester so they know their request was rejected/cancelled.
    if (request.requestedBy.email) {
      const requesterName = request.requestedBy.firstName || request.requestedBy.email;
      emailService.sendEmail({
        to: request.requestedBy.email,
        subject: 'SUPER_ADMIN creation request rejected — BoomCard',
        html: `<p>Здравей, ${requesterName},</p><p>Вашата заявка за нов SUPER_ADMIN акаунт (<strong>${request.email}</strong>) беше отказана или анулирана.</p>`,
        text: `Здравей, ${requesterName},\n\nВашата заявка за нов SUPER_ADMIN акаунт (${request.email}) беше отказана или анулирана.`,
      }).catch(() => {});
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

// PATCH /api/admin/admins/:id/status — suspend or activate an admin account (#5)
router.patch('/:id/status', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('admins.write'), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body as { status?: string; reason?: string };

    if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
      return res.status(400).json({ error: 'status must be ACTIVE or SUSPENDED' });
    }
    if (status === 'SUSPENDED' && !reason?.trim()) {
      return res.status(400).json({ error: 'reason is required when suspending an admin account' });
    }

    // Prevent self-suspension
    if (id === req.user!.id) {
      return res.status(400).json({ error: 'You cannot change your own status' });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || (target.role !== 'ADMIN' && target.role !== 'SUPER_ADMIN')) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // Only a SUPER_ADMIN may change the status of another SUPER_ADMIN.
    // An ADMIN with admins.write cannot demote or suspend a higher-privilege account.
    if (target.role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only a SUPER_ADMIN can change another SUPER_ADMIN\'s status' });
    }

    // #3-adjacent: prevent suspending the last active SUPER_ADMIN
    if (target.role === 'SUPER_ADMIN' && status === 'SUSPENDED') {
      const activeSuperAdmins = await prisma.user.count({
        where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: id } },
      });
      if (activeSuperAdmins === 0) {
        return res.status(409).json({ error: 'Cannot suspend the last active SUPER_ADMIN' });
      }
    }

    const beforeStatus = target.status;

    const updated = await prisma.user.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    });

    req.skipAudit = true;
    await writeAudit({
      actorUserId: req.user!.id,
      action: 'admin.status',
      objectType: 'admin',
      objectId: id,
      before: { status: beforeStatus },
      after: { status, reason: reason?.trim() || null },
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

// DELETE /api/admin/admins/:id/roles/:roleKey — revoke a role from an admin
router.delete('/:id/roles/:roleKey', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('admins.roles.write'), async (req, res, next) => {
  try {
    const { id, roleKey } = req.params;

    if (!Object.values(AdminRoleKey).includes(roleKey as AdminRoleKey)) {
      return res.status(400).json({ error: 'Invalid roleKey' });
    }

    // #3 fix: prevent removing the last SUPER_ADMIN role
    if (roleKey === AdminRoleKey.SUPER_ADMIN) {
      const superAdminCount = await prisma.user.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' } });
      if (superAdminCount <= 1) {
        return res.status(409).json({ error: 'Cannot revoke the role of the last SUPER_ADMIN' });
      }
    }

    const adminRole = await prisma.adminRole.findUnique({ where: { key: roleKey as AdminRoleKey } });
    if (!adminRole) return res.status(404).json({ error: 'Role not found' });

    const existingRoles = await prisma.userAdminRole.findMany({
      where: { userId: id },
      select: { role: { select: { key: true } } },
    });
    const beforeRoles = existingRoles.map((r) => r.role.key);

    if (roleKey === AdminRoleKey.SUPER_ADMIN) {
      // Removing SUPER_ADMIN must also downgrade User.role — authorization middleware
      // checks user.role directly, not UserAdminRole, so deleting only the junction row
      // would leave the user with full SUPER_ADMIN access.
      const [deleteResult] = await prisma.$transaction([
        prisma.userAdminRole.deleteMany({ where: { userId: id, roleId: adminRole.id } }),
        prisma.user.update({ where: { id }, data: { role: 'ADMIN', rolesUpdatedAt: new Date() } }),
      ]);
      if (deleteResult.count === 0) {
        return res.status(404).json({ error: 'Admin does not have this role' });
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

export default router;
