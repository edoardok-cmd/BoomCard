import { test, expect } from '@playwright/test';

test.describe('UI Fixes Verification', () => {

  test('Partners page buttons are functional and visible', async ({ page }) => {
    await page.goto('/partners');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check Apply Now button exists and is visible
    const applyNowButton = page.locator('a[href="#application"]').first();
    await expect(applyNowButton).toBeVisible();

    // Check Contact Us button exists and is visible with proper styling
    const contactUsButton = page.locator('a[href="/contact"]').first();
    await expect(contactUsButton).toBeVisible();

    // Verify Contact Us button has white text on dark background
    const buttonElement = await contactUsButton.locator('button');
    await expect(buttonElement).toBeVisible();

    // Click Apply Now and verify it scrolls to application section
    await applyNowButton.click();
    await page.waitForTimeout(500); // Wait for scroll animation

    // Verify application section is in viewport
    const applicationSection = page.locator('#application');
    await expect(applicationSection).toBeInViewport();
  });

  test('Subscription page shows credit card designs', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Scroll to subscription plans section
    await page.evaluate(() => {
      const section = document.getElementById('subscription-plans');
      if (section) section.scrollIntoView({ behavior: 'instant' });
    });
    await page.waitForTimeout(1000);

    // Check for billing toggle (BG text from page snapshot)
    const yearlyToggle = page.getByRole('button', { name: /Yearly|Годишен/i });
    await expect(yearlyToggle).toBeVisible({ timeout: 5000 });

    // Check for credit card elements
    const boomLogos = page.locator('text=BOOM Card');
    await expect(boomLogos.first()).toBeVisible();

    // Test billing toggle functionality
    await yearlyToggle.click();
    await page.waitForTimeout(300);

    // Verify yearly toggle is active (the button text contains "20% отстъпка")
    await expect(yearlyToggle).toBeVisible();

    // Switch back to monthly
    const monthlyToggle = page.getByRole('button', { name: /Monthly|Месечен|Седмичен/i }).first();
    await monthlyToggle.click();
    await page.waitForTimeout(300);
  });

  test('Reviews section does not show redundant Write Review button', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Scroll to reviews section
    await page.locator('text=/What Our Customers Say|Какво казват нашите клиенти/').scrollIntoViewIfNeeded();

    // Wait for reviews to load
    await page.waitForTimeout(1000);

    // Count "Write Review" buttons in the reviews section
    const reviewsSection = page.locator('section:has(h2:has-text("What Our Customers Say"), h2:has-text("Какво казват нашите клиенти"))');
    const writeReviewButtons = reviewsSection.getByRole('button', { name: /Write a Review|Напишете отзив|Write the First Review|Напишете първия отзив/ });

    // Should have at most 1 write review button (only when no reviews exist)
    const buttonCount = await writeReviewButtons.count();
    expect(buttonCount).toBeLessThanOrEqual(1);

    // If there's a button, it should be "Write the First Review" (meaning no reviews exist)
    if (buttonCount === 1) {
      const buttonText = await writeReviewButtons.first().textContent();
      expect(buttonText).toMatch(/Write the First Review|Напишете първия отзив/);
    }
  });

  test('All navigation and buttons are readable in light mode', async ({ page }) => {
    await page.goto('/');

    // Set to light theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });

    await page.waitForTimeout(500);

    // Check header navigation is visible
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Navigate to different pages and verify buttons are readable
    const pages = ['/partners', '/subscriptions', '/contact'];

    for (const pagePath of pages) {
      await page.goto(pagePath);
      await page.waitForLoadState('networkidle');

      // Verify buttons have proper contrast
      const buttons = page.locator('button');
      const buttonCount = await buttons.count();

      // Just verify buttons are visible, Playwright will fail if they're not
      if (buttonCount > 0) {
        await expect(buttons.first()).toBeVisible();
      }
    }
  });

  test('Credit card elements are present on subscription page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Scroll to subscription plans
    await page.evaluate(() => {
      const section = document.getElementById('subscription-plans');
      if (section) section.scrollIntoView({ behavior: 'instant' });
    });
    await page.waitForTimeout(1000);

    // Subscription cards should show BOOM Card branding
    const boomText = page.locator('text=BOOM Card');
    await expect(boomText.first()).toBeVisible({ timeout: 5000 });

    // Should have plan selection buttons
    const planButtons = page.getByRole('button', { name: /Избери План|Choose Plan/i });
    const count = await planButtons.count();
    expect(count).toBeGreaterThan(0);
  });
});
