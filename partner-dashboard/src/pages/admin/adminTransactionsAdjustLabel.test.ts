import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * BC-QA-031 round 7, F3 (partial) — the adjust-amount input must state its unit.
 *
 * `POST /api/admin/transactions/adjust` stores the submitted number verbatim on
 * the BGN `WalletTransaction.amount` column and echoes it back through
 * `bgnToEur()`. Every other money figure on AdminTransactionsPage renders via
 * `fmtAmount = formatEUR`, so an unlabelled input on that page reads as EUR:
 * an admin crediting `50` credits 50 BGN and the list redraws it as €25.56.
 *
 * The unit label is what ships today. Whether the input SHOULD submit EUR is the
 * open product question, filed separately — this test pins only that the field
 * is not silently unlabelled again.
 *
 * WHY THIS IS A SOURCE ASSERTION AND NOT A RENDER ASSERTION: AdminTransactionsPage
 * is a ~1200-line page whose mount pulls in the full admin query stack, and the
 * copy dictionary holding this string is a module-local const with no export. A
 * render test would need the whole page's mock surface to assert one label, and
 * would be the most fragile test in the suite for the least coverage. Reading the
 * copy back off disk is narrower but honest about what it checks: it goes red if
 * the unit is dropped from either locale, and it cannot pass vacuously because a
 * missing file or a renamed key fails the first assertion.
 */

const PAGE = path.join(__dirname, 'AdminTransactionsPage.tsx');

describe('AdminTransactionsPage — adjust-amount input carries its unit (BC-QA-031 F3)', () => {
  const source = fs.readFileSync(PAGE, 'utf-8');

  it('the adjustAmount copy key exists', () => {
    // Guards the rest of the file against a silent rename.
    expect(source).toMatch(/adjustAmount:\s*\{/);
  });

  it('states the unit in the Bulgarian label', () => {
    const bg = source.match(/adjustAmount:\s*\{[\s\S]*?bg:\s*'([^']+)'/);
    expect(bg).not.toBeNull();
    expect(bg![1]).toMatch(/лв\./);
  });

  it('states the unit in the English label', () => {
    const en = source.match(/adjustAmount:\s*\{[\s\S]*?en:\s*'([^']+)'/);
    expect(en).not.toBeNull();
    expect(en![1]).toMatch(/BGN/);
  });

  it('does not label the field EUR — the endpoint stores BGN', () => {
    const block = source.match(/adjustAmount:\s*\{[\s\S]*?\},/);
    expect(block).not.toBeNull();
    expect(block![0]).not.toMatch(/EUR|€/);
  });
});
