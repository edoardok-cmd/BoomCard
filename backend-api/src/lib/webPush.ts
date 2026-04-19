import webpush from 'web-push';
import { prisma } from './prisma';

/**
 * Web Push (VAPID) helper.
 *
 * Subscriptions live in the `PushToken` table with `platform='web'`. The raw
 * `PushSubscriptionJSON` (endpoint + keys) is stringified into `deviceId` and
 * the endpoint URL doubles as the unique `token`. See notifications.routes.ts
 * `/push/subscribe` for the write side.
 *
 * 404/410 from the push service means the subscription is dead (user cleared
 * browser data, revoked permission, etc.) — we mark those tokens inactive so
 * we stop trying. Any other error is logged and swallowed: a failing push
 * must never block the surrounding DB write / in-app notification.
 */

let configured = false;

function configure(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export interface WebPushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  url?: string;
}

export async function sendWebPushToUser(
  userId: string,
  payload: WebPushPayload
): Promise<{ sent: number; invalidated: number }> {
  if (!configure()) {
    console.warn('[webPush] VAPID keys not set — skipping web push send');
    return { sent: 0, invalidated: 0 };
  }

  const tokens = await prisma.pushToken.findMany({
    where: { userId, platform: 'web', isActive: true },
  });

  if (tokens.length === 0) return { sent: 0, invalidated: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let invalidated = 0;

  await Promise.all(
    tokens.map(async (row) => {
      let subscription: webpush.PushSubscription;
      try {
        subscription = JSON.parse(row.deviceId || '');
      } catch {
        // Stored subscription is corrupt — mark inactive so we don't retry it.
        await prisma.pushToken.update({
          where: { id: row.id },
          data: { isActive: false },
        });
        invalidated++;
        return;
      }

      try {
        await webpush.sendNotification(subscription, body);
        sent++;
      } catch (err: any) {
        const statusCode = err?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushToken.update({
            where: { id: row.id },
            data: { isActive: false },
          });
          invalidated++;
        } else {
          console.error('[webPush] send failed', {
            userId,
            tokenId: row.id,
            statusCode,
            message: err?.message,
          });
        }
      }
    })
  );

  return { sent, invalidated };
}
