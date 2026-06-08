/**
 * Per-job scheduler-failure alerting (cross-job alert suppression fix).
 *
 * BUG: notifyAdminSchedulerFailure used a FIXED opsType 'scheduler_failure', and
 * notifyAdminOps dedupes/cooldowns by opsType. The first job to fail in a 24h
 * window took the only cooldown slot, so a genuine failure of ANY OTHER job that
 * day was silently swallowed.
 *
 * FIX: opsType is now per-job (`scheduler_failure_<sanitized jobName>`), giving
 * each distinct job its own independent cooldown slot, while repeated failures
 * of the SAME job within the window are still deduped.
 *
 * The DB layer is mocked with a STATEFUL in-memory store so the real cooldown
 * `findFirst({ data: { contains } })` match runs against the real opsType string
 * embedded by `create`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Stateful in-memory notification store
// ─────────────────────────────────────────────────────────────────────────────

interface FakeNotification {
  id: string;
  data: string | null; // serialized JSON, as the real column stores it
  createdAt: Date;
}

const store: FakeNotification[] = [];
let idSeq = 0;

function matchesContains(row: FakeNotification, needle: string): boolean {
  return typeof row.data === 'string' && row.data.includes(needle);
}

const prismaMock = {
  notification: {
    // createNotification serializes data; emulate that here so the cooldown
    // `contains` match sees the same `"opsType":"..."` substring it looks for.
    create: jest.fn(async (args: any) => {
      const data =
        args.data.data && typeof args.data.data === 'object'
          ? JSON.stringify(args.data.data)
          : args.data.data ?? null;
      const row: FakeNotification = {
        id: `notif-${++idSeq}`,
        data,
        createdAt: new Date(),
      };
      store.push(row);
      return { id: row.id, ...args.data, createdAt: row.createdAt };
    }),
    findFirst: jest.fn(async (q: any) => {
      // Emulate the OR/contains/createdAt-gte cooldown query.
      const ors: any[] = q?.where?.OR ?? [q?.where ?? {}];
      const hit = store.find((row) =>
        ors.some((cond) => {
          const needle = cond?.data?.contains;
          const since = cond?.createdAt?.gte as Date | undefined;
          if (needle == null) return false;
          if (!matchesContains(row, needle)) return false;
          if (since && row.createdAt < since) return false;
          return true;
        })
      );
      return hit ? { id: hit.id } : null;
    }),
  },
  user: {
    findMany: jest.fn(async () => [{ id: 'admin-1', email: 'admin@boomcard.bg' }]),
  },
  pushSubscription: { findMany: jest.fn(async () => []) },
  deviceToken: { findMany: jest.fn(async () => []) },
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
  prisma: prismaMock,
}));

jest.mock('../../src/services/email.service', () => ({
  __esModule: true,
  emailService: { sendEmail: jest.fn(async () => undefined) },
}));

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { notificationService } from '../../src/services/notification.service';

function opsTypesCreated(): string[] {
  return store
    .map((r) => {
      try {
        return r.data ? (JSON.parse(r.data).opsType as string) : undefined;
      } catch {
        return undefined;
      }
    })
    .filter((v): v is string => typeof v === 'string');
}

describe('notifyAdminSchedulerFailure — per-job cooldown', () => {
  beforeEach(() => {
    store.length = 0;
    idSeq = 0;
    jest.clearAllMocks();
  });

  it('two DIFFERENT failing jobs produce two independent alerts (not deduped against each other)', async () => {
    await notificationService.notifyAdminSchedulerFailure({
      jobName: 'cashback-expiry',
      errorMessage: 'boom A',
    });
    await notificationService.notifyAdminSchedulerFailure({
      jobName: 'subscription-expiry',
      errorMessage: 'boom B',
    });

    const opsTypes = opsTypesCreated();
    // One notification per job, with distinct per-job opsTypes.
    expect(opsTypes).toContain('scheduler_failure_cashback_expiry');
    expect(opsTypes).toContain('scheduler_failure_subscription_expiry');
    expect(opsTypes.length).toBe(2);
    // The second job was NOT suppressed by the first job's cooldown slot.
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(2);
  });

  it('repeated failures of the SAME job within the window are deduped', async () => {
    await notificationService.notifyAdminSchedulerFailure({
      jobName: 'cashback-expiry',
      errorMessage: 'first failure',
    });
    await notificationService.notifyAdminSchedulerFailure({
      jobName: 'cashback-expiry',
      errorMessage: 'second failure same night',
    });

    const opsTypes = opsTypesCreated();
    // Only the first failure of the same job creates a notification.
    expect(opsTypes).toEqual(['scheduler_failure_cashback_expiry']);
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
  });

  it('combined: each distinct job alerts once, repeats are swallowed', async () => {
    const jobs = ['cashback-expiry', 'subscription-expiry', 'menu-expiry'];
    // Fail every job twice in the window.
    for (const jobName of jobs) {
      await notificationService.notifyAdminSchedulerFailure({ jobName, errorMessage: 'x' });
      await notificationService.notifyAdminSchedulerFailure({ jobName, errorMessage: 'y' });
    }

    const opsTypes = opsTypesCreated().sort();
    expect(opsTypes).toEqual([
      'scheduler_failure_cashback_expiry',
      'scheduler_failure_menu_expiry',
      'scheduler_failure_subscription_expiry',
    ]);
    // 3 distinct jobs → exactly 3 alerts despite 6 failures.
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(3);
  });

  it('sanitizes jobName into a stable alphanumeric/underscore key', async () => {
    await notificationService.notifyAdminSchedulerFailure({
      jobName: 'Some Weird/Job.Name!!',
      errorMessage: 'x',
    });
    expect(opsTypesCreated()).toEqual(['scheduler_failure_some_weird_job_name']);
  });
});
