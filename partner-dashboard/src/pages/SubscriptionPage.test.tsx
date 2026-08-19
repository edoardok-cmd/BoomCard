// ─── Regression: error-vs-empty subscription state (BC-QA-019-FOLLOWUP-1) ──
//
// SubscriptionPage.tsx has three mutually-exclusive render branches driven by
// useCurrentSubscription()'s { data, isLoading, isError } result:
//   1. isLoading                -> loading spinner
//   2. isError && !subscription -> distinct "load failed" + Retry UI
//   3. !subscription (no error) -> genuinely-empty "no active subscription" UI
//   4. otherwise                -> the real subscription UI
//
// Branch 2 exists specifically so a failed GET /subscriptions/current is never
// misrepresented as "no active subscription" (which would wrongly push a
// paying subscriber toward "buy again"). It is deliberately guarded on
// `!subscription` so that a LATER background refetch failure (e.g. via the
// app's global refetchOnReconnect: true) does not blow away an already-loaded,
// already-rendered subscription with the error screen.
//
// These tests mock apiService.get (the actual network boundary billingService
// calls through) and drive React Query directly, following the "render the
// full component + mocked network layer" convention used by
// AdminScanReviewPage.test.tsx.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '../contexts/LanguageContext';
import { apiService } from '../services/api.service';
import SubscriptionPage from './SubscriptionPage';
import type { Subscription } from '../services/billing.service';

vi.mock('../services/api.service', () => ({
  apiService: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockGet = apiService.get as unknown as ReturnType<typeof vi.fn>;

const realSubscription: Subscription = {
  id: 'sub_123',
  userId: 'user_1',
  plan: 'PREMIUM_MONTHLY',
  status: 'ACTIVE',
  currentPeriodStart: '2026-08-01T00:00:00.000Z',
  currentPeriodEnd: '2026-09-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  cancelAt: null,
  autoRenewal: true,
  retryAttempt: 0,
  trialRefundEligibleUntil: null,
  trialRefundUsed: false,
  stripeSubscriptionId: 'sub_stripe_1',
  payseraOrderId: null,
  paymentMethod: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const emptySubscriptionResponse = { hasSubscription: false, subscription: null };

// billingService.getCurrentSubscription() calls apiService.get('/subscriptions/current').
// useSubscriptionHistory() (enabled only once a subscription exists) calls
// apiService.get('/subscriptions/history') — route responses by URL so both
// queries the page can fire are handled deterministically.
function routeGet(
  subscriptionHandler: (url: string) => unknown,
) {
  mockGet.mockImplementation(async (url: string) => {
    if (url === '/subscriptions/current') {
      return subscriptionHandler(url);
    }
    if (url === '/subscriptions/history') {
      return { history: [] };
    }
    throw new Error(`Unexpected apiService.get call: ${url}`);
  });
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
    },
  });
}

function renderPage(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <MemoryRouter>
          <SubscriptionPage />
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

describe('SubscriptionPage — error vs empty subscription state', () => {
  beforeEach(() => {
    localStorage.setItem('boomcard_language', 'en');
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders the load-failed/retry UI (not the empty-state UI) when the fetch fails with no prior data', async () => {
    routeGet(() => {
      throw new Error('Network error');
    });

    renderPage(makeQueryClient());

    // useCurrentSubscription() retries once (its own retry function, not the
    // QueryClient default) before settling into isError — the default query
    // status classifies non-HTTP errors for one retry with backoff, so allow
    // enough time for that single retry + backoff delay to elapse.
    await waitFor(
      () => {
        expect(screen.getByText('We could not load your subscription. Please try again.')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // Must NOT show the genuinely-empty "no active subscription" copy or CTA.
    expect(screen.queryByText('No active subscription found.')).not.toBeInTheDocument();
    expect(screen.queryByText('View Plans')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('clicking Retry re-triggers the fetch (refetch)', async () => {
    routeGet(() => {
      throw new Error('Network error');
    });

    renderPage(makeQueryClient());

    await waitFor(
      () => {
        expect(screen.getByText('We could not load your subscription. Please try again.')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    const callsBeforeRetry = mockGet.mock.calls.filter((c) => c[0] === '/subscriptions/current').length;

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      const callsAfterRetry = mockGet.mock.calls.filter((c) => c[0] === '/subscriptions/current').length;
      expect(callsAfterRetry).toBeGreaterThan(callsBeforeRetry);
    });

    // The manual refetch() itself goes through useCurrentSubscription()'s own
    // single-retry-with-backoff policy again before settling back into
    // isError — give it the same headroom as the initial fetch. Still shows
    // the load-failed UI throughout (and after), since the mock keeps
    // rejecting — never flips to the empty-state UI.
    await waitFor(
      () => {
        expect(screen.getByText('We could not load your subscription. Please try again.')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
    expect(screen.queryByText('No active subscription found.')).not.toBeInTheDocument();
  });

  it('keeps showing the already-loaded subscription when a LATER background refetch fails', async () => {
    const queryClient = makeQueryClient();

    // Pre-populate the cache with a successful result under the exact query
    // key useCurrentSubscription() uses, so the component mounts already
    // "hydrated" the way a real prior-successful-fetch scenario would leave it.
    queryClient.setQueryData(['billing', 'subscription'], realSubscription);

    // The mocked network layer rejects on every call from here on — this
    // simulates a background refetch (e.g. triggered by refetchOnReconnect)
    // failing after data was already loaded successfully.
    routeGet((url) => {
      if (url === '/subscriptions/current') {
        throw new Error('Network error');
      }
      return { history: [] };
    });

    renderPage(queryClient);

    // Force the background refetch this test is exercising, wrapped in act()
    // so the resulting isError/data state update is flushed synchronously
    // before we assert on the rendered output.
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['billing', 'subscription'] }).catch(() => {
        // refetchQueries rejects when the underlying queryFn throws; the
        // component's own isError/data handling is what we're asserting on.
      });
    });

    // The real subscription UI must persist — not the load-failed screen.
    await waitFor(() => {
      expect(screen.getByText('Manage Subscription')).toBeInTheDocument();
    });
    expect(screen.queryByText('We could not load your subscription. Please try again.')).not.toBeInTheDocument();
    expect(screen.queryByText('No active subscription found.')).not.toBeInTheDocument();

    // Sanity: the query really is in an error state now (proves this test
    // exercises the isError && subscription-present branch, not just a
    // still-loading/never-refetched one).
    await waitFor(() => {
      expect(queryClient.getQueryState(['billing', 'subscription'])?.status).toBe('error');
    });
  });

  it('renders the genuinely-empty "no active subscription" UI when the fetch succeeds with the empty-state shape', async () => {
    routeGet((url) => {
      if (url === '/subscriptions/current') {
        return emptySubscriptionResponse;
      }
      return { history: [] };
    });

    renderPage(makeQueryClient());

    await waitFor(() => {
      expect(screen.getByText('No active subscription found.')).toBeInTheDocument();
    });

    // Must NOT show the error/retry UI — this is a successful 200 response,
    // not a fetch failure.
    expect(screen.queryByText('We could not load your subscription. Please try again.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'View Plans' })).toBeInTheDocument();
  });
});
