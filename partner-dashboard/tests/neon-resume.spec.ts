import { test, expect } from '@playwright/test';

test('Resume Neon compute - interactive', async ({ page }) => {
  // Navigate to Neon console
  await page.goto('https://console.neon.tech/app/projects');

  // Pause here - you can login and navigate
  // Click the "Continue" button in Playwright Inspector when ready
  await page.pause();

  // After you continue, navigate to the project
  await page.click('text=boomcard');

  // Wait for project page to load
  await page.waitForLoadState('networkidle');

  // Take screenshot of current state
  await page.screenshot({ path: 'neon-project-state.png', fullPage: true });

  // Try to find and click on compute section
  await page.click('text=Computes');

  // Wait a bit
  await page.waitForTimeout(2000);

  // Take screenshot
  await page.screenshot({ path: 'neon-computes.png', fullPage: true });

  // Pause again to let you verify and guide next steps
  await page.pause();
});
