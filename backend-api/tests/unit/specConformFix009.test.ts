/**
 * BC-ADMIN-SPEC-CONFORM-FIX-009 — unit coverage for the deterministic,
 * dependency-free fixes shipped in this task.
 *
 *  - M4: computePartnerSla treats an ASSIGNED application as SLA-satisfied
 *        (assignment deadline), independent of elapsed time.
 *  - M3: the SLA clock anchors on the supplied createdAt.
 *  - M7: currencyDisplay emits {bgn, eur} during the transition window and
 *        EUR-only (bgn=null) after it closes; the fixed currency-board rate
 *        is applied.
 */

import { computePartnerSla } from '../../src/services/partnerSla.helper';
import { bgnToEur, toDualCurrency } from '../../src/utils/currencyDisplay';
import { EUR_TO_BGN_RATE } from '../../src/constants/receipt.constants';

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

describe('M7 — dual-currency display', () => {
  it('converts BGN→EUR at the fixed currency-board rate', () => {
    expect(bgnToEur(EUR_TO_BGN_RATE)).toBeCloseTo(1, 2);
    expect(bgnToEur(100)).toBeCloseTo(100 / EUR_TO_BGN_RATE, 2);
  });

  it('emits BOTH currencies while the window is OPEN', () => {
    const d = toDualCurrency(195.583, true);
    expect(d.windowOpen).toBe(true);
    expect(d.bgn).toBeCloseTo(195.58, 2);
    expect(d.eur).toBeCloseTo(100, 2);
  });

  it('hides BGN (null) and keeps EUR after the window CLOSES', () => {
    const d = toDualCurrency(195.583, false);
    expect(d.windowOpen).toBe(false);
    expect(d.bgn).toBeNull();
    expect(d.eur).toBeCloseTo(100, 2);
  });
});
