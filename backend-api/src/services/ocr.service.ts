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
 * Parse raw OCR text into structured receipt data.
 * Exported for unit testing.
 */
export function parseReceiptText(text: string, confidence: number): OCRResult {
  const result: OCRResult = {
    rawText: text,
    confidence,
    items: [],
    currency: 'BGN',
  };

  // Total amount — Bulgarian and common English patterns
  const totalPatterns = [
    /(?:всичко|общо|за\s+плащане)[:\s]*(\d+[.,]\d{2})/i,
    /(?:total|сума)[:\s]*(\d+[.,]\d{2})/i,
    /(?:to\s+pay|итого)[:\s]*(\d+[.,]\d{2})/i,
    /(\d+[.,]\d{2})\s*(?:лв\.?|bgn|lev)/i,
  ];

  for (const pattern of totalPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.totalAmount = parseFloat(match[1].replace(',', '.'));
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
  const itemPattern = /^(.{2,40}?)\s{2,}(\d+[.,]\d{2})$/gm;
  const skipWords = /total|всичко|сума|общо|дата|date|час|time|бон|receipt|cash|card|ддс|vat/i;
  let m: RegExpExecArray | null;
  while ((m = itemPattern.exec(text)) !== null) {
    const name = m[1].trim();
    const price = parseFloat(m[2].replace(',', '.'));
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
 * Run Tesseract OCR on an image buffer.
 * Supports Bulgarian + English (common for BG receipts).
 */
export async function recognizeReceiptImage(imageBuffer: Buffer): Promise<OCRResult> {
  const processed = await preprocessImage(imageBuffer);

  const worker = await createWorker('bul+eng', 1, {
    logger: process.env.NODE_ENV === 'production' ? () => {} : undefined,
  });

  try {
    const { data } = await worker.recognize(processed);
    return parseReceiptText(data.text, data.confidence);
  } finally {
    await worker.terminate();
  }
}

