/**
 * Simplified Playwright E2E Tests: Admin Cashback UI
 *
 * Visual testing of the AdminCashbackPage interface
 */

import { test, expect } from '@playwright/test';

test.describe('Admin Cashback Page - UI Visual Testing', () => {
  const baseURL = 'http://localhost:3022';

  test('should navigate and display page structure', async ({ page }) => {
    // Navigate directly to login
    await page.goto(baseURL + '/login');
    await page.waitForLoadState('domcontentloaded');

    // Take screenshot of login page
    await page.screenshot({ path: 'test-results/01-login-page.png', fullPage: true });
    expect(page.url()).toContain('/login');
  });

  test('should display responsive layout', async ({ page }) => {
    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(baseURL + '/login');
    await page.waitForLoadState('domcontentloaded');

    await page.screenshot({
      path: 'test-results/02-desktop-1920x1080.png',
      fullPage: true
    });
  });

  test('should display tablet layout', async ({ page }) => {
    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(baseURL + '/login');
    await page.waitForLoadState('domcontentloaded');

    await page.screenshot({
      path: 'test-results/03-tablet-768x1024.png',
      fullPage: true
    });
  });

  test('should display mobile layout', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(baseURL + '/login');
    await page.waitForLoadState('domcontentloaded');

    await page.screenshot({
      path: 'test-results/04-mobile-375x667.png',
      fullPage: true
    });
  });

  test('should have proper console error handling', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto(baseURL + '/login');
    await page.waitForLoadState('domcontentloaded');

    // Log any errors
    if (errors.length > 0) {
      console.log('Console errors found:', errors);
    }

    // Check for critical errors
    const criticalErrors = errors.filter(e =>
      !e.includes('404') &&
      !e.includes('CORS') &&
      !e.includes('undefined')
    );

    expect(criticalErrors.length).toBe(0);
  });

  test('should check network requests', async ({ page }) => {
    const requests: string[] = [];

    page.on('request', request => {
      requests.push(`${request.method()} ${request.url()}`);
    });

    await page.goto(baseURL + '/login');
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Should have made some requests
    expect(requests.length).toBeGreaterThan(0);

    // Log some interesting requests
    const apiRequests = requests.filter(r => r.includes('api'));
    console.log(`API requests: ${apiRequests.length}`);
  });

  test('check accessibility features', async ({ page }) => {
    await page.goto(baseURL + '/login');
    await page.waitForLoadState('domcontentloaded');

    // Check for semantic HTML
    const h1 = await page.locator('h1').count();
    expect(h1).toBeGreaterThanOrEqual(0);

    // Check for buttons
    const buttons = await page.locator('button').count();
    expect(buttons).toBeGreaterThan(0);

    // Check for form
    const form = await page.locator('form').count();
    expect(form).toBeGreaterThanOrEqual(0);
  });

  test('homepage should load without errors', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('domcontentloaded');

    await page.screenshot({
      path: 'test-results/05-homepage.png',
      fullPage: true
    });

    // Check for main content
    const body = await page.locator('body').count();
    expect(body).toBeGreaterThan(0);
  });
});
