import { test, expect } from '@playwright/test';

test.describe('App Verification', () => {
  test('homepage loads successfully', async ({ page }) => {
    // Navigate to homepage
    await page.goto('/', { waitUntil: 'networkidle' });

    // Check page loads without errors
    await expect(page).toHaveTitle(/BoomCard/i);

    // Take screenshot for visual verification
    await page.screenshot({ path: 'test-results/homepage-verification.png', fullPage: true });

    console.log('Homepage loaded successfully at /');
  });

  test('can access integrations page', async ({ page }) => {
    await page.goto('/integrations', { waitUntil: 'networkidle' });

    // Should see integrations content (BG: Интеграции / EN: Integrations)
    await expect(page.locator('h1, h2').first()).toContainText(/integration|интеграции/i);

    console.log('Integrations page loaded successfully');
  });
});
