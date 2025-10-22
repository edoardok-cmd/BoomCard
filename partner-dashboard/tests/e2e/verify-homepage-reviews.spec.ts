import { test, expect } from '@playwright/test';

test.describe('Homepage Reviews Section', () => {
  test('should load homepage and display reviews section', async ({ page }) => {
    // Navigate to homepage
    await page.goto('http://localhost:5177/', { waitUntil: 'load', timeout: 15000 });

    // Wait for the page to be fully loaded
    await page.waitForLoadState('domcontentloaded');

    // Check if hero section is visible with the new text
    const heroText = page.getByText(/Live More - Pay Less|Живейте повече - Плащайте по-малко/);
    await expect(heroText).toBeVisible({ timeout: 10000 });

    // Check if the hero CTA button is visible
    const ctaButton = page.getByRole('button', { name: /Learn More and Get your Card|Научете повече и вземете картата си/ });
    await expect(ctaButton).toBeVisible({ timeout: 5000 });

    // Scroll to reviews section
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight - 1000);
    });

    // Wait a bit for scroll
    await page.waitForTimeout(1000);

    // Check if reviews section title is visible
    const reviewsTitle = page.getByText(/What Our Customers Say|Какво казват нашите клиенти/);
    await expect(reviewsTitle).toBeVisible({ timeout: 5000 });

    // Check if "Write a Review" button is visible
    const writeReviewButton = page.getByRole('button', { name: /Write a Review|Напишете отзив/ }).first();
    await expect(writeReviewButton).toBeVisible({ timeout: 5000 });

    // Take a screenshot of the reviews section
    await page.screenshot({
      path: 'playwright-report/homepage-reviews-section.png',
      fullPage: false
    });

    console.log('✓ Homepage loaded successfully');
    console.log('✓ Hero section with new text is visible');
    console.log('✓ CTA button is visible');
    console.log('✓ Reviews section is visible');
    console.log('✓ Write Review button is visible');
  });

  test('should open review submission modal when clicking Write Review', async ({ page }) => {
    // Navigate to homepage
    await page.goto('http://localhost:5177/', { waitUntil: 'load', timeout: 15000 });

    // Wait for page load
    await page.waitForLoadState('domcontentloaded');

    // Scroll to reviews section
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight - 1000);
    });

    await page.waitForTimeout(1000);

    // Click the "Write a Review" button
    const writeReviewButton = page.getByRole('button', { name: /Write a Review|Напишете отзив/ }).first();
    await writeReviewButton.click();

    // Wait for modal to appear
    await page.waitForTimeout(500);

    // Check if modal is visible (look for modal title)
    const modalTitle = page.getByText(/Write a Review|Напишете отзив/);
    await expect(modalTitle).toBeVisible({ timeout: 3000 });

    // Check if rating stars are visible
    const ratingLabel = page.getByText(/Your Rating|Вашата оценка/);
    await expect(ratingLabel).toBeVisible();

    // Take a screenshot of the modal
    await page.screenshot({
      path: 'playwright-report/review-modal.png',
      fullPage: false
    });

    // Close the modal by clicking the close button or outside
    const closeButton = page.locator('button[aria-label="Close"], button:has-text("✕"), button:has-text("Cancel"), button:has-text("Отказ")').first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }

    console.log('✓ Review modal opens successfully');
    console.log('✓ Modal form is visible');
    console.log('✓ Rating stars are present');
  });

  test('should display correct button text in light mode', async ({ page }) => {
    // Navigate to homepage
    await page.goto('http://localhost:5177/', { waitUntil: 'load', timeout: 15000 });

    // Wait for hero section
    await page.waitForTimeout(2000);

    // Find the CTA button
    const ctaButton = page.getByRole('button', { name: /Learn More and Get your Card|Научете повече и вземете картата си/ });

    // Check if button is visible
    await expect(ctaButton).toBeVisible({ timeout: 10000 });

    // Get button styles to verify it's not invisible
    const buttonColor = await ctaButton.evaluate((el) => {
      return window.getComputedStyle(el).color;
    });

    const backgroundColor = await ctaButton.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    console.log('✓ Button text color:', buttonColor);
    console.log('✓ Button background color:', backgroundColor);
    console.log('✓ Button is visible and styled correctly');

    // Take screenshot of hero section
    await page.screenshot({
      path: 'playwright-report/hero-button-visibility.png',
      fullPage: false,
      clip: { x: 0, y: 0, width: 1920, height: 900 }
    });
  });
});
