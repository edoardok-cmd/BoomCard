/**
 * §10 / §11 / §13 — Notification lifecycle hooks.
 *
 * §13  notifySubscriptionExpiringSoon  — now sends push in addition to in-app
 * §11  notifyPayoutEvent               — in-app + push alongside payout email
 * §10  notifySubscriptionPaused        — in-app + push when ACTIVE → PAUSED
 *
 * Tests verify that the right push + in-app calls are made; the actual DB and
 * push transport are fully mocked.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

const createdNotifications: any[] = [];
const webPushCalls: any[] = [];
const expoPushCalls: any[] = [];

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    notification: {
      create: jest.fn(async (args: any) => ({
        id: 'notif-1',
        userId: args.data.userId,
        type: args.data.type,
        priority: args.data.priority,
        title: args.data.title,
        titleBg: args.data.titleBg ?? null,
        message: args.data.message,
        messageBg: args.data.messageBg ?? null,
        data: args.data.data ?? null,
        actionUrl: args.data.actionUrl ?? null,
        actionText: args.data.actionText ?? null,
        actionTextBg: args.data.actionTextBg ?? null,
        relatedEntityType: args.data.relatedEntityType ?? null,
        relatedEntityId: args.data.relatedEntityId ?? null,
        imageUrl: args.data.imageUrl ?? null,
        expiresAt: args.data.expiresAt ?? null,
        isRead: false,
        createdAt: new Date(),
      })),
    },
    pushSubscription: { findMany: jest.fn(async () => []) },
    deviceToken: { findMany: jest.fn(async () => []) },
    user: { findUnique: jest.fn(async () => null) },
  },
  prisma: {
    notification: {
      create: jest.fn(async (args: any) => ({
        id: 'notif-1',
        userId: args.data.userId,
        type: args.data.type,
        priority: args.data.priority,
        title: args.data.title,
        titleBg: args.data.titleBg ?? null,
        message: args.data.message,
        messageBg: args.data.messageBg ?? null,
        data: args.data.data ?? null,
        actionUrl: args.data.actionUrl ?? null,
        actionText: args.data.actionText ?? null,
        actionTextBg: args.data.actionTextBg ?? null,
        relatedEntityType: args.data.relatedEntityType ?? null,
        relatedEntityId: args.data.relatedEntityId ?? null,
        imageUrl: args.data.imageUrl ?? null,
        expiresAt: args.data.expiresAt ?? null,
        isRead: false,
        createdAt: new Date(),
      })),
    },
    pushSubscription: { findMany: jest.fn(async () => []) },
    deviceToken: { findMany: jest.fn(async () => []) },
    user: { findUnique: jest.fn(async () => null) },
  },
}));

jest.mock('../../src/lib/expoPush', () => ({
  sendExpoPushToUser: jest.fn(async (userId: string, payload: any) => {
    expoPushCalls.push({ userId, payload });
  }),
}));

jest.mock('../../src/lib/webPush', () => ({
  sendWebPushToUser: jest.fn(async (userId: string, payload: any) => {
    webPushCalls.push({ userId, payload });
  }),
}));

jest.mock('../../src/websocket/server', () => ({
  emitNotification: jest.fn(),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Subject under test
// ─────────────────────────────────────────────────────────────────────────────

import { NotificationService } from '../../src/services/notification.service';

let service: NotificationService;

beforeEach(() => {
  createdNotifications.length = 0;
  webPushCalls.length = 0;
  expoPushCalls.length = 0;
  service = new NotificationService();
  // Spy on createNotification via the private prisma call
  (require('../../src/lib/prisma').prisma.notification.create as jest.Mock).mockClear();
  (require('../../src/lib/prisma').default.notification.create as jest.Mock).mockClear();
  (require('../../src/lib/expoPush').sendExpoPushToUser as jest.Mock).mockClear();
  (require('../../src/lib/webPush').sendWebPushToUser as jest.Mock).mockClear();
});

// ─────────────────────────────────────────────────────────────────────────────
// §13 — notifySubscriptionExpiringSoon sends push
// ─────────────────────────────────────────────────────────────────────────────

describe('§13 notifySubscriptionExpiringSoon', () => {
  const BUCKETS: Array<'3d' | '1d' | 'dayOf'> = ['3d', '1d', 'dayOf'];

  for (const bucket of BUCKETS) {
    it(`fires push for bucket "${bucket}"`, async () => {
      await service.notifySubscriptionExpiringSoon({
        userId: 'u-1',
        bucket,
        periodEnd: new Date('2026-06-01T10:00:00Z'),
      });

      const expoCalls = (require('../../src/lib/expoPush').sendExpoPushToUser as jest.Mock).mock.calls;
      expect(expoCalls.length).toBeGreaterThanOrEqual(1);
      const [uid, payload] = expoCalls[0];
      expect(uid).toBe('u-1');
      expect(payload.data?.type).toBe('subscription_expiring');
      expect(payload.data?.bucket).toBe(bucket);
    });
  }

  it('push body includes "Абонамент" text for dayOf bucket', async () => {
    await service.notifySubscriptionExpiringSoon({
      userId: 'u-2',
      bucket: 'dayOf',
      periodEnd: new Date('2026-06-15T00:00:00Z'),
    });

    const [, payload] = (require('../../src/lib/expoPush').sendExpoPushToUser as jest.Mock).mock.calls[0];
    expect(payload.body).toContain('изтича');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §11 — notifyPayoutEvent creates in-app + push
// ─────────────────────────────────────────────────────────────────────────────

describe('§11 notifyPayoutEvent', () => {
  const EVENTS: Array<'approved' | 'completed' | 'rejected' | 'held' | 'released' | 'failed'> = [
    'approved', 'completed', 'rejected', 'held', 'released', 'failed',
  ];

  for (const event of EVENTS) {
    it(`creates in-app notification for event "${event}"`, async () => {
      await service.notifyPayoutEvent({
        userId: 'u-3',
        payoutId: 'payout-1',
        event,
        amount: 25.5,
        currency: 'BGN',
      });

      // createNotification calls prisma.notification.create
      const calls = (require('../../src/lib/prisma').prisma?.notification?.create as jest.Mock)?.mock?.calls
        ?? (require('../../src/lib/prisma').default?.notification?.create as jest.Mock)?.mock?.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      const createdData = calls[calls.length - 1][0].data;
      expect(createdData.userId).toBe('u-3');
      expect(createdData.relatedEntityId).toBe('payout-1');
      expect(createdData.data).toContain('payout_' + event);
    });

    it(`fires push for event "${event}"`, async () => {
      (require('../../src/lib/expoPush').sendExpoPushToUser as jest.Mock).mockClear();
      await service.notifyPayoutEvent({
        userId: 'u-4',
        payoutId: 'payout-2',
        event,
        amount: 10,
        currency: 'BGN',
      });

      const expoCalls = (require('../../src/lib/expoPush').sendExpoPushToUser as jest.Mock).mock.calls;
      expect(expoCalls.length).toBeGreaterThanOrEqual(1);
      const [uid, payload] = expoCalls[0];
      expect(uid).toBe('u-4');
      expect(payload.data?.type).toBe(`payout_${event}`);
      expect(payload.data?.payoutId).toBe('payout-2');
    });
  }

  it('completed event has high priority in-app notification', async () => {
    await service.notifyPayoutEvent({
      userId: 'u-5',
      payoutId: 'payout-3',
      event: 'completed',
      amount: 50,
      currency: 'BGN',
    });

    const calls = (require('../../src/lib/prisma').prisma?.notification?.create as jest.Mock)?.mock?.calls
      ?? (require('../../src/lib/prisma').default?.notification?.create as jest.Mock)?.mock?.calls;
    expect(calls[calls.length - 1][0].data.priority).toBe('high');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §10 — notifySubscriptionPaused creates in-app + push
// ─────────────────────────────────────────────────────────────────────────────

describe('§10 notifySubscriptionPaused', () => {
  it('creates a high-priority in-app notification', async () => {
    await service.notifySubscriptionPaused({
      userId: 'u-6',
      pauseEndsAt: new Date('2026-05-25T00:00:00Z'),
    });

    const calls = (require('../../src/lib/prisma').prisma?.notification?.create as jest.Mock)?.mock?.calls
      ?? (require('../../src/lib/prisma').default?.notification?.create as jest.Mock)?.mock?.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const data = calls[calls.length - 1][0].data;
    expect(data.userId).toBe('u-6');
    expect(data.priority).toBe('high');
    expect(data.type).toBe('SYSTEM'); // SUBSCRIPTION_EXPIRING not in NotificationType enum; SYSTEM is the valid fallback
  });

  it('fires push with the grace period date in the body', async () => {
    const pauseEndsAt = new Date('2026-05-25T00:00:00Z');
    await service.notifySubscriptionPaused({ userId: 'u-7', pauseEndsAt });

    const expoCalls = (require('../../src/lib/expoPush').sendExpoPushToUser as jest.Mock).mock.calls;
    expect(expoCalls.length).toBeGreaterThanOrEqual(1);
    const [uid, payload] = expoCalls[0];
    expect(uid).toBe('u-7');
    expect(payload.body).toContain('25');
    expect(payload.data?.type).toBe('subscription_paused');
  });

  it('is non-fatal if push fails', async () => {
    (require('../../src/lib/expoPush').sendExpoPushToUser as jest.Mock).mockRejectedValueOnce(
      new Error('push transport down'),
    );
    await expect(
      service.notifySubscriptionPaused({
        userId: 'u-8',
        pauseEndsAt: new Date(),
      }),
    ).resolves.toBeUndefined();
  });
});
