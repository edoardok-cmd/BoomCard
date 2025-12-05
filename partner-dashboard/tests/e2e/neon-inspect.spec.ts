import { test } from '@playwright/test';

test('Inspect Neon database status', async ({ page }) => {
  console.log('🌐 Opening Neon console...');

  // Navigate to Neon console
  await page.goto('https://console.neon.tech/app/projects');

  console.log('📌 Browser opened. Please navigate to your BoomCard project.');
  console.log('👉 Click the "Resume" button in Playwright Inspector to continue after navigating...');

  // Pause - you can navigate and inspect
  await page.pause();

  // Take screenshot of current page after you resume
  await page.screenshot({ path: 'neon-current-state.png', fullPage: true });
  console.log('📸 Screenshot saved: neon-current-state.png');
});
