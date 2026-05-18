/**
 * Inbound email webhook — Spec §11.2 v1.1.
 *
 * Accepts a normalized inbound-email payload (provider-agnostic) and threads
 * the message into the ticketing system via `ticketInbound.ingestInboundEmail`.
 *
 * Auth (either of the following succeeds — providers vary):
 *   1. `X-Inbound-Signature` HMAC-SHA256 of the **raw request bytes** against
 *      `INBOUND_EMAIL_HMAC_SECRET` (preferred — used by provider adapters).
 *      server.ts mounts express.raw() on this path before express.json() so
 *      req.body is a Buffer containing the original bytes as the provider signed them.
 *   2. `X-Webhook-Secret` shared-secret header against `EMAIL_WEBHOOK_SECRET`
 *      (fallback for simpler providers / internal callers).
 *
 * If neither env var is set (local dev), the auth check is skipped with a
 * warning so the dev loop keeps working — production MUST set at least one.
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { asyncHandler } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import {
  ingestInboundEmail,
  type InboundEmailPayload,
} from '../services/ticketInbound.service';

const router = Router();

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * Return the raw body bytes for HMAC computation.
 * When express.raw() is in effect (production/test via buildApp), req.body is
 * a Buffer containing the original request bytes — exactly what the provider
 * signed. When express.json() ran first (shouldn't happen in production but
 * possible in ad-hoc tooling), fall back to re-serialising so the function
 * never throws.
 */
function rawBodyBytes(req: Request): Buffer {
  if (Buffer.isBuffer(req.body)) return req.body;
  return Buffer.from(JSON.stringify(req.body));
}

function verifyAuth(req: Request): boolean {
  const hmacSecret = process.env.INBOUND_EMAIL_HMAC_SECRET;
  const sharedSecret = process.env.EMAIL_WEBHOOK_SECRET;

  if (!hmacSecret && !sharedSecret) {
    // Fail closed in production — an unset secret must never let traffic
    // through. Local/test environments get a warn-level log so the dev loop
    // keeps working without provisioning a secret.
    if (process.env.NODE_ENV === 'production') {
      logger.error('[email-webhook] no INBOUND_EMAIL_HMAC_SECRET or EMAIL_WEBHOOK_SECRET set in production — refusing request');
      return false;
    }
    logger.warn('[email-webhook] no INBOUND_EMAIL_HMAC_SECRET or EMAIL_WEBHOOK_SECRET set — skipping auth check (non-production)');
    return true;
  }

  // HMAC path (preferred). Compare the provider's signature against the
  // HMAC-SHA256 of the raw request bytes. Using the raw Buffer (not
  // JSON.stringify of the parsed object) guarantees we verify exactly
  // what the provider signed — re-serialisation can differ in key order,
  // whitespace, and Unicode escaping.
  if (hmacSecret) {
    const provided = req.header('x-inbound-signature') || '';
    if (provided) {
      const expected = crypto
        .createHmac('sha256', hmacSecret)
        .update(rawBodyBytes(req))
        .digest('hex');
      if (safeEqual(provided, expected)) return true;
    }
  }

  // Shared-secret fallback — also constant-time to avoid leaking the secret
  // via per-character compare timing.
  if (sharedSecret) {
    const provided = req.header('x-webhook-secret') || '';
    if (provided && safeEqual(provided, sharedSecret)) return true;
  }

  return false;
}

function isValidPayload(body: any): body is InboundEmailPayload {
  return (
    body &&
    typeof body === 'object' &&
    typeof body.from === 'string' &&
    typeof body.to === 'string' &&
    typeof body.subject === 'string' &&
    typeof body.text === 'string' &&
    typeof body.messageId === 'string'
  );
}

/**
 * POST /api/email/inbound
 *
 * Body: InboundEmailPayload (see ticketInbound.service.ts)
 * Auth: X-Inbound-Signature (HMAC) or X-Webhook-Secret (shared secret)
 */
router.post(
  '/inbound',
  asyncHandler(async (req: Request, res: Response) => {
    if (!verifyAuth(req)) {
      return res.status(401).json({ error: 'invalid_signature' });
    }

    // express.raw() delivers req.body as a Buffer — parse it for the service.
    // express.json() (ad-hoc tooling / shared-secret-only callers) delivers an
    // object directly; both paths are supported.
    const body = Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString('utf8'))
      : req.body;

    if (!isValidPayload(body)) {
      return res.status(400).json({
        error: 'invalid_payload',
        required: ['from', 'to', 'subject', 'text', 'messageId'],
      });
    }

    const result = await ingestInboundEmail(body);
    return res.status(result.created ? 201 : 200).json({
      ok: true,
      ticketId: result.ticketId,
      replyId: result.replyId,
      created: result.created,
    });
  })
);

export default router;
