/**
 * E2E Tests: AddressAutocomplete — street number extraction (BC-VENUE-FINDER-STREET-NUMBER-030)
 *
 * Covers the bug where Nominatim returns house_number as undefined for Bulgarian
 * addresses even though the number appears in display_name.  The fix must extract
 * the number from display_name and assemble "<road> <number>".
 *
 * Test structure
 * ──────────────
 * 1. Unit test (no browser, always runs) — imports and exercises extractHouseNumber
 *    from addressUtils directly so any production-code change is immediately caught.
 * 2. Browser E2E tests — require a running backend + valid session, provided via
 *    E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD env vars.  They skip gracefully when
 *    the backend is unavailable or credentials are absent.
 */

import { test, expect, Route, Request } from '@playwright/test';
import { extractHouseNumber } from '../../src/utils/addressUtils';

// ---------------------------------------------------------------------------
// Shared Nominatim mock helpers
// ---------------------------------------------------------------------------

/** Intercept every Nominatim search request and return a controlled payload. */
async function mockNominatim(
  route: Route,
  _request: Request,
  payload: object[],
) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

/**
 * A Nominatim result that is missing house_number in the structured address
 * object, but the number (84) appears TRAILING in display_name — the exact
 * failure scenario described in the bug report (Bulgarian convention places
 * the number after the street name: "бул. Васил Левски 84").
 */
const MISSING_HOUSE_NUMBER_RESULT = [
  {
    place_id: 123456789,
    display_name: 'бул. Васил Левски 84, Средец, София, 1000, България',
    address: {
      road: 'бул. Васил Левски',
      // house_number intentionally absent
      city: 'София',
      state: 'Област София-град',
      country: 'България',
    },
    lat: '42.698334',
    lon: '23.319941',
  },
];

/**
 * A Nominatim result where house_number IS present in the structured address.
 * Used to verify the happy path still works after the fix.
 */
const PRESENT_HOUSE_NUMBER_RESULT = [
  {
    place_id: 987654321,
    display_name: 'бул. Патриарх Евтимий 42, Триадица, София, 1000, България',
    address: {
      road: 'бул. Патриарх Евтимий',
      house_number: '42',
      city: 'София',
      state: 'Област София-град',
      country: 'България',
    },
    lat: '42.690000',
    lon: '23.320000',
  },
];

// ---------------------------------------------------------------------------
// Unit test — no browser needed, always reliable
// ---------------------------------------------------------------------------

test.describe('AddressAutocomplete — street number extraction', () => {
  test('unit: extractHouseNumber — covers all fallback paths and edge cases', () => {
    // Case 1: trailing number in display_name — standard BG convention.
    // house_number absent in address object; must fall back to display_name.
    const num1 = extractHouseNumber(
      {},
      'бул. Васил Левски 84, Средец, София, 1000, България',
    );
    expect(num1).toBe('84');

    // Case 2: house_number present — must use it directly.
    const num2 = extractHouseNumber(
      { house_number: '42' },
      'бул. Патриарх Евтимий 42, Триадица, София',
    );
    expect(num2).toBe('42');

    // Case 3: trailing number in display_name segment.
    const num3 = extractHouseNumber(
      {},
      'бул. Васил Левски 84, Средец, София',
    );
    expect(num3).toBe('84');

    // Case 4: no number at all — must return undefined (no fabricated digit).
    const num4 = extractHouseNumber(
      {},
      'бул. Васил Левски, Средец, София',
    );
    expect(num4).toBeUndefined();

    // Case 5: street_number fallback.
    const num5 = extractHouseNumber(
      { street_number: '15A' },
      'ул. Граф Игнатиев 15A, София',
    );
    expect(num5).toBe('15A');

    // Case 6: building with non-numeric name — must NOT be treated as a house
    // number (fails the /^\d/ guard); display_name has no digit either → undefined.
    const num6 = extractHouseNumber(
      { building: 'Сграда 7' },
      'ул. Цар Борис III, София',
    );
    expect(num6).toBeUndefined();

    // Case 6b: building whose value starts with a digit — must be used.
    const num6b = extractHouseNumber(
      { building: '7' },
      'ул. Цар Борис III, София',
    );
    expect(num6b).toBe('7');

    // Case 6c: postal-code-first display_name — "1000" is a bare postal code;
    // the function must skip it and extract "84" from the second segment.
    const num6c = extractHouseNumber(
      {},
      '1000, бул. Васил Левски 84, Sofia',
    );
    expect(num6c).toBe('84');

    // Case 7 (MEDIUM-1): digit-prefixed street name "9 Септември 15" —
    // trailing match captures "15"; leading "9" is part of the street name.
    const num7 = extractHouseNumber(
      {},
      'ул. 9 Септември 15, Средец, София',
    );
    expect(num7).toBe('15');

    // Case 8 (MEDIUM-1): "9 Септември" with no trailing number — leading digit
    // "9" is followed by alphabetic text → treated as street name → undefined.
    const num8 = extractHouseNumber(
      {},
      '9 Септември, Средец, София',
    );
    expect(num8).toBeUndefined();

    // Case 9 (MEDIUM-2 / LOW-1): block-only address carrying a neighbourhood
    // name must NOT produce a house number. `block` is excluded from the
    // cascade; no digit in display_name → undefined.
    const num9 = extractHouseNumber(
      { block: 'кв. Лозенец' },
      'кв. Лозенец, София',
    );
    expect(num9).toBeUndefined();

    // Case 10 (MEDIUM-3): Cyrillic letter suffix on house number must be kept.
    const num10 = extractHouseNumber(
      {},
      'ул. Граф Игнатиев 84А, София',
    );
    expect(num10).toBe('84А');

    // Case 11 (LOW-1): two leading postal-code segments — must still extract
    // house number from the first non-postal segment.
    const numPostalDouble = extractHouseNumber(
      {},
      '1000, 2000, ул. Граф Игнатиев 15, България',
    );
    expect(numPostalDouble).toBe('15');

    // Case 12 (LOW-F2): display_name is a bare postal code only — must not
    // treat the postal code itself as a house number.
    const numBarePostal = extractHouseNumber({}, '1000');
    expect(numBarePostal).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Browser E2E tests — require a running backend and valid admin session
  // -------------------------------------------------------------------------

  test('populates number from display_name when house_number is absent', async ({ page }) => {
    // Check whether the backend is reachable before running browser interaction.
    const backendUp = await page.evaluate(async () => {
      try {
        const r = await fetch('http://localhost:3025/api/auth/me', { credentials: 'omit' });
        return r.status !== 0;
      } catch {
        return false;
      }
    }).catch(() => false);

    if (!backendUp) {
      test.skip(true, 'Backend not running — skipping browser E2E test');
      return;
    }

    // Resolve credentials from environment variables; skip when not set.
    const email = process.env.E2E_ADMIN_EMAIL ?? '';
    const password = process.env.E2E_ADMIN_PASSWORD ?? '';
    if (!email || !password) {
      test.skip(true, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set — skipping browser E2E test');
      return;
    }

    // Intercept Nominatim before navigating so no real network call leaks.
    await page.route('**/nominatim.openstreetmap.org/**', (route, request) =>
      mockNominatim(route, request, MISSING_HOUSE_NUMBER_RESULT),
    );

    await page.goto('/login');
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    await emailInput.fill(email);
    await passwordInput.fill(password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/(?!login)/, { timeout: 8000 }).catch(() => {});

    await page.goto('/admin/partners');

    // Locate the address autocomplete input via its data-testid attribute.
    const addressInput = page.locator('[data-testid="address-autocomplete"]').first();

    // The input may be inside a form that opens after clicking "Add partner".
    if (!(await addressInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      const addBtn = page
        .locator('button')
        .filter({ hasText: /add|нов|create/i })
        .first();
      if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addBtn.click();
      }
    }

    await expect(addressInput).toBeVisible({ timeout: 5000 });

    // Type a query that triggers the mocked Nominatim response.
    await addressInput.fill('Vasil Levski 84');

    // Wait for the autocomplete dropdown to appear (the component debounces 350 ms).
    const firstSuggestion = page.locator('li').filter({ hasText: 'бул. Васил Левски' }).first();
    await expect(firstSuggestion).toBeVisible({ timeout: 3000 });
    await firstSuggestion.click();

    // After selection the input value must contain a digit (the house number).
    const addressValue = await addressInput.inputValue();
    expect(addressValue).toMatch(/\d+/);
    expect(addressValue).not.toBe('бул. Васил Левски');
    expect(addressValue).toContain('84');
  });

  test('works correctly when house_number IS present in structured address', async ({ page }) => {
    const backendUp = await page.evaluate(async () => {
      try {
        const r = await fetch('http://localhost:3025/api/auth/me', { credentials: 'omit' });
        return r.status !== 0;
      } catch {
        return false;
      }
    }).catch(() => false);

    if (!backendUp) {
      test.skip(true, 'Backend not running — skipping browser E2E test');
      return;
    }

    // Resolve credentials from environment variables; skip when not set.
    const email = process.env.E2E_ADMIN_EMAIL ?? '';
    const password = process.env.E2E_ADMIN_PASSWORD ?? '';
    if (!email || !password) {
      test.skip(true, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set — skipping browser E2E test');
      return;
    }

    await page.route('**/nominatim.openstreetmap.org/**', (route, request) =>
      mockNominatim(route, request, PRESENT_HOUSE_NUMBER_RESULT),
    );

    await page.goto('/login');
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    await emailInput.fill(email);
    await passwordInput.fill(password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/(?!login)/, { timeout: 8000 }).catch(() => {});

    await page.goto('/admin/partners');

    const addressInput = page.locator('[data-testid="address-autocomplete"]').first();

    if (!(await addressInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      const addBtn = page
        .locator('button')
        .filter({ hasText: /add|нов|create/i })
        .first();
      if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addBtn.click();
      }
    }

    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill('Patriarch Evtimiy 42');

    const firstSuggestion = page
      .locator('li')
      .filter({ hasText: 'бул. Патриарх Евтимий' })
      .first();
    await expect(firstSuggestion).toBeVisible({ timeout: 3000 });
    await firstSuggestion.click();

    const addressValue = await addressInput.inputValue();
    expect(addressValue).toContain('42');
    expect(addressValue).toMatch(/\d+/);
  });
});
