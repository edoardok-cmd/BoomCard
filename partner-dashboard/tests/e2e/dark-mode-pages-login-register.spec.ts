import { test, expect } from '@playwright/test';

test.describe('Dark Mode Page Styling', () => {
  test('Login page should have dark background in dark mode', async ({ page }) => {
    // Navigate to login page
    await page.goto('http://localhost:3021/login');

    // Set dark theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    // Wait for styles to apply
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500); // Additional wait for styles

    // Get the main page background color
    const bgColor = await page.evaluate(() => {
      const html = document.documentElement;
      const styles = window.getComputedStyle(html);
      let bgColor = styles.backgroundColor;

      if (bgColor === 'rgba(0, 0, 0, 0)') {
        const body = document.body;
        bgColor = window.getComputedStyle(body).backgroundColor;
      }

      if (bgColor === 'rgba(0, 0, 0, 0)') {
        const allDivs = document.querySelectorAll('div');
        for (let div of allDivs) {
          const divStyles = window.getComputedStyle(div);
          const divBg = divStyles.backgroundColor;
          if (divBg && divBg !== 'rgba(0, 0, 0, 0)' && divBg !== 'transparent') {
            return divBg;
          }
        }
      }
      return bgColor;
    });

    console.log('Login page PageWrapper background color (dark mode):', bgColor);

    // In dark mode, background should be dark (not white or light)
    expect(bgColor).not.toBe('rgb(255, 255, 255)'); // Not white
    expect(bgColor).not.toMatch(/rgb\(249/); // Not light gray (like #f9fafb)
    expect(bgColor).not.toMatch(/rgb\(245/); // Not light gray variations
  });

  test('Register Partner page should have dark background in dark mode', async ({ page }) => {
    // Navigate to register partner page
    await page.goto('http://localhost:3021/register/partner');

    // Set dark theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    // Wait for styles to apply
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Get the main page background color
    const bgColor = await page.evaluate(() => {
      const html = document.documentElement;
      const styles = window.getComputedStyle(html);
      let bgColor = styles.backgroundColor;

      if (bgColor === 'rgba(0, 0, 0, 0)') {
        const body = document.body;
        bgColor = window.getComputedStyle(body).backgroundColor;
      }

      if (bgColor === 'rgba(0, 0, 0, 0)') {
        const allDivs = document.querySelectorAll('div');
        for (let div of allDivs) {
          const divStyles = window.getComputedStyle(div);
          const divBg = divStyles.backgroundColor;
          if (divBg && divBg !== 'rgba(0, 0, 0, 0)' && divBg !== 'transparent') {
            return divBg;
          }
        }
      }
      return bgColor;
    });

    console.log('Register page PageWrapper background color (dark mode):', bgColor);

    expect(bgColor).not.toBe('rgb(255, 255, 255)'); // Not white
    expect(bgColor).not.toMatch(/rgb\(249/); // Not light gray

    // Get the RegisterCard background color
    const cardBgColor = await page.evaluate(() => {
      const allDivs = document.querySelectorAll('div');
      const colorMap: { [key: string]: number } = {};

      for (let div of allDivs) {
        const divStyles = window.getComputedStyle(div);
        const divBg = divStyles.backgroundColor;

        if (divBg && divBg.startsWith('rgb') && !divBg.includes('0, 0, 0, 0')) {
          colorMap[divBg] = (colorMap[divBg] || 0) + 1;
        }
      }

      const colors = Object.entries(colorMap).sort((a, b) => b[1] - a[1]);
      return colors.length > 1 ? colors[1][0] : (colors[0]?.[0] || 'NOT_FOUND');
    });

    console.log('Register page Card background color (dark mode):', cardBgColor);

    expect(cardBgColor).not.toBe('NOT_FOUND');
    expect(cardBgColor).not.toBe(bgColor);
  });

  test('Login page should have light background in light mode', async ({ page }) => {
    // Navigate to login page
    await page.goto('http://localhost:3021/login');

    // Set light theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Get the main page background color
    const bgColor = await page.evaluate(() => {
      const html = document.documentElement;
      const styles = window.getComputedStyle(html);
      let bgColor = styles.backgroundColor;

      if (bgColor === 'rgba(0, 0, 0, 0)') {
        const body = document.body;
        bgColor = window.getComputedStyle(body).backgroundColor;
      }

      if (bgColor === 'rgba(0, 0, 0, 0)') {
        const allDivs = document.querySelectorAll('div');
        for (let div of allDivs) {
          const divStyles = window.getComputedStyle(div);
          const divBg = divStyles.backgroundColor;
          if (divBg && divBg !== 'rgba(0, 0, 0, 0)' && divBg !== 'transparent') {
            return divBg;
          }
        }
      }
      return bgColor;
    });

    console.log('Login page PageWrapper background color (light mode):', bgColor);

    // In light mode, background should be light (not black)
    expect(bgColor).not.toBe('rgb(0, 0, 0)'); // Not black
    expect(bgColor).not.toMatch(/rgb\(0/); // Not black or very dark
  });

  test('Form inputs should have proper contrast in dark mode', async ({ page }) => {
    await page.goto('http://localhost:3021/login');

    // Set dark theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Get email input background color
    const inputBgColor = await page.evaluate(() => {
      const input = document.querySelector('input[type="email"]') as HTMLElement;
      if (!input) return 'NOT_FOUND';
      return window.getComputedStyle(input).backgroundColor;
    });

    console.log('Email input background color (dark mode):', inputBgColor);

    // In dark mode, input should not be white or very light colored
    // It should be dark so it's visible on the dark page background
    expect(inputBgColor).not.toBe('NOT_FOUND');
    expect(inputBgColor).not.toBe('rgb(255, 255, 255)'); // Not white
    expect(inputBgColor).not.toMatch(/rgb\(249/); // Not light gray (like #f9fafb)
    expect(inputBgColor).not.toMatch(/rgb\(245/); // Not light gray variations
  });
});
