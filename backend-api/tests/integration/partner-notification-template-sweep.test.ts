/**
 * Static-analysis sweep: INV-NOTIF-002
 *
 * Spec §9.1 / Clash 6.1: the partner notification template list is canonical —
 * exactly 8 templates, no more, no less. "New Transaction" (#3) is a daily or
 * weekly digest, NOT a per-event real-time method.
 *
 * This test reads notification.service.ts at runtime, extracts every
 * `async notifyPartner*` method that calls `createNotification`, and asserts
 * the resulting set matches the canonical 8 exactly. If someone adds a new
 * per-event partner notification method it will fail with a clear diff.
 *
 * This file does NOT edit any src/** code.
 * EXPECTED STATE: GREEN when only the canonical 8 methods exist.
 */

import fs from 'fs';
import path from 'path';

const NOTIFICATION_SERVICE_PATH = path.join(
  __dirname,
  '../../src/services/notification.service.ts',
);

/**
 * Canonical §9.1 partner notification methods — exactly 8.
 *
 * #1  Activation Link / Welcome
 * #2  Onboarding Follow-Up
 * #3  New Transaction (daily/weekly digest — NOT per-event)
 * #4  Monthly Financial Summary
 * #5  Request Updates
 * #6  Status Changes
 * #7  Contract Changes
 * #8  Marketing
 */
const CANONICAL_PARTNER_NOTIFY_METHODS = new Set([
  'notifyPartnerWelcome',             // #1 Activation Link / onboarding welcome
  'notifyPartnerOnboardingIncomplete', // #2 Onboarding Follow-Up
  'notifyPartnerDailyDigest',         // #3 New Transaction (digest)
  'notifyPartnerMonthlyStatement',    // #4 Monthly Financial Summary
  'notifyPartnerRequestUpdate',       // #5 Request Updates
  'notifyPartnerStatusChange',        // #6 Status Changes
  'notifyPartnerContractChange',      // #7 Contract Changes
  'notifyPartnerMarketing',           // #8 Marketing
]);

/**
 * Extract all `async notifyPartner[A-Z]\w+` method names in the source file
 * whose method body (text up to the next `async ` keyword or end of class)
 * contains a call to `createNotification`.
 */
function extractPartnerNotifyMethodsWithCreateNotification(src: string): string[] {
  const methodPattern = /async (notifyPartner[A-Z]\w+)\s*\(/g;
  const found: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = methodPattern.exec(src)) !== null) {
    const name = match[1];
    // Slice from the current match position to find this method's body.
    // The body extends until the next top-level `async ` that looks like a
    // method declaration (preceded by whitespace, so we skip the current match).
    const afterMatch = src.slice(match.index + name.length);
    // Find the next occurrence of `async ` that is a sibling method
    // (i.e., not inside a string or nested arrow). This is a best-effort
    // heuristic using the pattern "  async " (2+ spaces) which is sufficient
    // for a consistently-indented class body.
    const nextMethodRe = /\n {2}async /;
    const nextMethodMatch = nextMethodRe.exec(afterMatch);
    const body = nextMethodMatch !== null
      ? afterMatch.slice(0, nextMethodMatch.index)
      : afterMatch;

    if (body.includes('createNotification')) {
      found.push(name);
    }
  }

  return found;
}

describe('partner-notification-template-sweep: INV-NOTIF-002 — exactly 8 canonical §9.1 partner templates', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(NOTIFICATION_SERVICE_PATH, 'utf-8');
  });

  it('notification.service.ts source file is readable', () => {
    expect(src.length).toBeGreaterThan(0);
  });

  it('contains no partner-facing notify methods beyond the canonical 8', () => {
    const found = extractPartnerNotifyMethodsWithCreateNotification(src);
    const extras = found.filter((m) => !CANONICAL_PARTNER_NOTIFY_METHODS.has(m));

    if (extras.length > 0) {
      const extraList = extras.map((m) => `  - ${m}`).join('\n');
      const canonicalList = [...CANONICAL_PARTNER_NOTIFY_METHODS].map((m) => `  - ${m}`).join('\n');
      throw new Error(
        `INV-NOTIF-002 VIOLATION: Found ${extras.length} non-canonical partner notify method(s) that call createNotification:\n` +
        `${extraList}\n\n` +
        `Allowed methods (spec §9.1 canonical 8):\n${canonicalList}\n\n` +
        `Remove the extra method(s) or reclassify them per §9.1 / Clash 6.1.`,
      );
    }

    expect(extras).toEqual([]);
  });

  it('all 8 canonical methods are present — no silent removal', () => {
    for (const name of CANONICAL_PARTNER_NOTIFY_METHODS) {
      expect(src).toContain(`async ${name}(`);
    }
  });

  it('removed non-canonical methods are absent', () => {
    const removedMethods = [
      'notifyPartnerScanAtVenue',
      'notifyPartnerReceiptAtVenue',
      'notifyPartnerOfferRedeemed',
    ];
    for (const name of removedMethods) {
      const present = src.includes(`async ${name}(`);
      if (present) {
        throw new Error(
          `INV-NOTIF-002 VIOLATION: Non-canonical method "async ${name}(" still exists in notification.service.ts. ` +
          `This method was removed per spec §9.1 / Clash 6.1.`,
        );
      }
      expect(present).toBe(false);
    }
  });

  it('getVenuePartnerOwner private helper is absent (dead code removed with its callers)', () => {
    const present = src.includes('getVenuePartnerOwner');
    if (present) {
      throw new Error(
        'INV-NOTIF-002 VIOLATION: "getVenuePartnerOwner" still exists in notification.service.ts. ' +
        'This helper was only used by notifyPartnerScanAtVenue and notifyPartnerReceiptAtVenue — ' +
        'both of which were removed. Remove the dead helper.',
      );
    }
    expect(present).toBe(false);
  });
});
