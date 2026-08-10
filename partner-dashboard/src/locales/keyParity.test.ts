/**
 * BC-QA-004 — bg.ts / en.ts key-parity guard.
 *
 * The two locale dictionaries are hand-maintained, plain TypeScript objects
 * (not generated from a shared schema), so a key added to one file and
 * forgotten in the other silently falls back to the raw key string at
 * runtime (see locales/index.ts's getTranslation — a missing key returns the
 * key itself and logs a console.warn). That is exactly the "mixed BG/EN"
 * symptom this task fixes, so a divergence between the two key sets must
 * fail the build rather than surface as an in-product English/Bulgarian
 * leak. This test walks both dictionaries and asserts every leaf key path
 * that exists in one exists in the other.
 */
import { describe, it, expect } from 'vitest';
import { en } from './en';
import { bg } from './bg';

/** Recursively collect every leaf key path ("namespace.sub.key") in a translation object. */
function collectKeyPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') {
    return [prefix];
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return collectKeyPaths(value, path);
    }
    return [path];
  });
}

describe('locales key parity (bg.ts vs en.ts)', () => {
  const enKeys = new Set(collectKeyPaths(en));
  const bgKeys = new Set(collectKeyPaths(bg));

  it('every en.ts key exists in bg.ts', () => {
    const missingInBg = [...enKeys].filter(k => !bgKeys.has(k)).sort();
    expect(missingInBg, `Keys present in en.ts but missing from bg.ts:\n${missingInBg.join('\n')}`).toEqual([]);
  });

  it('every bg.ts key exists in en.ts', () => {
    const missingInEn = [...bgKeys].filter(k => !enKeys.has(k)).sort();
    expect(missingInEn, `Keys present in bg.ts but missing from en.ts:\n${missingInEn.join('\n')}`).toEqual([]);
  });

  it('both dictionaries expose a non-trivial number of keys (sanity check against a vacuous pass)', () => {
    expect(enKeys.size).toBeGreaterThan(500);
    expect(bgKeys.size).toBeGreaterThan(500);
  });
});
