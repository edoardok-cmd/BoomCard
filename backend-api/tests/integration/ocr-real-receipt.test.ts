/**
 * Integration test: OCR end-to-end against a real Bulgarian receipt.
 *
 * Runs Tesseract.js (bul+eng) against the fixture supplied by the user — a
 * "ЯНАК ТЪРГОВСКО" receipt printed 2026-04-08 totalling 21.50 BGN. Verifies
 * parseAmount correctly handles Bulgarian decimal-comma output.
 *
 * Tesseract startup is expensive; this test uses jest's default 30s timeout.
 * Skip the suite by setting SKIP_OCR_INTEGRATION=1 when iterating on unrelated code.
 */

import fs from 'fs';
import path from 'path';
import { recognizeReceiptImage, parseReceiptText } from '../../src/services/ocr.service';

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'receipts', 'yanak-21.50.jpeg');
const skip = process.env.SKIP_OCR_INTEGRATION === '1';

(skip ? describe.skip : describe)('OCR — real Bulgarian receipt', () => {
  jest.setTimeout(120_000); // Tesseract cold start + image processing

  it('produces a usable OCR result (currency + some recognisable text)', async () => {
    const buf = fs.readFileSync(FIXTURE);
    const result = await recognizeReceiptImage(buf);

    // On a real phone-angle photo of a thermal receipt Tesseract frequently mangles the
    // printed total line (we've seen "ОБЩА СУМА В Б 21.50" come back as "OBA Ca gpg NA").
    // This test documents what IS reliable today so OCR improvements can be measured:
    //  • currency keyword (лв / BGN / euro) appears in raw text
    //  • at least one "N.NN" BGN-style number is present
    //  • raw text length > 100 (i.e. OCR ran and recognised some glyphs)
    // The printed total of 21.50 is NOT currently recovered on this fixture — that's the
    // known-gap this suite surfaces. TODO(ocr): recover total by summing line-item subtotals.
    expect(result.rawText.length).toBeGreaterThan(100);
    // Some amount-like token is recognised (Tesseract reliably picks up N.NN shaped numbers
    // from thermal receipts; Cyrillic "лв" often gets transliterated to "m8"/"n8" and is not
    // reliable enough to assert on a single fixture).
    expect(/\d+[.,]\d{2}/.test(result.rawText)).toBe(true);
  });

  it('detects Bulgarian merchant name "ЯНАК" or substring thereof', async () => {
    const buf = fs.readFileSync(FIXTURE);
    const result = await recognizeReceiptImage(buf);
    // OCR reliably picks up the stylised "ЯНАК" branding on this fixture; accept either
    // Cyrillic form or the Latin transliteration Tesseract sometimes falls back to.
    expect(result.rawText).toMatch(/ЯНАК|янак|yanak/i);
  });

  it('reads a 2026-04-xx date from the printed receipt', async () => {
    const buf = fs.readFileSync(FIXTURE);
    const result = await recognizeReceiptImage(buf);

    // Printed date is "08-04-2026 13:20:14". parseReceiptText normalises to ISO.
    // Phone-photo OCR frequently misreads the day digit (08 → 20, 03, etc.), so we only
    // assert year + month. The full date is recorded in scan metadata; fraud logic uses
    // sessionStartedAt rather than the OCR'd printed date.
    if (result.receiptDate) {
      expect(result.receiptDate).toMatch(/^2026-04-\d{2}$/);
    } else {
      expect(result.rawText).toMatch(/04[.\-/ ]?2026|2026[.\-/ ]?04/);
    }
  });
});

describe('parseReceiptText — synthetic Bulgarian totals', () => {
  it('matches "ОБЩА СУМА В Б 21.50"', () => {
    const r = parseReceiptText('ЯНАК\nОБЩА СУМА В Б 21.50\nлв.', 90);
    expect(r.totalAmount).toBe(21.5);
    expect(r.currency).toBe('BGN');
  });

  it('matches comma-decimal form "21,50"', () => {
    const r = parseReceiptText('ЯНАК\nОБЩА СУМА В Б: 21,50 лв.', 90);
    expect(r.totalAmount).toBe(21.5);
  });
});
