import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

// One hour. Long enough to cover mobile flows where the user reviews OCR and
// edits fields before submitting, short enough that abandoned tokens don't pile
// up indefinitely. All expired tokens are purged by the nightly cleanup cron
// (scheduler.ts, 3:30 AM Europe/Sofia).
const TOKEN_TTL_MS = 60 * 60 * 1000;

export interface IssuedUploadToken {
  token: string;
  expiresAt: Date;
}

export interface ConsumedUploadToken {
  imageHash: string;
  perceptualHash: string | null;
  livePhotoOk: boolean;
  imageUrl: string;
  imageKey: string;
}

export const receiptUploadTokenService = {
  /**
   * Issue a token binding a server-computed hash + live-photo result + S3
   * location to the uploading user. The client gets only the opaque token —
   * it can't tamper with the bound fields.
   */
  async issue(params: {
    userId: string;
    imageHash: string;
    perceptualHash: string | null;
    livePhotoOk: boolean;
    imageUrl: string;
    imageKey: string;
  }): Promise<IssuedUploadToken> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await prisma.receiptUploadToken.create({
      data: {
        token,
        userId: params.userId,
        imageHash: params.imageHash,
        perceptualHash: params.perceptualHash,
        livePhotoOk: params.livePhotoOk,
        imageUrl: params.imageUrl,
        imageKey: params.imageKey,
        expiresAt,
      },
    });

    return { token, expiresAt };
  },

  /**
   * Atomically claim a token. Returns the bound fields if claim succeeded,
   * null on any failure mode (unknown token, foreign userId, expired, already
   * consumed). The caller gets a single generic error — we intentionally don't
   * distinguish "expired" from "already used" at the API, to avoid leaking the
   * token state to an attacker probing for reuse windows.
   *
   * Uses updateMany so the claim is a single UPDATE with WHERE guards — no
   * TOCTOU gap between "findUnique" and "update consumedAt".
   */
  async consume(token: string, userId: string): Promise<ConsumedUploadToken | null> {
    const now = new Date();
    const claim = await prisma.receiptUploadToken.updateMany({
      where: {
        token,
        userId,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (claim.count === 0) {
      logger.warn(`receiptUploadToken.consume: claim failed for user ${userId}`);
      return null;
    }

    // Re-read to get the bound fields. Safe — the row is now consumed, no race.
    const row = await prisma.receiptUploadToken.findUnique({ where: { token } });
    if (!row) return null; // shouldn't happen — the updateMany just succeeded

    return {
      imageHash: row.imageHash,
      perceptualHash: row.perceptualHash,
      livePhotoOk: row.livePhotoOk,
      imageUrl: row.imageUrl,
      imageKey: row.imageKey,
    };
  },
};
