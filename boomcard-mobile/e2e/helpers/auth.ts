import { Page, BrowserContext } from '@playwright/test';
import { login, API_BASE } from './api';
import fixtures from '../fixtures/seeded.json';

export type UserKey = 'free' | 'basic' | 'premium' | 'light' | 'expired' | 'admin';

/**
 * Log in via the backend API and inject tokens+user into sessionStorage
 * (the same place the app reads on boot). Playwright-only: much faster
 * than driving the LoginScreen UI for every test.
 *
 * Call this BEFORE navigating to the page root. We register an init-script
 * that runs on every page load, so reloads preserve the session.
 */
export async function loginAs(context: BrowserContext, userKey: UserKey) {
  const email = fixtures.users[userKey].email;
  const session = await login(email, fixtures.password);

  const user = {
    id: session.user.id,
    email: session.user.email,
    firstName: 'Test',
    lastName: userKey,
    role: 'USER',
    status: 'ACTIVE',
  };

  await context.addInitScript(
    ({ accessToken, refreshToken, user }) => {
      try {
        sessionStorage.setItem('access_token', accessToken);
        sessionStorage.setItem('refresh_token', refreshToken);
        sessionStorage.setItem('user_data', JSON.stringify(user));
        // Mark language chosen so the LanguageSelectionScreen doesn't block us.
        sessionStorage.setItem('language_selected', 'true');
        sessionStorage.setItem('language', 'en');
      } catch {}
    },
    { accessToken: session.accessToken, refreshToken: session.refreshToken, user }
  );

  return { accessToken: session.accessToken, userId: session.user.id, email };
}

/** Direct navigate to scanner — easier than clicking tabs across the bottom-tab nav. */
export async function goToScanner(page: Page) {
  await page.goto('/');
  // Wait for either the main app tabs OR a login screen visible.
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
  // Click the Scan tab if present; otherwise the app hasn't mounted yet.
  const scanTab = page.getByRole('button', { name: /scan/i }).first();
  if (await scanTab.count()) {
    await scanTab.click();
  }
  // The scanner hooks expose window.__BOOM_TEST_SCAN__ after mount.
  await page.waitForFunction(() => !!(window as any).__BOOM_TEST_SCAN__, { timeout: 15_000 });
}

export { API_BASE, fixtures };
