/**
 * BC-UX-E2E-REAUDIT — no-blank-page class sweep (matrix UXJ-061, UXJ-062, UXJ-063).
 *
 * For EVERY public/guest route in src/App.tsx:
 *   1. the page loads and renders non-trivial visible text (>40 chars) — real
 *      content or an explicit error/empty state, never an empty body or an
 *      eternal spinner;
 *   2. no uncaught page errors and no console messages of severity `error`.
 *
 * A red result here is a product finding, not a test bug.
 */
import { test, expect } from '@playwright/test';
import {
  PUBLIC_ROUTES,
  NOT_FOUND_PROBE,
  missingFromAppTsx,
  primeBrowserState,
  captureConsole,
  waitForSettled,
} from './ux-sweep-routes';

test.describe('UX blank-page sweep (public routes)', () => {
  test('route inventory is in sync with src/App.tsx', () => {
    // Guards the hardcoded PUBLIC_ROUTES list: every literal must still exist
    // in App.tsx so renames/removals fail loudly instead of silently shrinking
    // the sweep surface.
    expect(missingFromAppTsx(), 'routes listed in ux-sweep-routes.ts but missing from App.tsx').toEqual([]);
  });

  for (const route of [...PUBLIC_ROUTES.map((r) => r.url), NOT_FOUND_PROBE]) {
    test(`renders visible content without console errors: ${route}`, async ({ page }) => {
      await primeBrowserState(page, 'en');
      const cap = captureConsole(page);

      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const text = await waitForSettled(page);

      // small settle window so late async errors are captured too
      await page.waitForTimeout(750);

      expect(
        text.length,
        `UXJ-061 violated on ${route}: body visible text is "${text.slice(0, 120)}" (${text.length} chars)`,
      ).toBeGreaterThan(40);

      const problems = [
        ...cap.pageErrors.map((e) => `pageerror: ${e}`),
        ...cap.errors.map((e) => `console.error: ${e}`),
      ];
      expect(problems, `UXJ-062 violated on ${route}`).toEqual([]);
    });
  }
});
