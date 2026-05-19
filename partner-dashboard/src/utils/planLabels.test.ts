/**
 * Regression tests for the §4 audit fix:
 *   PAUSED subscription label must be "Спрян" / "Suspended" per spec §4.2,
 *   not "На пауза" / "Paused".
 */
import { describe, it, expect } from 'vitest';
import { subStatusLabel } from './planLabels';
import { customerSubStatusLabel } from './customerLabels';

describe('PAUSED subscription label — spec §4.2 "Спрян"', () => {
  it('admin label BG: PAUSED → Спрян', () => {
    expect(subStatusLabel('PAUSED', 'bg')).toBe('Спрян');
  });

  it('admin label EN: PAUSED → Suspended', () => {
    expect(subStatusLabel('PAUSED', 'en')).toBe('Suspended');
  });

  it('customer label BG: PAUSED → Спрян', () => {
    expect(customerSubStatusLabel('PAUSED', 'bg')).toBe('Спрян');
  });

  it('customer label EN: PAUSED → Suspended', () => {
    expect(customerSubStatusLabel('PAUSED', 'en')).toBe('Suspended');
  });

  it('other subscription statuses are unaffected', () => {
    expect(subStatusLabel('ACTIVE', 'bg')).toBe('Активен');
    expect(subStatusLabel('FAILED_PAYMENT', 'bg')).toBe('Неуспешно плащане');
    expect(subStatusLabel('EXPIRED', 'bg')).toBe('Изтекъл');
    expect(subStatusLabel('CANCELLED', 'bg')).toBe('Отказан');
  });

  it('SUSPENDED user account status remains "Спрян" (not regressed)', () => {
    // USER_STATUS_LABELS.SUSPENDED was already "Спрян" and must stay so.
    import('./planLabels').then(({ USER_STATUS_LABELS }) => {
      expect(USER_STATUS_LABELS.SUSPENDED.bg).toBe('Спрян');
    });
  });
});
