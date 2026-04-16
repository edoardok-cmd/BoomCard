import { createWorker } from 'tesseract.js';
import sharp from 'sharp';

export interface OCRResult {
  merchantName?: string;
  totalAmount?: number;
  receiptDate?: string;
  items: Array<{ name: string; price?: number }>;
  rawText: string;
  confidence: number;
  currency: string;
}

/**
 * Parse a Bulgarian or English formatted amount string to a JS number.
 * Handles:
 *   "1.234,56"  → 1234.56  (BG: dot=thousands, comma=decimal)
 *   "1,234.56"  → 1234.56  (EN: comma=thousands, dot=decimal)
 *   "1234,56"   → 1234.56  (BG no thousands sep)
 *   "1234.56"   → 1234.56  (EN no thousands sep)
 */
export function parseAmount(s: string): number {
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    // comma is decimal separator (Bulgarian style)
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }
  // dot is decimal separator (English style)
  return parseFloat(s.replace(/,/g, ''));
}

export function parseReceiptText(text: string, confidence: number): OCRResult {
  const result: OCRResult = {
    rawText: text,
    confidence,
    items: [],
    currency: 'BGN',
  };

  // Total amount — Bulgarian and common English patterns
  // Amount group supports thousands separators: 1.234,56 or 1,234.56
  const AMT = String.raw`(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})`;
  const totalPatterns = [
    new RegExp(String.raw`(?:всичко|общо|за\s+плащане)[:\s]*` + AMT, 'i'),
    new RegExp(String.raw`(?:total|сума)[:\s]*` + AMT, 'i'),
    new RegExp(String.raw`(?:to\s+pay|итого)[:\s]*` + AMT, 'i'),
    new RegExp(AMT + String.raw`\s*(?:лв\.?|bgn|lev)`, 'i'),
  ];

  for (const pattern of totalPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.totalAmount = parseAmount(match[1]);
      break;
    }
  }

  // Date — DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD, Bulgarian month names
  // ISO/4-digit-year pattern is checked first to avoid partial matches
  const datePatterns: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [
      /(\d{4})[./-](\d{1,2})[./-](\d{1,2})/,
      (m) => `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
    ],
    [
      /(\d{1,2})[./-](\d{1,2})[./-](\d{4})/,
      (m) => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`,
    ],
  ];

  for (const [pattern, formatter] of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      result.receiptDate = formatter(match);
      break;
    }
  }

  // Currency
  if (/лв\.?|bgn/i.test(text)) {
    result.currency = 'BGN';
  } else if (/eur|€/i.test(text)) {
    result.currency = 'EUR';
  }

  // Merchant name — first non-empty line
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    result.merchantName = lines[0];
  }

  // Line items — "description   12.34" pattern, skip total/header lines
  const itemPattern = /^(.{2,40}?)\s{2,}(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})\s*$/gm;
  const skipWords = /total|всичко|сума|общо|дата|date|час|time|бон|receipt|cash|card|ддс|vat/i;
  let m: RegExpExecArray | null;
  while ((m = itemPattern.exec(text)) !== null) {
    const name = m[1].trim();
    const price = parseAmount(m[2]);
    if (!skipWords.test(name)) {
      result.items.push({ name, price });
    }
  }

  return result;
}

/**
 * Preprocess image buffer with sharp for better OCR accuracy:
 * grayscale + contrast normalisation.
 * Falls back to the original buffer if sharp cannot decode the image.
 */
async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer).grayscale().normalise().sharpen().toBuffer();
  } catch {
    return buffer;
  }
}

/**
 * Concurrency gate around Tesseract. Each worker holds ~100 MB and runs on one core
 * for 10–30 s per receipt, so unbounded concurrency under a burst (busy venue at
 * close-out) would OOM the backend. A simple promise-chain semaphore is enough —
 * we don't need priority or fairness, just a ceiling. Tune via env for prod sizing.
 */
const OCR_MAX_CONCURRENT = Math.max(1, parseInt(process.env.OCR_MAX_CONCURRENT ?? '2', 10));
const ocrSlots: Array<Promise<void>> = [];
async function withOcrSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (ocrSlots.length >= OCR_MAX_CONCURRENT) {
    await Promise.race(ocrSlots);
  }
  let release!: () => void;
  const slot = new Promise<void>((resolve) => { release = resolve; });
  ocrSlots.push(slot);
  try {
    return await fn();
  } finally {
    release();
    const idx = ocrSlots.indexOf(slot);
    if (idx >= 0) ocrSlots.splice(idx, 1);
  }
}

/**
 * Run Tesseract OCR on an image buffer.
 * Supports Bulgarian + English (common for BG receipts).
 */
export async function recognizeReceiptImage(imageBuffer: Buffer): Promise<OCRResult> {
  return withOcrSlot(async () => {
    const processed = await preprocessImage(imageBuffer);

    // Tesseract.js requires `logger` to be a function (or the field to be absent).
    // Passing `undefined` explicitly throws TypeError inside the worker, so we supply a
    // silent noop in prod and the default verbose logger in dev via an omitted field.
    const workerOpts = process.env.NODE_ENV === 'production' ? { logger: () => {} } : undefined;
    const worker = await createWorker('bul+eng', 1, workerOpts);

    try {
      const { data } = await worker.recognize(processed);
      return parseReceiptText(data.text, data.confidence);
    } finally {
      await worker.terminate();
    }
  });
}

