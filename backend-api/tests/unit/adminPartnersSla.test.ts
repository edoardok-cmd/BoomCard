/**
 * Unit test for the §5.1 v1.1 SLA helper.
 *
 * Imports the live implementation directly so a refactor of the formula
 * cannot drift away from the test. (Pre-fix this file had a literal copy
 * of the function with a "keep in sync" comment that never did.)
 */

import { computePartnerSla, SLA_HOURS_INTERNAL } from '../../src/services/partnerSla.helper';

describe('§5.1 SLA helper', () => {
  it('returns ok within first 18h', () => {
    const joined = new Date(Date.now() - 2 * 3600 * 1000);
    const sla = computePartnerSla(joined, 'NOVA');
    expect(sla.state).toBe('ok');
    expect(sla.isClosed).toBe(false);
    expect(sla.hoursRemaining).toBeGreaterThan(20);
    expect(sla.deadlineHours).toBe(SLA_HOURS_INTERNAL);
  });

  it('returns warning at 75% (≥18h)', () => {
    const joined = new Date(Date.now() - 19 * 3600 * 1000);
    const sla = computePartnerSla(joined, 'KOMUNIKACIYA');
    expect(sla.state).toBe('warning');
  });

  it('returns overdue past 24h', () => {
    const joined = new Date(Date.now() - 30 * 3600 * 1000);
    const sla = computePartnerSla(joined, 'KOMUNIKACIYA');
    expect(sla.state).toBe('overdue');
    expect(sla.hoursRemaining).toBe(0);
  });

  // The generated Prisma client exposes the enum KEYS (APPROVED/REJECTED); the
  // Bulgarian strings (ODOBRENA/OTKAZANA) are only the DB-mapped storage values
  // (@map). Routes pass partner.requestStatus — i.e. the client key — into the
  // helper, so the closed-state cases must use APPROVED/REJECTED.
  it('marks closed when APPROVED (ODOBRENA) regardless of elapsed time', () => {
    const joined = new Date(Date.now() - 99 * 3600 * 1000);
    const sla = computePartnerSla(joined, 'APPROVED');
    expect(sla.state).toBe('ok');
    expect(sla.isClosed).toBe(true);
  });

  it('marks closed when REJECTED (OTKAZANA) regardless of elapsed time', () => {
    const joined = new Date(Date.now() - 200 * 3600 * 1000);
    const sla = computePartnerSla(joined, 'REJECTED');
    expect(sla.state).toBe('ok');
    expect(sla.isClosed).toBe(true);
  });

  it('treats null requestStatus as open (uses the SLA clock)', () => {
    const joined = new Date(Date.now() - 30 * 3600 * 1000);
    const sla = computePartnerSla(joined, null);
    expect(sla.isClosed).toBe(false);
    expect(sla.state).toBe('overdue');
  });

  it('accepts ISO-string joinedAt', () => {
    const joined = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const sla = computePartnerSla(joined, 'NOVA');
    expect(sla.state).toBe('ok');
  });
});
