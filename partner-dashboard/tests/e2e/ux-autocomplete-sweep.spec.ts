/**
 * BC-UX-E2E-REAUDIT — form-semantics class sweep (matrix UXJ-055..UXJ-060).
 *
 * Enumerates EVERY public/guest route and, on each, every VISIBLE input of type
 * text / email / tel / password (type omitted counts as text). Asserts:
 *   - autocomplete: each such input has a non-empty `autocomplete` attribute
 *     (UXJ-055, and per-form rows UXJ-058/059/060);
 *   - labels: each such input has an accessible label — wrapping <label>,
 *     label[for], aria-label or aria-labelledby (UXJ-056).
 *
 * Routes with no matching inputs pass trivially; the enumeration is what makes
 * this class-level (a new public form is covered automatically once its route
 * is in ux-sweep-routes.ts, which is sync-checked against App.tsx).
 */
import { test, expect } from '@playwright/test';
import { PUBLIC_ROUTES, primeBrowserState, waitForSettled } from './ux-sweep-routes';

interface InputAudit {
  descriptor: string; // e.g. input[type=email] placeholder="you@example.com"
  autocomplete: string | null;
  hasLabel: boolean;
}

async function auditInputs(page: import('@playwright/test').Page): Promise<InputAudit[]> {
  return page.evaluate(() => {
    const results: {
      descriptor: string;
      autocomplete: string | null;
      hasLabel: boolean;
    }[] = [];
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="password"]',
      ),
    );
    for (const el of inputs) {
      // visibility: rendered box + not display:none/visibility:hidden
      const style = window.getComputedStyle(el);
      const visible =
        el.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      if (!visible) continue;

      const labelledBy = el.getAttribute('aria-labelledby');
      const hasLabel = Boolean(
        (el.labels && el.labels.length > 0) ||
          el.closest('label') ||
          (el.getAttribute('aria-label') || '').trim() ||
          (labelledBy && document.getElementById(labelledBy)),
      );
      const bits = [
        `input[type=${el.type || 'text'}]`,
        el.id ? `#${el.id}` : '',
        el.name ? `name="${el.name}"` : '',
        el.placeholder ? `placeholder="${el.placeholder}"` : '',
      ].filter(Boolean);
      results.push({
        descriptor: bits.join(' '),
        autocomplete: el.getAttribute('autocomplete'),
        hasLabel,
      });
    }
    return results;
  });
}

test.describe('UX autocomplete + label sweep (public routes)', () => {
  for (const route of PUBLIC_ROUTES.map((r) => r.url)) {
    test(`visible text/email/tel/password inputs are well-formed: ${route}`, async ({ page }) => {
      await primeBrowserState(page, 'en');
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await waitForSettled(page);
      // Deterministic settle: some inputs (search bars, contact forms) mount
      // after data fetches. Auditing too early produced a false PASS on
      // /search, /experiences, /support, /contact in an early run — wait for
      // network idle (best effort) plus a fixed settle before auditing.
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(750);

      const audits = await auditInputs(page);

      const missingAutocomplete = audits
        .filter((a) => !a.autocomplete || !a.autocomplete.trim())
        .map((a) => a.descriptor);
      const missingLabel = audits.filter((a) => !a.hasLabel).map((a) => a.descriptor);

      const violations = [
        ...missingAutocomplete.map((d) => `UXJ-055 no/empty autocomplete: ${d}`),
        ...missingLabel.map((d) => `UXJ-056 no accessible label: ${d}`),
      ];
      expect(violations, `form-semantics violations on ${route} (${audits.length} inputs audited)`).toEqual([]);
    });
  }
});
