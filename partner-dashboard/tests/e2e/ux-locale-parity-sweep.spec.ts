/**
 * BC-UX-E2E-REAUDIT — locale key-parity class sweep (matrix UXJ-041, UXJ-042).
 *
 * Pure node-side spec (no browser): imports the locale dictionaries and asserts
 * key-set parity in BOTH directions, reporting every missing key path.
 *
 * Note: bg.ts is typed `: TranslationKey` (typeof en), so tsc should catch
 * drift at build time — this sweep is the runtime backstop (tsc is not run on
 * every dev iteration, and `as`-casts / the standalone phase files bypass it).
 */
import { test, expect } from '@playwright/test';
import { en } from '../../src/locales/en';
import { bg } from '../../src/locales/bg';
import {
  phase2to4TranslationsEN,
  phase2to4TranslationsBG,
} from '../../src/locales/translations-phase2-4';
import {
  phase5TranslationsEN,
  phase5TranslationsBG,
} from '../../src/locales/translations-phase5';

function leafKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') out.push(...leafKeys(v, p));
    else out.push(p);
  }
  return out;
}

function diff(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return a.filter((k) => !setB.has(k));
}

const pairs: Array<[name: string, enObj: object, bgObj: object]> = [
  ['en.ts vs bg.ts', en, bg],
  ['translations-phase2-4 EN vs BG', phase2to4TranslationsEN, phase2to4TranslationsBG],
  ['translations-phase5 EN vs BG', phase5TranslationsEN, phase5TranslationsBG],
];

test.describe('UX locale key parity sweep', () => {
  for (const [name, enObj, bgObj] of pairs) {
    test(`${name}: key sets are identical both directions`, () => {
      const enKeys = leafKeys(enObj);
      const bgKeys = leafKeys(bgObj);
      const missingInBG = diff(enKeys, bgKeys);
      const missingInEN = diff(bgKeys, enKeys);
      expect(
        { missingInBG, missingInEN },
        `UXJ-041/042 violated in ${name}: EN=${enKeys.length} keys, BG=${bgKeys.length} keys`,
      ).toEqual({ missingInBG: [], missingInEN: [] });
    });

    test(`${name}: no empty-string leaf values`, () => {
      const empties = [
        ...leafKeys(enObj).filter((k) => getPath(enObj, k) === '').map((k) => `EN ${k}`),
        ...leafKeys(bgObj).filter((k) => getPath(bgObj, k) === '').map((k) => `BG ${k}`),
      ];
      expect(empties, `${name}: empty translation values`).toEqual([]);
    });
  }
});

function getPath(obj: unknown, dotted: string): unknown {
  let cur: unknown = obj;
  for (const part of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
