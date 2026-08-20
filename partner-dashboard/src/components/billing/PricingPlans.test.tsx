import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PricingPlans } from './PricingPlans';
import { LanguageProvider } from '../../contexts/LanguageContext';

/**
 * BC-QA-031 impl-r5 F7 — dual BGN/EUR pricing display removed (user decision).
 *
 * This component was the one dual-pricing surface whose catalogue was
 * denominated in BGN (a hardcoded `priceBGN` map), with the EUR figure derived
 * at render time by `convertBGNToEUR`. Stripping the лв half therefore required
 * moving the catalogue to EUR, which is the one place in this change where the
 * displayed number could silently drift.
 *
 * The expected values below are exactly what `convertBGNToEUR` produced from
 * the previous BGN catalogue, computed with the same
 * `Math.round((bgn / 1.95583) * 100) / 100` arithmetic:
 *
 *   monthly:      57 → 29.14   |  155 → 79.25   |  389 → 198.89
 *   annual/12:    Math.round(570/12)  =  48 → 24.54
 *                 Math.round(1550/12) = 129 → 65.96
 *                 Math.round(3890/12) = 324 → 165.66
 *
 * Note the annual figures preserve the ORIGINAL rounding order — the BGN
 * monthly-equivalent was rounded to a whole lev BEFORE conversion, so they are
 * not simply `annualEur / 12`.
 */

// Reproduces the deleted helper so the expectations are derived, not transcribed.
const DELETED_RATE = 1.95583;
const oldConvert = (bgn: number) => Math.round((bgn / DELETED_RATE) * 100) / 100;

const OLD_BGN_CATALOGUE = {
  starter: { monthly: 57, annual: 570 },
  professional: { monthly: 155, annual: 1550 },
  enterprise: { monthly: 389, annual: 3890 },
} as const;

const renderPlans = (language: 'en' | 'bg') => {
  localStorage.setItem('boomcard_language', language);
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <PricingPlans />
      </LanguageProvider>
    </MemoryRouter>,
  );
};

const assertNoLev = (container: HTMLElement) => {
  const text = container.textContent ?? '';
  expect(text).not.toMatch(/лв/);
  expect(text).not.toMatch(/\bBGN\b/);
  // The bare BGN amounts that used to be the primary figure.
  for (const { monthly } of Object.values(OLD_BGN_CATALOGUE)) {
    expect(text).not.toMatch(new RegExp(`(^|[^\\d.])${monthly}([^\\d.]|$)`));
  }
};

describe('PricingPlans — EUR-only catalogue (BC-QA-031 r5-F7)', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it.each(['en', 'bg'] as const)(
    'renders the monthly EUR price the old BGN catalogue converted to, with no лв half (%s)',
    (lang) => {
      const { container } = renderPlans(lang);

      for (const { monthly } of Object.values(OLD_BGN_CATALOGUE)) {
        expect(screen.getByText(`€${oldConvert(monthly)}`)).toBeInTheDocument();
      }
      assertNoLev(container);
    },
  );

  it('renders the annual per-month EUR price with the original rounding order, and no лв half', () => {
    const { container } = renderPlans('en');

    // Flip to annual billing via the toggle switch (it has an aria-label; its
    // text labels are translation keys and are not reliable selectors).
    fireEvent.click(screen.getByLabelText('Toggle billing period'));

    for (const { monthly, annual } of Object.values(OLD_BGN_CATALOGUE)) {
      const expectedAnnualPerMonth = oldConvert(Math.round(annual / 12));
      expect(screen.getByText(`€${expectedAnnualPerMonth}`)).toBeInTheDocument();
      // The struck-through monthly comparison line is also EUR-only now.
      expect(container.textContent).toContain(`€${oldConvert(monthly)}/`);
    }
    assertNoLev(container);
  });

  it('pins the exact catalogue figures so a transcription slip is visible', () => {
    renderPlans('en');
    // Spelled out literally as a second, independent check on the derived
    // expectations above — if `oldConvert` itself were wrong, both would move
    // together, so these constants anchor them.
    expect(screen.getByText('€29.14')).toBeInTheDocument();
    expect(screen.getByText('€79.25')).toBeInTheDocument();
    expect(screen.getByText('€198.89')).toBeInTheDocument();
  });
});
