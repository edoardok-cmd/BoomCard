import { Router } from 'express';
import bcrypt from 'bcrypt';
import { AdminRoleKey } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { prisma } from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth.middleware';

const router = Router();
router.use(auditMiddleware);

// GET /api/admin/admins/roles — all AdminRole rows (for create / approve forms)
router.get('/roles', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), async (_req, res, next) => {
  try {
    const roles = await prisma.adminRole.findMany({ orderBy: { key: 'asc' } });
    res.json({ roles });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/admins/audit — paginated audit log
router.get('/audit', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { search, objectType, page = '1', limit = '20' } = req.query as Record<string, string>;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: Parameters<typeof prisma.auditLog.findMany>[0]['where'] = {};
    if (objectType) where.objectType = { equals: objectType, mode: 'insensitive' };
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

    res.json({ logs, total, page: parseInt(page), limit: take });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/admins/pending — ADMIN-role users with no assigned AdminRole
router.get('/pending', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { search, page = '1', limit = '20' } = req.query as Record<string, string>;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

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

    res.json({ users, total, page: parseInt(page), limit: take });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/admins — list all admin users with their roles
router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { search, roleKey, page = '1', limit = '20' } = req.query as Record<string, string>;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

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

    res.json({ admins, total, page: parseInt(page), limit: take });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/admins — create a new admin user
router.post('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
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

    const adminRole = await prisma.adminRole.findUnique({ where: { key: roleKey } });
    if (!adminRole) return res.status(400).json({ error: 'Role not found in DB — run seed-permissions first' });

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

    res.status(201).json({ ok: true, user });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/admins/:id/approve — assign a role to a pending admin
router.post('/:id/approve', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
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
router.delete('/:id/roles/:roleKey', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { id, roleKey } = req.params;

    if (!Object.values(AdminRoleKey).includes(roleKey as AdminRoleKey)) {
      return res.status(400).json({ error: 'Invalid roleKey' });
    }

    const adminRole = await prisma.adminRole.findUnique({ where: { key: roleKey as AdminRoleKey } });
    if (!adminRole) return res.status(404).json({ error: 'Role not found' });

    await prisma.userAdminRole.deleteMany({ where: { userId: id, roleId: adminRole.id } });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
