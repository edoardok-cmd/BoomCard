import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import prisma from '../lib/prisma';

const SENSITIVE_KEYS = new Set([
  'password', 'passwordHash', 'newPassword', 'currentPassword',
  'oldPassword', 'confirmPassword', 'totpSecret', 'token',
  'secret', 'passwordResetToken',
]);

function redactSensitive(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactSensitive);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k) ? '[REDACTED]' : redactSensitive(v);
  }
  return out;
}

// Writes an AuditLog row for every non-GET request on /api/admin/*.
// Controllers that need richer before/after diffs should call writeAudit directly.
export const auditMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.method === 'GET') {
    return next();
  }

  const originalJson = res.json.bind(res);
  const startBody = req.body ? redactSensitive(JSON.parse(JSON.stringify(req.body))) : null;

  res.json = function (body: unknown) {
    const actorId = req.user?.id ?? null;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? null;
    const userAgent = req.headers['user-agent'] ?? null;

    const parts = req.path.replace(/^\//, '').split('/');
    // If parts[0] looks like a UUID the router has no resource-name prefix
    // (e.g. payouts: /:id/approve). Fall back to the last segment of baseUrl.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const objectType = UUID_RE.test(parts[0] ?? '')
      ? (req.baseUrl.split('/').pop() ?? 'unknown')
      : (parts[0] ?? 'unknown');
    const objectId = UUID_RE.test(parts[0] ?? '') ? parts[0] : (parts[1] ?? null);
    const action = `${objectType}.${req.method.toLowerCase()}`;

    prisma.auditLog.create({
      data: {
        actorUserId: actorId,
        action,
        objectType,
        objectId,
        before: (startBody as object | null) ?? undefined,
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
