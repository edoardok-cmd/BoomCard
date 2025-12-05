import { test, expect } from '@playwright/test';

test.describe('Theme Contrast and Visibility Fixes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('hamburger menu should be visible in dark mode', async ({ page }) => {
    // Switch to dark theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Find the hamburger button
    const hamburgerButton = page.locator('button[aria-label="Toggle menu"]');
    await expect(hamburgerButton).toBeVisible();

    // Check that it has proper color (should use CSS variable)
    const color = await hamburgerButton.evaluate((el) => {
      return window.getComputedStyle(el).color;
    });

    // Color should be light in dark mode (not dark gray)
    console.log('Hamburger button color in dark mode:', color);

    // Verify it's not the old hardcoded gray color
    expect(color).not.toBe('rgb(55, 65, 81)'); // Not #374151
  });

  test('mobile menu content should be visible in dark mode', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // Switch to dark theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    // Open mobile menu
    const hamburgerButton = page.locator('button[aria-label="Toggle menu"]');
    await hamburgerButton.click();

    // Wait for menu panel
    const menuPanel = page.locator('[data-testid="mobile-menu-panel"]');
    await expect(menuPanel).toBeVisible();

    // Check language toggle button has proper background
    const languageButton = menuPanel.locator('button').first();
    const bgColor = await languageButton.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    console.log('Language button background in dark mode:', bgColor);

    // Should not be the old hardcoded gray-100
    expect(bgColor).not.toBe('rgb(243, 244, 246)'); // Not bg-gray-100
  });

  test('Most Popular badge should not be cut off', async ({ page }) => {
    // Scroll to subscription section
    await page.evaluate(() => {
      const section = Array.from(document.querySelectorAll('section')).find(
        (el) => el.textContent?.includes('Subscription Plans') || el.textContent?.includes('Абонаментни Планове')
      );
      if (section) section.scrollIntoView({ behavior: 'smooth' });
    });

    await page.waitForTimeout(1000);

    // Find the Most Popular badge
    const badge = page.locator('text=/Most Popular|Най-популярен/i').first();

    if (await badge.isVisible()) {
      const badgeBox = await badge.boundingBox();
      expect(badgeBox).not.toBeNull();

      // Badge should be fully visible (not cut off at top)
      expect(badgeBox!.y).toBeGreaterThanOrEqual(0);

      console.log('Most Popular badge position:', badgeBox);
    }
  });

  test('hero starts at top edge with header overlaying it', async ({ page }) => {
    // Get header bottom position
    const header = page.locator('header');
    const headerBox = await header.boundingBox();

    // Get hero section top position
    const hero = page.locator('div').first(); // HeroBlast container
    const heroBox = await hero.boundingBox();

    if (headerBox && heroBox) {
      const gap = heroBox.y - (headerBox.y + headerBox.height);
      console.log('Gap between header and hero:', gap);

      // For fixed header design, hero should start at top (0px) and header overlays it
      // Expected gap: heroTop (0px) - headerBottom (65px) = -65px
      // This negative value means hero is behind the fixed header (correct!)
      expect(heroBox.y).toBeLessThanOrEqual(5); // Hero starts at top
      expect(headerBox.height).toBeGreaterThanOrEqual(60); // Header has reasonable height
      expect(gap).toBeLessThanOrEqual(-60); // Negative gap confirms overlap
    }
  });

  test('CTA buttons should have good contrast in all themes', async ({ page }) => {
    const themes = ['light', 'dark', 'color'];

    for (const theme of themes) {
      console.log(`\nTesting ${theme} theme:`);

      await page.evaluate((t) => {
        document.documentElement.setAttribute('data-theme', t);
      }, theme);

      await page.waitForTimeout(500);

      // Scroll to CTA section
      await page.evaluate(() => {
        const cta = Array.from(document.querySelectorAll('section')).find(
          (el) => el.textContent?.includes('Browse Offers') || el.textContent?.includes('Разгледайте офертите')
        );
        if (cta) cta.scrollIntoView({ behavior: 'smooth' });
      });

      await page.waitForTimeout(1000);

      // Find outline buttons (Browse Offers, Become a Partner)
      const outlineButtons = page.locator('button[class*="outline"]');
      const count = await outlineButtons.count();

      console.log(`Found ${count} outline buttons in ${theme} theme`);

      if (count > 0) {
        const firstButton = outlineButtons.first();

        const styles = await firstButton.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return {
            color: computed.color,
            borderColor: computed.borderColor,
            backgroundColor: computed.backgroundColor
          };
        });

        console.log(`Button styles in ${theme}:`, styles);

        // Verify colors are not the default/problematic ones
        if (theme === 'dark') {
          // In dark theme, text should be light (not dark gray)
          expect(styles.color).not.toBe('rgb(55, 65, 81)');
        }
      }
    }
  });

  test('filter buttons should be visible in color theme', async ({ page }) => {
    // Navigate to integrations page
    await page.goto('/integrations');
    await page.waitForLoadState('networkidle');

    // Switch to color theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'color');
    });

    await page.waitForTimeout(500);

    // Find filter buttons
    const filterButtons = page.locator('button').filter({ hasText: /POS|Платежни|Резервационни/ });
    const count = await filterButtons.count();

    console.log(`Found ${count} filter buttons`);

    if (count > 0) {
      const firstButton = filterButtons.first();
      await expect(firstButton).toBeVisible();

      const styles = await firstButton.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          borderColor: computed.borderColor
        };
      });

      console.log('Filter button styles in color theme:', styles);

      // Color theme: white background with dark text is correct (good contrast)
      expect(styles.backgroundColor).toBe('rgb(255, 255, 255)');
      expect(styles.color).toBe('rgb(26, 10, 46)'); // Dark purple text
      expect(styles.borderColor).toBe('rgb(255, 148, 214)'); // Pink border
    }
  });

  test('subscription cards should have proper contrast in dark theme', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    // Scroll to subscription section
    await page.evaluate(() => {
      const section = Array.from(document.querySelectorAll('section')).find(
        (el) => el.textContent?.includes('Subscription Plans') || el.textContent?.includes('Абонаментни Планове')
      );
      if (section) section.scrollIntoView({ behavior: 'smooth' });
    });

    await page.waitForTimeout(1000);

    // Find subscription cards (looking for BOOM text)
    const cards = page.locator('text=BOOM');
    const count = await cards.count();

    console.log(`Found ${count} subscription cards`);

    if (count > 0) {
      // Check the first card's contrast
      const card = cards.first();
      const cardParent = card.locator('..');

      const styles = await cardParent.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          background: computed.background,
          color: computed.color
        };
      });

      console.log('Card styles in dark theme:', styles);

      // In dark theme, cards should have dark theme styling
      // Not the default light theme colors
    }
  });
});

test.describe('Mobile Menu Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should open and close mobile menu', async ({ page }) => {
    const hamburgerButton = page.locator('button[aria-label="Toggle menu"]');

    // Open menu
    await hamburgerButton.click();
    await page.waitForTimeout(500);

    const menuPanel = page.locator('[data-testid="mobile-menu-panel"]');
    await expect(menuPanel).toBeVisible();

    // Close menu
    await hamburgerButton.click();
    await page.waitForTimeout(500);

    await expect(menuPanel).not.toBeVisible();
  });

  test('mobile menu should have theme switcher buttons', async ({ page }) => {
    const hamburgerButton = page.locator('button[aria-label="Toggle menu"]');
    await hamburgerButton.click();

    const menuPanel = page.locator('[data-testid="mobile-menu-panel"]');
    await expect(menuPanel).toBeVisible();

    // Look for theme option buttons with emojis
    const lightTheme = menuPanel.locator('text=☀️');
    const darkTheme = menuPanel.locator('text=🌙');
    const colorTheme = menuPanel.locator('text=🎨');

    await expect(lightTheme).toBeVisible();
    await expect(darkTheme).toBeVisible();
    await expect(colorTheme).toBeVisible();
  });
});
