import { Router } from 'express';
import bcrypt from 'bcrypt';
import { AdminRoleKey, UserRole, UserStatus } from '@prisma/client';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { prisma } from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth.middleware';

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

    const where: Parameters<typeof prisma.user.findMany>[0]['where'] = {
      role: 'ADMIN',
      adminRoles: { none: {} },
    };

    if (search) {
      where.AND = [
        { role: 'ADMIN', adminRoles: { none: {} } },
        {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
      delete where.role;
      delete where.adminRoles;
    }

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

// GET /api/admin/admins/pending-all — combined view of both pending types (#9)
// Returns role-assignment-pending admins AND pending SUPER_ADMIN creation requests
// in a single call so dashboards can show a unified approvals count.
router.get('/pending-all', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('admins.read'), async (_req, res, next) => {
  try {
    const [pendingRoleAssignments, pendingSuperAdmins] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'ADMIN', adminRoles: { none: {} } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, firstName: true, lastName: true, status: true, createdAt: true },
      }),
      prisma.pendingSuperAdminRequest.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          createdAt: true,
          requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    res.json({
      pendingRoleAssignments,
      pendingSuperAdmins,
      total: pendingRoleAssignments.length + pendingSuperAdmins.length,
    });
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
      role: { in: ['ADMIN', 'SUPER_ADMIN'] },
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
          // #2 fix: expose whether 2FA is enabled
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

    // Normalise totpEnabledAt → twoFactorEnabled boolean for the client
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
      return res.status(202).json({ ok: true, pending: true, request });
    }

    const adminRole = await prisma.adminRole.findUnique({ where: { key: roleKey } });
    if (!adminRole) return res.status(400).json({ error: 'Role not found in DB — run seed-permissions first' });

    const passwordHash = await bcrypt.hash(password, 12);

    let user: { id: string; email: string; firstName: string | null; lastName: string | null; role: UserRole; status: UserStatus; createdAt: Date };
    try {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: firstName ?? null,
          lastName: lastName ?? null,
          phone: phone ?? null,
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
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
    } catch (err: unknown) {
      const isPrismaConflict = typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
      if (isPrismaConflict) {
        return res.status(409).json({ error: 'An admin with this email already exists' });
      }
      throw err;
    }

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

    const request = await prisma.pendingSuperAdminRequest.findUnique({ where: { id } });
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

    req.auditAction = 'admin.super.approve';
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

    const request = await prisma.pendingSuperAdminRequest.findUnique({ where: { id } });
    if (!request) return res.status(404).json({ error: 'Pending request not found' });

    await prisma.pendingSuperAdminRequest.delete({ where: { id } });
    req.auditAction = 'admin.super.reject';
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
    const { status } = req.body as { status?: string };

    if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
      return res.status(400).json({ error: 'status must be ACTIVE or SUSPENDED' });
    }

    // Prevent self-suspension
    if (id === req.user!.id) {
      return res.status(400).json({ error: 'You cannot change your own status' });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || (target.role !== 'ADMIN' && target.role !== 'SUPER_ADMIN')) {
      return res.status(404).json({ error: 'Admin not found' });
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

    const updated = await prisma.user.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    });

    res.json({ ok: true, ...updated });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/admins/:id/approve — assign a role to a pending admin
router.post('/:id/approve', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('admins.write'), async (req: AuthRequest, res, next) => {
  try {
    const { roleKey } = req.body as { roleKey: AdminRoleKey };

    if (!roleKey || !Object.values(AdminRoleKey).includes(roleKey)) {
      return res.status(400).json({ error: 'Valid roleKey is required' });
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

    await prisma.userAdminRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
      create: { userId: user.id, roleId: adminRole.id, grantedById: req.user!.id },
      update: { grantedById: req.user!.id, grantedAt: new Date() },
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

    if (roleKey === AdminRoleKey.SUPER_ADMIN) {
      // Removing SUPER_ADMIN must also downgrade User.role — authorization middleware
      // checks user.role directly, not UserAdminRole, so deleting only the junction row
      // would leave the user with full SUPER_ADMIN access.
      const [deleteResult] = await prisma.$transaction([
        prisma.userAdminRole.deleteMany({ where: { userId: id, roleId: adminRole.id } }),
        prisma.user.update({ where: { id }, data: { role: 'ADMIN' } }),
      ]);
      if (deleteResult.count === 0) {
        return res.status(404).json({ error: 'Admin does not have this role' });
      }
    } else {
      const { count } = await prisma.userAdminRole.deleteMany({ where: { userId: id, roleId: adminRole.id } });
      if (count === 0) {
        return res.status(404).json({ error: 'Admin does not have this role' });
      }
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
