import { defineConfig, devices } from '@playwright/test';

/**
 * BC-UX-E2E-REAUDIT — config for the four ux-*-sweep class sweeps only.
 * Run: npm run test:ux-sweeps      (BASE_URL env overrides the target, default
 * is the local Vite dev server on :5273 which proxies /api to the backend).
 *
 * retries stays 0 on purpose: a flaky sweep is a bug to fix, not to retry-wrap.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /ux-(blank-page|autocomplete|locale-parity|locale-render)-sweep\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : 6,
  timeout: 60_000,
  reporter: [['list'], ['json', { outputFile: 'test-results/ux-sweeps.json' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5273',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
