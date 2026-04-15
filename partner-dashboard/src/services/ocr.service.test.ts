import { describe, it, expect } from 'vitest';
import { parseReceiptText } from './ocr.service';

describe('parseReceiptText', () => {
  // ─── Total amount ──────────────────────────────────────────────

  describe('total amount extraction', () => {
    it('extracts total with "всичко" keyword', () => {
      const result = parseReceiptText('МАГАЗИН\nАртикул 1   5.00\nВсичко: 29,99', 90);
      expect(result.totalAmount).toBe(29.99);
    });

    it('extracts total with "общо" keyword', () => {
      const result = parseReceiptText('Merchant\nОбщо: 15.50', 90);
      expect(result.totalAmount).toBe(15.5);
    });

    it('extracts total with "total" keyword (English)', () => {
      const result = parseReceiptText('STORE\nTotal: 100.00', 90);
      expect(result.totalAmount).toBe(100.0);
    });

    it('extracts total with "за плащане" keyword', () => {
      const result = parseReceiptText('Shop\nЗа плащане: 45,00', 90);
      expect(result.totalAmount).toBe(45.0);
    });

    it('extracts total with "сума" keyword', () => {
      const result = parseReceiptText('Shop\nСума: 22,30', 90);
      expect(result.totalAmount).toBe(22.3);
    });

    it('extracts amount followed by "лв"', () => {
      const result = parseReceiptText('Some receipt\n99,95 лв', 90);
      expect(result.totalAmount).toBe(99.95);
    });

    it('extracts amount followed by "BGN"', () => {
      const result = parseReceiptText('Receipt\n55.20 BGN', 90);
      expect(result.totalAmount).toBe(55.2);
    });

    it('returns undefined when no total pattern matches', () => {
      const result = parseReceiptText('Receipt with no total', 90);
      expect(result.totalAmount).toBeUndefined();
    });

    it('handles comma as decimal separator (Bulgarian locale)', () => {
      const result = parseReceiptText('Store\nTotal: 29,99', 90);
      expect(result.totalAmount).toBe(29.99);
    });
  });

  // ─── Date extraction ──────────────────────────────────────────

  describe('date extraction', () => {
    it('extracts DD.MM.YYYY date', () => {
      const result = parseReceiptText('Shop\n15.03.2024\nTotal: 10.00', 90);
      expect(result.date).toBe('15.03.2024');
    });

    it('extracts DD/MM/YYYY date', () => {
      const result = parseReceiptText('Shop\n01/06/2025', 90);
      expect(result.date).toBe('01/06/2025');
    });

    it('extracts DD-MM-YYYY date', () => {
      const result = parseReceiptText('Shop\n20-12-2023', 90);
      expect(result.date).toBe('20-12-2023');
    });

    it('extracts YYYY-MM-DD ISO date', () => {
      const result = parseReceiptText('Shop\n2024-07-04', 90);
      expect(result.date).toBe('2024-07-04');
    });

    it('extracts Bulgarian month name date', () => {
      const result = parseReceiptText('Shop\n5 март 2024', 90);
      expect(result.date).toBe('5 март 2024');
    });

    it('returns undefined when no date found', () => {
      const result = parseReceiptText('No date here', 90);
      expect(result.date).toBeUndefined();
    });
  });

  // ─── Merchant name ────────────────────────────────────────────

  describe('merchant name extraction', () => {
    it('takes first non-empty line as merchant name', () => {
      const result = parseReceiptText('МАГАЗИН ИВАНОВ\nDate: 01.01.2024\nTotal: 10.00', 90);
      expect(result.merchantName).toBe('МАГАЗИН ИВАНОВ');
    });

    it('trims whitespace from merchant name', () => {
      const result = parseReceiptText('  Test Store  \nTotal: 5.00', 90);
      expect(result.merchantName).toBe('Test Store');
    });

    it('returns undefined for empty text', () => {
      const result = parseReceiptText('', 90);
      expect(result.merchantName).toBeUndefined();
    });
  });

  // ─── Confidence passthrough ────────────────────────────────────

  describe('confidence passthrough', () => {
    it('stores confidence value', () => {
      const result = parseReceiptText('text', 73.5);
      expect(result.confidence).toBe(73.5);
    });

    it('stores raw text', () => {
      const text = 'raw receipt text';
      const result = parseReceiptText(text, 50);
      expect(result.rawText).toBe(text);
    });
  });

  // ─── Line items ────────────────────────────────────────────────

  describe('line item extraction', () => {
    it('extracts item names and prices', () => {
      const receipt = [
        'SHOP',
        'Пиле с картофи  12,50',
        'Salata          5.00',
        'Всичко:         17,50',
      ].join('\n');

      const result = parseReceiptText(receipt, 90);
      expect(result.items).toBeDefined();
      expect(result.items!.some(i => i.name === 'Пиле с картофи' && i.price === 12.5)).toBe(true);
      expect(result.items!.some(i => i.name === 'Salata' && i.price === 5.0)).toBe(true);
    });

    it('skips lines containing "total"', () => {
      const receipt = 'Store\nItem A  10.00\nTotal  10.00';
      const result = parseReceiptText(receipt, 90);
      expect(result.items?.every(i => !i.name.toLowerCase().includes('total'))).toBe(true);
    });

    it('skips lines containing "всичко"', () => {
      const receipt = 'Store\nItem B  5.00\nВсичко  5.00';
      const result = parseReceiptText(receipt, 90);
      expect(result.items?.every(i => !i.name.toLowerCase().includes('всичко'))).toBe(true);
    });

    it('returns no items when text has no price-like patterns', () => {
      const result = parseReceiptText('Just a receipt with no items', 90);
      expect(result.items).toBeUndefined();
    });

    it('skips Дата/ДДС/date header lines (prevents false positives from OCR noise)', () => {
      const receipt = 'Store\nSalata 5.00\nДата: 15.03 2024\nДДС: 3.50\nTotal 30.00';
      const result = parseReceiptText(receipt, 90);
      const names = result.items?.map(i => i.name) ?? [];
      expect(names.some(n => /дата|дд|date/i.test(n))).toBe(false);
      expect(names.some(n => /ддс|vat/i.test(n))).toBe(false);
    });
  });

  // ─── Real-world Bulgarian receipt sample ─────────────────────

  it('parses a realistic Bulgarian receipt', () => {
    const bgReceipt = [
      'РЕСТОРАНТ ПЛАНИНАТА',
      'гр. София, ул. Витоша 12',
      'Дата: 12.04.2025',
      '',
      'Пилешка супа     8,00',
      'Шопска салата    6,50',
      'Вода 0.5л        2,00',
      '',
      'Всичко:         16,50 лв',
    ].join('\n');

    const result = parseReceiptText(bgReceipt, 88);

    expect(result.merchantName).toBe('РЕСТОРАНТ ПЛАНИНАТА');
    expect(result.totalAmount).toBe(16.5);
    expect(result.date).toBe('12.04.2025');
    expect(result.confidence).toBe(88);
  });
});
