/**
 * BC-UX-E2E-REAUDIT — shared route inventory + helpers for the ux-*-sweep specs.
 *
 * ⚠️ ROUTE LIST MUST MATCH src/App.tsx.
 * App.tsx builds its route tree from nested JSX <Route> elements (including
 * conditional feature-flag branches), which cannot be imported here without
 * booting the whole app. The list below is therefore hardcoded, restricted to
 * PUBLIC / GUEST-reachable routes (no ProtectedRoute / PartnerStatusRoute
 * wrapper). The `appTsxSyncCheck` test in ux-blank-page-sweep.spec.ts asserts
 * every literal below still exists in App.tsx, so removals/renames fail loudly.
 * When you add a public route to App.tsx, add it here too.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { Page } from '@playwright/test';

export interface PublicRoute {
  /** Path to navigate to (may include a query string needed to render content). */
  url: string;
  /** The literal used in App.tsx `path="…"` (no query), for the sync check. */
  appPath: string;
}

const r = (appPath: string, query = ''): PublicRoute => ({
  url: (appPath.startsWith('/') ? appPath : `/${appPath}`) + query,
  appPath,
});

/** Every guest-reachable route from src/App.tsx (params/admin/guarded excluded). */
export const PUBLIC_ROUTES: PublicRoute[] = [
  // Core public pages (Layout children)
  r('/'),
  r('search'),
  r('nearby'),
  r('categories'),
  r('top-offers'),
  r('partners'),
  // Media
  r('media'),
  r('media/gallery'),
  r('media/photos'),
  r('media/videos'),
  // Offers
  r('offers'),
  r('offers/type'),
  r('offers/gastronomy'),
  r('offers/extreme'),
  r('offers/cultural'),
  // Venues
  r('venues'),
  r('venues/restaurants'),
  r('venues/restaurants/types'),
  r('venues/hotels'),
  r('venues/hotels/types'),
  r('venues/accommodation'),
  r('venues/spa'),
  r('venues/wineries'),
  r('venues/clubs'),
  r('venues/cafes'),
  r('venues/panoramic'),
  // Experiences (current IA)
  r('experiences'),
  r('experiences/gastronomic'),
  r('experiences/gastronomic/degustations'),
  r('experiences/gastronomic/food-traditions'),
  r('experiences/historical-cultural'),
  r('experiences/historical-cultural/walking-tours'),
  r('experiences/historical-cultural/historical-tours'),
  r('experiences/historical-cultural/museums-galleries'),
  r('experiences/active-adventure'),
  r('experiences/active-adventure/nature-tours'),
  r('experiences/active-adventure/bike-tours'),
  r('experiences/active-adventure/offroad-atv'),
  r('experiences/active-adventure/water-activities'),
  r('experiences/extreme'),
  r('experiences/extreme/aerial'),
  r('experiences/extreme/jumping'),
  r('experiences/extreme/motorcycles'),
  r('experiences/extreme/water'),
  r('experiences/educational-creative'),
  r('experiences/educational-creative/cooking'),
  r('experiences/educational-creative/workshops'),
  r('experiences/educational-creative/arts'),
  r('experiences/relax-wellness'),
  r('experiences/relax-wellness/spa-thermal'),
  r('experiences/relax-wellness/massages-therapies'),
  r('experiences/relax-wellness/relax-experiences'),
  r('experiences/relax-wellness/yoga-meditation'),
  // Experiences (legacy compat)
  r('experiences/gastronomy'),
  r('experiences/gastronomy/food-tours'),
  r('experiences/extreme/adventure'),
  r('experiences/cultural'),
  r('experiences/cultural/museums'),
  r('experiences/romantic'),
  r('experiences/romantic/activities'),
  r('experiences/family'),
  r('experiences/family/activities'),
  r('experiences/educational'),
  r('experiences/educational/learning'),
  // Locations
  r('locations'),
  r('locations/cities'),
  r('locations/sofia'),
  r('locations/plovdiv'),
  r('locations/varna'),
  r('locations/bansko'),
  r('locations/price'),
  r('locations/price/budget'),
  r('locations/price/premium'),
  r('locations/price/luxury'),
  r('locations/type/all'),
  // Partners subpages
  r('partners/categories'),
  r('partners/restaurants'),
  r('partners/regions'),
  r('partners/sofia'),
  r('partners/plovdiv'),
  r('partners/varna'),
  r('partners/bansko'),
  r('partners/status'),
  r('partners/new'),
  r('partners/vip'),
  r('partners/exclusive'),
  // Footer / info pages
  r('about'),
  r('subscriptions'),
  r('contacts'),
  r('support'),
  r('terms'),
  r('privacy'),
  r('cookies'),
  r('refund-policy'),
  r('faq'),
  // New public pages
  r('product'),
  r('features'),
  r('pricing'),
  r('contact'),
  r('security'),
  // Journey pages
  r('checkout'), // no plan param → must render explicit error state (UXJ-005)
  r('checkout', '?planCode=BASIC&billing=monthly'), // seeded plan → full guest checkout (UXJ-006)
  r('payments/success'),
  r('payments/cancel'),
  r('subscription/success'),
  r('subscription/cancel'),
  r('favorites'),
  r('upload-receipt'),
  // Standalone (outside the Layout route)
  r('/login'),
  r('/register/partner'),
  r('/partner/activate'), // no token → must render explicit invalid state (UXJ-038)
  r('/forgot-password'),
  r('/reset-password'),
  r('/verify-email'),
  r('/complete-profile'), // no token → explicit invalid-link state (UXJ-021)
  r('/complete-profile', '?token=qa-sweep-dummy-token'), // renders set-password form (UXJ-022)
];

/** Probe for the catch-all NotFound route (UXJ-063). Not in App.tsx literally. */
export const NOT_FOUND_PROBE = '/qa-sweep-this-route-does-not-exist';

// package.json has "type": "module" → this file is transpiled as ESM (no __dirname)
export const APP_TSX_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/App.tsx',
);

/** Assert helper data: every appPath literal must still exist in App.tsx. */
export function missingFromAppTsx(): string[] {
  const src = fs.readFileSync(APP_TSX_PATH, 'utf-8');
  const missing: string[] = [];
  for (const route of PUBLIC_ROUTES) {
    const bare = route.appPath.replace(/^\//, '');
    if (route.appPath === '/') {
      if (!src.includes('<Route index')) missing.push(route.appPath);
      continue;
    }
    if (!src.includes(`path="${route.appPath}"`) && !src.includes(`path="${bare}"`)) {
      missing.push(route.appPath);
    }
  }
  return missing;
}

/**
 * Pre-seed browser state before any app code runs:
 * - dismiss the cookie-consent banner (its text would mask blank pages and
 *   pollute locale checks),
 * - pin the UI language (LanguageContext reads localStorage['boomcard_language']).
 */
export async function primeBrowserState(page: Page, language: 'bg' | 'en'): Promise<void> {
  await page.addInitScript(
    ([lang]) => {
      window.localStorage.setItem('boomcard_language', lang);
      window.localStorage.setItem(
        'boomcard_cookie_consent',
        JSON.stringify({
          hasConsented: true,
          preferences: { essential: true, analytics: false, marketing: false },
          timestamp: Date.now(),
        }),
      );
    },
    [language],
  );
}

export interface ConsoleCapture {
  errors: string[];
  pageErrors: string[];
  translationWarnings: string[];
}

/** Attach console/pageerror listeners. Call BEFORE page.goto. */
export function captureConsole(page: Page): ConsoleCapture {
  const cap: ConsoleCapture = { errors: [], pageErrors: [], translationWarnings: [] };
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') cap.errors.push(text);
    if (text.includes('Translation key not found')) cap.translationWarnings.push(text);
  });
  page.on('pageerror', (err) => {
    cap.pageErrors.push(String(err));
  });
  return cap;
}

/** Visible rendered text of the page body, whitespace-collapsed. */
export async function bodyText(page: Page): Promise<string> {
  return page.evaluate(() => (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim());
}

/**
 * Wait until the route has "settled": body text stops being trivially empty or
 * the timeout elapses (we still return whatever is there — assertions decide).
 */
export async function waitForSettled(page: Page, minChars = 41, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let text = '';
  // Poll: lazy-loaded chunks + react-query fetches can take a moment on Vite dev.
  for (;;) {
    text = await bodyText(page);
    // Treat a pure loading state as not-settled ("Loading…"/"Зареждане…" only).
    const isLoadingOnly = /^(loading|зареждане)?[.…]*$/i.test(text);
    if (text.length >= minChars && !isLoadingOnly) return text;
    if (Date.now() > deadline) return text;
    await page.waitForTimeout(500);
  }
}
