/**
 * BC-UX-E2E-REAUDIT — locale RENDER class sweep (matrix UXJ-043..UXJ-046, UXJ-051).
 *
 * BG pass — for EVERY public/guest route, loaded with the app's real language
 * mechanism (localStorage['boomcard_language'] = 'bg', see LanguageContext):
 *   - <html lang> is "bg" and the body renders Cyrillic text (UXJ-043);
 *   - no en.ts dictionary value that HAS a differing BG translation appears
 *     verbatim (word-bounded) in the rendered body — i.e. no untranslated
 *     dictionary leak-through (UXJ-044);
 *   - no "Translation key not found" runtime warnings (UXJ-046).
 *
 * EN pass — inverse spot-check on the journey pages: <html lang> is "en" and no
 * BG-only dictionary value renders (UXJ-045).
 *
 * The leak lists are BUILT from the dictionaries themselves (en.ts / bg.ts), so
 * new strings are covered automatically. Values where BG intentionally keeps
 * the English term (bg value contains the en value, e.g. brand names) are
 * excluded — this sweep only flags strings the dictionary itself translates.
 */
import { test, expect } from '@playwright/test';
import { en } from '../../src/locales/en';
import { bg } from '../../src/locales/bg';
import { PUBLIC_ROUTES, primeBrowserState, captureConsole, waitForSettled } from './ux-sweep-routes';

interface LeakEntry {
  key: string;
  value: string;
  re: RegExp;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-bounded matcher so "Age" never matches inside "Page". Hyphen counts as a
 * word character too, so "Time" does not match inside the compound "Time-lapse".
 */
function boundedRe(value: string): RegExp {
  return new RegExp(`(?<![A-Za-zА-Яа-я-])${escapeRe(value)}(?![A-Za-zА-Яа-я-])`);
}

function collectLeaks(
  src: Record<string, unknown>,
  other: Record<string, unknown>,
  keep: (srcVal: string, otherVal: string) => boolean,
  prefix = '',
): LeakEntry[] {
  const out: LeakEntry[] = [];
  for (const [k, v] of Object.entries(src)) {
    const p = prefix ? `${prefix}.${k}` : k;
    const o = other?.[k];
    if (v && typeof v === 'object') {
      out.push(...collectLeaks(v as Record<string, unknown>, (o ?? {}) as Record<string, unknown>, keep, p));
    } else if (typeof v === 'string' && typeof o === 'string' && keep(v, o)) {
      out.push({ key: p, value: v, re: boundedRe(v) });
    }
  }
  return out;
}

// EN values that MUST NOT render in BG mode: value has a real, different BG
// translation, is long enough to be distinctive, and BG doesn't embed the EN term.
const EN_LEAKS: LeakEntry[] = collectLeaks(
  en as unknown as Record<string, unknown>,
  bg as unknown as Record<string, unknown>,
  (e, b) =>
    e.trim().length >= 4 &&
    /[A-Za-z]{3}/.test(e) &&
    e.trim().toLowerCase() !== b.trim().toLowerCase() &&
    !b.toLowerCase().includes(e.trim().toLowerCase()),
);

// BG values that MUST NOT render in EN mode (inverse): distinctive Cyrillic values.
const BG_LEAKS: LeakEntry[] = collectLeaks(
  bg as unknown as Record<string, unknown>,
  en as unknown as Record<string, unknown>,
  (b, e) =>
    b.trim().length >= 4 &&
    /[А-Яа-я]{3}/.test(b) &&
    b.trim().toLowerCase() !== e.trim().toLowerCase() &&
    !e.toLowerCase().includes(b.trim().toLowerCase()),
);

const CAP = 40; // max leaks listed per route; exact count always reported

/**
 * Brand proper nouns stripped from the body BEFORE leak matching. "BOOM Card"
 * appears verbatim inside legitimate Bulgarian copy ("вашата BOOM Card карта…"),
 * which otherwise makes the bounded word "Card" (payments.card) a false
 * positive on every route. Standalone "Card" outside the brand phrase is still
 * flagged.
 */
const BRAND_PHRASES = [
  'BOOM Card',
  'BoomCard',
  'Boom Card',
  // third-party / legal proper nouns that legitimately appear inside BG copy
  'Google Analytics',
  'EU-US Data Privacy Framework',
];

/**
 * Language-switcher self-labels are excluded: a language picker intentionally
 * shows each option in its own language ("English" while in BG, "Български"
 * while in EN). Flagging those would be a test bug, not a product defect.
 */
const LANGUAGE_SELF_LABEL_KEYS = new Set(['common.english', 'common.bulgarian']);

function stripBrand(text: string): string {
  let out = text;
  for (const b of BRAND_PHRASES) out = out.split(b).join(' ');
  return out;
}

function findLeaks(text: string, leaks: LeakEntry[]): string[] {
  const scanned = stripBrand(text);
  const hits: string[] = [];
  for (const l of leaks) {
    if (LANGUAGE_SELF_LABEL_KEYS.has(l.key)) continue;
    if (l.re.test(scanned)) hits.push(`${l.key} = "${l.value}"`);
  }
  return hits;
}

test.describe('UX locale render sweep — BG (all public routes)', () => {
  for (const route of PUBLIC_ROUTES.map((r) => r.url)) {
    test(`renders in Bulgarian without EN dictionary leak-through: ${route}`, async ({ page }) => {
      await primeBrowserState(page, 'bg');
      const cap = captureConsole(page);
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const text = await waitForSettled(page);

      const violations: string[] = [];

      const htmlLang = await page.evaluate(() => document.documentElement.lang);
      if (htmlLang !== 'bg') violations.push(`UXJ-043 <html lang> is "${htmlLang}", expected "bg"`);

      if (!/[А-Яа-я]/.test(text)) {
        violations.push(`UXJ-043 no Cyrillic text rendered (body starts: "${text.slice(0, 100)}")`);
      }

      const leaks = findLeaks(text, EN_LEAKS);
      if (leaks.length > 0) {
        violations.push(
          `UXJ-044 ${leaks.length} untranslated EN dictionary value(s) rendered in BG mode: ` +
            leaks.slice(0, CAP).join(' | ') +
            (leaks.length > CAP ? ` … (+${leaks.length - CAP} more)` : ''),
        );
      }

      if (cap.translationWarnings.length > 0) {
        violations.push(
          `UXJ-046 missing translation keys at runtime: ${[...new Set(cap.translationWarnings)].slice(0, CAP).join(' | ')}`,
        );
      }

      expect(violations, `locale violations on ${route} (BG mode)`).toEqual([]);
    });
  }
});

// Inverse spot-check surface: the journey pages (subscriber + partner flows).
const EN_SPOT_CHECK_ROUTES = [
  '/',
  '/pricing',
  '/subscriptions',
  '/checkout?planCode=BASIC&billing=monthly',
  '/subscription/success',
  '/subscription/cancel',
  '/complete-profile?token=qa-sweep-dummy-token',
  '/login',
  '/register/partner',
  '/partner/activate',
  '/faq',
];

test.describe('UX locale render sweep — EN spot-check (journey pages)', () => {
  for (const route of EN_SPOT_CHECK_ROUTES) {
    test(`renders in English without BG dictionary leak-through: ${route}`, async ({ page }) => {
      await primeBrowserState(page, 'en');
      const cap = captureConsole(page);
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const text = await waitForSettled(page);

      const violations: string[] = [];

      const htmlLang = await page.evaluate(() => document.documentElement.lang);
      if (htmlLang !== 'en') violations.push(`UXJ-045 <html lang> is "${htmlLang}", expected "en"`);

      const leaks = findLeaks(text, BG_LEAKS);
      if (leaks.length > 0) {
        violations.push(
          `UXJ-045 ${leaks.length} BG dictionary value(s) rendered in EN mode: ` +
            leaks.slice(0, CAP).join(' | ') +
            (leaks.length > CAP ? ` … (+${leaks.length - CAP} more)` : ''),
        );
      }

      if (cap.translationWarnings.length > 0) {
        violations.push(
          `UXJ-046 missing translation keys at runtime: ${[...new Set(cap.translationWarnings)].slice(0, CAP).join(' | ')}`,
        );
      }

      expect(violations, `locale violations on ${route} (EN mode)`).toEqual([]);
    });
  }
});
