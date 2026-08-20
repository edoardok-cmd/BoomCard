/**
 * BC-QA-031 F2 — offer discount label currency.
 *
 * `offers.routes.ts` mapOffer emits `discountAmount` as a plain EUR scalar
 * (the dual-currency wrapper object it used to return was removed along with
 * the rest of the BGN/EUR dual display). Both Offers screens rendered it as
 * "`${offer.discountAmount} лв. off`" — a EUR figure under a Lev label. They
 * now format it via `formatEurAmount`, which applies no conversion and emits
 * the € symbol.
 */
import { getDiscountLabel as offersLabel } from './OffersScreen';
import { getDiscountLabel as detailLabel } from './OfferDetailScreen';

const cases: Array<[string, (offer: any) => string]> = [
  ['OffersScreen', offersLabel],
  ['OfferDetailScreen', detailLabel],
];

describe.each(cases)('%s getDiscountLabel (BC-QA-031)', (_name, getDiscountLabel) => {
  it('labels a backend EUR discountAmount in EUR, never in лв', () => {
    const label = getDiscountLabel({ discountAmount: 42.5 });
    expect(label).toBe('€42.50 off');
    expect(label).not.toContain('лв');
  });

  it('applies no BGN→EUR conversion to the already-EUR amount', () => {
    // The halved value (42.5 / 1.95583 = 21.73) must never appear.
    expect(getDiscountLabel({ discountAmount: 42.5 })).not.toContain('21.73');
  });

  it('still prefers the percentage labels when those are present', () => {
    expect(getDiscountLabel({ discountPercent: 20, discountAmount: 42.5 })).toBe('20% off');
    expect(getDiscountLabel({ cashbackPercent: 5, discountAmount: 42.5 })).toBe('5% cashback');
  });

  it('returns an empty label when the offer carries no discount figures', () => {
    expect(getDiscountLabel({})).toBe('');
  });
});
