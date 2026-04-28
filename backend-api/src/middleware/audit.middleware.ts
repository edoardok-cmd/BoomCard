import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import prisma from '../lib/prisma';

// Writes an AuditLog row for every non-GET request on /api/admin/*.
// Controllers that need richer before/after diffs should call writeAudit directly.
export const auditMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.method === 'GET') {
    return next();
  }

  const originalJson = res.json.bind(res);
  const startBody = req.body ? JSON.parse(JSON.stringify(req.body)) : null;

  res.json = function (body: unknown) {
    const actorId = req.user?.id ?? null;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? null;
    const userAgent = req.headers['user-agent'] ?? null;

    const parts = req.path.replace(/^\//, '').split('/');
    const objectType = parts[0] ?? 'unknown';
    const objectId = parts[1] ?? null;
    const action = `${objectType}.${req.method.toLowerCase()}`;

    prisma.auditLog.create({
      data: {
        actorUserId: actorId,
        action,
        objectType,
        objectId,
        before: startBody ?? undefined,
        after: (body && typeof body === 'object') ? (body as object) : undefined,
        ip,
        userAgent,
      },
    }).catch(() => {
      // Non-blocking — audit failures must never interrupt the response.
    });

    return originalJson(body);
  };

  next();
};

// Explicit audit write for controllers that want richer context.
export async function writeAudit(params: {
  actorUserId: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  before?: object | null;
  after?: object | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  await prisma.auditLog.create({ data: params });
}
