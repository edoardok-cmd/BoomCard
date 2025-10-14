import { test, expect } from '@playwright/test';

test.describe('App Verification', () => {
  test('homepage loads successfully', async ({ page }) => {
    // Navigate to homepage
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

    // Check page loads without errors
    await expect(page).toHaveTitle(/BoomCard/i);

    // Take screenshot for visual verification
    await page.screenshot({ path: 'test-results/homepage-verification.png', fullPage: true });

    console.log('Homepage loaded successfully at http://localhost:5173/');
  });

  test('can access integrations page', async ({ page }) => {
    await page.goto('http://localhost:5173/integrations', { waitUntil: 'networkidle' });

    // Should see integrations content
    await expect(page.locator('h1, h2')).toContainText(/integration/i);

    console.log('Integrations page loaded successfully');
  });
});
