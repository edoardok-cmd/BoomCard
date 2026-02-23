/**
 * BoomCard API Load Test Suite (k6)
 *
 * Install: brew install k6  (or: https://k6.io/docs/get-started/installation/)
 *
 * Usage:
 *   k6 run backend-api/tests/load/k6-load-test.js                          # default (staging)
 *   k6 run -e BASE_URL=http://localhost:3001 backend-api/tests/load/k6-load-test.js  # local
 *   k6 run -e BASE_URL=https://boomcard-api.onrender.com backend-api/tests/load/k6-load-test.js  # production
 *
 * Scenarios:
 *   1. smoke     – 1 VU for 30s (sanity check)
 *   2. load      – ramp to 50 VUs over 5 min
 *   3. stress    – ramp to 150 VUs over 10 min
 *   4. spike     – sudden 200 VU burst
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const healthLatency = new Trend('health_latency');
const authLatency = new Trend('auth_latency');
const venueLatency = new Trend('venue_latency');
const planLatency = new Trend('plan_latency');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export const options = {
  scenarios: {
    // Scenario 1: Smoke test — basic sanity
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      tags: { scenario: 'smoke' },
    },

    // Scenario 2: Normal load — typical traffic
    load: {
      executor: 'ramping-vus',
      startTime: '35s',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 20 },   // ramp up
        { duration: '3m', target: 50 },   // steady state
        { duration: '1m', target: 0 },    // ramp down
      ],
      tags: { scenario: 'load' },
    },

    // Scenario 3: Stress test — find breaking point
    stress: {
      executor: 'ramping-vus',
      startTime: '6m',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '3m', target: 100 },
        { duration: '3m', target: 150 },
        { duration: '2m', target: 0 },
      ],
      tags: { scenario: 'stress' },
    },

    // Scenario 4: Spike — sudden burst
    spike: {
      executor: 'ramping-vus',
      startTime: '17m',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 200 },  // instant spike
        { duration: '1m', target: 200 },   // hold
        { duration: '10s', target: 0 },    // drop
      ],
      tags: { scenario: 'spike' },
    },
  },

  thresholds: {
    // Global thresholds
    http_req_duration: ['p(95)<500', 'p(99)<1500'],  // 95th < 500ms, 99th < 1.5s
    http_req_failed: ['rate<0.25'],                   // <25% (includes expected 401/404 responses)
    errors: ['rate<0.1'],                              // custom error metric (real errors only)

    // Per-endpoint thresholds
    health_latency: ['p(95)<200'],    // health check < 200ms
    plan_latency: ['p(95)<800'],      // plans listing < 800ms
    venue_latency: ['p(95)<1000'],    // venue listing < 1s
  },
};

// ── Test Functions ──────────────────────────────────────────

function testHealthEndpoints() {
  group('Health Checks', () => {
    // Basic health
    const health = http.get(`${BASE_URL}/health`);
    healthLatency.add(health.timings.duration);
    check(health, {
      'health: status 200': (r) => r.status === 200,
      'health: status ok': (r) => JSON.parse(r.body).status === 'ok',
    }) || errorRate.add(1);

    // Readiness
    const ready = http.get(`${BASE_URL}/ready`);
    check(ready, {
      'ready: status 200': (r) => r.status === 200,
      'ready: database connected': (r) => JSON.parse(r.body).database === 'connected',
    }) || errorRate.add(1);

    // Detailed health
    const detailed = http.get(`${BASE_URL}/api/health/detailed`);
    check(detailed, {
      'detailed: status 200': (r) => r.status === 200,
      'detailed: db ok': (r) => JSON.parse(r.body).checks.database.status === 'ok',
    }) || errorRate.add(1);

    // Metrics
    const metrics = http.get(`${BASE_URL}/api/health/metrics`);
    check(metrics, {
      'metrics: status 200': (r) => r.status === 200,
      'metrics: has memory info': (r) => JSON.parse(r.body).memory !== undefined,
    }) || errorRate.add(1);

    // Ping
    const ping = http.get(`${BASE_URL}/api/health/ping`);
    check(ping, {
      'ping: status 200': (r) => r.status === 200,
      'ping: returns pong': (r) => r.body === 'pong',
    }) || errorRate.add(1);
  });
}

function testPublicEndpoints() {
  group('Public API', () => {
    // Plans (public, no auth)
    const plans = http.get(`${BASE_URL}/api/plans`);
    planLatency.add(plans.timings.duration);
    check(plans, {
      'plans: status 200': (r) => r.status === 200,
      'plans: returns data array': (r) => {
        const body = JSON.parse(r.body);
        return body.success === true && Array.isArray(body.data);
      },
    }) || errorRate.add(1);

    // Venues listing (public)
    const venues = http.get(`${BASE_URL}/api/venues`);
    venueLatency.add(venues.timings.duration);
    check(venues, {
      'venues: status 2xx': (r) => r.status >= 200 && r.status < 300,
    }) || errorRate.add(1);
  });
}

function testAuthEndpoints() {
  group('Authentication', () => {
    // Login with invalid credentials (should return 401, not 500)
    const login = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({
        email: `loadtest-${__VU}-${__ITER}@test.invalid`,
        password: 'wrongpassword123',
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    authLatency.add(login.timings.duration);
    check(login, {
      'auth: rejects invalid creds (not 500)': (r) => r.status !== 500,
      'auth: returns 401 or 400': (r) => r.status === 401 || r.status === 400,
    }) || errorRate.add(1);
  });
}

function testRateLimiting() {
  group('Rate Limiting', () => {
    // Rapid-fire requests to trigger rate limiter
    const responses = [];
    for (let i = 0; i < 5; i++) {
      responses.push(http.get(`${BASE_URL}/api/health/ping`));
    }
    // At least some should succeed
    const successCount = responses.filter((r) => r.status === 200).length;
    check(null, {
      'rate-limit: at least some succeed': () => successCount >= 1,
    }) || errorRate.add(1);
  });
}

function test404Handler() {
  group('Error Handling', () => {
    const notFound = http.get(`${BASE_URL}/api/nonexistent-route-${Date.now()}`);
    check(notFound, {
      '404: returns 404': (r) => r.status === 404,
      '404: returns JSON': (r) => {
        try { JSON.parse(r.body); return true; } catch { return false; }
      },
    }) || errorRate.add(1);
  });
}

// ── Main Test Runner ────────────────────────────────────────

export default function () {
  testHealthEndpoints();
  sleep(0.5);

  testPublicEndpoints();
  sleep(0.5);

  testAuthEndpoints();
  sleep(0.5);

  test404Handler();
  sleep(0.3);

  // Only run rate limit test occasionally (10% of iterations)
  if (Math.random() < 0.1) {
    testRateLimiting();
  }

  sleep(1);
}

// ── Lifecycle Hooks ─────────────────────────────────────────

export function setup() {
  // Verify target is reachable
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`Target ${BASE_URL} is not reachable (status: ${res.status})`);
  }
  console.log(`Load test targeting: ${BASE_URL}`);
  console.log(`Health check OK: ${JSON.parse(res.body).status}`);
  return { baseUrl: BASE_URL };
}

export function teardown(data) {
  console.log(`Load test completed against: ${data.baseUrl}`);
}
