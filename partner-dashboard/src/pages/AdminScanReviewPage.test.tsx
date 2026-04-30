import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminScanReviewPage, {
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
    // status=all is an explicit admin choice (show every status) — unique because
    // it is not the inferred default (MANUAL_REVIEW) and has no qualifier present
    ['status=all', 'status=all'],
    // triple-qualifier: explicit non-default status survives alongside bucket+reasons
    ['status=APPROVED&bucket=AUTO_0_30&reasons=anomaly', 'status=APPROVED&bucket=AUTO_0_30&reasons=anomaly'],
    // time-window alongside bucket — verify canonical param order (bucket before dateFromHours)
    ['bucket=AUTO_0_30&dateFromHours=24', 'bucket=AUTO_0_30&dateFromHours=24'],
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

// ─── Integration: live region + chip stateful behaviour ────────────────────
//
// These tests render the full component in a MemoryRouter with a mocked fetch
// and verify the WCAG 4.1.3 live region (data-testid="tw-live") and the
// time-window chip's aria-label across the applying → applied → removed cycle.
//
// What they cover that pure unit tests cannot:
//   • Live region text transitions driven by React state (not derivable from
//     pure hydrate/serialize functions)
//   • Chip aria-label before and after the async fetch resolves
//   • Chip removal wiring (commitFilters + MemoryRouter URL update)
//   • No stale applied-window text leaking into the DOM after chip removal
//   • B-B2: server-clamped value shown instead of raw user input
//
// What they deliberately do NOT cover (and why):
//   • The B-B1 invariant (appliedDateFromHours === undefined when
//     filterDateFromHours === '') is a React-state invariant invisible to the
//     DOM: the chip gate hides any stale value, so no DOM assertion can catch
//     its violation. RTL cannot inspect component state directly.
//   • Concurrent in-flight seq-guard behaviour — would require deliberate
//     fetch-timing control beyond Promise.resolve scheduling.

describe('AdminScanReviewPage — live region + chip (integration)', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // Returns a fetch mock that honours the ?dateFromHours param: only echoes
  // appliedHours in the response when the request URL actually includes it,
  // matching real server behaviour (no time-window param → no echo).
  const makeFetch = (appliedHours: number) =>
    vi.fn().mockImplementation((url: string) => {
      if (url.includes('stats')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { pending: 0, approved: 0, rejected: 0, avgFraudScore: 0 },
            }),
        });
      }
      const hasTimeWindow = url.includes('dateFromHours');
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [],
            meta: {
              total: 0,
              page: 1,
              limit: 25,
              pages: 1,
              appliedDateFromHours: hasTimeWindow ? appliedHours : undefined,
            },
          }),
      });
    });

  const renderPage = (search: string, fetchMock: ReturnType<typeof vi.fn>) => {
    vi.stubGlobal('fetch', fetchMock);
    return render(
      <MemoryRouter initialEntries={[`/${search}`]}>
        <AdminScanReviewPage />
      </MemoryRouter>,
    );
  };

  it('live region shows "applying" while the initial fetch is in flight', () => {
    // Fetch never resolves — simulates a slow network so we can inspect the
    // in-flight state before the server echoes its applied value.
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));
    render(
      <MemoryRouter initialEntries={['/?dateFromHours=24']}>
        <AdminScanReviewPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('tw-live').textContent).toBe('Time window filter applying…');
  });

  it('live region updates to the server-echoed value once the fetch resolves', async () => {
    renderPage('?dateFromHours=24', makeFetch(24));
    await waitFor(() =>
      expect(screen.getByTestId('tw-live').textContent).toBe(
        'Time window filter applied: last 24 hours',
      ),
    );
  });

  it('B-B2: live region shows the server-clamped value, not the raw user input', async () => {
    // User typed 99999; server clamps to 720 and echoes it back.
    renderPage('?dateFromHours=99999', makeFetch(720));
    await waitFor(() =>
      expect(screen.getByTestId('tw-live').textContent).toBe(
        'Time window filter applied: last 720 hours',
      ),
    );
    // Raw user input must not appear anywhere in the document.
    expect(screen.queryByText(/99999/)).not.toBeInTheDocument();
  });

  it('chip aria-label transitions from "(applying)" to "last N hours" after fetch', async () => {
    // Hold the scan response until we manually resolve it so we can assert
    // the aria-label in both in-flight and resolved states.
    let resolveJson!: (v: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('stats')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: { pending: 0, approved: 0, rejected: 0, avgFraudScore: 0 },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            new Promise((res) => {
              resolveJson = res;
            }),
        });
      }),
    );
    render(
      <MemoryRouter initialEntries={['/?dateFromHours=24']}>
        <AdminScanReviewPage />
      </MemoryRouter>,
    );

    // Chip is visible with "applying" label — effect hasn't resolved yet.
    expect(
      screen.getByRole('button', { name: 'Remove time-window filter (applying)' }),
    ).toBeInTheDocument();

    // resolveJson is assigned inside response.json() which is called by the
    // useEffect that fires after the first commit. Wait for that microtask
    // chain before calling it, then wrap in act so React processes the update.
    await waitFor(() => expect(typeof resolveJson).toBe('function'));
    await act(async () => {
      resolveJson({
        data: [],
        meta: { total: 0, page: 1, limit: 25, pages: 1, appliedDateFromHours: 24 },
      });
    });

    expect(
      screen.getByRole('button', { name: 'Remove time-window filter: last 24 hours' }),
    ).toBeInTheDocument();
  });

  it('clicking the chip removes it and clears the live region', async () => {
    renderPage('?dateFromHours=24', makeFetch(24));

    const chip = await screen.findByRole('button', {
      name: 'Remove time-window filter: last 24 hours',
    });
    fireEvent.click(chip);

    expect(screen.queryByRole('button', { name: /time-window/i })).not.toBeInTheDocument();
    // Live region must be empty — no stale window text exposed to screen readers.
    await waitFor(() =>
      expect(screen.getByTestId('tw-live').textContent).toBe(''),
    );
  });
});
