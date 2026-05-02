import { prisma } from './prisma';

/**
 * Expo Push (FCM/APNs via Expo's push service) helper.
 *
 * Tokens live in the `PushToken` table with `platform='ios'|'android'`. The
 * Expo push token string looks like `ExponentPushToken[xxxxxx]`.
 *
 * `DeviceNotRegistered` from the Expo service means the token is dead
 * (app uninstalled, OS revoked it, etc.) — we mark those inactive so we stop
 * retrying. Any other failure is logged and swallowed: push is always a
 * best-effort side-channel on top of the in-app notification record.
 *
 * Expo Push API docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  badge?: number;
  channelId?: string;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

function isExpoPushToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

export async function sendExpoPushToUser(
  userId: string,
  message: Omit<ExpoPushMessage, 'to'>
): Promise<{ sent: number; invalidated: number }> {
  const rows = await prisma.pushToken.findMany({
    where: {
      userId,
      isActive: true,
      platform: { in: ['ios', 'android'] },
    },
    select: { id: true, token: true, platform: true },
  });

  const valid = rows.filter((r) => isExpoPushToken(r.token));
  if (valid.length === 0) return { sent: 0, invalidated: 0 };

  const messages: ExpoPushMessage[] = valid.map((r) => ({
    to: r.token,
    sound: 'default',
    priority: 'high',
    channelId: 'default',
    ...message,
  }));

  let resp: Response;
  try {
    resp = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.error('[expoPush] Network error sending push notifications', err);
    return { sent: 0, invalidated: 0 };
  }

  if (!resp.ok) {
    console.error('[expoPush] HTTP error', resp.status, await resp.text());
    return { sent: 0, invalidated: 0 };
  }

  let tickets: ExpoTicket[] = [];
  try {
    const result = (await resp.json()) as { data: ExpoTicket[] };
    tickets = result.data ?? [];
  } catch (err) {
    console.error('[expoPush] Failed to parse Expo response', err);
    return { sent: 0, invalidated: 0 };
  }

  let sent = 0;
  const invalidTokenIds: string[] = [];

  tickets.forEach((ticket, i) => {
    if (ticket.status === 'ok') {
      sent++;
    } else if (
      ticket.status === 'error' &&
      ticket.details?.error === 'DeviceNotRegistered' &&
      valid[i]
    ) {
      invalidTokenIds.push(valid[i].id);
    } else if (ticket.status === 'error') {
      console.warn('[expoPush] ticket error', {
        userId,
        tokenId: valid[i]?.id,
        message: ticket.message,
        details: ticket.details,
      });
    }
  });

  if (invalidTokenIds.length > 0) {
    await prisma.pushToken.updateMany({
      where: { id: { in: invalidTokenIds } },
      data: { isActive: false },
    });
  }

  return { sent, invalidated: invalidTokenIds.length };
}
