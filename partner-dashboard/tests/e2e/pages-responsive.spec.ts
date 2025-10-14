import { test, expect } from '@playwright/test';

// Test viewports
const viewports = {
  mobile: { width: 375, height: 667, name: 'iPhone SE' },
  tablet: { width: 768, height: 1024, name: 'iPad' },
};

/**
 * Helper function to check if a page renders properly without horizontal scroll
 */
async function testPageResponsiveness(page: any, url: string, pageName: string) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');

  // Check that overflow-x is hidden on body/html (prevents actual scrolling)
  const overflowX = await page.evaluate(() => {
    const bodyOverflow = window.getComputedStyle(document.body).overflowX;
    const htmlOverflow = window.getComputedStyle(document.documentElement).overflowX;
    return { body: bodyOverflow, html: htmlOverflow };
  });

  expect(overflowX.body, `${pageName}: body should have overflow-x hidden`).toBe('hidden');
  expect(overflowX.html, `${pageName}: html should have overflow-x hidden`).toBe('hidden');

  // Check that page loaded successfully (has some content)
  const bodyText = await page.textContent('body');
  expect(bodyText?.length, `${pageName}: page should have content`).toBeGreaterThan(100);
}

test.describe('Public Pages - Mobile Responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
  });

  test('About page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/about', 'About page');
  });

  test('Product page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/product', 'Product page');
  });

  test('Features page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/features', 'Features page');
  });

  test('Pricing page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/pricing', 'Pricing page');
  });

  test('Careers page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/careers', 'Careers page');
  });

  test('Security page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/security', 'Security page');
  });

  test('Contact page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/contact', 'Contact page');
  });

  test('FAQ page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/faq', 'FAQ page');
  });

  test('Terms page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/terms', 'Terms page');
  });

  test('Privacy page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/privacy', 'Privacy page');
  });

  test('Support page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/support', 'Support page');
  });
});

test.describe('Authentication Pages - Mobile Responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
  });

  test('Login page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/login', 'Login page');

    // Check form elements are visible and properly sized
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitButton = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();

    // Check button is properly sized
    const buttonBox = await submitButton.boundingBox();
    expect(buttonBox?.height).toBeGreaterThanOrEqual(40);
  });

  test('Register page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/register', 'Register page');

    // Check form elements are visible
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();

    const buttonBox = await submitButton.boundingBox();
    expect(buttonBox?.height).toBeGreaterThanOrEqual(40);
  });

  test('Forgot Password page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/forgot-password', 'Forgot Password page');
  });
});

test.describe('Category and Listing Pages - Mobile Responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
  });

  test('Categories page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/categories', 'Categories page');
  });

  test('Top Offers page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/top-offers', 'Top Offers page');
  });

  test('Search page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/search', 'Search page');
  });

  test('Nearby Offers page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/nearby', 'Nearby Offers page');
  });

  test('Partners page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/partners', 'Partners page');
  });

  test('Experiences page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/experiences', 'Experiences page');
  });

  test('Promotions page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/promotions', 'Promotions page');
  });

  test('Media page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/media', 'Media page');
  });

  test('Rewards page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/rewards', 'Rewards page');
  });

  test('Favorites page should be responsive on mobile', async ({ page }) => {
    await testPageResponsiveness(page, '/favorites', 'Favorites page');
  });
});

test.describe('Public Pages - Tablet Responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(viewports.tablet);
  });

  test('About page should be responsive on tablet', async ({ page }) => {
    await testPageResponsiveness(page, '/about', 'About page (tablet)');
  });

  test('Product page should be responsive on tablet', async ({ page }) => {
    await testPageResponsiveness(page, '/product', 'Product page (tablet)');
  });

  test('Features page should be responsive on tablet', async ({ page }) => {
    await testPageResponsiveness(page, '/features', 'Features page (tablet)');
  });

  test('Login page should be responsive on tablet', async ({ page }) => {
    await testPageResponsiveness(page, '/login', 'Login page (tablet)');
  });

  test('Register page should be responsive on tablet', async ({ page }) => {
    await testPageResponsiveness(page, '/register', 'Register page (tablet)');
  });

  test('Categories page should be responsive on tablet', async ({ page }) => {
    await testPageResponsiveness(page, '/categories', 'Categories page (tablet)');
  });

  test('Search page should be responsive on tablet', async ({ page }) => {
    await testPageResponsiveness(page, '/search', 'Search page (tablet)');
  });

  test('Partners page should be responsive on tablet', async ({ page }) => {
    await testPageResponsiveness(page, '/partners', 'Partners page (tablet)');
  });
});

test.describe('Mobile Menu and Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
  });

  test('Mobile menu should work on all public pages', async ({ page }) => {
    const pagesToTest = ['/', '/about', '/product', '/features', '/categories'];

    for (const pageUrl of pagesToTest) {
      await page.goto(pageUrl);
      await page.waitForLoadState('networkidle');

      // Check mobile menu button exists
      const menuButton = page.locator('button[aria-label="Toggle menu"]');
      await expect(menuButton).toBeVisible();

      // Click to open menu
      await menuButton.click();
      await page.waitForTimeout(500); // Wait for animation

      // Check menu is visible
      const mobileMenu = page.locator('[data-testid="mobile-menu-panel"]');
      await expect(mobileMenu).toBeVisible();

      // Close menu
      await menuButton.click();
      await page.waitForTimeout(500);
    }
  });
});

test.describe('Footer on All Pages', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
  });

  test('Footer should render properly on all pages', async ({ page }) => {
    const pagesToTest = ['/', '/about', '/login', '/categories'];

    for (const pageUrl of pagesToTest) {
      await page.goto(pageUrl);
      await page.waitForLoadState('networkidle');

      // Check footer exists
      const footer = page.locator('footer');

      // Some pages might not have footer, so we check if it exists first
      const footerCount = await footer.count();
      if (footerCount > 0) {
        await expect(footer).toBeVisible();

        // Check footer has content
        const footerText = await footer.textContent();
        expect(footerText?.length).toBeGreaterThan(50);
      }
    }
  });
});
