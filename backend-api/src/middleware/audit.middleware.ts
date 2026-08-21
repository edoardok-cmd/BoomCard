import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import prisma from '../lib/prisma';
import { detach } from '../utils/detach';

const SENSITIVE_KEYS = new Set([
  'password', 'passwordHash', 'newPassword', 'currentPassword',
  'oldPassword', 'confirmPassword', 'totpSecret', 'token',
  'secret', 'passwordResetToken',
  // Spec §1.1 IMPORTANT / §8.1 — bank account details must NEVER appear in the
  // audit log in plaintext. This middleware writes the redacted request body to
  // AuditLog.after on every non-GET; without these keys a route that accepts an
  // IBAN in the body (e.g. PATCH /subscribers/:userId/profile) would leak the raw
  // value. Redacting at the middleware level defends EVERY route, not just one.
  'iban', 'payoutIban', 'beneficiaryName',
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
  // cashback sub-resource: POST /cashback/entries/:id/approve → objectType "cashback"
  entries: 'cashback',
  // control router sub-resources → normalised object types
  'dispute-cases':    'dispute',
  'receipt-templates': 'receipt-template',
  'risk-queue':       'risk',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Uppercase-only identifiers (e.g. SUPER_ADMIN, FINANCE) are path parameters (enum values),
// not verbs. Matching this pattern lets us fall back to the HTTP method verb and include
// the preceding collection segment in the action (e.g. DELETE /:id/roles/SUPER_ADMIN →
// "admin.roles.delete" rather than the nonsensical "admin.SUPER_ADMIN").
const IDENTIFIER_RE = /^[A-Z][A-Z0-9_]*$/;

export function deriveActionAndObject(req: AuthRequest): { action: string; objectType: string; objectId: string | null } {
  const parts = req.path.replace(/^\//, '').split('/').filter(Boolean);

  // Determine base object type from the router's mount point (e.g. /api/admin/admins → "admins")
  const baseSegment = req.baseUrl.split('/').filter(Boolean).pop() ?? 'unknown';
  const rawObjectType = UUID_RE.test(parts[0] ?? '') ? baseSegment : (parts[0] ?? baseSegment);
  const objectType = OBJECT_TYPE_NORMALIZE[rawObjectType] ?? rawObjectType;

  // Extract objectId: first UUID in path
  const objectId = parts.find((p) => UUID_RE.test(p)) ?? null;

  // Candidates: non-UUID segments that are not the primary resource segment.
  const candidates = parts.filter((p) => !UUID_RE.test(p) && p !== parts[0]);
  const lastCandidate = candidates[candidates.length - 1];

  let verb: string;
  let subResource: string | undefined;

  if (!lastCandidate) {
    // Root resource operation (e.g. POST / → create, DELETE / → delete)
    verb = METHOD_VERB[req.method.toLowerCase()] ?? req.method.toLowerCase();
  } else if (IDENTIFIER_RE.test(lastCandidate)) {
    // Last segment is an enum identifier, not a verb — use the HTTP method verb.
    // Include the preceding collection segment (if any) to produce e.g. "admin.roles.delete".
    verb = METHOD_VERB[req.method.toLowerCase()] ?? req.method.toLowerCase();
    subResource = candidates[candidates.length - 2];
  } else {
    // Last segment is a semantic verb (e.g. "approve", "mark-paid", "status")
    verb = lastCandidate;
  }

  const action = subResource
    ? `${objectType}.${subResource}.${verb}`
    : `${objectType}.${verb}`;

  return { action, objectType, objectId };
}

// Writes an AuditLog row for every non-GET request on /api/admin/*.
//
// before: always null — the middleware has no access to the pre-mutation DB state.
//         Controllers that need a true before/after diff must call writeAudit directly.
// after:  the redacted request body (what the caller sent to trigger the change).
//         The response body is intentionally NOT stored here: it often contains
//         the full re-fetched record and would double the storage for every mutation.
//
// Route handlers can override derived values by setting fields on req before calling
// res.json:  req.auditAction, req.auditObjectType, req.auditObjectId, req.skipAudit
//
// These fields are declared on the Express `Request` type in the single canonical
// augmentation at src/types/express.d.ts (BC-QA-060-FOLLOWUP-1) — do not re-declare
// them here. A duplicate `declare module 'express-serve-static-core'` block used to
// live in this file too; two independent copies of the same augmentation is exactly
// the kind of drift that risks the two copies silently diverging, so this file now
// defers to the single canonical declaration instead of maintaining its own.

export const auditMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.method === 'GET') {
    return next();
  }

  const originalJson = res.json.bind(res);
  const derived = deriveActionAndObject(req);
  const requestBody = req.body ? redactSensitive(JSON.parse(JSON.stringify(req.body))) : null;

  res.json = function (body: unknown) {
    if (req.skipAudit) return originalJson(body);

    const actorId = req.user?.id ?? null;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? null;
    const userAgent = req.headers['user-agent'] ?? null;

    detach(prisma.auditLog.create({
      data: {
        actorUserId: actorId,
        action:     req.auditAction     ?? derived.action,
        objectType: req.auditObjectType ?? derived.objectType,
        objectId:   req.auditObjectId !== undefined ? req.auditObjectId : derived.objectId,
        before: null,             // unknown at middleware level — use writeAudit for real diffs
        after: (requestBody as object | null) ?? undefined,
        ip,
        userAgent,
      },
    }), () => {
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
