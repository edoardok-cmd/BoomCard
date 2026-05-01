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

// Maps HTTP method + optional path action suffix to a semantic verb.
// POST /admins        → "create"
// PATCH /admins/:id   → "update"
// DELETE /admins/:id  → "delete"
// POST /admins/:id/approve → "approve"   (last non-UUID segment wins)
const METHOD_VERB: Record<string, string> = {
  post: 'create',
  patch: 'update',
  put: 'update',
  delete: 'delete',
};

// Normalise plurals and hyphenated path segments to cleaner object type names.
const OBJECT_TYPE_NORMALIZE: Record<string, string> = {
  admins: 'admin',
  users: 'user',
  subscribers: 'subscriber',
  partners: 'partner',
  transactions: 'transaction',
  subscriptions: 'subscription',
  receipts: 'receipt',
  payouts: 'payout',
  cashback: 'cashback',
  disputes: 'dispute',
  campaigns: 'campaign',
  templates: 'template',
  locations: 'location',
  settings: 'settings',
  'pending-super': 'admin',
  'mark-paid': 'cashback',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deriveActionAndObject(req: AuthRequest): { action: string; objectType: string; objectId: string | null } {
  const parts = req.path.replace(/^\//, '').split('/').filter(Boolean);

  // Determine base object type from the router's mount point (e.g. /api/admin/admins → "admins")
  const baseSegment = req.baseUrl.split('/').filter(Boolean).pop() ?? 'unknown';
  const rawObjectType = UUID_RE.test(parts[0] ?? '') ? baseSegment : (parts[0] ?? baseSegment);
  const objectType = OBJECT_TYPE_NORMALIZE[rawObjectType] ?? rawObjectType;

  // Extract objectId: first UUID in path
  const objectId = parts.find((p) => UUID_RE.test(p)) ?? null;

  // Determine action verb: prefer the last non-UUID, non-resource path segment (e.g. "approve", "status")
  // over the generic HTTP method verb.
  const actionSuffix = parts
    .filter((p) => !UUID_RE.test(p) && p !== parts[0])
    .pop();

  const verb = actionSuffix ?? METHOD_VERB[req.method.toLowerCase()] ?? req.method.toLowerCase();
  const action = `${objectType}.${verb}`;

  return { action, objectType, objectId };
}

// Writes an AuditLog row for every non-GET request on /api/admin/*.
//
// before: always null — the middleware has no access to the pre-mutation DB state.
//         Controllers that need a true before/after diff must call writeAudit directly.
// after:  the redacted request body (what the caller sent to trigger the change).
//         The response body is intentionally NOT stored here: it often contains
//         the full re-fetched record and would double the storage for every mutation.
export const auditMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.method === 'GET') {
    return next();
  }

  const originalJson = res.json.bind(res);
  const { action, objectType, objectId } = deriveActionAndObject(req);
  const requestBody = req.body ? redactSensitive(JSON.parse(JSON.stringify(req.body))) : null;

  res.json = function (body: unknown) {
    const actorId = req.user?.id ?? null;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? null;
    const userAgent = req.headers['user-agent'] ?? null;

    prisma.auditLog.create({
      data: {
        actorUserId: actorId,
        action,
        objectType,
        objectId,
        before: null,             // unknown at middleware level — use writeAudit for real diffs
        after: (requestBody as object | null) ?? undefined,
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

// Explicit audit write for controllers that need richer context (true before/after diffs,
// read-access logging, or custom action names outside the CRUD conventions above).
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
