/**
 * BC-ADMIN-SPEC-CONFORM-FIX-009 — unit coverage for the deterministic,
 * dependency-free fixes shipped in this task.
 *
 *  - M4: computePartnerSla treats an ASSIGNED application as SLA-satisfied
 *        (assignment deadline), independent of elapsed time.
 *  - M3: the SLA clock anchors on the supplied createdAt.
 */

import { computePartnerSla } from '../../src/services/partnerSla.helper';

describe('M4 — SLA assignment-deadline semantics', () => {
  it('an ASSIGNED application past 24h is SLA-satisfied (ok, not overdue)', () => {
    const created = new Date(Date.now() - 48 * 3600 * 1000); // 48h old
    const sla = computePartnerSla(created, 'NOVA', 'admin-123');
    expect(sla.state).toBe('ok');
  });

  it('an UNASSIGNED application past 24h is overdue', () => {
    const created = new Date(Date.now() - 48 * 3600 * 1000);
    const slaNull = computePartnerSla(created, 'NOVA', null);
    const slaEmpty = computePartnerSla(created, 'NOVA', '');
    expect(slaNull.state).toBe('overdue');
    expect(slaEmpty.state).toBe('overdue');
  });

  it('defaults to unassigned when the assignment arg is omitted (back-compat)', () => {
    const created = new Date(Date.now() - 48 * 3600 * 1000);
    const sla = computePartnerSla(created, 'NOVA');
    expect(sla.state).toBe('overdue');
  });
});

describe('M3 — SLA clock anchors on createdAt', () => {
  it('a fresh createdAt yields ok regardless of any other timestamp', () => {
    const created = new Date(Date.now() - 1 * 3600 * 1000); // 1h old
    const sla = computePartnerSla(created, null, null);
    expect(sla.state).toBe('ok');
    expect(sla.hoursRemaining).toBeGreaterThan(22);
  });
});
