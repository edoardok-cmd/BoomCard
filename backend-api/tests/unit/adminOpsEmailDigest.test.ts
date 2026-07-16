/**
 * notifyAdminOps sendEmail:false + a single GLOBAL cooldown for the batch
 * email (partner SLA email flood fix).
 *
 * BUG 1: escalateOverduePartnerSla (scheduler.ts) called notifyAdminOps once
 * PER overdue partner with severity:'critical', and notifyAdminOps sent its
 * own email on every critical call. N overdue partners in the same hourly
 * tick produced N separate "[BoomCard admin] Partner SLA Overdue" emails.
 *
 * BUG 2 (found after deploying the fix for BUG 1): each partner still had
 * its OWN 20h cooldown gating the batch email, so distinct partners crossing
 * the 24h threshold in DIFFERENT hourly ticks each produced their own
 * separate one-item email — e.g. a 100-partner signup spike staggered across
 * a few hours still meant "pages" of near-identical single-item emails.
 *
 * FIX: notifyAdminOps({ sendEmail: false }) still creates the in-app bell row
 * and still respects/writes the PER-PARTNER cooldown (for bell-notification
 * dedup), but skips sending its own email. The actual email is sent once via
 * a SEPARATE notifyAdminOps call keyed to a single fixed opsType
 * ('partner-sla-overdue-digest') with its own cooldown — this caps the
 * mailbox to at most one email per cooldown window, listing every
 * currently-overdue application (1 or 100), regardless of how many separate
 * scans found them or when each one individually crossed its threshold.
 */

interface FakeNotification {
  id: string;
  data: string | null;
  createdAt: Date;
}

const store: FakeNotification[] = [];
let idSeq = 0;

function matchesContains(row: FakeNotification, needle: string): boolean {
  return typeof row.data === 'string' && row.data.includes(needle);
}

const prismaMock = {
  notification: {
    create: jest.fn(async (args: any) => {
      const data =
        args.data.data && typeof args.data.data === 'object'
          ? JSON.stringify(args.data.data)
          : args.data.data ?? null;
      const row: FakeNotification = { id: `notif-${++idSeq}`, data, createdAt: new Date() };
      store.push(row);
      return { id: row.id, ...args.data, createdAt: row.createdAt };
    }),
    findFirst: jest.fn(async (q: any) => {
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

const sendEmailMock = jest.fn(async () => undefined);
jest.mock('../../src/services/email.service', () => ({
  __esModule: true,
  emailService: { sendEmail: sendEmailMock },
}));

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { notificationService } from '../../src/services/notification.service';

describe('partner SLA overdue email batching', () => {
  beforeEach(() => {
    store.length = 0;
    idSeq = 0;
    jest.clearAllMocks();
  });

  it('sendEmail:false suppresses the per-item email but still creates the in-app row', async () => {
    const fired = await notificationService.notifyAdminOps({
      opsType: 'partner-sla-overdue-p1',
      title: 'Partner SLA Overdue',
      message: 'Application "Test Co" has been UNASSIGNED for 30h.',
      severity: 'critical',
      cooldownHours: 20,
      sendEmail: false,
    });

    expect(fired).toBe(true);
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('three overdue partners in one scan produce ONE digest email, not three', async () => {
    const partners = [
      { id: 'p1', businessName: 'Test Co' },
      { id: 'p2', businessName: 'Probe Biz' },
      { id: 'p3', businessName: 'Acme Ltd' },
    ];

    const fields: Array<{ label: string; value: string }> = [];
    for (const partner of partners) {
      const fired = await notificationService.notifyAdminOps({
        opsType: `partner-sla-overdue-${partner.id}`,
        title: 'Partner SLA Overdue',
        message: `Application "${partner.businessName}" has been UNASSIGNED past the SLA.`,
        severity: 'critical',
        cooldownHours: 20,
        sendEmail: false,
      });
      if (fired) fields.push({ label: partner.businessName, value: 'overdue' });
    }

    expect(sendEmailMock).not.toHaveBeenCalled();

    await notificationService.sendAdminOpsDigestEmail({
      title: 'Partner SLA Overdue',
      message: `${fields.length} partner application(s) are overdue.`,
      fields,
    });

    // One email to the one admin, not one per overdue partner.
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const calls = sendEmailMock.mock.calls as unknown as Array<[{ html: string }]>;
    const html = calls[0][0].html;
    expect(html).toContain('Test Co');
    expect(html).toContain('Probe Biz');
    expect(html).toContain('Acme Ltd');
  });

  it('a partner still within its own cooldown window is excluded from the next digest', async () => {
    const call = () =>
      notificationService.notifyAdminOps({
        opsType: 'partner-sla-overdue-p1',
        title: 'Partner SLA Overdue',
        message: 'Application "Test Co" has been UNASSIGNED.',
        severity: 'critical',
        cooldownHours: 20,
        sendEmail: false,
      });

    const firstRun = await call();
    const secondRunSameHour = await call();

    expect(firstRun).toBe(true);
    expect(secondRunSameHour).toBe(false);
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
  });

  it('a GLOBAL digest cooldown caps the mailbox to one email even across separate scans with different overdue partners', async () => {
    // Scan #1: "Test Co" is overdue. Sends the batch email.
    await notificationService.notifyAdminOps({
      opsType: 'partner-sla-overdue-digest',
      title: 'Partner SLA Overdue',
      message: '1 partner application(s) are UNASSIGNED past the 24h internal assignment SLA.',
      severity: 'critical',
      fields: [{ label: 'Test Co', value: 'overdue' }],
      cooldownHours: 20,
    });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    // Scan #2 (next hourly tick): a DIFFERENT partner ("Probe Biz") has now
    // also crossed the 24h threshold. Without a global cooldown this would
    // fire its own separate email — exactly the staggered-flood symptom the
    // user reported (many "1 partner application(s)" emails over time).
    await notificationService.notifyAdminOps({
      opsType: 'partner-sla-overdue-digest',
      title: 'Partner SLA Overdue',
      message: '2 partner application(s) are UNASSIGNED past the 24h internal assignment SLA.',
      severity: 'critical',
      fields: [
        { label: 'Test Co', value: 'overdue' },
        { label: 'Probe Biz', value: 'overdue' },
      ],
      cooldownHours: 20,
    });

    // Still just the one email from scan #1 — scan #2 is suppressed by the
    // shared 'partner-sla-overdue-digest' cooldown regardless of which
    // partners are in its field list.
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('a 100-partner spike in one scan still produces exactly one email', async () => {
    const fields = Array.from({ length: 100 }, (_, i) => ({
      label: `Partner ${i}`,
      value: 'overdue',
    }));

    await notificationService.notifyAdminOps({
      opsType: 'partner-sla-overdue-digest',
      title: 'Partner SLA Overdue',
      message: '100 partner application(s) are UNASSIGNED past the 24h internal assignment SLA.',
      severity: 'critical',
      fields,
      cooldownHours: 20,
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});
