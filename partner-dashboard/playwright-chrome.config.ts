import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  timeout: 600000, // 10 minutes
  use: {
    baseURL: 'http://localhost:3015',
    trace: 'on-first-retry',
    channel: 'chrome', // Use installed Chrome, not Chromium
  },

  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome', // Force Chrome
      },
    },
  ],
});
