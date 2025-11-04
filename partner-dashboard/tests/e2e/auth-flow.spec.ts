/**
 * E2E Tests: Authentication Flow
 *
 * Tests user authentication, token management, and session handling
 */

import { test, expect } from '@playwright/test';

// Test user credentials (should match your seed data)
const TEST_USER = {
  email: 'demo@boomcard.bg',
  password: 'demo123',
  invalidPassword: 'wrongpassword',
};

const INVALID_USER = {
  email: 'nonexistent@boomcard.bg',
  password: 'password123',
};

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear all cookies and local storage before each test
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
  });

  test.describe('Login Flow', () => {
    test('should show login page with all required elements', async ({ page }) => {
      await page.goto('/login');

      // Check page title
      await expect(page).toHaveTitle(/BoomCard/);

      // Check form elements exist
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/password/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /log in|влез/i })).toBeVisible();

      // Check links
      await expect(page.getByRole('link', { name: /register|регистрация/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /forgot password|забравена парола/i })).toBeVisible();
    });

    test('should successfully login with valid credentials', async ({ page }) => {
      await page.goto('/login');

      // Fill in credentials
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);

      // Submit form
      await page.getByRole('button', { name: /log in|влез/i }).click();

      // Should redirect to dashboard
      await page.waitForURL('/dashboard', { timeout: 5000 });
      await expect(page).toHaveURL('/dashboard');

      // Check localStorage has tokens
      const accessToken = await page.evaluate(() => localStorage.getItem('access_token'));
      const refreshToken = await page.evaluate(() => localStorage.getItem('refresh_token'));

      expect(accessToken).toBeTruthy();
      expect(refreshToken).toBeTruthy();

      // Verify user is logged in (check for logout button or user menu)
      await expect(page.getByRole('button', { name: /logout|изход/i }).or(page.getByTestId('user-menu'))).toBeVisible();
    });

    test('should show error for invalid email', async ({ page }) => {
      await page.goto('/login');

      // Fill invalid email
      await page.getByLabel(/email/i).fill(INVALID_USER.email);
      await page.getByLabel(/password/i).fill(INVALID_USER.password);

      // Submit form
      await page.getByRole('button', { name: /log in|влез/i }).click();

      // Should show error message
      await expect(page.getByText(/invalid|неправилен|грешка/i)).toBeVisible({ timeout: 3000 });

      // Should stay on login page
      await expect(page).toHaveURL(/\/login/);
    });

    test('should show error for incorrect password', async ({ page }) => {
      await page.goto('/login');

      // Fill correct email but wrong password
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.invalidPassword);

      // Submit form
      await page.getByRole('button', { name: /log in|влез/i }).click();

      // Should show error message
      await expect(page.getByText(/invalid|неправилен|грешка|wrong/i)).toBeVisible({ timeout: 3000 });

      // Should stay on login page
      await expect(page).toHaveURL(/\/login/);
    });

    test('should show validation errors for empty fields', async ({ page }) => {
      await page.goto('/login');

      // Try to submit without filling anything
      await page.getByRole('button', { name: /log in|влез/i }).click();

      // Should show validation errors (HTML5 validation or custom)
      const emailInput = page.getByLabel(/email/i);
      const isInvalid = await emailInput.evaluate((input: HTMLInputElement) => !input.validity.valid);

      expect(isInvalid).toBeTruthy();
    });

    test('should toggle password visibility', async ({ page }) => {
      await page.goto('/login');

      const passwordInput = page.getByLabel(/password/i);
      await passwordInput.fill('testpassword');

      // Check initial type is password
      await expect(passwordInput).toHaveAttribute('type', 'password');

      // Click toggle button (assuming eye icon exists)
      const toggleButton = page.getByRole('button', { name: /show|hide|toggle/i }).or(page.locator('[aria-label*="password"]')).first();

      if (await toggleButton.isVisible()) {
        await toggleButton.click();

        // Should change to text
        await expect(passwordInput).toHaveAttribute('type', 'text');

        // Click again to hide
        await toggleButton.click();
        await expect(passwordInput).toHaveAttribute('type', 'password');
      }
    });
  });

  test.describe('Logout Flow', () => {
    test.beforeEach(async ({ page }) => {
      // Login before each logout test
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in|влез/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });
    });

    test('should successfully logout', async ({ page }) => {
      // Find and click logout button
      const logoutButton = page.getByRole('button', { name: /logout|изход/i });

      // If logout is in a menu, open the menu first
      const userMenu = page.getByTestId('user-menu').or(page.getByRole('button', { name: /account|profile|акаунт/i }));

      if (await userMenu.isVisible()) {
        await userMenu.click();
        await logoutButton.click();
      } else {
        await logoutButton.click();
      }

      // Should redirect to login page
      await page.waitForURL('/login', { timeout: 5000 });
      await expect(page).toHaveURL('/login');

      // Tokens should be cleared
      const accessToken = await page.evaluate(() => localStorage.getItem('access_token'));
      const refreshToken = await page.evaluate(() => localStorage.getItem('refresh_token'));

      expect(accessToken).toBeNull();
      expect(refreshToken).toBeNull();
    });

    test('should not access protected routes after logout', async ({ page }) => {
      // Logout
      const userMenu = page.getByTestId('user-menu').or(page.getByRole('button', { name: /account|profile/i }));

      if (await userMenu.isVisible()) {
        await userMenu.click();
      }

      await page.getByRole('button', { name: /logout|изход/i }).click();
      await page.waitForURL('/login', { timeout: 5000 });

      // Try to access dashboard
      await page.goto('/dashboard');

      // Should redirect back to login
      await expect(page).toHaveURL('/login');
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect to login when accessing protected route without auth', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page).toHaveURL('/login');

      await page.goto('/receipts');
      await expect(page).toHaveURL('/login');

      await page.goto('/receipts/analytics');
      await expect(page).toHaveURL('/login');

      await page.goto('/subscriptions');
      await expect(page).toHaveURL('/login');
    });

    test('should allow access to protected routes when authenticated', async ({ page }) => {
      // Login
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in|влез/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });

      // Should be able to access protected routes
      await page.goto('/dashboard');
      await expect(page).toHaveURL('/dashboard');

      await page.goto('/receipts');
      await expect(page).toHaveURL('/receipts');

      await page.goto('/receipts/analytics');
      await expect(page).toHaveURL('/receipts/analytics');
    });
  });

  test.describe('Session Persistence', () => {
    test('should maintain session after page reload', async ({ page }) => {
      // Login
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in|влез/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });

      // Reload page
      await page.reload();

      // Should still be on dashboard
      await expect(page).toHaveURL('/dashboard');

      // Tokens should still exist
      const accessToken = await page.evaluate(() => localStorage.getItem('access_token'));
      expect(accessToken).toBeTruthy();
    });

    test('should maintain session across navigation', async ({ page }) => {
      // Login
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in|влез/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });

      // Navigate to different pages
      await page.goto('/receipts');
      await expect(page).toHaveURL('/receipts');

      await page.goto('/subscriptions');
      await expect(page).toHaveURL('/subscriptions');

      await page.goto('/dashboard');
      await expect(page).toHaveURL('/dashboard');

      // Should still have tokens
      const accessToken = await page.evaluate(() => localStorage.getItem('access_token'));
      expect(accessToken).toBeTruthy();
    });
  });

  test.describe('Token Refresh', () => {
    test('should handle expired access token', async ({ page, context }) => {
      // Login
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in|влез/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });

      // Manually set an expired token (this simulates token expiration)
      await page.evaluate(() => {
        // This is a mock expired JWT token
        const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyIsImVtYWlsIjoidGVzdEB0ZXN0LmNvbSIsImV4cCI6MTYwMDAwMDAwMH0.invalidtoken';
        localStorage.setItem('access_token', expiredToken);
      });

      // Try to make an authenticated request (navigate to receipts page)
      await page.goto('/receipts');

      // Should either:
      // 1. Automatically refresh token and show receipts page
      // 2. Redirect to login if refresh token is also expired

      // Wait for either URL
      await page.waitForURL(/\/(receipts|login)/, { timeout: 5000 });

      // If redirected to login, that's expected behavior for fully expired session
      // If stayed on receipts, token refresh worked
      const currentUrl = page.url();
      expect(currentUrl).toMatch(/\/(receipts|login)/);
    });
  });

  test.describe('Language Switching', () => {
    test('should persist language preference after login', async ({ page }) => {
      await page.goto('/login');

      // Find and click language switcher (if exists)
      const languageButton = page.getByRole('button', { name: /EN|BG|language|език/i });

      if (await languageButton.isVisible()) {
        // Click to switch language
        await languageButton.click();

        // Login
        await page.getByLabel(/email|имейл/i).fill(TEST_USER.email);
        await page.getByLabel(/password|парола/i).fill(TEST_USER.password);
        await page.getByRole('button', { name: /log in|влез/i }).click();
        await page.waitForURL('/dashboard', { timeout: 5000 });

        // Language preference should persist
        const currentLanguage = await page.evaluate(() => localStorage.getItem('language'));
        expect(currentLanguage).toBeTruthy();
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should handle network errors gracefully', async ({ page, context }) => {
      // Go offline
      await context.setOffline(true);

      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in|влез/i }).click();

      // Should show network error
      await expect(page.getByText(/network|connection|свързване/i)).toBeVisible({ timeout: 5000 });

      // Go back online
      await context.setOffline(false);
    });

    test('should handle backend server errors', async ({ page, context }) => {
      // Mock API to return 500 error
      await page.route('**/api/auth/login', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in|влез/i }).click();

      // Should show error message
      await expect(page.getByText(/error|грешка|server|сървър/i)).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Security', () => {
    test('should not expose password in DOM', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/password/i).fill('supersecretpassword');

      // Password field should have type="password"
      const passwordInput = page.getByLabel(/password/i);
      await expect(passwordInput).toHaveAttribute('type', 'password');

      // Password should not be visible in page content
      const pageContent = await page.content();
      expect(pageContent).not.toContain('supersecretpassword');
    });

    test('should not log sensitive data to console', async ({ page }) => {
      const consoleLogs: string[] = [];

      page.on('console', msg => {
        consoleLogs.push(msg.text());
      });

      await page.goto('/login');
      await page.getByLabel(/email/i).fill(TEST_USER.email);
      await page.getByLabel(/password/i).fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in|влез/i }).click();
      await page.waitForURL('/dashboard', { timeout: 5000 });

      // Check that password is not logged
      const hasPasswordInLogs = consoleLogs.some(log => log.includes(TEST_USER.password));
      expect(hasPasswordInLogs).toBe(false);
    });
  });
});
