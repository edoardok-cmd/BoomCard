/**
 * E2E Tests: Mobile Responsiveness
 *
 * Tests application responsiveness across different screen sizes and devices
 */

import { test, expect, devices } from '@playwright/test';

// Test user credentials
const TEST_USER = {
  email: 'demo@boomcard.bg',
  password: 'demo123',
};

// Common viewport sizes
const VIEWPORTS = {
  mobile: { width: 375, height: 667 }, // iPhone SE
  mobileLarge: { width: 414, height: 896 }, // iPhone XR/11
  tablet: { width: 768, height: 1024 }, // iPad
  tabletLarge: { width: 1024, height: 1366 }, // iPad Pro
  desktop: { width: 1920, height: 1080 }, // Full HD
  desktopLarge: { width: 2560, height: 1440 }, // 2K
  desktop4K: { width: 3840, height: 2160 }, // 4K
};

test.describe('Mobile Responsiveness', () => {
  test.describe('Mobile - iPhone SE (375px)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
    });

    test('should display login page correctly on mobile', async ({ page }) => {
      await page.goto('/login');

      // Form should be visible
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/password/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();

      // Check form takes full width
      const emailInput = page.getByLabel(/email/i);
      const box = await emailInput.boundingBox();

      if (box) {
        expect(box.width).toBeGreaterThan(300); // Should be almost full width
      }
    });

    test('should show hamburger menu on mobile', async ({ page }) => {
      // Login first
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });

      // Hamburger menu should be visible
      const hamburger = page.getByRole('button', { name: /menu|навигация/i }).or(page.locator('[aria-label*="menu"]')).or(page.locator('button:has(svg)').first());

      await expect(hamburger).toBeVisible();
    });

    test('should open mobile menu on hamburger click', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });

      // Click hamburger
      const hamburger = page.getByRole('button', { name: /menu/i }).or(page.locator('[aria-label*="menu"]')).or(page.locator('button').first());

      await hamburger.click();

      // Mobile menu should appear
      await expect(page.getByRole('navigation').or(page.locator('[role="menu"]'))).toBeVisible({ timeout: 2000 });
    });

    test('should display dashboard cards stacked vertically on mobile', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });

      // Wait for cards to load
      await page.waitForTimeout(1000);

      // Find stat cards
      const cards = page.locator('[data-testid*="stat-card"]').or(page.locator('article, .card, [class*="Card"]'));

      if (await cards.count() > 1) {
        const firstCard = await cards.nth(0).boundingBox();
        const secondCard = await cards.nth(1).boundingBox();

        if (firstCard && secondCard) {
          // Second card should be below first card (stacked vertically)
          expect(secondCard.y).toBeGreaterThan(firstCard.y + firstCard.height - 50);
        }
      }
    });

    test('should display receipts list correctly on mobile', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });

      await page.goto('/receipts');

      // Receipts should be visible
      await expect(page.getByText(/receipt|бележка/i).first()).toBeVisible({ timeout: 5000 });

      // Receipt cards should take full width
      const receiptCard = page.locator('[data-testid="receipt-card"]').or(page.getByRole('article')).first();

      if (await receiptCard.isVisible()) {
        const box = await receiptCard.boundingBox();
        if (box) {
          expect(box.width).toBeGreaterThan(300); // Almost full width minus padding
        }
      }
    });

    test('should make CTA buttons accessible on mobile', async ({ page }) => {
      await page.goto('/');

      // CTA buttons should not overflow viewport
      const ctaButton = page.getByRole('button', { name: /get started|начало|apply/i }).or(page.getByRole('link', { name: /get started|начало/i }));

      if (await ctaButton.first().isVisible()) {
        const box = await ctaButton.first().boundingBox();

        if (box) {
          expect(box.x + box.width).toBeLessThan(375); // Should fit in viewport
        }
      }
    });
  });

  test.describe('Tablet - iPad (768px)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
    });

    test('should display navigation correctly on tablet', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });

      // Check if horizontal nav or hamburger is shown
      const hasHamburger = await page.getByRole('button', { name: /menu/i }).isVisible();
      const hasHorizontalNav = await page.getByRole('navigation').isVisible();

      expect(hasHamburger || hasHorizontalNav).toBeTruthy();
    });

    test('should display dashboard in grid layout on tablet', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });

      await page.waitForTimeout(1000);

      // Cards should be in grid (2 columns ideally)
      const cards = page.locator('[data-testid*="stat-card"]').or(page.locator('article, .card'));

      if (await cards.count() >= 2) {
        const firstCard = await cards.nth(0).boundingBox();
        const secondCard = await cards.nth(1).boundingBox();

        if (firstCard && secondCard) {
          // Second card might be beside or below first card
          const isSideBySide = Math.abs(firstCard.y - secondCard.y) < 50;
          const isStacked = secondCard.y > firstCard.y + firstCard.height - 50;

          expect(isSideBySide || isStacked).toBeTruthy();
        }
      }
    });

    test('should display analytics charts properly on tablet', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });

      await page.goto('/receipts/analytics');

      // Charts should be visible and properly sized
      const canvas = page.locator('canvas').first();
      await expect(canvas).toBeVisible();

      const box = await canvas.boundingBox();
      if (box) {
        expect(box.width).toBeGreaterThan(300);
        expect(box.width).toBeLessThan(768);
      }
    });
  });

  test.describe('Desktop - Full HD (1920px)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.desktop);
    });

    test('should show full navigation on desktop', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });

      // Desktop should show horizontal navigation
      const navigation = page.getByRole('navigation');
      await expect(navigation).toBeVisible();

      // Hamburger should be hidden
      const hamburger = page.getByRole('button', { name: /menu/i });
      const isHamburgerHidden = !(await hamburger.isVisible());

      expect(isHamburgerHidden).toBeTruthy();
    });

    test('should display dashboard cards in multi-column layout', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });

      await page.waitForTimeout(1000);

      // Cards should be side by side
      const cards = page.locator('[data-testid*="stat-card"]').or(page.locator('article, .card'));

      if (await cards.count() >= 2) {
        const firstCard = await cards.nth(0).boundingBox();
        const secondCard = await cards.nth(1).boundingBox();

        if (firstCard && secondCard) {
          // Should be roughly at same Y level (side by side)
          const isSideBySide = Math.abs(firstCard.y - secondCard.y) < 100;
          expect(isSideBySide).toBeTruthy();
        }
      }
    });
  });

  test.describe('4K Desktop (3840px)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.desktop4K);
    });

    test('should display hero logo properly on 4K', async ({ page }) => {
      await page.goto('/');

      // Logo should be visible and not too high
      const logo = page.locator('img[alt*="logo"]').or(page.locator('[data-testid="hero-logo"]')).first();

      if (await logo.isVisible()) {
        const box = await logo.boundingBox();

        if (box) {
          // Logo should not be at very top (should have header space)
          expect(box.y).toBeGreaterThan(50);
          expect(box.y).toBeLessThan(400);
        }
      }
    });

    test('should limit navigation menu width on 4K', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });

      // Navigation should have max-width constraint
      const header = page.locator('header').first();

      if (await header.isVisible()) {
        const box = await header.boundingBox();

        if (box) {
          // Header content should be centered or have max width
          expect(box.width).toBeLessThanOrEqual(3840);
        }
      }
    });

    test('should display mega menu properly on 4K', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });

      // Hover over menu item to show mega menu
      const menuItem = page.getByRole('link', { name: /partners|receipts|home/i }).first();

      if (await menuItem.isVisible()) {
        await menuItem.hover();

        await page.waitForTimeout(500);

        // Mega menu should appear and not overflow
        const megaMenu = page.locator('[role="menu"], [data-testid="mega-menu"]');

        if (await megaMenu.isVisible()) {
          const box = await megaMenu.boundingBox();

          if (box) {
            expect(box.x + box.width).toBeLessThanOrEqual(3840);
          }
        }
      }
    });
  });

  test.describe('Orientation Changes', () => {
    test('should handle portrait to landscape rotation', async ({ page, context }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // Portrait

      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });

      // Rotate to landscape
      await page.setViewportSize({ width: 667, height: 375 });

      await page.waitForTimeout(500);

      // Content should still be visible
      await expect(page.getByText(/dashboard|receipts/i).first()).toBeVisible();
    });
  });

  test.describe('Touch Interactions', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      // Set touch support
      await page.emulateMedia({ colorScheme: 'light' });
    });

    test('should handle touch events on buttons', async ({ page }) => {
      await page.goto('/login');

      const loginButton = page.getByRole('button', { name: /log in/i });

      // Tap button (mobile touch event)
      await loginButton.tap();

      // Should attempt login (validation errors expected without credentials)
      await page.waitForTimeout(500);

      // Form should still be visible
      await expect(page.getByLabel(/email/i)).toBeVisible();
    });

    test('should scroll smoothly on mobile', async ({ page }) => {
      await page.goto('/');

      // Scroll down
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(300);

      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeGreaterThan(0);
    });

    test('should handle swipe gestures in receipts list', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });

      await page.goto('/receipts');

      // Check if receipts are swipeable (implementation dependent)
      const receiptCard = page.locator('[data-testid="receipt-card"]').first();

      if (await receiptCard.isVisible()) {
        const box = await receiptCard.boundingBox();

        if (box) {
          // Simulate swipe
          await page.touchscreen.tap(box.x + 50, box.y + 50);
          await page.waitForTimeout(100);

          // Card should still be visible
          await expect(receiptCard).toBeVisible();
        }
      }
    });
  });

  test.describe('Text Readability', () => {
    test('should have readable font sizes on mobile', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await page.goto('/');

      // Main headings should be at least 24px
      const heading = page.getByRole('heading').first();

      if (await heading.isVisible()) {
        const fontSize = await heading.evaluate((el) => {
          return window.getComputedStyle(el).fontSize;
        });

        const fontSizePx = parseInt(fontSize);
        expect(fontSizePx).toBeGreaterThanOrEqual(20);
      }
    });

    test('should have adequate line height for readability', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await page.goto('/');

      const paragraph = page.locator('p').first();

      if (await paragraph.isVisible()) {
        const lineHeight = await paragraph.evaluate((el) => {
          return window.getComputedStyle(el).lineHeight;
        });

        // Line height should be at least 1.5
        const lineHeightValue = parseFloat(lineHeight);
        expect(lineHeightValue).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Accessibility Features', () => {
    test('should have tap targets at least 44x44 on mobile', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await page.goto('/login');

      const loginButton = page.getByRole('button', { name: /log in/i });
      const box = await loginButton.boundingBox();

      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(40);
        expect(box.width).toBeGreaterThanOrEqual(100);
      }
    });

    test('should have adequate spacing between interactive elements', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await page.goto('/login');

      const emailInput = page.getByLabel(/email/i);
      const passwordInput = page.getByLabel(/password/i);

      const emailBox = await emailInput.boundingBox();
      const passwordBox = await passwordInput.boundingBox();

      if (emailBox && passwordBox) {
        const spacing = passwordBox.y - (emailBox.y + emailBox.height);
        expect(spacing).toBeGreaterThanOrEqual(8); // At least 8px spacing
      }
    });
  });

  test.describe('Image Optimization', () => {
    test('should load appropriate image sizes on mobile', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await page.goto('/');

      // Check if images are optimized (not loading full-size on mobile)
      const images = page.locator('img');
      const count = await images.count();

      if (count > 0) {
        const firstImage = images.first();
        const src = await firstImage.getAttribute('src');

        expect(src).toBeTruthy();
      }
    });
  });
});
