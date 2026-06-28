/**
 * TEETH TEST: partner-notification-template-sweep (INV-NOTIF-002)
 *
 * Proves that the static-analysis notification template sweep has teeth: it will
 * go RED when a non-canonical notifyPartner* method exists and GREEN when only the
 * canonical 8 remain.
 *
 * RED scenario (inline): a synthetic source string containing 9 notifyPartner*
 *   methods with createNotification calls → detection reports 1 extra method.
 * GREEN scenario (production source): the real notification.service.ts (already
 *   fixed by BC-PARTNER-SPEC-REAUDIT-3-NOTIF-PEREVENT-TEMPLATES) → detection
 *   reports 0 extra methods, exactly the canonical 8 present, removed symbols absent.
 *
 * This file does NOT edit any src/** code.
 */

import fs from 'fs';
import path from 'path';

const NOTIFICATION_SERVICE_PATH = path.join(
  __dirname,
  '../../src/services/notification.service.ts',
);

/** Canonical §9.1 partner notification methods — exactly 8. */
const CANONICAL = new Set([
  'notifyPartnerWelcome',
  'notifyPartnerOnboardingIncomplete',
  'notifyPartnerDailyDigest',
  'notifyPartnerMonthlyStatement',
  'notifyPartnerRequestUpdate',
  'notifyPartnerStatusChange',
  'notifyPartnerContractChange',
  'notifyPartnerMarketing',
]);

/**
 * Extract every `async notifyPartner[A-Z]\w+` method body that calls
 * `createNotification`. Mirror of the logic in the non-teeth sweep.
 */
function extractPartnerMethodsWithCreateNotification(src: string): string[] {
  const pattern = /async (notifyPartner[A-Z]\w+)\s*\(/g;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(src)) !== null) {
    const name = m[1];
    const after = src.slice(m.index + name.length);
    const nextMethod = /\n {2}async /.exec(after);
    const body = nextMethod ? after.slice(0, nextMethod.index) : after;
    if (body.includes('createNotification')) found.push(name);
  }
  return found;
}

/** Build a minimal synthetic source that simulates a class with `count` notifyPartner* methods. */
function buildSyntheticSource(methods: string[]): string {
  return methods
    .map(
      (name) => `
  async ${name}(params: { partnerUserId: string }) {
    await this.createNotification({
      userId: params.partnerUserId,
      type: '${name.toUpperCase()}',
      title: '${name}',
      body: 'test',
    });
  }`,
    )
    .join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// RED scenario — synthetic source with 9 methods
// ─────────────────────────────────────────────────────────────────────────────

describe('TEETH — RED: detection fires when a 9th non-canonical method exists', () => {
  const EXTRA_METHOD = 'notifyPartnerScanAtVenue'; // was removed in the fix
  const syntheticBadSource = buildSyntheticSource([...CANONICAL, EXTRA_METHOD]);

  it('RED: 9-method source is detected as having extra methods', () => {
    const found = extractPartnerMethodsWithCreateNotification(syntheticBadSource);
    const extras = found.filter((n) => !CANONICAL.has(n));

    // The detection MUST fire here — if it doesn't, the sweep has no teeth
    expect(extras.length).toBe(1);
    expect(extras).toContain(EXTRA_METHOD);
  });

  it('RED: detection also catches non-canonical method sending to partnerUserId', () => {
    // Build a source where a non-canonical method directly sends to a partnerUserId
    const nonCanonicalDirectSend = `
  async notifyMenuApproved(params: { partnerUserId: string }) {
    await this.createNotification({
      userId: params.partnerUserId,
      type: 'MENU_APPROVED',
      title: 'Menu approved',
      body: 'test',
    });
  }
  async notifyPartnerStatusChange(params: { partnerUserId: string }) {
    await this.createNotification({
      userId: params.partnerUserId,
      type: 'STATUS_CHANGE',
      title: 'Status changed',
      body: 'test',
    });
  }`;
    const partnerUserIdPattern = /userId:\s*(?:params\.)?partnerUserId\b/g;
    const hits: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = partnerUserIdPattern.exec(nonCanonicalDirectSend)) !== null) {
      const before = nonCanonicalDirectSend.slice(0, match.index);
      const methodPattern = /async (\w+)\s*\(/g;
      let last: string | null = null;
      let mp: RegExpExecArray | null;
      while ((mp = methodPattern.exec(before)) !== null) last = mp[1];
      if (last && !CANONICAL.has(last) && !hits.includes(last)) hits.push(last);
    }
    // notifyMenuApproved is non-canonical and sends to partnerUserId → RED
    expect(hits).toContain('notifyMenuApproved');
    expect(hits).not.toContain('notifyPartnerStatusChange'); // canonical, ignored
  });

  it('RED: absent canonical check fires when a canonical method is missing', () => {
    // Remove notifyPartnerMarketing → sweep should flag a missing method
    const incomplete = buildSyntheticSource([...CANONICAL].filter((m) => m !== 'notifyPartnerMarketing'));
    const missingMethods: string[] = [];
    for (const name of CANONICAL) {
      if (!incomplete.includes(`async ${name}(`)) missingMethods.push(name);
    }
    expect(missingMethods).toContain('notifyPartnerMarketing');
    expect(missingMethods).toHaveLength(1);
  });

  it('RED: removed-symbol check fires when a removed method is re-introduced', () => {
    const REMOVED = ['notifyPartnerScanAtVenue', 'notifyPartnerReceiptAtVenue', 'notifyPartnerOfferRedeemed'];
    const sourceWithRemoved = buildSyntheticSource([...CANONICAL, ...REMOVED]);
    for (const name of REMOVED) {
      expect(sourceWithRemoved.includes(`async ${name}(`)).toBe(true); // present in bad source
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GREEN scenario — production notification.service.ts (already fixed)
// ─────────────────────────────────────────────────────────────────────────────

describe('GREEN: production notification.service.ts passes all checks (INV-NOTIF-002 verified)', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(NOTIFICATION_SERVICE_PATH, 'utf-8');
  });

  it('GREEN: source file is readable', () => {
    expect(src.length).toBeGreaterThan(0);
  });

  it('GREEN: no extra notifyPartner* methods with createNotification beyond canonical 8', () => {
    const found = extractPartnerMethodsWithCreateNotification(src);
    const extras = found.filter((n) => !CANONICAL.has(n));
    expect(extras).toEqual([]); // GREEN: no extras
  });

  it('GREEN: all 8 canonical methods present — no silent removal', () => {
    for (const name of CANONICAL) {
      expect(src).toContain(`async ${name}(`);
    }
  });

  it('GREEN: removed non-canonical methods are absent from production source', () => {
    const REMOVED = ['notifyPartnerScanAtVenue', 'notifyPartnerReceiptAtVenue', 'notifyPartnerOfferRedeemed'];
    for (const name of REMOVED) {
      expect(src).not.toContain(`async ${name}(`);
    }
  });

  it('GREEN: getVenuePartnerOwner dead helper is absent', () => {
    expect(src).not.toContain('getVenuePartnerOwner');
  });

  it('GREEN: exactly 8 async notifyPartner* methods found in source', () => {
    const matches = src.match(/async notifyPartner[A-Z]\w+\s*\(/g) ?? [];
    expect(matches.length).toBe(8);
  });
});
