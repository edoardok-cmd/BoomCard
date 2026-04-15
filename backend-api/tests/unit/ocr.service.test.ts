/**
 * Unit Tests: backend-api/src/services/ocr.service.ts
 *
 * Tests parseReceiptText in isolation — no Tesseract worker, no sharp.
 * The backend implementation differs from the frontend in two key ways:
 *   1. Dates are normalised to ISO (YYYY-MM-DD)
 *   2. Item regex requires 2+ spaces separator (stricter, fewer false positives)
 */

import { parseReceiptText, parseAmount } from '../../src/services/ocr.service';

describe('parseReceiptText (backend)', () => {
  // ─── Total amount ──────────────────────────────────────────────

  describe('total amount', () => {
    it('extracts with "всичко" keyword', () => {
      const r = parseReceiptText('МАГАЗИН\nВсичко: 29,99', 90);
      expect(r.totalAmount).toBe(29.99);
    });

    it('extracts with "общо" keyword', () => {
      const r = parseReceiptText('Merchant\nОбщо: 15.50', 90);
      expect(r.totalAmount).toBe(15.5);
    });

    it('extracts with "total" keyword', () => {
      const r = parseReceiptText('STORE\nTotal: 100.00', 90);
      expect(r.totalAmount).toBe(100.0);
    });

    it('extracts with "за плащане" keyword', () => {
      const r = parseReceiptText('Shop\nЗа плащане: 45,00', 90);
      expect(r.totalAmount).toBe(45.0);
    });

    it('extracts with "сума" keyword', () => {
      const r = parseReceiptText('Shop\nСума: 22,30', 90);
      expect(r.totalAmount).toBe(22.3);
    });

    it('extracts amount followed by "лв"', () => {
      const r = parseReceiptText('Receipt\n99,95 лв', 90);
      expect(r.totalAmount).toBe(99.95);
    });

    it('extracts amount followed by "BGN"', () => {
      const r = parseReceiptText('Receipt\n55.20 BGN', 90);
      expect(r.totalAmount).toBe(55.2);
    });

    it('returns undefined when no total pattern matches', () => {
      const r = parseReceiptText('Receipt with no total', 90);
      expect(r.totalAmount).toBeUndefined();
    });

    it('parses BG thousands-separator amount "1.234,56 лв"', () => {
      const r = parseReceiptText('Store\n1.234,56 лв', 90);
      expect(r.totalAmount).toBe(1234.56);
    });

    it('parses EN thousands-separator amount "1,234.56 BGN"', () => {
      const r = parseReceiptText('Store\n1,234.56 BGN', 90);
      expect(r.totalAmount).toBe(1234.56);
    });

    it('parses BG keyword total with thousands: "Всичко: 2.500,00"', () => {
      const r = parseReceiptText('Store\nВсичко: 2.500,00', 90);
      expect(r.totalAmount).toBe(2500.0);
    });
  });

  // ─── parseAmount helper ───────────────────────────────────────

  describe('parseAmount', () => {
    it('handles BG format "1.234,56"', () => expect(parseAmount('1.234,56')).toBe(1234.56));
    it('handles EN format "1,234.56"', () => expect(parseAmount('1,234.56')).toBe(1234.56));
    it('handles plain "29,99"', () => expect(parseAmount('29,99')).toBe(29.99));
    it('handles plain "29.99"', () => expect(parseAmount('29.99')).toBe(29.99));
  });

  // ─── Date normalisation (backend-specific) ────────────────────

  describe('date normalisation to ISO', () => {
    it('normalises DD.MM.YYYY to YYYY-MM-DD', () => {
      const r = parseReceiptText('Shop\n15.03.2024', 90);
      expect(r.receiptDate).toBe('2024-03-15');
    });

    it('normalises DD/MM/YYYY to YYYY-MM-DD', () => {
      const r = parseReceiptText('Shop\n01/06/2025', 90);
      expect(r.receiptDate).toBe('2025-06-01');
    });

    it('normalises DD-MM-YYYY to YYYY-MM-DD', () => {
      const r = parseReceiptText('Shop\n20-12-2023', 90);
      expect(r.receiptDate).toBe('2023-12-20');
    });

    it('preserves already-ISO YYYY-MM-DD unchanged', () => {
      const r = parseReceiptText('Shop\n2024-07-04', 90);
      expect(r.receiptDate).toBe('2024-07-04');
    });

    it('pads single-digit month and day', () => {
      const r = parseReceiptText('Shop\n5.3.2024', 90);
      expect(r.receiptDate).toBe('2024-03-05');
    });

    it('returns undefined when no date found', () => {
      const r = parseReceiptText('No date here', 90);
      expect(r.receiptDate).toBeUndefined();
    });
  });

  // ─── Currency detection ────────────────────────────────────────

  describe('currency detection', () => {
    it('defaults to BGN', () => {
      const r = parseReceiptText('Receipt', 90);
      expect(r.currency).toBe('BGN');
    });

    it('detects EUR from symbol', () => {
      const r = parseReceiptText('Receipt\n42.00 €', 90);
      expect(r.currency).toBe('EUR');
    });

    it('detects EUR from text', () => {
      const r = parseReceiptText('Receipt\nTotal EUR 42.00', 90);
      expect(r.currency).toBe('EUR');
    });

    it('BGN wins over EUR when both present (BGN checked first)', () => {
      const r = parseReceiptText('Receipt\n42.00 лв (EUR equiv.)', 90);
      expect(r.currency).toBe('BGN');
    });
  });

  // ─── Merchant name ────────────────────────────────────────────

  describe('merchant name', () => {
    it('takes the first non-empty line', () => {
      const r = parseReceiptText('МАГАЗИН ИВАНОВ\n15.03.2024\nTotal: 10.00', 90);
      expect(r.merchantName).toBe('МАГАЗИН ИВАНОВ');
    });

    it('trims leading/trailing whitespace', () => {
      const r = parseReceiptText('  Test Store  \nTotal: 5.00', 90);
      expect(r.merchantName).toBe('Test Store');
    });

    it('returns undefined for empty text', () => {
      const r = parseReceiptText('', 90);
      expect(r.merchantName).toBeUndefined();
    });
  });

  // ─── Line items (2-space separator, anchored) ─────────────────

  describe('line items (stricter regex requires 2+ spaces)', () => {
    it('extracts items separated by 2+ spaces', () => {
      const receipt = 'SHOP\nПиле с картофи  12,50\nSalata  5.00\nВсичко  17,50';
      const r = parseReceiptText(receipt, 90);
      expect(r.items.some(i => i.name === 'Пиле с картофи' && i.price === 12.5)).toBe(true);
      expect(r.items.some(i => i.name === 'Salata' && i.price === 5.0)).toBe(true);
    });

    it('does NOT extract items separated by single space (stricter than frontend)', () => {
      // "Item 5.00" — only one space: should NOT match the backend regex
      const receipt = 'SHOP\nItem 5.00';
      const r = parseReceiptText(receipt, 90);
      expect(r.items.some(i => i.name === 'Item')).toBe(false);
    });

    it('skips total/header lines', () => {
      const receipt = 'SHOP\nItem A  10.00\nВсичко  10.00\nTotal  10.00';
      const r = parseReceiptText(receipt, 90);
      expect(r.items.every(i => !i.name.match(/всичко|total/i))).toBe(true);
    });

    it('returns empty items array when nothing matches', () => {
      const r = parseReceiptText('Just a receipt', 90);
      expect(r.items).toEqual([]);
    });

    it('extracts items from lines with trailing whitespace (real OCR output)', () => {
      // Tesseract frequently appends trailing spaces — $ alone would drop these lines
      const receipt = 'SHOP\nПиле с картофи  12,50   \nSalata  5.00  \nВсичко  17,50';
      const r = parseReceiptText(receipt, 90);
      expect(r.items.some(i => i.name === 'Пиле с картофи' && i.price === 12.5)).toBe(true);
      expect(r.items.some(i => i.name === 'Salata' && i.price === 5.0)).toBe(true);
    });
  });

  // ─── Passthrough fields ────────────────────────────────────────

  describe('passthrough', () => {
    it('stores rawText and confidence', () => {
      const r = parseReceiptText('some text', 72.5);
      expect(r.rawText).toBe('some text');
      expect(r.confidence).toBe(72.5);
    });
  });

  // ─── Real-world Bulgarian receipt ─────────────────────────────

  it('parses a realistic Bulgarian receipt with ISO dates', () => {
    const receipt = [
      'РЕСТОРАНТ ПЛАНИНАТА',
      'гр. София, ул. Витоша 12',
      '12.04.2025',
      '',
      'Пилешка супа     8,00',
      'Шопска салата    6,50',
      '',
      'Всичко:         14,50 лв',
    ].join('\n');

    const r = parseReceiptText(receipt, 88);

    expect(r.merchantName).toBe('РЕСТОРАНТ ПЛАНИНАТА');
    expect(r.receiptDate).toBe('2025-04-12');
    expect(r.totalAmount).toBe(14.5);
    expect(r.currency).toBe('BGN');
    expect(r.confidence).toBe(88);
    expect(r.items.some(i => i.name === 'Пилешка супа' && i.price === 8.0)).toBe(true);
    expect(r.items.some(i => i.name === 'Шопска салата' && i.price === 6.5)).toBe(true);
  });
});
