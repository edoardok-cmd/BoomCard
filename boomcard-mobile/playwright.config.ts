import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,  // cashback caps + rate limits are shared across tests — keep serial
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:19006',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
    permissions: ['geolocation'],
    geolocation: { latitude: 42.6977, longitude: 23.3219 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Device permissions set above; viewport kept default desktop.
      },
    },
  ],
});
