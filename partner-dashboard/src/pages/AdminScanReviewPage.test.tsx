import { describe, it, expect } from 'vitest';
import {
  hydrateFromUrl,
  serializeFilters,
  type HydratedFilters,
} from './AdminScanReviewPage';

const sp = (qs: string) => new URLSearchParams(qs);

describe('hydrateFromUrl', () => {
  it('returns the bare default for an empty URL', () => {
    expect(hydrateFromUrl(sp(''))).toEqual<HydratedFilters>({
      filterStatus: 'MANUAL_REVIEW',
      filterRisk: 'all',
      filterSuspicious: false,
      filterReasons: '',
      filterDateFromHours: '',
    });
  });

  it('infers status=active when a qualifier is present and no explicit status', () => {
    expect(hydrateFromUrl(sp('bucket=AUTO_0_30')).filterStatus).toBe('active');
    expect(hydrateFromUrl(sp('suspicious=true')).filterStatus).toBe('active');
    expect(hydrateFromUrl(sp('reasons=anomaly')).filterStatus).toBe('active');
  });

  it('does NOT infer active for a bare time-window deep-link', () => {
    expect(hydrateFromUrl(sp('dateFromHours=24')).filterStatus).toBe('MANUAL_REVIEW');
  });

  it('keeps an explicit status even when a qualifier is present', () => {
    const h = hydrateFromUrl(sp('status=MANUAL_REVIEW&bucket=AUTO_0_30'));
    expect(h.filterStatus).toBe('MANUAL_REVIEW');
    expect(h.filterRisk).toBe('BUCKET_AUTO_0_30');
  });

  it('rejects fractional and negative dateFromHours', () => {
    expect(hydrateFromUrl(sp('dateFromHours=24.7')).filterDateFromHours).toBe('');
    expect(hydrateFromUrl(sp('dateFromHours=-5')).filterDateFromHours).toBe('');
    expect(hydrateFromUrl(sp('dateFromHours=0')).filterDateFromHours).toBe('');
    expect(hydrateFromUrl(sp('dateFromHours=garbage')).filterDateFromHours).toBe('');
  });

  it('does NOT clamp large hour values (server is the source of truth, B-B2)', () => {
    expect(hydrateFromUrl(sp('dateFromHours=99999')).filterDateFromHours).toBe('99999');
  });

  it('treats a malformed bucket as no bucket (no silent active flip)', () => {
    const h = hydrateFromUrl(sp('bucket=garbage'));
    expect(h.filterRisk).toBe('all');
    expect(h.filterStatus).toBe('MANUAL_REVIEW');
  });

  it('hydrates legacy ?riskLevel= deep-links into the bucket scale', () => {
    expect(hydrateFromUrl(sp('riskLevel=HIGH')).filterRisk).toBe('BUCKET_HIGH_61_PLUS');
    expect(hydrateFromUrl(sp('riskLevel=CRITICAL')).filterRisk).toBe('BUCKET_HIGH_61_PLUS');
    expect(hydrateFromUrl(sp('riskLevel=MEDIUM')).filterRisk).toBe('BUCKET_REVIEW_31_60');
    expect(hydrateFromUrl(sp('riskLevel=LOW')).filterRisk).toBe('BUCKET_AUTO_0_30');
  });
});

describe('serializeFilters', () => {
  const base: HydratedFilters = {
    filterStatus: 'MANUAL_REVIEW',
    filterRisk: 'all',
    filterSuspicious: false,
    filterReasons: '',
    filterDateFromHours: '',
  };

  it('omits every param at the bare default', () => {
    expect(serializeFilters(base).toString()).toBe('');
  });

  it('omits status when it equals the inferred default with a qualifier', () => {
    const out = serializeFilters({ ...base, filterStatus: 'active', filterRisk: 'BUCKET_AUTO_0_30' });
    expect(out.toString()).toBe('bucket=AUTO_0_30');
  });

  it('emits status when it diverges from the inferred default', () => {
    const out = serializeFilters({ ...base, filterStatus: 'MANUAL_REVIEW', filterRisk: 'BUCKET_AUTO_0_30' });
    // qualifier present → inferred 'active' → MANUAL_REVIEW must be emitted
    expect(out.get('status')).toBe('MANUAL_REVIEW');
    expect(out.get('bucket')).toBe('AUTO_0_30');
  });

  it('emits dateFromHours but does NOT consider it a qualifier for inferred status', () => {
    // No qualifier → inferred default is MANUAL_REVIEW. So an explicit 'active'
    // with only a time-window must be emitted.
    const out = serializeFilters({ ...base, filterStatus: 'active', filterDateFromHours: '24' });
    expect(out.get('status')).toBe('active');
    expect(out.get('dateFromHours')).toBe('24');
  });
});

describe('hydrate ↔ serialize round-trips', () => {
  const cases: Array<[string, string]> = [
    // [input URL, canonical re-serialization]
    ['', ''],
    ['bucket=AUTO_0_30', 'bucket=AUTO_0_30'],
    ['status=active&bucket=AUTO_0_30', 'bucket=AUTO_0_30'], // status=active is inferred → dropped
    ['status=MANUAL_REVIEW&bucket=AUTO_0_30', 'status=MANUAL_REVIEW&bucket=AUTO_0_30'],
    ['suspicious=true', 'suspicious=true'],
    ['suspicious=true&reasons=anomaly', 'suspicious=true&reasons=anomaly'],
    ['status=APPROVED', 'status=APPROVED'],
    ['status=APPROVED&bucket=HIGH_61_PLUS', 'status=APPROVED&bucket=HIGH_61_PLUS'],
    ['dateFromHours=24', 'dateFromHours=24'],
    // Legacy ?riskLevel= is accepted in but never re-emitted (normalized to ?bucket=)
    ['riskLevel=HIGH', 'bucket=HIGH_61_PLUS'],
    ['riskLevel=MEDIUM', 'bucket=REVIEW_31_60'],
  ];

  it.each(cases)('serialize(hydrate(%j)) === %j', (input, expected) => {
    const out = serializeFilters(hydrateFromUrl(sp(input))).toString();
    expect(out).toBe(expected);
  });

  it('canonicalized output is itself a fixed point', () => {
    for (const [, canonical] of cases) {
      const once = serializeFilters(hydrateFromUrl(sp(canonical))).toString();
      const twice = serializeFilters(hydrateFromUrl(sp(once))).toString();
      expect(twice).toBe(once);
    }
  });
});
