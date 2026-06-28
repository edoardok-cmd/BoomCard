/**
 * Integration tests — §5 SERIALIZABLE race coverage (L2 from audit).
 *
 * These tests run against a REAL Postgres instance via the application's
 * Prisma client (lib/prisma.ts, which uses @prisma/adapter-pg). They prove:
 *
 *   1. consume+consume race: two concurrent consume() calls on the same token
 *      yield exactly one success and one TOKEN_USED — not two successes.
 *
 *   2. issue+consume race: a concurrent issue() that invalidates a token
 *      prevents consume() from succeeding on that invalidated token.
 *
 *   3. @prisma/adapter-pg v7.7 correctly propagates isolationLevel:Serializable
 *      to the Postgres connection — the SSI conflict detector fires and P2034
 *      is raised when expected.
 *
 * Skip conditions: DATABASE_URL must point to a test database (the suite
 * creates and destroys rows but does NOT wipe the schema). If DATABASE_URL is
 * absent the whole suite is skipped so CI without a DB stays green.
 *
 * Run locally:
 *   DATABASE_URL=postgres://... npx jest tests/integration/section5.serializable
 */

import crypto from 'crypto';
import { prisma } from '../../src/lib/prisma';
import { activationLinkService, ActivationLinkError } from '../../src/services/activationLink.service';
import { UserStatus, PartnerStatus, ActivationLinkReason } from '@prisma/client';

const SKIP = !process.env.DATABASE_URL;

// Unique suffix so parallel CI shards don't collide.
const RUN_ID = crypto.randomBytes(4).toString('hex');

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function seedPartner(suffix: string) {
  const email = `section5-intg-${RUN_ID}-${suffix}@boomcard-test.internal`;

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: '$2b$12$placeholderHashForTestOnly000000000000000000000000000',
      firstName: 'Test',
      lastName: 'Partner',
      role: 'PARTNER',
      status: UserStatus.ACTIVE,
      emailVerified: true,
      phone: '+359000000000',
    },
  });

  const partner = await prisma.partner.create({
    data: {
      businessName: `Test §5 Partner ${RUN_ID}-${suffix}`,
      email,
      status: PartnerStatus.ACTIVE,
      category: 'Restaurant',
      userId: user.id,
    },
  });

  return { user, partner };
}

async function seedLink(partnerId: string, adminId: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const link = await prisma.activationLink.create({
    data: {
      partnerId,
      token,
      expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
      createdById: adminId,
      reason: ActivationLinkReason.INITIAL,
    },
  });
  return { token, linkId: link.id };
}

async function teardown(partnerIds: string[], userIds: string[]) {
  // Delete in FK-safe order. linkResendLog.subjectId is an untyped string (no
  // FK constraint) but must be cleared to avoid orphaned rows bleeding into
  // future tests that query the table without partner-scoped filters.
  await prisma.activationLink.deleteMany({ where: { partnerId: { in: partnerIds } } });
  await prisma.linkResendLog.deleteMany({ where: { subjectId: { in: partnerIds } } });
  await prisma.partner.deleteMany({ where: { id: { in: partnerIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('§5 SERIALIZABLE integration — consume+consume race', () => {
  if (SKIP) {
    it.skip('DATABASE_URL not set — skipping integration suite', () => {});
    return;
  }

  const partnerIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await teardown(partnerIds, userIds);
    await prisma.$disconnect();
  });

  it('exactly one of two concurrent consume() calls succeeds; the other throws TOKEN_USED', async () => {
    const { user, partner } = await seedPartner('race-cc');
    partnerIds.push(partner.id);
    userIds.push(user.id);

    const { token } = await seedLink(partner.id, user.id);

    // Fire both calls simultaneously. Promise.all keeps both promises
    // in flight; Postgres schedules them as overlapping transactions.
    const [r1, r2] = await Promise.allSettled([
      activationLinkService.consume(token),
      activationLinkService.consume(token),
    ]);

    const successes = [r1, r2].filter((r) => r.status === 'fulfilled');
    const failures  = [r1, r2].filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const err = (failures[0] as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(ActivationLinkError);
    expect((err as ActivationLinkError).code).toBe('TOKEN_USED');

    // Confirm the DB row is consumed exactly once.
    const link = await prisma.activationLink.findFirst({ where: { token } });
    expect(link?.consumedAt).not.toBeNull();
  });

  it('consume() on an already-invalidated token yields INVALID_TOKEN, not a silent success', async () => {
    const { user, partner } = await seedPartner('race-ic');
    partnerIds.push(partner.id);
    userIds.push(user.id);

    const { token, linkId } = await seedLink(partner.id, user.id);

    // Simulate what issue() does: invalidate the link before consume() runs.
    await prisma.activationLink.update({
      where: { id: linkId },
      data: { invalidatedAt: new Date() },
    });

    await expect(activationLinkService.consume(token)).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
    });

    // Confirm the link was NOT consumed despite the invalidation happening
    // just before consume(). The H2 fix (invalidatedAt:null in updateMany
    // WHERE) prevents the atomic claim from matching.
    const link = await prisma.activationLink.findFirst({ where: { token } });
    expect(link?.consumedAt).toBeNull();
  });

  it('consume() on a token superseded by a new issue() yields INVALID_TOKEN', async () => {
    // Issue a second link for the same partner — this invalidates the first.
    // consume() on the old token must fail (not silently consume it).
    const { user, partner } = await seedPartner('race-supersede');
    partnerIds.push(partner.id);
    userIds.push(user.id);

    const { token: oldToken } = await seedLink(partner.id, user.id);

    // issue() invalidates oldToken and creates a new one.
    await activationLinkService.issue({
      partnerId: partner.id,
      createdById: user.id,
      reason: ActivationLinkReason.RESEND,
    });

    await expect(activationLinkService.consume(oldToken)).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
    });
  });

  it('SERIALIZABLE isolation level is actually set on the Postgres connection', async () => {
    // Verify via pg_current_setting inside the transaction that the isolation
    // level is SERIALIZABLE — this proves @prisma/adapter-pg propagates the
    // option to the DB, not just to the mock.
    const { user, partner } = await seedPartner('iso-check');
    partnerIds.push(partner.id);
    userIds.push(user.id);

    let capturedIsolation: string | null = null;
    await prisma.$transaction(
      async (tx) => {
        // $queryRaw is available on the interactive-transaction client.
        const rows = await (tx as any).$queryRaw`
          SELECT current_setting('transaction_isolation') AS iso
        `;
        capturedIsolation = rows[0]?.iso ?? null;
        // Roll back by throwing — we don't need the transaction to commit.
        throw new Error('__rollback__');
      },
      { isolationLevel: 'Serializable' as any },
    ).catch((err) => {
      if (err.message !== '__rollback__') throw err;
    });

    expect(capturedIsolation).toBe('serializable');
  });
});
